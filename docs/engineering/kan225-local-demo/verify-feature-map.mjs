import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Static artifact contract; this never mounts UI, sends requests or opens storage.
const base = new URL('./', import.meta.url);
const sourceRoot = new URL('../canonical-source-8efa9a9e/', base);
const expectedCommit = '8efa9a9ef4e94773c446e7fa2a17cf00c6592d85';
const expectedRoute = '/research/early-access/order-request';
const expectedRepository = '/mnt/c/Users/sboad/.codex/worktrees/3221/xenios-website';
const expectedStates = ['guest_entry', 'catalog', 'contact', 'agreements', 'review', 'submission', 'retry', 'recovery', 'isolation', 'staff'];
const expectedPaths = ['assisted-order/RequestIntentEntry', 'assisted-order/RequestIntentForm', 'assisted-order/RequestIntentStaffReadback', 'early-access/EarlyAccessRoute'].map(p => `client/src/research/${p}.tsx`);
const expectedEvidence = { source: 'inspected', synthetic_ui: 'not_run', isolated_persistence: 'not_run', shared_staging: 'not_run', production: 'not_run' };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function sameMembers(actual, expected, code) {
  assert.ok(Array.isArray(actual), code);
  assert.deepEqual([...actual].sort(), [...expected].sort(), code);
}
export function verify(map) {
  assert.equal(map.schemaVersion, 1, 'schema');
  assert.equal(map.feature, 'Quick Order request for review', 'feature');
  assert.equal(map.route, expectedRoute, 'route');
  assert.equal(map.source.commit, expectedCommit, 'source commit');
  assert.equal(map.source.repository, expectedRepository, 'source repository');
  assert.ok(nonempty(map.source.provenance), 'provenance');
  assert.deepEqual(map.evidence, expectedEvidence, 'evidence boundary');
  assert.ok(Array.isArray(map.limitations) && map.limitations.length >= 3 && map.limitations.every(nonempty), 'limitations');
  sameMembers(map.source.files.map(f => f.path), expectedPaths, 'source files');
  const texts = new Map();
  for (const file of map.source.files) {
    const bytes = readFileSync(new URL(file.path, sourceRoot));
    assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'), 'source digest');
    texts.set(file.path, bytes.toString('utf8'));
  }
  sameMembers(map.states.map(s => s.id), expectedStates, 'state inventory');
  for (const state of map.states) {
    assert.equal(state.evidenceTier, 'source', 'state evidence');
    assert.ok(nonempty(state.summary), 'state summary');
    assert.ok(Array.isArray(state.references) && state.references.length > 0, 'references');
    for (const ref of state.references) {
      assert.ok(texts.has(ref.path), 'reference path');
      assert.ok(nonempty(ref.anchor) && texts.get(ref.path).includes(ref.anchor), 'reference anchor');
    }
  }
}
const map = JSON.parse(readFileSync(new URL('quick-order-feature-map.json', base), 'utf8'));
let passed = 0;
function test(name, action) {
  try { action(); passed++; console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}
function rejects(name, mutation, message) {
  test(name, () => {
    const changed = structuredClone(map);
    mutation(changed);
    assert.throws(() => verify(changed), error => error.message.includes(message));
  });
}
test('canonical map and snapshot hashes/anchors', () => verify(map));
rejects('missing state', m => m.states.pop(), 'state inventory');
rejects('duplicate state with unchanged count', m => m.states[1] = structuredClone(m.states[0]), 'state inventory');
rejects('wrong source commit', m => m.source.commit = '0'.repeat(40), 'source commit');
rejects('wrong source repository', m => m.source.repository = '/other', 'source repository');
rejects('wrong route', m => m.route = '/research/early-access', 'route');
rejects('altered source digest', m => m.source.files[0].sha256 = '0'.repeat(64), 'source digest');
rejects('duplicate source path', m => m.source.files[1] = structuredClone(m.source.files[0]), 'source files');
for (const tier of Object.keys(expectedEvidence).filter(t => t !== 'source')) {
  rejects(`overclaimed ${tier}`, m => m.evidence[tier] = 'verified', 'evidence boundary');
}
rejects('state runtime overclaim', m => m.states[0].evidenceTier = 'production', 'state evidence');
rejects('missing source anchor', m => m.states[0].references[0].anchor = 'NONEXISTENT_SOURCE_ANCHOR', 'reference anchor');
rejects('unknown reference path', m => m.states[0].references[0].path = '../other', 'reference path');
rejects('empty state description', m => m.states[0].summary = '', 'state summary');
console.log(`${passed}/16 checks passed; static map contract only; no runtime evidence.`);
