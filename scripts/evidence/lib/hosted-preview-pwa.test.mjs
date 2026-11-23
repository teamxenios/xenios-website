import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PWA_SOURCE, PWA_ASSETS, readPinnedPwaAssets, validatePwaAsset, pwaResponse } from './hosted-preview-pwa.mjs';
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const assets = readPinnedPwaAssets(repo);
test('exact Git83 worker and offline dependency are present as separate supplements', () => {
  assert.equal(assets.size, 2);
  for (const p of PWA_ASSETS) assert.equal(validatePwaAsset(p.path, assets.get('/' + p.path).bytes).blob, p.blob);
  assert.equal(PWA_SOURCE, '83f95809d66520e7ab89588a3d99fbdf28bfc9aa');
  assert.match(assets.get('/sw.js').bytes.toString(), /const OFFLINE_URL = "\/offline.html"/);
});
for (const path of ['sw.js', 'offline.html']) test('missing or tampered ' + path + ' refuses', () => {
  const bytes = assets.get('/' + path).bytes;
  assert.throws(() => validatePwaAsset(path, bytes.subarray(1)));
  const changed = Buffer.from(bytes); changed[0] ^= 1; assert.throws(() => validatePwaAsset(path, changed));
});
test('unknown supplements cannot widen fixture access', () => {
  assert.throws(() => validatePwaAsset('other.js', Buffer.from('')));
  for (const url of ['/sw.js?x=1', '/sw.js/', '/SW.js', '/offline.html/extra', '/api/private', '//sw.js']) assert.equal(pwaResponse('GET', url, assets), null);
  assert.equal(pwaResponse('POST', '/sw.js', assets), null);
  assert.equal(pwaResponse('GET', '/sw.js', assets).bytes.length, 4718);
  assert.equal(pwaResponse('HEAD', '/offline.html', assets).bytes.length, 1253);
});
test('missing loaded asset does not imply fallback content', () => assert.throws(() => pwaResponse('GET', '/sw.js', new Map())));
test('response validation refuses a corrupted loaded worker instead of serving it', () => {
  const corrupt = new Map(assets), original = assets.get('/sw.js');
  corrupt.set('/sw.js', { ...original, bytes: Buffer.alloc(original.bytes.length) });
  assert.throws(() => pwaResponse('GET', '/sw.js', corrupt));
});
