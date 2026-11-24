import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { inspectHostedPreview, readZip32, sha256, crc32, PROFILE } from './hosted-preview-import.mjs';
import { cssReferenceParser } from './hosted-preview-css.mjs';
const require = createRequire(resolve(process.cwd(), 'package.json'));
const parser = require('@babel/parser');
const parseJavaScript = s => parser.parse(s, { sourceType: 'module', createImportExpressions: true });
const parseCssReferences = cssReferenceParser(require('postcss'), require('postcss-value-parser'));
// Synthetic ZIP writer for canaries only; never production extraction code.
function zip(entries, { deflate = false, mode = 0x80000000 } = {}) {
  const local = [], central = []; let offset = 0;
  for (const [name, raw] of entries) {
    const n = Buffer.from(name), b = Buffer.from(raw), payload = deflate ? deflateRawSync(b) : b, crc = crc32(b);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(payload.length, 18); h.writeUInt32LE(b.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(payload.length, 20); c.writeUInt32LE(b.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(mode, 38); c.writeUInt32LE(offset, 42);
    local.push(h, n, payload); central.push(c, n); offset += h.length + n.length + payload.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
const source = 'a'.repeat(40), tree = 'b'.repeat(40), base = 'c'.repeat(40), runner = 'd'.repeat(40);
const marker = () => ({ sourceHead: source, sourceTree: tree, baseHead: base, executedCommit: runner, executedTree: tree,
  executedParents: [base, source], node: 'v20.19.0', scope: 'Private provider-inert public static preview. No application server or managed action.' });
function fixture() { return [
  ['PREVIEW-SOURCE.json', JSON.stringify(marker())],
  ['index.html', '<link rel="canonical" href="https://example.invalid"><script type="module" src="/assets/main.js"></script>'],
  ['assets/main.js', 'import("./panel.js");const deps=["assets/main.css"];'],
  ['assets/panel.js', 'export const fixture="synthetic";'], ['assets/main.css', 'body{color:red}'] ]; }
function binding(z) { return { kind: 'ROOT_SELECTED_HOSTED_PREVIEW_BINDING_V1', profile: PROFILE, source, tree, base, runner, runnerTree: tree,
  runnerParents: [base, source], runId: 1, attempt: 1, jobId: 2, artifactId: 3, archiveBytes: z.length,
  archiveSha256: sha256(z), artifactName: 'homepage-preview-' + source, artifactExpired: false, archiveRoot: '',
  jobName: 'build', jobConclusion: 'success', node: 'v20.19.0', custodian: 'SYNTHETIC_TEST_ONLY',
  rootSelectionSha256: 'e'.repeat(64), runEvidenceSha256: 'f'.repeat(64), jobEvidenceSha256: 'f'.repeat(64),
  artifactEvidenceSha256: 'f'.repeat(64), runnerSelectionEvidenceSha256: 'f'.repeat(64) }; }
function inspect(entries = fixture(), tweak = () => {}, options = {}) {
  const z = zip(entries, options), b = binding(z);
  const artifactSelection = Buffer.from(JSON.stringify({ repo: 'teamxenios/xenios-website', run: 1, attempt: 1, buildJob: 2,
    artifact: { id: 3, name: b.artifactName, expired: false, size_in_bytes: z.length, digest: 'sha256:' + b.archiveSha256, workflow_run: { id: 1, head_sha: source } } }));
  const progressRecord = Buffer.from(JSON.stringify({ liveRun: { id: 1, attempt: 1, head: source, buildJob: 2 }, currentSource: { tree } }));
  b.artifactEvidenceSha256 = sha256(artifactSelection); b.runEvidenceSha256 = b.jobEvidenceSha256 = sha256(progressRecord);
  tweak(b); return inspectHostedPreview(z, b, { parseJavaScript, parseCssReferences, artifactSelection, progressRecord });
}
test('stored synthetic archive imports exact bytes with explicitly limited profile', () => {
  const p = inspect(); assert.equal(p.files.size, 5); assert.equal(p.provenance.kind, PROFILE);
  assert.equal(p.provenance.claims.freshBuild, false); assert.equal(p.provenance.claims.browserExecuted, false);
  assert(p.provenance.dependencyEdges.some(e => e.to === 'assets/panel.js'));
});
test('deflated archive verifies size and CRC', () => assert.equal(inspect(fixture(), () => {}, { deflate: true }).files.size, 5));
for (const name of ['../escape.js', '/absolute.js', 'C:/drive.js', 'assets/../bad.js', 'assets/con.js', 'assets/a%2f.js', 'assets/a\\b.js']) {
  test('rejects unsafe ZIP member ' + name, () => assert.throws(() => readZip32(zip([[name, 'x']]))));
}
test('rejects symlink mode', () => assert.throws(() => readZip32(zip([['assets/a.js', 'x']], { mode: 0xa0000000 })), /ZIP_NON_REGULAR/));
test('rejects duplicate case-folded names', () => assert.throws(() => readZip32(zip([['assets/a.js', 'x'], ['assets/A.js', 'x']])), /ZIP_DUPLICATE/));
test('rejects content CRC tampering', () => { const z = zip([['a', 'abc']]); z[31] ^= 1; assert.throws(() => readZip32(z), /CRC/); });
test('rejects archive digest mismatch against the actual artifact receipt', () => assert.throws(() => inspect(fixture(), b => b.archiveSha256 = '0'.repeat(64)), /ARTIFACT_RUN_JOB_JOIN/));
for (const key of ['source', 'tree', 'runner', 'base']) test('rejects marker ' + key + ' mismatch', () => assert.throws(() => inspect(fixture(), b => b[key] = '9'.repeat(40))));
test('rejects wrong run/attempt/job binding shape', () => assert.throws(() => inspect(fixture(), b => b.attempt = 0)));
for (const key of ['runId', 'attempt', 'jobId', 'artifactId']) test('rejects unmatched real receipt ' + key, () => assert.throws(() => inspect(fixture(), b => b[key]++), /JOIN/));
test('rejects wrong artifact source name', () => assert.throws(() => inspect(fixture(), b => b.artifactName = 'homepage-preview-other')));
test('rejects failed job and expired artifact', () => {
  assert.throws(() => inspect(fixture(), b => b.jobConclusion = 'failure'));
  assert.throws(() => inspect(fixture(), b => b.artifactExpired = true));
});
test('rejects missing static dependency', () => assert.throws(() => inspect(fixture().filter(([n]) => n !== 'assets/panel.js')), /MISSING_ASSET_DEPENDENCY/));
test('rejects missing Vite preload-map dependency', () => assert.throws(() => inspect(fixture().filter(([n]) => n !== 'assets/main.css')), /MISSING_ASSET_DEPENDENCY/));
test('rejects missing CSS url dependency', () => { const f = fixture(); f[4][1] = 'body{background:url(./missing.png)}'; assert.throws(() => inspect(f), /MISSING_ASSET_DEPENDENCY/); });
test('CSS embedded SVG data does not create a false nested url dependency', () => {
  const f = fixture(); f[4][1] = `body{background:url("data:image/svg+xml,%3Csvg%3Eurl(%23n)%3C/svg%3E")}`;
  assert.doesNotThrow(() => inspect(f));
});
test('rejects unresolved dynamic import instead of guessing', () => { const f = fixture(); f[2][1] = 'import(window.path)'; assert.throws(() => inspect(f), /NON_LITERAL_IMPORT/); });
function optionalFixture(body = 'const ni="@opentelemetry/api";let cached;function get(){return cached=import(ni).catch(()=>null)}') {
  const f = fixture(); f[3][1] = body;
  const pin = { path: 'assets/panel.js', sha256: sha256(Buffer.from(body)), start: body.indexOf('import(ni)'), expression: 'import(ni)', module: '@opentelemetry/api' };
  return { f, pin };
}
test('one pinned optional bare telemetry import is disclosed, not fabricated as an asset', () => {
  const { f, pin } = optionalFixture(); const p = inspect(f, b => b.optionalBareImports = [pin]);
  assert.equal(p.provenance.optionalBareImports.length, 1);
  assert.match(p.provenance.optionalBareImports[0].disposition, /RUNTIME_UNRUN/);
});
test('required or changed optional import fails closed', () => {
  const { f, pin } = optionalFixture('const ni="@opentelemetry/api";function get(){return import(ni)}');
  assert.throws(() => inspect(f, b => b.optionalBareImports = [pin]), /CATCH_NULL/);
  const good = optionalFixture(); assert.throws(() => inspect(good.f, b => b.optionalBareImports = [{ ...good.pin, sha256: '0'.repeat(64) }]), /OPTIONAL_IMPORT_PIN/);
});
test('shadowed identifier cannot masquerade as the approved bare specifier', () => {
  const { f, pin } = optionalFixture('const ni="@opentelemetry/api";function get(ni){return import(ni).catch(()=>null)}');
  assert.throws(() => inspect(f, b => b.optionalBareImports = [pin]), /SHADOWED/);
});
test('import map cannot silently resolve the optional bare module', () => {
  const { f, pin } = optionalFixture(); f[1][1] += '<script type="importmap">{}</script>';
  assert.throws(() => inspect(f, b => b.optionalBareImports = [pin]), /IMPORTMAP/);
});
test('optional allowance cannot excuse a missing required local import', () => {
  const { f, pin } = optionalFixture(); f[2][1] += 'import("./absent.js")';
  assert.throws(() => inspect(f, b => b.optionalBareImports = [pin]), /MISSING_ASSET_DEPENDENCY/);
});
test('rejects unexpected environment/server file', () => assert.throws(() => inspect([...fixture(), ['.env', 'synthetic']]), /UNEXPECTED_ARCHIVE_FILE/));
test('rejects encryption flags and declared oversize before inflate', () => {
  const z = zip([['a', 'x']]); const cd = z.readUInt32LE(z.length - 6); z.writeUInt16LE(1, cd + 8);
  assert.throws(() => readZip32(z), /FORMAT/);
  const big = zip([['a', 'x']]); big.writeUInt32LE(0x7fffffff, big.readUInt32LE(big.length - 6) + 24); assert.throws(() => readZip32(big), /SIZE/);
});
