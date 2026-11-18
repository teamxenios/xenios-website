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
if (!source || !path.isAbsolute(source) || process.versions.node !== '20.19.0') {
  throw new Error('REQUIRE_PINNED_NODE20_19_0_AND_ABSOLUTE_SOURCE_NODE_MODULES');
}
const sourceRoot = fs.realpathSync(source);
const sandboxRoot = path.join(root, '.sandbox');
fs.mkdirSync(sandboxRoot, { recursive: true });
const sandbox = fs.mkdtempSync(path.join(sandboxRoot, 'sdk-'));
if (!fs.realpathSync(sandbox).startsWith(fs.realpathSync(sandboxRoot) + path.sep)) throw new Error('ISOLATION_FAILURE');
const owned = path.join(sandbox, 'node_modules');
fs.mkdirSync(owned);
const requireTool = createRequire(path.join(sourceRoot, '__offline_protocol_tool__.cjs'));
const ts = requireTool('typescript');
const esbuild = requireTool('esbuild');
const packages = new Map();
const sourceDigests = new Map();

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
copyPackage('@supabase/supabase-js');
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
const changes = applySdkSourcePatch(owned, ts, root);
const outputs = [];
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
  }
}
esbuild.stop();
// Re-check every shared input read: accidental shared mutation is a hard error.
for (const [file, digest] of sourceDigests) if (sha(fs.readFileSync(file)) !== digest) throw new Error('SHARED_INPUT_CHANGED');
const manifest = {
  schema: 'xenios-auth-protocol-build-v2', sdkVersion: '2.108.2', node: process.versions.node,
  typescript: ts.version, esbuild: esbuild.version, physicalCopy: true, installPerformed: false,
  sharedInputChecks: sourceDigests.size, packages: Object.fromEntries(packages), changes,
  sharedInputs: [...sourceDigests].map(([file, before]) => ({ path: path.relative(sourceRoot, file).replaceAll('\\', '/'), before, after: sha(fs.readFileSync(file)) })),
  prototypeInputs: ['patch-sdk.mjs', 'patch-transport.mjs', 'source/SessionProtocol.ts', 'prepare.mjs'].map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) })),
  tracing: { publishedPin, extractionSha256: sha(fs.readFileSync(tracing)) }, outputs,
  limitations: ['Prototype transpilation only; published declarations not regenerated or type-qualified.',
    'No application adoption, browser qualification, migration or rollout barrier implementation.'],
};
fs.writeFileSync(path.join(sandbox, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(root, '.sandbox', 'latest.json'), JSON.stringify({ sandbox }) + '\n');
console.log(JSON.stringify({ status: 'PREPARED', sandbox, outputs: outputs.length, sharedInputChecks: sourceDigests.size }));
