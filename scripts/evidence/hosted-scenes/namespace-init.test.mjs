import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { INIT_PATHS, validateInstalledInit, metadataCommandTimeoutMs } from './namespace-init.mjs';
test('exact installed-owner lookups receive a bounded 45-second budget', () => {
  for (const path of INIT_PATHS) assert.equal(metadataCommandTimeoutMs('/usr/bin/dpkg-query', ['-S', path]), 45000);
});
test('other metadata/version commands and nonallowlisted queries retain 3-second bound', () => {
  for (const [file, args] of [['/usr/bin/dpkg-query', ['-W', 'docker-ce']], ['/usr/bin/dpkg-query', ['--control-show', 'docker-ce', 'md5sums']], ['/usr/bin/docker-init', ['--version']], ['/usr/bin/dpkg-query', ['-S', '/tmp/tini']], ['/usr/bin/dpkg-query', ['-S', '/usr/bin/tini', '--other']], ['/tmp/other', ['-S', '/usr/bin/tini']]]) assert.equal(metadataCommandTimeoutMs(file, args), 3000);
});
const bytes = Buffer.alloc(64); Buffer.from([127, 69, 76, 70, 2, 1]).copy(bytes); bytes.writeUInt16LE(62, 18);
// Synthetic ELF-shaped data only. Never executed or written to a system path.
const info = path => ({ path, uid: 0, mode: 0o100755, packageName: 'docker-ce', packageStatus: 'installed\t5:28.0.4-1~ubuntu.24.04~noble\tamd64', version: 'tini version 0.19.0 - git.de40ad0', md5sums: createHash('md5').update(bytes).digest('hex') + '  ' + path.slice(1) });
for (const path of INIT_PATHS) test('fixed existing init package format admits ' + path, () => {
  const actual = validateInstalledInit(info(path), bytes); assert.equal(actual.path, path); assert.equal(actual.downloadedOrInstalled, false); assert.equal(actual.exitRemapping, false); assert.deepEqual(actual.flags, ['-g', '--']);
});
for (const [label, delta] of [
  ['unknown path', { path: '/tmp/tini' }], ['nonroot owner', { uid: 1001 }], ['writable file', { mode: 0o100777 }],
  ['setuid file', { mode: 0o104755 }],
  ['nonexecutable file', { mode: 0o100644 }], ['not installed', { packageStatus: 'config-files\t0.19\tamd64' }],
  ['wrong architecture', { packageStatus: 'installed\t0.19\tarm64' }], ['wrong version', { version: 'tini version 0.20.0' }],
  ['unsafe package', { packageName: 'x;cmd' }], ['missing checksum', { md5sums: '' }],
  ['wrong checksum path', { md5sums: createHash('md5').update(bytes).digest('hex') + '  tmp/tini' }],
  ['wrong file checksum', { md5sums: '0'.repeat(32) + '  usr/bin/tini' }]
]) test('refuses ' + label, () => assert.throws(() => validateInstalledInit({ ...info('/usr/bin/tini'), ...delta }, bytes)));
test('tampered/nonELF binary and duplicate package record refuse', () => {
  const bad = Buffer.from(bytes); bad[0] = 0; assert.throws(() => validateInstalledInit(info('/usr/bin/tini'), bad));
  const original = info('/usr/bin/tini'); assert.throws(() => validateInstalledInit({ ...original, md5sums: original.md5sums + '\n' + original.md5sums }, bytes));
});
test('namespace launcher preserves isolation and uses PID1 init without exit remapping', () => {
  const sh = readFileSync(new URL('./run-isolated.sh', import.meta.url), 'utf8');
  for (const marker of ['--mount --net --pid --fork --kill-child=SIGKILL --mount-proc', '--bounding-set=-all', '--no-new-privs', '/usr/bin/env -i', '"$init" -g -- "$node"', 'XR_QA_INIT_RECORD_SHA256', 'capture_isolated_exit']) assert(sh.includes(marker), marker);
  assert(!sh.includes('apt-get') && !sh.includes('curl') && !sh.includes(' -e 143') && !sh.includes('--no-sandbox'));
});
test('controller requires actual canary and cumulative empty process/profile proof before Studio', () => {
  const source = readFileSync(new URL('./controller.mjs', import.meta.url), 'utf8');
  assert(source.indexOf('PASS_REAL_ORPHAN_REAPING_SIGNAL_FORWARDING_AND_EXIT_STATUS') < source.indexOf('for (const scene of spec.scenes)'));
  assert(source.includes('result.initQualification.cleanup = await confirmReleased(); noStrayBrowser();'));
  assert(source.includes('result.cleanup.finalOwnedRelease = await confirmReleased()'));
  assert(source.includes('FAILURE_PRESERVED_NO_RETRY'));
});
test('continuation selects only fresh staff then owner; no historical TB capture claim', () => {
  const selection = JSON.parse(readFileSync(new URL('./selection.json', import.meta.url)));
  assert.deepEqual(selection.scenes, ['staff', 'owner']);
  assert.equal(selection.source, 'ea78e6bcb24b247074f3b76f5e73addc73bb755a');
  assert.equal(selection.reusedTb500Supplement, undefined);
});
test('all three branch guards select only the Root-prescribed continuation', () => {
  const branch = 'qual/ea-ea78e6bc-protected-package-scenes-20261124';
  for (const name of ['./policy.mjs', './run-isolated.sh', '../../../.github/workflows/qa-hosted-scenes-83.yml']) {
    const source = readFileSync(new URL(name, import.meta.url), 'utf8'); assert(source.includes(branch)); assert(!source.includes('qual/ea-83f95809-scenes-pwa-20261123'));
  }
});
test('exact two init file pins bind the installed proposal bytes', () => {
  const selection = JSON.parse(readFileSync(new URL('./selection.json', import.meta.url)));
  assert.deepEqual(selection.namespaceInitFiles.map(f => f.path), ['scripts/evidence/hosted-scenes/namespace-init.mjs', 'scripts/evidence/hosted-scenes/namespace-init.test.mjs']);
  for (const pin of selection.namespaceInitFiles) {
    const actual = readFileSync(new URL('./' + pin.path.split('/').at(-1), import.meta.url));
    assert.equal(actual.length, pin.bytes); assert.equal(createHash('sha256').update(actual).digest('hex'), pin.sha256);
  }
});
