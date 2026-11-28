import { createHash } from 'node:crypto';

export const VERSION = '0.1.0';
export const REQUIRED_CI = Object.freeze(['build', 'typecheck', 'test', 'protection', 'Required CI completion']);
const MILESTONES = new Set(['source_reviewed', 'ci_passed', 'deployed', 'browser_verified', 'provider_accepted', 'inbox_observed']);
const SHA = /^[a-f0-9]{40}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const TERMINAL_TASKS = new Set(['done']);
const ACTIONS = Object.freeze({
  INVALID_INPUT: 'repair_input', SOURCE_STALE: 'refresh_source', SOURCE_FRESHNESS_UNKNOWN: 'refresh_source',
  REQUIRED_EVIDENCE_MISSING: 'collect_receipt', SHA_MISMATCH: 'verify_current_sha',
  ENVIRONMENT_MISMATCH: 'verify_environment', DEPLOYMENT_MISMATCH: 'complete_browser_check',
  CURRENT_FAILURE: 'collect_log', FAILURE_UNIDENTIFIED: 'collect_log',
  SELF_REVIEW: 'request_independent_review', AUTH_EXPIRED: 'restore_authentication',
  RUNTIME_UNVERIFIED: 'confirm_runtime', DEPENDENCY_INCOMPLETE: 'resolve_dependency',
  OWNERSHIP_CONFLICT: 'request_owner_reconciliation', OWNERSHIP_UNASSESSABLE: 'request_owner_reconciliation',
  HEAVY_SLOT_CONFLICT: 'request_resource_reconciliation', MEMORY_UNAVAILABLE: 'collect_resource_observation',
  MEMORY_BELOW_FLOOR: 'request_resource_reconciliation', DONE_WITHOUT_EVIDENCE: 'collect_receipt',
});

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const str = value => typeof value === 'string' && value.length > 0;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const timestamp = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const list = value => Array.isArray(value) ? value : [];

function policyOf(input) {
  if (!object(input)) throw new TypeError('Policy must be an object.');
  const policy = { maxSourceAgeSeconds: 1800, maxRuntimeAgeSeconds: 300, futureSkewSeconds: 30, minFreeMemoryMiB: 700, ...input };
  for (const key of ['maxSourceAgeSeconds', 'maxRuntimeAgeSeconds', 'futureSkewSeconds', 'minFreeMemoryMiB']) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0) throw new TypeError(`Invalid policy field: ${key}`);
  }
  if (input.requiredCiChecks !== undefined && (!Array.isArray(input.requiredCiChecks) || input.requiredCiChecks.some(x => !str(x)))) {
    throw new TypeError('requiredCiChecks must be an array of nonempty strings.');
  }
  // Callers may strengthen the check set; a supplied policy cannot remove the baseline.
  policy.requiredCiChecks = [...new Set([...REQUIRED_CI, ...list(input.requiredCiChecks)])];
  return policy;
}

function fresh(value, nowMs, limitSeconds, skewSeconds) {
  const at = timestamp(value);
  return Number.isFinite(at) && at <= nowMs + skewSeconds * 1000 && nowMs - at <= limitSeconds * 1000;
}

function receiptValid(receipt, nowMs, policy) {
  const at = timestamp(receipt?.observedAt);
  return object(receipt) && str(receipt.id) && str(receipt.taskId) && str(receipt.repo)
    && str(receipt.sha) && SHA.test(receipt.sha) && (MILESTONES.has(receipt.kind) || receipt.kind === 'failure')
    && ['pass', 'fail', 'unknown'].includes(receipt.outcome) && str(receipt.evidenceRef)
    && Number.isFinite(at) && at <= nowMs + policy.futureSkewSeconds * 1000;
}

function ciPass(receipt, policy) {
  // Check names alone cannot establish the coverage of the reported run.
  // An explicit subset or absent scope stays inconclusive even when all
  // required job names were copied into the receipt.
  if (receipt.kind !== 'ci_passed' || receipt.outcome !== 'pass' || receipt.details?.scope !== 'full_suite') return false;
  const checks = list(receipt.details?.checks);
  return policy.requiredCiChecks.every(name => {
    const matches = checks.filter(check => check?.name === name);
    return matches.length === 1 && matches[0].status === 'pass';
  }) && checks.every(check => object(check) && str(check.name) && check.status === 'pass');
}

// One explicit required-check failure contradicts all-checks-pass; it names no test.
function requiredCiCheckFailed(receipt, policy) {
  const checks = receipt.details?.checks;
  if (receipt.kind !== 'ci_passed' || !['fail', 'unknown'].includes(receipt.outcome) || !Array.isArray(checks) || !checks.length) return false;
  const names = new Set();
  for (const check of checks) {
    if (!object(check) || !str(check.name) || check.name !== check.name.trim() || names.has(check.name)
      || !['pass', 'fail', 'pending', 'unknown'].includes(check.status)) return false;
    names.add(check.name);
  }
  return checks.some(check => check.status === 'fail' && policy.requiredCiChecks.includes(check.name)
    && (receipt.outcome === 'fail' || (
      // An unknown aggregate cannot negate a separately attested terminal job failure.
      check.providerStatus === 'completed' && check.providerConclusion === 'failure'
      && Number.isSafeInteger(check.jobId) && check.jobId > 0
      && checks.filter(row => row.jobId === check.jobId).length === 1
      && str(check.sourceSha) && SHA.test(check.sourceSha) && check.sourceSha.toLowerCase() === receipt.sha.toLowerCase()
      && Number.isSafeInteger(check.attempt) && check.attempt > 0
      && Number.isFinite(timestamp(check.startedAt)) && Number.isFinite(timestamp(check.completedAt))
      && timestamp(check.startedAt) <= timestamp(check.completedAt)
      && timestamp(check.completedAt) <= timestamp(receipt.observedAt) + policy.futureSkewSeconds * 1000
    )));
}

function sameSubject(receipt, claim) {
  return receipt.repo === claim.repo && receipt.taskId === claim.taskId && receipt.sha.toLowerCase() === claim.sha.toLowerCase();
}

function assessClaim(claim, receipts, policy, nowMs, add) {
  const result = { id: claim?.id ?? null, verdict: 'unknown', codes: [], evidenceIds: [] };
  const mark = (code, verdict = 'unknown', evidence = []) => {
    result.codes.push(code);
    result.evidenceIds.push(...evidence.map(x => x.id));
    if (verdict === 'unsupported' || result.verdict !== 'unsupported') result.verdict = verdict;
    add(code, claim?.id ?? 'invalid-claim', claim?.repo ?? null, evidence.map(x => x.id));
  };
  if (!object(claim) || !str(claim.id) || !str(claim.taskId) || !str(claim.repo) || !str(claim.sha) || !SHA.test(claim.sha) || !MILESTONES.has(claim.milestone)) {
    mark('INVALID_INPUT');
    return result;
  }
  const valid = receipts.filter(r => receiptValid(r, nowMs, policy));
  const exact = valid.filter(r => sameSubject(r, claim));
  const sameKind = exact.filter(r => r.kind === claim.milestone);
  const otherSha = valid.filter(r => r.repo === claim.repo && r.taskId === claim.taskId && r.kind === claim.milestone && !sameSubject(r, claim));
  if (!sameKind.length) {
    mark(otherSha.length ? 'SHA_MISMATCH' : 'REQUIRED_EVIDENCE_MISSING', 'unknown', otherSha);
    return result;
  }

  if (claim.milestone === 'ci_passed') {
    const failing = sameKind.filter(r => r.outcome === 'fail' || list(r.details?.checks).some(c => c?.status === 'fail'));
    const successful = sameKind.filter(r => ciPass(r, policy));
    // A later full run clears a specific known run failure only with an explicit resolution link.
    const unresolved = exact.filter(r => r.kind === 'failure' || failing.includes(r)).filter(failure => {
      const resolution = successful.find(r => r.id === failure.details?.resolvedByReceiptId);
      return !resolution || resolution.details?.scope !== 'full_suite'
        || timestamp(resolution.observedAt) < timestamp(failure.observedAt);
    });
    if (unresolved.length) {
      for (const failure of unresolved) {
        const identified = Boolean(failure.details?.testName) || requiredCiCheckFailed(failure, policy);
        mark(identified ? 'CURRENT_FAILURE' : 'FAILURE_UNIDENTIFIED', identified ? 'unsupported' : 'unknown', [failure]);
      }
      return result;
    }
    if (!successful.length) {
      mark('REQUIRED_EVIDENCE_MISSING', 'unknown', sameKind);
      return result;
    }
    result.verdict = 'supported'; result.evidenceIds = successful.map(r => r.id); return result;
  }

  let candidates = sameKind;
  if (['deployed', 'browser_verified', 'provider_accepted', 'inbox_observed'].includes(claim.milestone)) {
    if (!str(claim.environment)) { mark('INVALID_INPUT'); return result; }
    candidates = candidates.filter(r => r.environment === claim.environment);
    if (!candidates.length) { mark('ENVIRONMENT_MISMATCH', 'unknown', sameKind); return result; }
  }
  if (['deployed', 'browser_verified'].includes(claim.milestone)) {
    if (claim.environment !== 'local' && !str(claim.deploymentId)) { mark('INVALID_INPUT'); return result; }
    if (str(claim.deploymentId)) {
      const matched = candidates.filter(r => r.deploymentId === claim.deploymentId);
      if (!matched.length) { mark('DEPLOYMENT_MISMATCH', 'unknown', candidates); return result; }
      candidates = matched;
    }
  }
  if (claim.milestone === 'deployed') {
    candidates = candidates.filter(r => fresh(r.observedAt, nowMs, policy.maxRuntimeAgeSeconds, policy.futureSkewSeconds));
    if (!candidates.length) { mark('SOURCE_STALE', 'unknown', sameKind); return result; }
  }
  if (claim.milestone === 'browser_verified') {
    candidates = candidates.filter(r => claim.environment === 'local'
      ? r.details?.localSourceClean === true
      : r.details?.startDeploymentId === claim.deploymentId && r.details?.endDeploymentId === claim.deploymentId);
    if (!candidates.length) { mark('DEPLOYMENT_MISMATCH', 'unknown', sameKind); return result; }
    if (claim.environment !== 'local' && !exact.some(r => r.kind === 'deployed' && r.outcome === 'pass' && r.environment === claim.environment && r.deploymentId === claim.deploymentId
      && fresh(r.observedAt, nowMs, policy.maxRuntimeAgeSeconds, policy.futureSkewSeconds))) {
      mark('REQUIRED_EVIDENCE_MISSING'); return result;
    }
  }
  if (['provider_accepted', 'inbox_observed'].includes(claim.milestone)) {
    if (![claim.noticeId, claim.providerMessageId, claim.recipientTag].every(str)) { mark('INVALID_INPUT'); return result; }
    candidates = candidates.filter(r => r.noticeId === claim.noticeId && r.providerMessageId === claim.providerMessageId && r.recipientTag === claim.recipientTag);
    if (!candidates.length) { mark('REQUIRED_EVIDENCE_MISSING'); return result; }
  }
  if (claim.milestone === 'source_reviewed') {
    if (!str(claim.authorId)) { mark('INVALID_INPUT'); return result; }
    const self = candidates.filter(r => r.details?.reviewerId === claim.authorId);
    candidates = candidates.filter(r => str(r.details?.reviewerId) && r.details.reviewerId !== claim.authorId && r.details?.authorId === claim.authorId);
    if (!candidates.length) { mark(self.length ? 'SELF_REVIEW' : 'REQUIRED_EVIDENCE_MISSING', self.length ? 'unsupported' : 'unknown', self); return result; }
  }
  const failed = candidates.filter(r => r.outcome === 'fail');
  if (failed.length) { mark('CURRENT_FAILURE', 'unsupported', failed); return result; }
  const passed = candidates.filter(r => r.outcome === 'pass');
  if (!passed.length) { mark('REQUIRED_EVIDENCE_MISSING', 'unknown', candidates); return result; }
  result.verdict = 'supported'; result.evidenceIds = passed.map(r => r.id); return result;
}

function canonicalPath(raw) {
  if (!str(raw) || raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null;
  const subtree = raw.endsWith('/**');
  const base = subtree ? raw.slice(0, -3) : raw;
  if (!base || /[?*\[\]{}]/.test(base) || base.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return { base, subtree };
}

function exactOrSubtreeOverlap(a, b) {
  const x = canonicalPath(a), y = canonicalPath(b);
  if (!x || !y) return null;
  return x.base === y.base || (x.subtree && y.base.startsWith(x.base + '/')) || (y.subtree && x.base.startsWith(y.base + '/'));
}

/** Validate supplied evidence. No registry mutation, network call, lease acquisition or dispatch. */
export function assess(snapshot, policyInput = {}, now = snapshot?.capturedAt) {
  const policy = policyOf(policyInput);
  const nowMs = timestamp(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a timezone-qualified timestamp.');
  const report = { schemaVersion: 1, version: VERSION, mode: 'advisory', authority: 'none', assessedAt: now, claims: [], findings: [], runtime: [], counts: { supported: 0, unsupported: 0, unknown: 0 }, status: 'attention_required' };
  const add = (code, subjectId, repo = null, evidenceIds = []) => report.findings.push({ code, subjectId, repo, evidenceIds, nextAction: ACTIONS[code] ?? 'manual_review' });
  if (!object(snapshot) || snapshot.schemaVersion !== 1) {
    add('INVALID_INPUT', 'snapshot');
    return report;
  }
  const snapshotFresh = fresh(snapshot.capturedAt, nowMs, policy.maxSourceAgeSeconds, policy.futureSkewSeconds);
  if (!snapshotFresh) add('SOURCE_STALE', 'snapshot');
  for (const key of ['sources', 'claims', 'receipts', 'sessions', 'runtimeFacts', 'tasks', 'leases']) {
    if (snapshot[key] !== undefined && (!Array.isArray(snapshot[key]) || snapshot[key].length > 10000)) {
      add('INVALID_INPUT', key); return report;
    }
  }
  const sourceFresh = snapshotFresh && list(snapshot.sources).length > 0 && list(snapshot.sources).every(source =>
    object(source) && str(source.name) && str(source.sha256) && HASH.test(source.sha256)
    && fresh(source.capturedAt, nowMs, policy.maxSourceAgeSeconds, policy.futureSkewSeconds)
    && fresh(source.authoritativeAsOf, nowMs, policy.maxSourceAgeSeconds, policy.futureSkewSeconds));
  if (!list(snapshot.sources).length) add('SOURCE_FRESHNESS_UNKNOWN', 'sources');
  for (const source of list(snapshot.sources)) {
    if (!object(source) || !str(source.name) || !str(source.sha256) || !HASH.test(source.sha256) || !Number.isFinite(timestamp(source.authoritativeAsOf))) {
      add('SOURCE_FRESHNESS_UNKNOWN', source?.name ?? 'source');
    } else if (!fresh(source.capturedAt, nowMs, policy.maxSourceAgeSeconds, policy.futureSkewSeconds) || !fresh(source.authoritativeAsOf, nowMs, policy.maxSourceAgeSeconds, policy.futureSkewSeconds)) {
      add('SOURCE_STALE', source.name);
    }
  }
  const seenReceipt = new Set();
  const duplicates = new Set();
  for (const receipt of list(snapshot.receipts)) {
    if (seenReceipt.has(receipt?.id)) duplicates.add(receipt?.id);
    seenReceipt.add(receipt?.id);
    if (!receiptValid(receipt, nowMs, policy)) add('INVALID_INPUT', receipt?.id ?? 'receipt');
  }
  for (const id of duplicates) add('INVALID_INPUT', id);
  const receipts = list(snapshot.receipts).filter(r => !duplicates.has(r?.id));
  const claimIds = new Set();
  const duplicateClaims = new Set();
  for (const claim of list(snapshot.claims)) {
    if (claimIds.has(claim?.id)) duplicateClaims.add(claim?.id);
    claimIds.add(claim?.id);
  }
  claimIds.clear();
  for (const claim of list(snapshot.claims)) {
    if (claimIds.has(claim?.id)) continue;
    claimIds.add(claim?.id);
    if (duplicateClaims.has(claim?.id)) {
      add('INVALID_INPUT', claim?.id ?? 'claim');
      report.claims.push({ id: claim?.id ?? null, verdict: 'unknown', codes: ['INVALID_INPUT'], evidenceIds: [] });
      continue;
    }
    report.claims.push(assessClaim(claim, receipts, policy, nowMs, add));
  }

  for (const session of list(snapshot.sessions)) {
    if (!object(session) || !str(session.id)) { add('INVALID_INPUT', 'session'); continue; }
    const facts = list(snapshot.runtimeFacts).filter(f => object(f) && f.id === session.id && fresh(f.observedAt, nowMs, policy.maxRuntimeAgeSeconds, policy.futureSkewSeconds));
    const newest = facts.slice().sort((a, b) => timestamp(b.observedAt) - timestamp(a.observedAt))[0];
    let readiness = 'unknown';
    if (newest?.auth === 'expired') { readiness = 'blocked'; add('AUTH_EXPIRED', session.id); }
    else if (newest?.state === 'stopped') readiness = 'blocked';
    else if (sourceFresh && newest?.state === 'running' && newest?.auth === 'usable' && fresh(session.heartbeatAt, nowMs, policy.maxRuntimeAgeSeconds, policy.futureSkewSeconds)) readiness = 'ready';
    else add('RUNTIME_UNVERIFIED', session.id);
    report.runtime.push({ id: session.id, readiness });
  }

  const tasks = list(snapshot.tasks);
  const byId = new Map();
  for (const task of tasks) {
    if (!object(task) || !str(task.id) || byId.has(task.id)) { add('INVALID_INPUT', task?.id ?? 'task'); continue; }
    byId.set(task.id, task);
  }
  for (const task of byId.values()) {
    if (sourceFresh && ['claimed', 'qa'].includes(task.state)) {
      for (const dependency of list(task.dependsOn)) if (!TERMINAL_TASKS.has(byId.get(dependency)?.state)) add('DEPENDENCY_INCOMPLETE', task.id, task.repo ?? null, [dependency]);
    }
    if (task.state === 'done') {
      const scopedClaims = list(snapshot.claims).filter(c => c?.taskId === task.id);
      const supported = report.claims.some(c => c.verdict === 'supported' && scopedClaims.some(s => s.id === c.id));
      if (!supported) add('DONE_WITHOUT_EVIDENCE', task.id, task.repo ?? null);
    }
  }
  const active = list(snapshot.leases).filter(l => object(l) && l.state === 'active');
  if (sourceFresh) {
    for (const lease of active) {
      if (!Array.isArray(lease.paths) || lease.paths.some(p => canonicalPath(p) === null)) add('OWNERSHIP_UNASSESSABLE', lease.id ?? lease.session);
    }
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      if (active[i].session === active[j].session) continue;
      if (list(active[i].paths).some(a => list(active[j].paths).some(b => exactOrSubtreeOverlap(a, b) === true))) {
        add('OWNERSHIP_CONFLICT', active[i].id ?? active[i].session, null, [active[j].id ?? active[j].session]);
      }
    }
  }
  if (snapshot.resources !== null && snapshot.resources !== undefined) {
    const r = snapshot.resources;
    if (!object(r) || !fresh(r.observedAt, nowMs, policy.maxRuntimeAgeSeconds, policy.futureSkewSeconds)) add('MEMORY_UNAVAILABLE', 'resources');
    else {
      const jobs = list(r.jobs).filter(j => j?.state === 'running' && j?.weight === 'heavy');
      if (!Number.isFinite(r.freeMemoryMiB)) add('MEMORY_UNAVAILABLE', 'resources');
      else if (r.freeMemoryMiB < policy.minFreeMemoryMiB) add('MEMORY_BELOW_FLOOR', 'resources');
      if (jobs.length > 1 || jobs.some(j => !r.allocation || j.id !== r.allocation.jobId || j.owner !== r.allocation.owner)) add('HEAVY_SLOT_CONFLICT', 'resources', null, jobs.map(j => j.id));
    }
  }
  report.counts = Object.fromEntries(['supported', 'unsupported', 'unknown'].map(state => [state, report.claims.filter(c => c.verdict === state).length]));
  report.findings = [...new Map(report.findings.map(f => [JSON.stringify(f), f])).values()];
  report.status = report.findings.length ? 'attention_required' : 'no_findings_in_supplied_evidence';
  return report;
}

/** Adapter for the observed repository schema; preserves only non-payload coordination fields. */
export function normalizeRegistries({ activeTasks, codeOwnership, sessionRegistry }, capturedAt) {
  if (!Number.isFinite(timestamp(capturedAt))) throw new TypeError('Invalid capturedAt.');
  for (const [value, key] of [[activeTasks, 'tasks'], [codeOwnership, 'leases'], [sessionRegistry, 'sessions']]) {
    if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value[key])) throw new TypeError(`Unsupported registry schema: ${key}`);
  }
  const pick = (item, keys) => {
    if (!object(item)) throw new TypeError('Registry records must be objects.');
    return Object.fromEntries(keys.filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]]));
  };
  const sources = [[activeTasks, 'ACTIVE_TASKS'], [codeOwnership, 'CODE_OWNERSHIP'], [sessionRegistry, 'SESSION_REGISTRY']].map(([value, name]) => ({
    name, sha256: digest(value), capturedAt, authoritativeAsOf: value.updatedAt ?? null,
  }));
  return {
    schemaVersion: 1, capturedAt, sources,
    tasks: activeTasks.tasks.map(t => pick(t, ['id', 'state', 'owner', 'dependsOn', 'paths', 'baseSha', 'acceptedSha', 'heartbeatAt', 'updatedAt'])),
    leases: codeOwnership.leases.map(l => pick(l, ['id', 'state', 'session', 'task', 'paths', 'heartbeatAt', 'claimedAt', 'releasedAt'])),
    sessions: sessionRegistry.sessions.map(s => pick(s, ['id', 'state', 'tool', 'lane', 'branch', 'heartbeatAt'])),
    runtimeFacts: [], claims: [], receipts: [], resources: null,
    limitations: ['A fresh export does not refresh old authority timestamps.', 'Per-session runtime files and live process/auth facts must be reconciled by the existing controller.', 'Complex path globs require the established path-overlap checker.'],
  };
}

const PREVENTIONS = Object.freeze({
  SHA_MISMATCH: 'Bind a completion claim to receipts for the exact full source SHA.',
  ENVIRONMENT_MISMATCH: 'Keep local, staging and production verification in separate evidence records.',
  DEPLOYMENT_MISMATCH: 'Record the deployment before and after a browser journey and reject mixed-deployment proof.',
  FAILURE_UNIDENTIFIED: 'Capture complete test artifacts, scope and exit status before publishing a result.',
  SOURCE_STALE: 'Read the current authority snapshot before planning a handoff.',
  RUNTIME_UNVERIFIED: 'Distinguish assignment, authenticated access and observed running state.',
  OWNERSHIP_CONFLICT: 'Use the existing ownership controller for explicit handoff before concurrent writes.',
  HEAVY_SLOT_CONFLICT: 'Use one centrally observed heavy-job allocation across worktrees.',
  DONE_WITHOUT_EVIDENCE: 'Require milestone-specific evidence for completion rather than a generic done flag.',
});

export function proposeLessons(assessment, reviewedLessons = []) {
  const groups = new Map();
  for (const finding of list(assessment?.findings)) {
    if (!PREVENTIONS[finding.code]) continue;
    const key = `${finding.repo ?? 'factory'}:${finding.code}`;
    const group = groups.get(key) ?? [];
    group.push(finding); groups.set(key, group);
  }
  const proposals = [];
  for (const [key, findings] of groups) {
    const subjects = [...new Set(findings.map(f => f.subjectId))];
    if (subjects.length < 2) continue;
    const first = findings[0];
    const id = `lesson-${digest(key).slice(0, 16)}`;
    if (reviewedLessons.some(l => l?.id === id || (l?.triggerCode === first.code && l?.scope?.repo === (first.repo ?? 'factory')))) continue;
    proposals.push({ id, status: 'proposed', triggerCode: first.code, scope: { repo: first.repo ?? 'factory' },
      observation: `${subjects.length} distinct subjects share this evidence finding; recurrence is not a verified root cause.`,
      verifiedCause: null, prevention: PREVENTIONS[first.code], evidenceIds: [...new Set(findings.flatMap(f => f.evidenceIds))],
      regressionCaseIds: [], requiresIndependentReview: true, authorityChange: false, proposedAt: assessment.assessedAt,
    });
  }
  return proposals;
}

function metricsFor(results, total) {
  const metric = (population, predicate) => {
    const selected = results.filter(population), numerator = selected.filter(predicate).length;
    return { numerator, denominator: selected.length, rate: selected.length ? numerator / selected.length : null };
  };
  return {
    unsafeAcceptance: metric(c => c.expected !== 'supported', c => c.actual === 'supported'),
    falseBlock: metric(c => c.expected === 'supported', c => c.actual === 'unsupported'),
    uncertaintyHandling: metric(c => c.expected === 'unknown', c => c.actual === 'unknown'),
    supportedRecognition: metric(c => c.expected === 'supported', c => c.actual === 'supported'),
    accuracy: metric(() => true, c => c.actual === c.expected),
    coverage: { numerator: results.length, denominator: total, rate: total ? results.length / total : null },
  };
}

export function evaluate(cases, policy = {}, now) {
  const errors = [];
  if (!Array.isArray(cases) || cases.length === 0) return { valid: false, errors: ['No evaluation cases.'], results: [], metrics: {}, datasetHash: null };
  const ids = new Set(); const groups = new Map(); const results = [];
  for (const c of cases) {
    if (!object(c) || !str(c.id) || ids.has(c.id) || !str(c.incidentGroup) || !['development', 'holdout'].includes(c.split) || !['supported', 'unsupported', 'unknown'].includes(c.expected)) {
      errors.push(`Invalid or duplicate case: ${c?.id ?? 'unknown'}`); continue;
    }
    ids.add(c.id);
    if (groups.has(c.incidentGroup) && groups.get(c.incidentGroup) !== c.split) errors.push(`Incident group leaks across splits: ${c.incidentGroup}`);
    groups.set(c.incidentGroup, c.split);
    try {
      const report = assess(c.snapshot, policy, now ?? c.snapshot?.capturedAt);
      const actual = report.claims.find(claim => claim.id === c.claimId)?.verdict;
      if (!actual) { errors.push(`Case did not produce its claim: ${c.id}`); continue; }
      results.push({ id: c.id, incidentGroup: c.incidentGroup, split: c.split, expected: c.expected, actual, critical: c.critical === true });
    } catch { errors.push(`Case could not be evaluated: ${c.id}`); }
  }
  return { valid: errors.length === 0 && results.length === cases.length, errors, datasetHash: digest(cases),
    policyHash: digest(policyOf(policy)), results,
    metrics: metricsFor(results, cases.length) };
}

export function compareEvaluations(baseline, candidate) {
  const reasons = [];
  for (const [label, report] of [['Baseline', baseline], ['Candidate', candidate]]) {
    if (!object(report) || report.valid !== true || !Array.isArray(report.errors) || report.errors.length
      || !str(report.datasetHash) || !HASH.test(report.datasetHash) || !Array.isArray(report.results) || !report.results.length) {
      reasons.push(`${label} evaluation must be complete and valid.`); continue;
    }
    const ids = new Set(), groups = new Map();
    let shaped = true;
    for (const r of report.results) {
      if (!object(r) || !str(r.id) || ids.has(r.id) || !str(r.incidentGroup) || !['development', 'holdout'].includes(r.split)
        || !['supported', 'unsupported', 'unknown'].includes(r.expected) || !['supported', 'unsupported', 'unknown'].includes(r.actual)
        || typeof r.critical !== 'boolean') {
        shaped = false; reasons.push(`${label} has invalid or duplicate result records.`); continue;
      }
      ids.add(r.id);
      if (groups.has(r.incidentGroup) && groups.get(r.incidentGroup) !== r.split) reasons.push(`${label} leaks incident groups across evaluation splits.`);
      groups.set(r.incidentGroup, r.split);
    }
    if (shaped) {
      const computed = metricsFor(report.results, report.results.length);
      for (const [name, metric] of Object.entries(computed)) {
        const supplied = report.metrics?.[name];
        if (!object(supplied) || supplied.numerator !== metric.numerator || supplied.denominator !== metric.denominator || supplied.rate !== metric.rate) {
          reasons.push(`${label} ${name} metric does not match its actual case results.`);
        }
      }
    }
  }
  if (reasons.length) return { recommendation: 'reject', reasons: [...new Set(reasons)], automaticPromotion: false };
  if (!baseline?.datasetHash || baseline.datasetHash !== candidate?.datasetHash) reasons.push('Compare the same frozen dataset.');
  if (!list(candidate?.results).some(c => c.split === 'holdout')) reasons.push('A separate holdout set is required.');
  const a = baseline?.metrics, b = candidate?.metrics;
  const required = ['unsafeAcceptance', 'falseBlock', 'supportedRecognition', 'accuracy', 'coverage'];
  const metricValid = m => object(m) && Number.isInteger(m.numerator) && Number.isInteger(m.denominator)
    && m.denominator > 0 && m.numerator >= 0 && m.numerator <= m.denominator
    && Number.isFinite(m.rate) && Math.abs(m.rate - m.numerator / m.denominator) < 1e-12;
  if (!a || !b || required.some(k => !metricValid(a[k]) || !metricValid(b[k]))) reasons.push('Required metric populations are missing or invalid.');
  else {
    if (a.coverage.rate !== 1 || b.coverage.rate !== 1) reasons.push('Evaluation coverage must be complete.');
    if (b.unsafeAcceptance.rate > 0 || b.unsafeAcceptance.rate > a.unsafeAcceptance.rate) reasons.push('Unsafe acceptance must be zero and cannot regress.');
    if (b.falseBlock.rate > a.falseBlock.rate) reasons.push('False blocks regressed.');
    if (b.supportedRecognition.rate < a.supportedRecognition.rate) reasons.push('Supported-claim recognition regressed.');
    if (b.accuracy.rate <= a.accuracy.rate) reasons.push('No measured accuracy improvement on the frozen cases.');
  }
  const before = list(baseline?.results), after = list(candidate?.results);
  if (new Set(before.map(r => r?.id)).size !== before.length || new Set(after.map(r => r?.id)).size !== after.length
    || before.length !== after.length) reasons.push('Case IDs must be unique and identical across evaluations.');
  for (const result of list(candidate?.results)) {
    if (!object(result) || !str(result.id)) { reasons.push('Invalid result record.'); continue; }
    const prior = before.find(r => r?.id === result.id);
    if (!prior || prior.expected !== result.expected || prior.split !== result.split || prior.incidentGroup !== result.incidentGroup || prior.critical !== result.critical) {
      reasons.push(`Case identity or expectation changed: ${result.id}`);
      continue;
    }
    if (result.critical && result.actual !== result.expected) reasons.push(`Critical case failed: ${result.id}`);
    if (result.split === 'holdout' && prior.actual === prior.expected && result.actual !== result.expected) reasons.push(`Holdout case regressed: ${result.id}`);
  }
  return { recommendation: reasons.length ? 'reject' : 'review_candidate', reasons, automaticPromotion: false };
}
