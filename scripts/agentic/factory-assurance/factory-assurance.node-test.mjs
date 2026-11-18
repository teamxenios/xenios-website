import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  assess,
  normalizeRegistries,
  proposeLessons,
  evaluate,
  compareEvaluations,
} from './factory-assurance.mjs';

// Synthetic incidents: no customer data, credentials, active workers or live claims.
const NOW = '2026-11-18T15:30:00.000Z';
const RECENT = '2026-11-18T15:29:00.000Z';
const OLD = '2026-09-21T12:00:00.000Z';
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const REPO = 'example/factory-fixture';
const CHECK_NAMES = ['build', 'typecheck', 'test', 'protection', 'Required CI completion'];

function snapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    capturedAt: NOW,
    sources: [],
    claims: [],
    receipts: [],
    sessions: [],
    runtimeFacts: [],
    tasks: [],
    leases: [],
    resources: null,
    ...overrides,
  };
}

function claim(overrides = {}) {
  return { id: 'claim-1', taskId: 'task-1', repo: REPO, sha: SHA, milestone: 'ci_passed', ...overrides };
}

function receipt(overrides = {}, detailOverrides = {}) {
  return {
    id: 'ci-1',
    taskId: 'task-1',
    repo: REPO,
    sha: SHA,
    kind: 'ci_passed',
    outcome: 'pass',
    observedAt: RECENT,
    evidenceRef: 'fixture://ci/run-1',
    ...overrides,
    details: {
      checks: CHECK_NAMES.map(name => ({ name, status: 'pass' })),
      scope: 'full_suite',
      ...detailOverrides,
    },
  };
}

function failure(overrides = {}, detailOverrides = {}) {
  return receipt({
    id: 'failure-1',
    kind: 'failure',
    outcome: 'fail',
    evidenceRef: 'fixture://logs/unidentified-failure',
    ...overrides,
  }, { scope: 'full_suite', testName: null, ...detailOverrides });
}

function verdict(s, id = 'claim-1') {
  const result = assess(s, {}, NOW);
  assert.equal(result.mode, 'advisory');
  const item = result.claims.find(x => x.id === id);
  assert.ok(item, `Assessment omitted claim ${id}`);
  assert.ok(Array.isArray(item.codes));
  assert.ok(Array.isArray(item.evidenceIds));
  return item.verdict;
}

function noPass(s) {
  assert.notEqual(verdict(s), 'supported');
}

function deployed(overrides = {}) {
  return receipt({
    id: 'deploy-1', kind: 'deployed', environment: 'staging', deploymentId: 'dep-1',
    evidenceRef: 'fixture://deployment/dep-1', ...overrides,
  });
}

function browser(overrides = {}, details = {}) {
  return receipt({
    id: 'browser-1', kind: 'browser_verified', environment: 'staging', deploymentId: 'dep-1',
    evidenceRef: 'fixture://browser/run-1', ...overrides,
  }, { startDeploymentId: 'dep-1', endDeploymentId: 'dep-1', ...details });
}

function emailClaim(overrides = {}) {
  return claim({ milestone: 'provider_accepted', environment: 'staging', noticeId: 'notice-1', providerMessageId: 'msg-1', recipientTag: 'recipient-A', ...overrides });
}

function emailReceipt(overrides = {}) {
  return receipt({ id: 'mail-1', kind: 'provider_accepted', environment: 'staging', noticeId: 'notice-1', providerMessageId: 'msg-1', recipientTag: 'recipient-A', ...overrides });
}

function freshSource() {
  return { name: 'synthetic-current-registry', capturedAt: RECENT, authoritativeAsOf: RECENT, sha256: 'c'.repeat(64) };
}

function recurringStaleClaims() {
  return assess(snapshot({
    claims: [claim(), claim({ id: 'claim-2', taskId: 'task-2' })],
    receipts: [receipt({ sha: OTHER_SHA }), receipt({ id: 'ci-2', taskId: 'task-2', sha: OTHER_SHA })],
  }), {}, NOW);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

test('all required hosted jobs on the exact commit support CI qualification', () => {
  assert.equal(verdict(snapshot({ claims: [claim()], receipts: [receipt()] })), 'supported');
});

test('an explicitly subset run cannot qualify CI even with every required job passing', () => {
  const result = assess(snapshot({ claims: [claim()], receipts: [receipt({}, { scope: 'subset' })] }), {}, NOW);
  assert.equal(result.claims[0].verdict, 'unknown');
  assert.ok(result.claims[0].codes.includes('REQUIRED_EVIDENCE_MISSING'));
});

test('absent or unsupported CI coverage stays unknown despite passing required jobs', () => {
  for (const scope of [undefined, null, '', 'partial', false, {}]) {
    assert.equal(verdict(snapshot({ claims: [claim()], receipts: [receipt({}, { scope })] })), 'unknown');
  }
});

test('current CI scope never closes or rewrites an older unidentified failure', () => {
  for (const scope of ['full_suite', 'subset', undefined]) {
    const historical = failure({ sha: OTHER_SHA }, { resolvedByReceiptId: null });
    const s = snapshot({ claims: [claim()], receipts: [historical, receipt({}, { scope })] });
    const before = JSON.stringify(s);
    deepFreeze(s);
    assert.equal(verdict(s), scope === 'full_suite' ? 'supported' : 'unknown');
    assert.equal(JSON.stringify(s), before);
    assert.equal(historical.details.testName, null);
    assert.equal(historical.details.resolvedByReceiptId, null);
  }
});

test('imported source provenance matches canonical LF bytes including adapted documentation', () => {
  const provenance = JSON.parse(readFileSync(new URL('./SOURCE_IMPORT.json', import.meta.url), 'utf8'));
  assert.equal(provenance.archiveSha256, '24fae662d0f8779efc3ed3ca234a5599f7f8e6a538bb269937fa075d0f766b6b');
  assert.equal(provenance.files.length, 19);
  for (const entry of provenance.files) {
    assert.match(entry.suppliedSha256, /^[a-f0-9]{64}$/);
    assert.match(entry.importedSha256, /^[a-f0-9]{64}$/);
    assert.ok(!entry.repositoryPath.startsWith('/') && !entry.repositoryPath.includes('..')
      && !entry.repositoryPath.includes('\\') && !entry.repositoryPath.includes(':'));
    const canonical = readFileSync(new URL(entry.repositoryPath, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(canonical).digest('hex'), entry.importedSha256, entry.repositoryPath);
  }
});

test('passing CI for a previous commit cannot qualify the current commit', () => {
  noPass(snapshot({ claims: [claim()], receipts: [receipt({ sha: OTHER_SHA })] }));
});

test('a receipt from another repository cannot qualify this repository', () => {
  noPass(snapshot({ claims: [claim()], receipts: [receipt({ repo: 'example/unrelated' })] }));
});

test('a receipt from another task cannot qualify this task', () => {
  noPass(snapshot({ claims: [claim()], receipts: [receipt({ taskId: 'other-task' })] }));
});

test('four passing jobs do not substitute for all required checks', () => {
  noPass(snapshot({ claims: [claim()], receipts: [receipt({}, { checks: CHECK_NAMES.slice(0, 4).map(name => ({ name, status: 'pass' })) })] }));
});

test('a pending test job cannot be reported as green', () => {
  noPass(snapshot({ claims: [claim()], receipts: [receipt({}, { checks: CHECK_NAMES.map(name => ({ name, status: name === 'test' ? 'pending' : 'pass' })) })] }));
});

test('a failed required job defeats a superficially passing receipt outcome', () => {
  noPass(snapshot({ claims: [claim()], receipts: [receipt({}, { checks: CHECK_NAMES.map(name => ({ name, status: name === 'test' ? 'fail' : 'pass' })) })] }));
});

test('abbreviated commit identifiers cannot produce exact-commit assurance', () => {
  noPass(snapshot({ claims: [claim({ sha: 'aaaaaaaa' })], receipts: [receipt({ sha: 'aaaaaaaa' })] }));
});

test('future-dated evidence cannot qualify a present claim', () => {
  noPass(snapshot({ claims: [claim()], receipts: [receipt({ observedAt: '2026-11-19T15:30:00.000Z' })] }));
});

test('stale registry provenance remains visible without erasing immutable CI evidence', () => {
  const s = snapshot({
    sources: [{ name: 'historical-registry', capturedAt: OLD, authoritativeAsOf: OLD, sha256: 'c'.repeat(64) }],
    claims: [claim()], receipts: [receipt()],
  });
  const result = assess(s, {}, NOW);
  assert.equal(result.claims[0].verdict, 'supported');
  assert.ok(result.findings.length > 0, 'Historical provenance must not disappear');
});

test('an old-commit failure does not falsely block a fully qualified new commit', () => {
  assert.equal(verdict(snapshot({ claims: [claim()], receipts: [failure({ sha: OTHER_SHA }), receipt()] })), 'supported');
});

test('a passing subset does not clear an unnamed failure on the current commit', () => {
  noPass(snapshot({ claims: [claim()], receipts: [failure(), receipt({}, { scope: 'subset' })] }));
});

test('a failure is resolved only by an explicitly referenced qualifying full-suite receipt', () => {
  const f = failure({}, { resolvedByReceiptId: 'full-rerun' });
  const r = receipt({ id: 'full-rerun' }, { scope: 'full_suite' });
  assert.equal(verdict(snapshot({ claims: [claim()], receipts: [f, r] })), 'supported');
});

test('a resolution pointer to another commit cannot clear the current failure', () => {
  const f = failure({}, { resolvedByReceiptId: 'wrong-rerun' });
  noPass(snapshot({ claims: [claim()], receipts: [f, receipt({ id: 'wrong-rerun', sha: OTHER_SHA })] }));
});

test('a resolution pointer to a subset cannot clear the current failure', () => {
  const f = failure({}, { resolvedByReceiptId: 'subset-rerun' });
  noPass(snapshot({ claims: [claim()], receipts: [f, receipt({ id: 'subset-rerun' }, { scope: 'subset' })] }));
});

test('a resolution pointer to a different task cannot clear the current failure', () => {
  const f = failure({}, { resolvedByReceiptId: 'other-task-rerun' });
  noPass(snapshot({ claims: [claim()], receipts: [f, receipt({ id: 'other-task-rerun', taskId: 'other-task' })] }));
});

test('a CI receipt alone cannot establish deployment', () => {
  noPass(snapshot({ claims: [claim({ milestone: 'deployed', environment: 'staging', deploymentId: 'dep-1' })], receipts: [receipt()] }));
});

test('deployment requires the exact environment and deployment identifier', () => {
  const c = claim({ milestone: 'deployed', environment: 'staging', deploymentId: 'dep-1' });
  assert.equal(verdict(snapshot({ claims: [c], receipts: [deployed()] })), 'supported');
  noPass(snapshot({ claims: [c], receipts: [deployed({ environment: 'production' })] }));
  noPass(snapshot({ claims: [c], receipts: [deployed({ deploymentId: 'dep-other' })] }));
});

test('staging browser proof needs corroborating deployment evidence', () => {
  const c = claim({ milestone: 'browser_verified', environment: 'staging', deploymentId: 'dep-1' });
  noPass(snapshot({ claims: [c], receipts: [browser()] }));
  assert.equal(verdict(snapshot({ claims: [c], receipts: [deployed(), browser()] })), 'supported');
});

test('local browser evidence cannot be relabeled as a staging browser run', () => {
  const c = claim({ milestone: 'browser_verified', environment: 'staging', deploymentId: 'dep-1' });
  noPass(snapshot({ claims: [c], receipts: [deployed(), browser({ environment: 'local' })] }));
});

test('a changing deployment during browser QA makes that run inconclusive', () => {
  const c = claim({ milestone: 'browser_verified', environment: 'staging', deploymentId: 'dep-1' });
  noPass(snapshot({ claims: [c], receipts: [deployed(), browser({}, { endDeploymentId: 'dep-2' })] }));
});

test('a declared local browser run does not require a managed deployment', () => {
  const c = claim({ milestone: 'browser_verified', environment: 'local', deploymentId: 'local-build-1' });
  const r = browser({ environment: 'local', deploymentId: 'local-build-1' }, { startDeploymentId: 'local-build-1', endDeploymentId: 'local-build-1', localSourceClean: true });
  assert.equal(verdict(snapshot({ claims: [c], receipts: [r] })), 'supported');
});

test('provider acceptance does not prove an email was observed in the inbox', () => {
  noPass(snapshot({ claims: [emailClaim({ milestone: 'inbox_observed' })], receipts: [emailReceipt()] }));
});

test('matching notice, provider message and recipient tag support provider acceptance', () => {
  assert.equal(verdict(snapshot({ claims: [emailClaim()], receipts: [emailReceipt()] })), 'supported');
});

test('a recipient-set or unrelated recipient receipt cannot become individual delivery proof', () => {
  noPass(snapshot({ claims: [emailClaim()], receipts: [emailReceipt({ recipientTag: 'recipient-B' })] }));
  noPass(snapshot({ claims: [emailClaim()], receipts: [emailReceipt({ recipientTag: undefined })] }));
});

test('receipt correlation requires notice and provider message identifiers as well as recipient', () => {
  noPass(snapshot({ claims: [emailClaim()], receipts: [emailReceipt({ noticeId: 'notice-other' })] }));
  noPass(snapshot({ claims: [emailClaim()], receipts: [emailReceipt({ providerMessageId: 'msg-other' })] }));
});

test('an assignment and heartbeat alone do not prove an authenticated worker is ready', () => {
  const result = assess(snapshot({ sessions: [{ id: 'worker-1', state: 'active', heartbeatAt: RECENT }] }), {}, NOW);
  const worker = result.runtime.find(x => x.id === 'worker-1');
  assert.ok(worker);
  assert.notEqual(worker.readiness, 'ready');
});

test('a fresh observed running and authenticated runtime is ready', () => {
  const result = assess(snapshot({
    sources: [freshSource()],
    sessions: [{ id: 'worker-1', state: 'active', heartbeatAt: RECENT }],
    runtimeFacts: [{ id: 'worker-1', state: 'running', auth: 'usable', observedAt: RECENT }],
  }), {}, NOW);
  assert.equal(result.runtime.find(x => x.id === 'worker-1').readiness, 'ready');
});

test('expired runtime authentication is blocked even with a recent heartbeat', () => {
  const result = assess(snapshot({
    sessions: [{ id: 'worker-1', state: 'active', heartbeatAt: RECENT }],
    runtimeFacts: [{ id: 'worker-1', state: 'running', auth: 'expired', observedAt: RECENT }],
  }), {}, NOW);
  assert.equal(result.runtime.find(x => x.id === 'worker-1').readiness, 'blocked');
});

test('old runtime observations do not establish current readiness', () => {
  const result = assess(snapshot({
    sessions: [{ id: 'worker-1', state: 'active', heartbeatAt: OLD }],
    runtimeFacts: [{ id: 'worker-1', state: 'running', auth: 'usable', observedAt: OLD }],
  }), {}, NOW);
  assert.notEqual(result.runtime.find(x => x.id === 'worker-1').readiness, 'ready');
});

test('source review can be established by an independent reviewer on the same source', () => {
  const c = claim({ milestone: 'source_reviewed', authorId: 'author-1' });
  const r = receipt({ kind: 'source_reviewed' }, { authorId: 'author-1', reviewerId: 'reviewer-2' });
  assert.equal(verdict(snapshot({ claims: [c], receipts: [r] })), 'supported');
});

test('author self-review cannot qualify an independent source review claim', () => {
  const c = claim({ milestone: 'source_reviewed', authorId: 'author-1' });
  const r = receipt({ kind: 'source_reviewed' }, { authorId: 'author-1', reviewerId: 'author-1' });
  noPass(snapshot({ claims: [c], receipts: [r] }));
});

test('unsupported registry root shapes are rejected rather than reported healthy', () => {
  assert.throws(() => normalizeRegistries({ activeTasks: 42, codeOwnership: null, sessionRegistry: 'not-a-registry' }, NOW));
});

test('assurance is deterministic and does not mutate frozen caller data or policy', () => {
  const s = snapshot({ claims: [claim()], receipts: [receipt()] });
  const policy = {};
  const before = JSON.stringify(s);
  deepFreeze(s);
  deepFreeze(policy);
  const first = assess(s, policy, NOW);
  const second = assess(s, policy, NOW);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(policy, {});
});

test('repeated incidents yield only review proposals, never an automatically approved lesson', () => {
  const a = recurringStaleClaims();
  const lessons = proposeLessons(a);
  assert.ok(lessons.length > 0, 'Two distinct stale-SHA claims should expose a repeatable lesson');
  assert.ok(lessons.every(x => x.status === 'proposed'));
  assert.equal(new Set(lessons.map(x => x.id)).size, lessons.length);
});

test('duplicate copies of one subject are not two independent learning incidents', () => {
  const a = assess(snapshot({ claims: [claim()], receipts: [receipt({ sha: OTHER_SHA })] }), {}, NOW);
  a.findings = [...a.findings, ...structuredClone(a.findings), ...structuredClone(a.findings)];
  assert.equal(proposeLessons(a).length, 0);
});

test('a previously reviewed lesson is not proposed again', () => {
  const a = recurringStaleClaims();
  const proposed = proposeLessons(a);
  assert.ok(proposed.length > 0);
  const reviewed = proposed.map(x => ({ ...x, status: 'approved' }));
  const again = proposeLessons(a, reviewed);
  assert.ok(again.every(x => !reviewed.some(old => old.id === x.id)));
});

test('untrusted finding text remains inert and cannot alter global state', () => {
  const a = recurringStaleClaims();
  const marker = '__factory_test_untrusted_marker__';
  delete globalThis[marker];
  for (const f of a.findings) f.nextAction = `globalThis.${marker} = true`;
  const before = JSON.stringify(a);
  deepFreeze(a);
  proposeLessons(a, [{ id: 'untrusted', status: 'approved', prevention: `globalThis.${marker} = true` }]);
  assert.equal(globalThis[marker], undefined);
  assert.equal(JSON.stringify(a), before);
});

function evaluationCase(id, incidentGroup, split, expected, s) {
  return { id, incidentGroup, split, snapshot: s, claimId: 'claim-1', expected };
}

test('evaluation rejects incident-family leakage across development and holdout', () => {
  const s = snapshot({ claims: [claim()], receipts: [receipt()] });
  const cases = [
    evaluationCase('dev-1', 'same-incident', 'development', 'supported', s),
    evaluationCase('hold-1', 'same-incident', 'holdout', 'supported', structuredClone(s)),
  ];
  const result = evaluate(cases, {}, NOW);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('evaluation keeps distinct incident families and produces stable dataset identity', () => {
  const cases = [
    evaluationCase('dev-pass', 'valid-ci', 'development', 'supported', snapshot({ claims: [claim()], receipts: [receipt()] })),
    evaluationCase('hold-missing', 'missing-ci', 'holdout', 'unknown', snapshot({ claims: [claim()] })),
  ];
  const before = JSON.stringify(cases);
  deepFreeze(cases);
  const first = evaluate(cases, {}, NOW);
  const second = evaluate(cases, {}, NOW);
  assert.equal(first.valid, true);
  assert.equal(first.results.length, 2);
  assert.match(first.datasetHash, /^[a-f0-9]{64}$/);
  assert.equal(first.datasetHash, second.datasetHash);
  assert.equal(JSON.stringify(cases), before);
});

test('comparison cannot recommend a candidate with invalid or leaking evaluation data', () => {
  const goodCases = [evaluationCase('good', 'good-case', 'holdout', 'supported', snapshot({ claims: [claim()], receipts: [receipt()] }))];
  const base = evaluate(goodCases, {}, NOW);
  const invalid = evaluate([
    evaluationCase('dup-a', 'leak', 'development', 'supported', goodCases[0].snapshot),
    evaluationCase('dup-b', 'leak', 'holdout', 'supported', goodCases[0].snapshot),
  ], {}, NOW);
  assert.equal(compareEvaluations(base, invalid).recommendation, 'reject');
});

test('evaluation never promotes a lesson or changes caller authority policy', () => {
  const cases = [evaluationCase('known-pass', 'single-ci', 'holdout', 'supported', snapshot({ claims: [claim()], receipts: [receipt()] }))];
  const policy = deepFreeze({});
  const report = evaluate(cases, policy, NOW);
  const decision = compareEvaluations(report, report);
  assert.ok(['review_candidate', 'reject'].includes(decision.recommendation));
  assert.notEqual(decision.recommendation, 'approved');
  assert.deepEqual(policy, {});
});

test('an unsupported snapshot schema cannot retain a supported completion claim', () => {
  const result = assess(snapshot({ schemaVersion: 99, claims: [claim()], receipts: [receipt()] }), {}, NOW);
  assert.equal(result.mode, 'advisory');
  assert.ok(result.findings.length > 0);
  assert.ok(result.claims.every(x => x.verdict !== 'supported'));
});

test('duplicate claim IDs cannot conceal a conflicting completion assertion', () => {
  const result = assess(snapshot({
    claims: [claim(), claim({ sha: OTHER_SHA })], receipts: [receipt()],
  }), {}, NOW);
  assert.ok(result.findings.length > 0);
  assert.ok(result.claims.filter(x => x.id === 'claim-1').every(x => x.verdict !== 'supported'));
});

test('malformed null CI checks are rejected without crashing or producing a pass', () => {
  const r = receipt({}, { checks: [...CHECK_NAMES.map(name => ({ name, status: 'pass' })), null] });
  noPass(snapshot({ claims: [claim()], receipts: [r] }));
});

test('exporting historical registries today neither refreshes authority nor leaks payload fields', () => {
  const input = {
    activeTasks: { schemaVersion: 1, updatedAt: OLD, tasks: [{ id: 'task-1', state: 'claimed', owner: 'worker-1', privatePayload: 'DO-NOT-EXPORT' }] },
    codeOwnership: { schemaVersion: 1, updatedAt: OLD, leases: [] },
    sessionRegistry: { schemaVersion: 1, updatedAt: OLD, sessions: [{ id: 'worker-1', state: 'active', credential: 'DO-NOT-EXPORT' }] },
  };
  const before = JSON.stringify(input);
  deepFreeze(input);
  const normalized = normalizeRegistries(input, NOW);
  assert.ok(normalized.sources.every(x => x.capturedAt === NOW && x.authoritativeAsOf === OLD));
  assert.ok(!JSON.stringify(normalized).includes('DO-NOT-EXPORT'));
  assert.equal(JSON.stringify(input), before);
});

test('evaluation exposes numeric unsafe-acceptance and false-block denominators separately', () => {
  // Deliberately contrary labels exercise confusion accounting, not policy quality.
  const pass = snapshot({ claims: [claim()], receipts: [receipt()] });
  const deniedReview = snapshot({
    claims: [claim({ milestone: 'source_reviewed', authorId: 'author-1' })],
    receipts: [receipt({ kind: 'source_reviewed' }, { authorId: 'author-1', reviewerId: 'author-1' })],
  });
  const cases = [
    evaluationCase('correct-supported', 'good', 'development', 'supported', pass),
    evaluationCase('false-block', 'bad-block', 'holdout', 'supported', deniedReview),
    evaluationCase('unsafe-allow', 'bad-allow', 'holdout', 'unsupported', pass),
    evaluationCase('correct-denied', 'denied', 'development', 'unsupported', deniedReview),
    evaluationCase('correct-unknown', 'unknown', 'holdout', 'unknown', snapshot({ claims: [claim()] })),
  ];
  const result = evaluate(cases, {}, NOW);
  assert.equal(result.valid, true);
  assert.deepEqual(result.metrics.unsafeAcceptance, { numerator: 1, denominator: 3, rate: 1 / 3 });
  assert.deepEqual(result.metrics.falseBlock, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(result.metrics.supportedRecognition, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.deepEqual(result.metrics.uncertaintyHandling, { numerator: 1, denominator: 1, rate: 1 });
  assert.deepEqual(result.metrics.accuracy, { numerator: 3, denominator: 5, rate: 0.6 });
  assert.deepEqual(result.metrics.coverage, { numerator: 5, denominator: 5, rate: 1 });
});

test('a metric with no applicable population is unknown rather than a perfect zero', () => {
  const result = evaluate([
    evaluationCase('supported-only', 'ci', 'holdout', 'supported', snapshot({ claims: [claim()], receipts: [receipt()] })),
  ], {}, NOW);
  assert.deepEqual(result.metrics.unsafeAcceptance, { numerator: 0, denominator: 0, rate: null });
  assert.deepEqual(result.metrics.uncertaintyHandling, { numerator: 0, denominator: 0, rate: null });
});

function learningCases() {
  const extraProof = snapshot({ claims: [claim()], receipts: [receipt({}, {
    checks: [...CHECK_NAMES, 'integration'].map(name => ({ name, status: 'pass' })),
  })] });
  const incompleteProof = snapshot({ claims: [claim()], receipts: [receipt()] });
  const deniedReview = snapshot({
    claims: [claim({ milestone: 'source_reviewed', authorId: 'author-1' })],
    receipts: [receipt({ kind: 'source_reviewed' }, { authorId: 'author-1', reviewerId: 'author-1' })],
  });
  return [
    evaluationCase('dev-complete', 'complete-dev', 'development', 'supported', extraProof),
    evaluationCase('hold-complete', 'complete-hold', 'holdout', 'supported', structuredClone(extraProof)),
    evaluationCase('dev-missing', 'missing-dev', 'development', 'unknown', incompleteProof),
    evaluationCase('hold-missing', 'missing-hold', 'holdout', 'unknown', structuredClone(incompleteProof)),
    evaluationCase('hold-denied', 'denied-hold', 'holdout', 'unsupported', deniedReview),
  ];
}

test('a measured improvement on the same frozen cases recommends review, never approval', () => {
  const cases = learningCases();
  const baseline = evaluate(cases, {}, NOW);
  const candidate = evaluate(cases, { requiredCiChecks: ['integration'] }, NOW);
  assert.equal(baseline.metrics.unsafeAcceptance.numerator, 2);
  assert.equal(candidate.metrics.unsafeAcceptance.numerator, 0);
  assert.equal(candidate.metrics.supportedRecognition.rate, 1);
  assert.equal(candidate.metrics.accuracy.rate, 1);
  const decision = compareEvaluations(baseline, candidate);
  assert.equal(decision.recommendation, 'review_candidate');
  assert.equal(decision.automaticPromotion, false);
});

test('blocking all CI qualification is rejected despite zero unsafe acceptance', () => {
  const cases = learningCases();
  const baseline = evaluate(cases, { requiredCiChecks: ['integration'] }, NOW);
  const candidate = evaluate(cases, { requiredCiChecks: ['integration', 'never-provided-check'] }, NOW);
  assert.equal(candidate.metrics.unsafeAcceptance.rate, 0);
  assert.equal(candidate.metrics.supportedRecognition.rate, 0);
  assert.equal(compareEvaluations(baseline, candidate).recommendation, 'reject');
});

test('malformed metric numbers cannot qualify a candidate for promotion review', () => {
  const cases = learningCases();
  const baseline = evaluate(cases, {}, NOW);
  const candidate = evaluate(cases, { requiredCiChecks: ['integration'] }, NOW);
  candidate.metrics.accuracy.rate = Number.NaN;
  assert.equal(compareEvaluations(baseline, candidate).recommendation, 'reject');
});

test('duplicate evaluation IDs and missing claims invalidate the evaluation', () => {
  const s = snapshot({ claims: [claim()], receipts: [receipt()] });
  const duplicate = evaluate([
    evaluationCase('same-id', 'first', 'development', 'supported', s),
    evaluationCase('same-id', 'second', 'holdout', 'supported', s),
  ], {}, NOW);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.length > 0);
  const absent = evaluate([{ ...evaluationCase('missing', 'missing', 'holdout', 'unknown', s), claimId: 'does-not-exist' }], {}, NOW);
  assert.equal(absent.valid, false);
  assert.equal(absent.metrics.coverage.numerator, 0);
});

test('repeated null receipts are reported as invalid input without crashing or qualifying a claim', () => {
  const result = assess(snapshot({ claims: [claim()], receipts: [null, null] }), {}, NOW);
  assert.equal(result.mode, 'advisory');
  assert.ok(result.findings.length > 0);
  assert.notEqual(result.claims.find(x => x.id === 'claim-1').verdict, 'supported');
});

test('null comparison result records reject safely rather than dereferencing a missing record', () => {
  const cases = learningCases();
  const baseline = evaluate(cases, {}, NOW);
  const candidate = evaluate(cases, { requiredCiChecks: ['integration'] }, NOW);
  candidate.results = [null];
  assert.equal(compareEvaluations(baseline, candidate).recommendation, 'reject');
});

test('forged passing metrics cannot hide an unsafe holdout outcome', () => {
  const cases = learningCases();
  const baseline = evaluate(cases, {}, NOW);
  for (const expected of ['unknown', 'unsupported']) {
    const candidate = evaluate(cases, { requiredCiChecks: ['integration'] }, NOW);
    const holdout = candidate.results.find(x => x.split === 'holdout' && x.expected === expected);
    assert.ok(holdout, `Fixture is missing its ${expected} holdout`);
    holdout.actual = 'supported';
    // Leave the original perfect metrics intact: comparison must recompute them.
    assert.equal(candidate.metrics.unsafeAcceptance.rate, 0);
    assert.equal(compareEvaluations(baseline, candidate).recommendation, 'reject');
  }
});

test('a September deployment receipt cannot establish what is currently deployed in November', () => {
  const s = snapshot({
    sources: [freshSource()],
    claims: [claim({ milestone: 'deployed', environment: 'staging', deploymentId: 'dep-1' })],
    receipts: [deployed({ observedAt: OLD })],
  });
  noPass(s);
});

test('fresh browser evidence still needs a recent matching nonlocal deployment observation', () => {
  const s = snapshot({
    sources: [freshSource()],
    claims: [claim({ milestone: 'browser_verified', environment: 'staging', deploymentId: 'dep-1' })],
    receipts: [deployed({ observedAt: OLD }), browser()],
  });
  noPass(s);
});

test('a candidate cannot erase a failing critical designation to gain a review recommendation', () => {
  const passedCi = snapshot({ claims: [claim()], receipts: [receipt()] });
  const deniedReview = snapshot({
    claims: [claim({ milestone: 'source_reviewed', authorId: 'author-1' })],
    receipts: [receipt({ kind: 'source_reviewed' }, { authorId: 'author-1', reviewerId: 'author-1' })],
  });
  const cases = [
    evaluationCase('improving-ci', 'ci-check-policy', 'development', 'supported', passedCi),
    { ...evaluationCase('critical-case', 'critical-reference-label', 'development', 'unknown', deniedReview), critical: true },
    evaluationCase('stable-holdout', 'review-denial', 'holdout', 'unsupported', deniedReview),
  ];
  const baseline = evaluate(cases, { requiredCiChecks: ['additional-check'] }, NOW);
  const candidate = evaluate(cases, {}, NOW);
  assert.ok(candidate.metrics.accuracy.rate > baseline.metrics.accuracy.rate);
  const critical = candidate.results.find(x => x.id === 'critical-case');
  assert.notEqual(critical.actual, critical.expected);
  critical.critical = false;
  assert.equal(compareEvaluations(baseline, candidate).recommendation, 'reject');
});
