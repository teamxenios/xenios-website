import test from 'node:test';
import assert from 'node:assert/strict';
import { assess } from './factory-assurance.mjs';

const SHA = 'a'.repeat(40), OTHER = 'b'.repeat(40);
const NOW = '2026-11-24T18:00:00.000Z';
const clone = value => JSON.parse(JSON.stringify(value));
const NAMES = ['build', 'typecheck', 'test', 'protection', 'Required CI completion'];
function job(overrides = {}) {
  return { name: 'build', status: 'fail', providerStatus: 'completed', providerConclusion: 'failure',
    jobId: 12345, sourceSha: SHA, attempt: 1,
    startedAt: '2026-11-22T12:00:00Z', completedAt: '2026-11-22T12:01:00Z', ...overrides };
}
function receipt(overrides = {}, details = {}) {
  return { id: 'unknown-workflow', taskId: 'task', repo: 'example/terminal-job-development', sha: SHA,
    kind: 'ci_passed', outcome: 'unknown', observedAt: NOW, evidenceRef: 'fixture://terminal-job-development', ...overrides,
    details: { scope: 'workflow_job_summary', testName: null, resolvedByReceiptId: null,
      originalRunConclusion: 'cancelled', checks: [job()], ...details } };
}
function passed(overrides = {}, details = {}) {
  return receipt({ id: 'full-success', outcome: 'pass', ...overrides },
    { scope: 'full_suite', checks: NAMES.map(name => ({ name, status: 'pass' })), ...details });
}
function inspect(receipts, policy = {}) {
  const snapshot = { schemaVersion: 1, capturedAt: NOW,
    sources: [{ name: 'historical-development', sha256: 'c'.repeat(64), capturedAt: NOW, authoritativeAsOf: null }],
    claims: [{ id: 'all-pass', taskId: 'task', repo: 'example/terminal-job-development', sha: SHA, milestone: 'ci_passed' }],
    receipts, sessions: [], runtimeFacts: [], tasks: [], leases: [], resources: null };
  const original = JSON.stringify(snapshot);
  const report = assess(snapshot, policy, NOW);
  assert.equal(JSON.stringify(snapshot), original);
  assert.equal(report.mode, 'advisory'); assert.equal(report.authority, 'none');
  assert(report.findings.some(f => f.code === 'SOURCE_FRESHNESS_UNKNOWN'));
  return report.claims[0];
}
const verdict = (receipts, policy) => inspect(receipts, policy).verdict;

test('terminal-job explicit completed required failure contradicts all-pass with unknown aggregate', () => {
  const r = receipt();
  const result = inspect([r]);
  assert.equal(result.verdict, 'unsupported');
  assert.deepEqual(result.codes, ['CURRENT_FAILURE']);
  assert.deepEqual(result.evidenceIds, ['unknown-workflow']);
  assert.equal(r.outcome, 'unknown'); assert.equal(r.details.testName, null);
  assert.equal(r.details.originalRunConclusion, 'cancelled');
});
test('terminal-job failure recognition does not rely on a workflow cancellation label', () => {
  assert.equal(verdict([receipt({}, { originalRunConclusion: null, scope: undefined })]), 'unsupported');
});
test('terminal-job full-source matching follows the existing case-insensitive SHA contract', () => {
  assert.equal(verdict([receipt({}, { checks: [job({ sourceSha: SHA.toUpperCase() })] })]), 'unsupported');
});
test('terminal-job only an explicitly configured job may contradict the required set', () => {
  const r = receipt({}, { checks: [job({ name: 'Windows extra' })] });
  assert.equal(verdict([r]), 'unknown');
  assert.equal(verdict([r], { requiredCiChecks: ['Windows extra'] }), 'unsupported');
});
test('terminal-job independent unique failed jobs remain distinguishable', () => {
  assert.equal(verdict([receipt({}, { checks: [job(), job({ name: 'test', jobId: 12346 })] })]), 'unsupported');
});

const invalidJobs = [
  ['missing provider status', { providerStatus: undefined }], ['queued', { providerStatus: 'queued' }],
  ['in progress', { providerStatus: 'in_progress' }], ['success contradiction', { providerConclusion: 'success' }],
  ['cancelled job', { providerConclusion: 'cancelled' }], ['skipped job', { providerConclusion: 'skipped' }],
  ['missing conclusion', { providerConclusion: null }], ['timed out is not explicit failure', { providerConclusion: 'timed_out' }],
  ['missing job id', { jobId: undefined }], ['zero job id', { jobId: 0 }], ['negative job id', { jobId: -1 }],
  ['string job id', { jobId: '12345' }], ['unsafe job id', { jobId: Number.MAX_SAFE_INTEGER + 1 }],
  ['missing source', { sourceSha: null }], ['abbreviated source', { sourceSha: 'aaaaaaaa' }], ['wrong source', { sourceSha: OTHER }],
  ['missing attempt', { attempt: undefined }], ['zero attempt', { attempt: 0 }], ['string attempt', { attempt: '1' }],
  ['missing start', { startedAt: null }], ['unqualified start time', { startedAt: '2026-11-22T12:00:00' }],
  ['missing completion', { completedAt: null }], ['malformed completion', { completedAt: 'not-a-date' }],
  ['inverted times', { completedAt: '2026-11-22T11:59:59Z' }],
  ['completion beyond receipt skew', { completedAt: '2026-11-24T18:00:31Z' }],
  ['normalized status contradiction', { status: 'pass' }], ['unknown normalized status', { status: 'unknown' }],
];
for (const [name, overrides] of invalidJobs) test(`terminal-job ${name} remains unknown`, () => {
  assert.equal(verdict([receipt({}, { checks: [job(overrides)] })]), 'unknown');
});
test('terminal-job duplicate job identity under distinct names is ambiguous', () => {
  const duplicate = job({ name: 'test', status: 'pass', providerConclusion: 'success' });
  assert.equal(verdict([receipt({}, { checks: [job(), duplicate] })]), 'unknown');
});
test('terminal-job duplicated names malformed rows and repeated receipt IDs stay unknown', () => {
  assert.equal(verdict([receipt({}, { checks: [job(), job({ jobId: 12346 })] })]), 'unknown');
  assert.equal(verdict([receipt({}, { checks: [job(), null] })]), 'unknown');
  assert.equal(verdict([receipt(), receipt()]), 'unknown');
});
test('terminal-job workflow cancellation alone never becomes a failed job', () => {
  assert.equal(verdict([receipt({}, { checks: [job({ status: 'unknown', providerConclusion: 'cancelled' })] })]), 'unknown');
  assert.equal(verdict([receipt({}, { checks: NAMES.map(name => ({ name, status: 'unknown' })) })]), 'unknown');
  assert.equal(verdict([receipt({}, { checks: [{ name: 'build', status: 'fail' }] })]), 'unknown');
  assert.equal(verdict([receipt({}, { checks: [] })]), 'unknown');
});
test('terminal-job contradictory pass aggregate and generic unnamed failures retain unknown', () => {
  assert.equal(verdict([receipt({ outcome: 'pass' })]), 'unknown');
  assert.equal(verdict([receipt({ kind: 'failure' }), passed()]), 'unknown');
});
test('terminal-job invalid parent and wrong claim subject do not enter the new branch', () => {
  for (const overrides of [{ evidenceRef: '' }, { observedAt: null }, { observedAt: '2026-11-25T18:00:00Z' },
    { sha: OTHER }, { repo: 'example/other' }, { taskId: 'other-task' }]) {
    assert.equal(verdict([receipt(overrides)]), 'unknown');
  }
});
test('terminal-job valid explicit later same-source full run resolves only the linked failure', () => {
  const r = receipt({}, { resolvedByReceiptId: 'full-success' });
  assert.equal(verdict([r, passed()]), 'supported');
  assert.equal(r.outcome, 'unknown'); assert.equal(r.details.testName, null);
});
test('terminal-job wrong earlier subset duplicate and absent resolutions remain ineffective', () => {
  const r = receipt({}, { resolvedByReceiptId: 'full-success' });
  for (const pass of [passed({ sha: OTHER }), passed({ taskId: 'other-task' }), passed({ observedAt: '2026-11-24T17:59:00Z' }),
    passed({}, { scope: 'subset' }), passed({ id: 'unlinked' })]) {
    assert.equal(verdict([clone(r), pass]), 'unsupported');
  }
  assert.equal(verdict([r, passed(), passed()]), 'unsupported');
});
test('terminal-job positive admission and strict full-suite coverage remain intact', () => {
  assert.equal(verdict([passed()]), 'supported');
  for (const scope of [undefined, null, false, 'subset', 'workflow_job_summary']) {
    assert.equal(verdict([passed({}, { scope })]), 'unknown');
  }
  assert.equal(verdict([passed({ outcome: 'unknown' })]), 'unknown');
});
