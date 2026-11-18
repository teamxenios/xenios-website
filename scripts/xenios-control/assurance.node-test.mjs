import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFactoryAssuranceReader, unavailablePublishedExportSource, MAX_FACTORY_EXPORT_BYTES } from './assurance.mjs';

const NOW = '2026-11-18T17:30:00.000Z', OLD = '2026-09-21T12:00:00.000Z';
const SHA = 'a'.repeat(40), HASH = 'c'.repeat(64);
const file = value => {
  const utf8 = JSON.stringify(value);
  return { utf8, sha256: createHash('sha256').update(utf8).digest('hex') };
};
function publication() {
  return { schemaVersion: 1, qualification: 'qualified_coherent_export_v1', controllerId: 'fixture-controller',
    controllerRevision: 7, controllerSourceSha: SHA, capturedAt: NOW, publishedAt: NOW,
    registryFiles: {
      ACTIVE_TASKS: file({ schemaVersion: 1, updatedAt: NOW, tasks: [] }),
      CODE_OWNERSHIP: file({ schemaVersion: 1, updatedAt: NOW, leases: [] }),
      SESSION_REGISTRY: file({ schemaVersion: 1, updatedAt: NOW, sessions: [] }),
    }, evidence: { claims: [], receipts: [], runtimeFacts: [] }, nativeObservation: null };
}
function ciClaim(id = 'claim-1') {
  return { id, taskId: 'task-1', repo: 'example/fixture', sha: SHA, milestone: 'ci_passed' };
}
function ciReceipt(scope = 'full_suite') {
  return { id: 'ci-1', taskId: 'task-1', repo: 'example/fixture', sha: SHA, kind: 'ci_passed', outcome: 'pass',
    observedAt: NOW, evidenceRef: 'fixture://ci', details: { scope,
      checks: ['build', 'typecheck', 'test', 'protection', 'Required CI completion'].map(name => ({ name, status: 'pass' })) } };
}
const reader = p => createFactoryAssuranceReader({ readPublishedExport: async () => ({ kind: 'published', publication: p }), clock: () => NOW });
function nativeReport() {
  return { mode: 'ASSISTED_INTAKE_PREPARE_ONLY', paused: false, input_hash: HASH,
    operator_actions: [{ task: 'TASK-1', seat: 'dev-build@factory', repository: 'factory', head: SHA,
      state: 'blocked_auth', observed_at: 1794866002, since_at: 1794866002,
      next_action: 'Authenticate in the same native seat and verify its session before resuming.', source: 'root_observation' }],
    operator_action_count: 1, operator_actions_truncated: false, tasks: [], truncated: false,
    result: null, last_intake_result: { state: 'existing-work-retained', token: 7, dispatch_key: 'PRIVATE_MARKER' },
    worker_launch_claimed: false, automatic_publication: false };
}

test('a server-owned export source is required, and the fixed default is unavailable', async () => {
  assert.throws(() => createFactoryAssuranceReader(), /factory_source_port_required/);
  const result = await createFactoryAssuranceReader({ readPublishedExport: unavailablePublishedExportSource, clock: () => NOW })();
  assert.equal(result.availability, 'unavailable');
  assert.equal(result.reason, 'export_not_configured');
  assert.equal(result.counts, null);
  assert.equal(result.source, null);
  assert.equal(result.authority, 'none');
});

test('a qualified publication preserves controller revision and authority timestamps', async () => {
  const p = publication();
  const result = await reader(p)();
  assert.equal(result.availability, 'published');
  assert.equal(result.mode, 'advisory');
  assert.equal(result.source.revision, 7);
  assert.equal(result.source.sourceSha, SHA);
  assert.equal(result.source.capturedAt, NOW);
  assert.ok(result.source.registries.every(row => row.authoritativeAsOf === NOW));
  assert.equal(result.source.freshness, 'current');
  assert.equal(result.native.currentAuthenticationState, null);
});

test('a fresh export cannot replace missing or stale registry authority times', async () => {
  const p = publication();
  p.registryFiles.ACTIVE_TASKS = file({ schemaVersion: 1, updatedAt: OLD, tasks: [] });
  p.registryFiles.CODE_OWNERSHIP = file({ schemaVersion: 1, leases: [] });
  const result = await reader(p)();
  assert.equal(result.source.freshness, 'unknown');
  assert.equal(result.source.registries[0].authoritativeAsOf, OLD);
  assert.equal(result.source.registries[1].authoritativeAsOf, null);
  assert.ok(result.findings.some(row => row.code === 'SOURCE_STALE'));
  assert.ok(result.findings.some(row => row.code === 'SOURCE_FRESHNESS_UNKNOWN'));
});

test('done tasks and running process context do not synthesize CI or usable authentication', async () => {
  const p = publication();
  p.registryFiles.ACTIVE_TASKS = file({ schemaVersion: 1, updatedAt: NOW,
    tasks: [{ id: 'task-1', state: 'done', acceptedSha: SHA, note: 'all tests passed' }] });
  p.registryFiles.SESSION_REGISTRY = file({ schemaVersion: 1, updatedAt: NOW,
    sessions: [{ id: 'worker-1', heartbeatAt: NOW, state: 'active', authenticated: true }] });
  p.evidence.runtimeFacts = [{ id: 'worker-1', state: 'running', observedAt: NOW, pid: 123 }];
  const result = await reader(p)();
  assert.deepEqual(result.claims, []);
  assert.deepEqual(result.counts, { supported: 0, unsupported: 0, unknown: 0 });
  assert.equal(result.runtime[0].readiness, 'unknown');
  assert.ok(result.findings.some(row => row.code === 'DONE_WITHOUT_EVIDENCE'));
});

test('explicit full CI evidence is supported while a subset remains unknown', async () => {
  for (const [scope, want] of [['full_suite', 'supported'], ['subset', 'unknown'], [undefined, 'unknown']]) {
    const p = publication(); p.evidence.claims = [ciClaim()]; p.evidence.receipts = [ciReceipt(scope)];
    if (scope === undefined) delete p.evidence.receipts[0].details.scope;
    assert.equal((await reader(p)()).claims[0].verdict, want);
  }
});

test('private registry notes, receipt bodies and unsafe identifiers never reach output', async () => {
  const p = publication();
  p.registryFiles.ACTIVE_TASKS = file({ schemaVersion: 1, updatedAt: NOW, tasks: [], notes: 'PRIVATE_MARKER' });
  p.evidence.claims = [ciClaim()];
  p.evidence.receipts = [ciReceipt()]; p.evidence.receipts[0].details.rawBody = 'PRIVATE_MARKER';
  const before = JSON.stringify(p);
  const result = await reader(p)();
  assert.equal(result.claims[0].id, 'claim-1');
  assert.equal(result.claims[0].verdict, 'supported');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_MARKER'));
  assert.equal(JSON.stringify(p), before);
  p.evidence.claims[0].id = '<PRIVATE_MARKER>';
  const malformed = await reader(p)();
  assert.equal(malformed.availability, 'unavailable');
  assert.ok(!JSON.stringify(malformed).includes('PRIVATE_MARKER'));
});

test('native report capture and old operator times remain observation-only', async () => {
  const p = publication();
  p.nativeObservation = { utf8: JSON.stringify(nativeReport()), observedAt: NOW, fileModifiedAt: '2026-11-16T21:53:24Z' };
  const result = await reader(p)();
  assert.equal(result.native.availability, 'observation_only');
  assert.equal(result.native.observedAt, NOW);
  assert.equal(result.native.fileModifiedAt, '2026-11-16T21:53:24Z');
  assert.equal(result.native.observations[0].lastObservedAt, '2026-11-16T21:53:22.000Z');
  assert.equal(result.native.currentAuthenticationState, null);
  assert.equal(result.native.nativeWorkerExecution, null);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_MARKER'));
});

test('an invalid native report is unavailable without replacing canonical assessment', async () => {
  const p = publication(); p.nativeObservation = { utf8: '{PRIVATE_MARKER', observedAt: NOW, fileModifiedAt: null };
  const result = await reader(p)();
  assert.equal(result.availability, 'published');
  assert.equal(result.native.reason, 'native_export_invalid');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_MARKER'));
});

test('mismatched hashes, legacy envelopes and future publications fail closed', async () => {
  const malformed = [p => { p.registryFiles.ACTIVE_TASKS.sha256 = HASH; },
    p => { p.controllerRevision = null; }, p => { p.qualification = 'legacy_raw_directory'; },
    p => { p.publishedAt = '2027-01-01T00:00:00Z'; }, p => { p.untrustedPolicy = {}; }];
  for (const change of malformed) {
    const p = publication(); change(p);
    const result = await reader(p)();
    assert.equal(result.availability, 'unavailable');
    assert.equal(result.reason, 'export_invalid');
    assert.equal(result.counts, null);
  }
});

test('publication size, row count and pairwise path work have explicit bounds', async () => {
  const p = publication(); p.registryFiles.ACTIVE_TASKS = file({ schemaVersion: 1, tasks: [], note: 'x'.repeat(MAX_FACTORY_EXPORT_BYTES) });
  assert.equal((await reader(p)()).availability, 'unavailable');
  const rows = publication(); rows.registryFiles.ACTIVE_TASKS = file({ schemaVersion: 1, tasks: Array.from({ length: 513 }, (_, i) => ({ id: `task-${i}` })) });
  assert.equal((await reader(rows)()).availability, 'unavailable');
  const paths = publication(); paths.registryFiles.CODE_OWNERSHIP = file({ schemaVersion: 1, leases: Array.from({ length: 9 }, (_, i) => ({
    id: `lease-${i}`, session: `worker-${i}`, state: 'active', paths: Array.from({ length: 64 }, (_, j) => `fixture/${i}/${j}`) })) });
  assert.equal((await reader(paths)()).availability, 'unavailable');
});

test('large safe projections disclose truncation instead of silently dropping records', async () => {
  const p = publication(); p.evidence.claims = Array.from({ length: 150 }, (_, i) => ciClaim(`claim-${i}`));
  const result = await reader(p)();
  assert.equal(result.claimCount, 150);
  assert.equal(result.claims.length, 100);
  assert.equal(result.claimsTruncated, true);
  assert.equal(result.findingsTruncated, true);
  assert.equal(result.counts.unknown, 150);
});

test('source failures and recovery blocks do not leak error payloads or repair anything', async () => {
  let calls = 0;
  const read = createFactoryAssuranceReader({ clock: () => NOW, readPublishedExport: async () => { calls++; throw Error('PRIVATE_MARKER'); } });
  const failed = await read();
  assert.equal(calls, 1);
  assert.equal(failed.availability, 'unavailable');
  assert.ok(!JSON.stringify(failed).includes('PRIVATE_MARKER'));
  const held = await createFactoryAssuranceReader({ clock: () => NOW,
    readPublishedExport: async () => ({ kind: 'unavailable', reason: 'recovery_required' }) })();
  assert.equal(held.reason, 'recovery_required');
});

test('a timed-out producer cannot accumulate additional underlying reads', async () => {
  let calls = 0, signal;
  const read = createFactoryAssuranceReader({ clock: () => NOW, timeoutMs: 5,
    readPublishedExport: options => { calls++; signal = options.signal; return new Promise(() => {}); } });
  const [a, b] = await Promise.all([read(), read()]);
  assert.equal(a.availability, 'unavailable'); assert.deepEqual(a, b);
  assert.equal(signal.aborted, true);
  assert.equal((await read()).availability, 'unavailable');
  assert.equal(calls, 1);
});
