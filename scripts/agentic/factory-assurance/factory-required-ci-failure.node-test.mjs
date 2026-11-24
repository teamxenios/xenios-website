import test from 'node:test';
import assert from 'node:assert/strict';
import { assess } from './factory-assurance.mjs';

const NOW = '2026-11-18T15:30:00.000Z';
const RECENT = '2026-11-18T15:29:00.000Z';
const SHA = 'a'.repeat(40), OTHER = 'b'.repeat(40), REPO = 'example/required-ci-development';
const NAMES = ['build', 'typecheck', 'test', 'protection', 'Required CI completion'];
const clone = value => JSON.parse(JSON.stringify(value));
function claim() { return { id: 'all-ci', taskId: 'task-1', repo: REPO, sha: SHA, milestone: 'ci_passed' }; }
function failed(overrides = {}, details = {}) {
  return { id: 'ci-failure', taskId: 'task-1', repo: REPO, sha: SHA, kind: 'ci_passed', outcome: 'fail',
    observedAt: RECENT, evidenceRef: 'fixture://required-ci-development/failure', ...overrides,
    details: { scope: 'focused_preflight', testName: null, resolvedByReceiptId: null,
      checks: [{ name: 'build', status: 'pass' }, { name: 'test', status: 'fail' }], ...details } };
}
function passed(overrides = {}, details = {}) {
  return failed({ id: 'ci-success', outcome: 'pass', ...overrides },
    { scope: 'full_suite', checks: NAMES.map(name => ({ name, status: 'pass' })), ...details });
}
function inspect(receipts, policy = {}, extras = {}) {
  const snapshot = { schemaVersion: 1, capturedAt: NOW, sources: [], claims: [claim()], receipts,
    sessions: [], runtimeFacts: [], tasks: [], leases: [], resources: null, ...extras };
  const before = JSON.stringify(snapshot);
  const result = assess(snapshot, policy, NOW);
  assert.equal(JSON.stringify(snapshot), before, 'assessment must not rewrite source evidence');
  assert.equal(result.mode, 'advisory'); assert.equal(result.authority, 'none');
  assert.equal(result.claims.length, 1);
  return { claim: result.claims[0], report: result };
}
const verdict = (receipts, policy, extras) => inspect(receipts, policy, extras).claim.verdict;

test('required-check exact configured failure contradicts all-pass without inventing a test title', () => {
  const r = failed(); const result = inspect([r]);
  assert.equal(result.claim.verdict, 'unsupported');
  assert.deepEqual(result.claim.codes, ['CURRENT_FAILURE']);
  assert.equal(r.details.testName, null);
  assert.deepEqual(result.claim.evidenceIds, ['ci-failure']);
});
test('required-check one failed required job suffices without whole-suite coverage', () => {
  assert.equal(verdict([failed({}, { scope: 'subset', checks: [{ name: 'test', status: 'fail' }] })]), 'unsupported');
});
test('required-check missing suite coverage never converts the failure to positive admission', () => {
  assert.equal(verdict([failed({}, { scope: undefined })]), 'unsupported');
  assert.equal(verdict([passed({}, { scope: undefined })]), 'unknown');
});
test('required-check configured additional job is bound to the supplied strengthened policy', () => {
  const r = failed({}, { checks: [{ name: 'Windows boundary', status: 'fail' }] });
  assert.equal(verdict([r]), 'unknown');
  assert.equal(verdict([r], { requiredCiChecks: ['Windows boundary'] }), 'unsupported');
});
test('required-check distinct configured failures are explicit contradictions', () => {
  assert.equal(verdict([failed({}, { checks: [{ name: 'build', status: 'fail' }, { name: 'test', status: 'fail' }] })]), 'unsupported');
});
test('required-check a different pending or unknown check does not hide an explicit failure', () => {
  for (const status of ['pending', 'unknown']) {
    assert.equal(verdict([failed({}, { checks: [{ name: 'build', status }, { name: 'test', status: 'fail' }] })]), 'unsupported');
  }
});
test('required-check existing source staleness remains visible independently of immutable CI failure', () => {
  const result = inspect([failed()], {}, { sources: [{ name: 'old-registry', sha256: 'c'.repeat(64), capturedAt: '2026-09-21T12:00:00.000Z', authoritativeAsOf: '2026-09-21T12:00:00.000Z' }] });
  assert.equal(result.claim.verdict, 'unsupported');
  assert(result.report.findings.some(f => f.code === 'SOURCE_STALE'));
});
test('required-check missing authoritative source time stays unknown while a recorded check failure is identified', () => {
  const sources = [{ name: 'archived-development', sha256: 'c'.repeat(64), capturedAt: NOW, authoritativeAsOf: null }];
  const result = inspect([failed()], {}, { sources });
  assert.equal(result.claim.verdict, 'unsupported');
  assert.deepEqual(result.claim.codes, ['CURRENT_FAILURE']);
  assert(result.report.findings.some(f => f.code === 'SOURCE_FRESHNESS_UNKNOWN'));
  assert.equal(sources[0].authoritativeAsOf, null);
  assert(inspect([passed()], {}, { sources }).report.findings.some(f => f.code === 'SOURCE_FRESHNESS_UNKNOWN'));
});

const malformed = [
  ['missing', undefined], ['null', null], ['empty', []], ['object', { name: 'test', status: 'fail' }],
  ['null row', [null, { name: 'test', status: 'fail' }]],
  ['nonstring name', [{ name: ['test'], status: 'fail' }]],
  ['missing status', [{ name: 'test' }]], ['nonstring status', [{ name: 'test', status: ['fail'] }]],
  ['unknown status spelling', [{ name: 'build', status: 'failure' }, { name: 'test', status: 'fail' }]],
  ['space alias', [{ name: ' test', status: 'fail' }]],
  ['duplicate identical failure', [{ name: 'test', status: 'fail' }, { name: 'test', status: 'fail' }]],
  ['duplicate conflicting status', [{ name: 'test', status: 'pass' }, { name: 'test', status: 'fail' }]],
];
for (const [name, checks] of malformed) test(`required-check ${name} evidence remains unknown`, () => {
  assert.equal(verdict([failed({}, { checks })]), 'unknown');
});
test('required-check duplicate receipt identity is still invalid rather than affirmative evidence', () => {
  assert.equal(verdict([failed(), failed()]), 'unknown');
});
test('required-check an unconfigured failed check remains unknown', () => {
  assert.equal(verdict([failed({}, { checks: [{ name: 'optional-docs', status: 'fail' }] })]), 'unknown');
});
test('required-check generic unnamed failure retains the original unknown behavior', () => {
  const r = failed({ kind: 'failure' });
  assert.equal(verdict([r, passed()]), 'unknown');
  assert.equal(r.details.testName, null);
});
test('required-check a contradictory pass or unknown outcome is not promoted to an identified failure', () => {
  for (const outcome of ['pass', 'unknown']) assert.equal(verdict([failed({ outcome })]), 'unknown');
});
test('required-check wrong source repository or task cannot contradict the current claim', () => {
  for (const override of [{ sha: OTHER }, { repo: 'example/other' }, { taskId: 'other-task' }]) {
    assert.equal(verdict([failed(override)]), 'unknown');
    assert.equal(verdict([failed(override), passed()]), 'supported');
  }
});
test('required-check missing malformed and future receipt timestamps stay unknown', () => {
  for (const observedAt of [null, 'not-a-date', '2026-11-19T15:30:00.000Z']) {
    assert.equal(verdict([failed({ observedAt })]), 'unknown');
  }
});
test('required-check missing evidence reference or abbreviated source stays unknown', () => {
  for (const override of [{ evidenceRef: '' }, { sha: 'aaaaaaaa' }, { id: null }]) assert.equal(verdict([failed(override)]), 'unknown');
});
test('required-check explicitly linked later same-source full success resolves the failure', () => {
  const r = failed({}, { resolvedByReceiptId: 'full-rerun' });
  assert.equal(verdict([r, passed({ id: 'full-rerun', observedAt: NOW })]), 'supported');
});
test('required-check an unlinked passing receipt cannot silently resolve the failure', () => {
  assert.equal(verdict([failed(), passed({ observedAt: NOW })]), 'unsupported');
});
test('required-check wrong-source earlier subset and duplicate resolutions remain ineffective', () => {
  const r = failed({}, { resolvedByReceiptId: 'rerun' });
  const variants = [passed({ id: 'rerun', sha: OTHER }), passed({ id: 'rerun', taskId: 'other-task' }),
    passed({ id: 'rerun', observedAt: '2026-11-18T15:28:00.000Z' }), passed({ id: 'rerun' }, { scope: 'subset' })];
  for (const pass of variants) assert.equal(verdict([clone(r), pass]), 'unsupported');
  assert.equal(verdict([clone(r), passed({ id: 'rerun' }), passed({ id: 'rerun' })]), 'unsupported');
});
test('required-check existing named generic failure and fully qualified positive behavior stay intact', () => {
  assert.equal(verdict([failed({ kind: 'failure' }, { testName: 'actual retained title' }), passed()]), 'unsupported');
  assert.equal(verdict([passed()]), 'supported');
  for (const scope of [undefined, null, false, 'subset']) assert.equal(verdict([passed({}, { scope })]), 'unknown');
});
