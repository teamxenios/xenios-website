// Two exact Git83 app-shell dependencies omitted from the hosted static subset.
// They remain separate supplements; never amend the imported-archive provenance.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export const PWA_SOURCE = '18acc59da55a45468e4caaf6edb7fb9638a18aff';
export const PWA_ASSETS = Object.freeze([
  Object.freeze({ path: 'sw.js', bytes: 4718, sha256: 'ceb9bd9132abefd6cfd0c0f0b50be3ffe2da81771f8a09c60a679f98d1fb85b0', blob: 'f503999cc6bd2ce168e9db4b2745e71e0b41f03f', type: 'application/javascript' }),
  Object.freeze({ path: 'offline.html', bytes: 1253, sha256: 'c7fe9ea7ca08b906f28a623a52806efbf227f509a4488d821f1dd69f98e4eb20', blob: '73300b4246607388f87cd6dddf03c041cfc15bc5', type: 'text/html' }),
]);
const hash = b => createHash('sha256').update(b).digest('hex');
export function validatePwaAsset(path, bytes) {
  const pin = PWA_ASSETS.find(p => p.path === path);
  assert(pin && Buffer.isBuffer(bytes), 'EXACT_PWA_ASSET_REQUIRED');
  assert.equal(bytes.length, pin.bytes, 'PWA_LENGTH');
  assert.equal(hash(bytes), pin.sha256, 'PWA_HASH');
  return pin;
}
export function readPinnedPwaAssets(repo) {
  return new Map(PWA_ASSETS.map(pin => {
    const path = join(repo, 'client/public', pin.path), stat = lstatSync(path);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'PWA_REGULAR_SOURCE_REQUIRED');
    const bytes = readFileSync(path); validatePwaAsset(pin.path, bytes);
    const git = (...args) => execFileSync('git', ['-C', repo, ...args], { maxBuffer: 8192 });
    assert.equal(git('rev-parse', `${PWA_SOURCE}:client/public/${pin.path}`).toString().trim(), pin.blob, 'PWA_GIT_BLOB');
    assert(bytes.equals(git('show', `${PWA_SOURCE}:client/public/${pin.path}`)), 'PWA_SOURCE_BYTES');
    return ['/' + pin.path, { ...pin, bytes }];
  }));
}
export function pwaResponse(method, originalUrl, assets) {
  if (!['GET', 'HEAD'].includes(method) || !PWA_ASSETS.some(p => '/' + p.path === originalUrl)) return null;
  const asset = assets.get(originalUrl); assert(asset, 'PWA_ASSET_NOT_LOADED');
  validatePwaAsset(asset.path, asset.bytes);
  return asset;
}
