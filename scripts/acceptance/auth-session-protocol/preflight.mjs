// Manual source-only preflight. Requires a separately allocated Root slot.
// Calls the builder's REAL transforms in memory; never imports SDK runtime,
// writes transformed source, bundles, installs, or promotes any output.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PINS, sdkSourceTransforms, transformSdkSource } from './patch-sdk.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const shared = process.argv[2];
const sourceSha = process.argv[3];
if (process.versions.node !== '20.19.0' || !shared || !path.isAbsolute(shared) || !/^[0-9a-f]{40}$/.test(sourceSha ?? '')) {
  throw new Error('PINNED_NODE_ABSOLUTE_INPUT_AND_EXACT_SOURCE_REQUIRED');
}
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceRoot = fs.realpathSync(shared);
const receiptParent = path.join(root, '.receipts'); fs.mkdirSync(receiptParent, { recursive: true });
const receipt = fs.mkdtempSync(path.join(receiptParent, 'preflight-' + sourceSha.slice(0, 8) + '-'));
const report = { schema: 'xenios-auth-transform-preflight-v1', sourceSha, pid: process.pid,
  startedAt: new Date().toISOString(), status: 'STARTED', node: process.versions.node,
  physicalInputRoot: sourceRoot, scope: 'IN_MEMORY_SOURCE_TRANSFORMS_ONLY',
  sdkRuntimeImported: false, providerCalls: 0, clockOverrides: 0, sdkSourceWrites: 0,
  bundlesProduced: 0, outputsAdopted: false, inputs: [], results: [] };
const save = () => fs.writeFileSync(path.join(receipt, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
save();
console.log(JSON.stringify({ status: 'PREFLIGHT_STARTED', receipt, sourceSha, pid: process.pid }));

function parse(ts, file, text) {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const diagnostics = tree.parseDiagnostics.map(item => ({ code: item.code, start: item.start, length: item.length,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }));
  return { tree, diagnostics };
}
function method(ts, tree, className, name) {
  const classes = tree.statements.filter(node => ts.isClassDeclaration(node) && node.name?.text === className);
  if (classes.length !== 1) throw new Error('PREFLIGHT_CLASS_CENSUS_CHANGED');
  const found = classes[0].members.filter(node => ts.isMethodDeclaration(node) && node.name.getText(tree) === name);
  if (found.length !== 1 || !found[0].body) throw new Error('PREFLIGHT_METHOD_CENSUS_CHANGED:' + name);
  return found[0];
}
try {
  const requireTool = createRequire(path.join(sourceRoot, '__offline_protocol_preflight__.cjs'));
  const ts = requireTool('typescript'); report.typescript = ts.version;
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'CORRECTED_SOURCE_INVENTORY.json')));
  report.ownInputs = [...inventory.sdkBuildInputs, { path: 'preflight.mjs', sha256: inventory.preflightTool?.sha256 }].map(input => {
    const raw = fs.readFileSync(path.join(root, input.path));
    const repositorySha256 = sha(raw.toString('utf8').replace(/\r\n/g, '\n'));
    if (input.sha256 && input.sha256 !== repositorySha256) throw new Error('PREFLIGHT_OWN_INPUT_INVENTORY_MISMATCH:' + input.path);
    return { path: input.path, physicalSha256: sha(raw), repositorySha256 };
  });
  report.versions = Object.fromEntries(['auth-js', 'supabase-js', 'realtime-js', 'phoenix'].map(name => {
    const pkg = JSON.parse(fs.readFileSync(path.join(sourceRoot, '@supabase', name, 'package.json')));
    const expected = name === 'phoenix' ? '0.4.4' : '2.108.2';
    if (pkg.version !== expected) throw new Error('PREFLIGHT_PACKAGE_VERSION_MISMATCH:' + name);
    return [name, pkg.version];
  }));
  const transformations = sdkSourceTransforms(ts);
  if (transformations.length !== 10) throw new Error('PREFLIGHT_EXPECTED_TEN_PINNED_INPUTS');
  const rawInputs = new Map();
  for (const [file] of transformations) {
    try {
      const raw = fs.readFileSync(path.join(sourceRoot, file)); rawInputs.set(file, raw);
      report.inputs.push({ file, physicalPath: fs.realpathSync(path.join(sourceRoot, file)), before: sha(raw), expected: PINS[file] });
    } catch (error) { report.inputs.push({ file, expected: PINS[file], readError: error.message }); }
  }
  fs.writeFileSync(path.join(receipt, 'source-inputs-before.json'), JSON.stringify({ sourceSha,
    observedAt: new Date().toISOString(), inputs: report.inputs }, null, 2) + '\n', { flag: 'wx' });
  report.status = 'TRANSFORMING_ALL_TEN'; save();
  for (const [file] of transformations) {
    const result = { file, status: 'NOT_TRANSFORMED' };
    try {
      const raw = rawInputs.get(file);
      if (!raw) throw new Error('PREFLIGHT_INPUT_UNREADABLE');
      // This exact helper is also used by applySdkSourcePatch; every original
      // pin and strict one/all-anchor census is exercised, never substituted.
      const transformed = transformSdkSource(file, raw, ts);
      result.before = transformed.before; result.after = transformed.after;
      result.census = transformed.census;
      const before = parse(ts, file, raw.toString('utf8').replace(/\r\n/g, '\n'));
      const after = parse(ts, file, transformed.bytes.toString('utf8'));
      result.beforeSyntax = before.diagnostics; result.afterSyntax = after.diagnostics;
      if (before.diagnostics.length || after.diagnostics.length) throw new Error('PREFLIGHT_SOURCE_SYNTAX_DIAGNOSTICS');
      if (file === '@supabase/realtime-js/src/RealtimeChannel.ts') {
        const trackBeforeNode = method(ts, before.tree, 'RealtimeChannel', 'track');
        const trackAfterNode = method(ts, after.tree, 'RealtimeChannel', 'track');
        const sendBeforeNode = method(ts, before.tree, 'RealtimeChannel', 'send');
        const sendAfterNode = method(ts, after.tree, 'RealtimeChannel', 'send');
        const trackBefore = trackBeforeNode.getFullText(before.tree), trackAfter = trackAfterNode.getFullText(after.tree);
        const sendBefore = sendBeforeNode.getText(before.tree), sendAfter = sendAfterNode.getText(after.tree);
        const hasFrame = parameter => ts.isIdentifier(parameter.name) && parameter.name.text === '__sessionFrame';
        result.methodBoundary = { trackBefore: sha(trackBefore), trackAfter: sha(trackAfter),
          sendBefore: sha(sendBefore), sendAfter: sha(sendAfter), trackUnchanged: trackBefore === trackAfter,
          sendParameterCounts: [sendBeforeNode.parameters.length, sendAfterNode.parameters.length],
          sendScopedFrameParameter: sendAfterNode.parameters.filter(hasFrame).length === 1
            && sendAfterNode.parameters.length === sendBeforeNode.parameters.length + 1 && !trackAfterNode.parameters.some(hasFrame) };
        if (!result.methodBoundary.trackUnchanged || !result.methodBoundary.sendScopedFrameParameter) throw new Error('PREFLIGHT_SEND_TRACK_BOUNDARY_CHANGED');
      }
      const reference = inventory.transformedSourceReferences?.find(entry => entry.file === file);
      if (reference) {
        result.preservationReference = { sourceSha: reference.sourceSha, expected: reference.sha256, matches: reference.sha256 === transformed.after };
        if (!result.preservationReference.matches) throw new Error('PREFLIGHT_PREVIOUS_TRANSFORM_BYTES_CHANGED');
      }
      result.status = 'TRANSFORM_AND_PARSE_PASS';
    } catch (error) { result.status = 'FAILED'; result.error = { name: error.name, message: error.message }; }
    report.results.push(result); save();
    console.log(JSON.stringify({ file, status: result.status, after: result.after, error: result.error }));
  }
  const engine = fs.readFileSync(path.join(root, 'source/SessionProtocol.ts'));
  report.newCoordinatorSource = { file: '@supabase/auth-js/src/lib/SessionProtocol.ts', sha256: sha(engine),
    syntax: parse(ts, 'SessionProtocol.ts', engine.toString('utf8')).diagnostics };
  report.inputsAfter = report.inputs.map(input => {
    try { return { file: input.file, before: input.before, after: sha(fs.readFileSync(path.join(sourceRoot, input.file))) }; }
    catch (error) { return { file: input.file, before: input.before, readError: error.message }; }
  });
  report.allTenAttempted = report.results.length === 10;
  report.sharedInputsUnchanged = report.inputsAfter.every(input => input.before && input.before === input.after);
  report.status = report.allTenAttempted && report.sharedInputsUnchanged && report.results.every(input => input.status === 'TRANSFORM_AND_PARSE_PASS')
    && !report.newCoordinatorSource.syntax.length ? 'SOURCE_PREFLIGHT_PASS_NO_RUNTIME_CLAIM' : 'SOURCE_PREFLIGHT_FAILED';
  if (report.status !== 'SOURCE_PREFLIGHT_PASS_NO_RUNTIME_CLAIM') process.exitCode = 1;
} catch (error) { report.status = 'PREFLIGHT_FATAL'; report.error = { name: error.name, message: error.message }; process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); save(); }
console.log(JSON.stringify({ status: report.status, attempted: report.results.length, receipt }));
