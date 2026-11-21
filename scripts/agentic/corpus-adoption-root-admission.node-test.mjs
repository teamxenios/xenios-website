// AUTHORED / UNRUN. Executable fixtures model trusted ports; they are not a
// real Root issuer, primary-delivery verifier, writer barrier or local observer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { canonical, contentHash } from './corpus-store.mjs';
import { publish } from './corpus-adoption-publication.mjs';
import { createRootAdmission } from './corpus-adoption-root-admission.mjs';
const clone = x => structuredClone(x);
const hash = x => contentHash(Buffer.from(canonical(x)));
const UUID = '11111111-1111-4111-8111-111111111111';
const ISSUER = '22222222-2222-4222-8222-222222222222';
const ACTION = '33333333-3333-4333-8333-333333333333';
const ordinary = ['before_filesystem', 'before_installation_custody', 'before_binding',
  'immediately_before_binding', 'before_trusted_read', 'after_trusted_read'];
function fixture() {
  const inventory = [
    { id: 'held-writer', actor: 'fixture-codex', kind: 'native', location: 'owned-fixture-a' },
    { id: 'stopped-writer', actor: 'fixture-claude', kind: 'native', location: 'owned-fixture-b',
      pid: 42, birthId: '2026-11-21T10:01:00.0000000Z' }];
  const targets = { repoRoot: 'C:\\fixture\\repo', gitCommonDirectory: 'C:\\fixture\\git',
    legacyRoot: 'C:\\fixture\\legacy', futureRoot: 'C:\\fixture\\future\\corpus',
    futureParent: 'C:\\fixture\\future', bindingPath: 'C:\\fixture\\git\\xenios-coordination\\authority-binding.json',
    futureState: 'absent', bindingState: 'absent' };
  const directory = path.win32.dirname(targets.bindingPath);
  const subject = { schemaVersion: 1, operation: 'publish', planDigest: 'a'.repeat(64),
    publicationId: UUID, sourceCommit: 'b'.repeat(40), recoveryId: null, authorityId: ISSUER,
    preimageSha256: 'c'.repeat(64), runtimeNamespace: { platform: 'win32', hostId: 'owned-synthetic-host',
      bootId: '2026-11-21T10:00:00.0000000Z', fileSystem: 'NTFS' },
    barrier: { id: ACTION, eventId: 'fixture-cutoff', cutoff: '2026-11-21T11:59:00.0000000Z' },
    writerInventorySha256: hash(inventory), targets,
    paths: { bindingDirectory: directory, lock: path.win32.join(directory, 'adoption-installation-lock'),
      journal: path.win32.join(directory, 'adoption-' + UUID),
      preparedBinding: path.win32.join(directory, '.adoption-binding-' + UUID + '.json') } };
  const f = { subject, inventory, now: Date.parse('2026-11-21T12:00:00.000Z'), mono: 100,
    calls: [], hooks: {}, actionId: ACTION };
  const apply = (kind, value, q) => f.hooks[kind] ? f.hooks[kind](value, q) : value;
  const common = q => ({ protocol: 1, scope: 'root-workflow', subjectSha256: q.subjectSha256,
    checkedAt: new Date(f.now).toISOString(), expiresAt: new Date(f.now + 60000).toISOString() });
  function proof(writer, q) {
    const value = { ...common(q), writerId: writer.id, actor: writer.actor, barrier: clone(subject.barrier),
      namespace: clone(subject.runtimeNamespace), lastWriteAt: '2026-11-21T11:58:00.000Z' };
    if (writer.id === 'held-writer') Object.assign(value, { kind: 'held_no_write',
      channel: 'root-authenticated-primary', heldSince: '2026-11-21T11:58:30.000Z',
      receiptId: 'fixture-primary-never-live', receiptSha256: 'd'.repeat(64) });
    else Object.assign(value, { kind: 'stopped', channel: 'production-process-birth-observer',
      pid: writer.pid, priorBirthId: writer.birthId, found: false });
    f.calls.push(['proof', q.phase, writer.id]); return apply('proof', value, q);
  }
  f.ports = { issuerId: ISSUER,
    clock() { return apply('clock', { wallTime: new Date(f.now).toISOString(), monotonicMs: f.mono }); },
    openAction(request) { f.calls.push(['openAction']); return { renew(q) {
      assert.equal(q.subjectSha256, request.subjectSha256); f.calls.push(['action', q.phase]);
      return apply('action', { ...common(q), issuerId: ISSUER, actionId: f.actionId, state: 'active', recoveryOwnerSha256: subject.recoveryId === null ? null : 'e'.repeat(64) }, q);
    } }; },
    openObservation(request) { f.calls.push(['openObservation']); return { renew(q) {
      assert.equal(q.subjectSha256, request.subjectSha256); f.calls.push(['observation', q.phase]);
      return apply('observation', { ...common(q), sourceCommit: subject.sourceCommit,
        planDigest: subject.planDigest, authorityId: subject.authorityId, preimageSha256: subject.preimageSha256,
        targets: clone(subject.targets), runtimeNamespace: clone(subject.runtimeNamespace),
        barrier: clone(subject.barrier), writerInventory: clone(f.inventory) }, q);
    } }; },
    openBarrier(request) { f.calls.push(['openBarrier']); return { renew(q) {
      assert.equal(q.subjectSha256, request.subjectSha256); f.calls.push(['barrier', q.phase]);
      return apply('barrier', { ...common(q), barrier: clone(subject.barrier), writerInventory: clone(f.inventory),
        writers: f.inventory.map(w => ({ id: w.id, verify: () => proof(w, q) })) }, q);
    } }; } };
  f.admit = () => createRootAdmission(f.ports)(f.subject);
  f.check = (cap, phase, changed = {}) => cap.recheck({ ...clone(f.subject), phase, facts: null, ...changed });
  return f;
}
function refused(f, kind, mutate) {
  f.hooks[kind] = mutate; assert.throws(() => f.admit(), { code: 'root_admission_refused' });
}
function renewalRefused(f, kind, mutate) {
  const cap = f.admit(); f.hooks[kind] = mutate;
  assert.throws(() => f.check(cap, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
  delete f.hooks[kind];
  assert.throws(() => f.check(cap, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
}

test('default missing ports refuses without inspecting a subject or doing filesystem IO', async t => {
  const spies = ['mkdirSync', 'openSync', 'writeFileSync', 'readFileSync', 'lstatSync'].map(name =>
    t.mock.method(fs, name, () => { throw new Error('UNEXPECTED_FIXTURE_IO'); }));
  let reads = 0; const hostile = { get planDigest() { reads++; throw new Error('PRIVATE_SENTINEL'); } };
  assert.throws(() => createRootAdmission()(hostile), { code: 'root_admission_ports_uninstalled' });
  await assert.rejects(publish(null), { code: 'trusted_action_port_required' });
  assert.equal(reads, 0); assert(spies.every(spy => spy.mock.callCount() === 0));
});
test('JSON booleans role labels and copied action records cannot install trusted ports', () => {
  for (const value of [true, { role: 'Root' }, { scope: 'root-workflow', authenticated: true },
    JSON.parse('{"issuerId":"' + ISSUER + '","clock":true,"openAction":{},"openBarrier":{},"openObservation":{}}')]) {
    assert.throws(() => createRootAdmission(value));
  }
});
test('positive executable fixture renews every real publisher phase without mutating subjects', () => {
  const f = fixture(), original = canonical(f.subject), cap = f.admit();
  assert.equal(cap.scope, 'root-workflow'); assert(Object.isFrozen(cap));
  for (const phase of ordinary) assert.equal(f.check(cap, phase), undefined);
  for (const kind of ['action', 'observation', 'barrier']) assert.deepEqual(f.calls.filter(x => x[0] === kind).map(x => x[1]), ['admission', ...ordinary]);
  assert.equal(f.calls.filter(x => x[0] === 'proof').length, 14);
  assert.equal(canonical(f.subject), original);
  assert.throws(() => f.check(cap, 'after_trusted_read'), { code: 'root_admission_renewal_refused' });
});
test('one issuer closure cannot authorize two publication invocations', () => {
  const f = fixture(), admit = createRootAdmission(f.ports); admit(f.subject);
  assert.throws(() => admit(f.subject), { code: 'root_admission_invocation_spent' });
});
test('copied JSON lease has no executable renewal capability', () => {
  const f = fixture(); f.ports.openAction = () => ({ renew: 'copied-ACK' }); assert.throws(() => f.admit(), { code: 'root_admission_refused' });
});
test('owned fixture capability is never promoted to root workflow scope', () => {
  refused(fixture(), 'action', a => ({ ...a, scope: 'owned-fixture-only' }));
});
test('revoked Root action refuses initial admission', () => {
  const f = fixture(); refused(f, 'action', a => ({ ...a, state: 'revoked' }));
  assert.equal(f.calls.some(x => ['openBarrier', 'openObservation'].includes(x[0])), false);
});
test('expired action refuses and cannot be refreshed by copying its original record', () => {
  refused(fixture(), 'action', a => ({ ...a, expiresAt: a.checkedAt }));
});
test('Root action revocation at a later phase permanently spends the capability', () => {
  renewalRefused(fixture(), 'action', a => ({ ...a, state: 'revoked' }));
});
test('issuer and immutable action identity must remain bound', () => {
  const f = fixture(); renewalRefused(f, 'action', a => ({ ...a, issuerId: UUID }));
  const g = fixture(), cap = g.admit(); g.actionId = UUID;
  assert.throws(() => g.check(cap, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
});
test('changed plan publication authority and source in a recheck refuse before port calls', () => {
  for (const [key, value] of [['planDigest', 'e'.repeat(64)], ['publicationId', ACTION],
    ['authorityId', UUID], ['sourceCommit', 'f'.repeat(40)]]) {
    const f = fixture(), cap = f.admit(), count = f.calls.length;
    assert.throws(() => f.check(cap, 'before_filesystem', { [key]: value }), { code: 'root_admission_renewal_refused' });
    assert.equal(f.calls.length, count);
  }
});
test('changed preimage in observation refuses renewal', () => {
  renewalRefused(fixture(), 'observation', o => ({ ...o, preimageSha256: 'e'.repeat(64) }));
});
test('changed target and derived publication path cannot reuse an approved subject', () => {
  const f = fixture(), cap = f.admit(), changed = clone(f.subject.targets); changed.futureRoot += '-different';
  assert.throws(() => f.check(cap, 'before_filesystem', { targets: changed }), { code: 'root_admission_renewal_refused' });
  const g = fixture(); g.subject.paths.lock += '-other'; assert.throws(() => g.admit());
});
test('actual target drift from the trusted observer refuses', () => {
  renewalRefused(fixture(), 'observation', o => ({ ...o, targets: { ...o.targets, futureState: 'empty' } }));
});
test('namespace host and boot drift refuse even with the same plan digest', () => {
  renewalRefused(fixture(), 'observation', o => ({ ...o, runtimeNamespace: { ...o.runtimeNamespace, hostId: 'other-host' } }));
});
test('unsupported platform and filesystem never open issuer leases', () => {
  for (const [key, value] of [['platform', 'linux'], ['fileSystem', 'ReFS']]) {
    const f = fixture(); f.subject.runtimeNamespace[key] = value; assert.throws(() => f.admit()); assert.equal(f.calls.length, 0);
  }
});
test('changed current writer inventory detects a newly active writer', () => {
  const f = fixture(), cap = f.admit(); f.inventory.push({ id: 'late-new-writer', actor: 'other', kind: 'manual', location: 'other-worktree' });
  assert.throws(() => f.check(cap, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
});
test('unknown missing or duplicate writer verifier never counts as barrier coverage', () => {
  for (const mutate of [b => ({ ...b, writers: b.writers.slice(1) }),
    b => ({ ...b, writers: [b.writers[0], b.writers[0]] }),
    b => ({ ...b, writers: [{ id: 'foreign', verify() {} }, b.writers[1]] })]) refused(fixture(), 'barrier', mutate);
});
test('a copied writer ACK object is not an authenticated callable verifier', () => {
  refused(fixture(), 'barrier', b => ({ ...b, writers: b.writers.map(w => ({ id: w.id, verify: { held: true, role: 'Root' } })) }));
});
test('writer proof from an unsupported channel refuses even with a receipt hash', () => {
  refused(fixture(), 'proof', p => p.kind === 'held_no_write' ? { ...p, channel: 'copied-json-file' } : p);
});
test('late write or hold after the immutable cutoff refuses', () => {
  refused(fixture(), 'proof', p => ({ ...p, lastWriteAt: '2026-11-21T11:59:00.001Z' }));
  refused(fixture(), 'proof', p => p.kind === 'held_no_write' ? { ...p, heldSince: '2026-11-21T11:59:00.001Z' } : p);
});
test('barrier ID event and cutoff drift refuse fresh-looking receipts', () => {
  for (const [key, value] of [['id', UUID], ['eventId', 'different-event'], ['cutoff', '2026-11-21T11:58:00.000Z']]) {
    refused(fixture(), 'barrier', b => ({ ...b, barrier: { ...b.barrier, [key]: value } }));
  }
});
test('reused PID found true or changed birth never proves writer absence', () => {
  for (const mutate of [p => ({ ...p, found: true }), p => ({ ...p, priorBirthId: '2026-11-21T10:02:00.000Z' })]) {
    refused(fixture(), 'proof', p => p.kind === 'stopped' ? mutate(p) : p);
  }
});
test('wrong actor and wrong namespace in a callable writer proof refuse', () => {
  refused(fixture(), 'proof', p => ({ ...p, actor: 'another-actor' }));
  refused(fixture(), 'proof', p => ({ ...p, namespace: { ...p.namespace, bootId: '2026-11-21T09:00:00.000Z' } }));
});
test('stale or future observations and impossible calendar instants refuse', () => {
  for (const checkedAt of ['2026-11-21T11:59:51.999Z', '2026-11-21T12:00:00.001Z', '2026-02-30T12:00:00.000Z']) {
    refused(fixture(), 'observation', o => ({ ...o, checkedAt }));
  }
});
test('a future barrier cutoff never becomes valid through a fresh clock label', () => {
  const f = fixture(); f.subject.barrier.cutoff = '2026-11-21T12:00:00.001Z'; assert.throws(() => f.admit(), { code: 'root_admission_refused' });
});
test('failed renewal exceptions are sanitized and spend the capability', () => {
  renewalRefused(fixture(), 'barrier', () => { throw new Error('PRIVATE_SENTINEL'); });
});
test('async promises cannot masquerade as synchronous action and writer leases', () => {
  const f = fixture(); f.ports.openAction = async () => ({ renew() {} }); assert.throws(() => f.admit(), { code: 'root_admission_refused' });
  refused(fixture(), 'proof', async p => p);
});
test('closed observations reject arbitrary fields without returning them', () => {
  const f = fixture(); f.hooks.observation = o => ({ ...o, unexpected: 'PRIVATE_SENTINEL' });
  assert.throws(() => f.admit(), e => e.code === 'root_admission_refused' && e.message === 'root_admission_refused' && !Object.hasOwn(e, 'unexpected'));
});
test('clock regression and expired total budget cannot renew an invocation', () => {
  const f = fixture(), cap = f.admit(); f.mono--; assert.throws(() => f.check(cap, 'before_filesystem'));
  const g = fixture(), other = g.admit(); g.now += 120001; g.mono += 120001;
  assert.throws(() => g.check(other, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
});
test('writer proof expiry during synchronous port work is checked at return', () => {
  const f = fixture(); f.hooks.proof = p => {
    const result = { ...p, expiresAt: new Date(f.now + 1).toISOString() };
    if (p.kind === 'stopped') { f.now += 2; f.mono += 2; } return result;
  };
  assert.throws(() => f.admit(), { code: 'root_admission_refused' });
});
test('slow renewal cannot manufacture freshness from its start timestamp', () => {
  const f = fixture(); f.hooks.barrier = b => { f.now += 8001; f.mono += 8001; return b; };
  assert.throws(() => f.admit(), { code: 'root_admission_refused' });
});
test('phase replay and skipped binding boundary refuse permanently', () => {
  const f = fixture(), cap = f.admit(); f.check(cap, 'before_filesystem');
  assert.throws(() => f.check(cap, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
  const g = fixture(), other = g.admit(); assert.throws(() => g.check(other, 'immediately_before_binding'), { code: 'root_admission_renewal_refused' });
});
test('resume recovery is separately bound and renewed without granting seat control', () => {
  const f = fixture(); f.subject.operation = 'resume'; f.subject.recoveryId = UUID; const cap = f.admit();
  for (const phase of ['before_filesystem', 'before_installation_custody', 'before_dead_owner_recovery',
    'before_binding', 'immediately_before_binding', 'before_trusted_read', 'after_trusted_read']) f.check(cap, phase, phase === 'before_dead_owner_recovery' ? { facts: recoveryFacts(f) } : {});
  assert(f.calls.some(x => x[0] === 'action' && x[1] === 'before_dead_owner_recovery'));
  assert.deepEqual(Object.keys(cap).sort(), ['recheck', 'scope']);
});
test('publish cannot gain dead-owner recovery from a phase label', () => {
  const f = fixture(), cap = f.admit(); f.check(cap, 'before_filesystem'); f.check(cap, 'before_installation_custody');
  assert.throws(() => f.check(cap, 'before_dead_owner_recovery'), { code: 'root_admission_renewal_refused' });
});
test('caller facts cannot silently substitute a different publisher namespace', () => {
  const f = fixture(), cap = f.admit();
  assert.throws(() => f.check(cap, 'before_filesystem', { facts: { ...f.subject.runtimeNamespace, hostId: 'foreign' } }), { code: 'root_admission_renewal_refused' });
});

test('mutating the issued verifier list cannot silently omit a required writer', () => {
  const f = fixture(); let issued = null;
  f.hooks.barrier = b => { issued = b; return b; };
  f.hooks.proof = p => { if (p.kind === 'held_no_write') issued.writers.pop(); return p; };
  const cap = f.admit();
  assert.equal(f.calls.filter(x => x[0] === 'proof').length, 2);
  assert.equal(cap.scope, 'root-workflow');
});
test('reentrant renewal cannot be swallowed to preserve an active capability', () => {
  const f = fixture(), cap = f.admit();
  f.hooks.action = a => { try { f.check(cap, 'before_filesystem'); } catch { /* Simulate a hostile adapter swallowing the refusal. */ } return a; };
  assert.throws(() => f.check(cap, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
});

test('fresh observations made during real advancing port work are judged at their return time', () => {
  const f = fixture();
  const advance = value => { f.now++; f.mono++; return { ...value, checkedAt: new Date(f.now).toISOString() }; };
  for (const kind of ['action', 'observation', 'barrier', 'proof']) f.hooks[kind] = advance;
  const cap = f.admit();
  for (const phase of ordinary) assert.equal(f.check(cap, phase), undefined);
});

function recoveryFacts(f) {
  const s = f.subject;
  return { currentOwner: { ...clone(s.runtimeNamespace), pid: 43, birthId: '2026-11-21T11:00:00.000Z' },
    previousOwner: { namespace: clone(s.runtimeNamespace), pid: 41, birthId: '2026-11-21T10:01:00.000Z',
      planDigest: s.planDigest, publicationId: s.publicationId, sourceCommit: s.sourceCommit,
      authorityId: s.authorityId, targets: clone(s.targets) },
    previousOwnerSha256: 'e'.repeat(64),
    actualAbsence: { ...clone(s.runtimeNamespace), pid: 41, birthId: null, found: false } };
}
test('dead-owner recovery requires actual namespace-bound absence and the approved previous-owner hash', () => {
  for (const mutate of [facts => ({ ...facts, actualAbsence: { ...facts.actualAbsence, found: true } }),
    facts => ({ ...facts, previousOwnerSha256: 'f'.repeat(64) }), facts => null]) {
    const f = fixture(); f.subject.operation = 'resume'; f.subject.recoveryId = UUID; const cap = f.admit();
    f.check(cap, 'before_filesystem'); f.check(cap, 'before_installation_custody');
    assert.throws(() => f.check(cap, 'before_dead_owner_recovery', { facts: mutate(recoveryFacts(f)) }), { code: 'root_admission_renewal_refused' });
  }
});
test('Root recovery approval cannot silently change while its action ID remains constant', () => {
  const f = fixture(); f.subject.operation = 'resume'; f.subject.recoveryId = UUID;
  renewalRefused(f, 'action', a => ({ ...a, recoveryOwnerSha256: 'f'.repeat(64) }));
});

test('an installation owner born after writer cutoff is distinct from a late legacy writer', () => {
  const f = fixture(); f.subject.operation = 'resume'; f.subject.recoveryId = UUID; const cap = f.admit();
  f.check(cap, 'before_filesystem'); f.check(cap, 'before_installation_custody');
  const facts = recoveryFacts(f); facts.previousOwner.birthId = '2026-11-21T11:59:30.000Z';
  assert.equal(f.check(cap, 'before_dead_owner_recovery', { facts }), undefined);
});

test('array UUID publication identity refuses before any Root lease opens', () => {
  const f = fixture(); f.subject.publicationId = [UUID];
  // The original derived strings are deliberately retained: array-to-string
  // coercion would otherwise produce the same journal/prepared-binding paths.
  assert.throws(() => f.admit(), { code: 'admission_subject_identity' });
  assert.deepEqual(f.calls, []);
});
test('array SHA held receipt refuses renewal and permanently spends the capability', () => {
  const f = fixture(), cap = f.admit();
  f.hooks.proof = p => p.kind === 'held_no_write' ? { ...p, receiptSha256: [p.receiptSha256] } : p;
  assert.throws(() => f.check(cap, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
  delete f.hooks.proof;
  assert.throws(() => f.check(cap, 'before_filesystem'), { code: 'root_admission_renewal_refused' });
});
