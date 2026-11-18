import { createHash } from 'node:crypto';
import { assess, normalizeRegistries } from '../agentic/factory-assurance/factory-assurance.mjs';
import { summarizeNativeObservationExport, NATIVE_EXPORTER_SCHEMA_SHA } from './native-observation-summary.mjs';

export const FACTORY_ASSURANCE_PATH = '/api/factory/assurance';
export const MAX_FACTORY_EXPORT_BYTES = 1024 * 1024;
const MAX_RECORDS = 512, DISPLAY_LIMIT = 100;
const FILES = ['ACTIVE_TASKS', 'CODE_OWNERSHIP', 'SESSION_REGISTRY'];
const STATES = new Set(['supported', 'unsupported', 'unknown']);
const REASONS = new Set(['export_not_configured', 'export_unavailable', 'recovery_required']);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const id = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(x) ? x : null;
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
function instant(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_INSTANT.exec(value);
  if (!match || match[0] !== value) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Date.parse normalizes some impossible dates and 24:00 to the next day.
  // Validate the written local calendar, clock and numeric offset first.
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || hour > 23 || minute > 59 || second > 59
    || Number(match[9] ?? 0) > 23 || Number(match[10] ?? 0) > 59) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}
const code = x => typeof x === 'string' && /^[A-Z][A-Z_]{0,79}$/.test(x) ? x : 'INVALID_INPUT';
function exactKeys(x, keys) {
  return object(x) && Object.keys(x).length === keys.length && Object.keys(x).every(k => keys.includes(k));
}

/** Fixed server-owned port. Root must replace this only after exporter adoption.
 * No directory fallback, repair, controller bootstrap or task-state inference. */
export async function unavailablePublishedExportSource() {
  return { kind: 'unavailable', reason: 'export_not_configured' };
}

function unavailable(reason, assessedAt) {
  return { schemaVersion: 1, mode: 'advisory', authority: 'none', availability: 'unavailable',
    reason, assessedAt, source: null, counts: null, claims: [], runtime: [], findings: [], native: null };
}

function parsePublication(publication, now) {
  if (!exactKeys(publication, ['schemaVersion', 'qualification', 'controllerId', 'controllerRevision',
    'controllerSourceSha', 'capturedAt', 'publishedAt', 'registryFiles', 'evidence', 'nativeObservation'])
    || publication.schemaVersion !== 1 || publication.qualification !== 'qualified_coherent_export_v1'
    || !id(publication.controllerId) || !Number.isSafeInteger(publication.controllerRevision) || publication.controllerRevision < 1
    || !/^[a-f0-9]{40}$/.test(publication.controllerSourceSha ?? '')
    || !instant(publication.capturedAt) || !instant(publication.publishedAt)
    || Date.parse(publication.publishedAt) < Date.parse(publication.capturedAt)
    || Date.parse(publication.publishedAt) > Date.parse(now) + 30_000
    || !exactKeys(publication.registryFiles, FILES)
    || !exactKeys(publication.evidence, ['claims', 'receipts', 'runtimeFacts'])) throw Error('invalid_export');
  let bytes = 0;
  const registries = [], hashes = [];
  for (const name of FILES) {
    const file = publication.registryFiles[name];
    if (!exactKeys(file, ['utf8', 'sha256']) || typeof file.utf8 !== 'string'
      || !/^[a-f0-9]{64}$/.test(file.sha256 ?? '')) throw Error('invalid_export');
    bytes += Buffer.byteLength(file.utf8, 'utf8');
    if (bytes > MAX_FACTORY_EXPORT_BYTES || hash(file.utf8) !== file.sha256) throw Error('invalid_export');
    const value = JSON.parse(file.utf8.replace(/^\uFEFF/, ''));
    const key = { ACTIVE_TASKS: 'tasks', CODE_OWNERSHIP: 'leases', SESSION_REGISTRY: 'sessions' }[name];
    if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value[key]) || value[key].length > MAX_RECORDS) throw Error('invalid_export');
    registries.push(value); hashes.push(file.sha256);
  }
  for (const records of Object.values(publication.evidence)) {
    if (!Array.isArray(records) || records.length > MAX_RECORDS) throw Error('invalid_export');
  }
  if (publication.evidence.claims.some(claim => !object(claim) || !id(claim.id))) throw Error('invalid_export');
  bytes += Buffer.byteLength(JSON.stringify(publication.evidence), 'utf8');
  if (bytes > MAX_FACTORY_EXPORT_BYTES) throw Error('invalid_export');
  let activePaths = 0;
  for (const lease of registries[1].leases) {
    if (!object(lease) || !Array.isArray(lease.paths) || lease.paths.length > 64
      || lease.paths.some(p => typeof p !== 'string' || p.length > 256)) throw Error('invalid_export');
    if (lease.state === 'active') activePaths += lease.paths.length;
  }
  // Bound the pure assessor's pairwise overlap work, not just JSON size.
  if (activePaths > 512) throw Error('invalid_export');
  const normalized = normalizeRegistries({ activeTasks: registries[0], codeOwnership: registries[1],
    sessionRegistry: registries[2] }, publication.capturedAt);
  // Hash exact published bytes; preserve each valid original authority time.
  // Invalid times are unknown before assessment, not normalized by Date.parse.
  normalized.sources.forEach((source, i) => {
    source.sha256 = hashes[i];
    source.authoritativeAsOf = instant(source.authoritativeAsOf);
  });
  normalized.claims = publication.evidence.claims;
  normalized.receipts = publication.evidence.receipts;
  normalized.runtimeFacts = publication.evidence.runtimeFacts;
  return normalized;
}

function nativeProjection(input, now) {
  if (input === null) return { availability: 'unavailable', reason: 'native_export_not_supplied',
    currentAuthenticationState: null, nativeWorkerExecution: null };
  try {
    if (!exactKeys(input, ['utf8', 'observedAt', 'fileModifiedAt']) || !instant(input.observedAt)
      || Date.parse(input.observedAt) > Date.parse(now) + 30_000
      || input.fileModifiedAt !== null && !instant(input.fileModifiedAt)) throw Error();
    const summary = summarizeNativeObservationExport(input.utf8, { sourceSha: NATIVE_EXPORTER_SCHEMA_SHA });
    return { availability: 'observation_only', reason: null, observedAt: input.observedAt,
      fileModifiedAt: input.fileModifiedAt, schemaSourceSha: summary.source_schema_sha,
      inputSha256: summary.input_export_bytes_sha256, coverage: summary.coverage,
      timestampBasis: 'root_observations_not_execution_or_continuous_state',
      observations: summary.observations.slice(0, DISPLAY_LIMIT).map(row => ({
        task: row.task_context_only, seat: row.seat_context_only, reportedState: row.root_reported_state,
        firstObservedAt: row.first_root_observed_at, lastObservedAt: row.last_root_observed_at })),
      observationCount: summary.observations.length, truncated: summary.observations.length > DISPLAY_LIMIT,
      currentAuthenticationState: null, nativeWorkerExecution: null };
  } catch {
    return { availability: 'unavailable', reason: 'native_export_invalid',
      currentAuthenticationState: null, nativeWorkerExecution: null };
  }
}

function project(publication, snapshot, assessment, now) {
  const timestamps = snapshot.sources.map(row => row.authoritativeAsOf);
  const freshness = timestamps.some(at => !instant(at)) ? 'unknown'
    : timestamps.some(at => Date.parse(now) - Date.parse(at) > 1800_000 || Date.parse(at) > Date.parse(now) + 30_000)
      || Date.parse(now) - Date.parse(publication.capturedAt) > 1800_000 ? 'stale' : 'current';
  return { schemaVersion: 1, mode: 'advisory', authority: 'none', availability: 'published', reason: null,
    assessedAt: now, source: { controllerId: publication.controllerId, revision: publication.controllerRevision,
      sourceSha: publication.controllerSourceSha, capturedAt: publication.capturedAt,
      publishedAt: publication.publishedAt, freshness,
      registries: snapshot.sources.map(row => ({ name: row.name, sha256: row.sha256, authoritativeAsOf: instant(row.authoritativeAsOf) })) },
    assessmentStatus: assessment.status, counts: assessment.counts,
    claims: assessment.claims.slice(0, DISPLAY_LIMIT).map(row => ({ id: id(row.id),
      verdict: STATES.has(row.verdict) ? row.verdict : 'unknown', codes: row.codes.slice(0, 12).map(code), evidenceCount: row.evidenceIds.length })),
    claimCount: assessment.claims.length, claimsTruncated: assessment.claims.length > DISPLAY_LIMIT,
    runtime: assessment.runtime.slice(0, DISPLAY_LIMIT).map(row => ({ id: id(row.id),
      readiness: ['ready', 'blocked', 'unknown'].includes(row.readiness) ? row.readiness : 'unknown' })),
    runtimeCount: assessment.runtime.length, runtimeTruncated: assessment.runtime.length > DISPLAY_LIMIT,
    findings: assessment.findings.slice(0, DISPLAY_LIMIT).map(row => ({ code: code(row.code), subjectId: id(row.subjectId), evidenceCount: row.evidenceIds.length })),
    findingCount: assessment.findings.length, findingsTruncated: assessment.findings.length > DISPLAY_LIMIT,
    native: nativeProjection(publication.nativeObservation, now) };
}

/** Metadata checking is advisory; the trusted producer must verify publication
 * custody/coherence. A self-asserted JSON qualification string is not an issuer
 * authentication mechanism. This required port is never chosen by HTTP input. */
export function createFactoryAssuranceReader({ readPublishedExport, clock = () => new Date().toISOString(), timeoutMs = 1500 } = {}) {
  if (typeof readPublishedExport !== 'function' || typeof clock !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw Error('factory_source_port_required');
  let pending = null, sourceInFlight = null;
  return function read() {
    if (pending) return pending;
    pending = (async () => {
      const now = clock();
      if (!instant(now)) return unavailable('export_unavailable', null);
      // A producer that ignores abort must not accumulate behind repeated GETs.
      if (sourceInFlight) return unavailable('export_unavailable', now);
      const controller = new AbortController();
      let timer;
      try {
        const source = Promise.resolve().then(() => readPublishedExport({ signal: controller.signal }));
        sourceInFlight = source;
        source.then(() => { if (sourceInFlight === source) sourceInFlight = null; },
          () => { if (sourceInFlight === source) sourceInFlight = null; });
        const result = await Promise.race([
          source,
          new Promise(resolve => { timer = setTimeout(() => resolve({ kind: 'unavailable', reason: 'export_unavailable' }), timeoutMs); }),
        ]);
        if (result?.kind === 'unavailable') return unavailable(REASONS.has(result.reason) ? result.reason : 'export_unavailable', now);
        if (!exactKeys(result, ['kind', 'publication']) || result.kind !== 'published') return unavailable('export_invalid', now);
        const snapshot = parsePublication(result.publication, now);
        return project(result.publication, snapshot, assess(snapshot, {}, now), now);
      } catch {
        // Never echo an upstream exception, registry payload or provider text.
        return unavailable('export_invalid', now);
      } finally {
        clearTimeout(timer); controller.abort();
      }
    })().finally(() => { pending = null; });
    return pending;
  };
}
