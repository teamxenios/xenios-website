// Explicitly invoked offline builder. No install and no writes outside .sandbox.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { applySdkSourcePatch } from './patch-sdk.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const source = process.argv[2];
const sourceSha = process.argv[3] ?? null;
if (!source || !path.isAbsolute(source) || process.versions.node !== '20.19.0') {
  throw new Error('REQUIRE_PINNED_NODE20_19_0_AND_ABSOLUTE_SOURCE_NODE_MODULES');
}
if (sourceSha !== null && !/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('INVALID_SOURCE_SHA');
const sourceRoot = fs.realpathSync(source);
const sandboxRoot = path.join(root, '.sandbox');
fs.mkdirSync(sandboxRoot, { recursive: true });
const sandbox = fs.mkdtempSync(path.join(sandboxRoot, 'sdk-'));
if (!fs.realpathSync(sandbox).startsWith(fs.realpathSync(sandboxRoot) + path.sep)) throw new Error('ISOLATION_FAILURE');
const owned = path.join(sandbox, 'node_modules');
fs.mkdirSync(owned);
const requireTool = createRequire(path.join(sourceRoot, '__offline_protocol_tool__.cjs'));
let ts;
let esbuild;
const packages = new Map();
const sourceDigests = new Map();
const copiedPaths = new Map();
const outputs = [];
const prototypeInputs = ['patch-sdk.mjs', 'patch-transport.mjs', 'source/SessionProtocol.ts', 'prepare.mjs']
  .map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
const status = {
  schema: 'xenios-auth-protocol-build-status-v1', sourceSha, pid: process.pid,
  startedAt: new Date().toISOString(), node: process.versions.node,
  expectedSdkVersion: '2.108.2', expectedPhoenixVersion: '0.4.4',
  physicalSharedRoot: sourceRoot, physicalSandbox: sandbox, prototypeInputs,
  physicalCopy: true, installPerformed: false, phase: 'SANDBOX_CREATED',
  fullBeforeInventoryPersisted: false, sourcePatchAttempted: false,
  sourcePatchCompleted: false, correctedOutputsProduced: 0,
};
function updateStatus(phase, details = {}) {
  Object.assign(status, details, { phase, updatedAt: new Date().toISOString() });
  fs.writeFileSync(path.join(sandbox, 'build-status.json'), JSON.stringify(status, null, 2) + '\n');
}
function persistBeforeInventory() {
  const inputs = [...sourceDigests].map(([file, before]) => ({
    path: path.relative(sourceRoot, file).replaceAll('\\', '/'), physicalSharedPath: file,
    physicalOwnedPath: copiedPaths.get(file), before,
    sharedImmediatelyBeforePatch: sha(fs.readFileSync(file)),
    ownedImmediatelyBeforePatch: sha(fs.readFileSync(copiedPaths.get(file))),
  }));
  const inventory = {
    schema: 'xenios-auth-protocol-shared-before-v1', sourceSha, observedAt: new Date().toISOString(),
    phase: 'BEFORE_ANY_SOURCE_PATCH', completeDependencyClosureCopied: true,
    node: process.versions.node, typescript: ts.version, esbuild: esbuild.version,
    physicalSharedRoot: sourceRoot, physicalSandbox: sandbox,
    packages: Object.fromEntries(packages), prototypeInputs, inputs,
  };
  const file = path.join(sandbox, 'shared-inputs-before.json');
  fs.writeFileSync(file, JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx' });
  updateStatus('BEFORE_INVENTORY_PERSISTED', { fullBeforeInventoryPersisted: true,
    beforeInventory: { path: 'shared-inputs-before.json', sha256: sha(fs.readFileSync(file)), inputs: inputs.length },
    packages: inventory.packages });
  if (inputs.some(input => input.before !== input.sharedImmediatelyBeforePatch || input.before !== input.ownedImmediatelyBeforePatch)) {
    throw new Error('SHARED_INPUT_CHANGED_DURING_COPY');
  }
}
function persistAfterInventory() {
  const inputs = [...sourceDigests].map(([file, before]) => ({
    path: path.relative(sourceRoot, file).replaceAll('\\', '/'), physicalSharedPath: file, before,
    after: sha(fs.readFileSync(file)),
  }));
  const file = path.join(sandbox, 'shared-inputs-after.json');
  fs.writeFileSync(file, JSON.stringify({ schema: 'xenios-auth-protocol-shared-after-v1', sourceSha,
    observedAt: new Date().toISOString(), fullBeforeInventoryPersisted: status.fullBeforeInventoryPersisted,
    inputs }, null, 2) + '\n');
  status.afterInventory = { path: 'shared-inputs-after.json', sha256: sha(fs.readFileSync(file)),
    inputs: inputs.length, mismatches: inputs.filter(input => input.before !== input.after).length };
  return inputs;
}
updateStatus('SANDBOX_CREATED');
console.log(JSON.stringify({ status: 'SANDBOX_CREATED', sandbox, pid: process.pid, sourceSha }));

function copyRegularTree(from, to) {
  const stat = fs.lstatSync(from);
  if (stat.isSymbolicLink()) throw new Error('NESTED_LINK_REFUSED');
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from).sort()) copyRegularTree(path.join(from, name), path.join(to, name));
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    sourceDigests.set(from, sha(fs.readFileSync(from)));
    copiedPaths.set(from, to);
  } else throw new Error('NON_REGULAR_SDK_INPUT');
}
function copyPackage(name, relativeTo = sourceRoot) {
  let original;
  try { original = requireTool.resolve(name + '/package.json', { paths: [relativeTo] }); }
  catch {
    let directory = path.dirname(requireTool.resolve(name, { paths: [relativeTo] }));
    while (directory !== path.dirname(directory)) {
      const candidate = path.join(directory, 'package.json');
      if (fs.existsSync(candidate) && JSON.parse(fs.readFileSync(candidate)).name === name) { original = candidate; break; }
      directory = path.dirname(directory);
    }
    if (!original) throw new Error('DEPENDENCY_PACKAGE_NOT_RESOLVABLE:' + name);
  }
  const from = fs.realpathSync(path.dirname(original));
  const pkg = JSON.parse(fs.readFileSync(path.join(from, 'package.json')));
  if (packages.has(name)) {
    if (packages.get(name).version !== pkg.version) throw new Error('CONFLICTING_DEPENDENCY_VERSION');
    return;
  }
  const to = path.join(owned, name);
  if (fs.existsSync(to)) throw new Error('OWNED_COPY_ALREADY_EXISTS');
  copyRegularTree(from, to);
  packages.set(name, { version: pkg.version, packageJsonSha256: sha(fs.readFileSync(original)) });
  for (const dependency of Object.keys(pkg.dependencies ?? {}).sort()) copyPackage(dependency, from);
}
async function prepare() {
ts = requireTool('typescript');
esbuild = requireTool('esbuild');
updateStatus('TOOLS_RESOLVED', { typescript: ts.version, esbuild: esbuild.version });
copyPackage('@supabase/supabase-js');
persistBeforeInventory();
for (const name of ['auth-js', 'supabase-js', 'realtime-js']) {
  if (packages.get('@supabase/' + name)?.version !== '2.108.2') throw new Error('SDK_VERSION_MISMATCH');
}
if (packages.get('@supabase/phoenix')?.version !== '0.4.4') throw new Error('PHOENIX_VERSION_MISMATCH');
// Published source imports the unpublished tracing workspace package. Reuse its
// exact inlined code from the pinned published ESM artifact, not a fake shim.
const published = fs.readFileSync(path.join(owned, '@supabase/supabase-js/dist/index.mjs'));
const publishedPin = '05dc19f720aea11598f920c135cd223571f35022405c35aa3c7472144cdc6e23';
if (sha(published) !== publishedPin) throw new Error('PUBLISHED_ENTRY_PIN_MISMATCH');
const publishedText = published.toString().replace(/\r\n/g, '\n');
const first = publishedText.indexOf('function __awaiter(');
const last = publishedText.indexOf('//#region \\0@oxc-project+runtime');
if (first < 0 || last <= first) throw new Error('TRACING_EXTRACTION_BOUNDARY_CHANGED');
const tracing = path.join(sandbox, 'published-tracing.mjs');
fs.writeFileSync(tracing, publishedText.slice(first, last) + '\nexport { extractTraceContext, parseTraceParent, shouldPropagateToTarget, getDefaultPropagationTargets };\n');
updateStatus('PATCHING_SOURCE', { sourcePatchAttempted: true });
const changes = applySdkSourcePatch(owned, ts, root);
updateStatus('SOURCE_PATCH_COMPLETED', { sourcePatchCompleted: true, changes });
for (const name of ['phoenix', 'auth-js', 'realtime-js', 'supabase-js']) {
  const packageRoot = path.join(owned, '@supabase', name);
  for (const format of ['cjs', 'esm']) {
    const output = name === 'phoenix'
      ? path.join(packageRoot, 'priv/static', format === 'cjs' ? 'phoenix.cjs.js' : 'phoenix.mjs')
      : name === 'supabase-js'
      ? path.join(packageRoot, 'dist', format === 'cjs' ? 'index.cjs' : 'index.mjs')
      : path.join(packageRoot, 'dist', format === 'cjs' ? 'main/index.js' : 'module/index.js');
    await esbuild.build({
      entryPoints: [path.join(packageRoot, name === 'phoenix' ? 'assets/js/phoenix/index.js' : 'src/index.ts')], outfile: output,
      platform: 'node', target: 'node20', format, bundle: true, packages: 'external',
      alias: { '@supabase/tracing': tracing }, logLevel: 'silent', sourcemap: false,
    });
    outputs.push({ path: path.relative(sandbox, output).replaceAll('\\', '/'), sha256: sha(fs.readFileSync(output)) });
    updateStatus('COMPILING', { correctedOutputsProduced: outputs.length, outputs: [...outputs] });
  }
}
// Re-check every shared input read: accidental shared mutation is a hard error.
const sharedInputs = persistAfterInventory();
if (sharedInputs.some(input => input.before !== input.after)) throw new Error('SHARED_INPUT_CHANGED');
const manifest = {
  schema: 'xenios-auth-protocol-build-v2', sdkVersion: '2.108.2', node: process.versions.node,
  typescript: ts.version, esbuild: esbuild.version, physicalCopy: true, installPerformed: false,
  sharedInputChecks: sourceDigests.size, packages: Object.fromEntries(packages), changes,
  sharedInputs, prototypeInputs, sourceSha,
  beforeInventory: status.beforeInventory, afterInventory: status.afterInventory,
  tracing: { publishedPin, extractionSha256: sha(fs.readFileSync(tracing)) }, outputs,
  limitations: ['Prototype transpilation only; published declarations not regenerated or type-qualified.',
    'No application adoption, browser qualification, migration or rollout barrier implementation.'],
};
fs.writeFileSync(path.join(sandbox, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
updateStatus('PREPARED', { completedAt: new Date().toISOString() });
fs.writeFileSync(path.join(root, '.sandbox', 'latest.json'), JSON.stringify({ sandbox }) + '\n');
console.log(JSON.stringify({ status: 'PREPARED', sandbox, outputs: outputs.length, sharedInputChecks: sourceDigests.size }));
}
try { await prepare(); }
catch (error) {
  const failedPhase = status.phase;
  try { persistAfterInventory(); } catch (afterError) { status.afterInventoryError = String(afterError.message).slice(0, 500); }
  try { updateStatus('FAILED', { failedPhase, failedAt: new Date().toISOString(),
    typescript: ts?.version ?? null, esbuild: esbuild?.version ?? null,
    packages: Object.fromEntries(packages), sharedInputsCopied: sourceDigests.size,
    correctedOutputsProduced: outputs.length,
    error: { name: error.name, message: String(error.message).slice(0, 500) } }); } catch { /* retain original failure */ }
  throw error;
} finally { esbuild?.stop(); }
