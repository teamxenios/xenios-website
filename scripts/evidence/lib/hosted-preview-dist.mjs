import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { PROFILE, sha256, orderedInventory, validateBinding } from './hosted-preview-import.mjs';
export function assertHostedDist(dist, source, tree) {
  const provenance = JSON.parse(readFileSync(join(dist, 'evidence-provenance.json'), 'utf8'));
  assert.equal(provenance.kind, PROFILE); assert.equal(provenance.schemaVersion, 1);
  assert.equal(provenance.candidateSha, source); assert.equal(provenance.sourceTree, tree);
  validateBinding(provenance.binding);
  assert.equal(provenance.binding.source, source); assert.equal(provenance.binding.tree, tree);
  assert.equal(provenance.bindingSha256, sha256(Buffer.from(JSON.stringify(provenance.binding))));
  assert.deepEqual(provenance.claims, { freshBuild: false, npmCi: false, completeDistribution: false,
    liveAuthentication: false, actualCatalog: false, publication: false, browserExecuted: false, releaseAuthorized: false });
  assert.deepEqual(readdirSync(dist).sort(), ['evidence-provenance.json', 'public']);
  const files = new Map();
  const visit = (dir, prefix = '') => {
    assert(lstatSync(dir).isDirectory() && !lstatSync(dir).isSymbolicLink());
    for (const name of readdirSync(dir)) {
      const path = join(dir, name), stat = lstatSync(path); assert(!stat.isSymbolicLink());
      if (stat.isDirectory()) visit(path, prefix + name + '/');
      else { assert(stat.isFile()); files.set(prefix + name, readFileSync(path)); }
    }
  }; visit(join(dist, 'public'));
  const inventory = orderedInventory(files);
  assert.deepEqual(provenance.fileInventory, inventory); assert.equal(provenance.distFileCount, inventory.length);
  assert.equal(provenance.distInventorySha256, sha256(Buffer.from(JSON.stringify(inventory))));
  const markerBytes = files.get('PREVIEW-SOURCE.json'); assert(markerBytes);
  assert.equal(provenance.markerSha256, sha256(markerBytes));
  const marker = JSON.parse(markerBytes.toString('utf8')), b = provenance.binding;
  for (const [mk, bk] of [['sourceHead', 'source'], ['sourceTree', 'tree'], ['baseHead', 'base'], ['executedCommit', 'runner'], ['executedTree', 'runnerTree'], ['node', 'node']]) assert.equal(marker[mk], b[bk]);
  assert.deepEqual(marker.executedParents, b.runnerParents);
  return provenance;
}
