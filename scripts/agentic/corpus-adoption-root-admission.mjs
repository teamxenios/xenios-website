// PRIVATE SOURCE PROPOSAL. No installed issuer, command line, filesystem or network.
// The ports below are executable server-owned capabilities, never HTTP/JSON input.
// In-process dependency injection is a trust boundary, not an identity authenticator.
import path from 'node:path';
import { canonical, contentHash } from './corpus-store.mjs';

export const ROOT_ADMISSION_PROTOCOL = 1;
export const ROOT_ADMISSION_LIMITS = Object.freeze({ milliseconds: 120000,
  observationAgeMs: 8000, writers: 10000, dataBytes: 5 * 1024 * 1024, depth: 32 });
// Identity patterns never coerce arrays, objects or other JSON primitives.
const textPattern = expression => Object.freeze({
  test(value) { return typeof value === 'string' && expression.test(value); }
});
const UUID = textPattern(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
const OID = textPattern(/^[a-f0-9]{40}$/);
const SHA = textPattern(/^[a-f0-9]{64}$/);
const SUBJECT_KEYS = ['schemaVersion', 'operation', 'planDigest', 'publicationId',
  'sourceCommit', 'recoveryId', 'authorityId', 'preimageSha256', 'runtimeNamespace',
  'barrier', 'writerInventorySha256', 'targets', 'paths'];
const PHASES = Object.freeze({ admission: ['before_filesystem'],
  before_filesystem: ['before_installation_custody'],
  before_installation_custody: ['before_dead_owner_recovery', 'before_binding'],
  before_dead_owner_recovery: ['before_binding'], before_binding: ['immediately_before_binding'],
  immediately_before_binding: ['before_trusted_read'], before_trusted_read: ['after_trusted_read'],
  after_trusted_read: [] });
function fail(code) { throw Object.assign(new Error(code), { code }); }
function need(value, code) { if (!value) fail(code); }
function record(value, keys, code = 'admission_shape') {
  need(value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), code);
  const own = Reflect.ownKeys(value); need(own.length === keys.length && keys.every(k => own.includes(k)), code);
  for (const key of own) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    need(typeof key === 'string' && d && 'value' in d && d.enumerable, code);
  }
  return value;
}
function data(value) {
  let nodes = 0;
  const visit = (v, depth) => {
    need(depth <= ROOT_ADMISSION_LIMITS.depth && ++nodes <= 200000, 'admission_data_bound');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') { need(Number.isSafeInteger(v), 'admission_data_number'); return; }
    if (typeof v === 'string') { need(v.length <= 32768 && !v.includes('\0'), 'admission_data_text'); return; }
    if (Array.isArray(v)) {
      need(Object.getPrototypeOf(v) === Array.prototype && v.length <= 10000
        && Reflect.ownKeys(v).length === v.length + 1, 'admission_data_array');
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i));
        need(d && 'value' in d && d.enumerable, 'admission_data_array'); visit(d.value, depth + 1);
      }
      return;
    }
    record(v, Object.keys(v));
    for (const key of Object.keys(v)) { need(!['__proto__', 'constructor', 'prototype'].includes(key), 'admission_data_key'); visit(v[key], depth + 1); }
  };
  visit(value, 0); const bytes = Buffer.from(canonical(value));
  need(bytes.length <= ROOT_ADMISSION_LIMITS.dataBytes, 'admission_data_bound');
  return JSON.parse(bytes.toString('utf8'));
}
function hash(value) { return contentHash(Buffer.from(canonical(value))); }
function same(a, b, code) { need(canonical(a) === canonical(b), code); }
function freeze(v) { if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
function ticks(value) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)\.(\d{3,7})Z$/.exec(value ?? '');
  need(m, 'admission_instant');
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number), t = new Date(0);
  t.setUTCFullYear(y, mo - 1, d); t.setUTCHours(h, mi, s, 0);
  need(y >= 1601 && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1
    && t.getUTCDate() === d && t.getUTCHours() === h && t.getUTCMinutes() === mi
    && t.getUTCSeconds() === s, 'admission_instant');
  return BigInt(t.getTime()) * 10000n + BigInt(m[7].padEnd(7, '0'));
}
function namespace(n) {
  record(n, ['platform', 'hostId', 'bootId', 'fileSystem']);
  need(n.platform === 'win32' && n.fileSystem === 'NTFS'
    && typeof n.hostId === 'string' && n.hostId.length > 0 && n.hostId.length <= 256, 'admission_namespace');
  ticks(n.bootId);
}
function barrier(b) { record(b, ['id', 'eventId', 'cutoff']); need(UUID.test(b.id) && typeof b.eventId === 'string'
  && b.eventId.length > 0 && b.eventId.length <= 512, 'admission_barrier'); ticks(b.cutoff); }
function subject(value) {
  const s = data(value); record(s, SUBJECT_KEYS, 'admission_subject_shape');
  need(s.schemaVersion === 1 && ['publish', 'resume'].includes(s.operation), 'admission_operation');
  need(UUID.test(s.publicationId) && UUID.test(s.authorityId) && OID.test(s.sourceCommit)
    && SHA.test(s.planDigest) && SHA.test(s.preimageSha256) && SHA.test(s.writerInventorySha256), 'admission_subject_identity');
  need(s.recoveryId === null || (s.operation === 'resume' && UUID.test(s.recoveryId)), 'admission_recovery');
  namespace(s.runtimeNamespace); barrier(s.barrier);
  need(ticks(s.runtimeNamespace.bootId) <= ticks(s.barrier.cutoff), 'admission_cutoff');
  record(s.targets, ['repoRoot', 'gitCommonDirectory', 'legacyRoot', 'futureRoot', 'futureParent', 'bindingPath', 'futureState', 'bindingState']);
  for (const key of ['repoRoot', 'gitCommonDirectory', 'legacyRoot', 'futureRoot', 'futureParent', 'bindingPath']) {
    const p = s.targets[key]; need(typeof p === 'string' && /^[A-Za-z]:\\/.test(p)
      && path.win32.normalize(p) === p && !p.includes('~'), 'admission_target');
  }
  need(s.targets.bindingPath === path.win32.join(s.targets.gitCommonDirectory, 'xenios-coordination', 'authority-binding.json')
    && s.targets.futureParent === path.win32.dirname(s.targets.futureRoot)
    && ['absent', 'empty'].includes(s.targets.futureState) && s.targets.bindingState === 'absent', 'admission_target');
  const dir = path.win32.dirname(s.targets.bindingPath);
  same(s.paths, { bindingDirectory: dir, lock: path.win32.join(dir, 'adoption-installation-lock'),
    journal: path.win32.join(dir, 'adoption-' + s.publicationId),
    preparedBinding: path.win32.join(dir, '.adoption-binding-' + s.publicationId + '.json') }, 'admission_derived_paths');
  return freeze(s);
}
function callable(value, code) { need(typeof value === 'function', code); return value; }
function lease(value) { record(value, ['renew'], 'admission_callable_lease_required'); return callable(value.renew, 'admission_callable_lease_required'); }

/**
 * Install ONLY in a reviewed server composition, never from request/config JSON.
 * Required fixed ports: issuerId, clock, openAction, openBarrier, openObservation.
 * Each open returns an opaque executable {renew(query)} lease, not a receipt.
 * Every barrier renewal returns per-writer executable verifiers. Their adapters
 * must authenticate actual primary deliveries or production PID+birth absence.
 * This module validates binding/freshness/coverage; it cannot implement those
 * external authentications or prove that the supplied inventory covers the world.
 * No such Root issuer/barrier adapter exists in preserved09c; wiring stays off.
 */
export function createRootAdmission(trustedPorts) {
  // Deliberately defer even inspecting a subject until installed ports exist.
  if (trustedPorts === undefined) return Object.freeze(() => fail('root_admission_ports_uninstalled'));
  record(trustedPorts, ['issuerId', 'clock', 'openAction', 'openBarrier', 'openObservation'], 'root_admission_ports_invalid');
  need(UUID.test(trustedPorts.issuerId), 'root_admission_issuer_binding');
  const issuerId = trustedPorts.issuerId, clock = callable(trustedPorts.clock, 'root_admission_ports_invalid');
  const openAction = callable(trustedPorts.openAction, 'root_admission_ports_invalid');
  const openBarrier = callable(trustedPorts.openBarrier, 'root_admission_ports_invalid');
  const openObservation = callable(trustedPorts.openObservation, 'root_admission_ports_invalid');
  let used = false;
  return Object.freeze(function admit(value) {
    need(!used, 'root_admission_invocation_spent'); used = true;
    const s = subject(value), digest = hash(s);
    let active = true, checking = false, priorPhase = null, first = null, previousClock = null, actionId = null;
    let renewAction, renewBarrier, renewObservation, request, recoveryOwnerSha256;
    function time() {
      const at = data(clock()); record(at, ['wallTime', 'monotonicMs']);
      need(Number.isSafeInteger(at.monotonicMs) && at.monotonicMs >= 0, 'admission_clock');
      const wall = ticks(at.wallTime);
      if (previousClock) need(at.monotonicMs >= previousClock.monotonicMs && wall >= previousClock.wall, 'admission_clock_regressed');
      if (!first) first = { wall, monotonicMs: at.monotonicMs };
      need(at.monotonicMs - first.monotonicMs <= ROOT_ADMISSION_LIMITS.milliseconds
        && wall - first.wall <= 1200000000n, 'admission_deadline');
      previousClock = { wall, monotonicMs: at.monotonicMs }; return { ...at, wall };
    }
    function freshness(row, now) {
      const checked = ticks(row.checkedAt), expires = ticks(row.expiresAt);
      need(checked <= now.wall && now.wall - checked <= 80000000n && expires > now.wall
        && expires <= first.wall + 1200000000n, 'admission_stale_or_expired');
    }
    function common(row, now) {
      need(row.protocol === 1 && row.scope === 'root-workflow' && row.subjectSha256 === digest, 'admission_untrusted_scope_or_subject');
      freshness(row, now);
    }
    function writers(inventory) {
      need(Array.isArray(inventory) && inventory.length > 0 && inventory.length <= ROOT_ADMISSION_LIMITS.writers, 'admission_writer_inventory');
      need(hash(inventory) === s.writerInventorySha256, 'admission_writer_set_changed');
      const ids = new Set();
      for (const w of inventory) {
        need(w && typeof w.id === 'string' && w.id && w.id.length <= 512 && !ids.has(w.id), 'admission_writer_inventory'); ids.add(w.id);
        for (const k of ['actor', 'kind', 'location']) need(typeof w[k] === 'string' && w[k] && w[k].length <= 2048, 'admission_writer_inventory');
      }
    }
    function validateProof(raw, writer, query, now) {
      const p = data(raw), held = p.kind === 'held_no_write';
      record(p, ['protocol', 'scope', 'subjectSha256', 'kind', 'channel', 'writerId', 'actor', 'barrier',
        'checkedAt', 'expiresAt', 'namespace', 'lastWriteAt', ...(held ? ['heldSince', 'receiptId', 'receiptSha256'] : ['pid', 'priorBirthId', 'found'])]);
      common(p, now); need(p.writerId === writer.id && p.actor === writer.actor, 'admission_writer_identity');
      same(p.barrier, s.barrier, 'admission_writer_barrier'); same(p.namespace, s.runtimeNamespace, 'admission_writer_namespace');
      need(ticks(p.lastWriteAt) <= ticks(s.barrier.cutoff) && ticks(p.lastWriteAt) >= ticks(s.runtimeNamespace.bootId), 'admission_late_writer');
      if (held) {
        need(p.channel === 'root-authenticated-primary', 'admission_hold_channel_unsupported');
        need(ticks(p.heldSince) <= ticks(s.barrier.cutoff) && ticks(p.heldSince) >= ticks(s.runtimeNamespace.bootId)
          && typeof p.receiptId === 'string' && p.receiptId.length > 0 && p.receiptId.length <= 512
          && SHA.test(p.receiptSha256), 'admission_hold_binding');
      } else {
        need(p.kind === 'stopped' && p.channel === 'production-process-birth-observer', 'admission_hold_channel_unsupported');
        need(Number.isSafeInteger(p.pid) && p.pid > 0 && p.pid === writer.pid && p.priorBirthId === writer.birthId
          && p.found === false && ticks(p.priorBirthId) >= ticks(s.runtimeNamespace.bootId)
          && ticks(p.priorBirthId) <= ticks(s.barrier.cutoff), 'admission_stopped_owner_unknown');
      }
      // query is passed only to trusted executable verifier; no returned JSON is
      // itself a primary/authentication proof and no observation is persisted.
      return p;
    }
    function check(phase, facts = null) {
      need(active, 'root_admission_capability_spent');
      if (checking) { active = false; fail('root_admission_renewal_refused'); }
      checking = true;
      try {
        need(phase === 'admission' ? priorPhase === null : PHASES[priorPhase]?.includes(phase), 'admission_phase_order');
        need(phase !== 'before_dead_owner_recovery' || (s.operation === 'resume' && UUID.test(s.recoveryId ?? '')), 'admission_recovery');
        const suppliedFacts = data(facts);
        if (suppliedFacts && phase !== 'before_dead_owner_recovery') {
          const n = Object.fromEntries(['platform', 'hostId', 'bootId', 'fileSystem'].map(k => [k, suppliedFacts[k]]));
          same(n, s.runtimeNamespace, 'admission_publisher_namespace');
        }
        if (phase === 'before_dead_owner_recovery') {
          record(suppliedFacts, ['currentOwner', 'previousOwner', 'previousOwnerSha256', 'actualAbsence']);
          const { currentOwner: current, previousOwner: previous, actualAbsence: absent } = suppliedFacts;
          need(SHA.test(suppliedFacts.previousOwnerSha256) && Number.isSafeInteger(current.pid) && current.pid > 0
            && Number.isSafeInteger(previous.pid) && previous.pid > 0 && current.pid !== previous.pid
            && absent.pid === previous.pid && absent.found === false && absent.birthId === null, 'admission_recovery_owner_unknown');
          for (const x of [current, absent]) same(Object.fromEntries(['platform', 'hostId', 'bootId', 'fileSystem'].map(k => [k, x[k]])), s.runtimeNamespace, 'admission_recovery_namespace');
          same(previous.namespace, s.runtimeNamespace, 'admission_recovery_namespace');
          for (const k of ['planDigest', 'publicationId', 'sourceCommit', 'authorityId']) need(previous[k] === s[k], 'admission_recovery_subject');
          same(previous.targets, s.targets, 'admission_recovery_subject');
          need(ticks(previous.birthId) >= ticks(s.runtimeNamespace.bootId)
            && ticks(current.birthId) >= ticks(s.runtimeNamespace.bootId), 'admission_recovery_owner_unknown');
        }
        const start = time(); need(ticks(s.barrier.cutoff) <= start.wall, 'admission_cutoff_future');
        if (phase === 'before_dead_owner_recovery') need(ticks(suppliedFacts.previousOwner.birthId) <= start.wall
          && ticks(suppliedFacts.currentOwner.birthId) <= start.wall, 'admission_recovery_owner_unknown');
        const query = freeze({ protocol: 1, issuerId, subject: s, subjectSha256: digest,
          phase, facts: suppliedFacts, wallTime: start.wallTime, monotonicMs: start.monotonicMs });
        const a = data(renewAction(query)); record(a, ['protocol', 'scope', 'subjectSha256', 'issuerId', 'actionId', 'state', 'checkedAt', 'expiresAt', 'recoveryOwnerSha256']);
        common(a, time()); need(a.issuerId === issuerId && UUID.test(a.actionId) && a.state === 'active', 'admission_action_revoked_or_unbound');
        need(s.recoveryId === null ? a.recoveryOwnerSha256 === null : SHA.test(a.recoveryOwnerSha256), 'admission_recovery_approval');
        if (actionId === null) { actionId = a.actionId; recoveryOwnerSha256 = a.recoveryOwnerSha256; }
        else need(a.actionId === actionId && a.recoveryOwnerSha256 === recoveryOwnerSha256, 'admission_action_changed');
        if (phase === 'before_dead_owner_recovery') need(a.recoveryOwnerSha256 === suppliedFacts.previousOwnerSha256, 'admission_recovery_approval');
        // Do not open even read-only observation/barrier leases until the
        // executable Root issuer has returned a current bound action.
        if (!renewObservation) renewObservation = lease(openObservation(request));
        const o = data(renewObservation(query)); record(o, ['protocol', 'scope', 'subjectSha256', 'checkedAt', 'expiresAt',
          'sourceCommit', 'planDigest', 'authorityId', 'preimageSha256', 'targets', 'runtimeNamespace', 'barrier', 'writerInventory']);
        common(o, time());
        for (const k of ['sourceCommit', 'planDigest', 'authorityId', 'preimageSha256']) need(o[k] === s[k], 'admission_observed_subject_changed');
        same(o.targets, s.targets, 'admission_observed_targets_changed'); same(o.runtimeNamespace, s.runtimeNamespace, 'admission_observed_namespace_changed');
        same(o.barrier, s.barrier, 'admission_observed_barrier_changed'); writers(o.writerInventory);
        if (!renewBarrier) renewBarrier = lease(openBarrier(request));
        const br = renewBarrier(query);
        record(br, ['protocol', 'scope', 'subjectSha256', 'checkedAt', 'expiresAt', 'barrier', 'writerInventory', 'writers']);
        const b = data(Object.fromEntries(Object.entries(br).filter(([k]) => k !== 'writers')));
        common(b, time()); same(b.barrier, s.barrier, 'admission_barrier_changed'); writers(b.writerInventory);
        same(b.writerInventory, o.writerInventory, 'admission_writer_set_changed');
        need(Array.isArray(br.writers) && br.writers.length === o.writerInventory.length, 'admission_writer_coverage');
        const verifierRows = br.writers.map(row => {
          record(row, ['id', 'verify'], 'admission_writer_callable_required');
          return { id: row.id, verify: callable(row.verify, 'admission_writer_callable_required') };
        });
        const observedWriters = new Map(o.writerInventory.map(w => [w.id, w]));
        const seen = new Set(), proofs = [];
        for (const row of verifierRows) {
          need(typeof row.id === 'string' && !seen.has(row.id), 'admission_writer_coverage'); seen.add(row.id);
          const w = observedWriters.get(row.id); need(w, 'admission_writer_coverage');
          proofs.push(validateProof(callable(row.verify, 'admission_writer_callable_required')(query), w, query, time()));
        }
        need(seen.size === o.writerInventory.length, 'admission_writer_coverage');
        const end = time();
        // Slow ports cannot renew at their old query time: all observations must
        // still be current at return. No widening the publisher's120s/8s bounds.
        for (const row of [a, o, b, ...proofs]) freshness(row, end);
        need(end.monotonicMs - start.monotonicMs <= ROOT_ADMISSION_LIMITS.observationAgeMs, 'admission_renewal_too_slow');
        need(active, 'root_admission_capability_spent'); priorPhase = phase;
        if (phase === 'after_trusted_read') active = false;
        return undefined;
      } catch { active = false; fail('root_admission_renewal_refused'); }
      finally { checking = false; }
    }
    try {
      time(); // Include opening trusted leases in the same nonextensible budget.
      request = freeze({ protocol: 1, issuerId, subject: s, subjectSha256: digest });
      renewAction = lease(openAction(request)); check('admission');
    } catch { active = false; fail('root_admission_refused'); }
    return Object.freeze({ scope: 'root-workflow', recheck(value) {
      try {
        record(value, [...SUBJECT_KEYS, 'phase', 'facts'], 'admission_recheck_shape');
        same(data(Object.fromEntries(SUBJECT_KEYS.map(k => [k, value[k]]))), s, 'admission_subject_changed');
        return check(value.phase, value.facts);
      } catch { active = false; fail('root_admission_renewal_refused'); }
    } });
  });
}
