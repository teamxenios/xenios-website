import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { contentHash, atomicTemporaryName } from './corpus-store.mjs';
import { SUBJECT, fixture, sourceReceipt, put, success, refusal, mutation, claim,
  ACTOR_A as A, ACTOR_B as B, TASK_A as TA, TASK_B as TB } from './coordination-qualification/candidate-fixture.mjs';

// Real CLI/process/filesystem tests. Run only with Root's exclusive allocation,
// pinned Node20.19 on Windows/local NTFS. Every corpus is synthetic and retained.
const report = { schemaVersion: 1, kind: 'candidate-qualification-not-live-adoption', runId: randomUUID(),
  startedAt: new Date().toISOString(), canonicalTaskId: 'FACTORY-COORDINATION-REPRO-20261118',
  canonicalAttemptId: null, cases: [] };
let definedCases = 0;
const immutable = {
  'io-gate-preload.cjs': '2705bff345450585b84492958016b5405155bbb605503182776896eb1e652e88',
  'harness.mjs': 'e97ad92e667abc1f325adb020eae5de07e546cacc02b686691922421f01629c1',
  'run.mjs': 'ea9e37b457f48455902cd949eaa04783bdd5beb78337d1f0a2479bb3d7d05d01',
  'coordination-contract.node-test.mjs': 'b5591ad154f5fcf20cdc64e92f9de884384b424587f841a9d489a6448b096ebb' };
before(() => {
  report.sourceBefore = sourceReceipt();
  report.baselineSource = Object.entries(immutable).map(([name, expected]) => {
    const rel = 'scripts/agentic/coordination-qualification/' + name;
    const bytes = execFileSync('git', ['cat-file', 'blob', 'HEAD:' + rel], { cwd: SUBJECT, windowsHide: true });
    assert.equal(contentHash(bytes), expected, 'Baseline executable changed: ' + name);
    return { file: rel, sha256: expected };
  });
});
after(() => {
  report.sourceAfter = sourceReceipt(); assert.deepEqual(report.sourceAfter.files, report.sourceBefore.files);
  report.finishedAt = new Date().toISOString(); report.definedCases = definedCases;
  report.allCasesPassed = report.cases.length === definedCases && definedCases > 0 && report.cases.every(value => value.result === 'PASS' && value.allOwnedChildrenExited);
  const destination = process.env.XENIOS_COORDINATION_CANDIDATE_RECEIPT || path.join(os.tmpdir(), 'xenios-coordination-candidate-' + report.runId + '.json');
  assert(path.isAbsolute(destination)); assert(!fs.existsSync(destination), 'Receipt must use a new destination');
  put(destination, report); console.log(JSON.stringify({ candidateReceipt: destination, allCasesPassed: report.allCasesPassed }));
});
function scenario(name, expected, callback, fixtureOptions = {}) {
  definedCases++;
  test(name, { concurrency: false, timeout: 180_000 }, async () => {
    const scope = fixture(name, fixtureOptions), record = { name, expected, fixtureRoot: scope.root, runId: scope.runId, result: 'RUNNING' };
    report.cases.push(record);
    try { await callback(scope); record.result = 'PASS'; }
    catch (error) { record.result = 'FAIL'; record.error = { name: error.name, message: error.message, actual: error.actual, expected: error.expected }; throw error; }
    finally { await scope.close(); record.processReceipt = path.join(scope.root, 'receipt.json'); record.allOwnedChildrenExited = scope.children.every(handle => handle.receipt.exited); }
  });
}
async function killAt(scope, args, gate, actor = 'crashed') {
  const child = scope.launch(args, { actor, gates: [gate] });
  await scope.waitEvent(actor, 'paused-' + gate); child.child.kill('SIGKILL'); await child.done;
  assert.equal(child.receipt.stdout, '', 'Crash cut must precede success ACK'); return child;
}
const validation = async scope => success(await scope.call(['validate']));
const leases = scope => scope.read('CODE_OWNERSHIP.json').leases.filter(item => item.state === 'active');
function oneClaim(scope, actor = A, task = TA) {
  const active = leases(scope), value = scope.read('ACTIVE_TASKS.json').tasks.find(item => item.id === task);
  assert.equal(active.length, 1); assert.equal(active[0].session, actor); assert.equal(active[0].task, task);
  assert.equal(value.state, 'claimed'); assert.equal(value.owner, actor); assert.equal(value.claimId, active[0].id); return value.claimId;
}
function transaction(scope) {
  const names = fs.readdirSync(path.join(scope.meta, 'transactions')); assert.equal(names.length, 1);
  return path.join(scope.meta, 'transactions', names[0]);
}

scenario('all seven writers, actual summary bytes, mirrors and replay', 'Eight commits; every writer/replay preserves exact relationships and no duplicate dynamic files.', async s => {
  const C = 'synthetic-worker-c', registration = mutation('register', C, 0, ['--tool', 'synthetic', '--lane', 'qualification', '--branch', 'synthetic']);
  const reg = success(await s.call(registration)); assert.equal(reg.coordination.revision, 1);
  assert.equal(success(await s.call(registration)).coordination.replayed, true);
  const started = s.read('sessions/' + C + '.json').startedAt;
  const heartbeat = mutation('heartbeat', C, 1, ['--note', 'observed']); success(await s.call(heartbeat)); success(await s.call(heartbeat));
  assert.equal(s.read('sessions/' + C + '.json').startedAt, started);
  assert.deepEqual(s.read('sessions/' + C + '.json'), s.read('SESSION_REGISTRY.json').sessions.find(item => item.id === C));
  success(await s.call(claim(A, TA, 2))); oneClaim(s);
  const summary = path.join(s.root, 'summary.md'), bytes = Buffer.from('Synthetic summary\r\nExact bytes.\n'); fs.writeFileSync(summary, bytes);
  const handoff = mutation('handoff', A, 3, ['--task', TA, '--sha', 'a'.repeat(40), '--summary', summary]);
  const handed = success(await s.call(handoff)); assert.equal(handed.task.handoff.contentSha256, contentHash(bytes));
  assert(fs.readFileSync(s.data(handed.task.handoff.file.slice('.xenios/'.length))).equals(bytes));
  success(await s.call(handoff)); fs.writeFileSync(summary, 'Changed bytes at same path'); refusal(await s.call(handoff), ['operation_identity_conflict']);
  assert.equal(fs.readdirSync(s.data('handoffs')).length, 1);
  success(await s.call(mutation('accept', B, 4, ['--task', TA, '--sha', 'a'.repeat(40)])));
  const message = mutation('message', A, 5, ['--to', B, '--text', 'Synthetic message']); success(await s.call(message)); success(await s.call(message));
  assert.equal(fs.readdirSync(s.data('messages')).length, 1);
  success(await s.call(claim(B, TB, 6))); success(await s.call(mutation('release', B, 7, ['--task', TB])));
  assert.equal(s.head().revision, 8); assert.equal(leases(s).length, 0);
  for (const args of [['status'], ['next'], ['stale', '--minutes', '1'], ['resume', '--session', A], ['export']]) assert.equal(success(await s.call(args)).coordination.revision, 8);
  await validation(s);
});

scenario('linked worktrees contend at the actual mutex', 'Observed B mutex attempt while A holds it; exactly one new ACK, same authority and no lost claim.', async s => {
  assert(!fs.existsSync(path.join(s.linked, '.xenios')), 'Linked checkout must not have its own corpus');
  const first = s.launch(claim(A, TA, 0), { actor: 'contender-a', gates: ['after-lock'] });
  await s.waitEvent('contender-a', 'paused-after-lock');
  const second = s.launch(claim(B, TB, 0), { actor: 'contender-b', cwd: s.linked }); await s.waitEvent('contender-b', 'mutex-attempt');
  s.release('contender-a', 'after-lock'); const a = success(await first.done); refusal(await second.done, ['coordination_revision_conflict', 'coordination_busy']);
  assert.equal([first, second].filter(handle => handle.receipt.exitCode === 0).length, 1);
  const id = oneClaim(s); assert.equal(s.head().revision, 1); assert.equal(a.coordination.authorityId, s.binding.authorityId);
  refusal(await s.call(claim(B, TB, 1), { cwd: s.linked }), ['path_conflict']); assert.equal(oneClaim(s), id);
  assert.equal((await validation(s)).coordination.authorityId, s.binding.authorityId);
});

scenario('pre-commit crash preserves prior state', 'No success before decision; read refuses pending intent; explicit recovery aborts intent without adding a transition.', async s => {
  const args = claim(A, TA, 0); await killAt(s, args, 'after-prepare');
  refusal(await s.call(['validate']), ['recovery_required']); assert.equal(s.head().revision, 0);
  success(await s.call(['recover'])); assert.equal(leases(s).length, 0); assert.equal(s.head().revision, 0);
  success(await s.call(args)); oneClaim(s); assert.equal(s.head().revision, 1); await validation(s);
});

for (const gate of ['after-commit', 'after-corpus-1', 'after-corpus-2', 'after-head', 'after-applied', 'before-ack']) {
  scenario('committed crash: ' + gate, 'Same committed operation/claim recovered or replayed at revision 1, zero new transitions and overlapping claim denied.', async s => {
    const args = claim(A, TA, 0); await killAt(s, args, gate);
    const before = await s.call(['validate']);
    if (['after-applied', 'before-ack'].includes(gate)) success(before); else refusal(before, ['recovery_required']);
    success(await s.call(['recover'])); const id = oneClaim(s); assert.equal(s.head().revision, 1);
    const replay = success(await s.call(args)); assert.equal(replay.coordination.replayed, true); assert.equal(replay.coordination.revision, 1);
    assert.equal(oneClaim(s), id); assert.equal(s.head().revision, 1);
    refusal(await s.call(claim(B, TB, 1)), ['path_conflict']); await validation(s);
  });
}

for (const kind of ['register', 'heartbeat', 'handoff', 'message']) scenario('dynamic-file crash recovery: ' + kind,
  'Actual aggregate/dynamic file transaction completes after process death; exact retry adds no mirror, handoff, message or revision.', async s => {
    const C = 'synthetic-worker-c'; let args, expectedRevision = 1;
    if (kind === 'register') args = mutation(kind, C, 0, ['--tool', 'synthetic', '--lane', 'qualification', '--branch', 'synthetic']);
    if (kind === 'heartbeat') args = mutation(kind, A, 0, ['--note', 'committed synthetic heartbeat']);
    if (kind === 'message') args = mutation(kind, A, 0, ['--to', B, '--text', 'Committed synthetic message']);
    if (kind === 'handoff') {
      success(await s.call(claim(A, TA, 0))); expectedRevision = 2;
      const summary = path.join(s.root, 'summary.md'); fs.writeFileSync(summary, 'Synthetic decided handoff\r\n');
      args = mutation(kind, A, 1, ['--task', TA, '--sha', 'a'.repeat(40), '--summary', summary]);
    }
    await killAt(s, args, kind === 'handoff' ? 'after-corpus-2' : 'after-corpus-1');
    refusal(await s.call(['validate']), ['recovery_required']); success(await s.call(['recover']));
    assert.equal(s.head().revision, expectedRevision); const replay = success(await s.call(args)); assert.equal(replay.coordination.replayed, true);
    assert.equal(s.head().revision, expectedRevision);
    if (kind === 'register' || kind === 'heartbeat') {
      const id = kind === 'register' ? C : A;
      assert.deepEqual(s.read('sessions/' + id + '.json'), s.read('SESSION_REGISTRY.json').sessions.find(item => item.id === id));
      if (kind === 'heartbeat') { assert.equal(s.read('sessions/' + A + '.json').note, 'committed synthetic heartbeat'); assert.equal(s.read('sessions/' + A + '.json').startedAt, '2026-11-18T00:00:00.000Z'); }
    }
    if (kind === 'handoff') { assert.equal(fs.readdirSync(s.data('handoffs')).length, 1); assert.equal(s.read('ACTIVE_TASKS.json').tasks[0].state, 'qa'); assert.equal(leases(s).length, 0); }
    if (kind === 'message') assert.equal(fs.readdirSync(s.data('messages')).length, 1);
    await validation(s);
  });

scenario('trusted reader during live partial materialization', 'Observed reader lock attempt returns unavailable while writer is held; it never accepts physical mixed state.', async s => {
  const writer = s.launch(claim(A, TA, 0), { actor: 'partial-writer', gates: ['after-corpus-1'] });
  await s.waitEvent('partial-writer', 'paused-after-corpus-1');
  const reader = s.launch(['export'], { actor: 'partial-reader', cwd: s.linked }); await s.waitEvent('partial-reader', 'mutex-attempt');
  refusal(await reader.done, ['coordination_busy']); writer.child.kill('SIGKILL'); await writer.done;
  refusal(await s.call(['export']), ['recovery_required']); success(await s.call(['recover'])); oneClaim(s); await validation(s);
});

scenario('interrupted recovery is idempotent', 'Recovery death after first real replacement still completes original decided revision and claim on the next recovery.', async s => {
  const args = claim(A, TA, 0); await killAt(s, args, 'after-commit');
  await killAt(s, ['recover'], 'after-corpus-1', 'recovery-crash');
  refusal(await s.call(['validate']), ['recovery_required']); success(await s.call(['recover'])); const id = oneClaim(s);
  success(await s.call(['recover'])); assert.equal(oneClaim(s), id); assert.equal(s.head().revision, 1);
  assert.equal(success(await s.call(args)).coordination.replayed, true);
});

scenario('operation identity conflicts and historical replay', 'Changed actor, command, task or expected revision refuses; historical claim replay cannot release a newer owner.', async s => {
  const operation = randomUUID(), args = claim(A, TA, 0, operation); success(await s.call(args));
  for (const altered of [claim(B, TB, 0, operation), claim(A, TB, 0, operation), claim(A, TA, 1, operation), mutation('message', A, 0, ['--text', 'changed'], operation)]) refusal(await s.call(altered), ['operation_identity_conflict']);
  success(await s.call(mutation('release', A, 1, ['--task', TA]))); success(await s.call(claim(B, TA, 2)));
  const id = oneClaim(s, B); const replay = success(await s.call(args)); assert.equal(replay.coordination.currentRevision, 3);
  assert.equal(replay.coordination.authority, 'historical_result_only_revalidate_current_claim');
  refusal(await s.call(mutation('release', A, 3, ['--task', TA])), ['current_claim_required']); assert.equal(oneClaim(s, B), id);
});

scenario('live blocked owner is never stolen', 'Live held owner stays intact despite synthetic old heartbeat; logical task leases are never reclaimed from process age.', async s => {
  const writer = s.launch(claim(A, TA, 0), { actor: 'live-owner', gates: ['after-lock'] }); await s.waitEvent('live-owner', 'paused-after-lock');
  const marker = fs.readdirSync(path.join(s.meta, 'mutex'))[0], bytes = fs.readFileSync(path.join(s.meta, 'mutex', marker));
  refusal(await s.call(claim(B, TB, 0), { cwd: s.linked }), ['coordination_busy']);
  assert(fs.readFileSync(path.join(s.meta, 'mutex', marker)).equals(bytes));
  s.release('live-owner', 'after-lock'); success(await writer.done); oneClaim(s);
});

scenario('process birth mismatch and unknown namespace', 'Actual live PID with different recorded birth proves old owner gone; unrecognized owner namespace refuses.', async s => {
  const mutex = path.join(s.meta, 'mutex'), token = randomUUID(); fs.mkdirSync(mutex);
  const ownerFile = path.join(mutex, 'owner-' + token + '.json'), owner = { protocol: 1, token, pid: process.pid,
    birthId: new Date(Date.parse(s.facts.birthId) - 1_000).toISOString(), namespace: s.binding.namespace };
  for (const changed of [{ namespace: { ...owner.namespace, bootId: 'unknown' } }, { birthId: 'unknown' }, { protocol: 2 }]) {
    put(ownerFile, { ...owner, ...changed }); refusal(await s.call(claim(A, TA, 0)), ['unknown_coordination_owner']); assert(fs.existsSync(ownerFile));
  }
  put(ownerFile, owner); success(await s.call(claim(A, TA, 0))); oneClaim(s);
});

scenario('two delayed dead-owner reclaimers preserve replacement mutex', 'Both observe the old dead token; delayed unlink cannot remove a different live replacement owner.', async s => {
  const dead = s.launch(claim(A, TA, 0), { actor: 'dead-owner', gates: ['after-lock'] }); await s.waitEvent('dead-owner', 'paused-after-lock'); dead.child.kill('SIGKILL'); await dead.done;
  const first = s.launch(claim(A, TA, 0), { actor: 'reclaimer-a', gates: ['before-owner-unlink', 'after-lock'] }); await s.waitEvent('reclaimer-a', 'paused-before-owner-unlink');
  const second = s.launch(claim(B, TB, 0), { actor: 'reclaimer-b', gates: ['before-owner-unlink'], cwd: s.linked }); await s.waitEvent('reclaimer-b', 'paused-before-owner-unlink');
  s.release('reclaimer-a', 'before-owner-unlink'); await s.waitEvent('reclaimer-a', 'paused-after-lock');
  const marker = fs.readdirSync(path.join(s.meta, 'mutex'))[0]; s.release('reclaimer-b', 'before-owner-unlink');
  refusal(await second.done, ['coordination_busy']); assert(fs.existsSync(path.join(s.meta, 'mutex', marker)));
  s.release('reclaimer-a', 'after-lock'); success(await first.done); oneClaim(s); assert.equal(s.head().revision, 1);
});

for (const stage of ['PREPARE', 'COMMIT']) scenario('corrupt ' + stage + ' refuses recovery', 'Malformed journal is preserved and never produces green validation or guessed rollback.', async s => {
  await killAt(s, claim(A, TA, 0), stage === 'PREPARE' ? 'after-prepare' : 'after-commit');
  const file = path.join(transaction(s), stage + '.json'); fs.writeFileSync(file, '{truncated');
  refusal(await s.call(['validate']), ['invalid_corpus_json']); refusal(await s.call(['recover']), ['invalid_corpus_json']);
  assert.equal(fs.readFileSync(file, 'utf8'), '{truncated'); assert.equal(s.head().revision, 0);
});

scenario('third-value canonical interference is preserved', 'Committed recovery rejects bytes outside recorded before/after values instead of overwriting external data.', async s => {
  await killAt(s, claim(A, TA, 0), 'after-corpus-1');
  const file = s.data('ACTIVE_TASKS.json'), value = s.read('ACTIVE_TASKS.json'); value.external = 'preserve-synthetic-interference'; put(file, value);
  const bytes = fs.readFileSync(file); refusal(await s.call(['recover']), ['recovery_file_interference']); assert(fs.readFileSync(file).equals(bytes));
  refusal(await s.call(['validate']), ['recovery_required']);
});

scenario('truthful validation catches indexed orphan and session drift', 'Even hash-indexed parseable JSON cannot hide a missing active lease or inconsistent individual session.', async s => {
  const original = fs.readFileSync(s.data('ACTIVE_TASKS.json')), board = s.read('ACTIVE_TASKS.json'); board.tasks[0] = { ...board.tasks[0], state: 'claimed', owner: A, claimId: randomUUID() }; put(s.data('ACTIVE_TASKS.json'), board);
  const head = s.head(); head.files['ACTIVE_TASKS.json'] = contentHash(fs.readFileSync(s.data('ACTIVE_TASKS.json'))); put(path.join(s.meta, 'HEAD.json'), head);
  refusal(await s.call(['validate']), ['orphan_or_mismatched_claim']);
  fs.writeFileSync(s.data('ACTIVE_TASKS.json'), original); head.files['ACTIVE_TASKS.json'] = contentHash(original);
  const rel = 'sessions/' + A + '.json', session = s.read(rel); session.note = 'synthetic drift'; put(s.data(rel), session); head.files[rel] = contentHash(fs.readFileSync(s.data(rel))); put(path.join(s.meta, 'HEAD.json'), head);
  refusal(await s.call(['validate']), ['session_mirror_mismatch']);
});

scenario('applied marker and receipt history are validated', 'APPLIED presence alone is insufficient; broken revision marker and missing committed history refuse trusted reads.', async s => {
  success(await s.call(claim(A, TA, 0))); const directory = transaction(s), marker = path.join(directory, 'APPLIED.json'), valid = fs.readFileSync(marker);
  put(marker, { protocol: 1, revision: 0, afterHeadSha256: '0'.repeat(64) }); refusal(await s.call(['validate']), ['invalid_applied_marker']);
  fs.writeFileSync(marker, valid); fs.renameSync(directory, path.join(s.meta, 'aborted', path.basename(directory)));
  refusal(await s.call(['validate']), ['missing_committed_history']);
});

scenario('recognized partial atomic remnant recovers', 'A prefix of a decided after-image at its exact temporary target is removed only under committed recovery.', async s => {
  await killAt(s, claim(A, TA, 0), 'after-commit');
  const prepared = JSON.parse(fs.readFileSync(path.join(transaction(s), 'PREPARE.json'), 'utf8'));
  const item = prepared.writes.find(value => value.area === 'corpus'), temporary = path.join(path.dirname(s.data(item.path)), atomicTemporaryName(path.basename(item.path), randomUUID()));
  fs.writeFileSync(temporary, Buffer.from(item.base64, 'base64').subarray(0, 17));
  refusal(await s.call(['validate']), ['recovery_required']); success(await s.call(['recover'])); assert(!fs.existsSync(temporary)); oneClaim(s); await validation(s);
});

scenario('binding and namespace failures have no fallback', 'Missing/unsupported binding, boot/host/filesystem mismatch and alternate clone refuse without new authority or corpus writes.', async s => {
  const bytes = fs.readFileSync(s.bindingFile); fs.unlinkSync(s.bindingFile);
  refusal(await s.call(claim(A, TA, 0)), ['authority_binding_required']); fs.writeFileSync(s.bindingFile, bytes);
  for (const change of [{ protocol: 2 }, { nodeVersion: 'unsupported' }, ...['hostId', 'bootId', 'fileSystem'].map(key => ({ namespace: { ...s.binding.namespace, [key]: 'unsupported' } }))]) {
    put(s.bindingFile, { ...s.binding, ...change }); refusal(await s.call(claim(A, TA, 0)), ['unsupported_authority_binding', 'unsupported_runtime_namespace']);
  }
  fs.writeFileSync(s.bindingFile, bytes); assert.equal(s.head().revision, 0); assert.equal(leases(s).length, 0); await validation(s);
  const alternate = path.join(s.root, 'alternate-clone');
  execFileSync('git', ['-c', 'core.hooksPath=' + path.join(s.root, 'empty-hooks'), '-c', 'init.templateDir=', '-c', 'core.fsmonitor=false',
    'clone', '--no-hardlinks', '--no-checkout', s.main, alternate], { cwd: s.root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  s.worktrees.push(alternate);
  const owner = JSON.parse(fs.readFileSync(path.join(s.root, 'fixture-owner.json'), 'utf8')); owner.worktrees = s.worktrees; put(path.join(s.root, 'fixture-owner.json'), owner);
  refusal(await s.call(claim(A, TA, 0), { cwd: alternate }), ['authority_binding_required']);
  assert(!fs.existsSync(path.join(alternate, '.xenios'))); assert.equal(s.head().revision, 0);
});

for (const [label, pathsA, pathsB] of [
  ['case', ['src/Shared.ts'], ['src/shared.ts']],
  ['dot segment', ['src/shared.ts'], ['src/./shared.ts']],
  ['backslash', ['src/shared.ts'], ['src\\shared.ts']],
  ['repeated separator', ['src/shared.ts'], ['src//shared.ts']],
  ['trailing file dot and space', ['src/shared.ts'], ['src/shared.ts. ']],
  ['trailing directory dot and space', ['src/shared.ts'], ['src. /shared.ts']],
  ['glob case', ['src/Shared/**'], ['SRC/shared/item.ts']],
]) scenario('Windows lease alias: ' + label,
  'Equivalent Windows paths conflict before COMMIT; refusal keeps the revision/head unchanged and the next ordinary heartbeat succeeds.', async s => {
    success(await s.call(claim(A, TA, 0))); const id = oneClaim(s), head = fs.readFileSync(path.join(s.meta, 'HEAD.json'));
    const transactions = fs.readdirSync(path.join(s.meta, 'transactions'));
    refusal(await s.call(claim(B, TB, 1)), ['path_conflict']); assert.equal(s.head().revision, 1);
    assert(fs.readFileSync(path.join(s.meta, 'HEAD.json')).equals(head)); assert.deepEqual(fs.readdirSync(path.join(s.meta, 'transactions')), transactions);
    success(await s.call(mutation('heartbeat', A, 1, ['--note', 'usable after alias refusal'])));
    assert.equal(s.head().revision, 2); assert.equal(oneClaim(s), id); await validation(s);
  }, { pathsA, pathsB });

scenario('case-folded session registration refuses without a decision',
  'worker-aa and WORKER-AA cannot create two logical sessions sharing one physical file; original registration survives and remains usable.', async s => {
    const actor = 'worker-aa'; success(await s.call(mutation('register', actor, 0, ['--tool', 'synthetic', '--lane', 'qualification', '--branch', 'synthetic'])));
    const head = fs.readFileSync(path.join(s.meta, 'HEAD.json')), session = fs.readFileSync(s.data('sessions/' + actor + '.json'));
    refusal(await s.call(mutation('register', actor.toUpperCase(), 1, ['--tool', 'synthetic', '--lane', 'qualification', '--branch', 'synthetic'])), ['session_windows_alias']);
    assert.equal(s.head().revision, 1); assert.equal(fs.readdirSync(path.join(s.meta, 'transactions')).length, 1);
    assert(fs.readFileSync(path.join(s.meta, 'HEAD.json')).equals(head)); assert(fs.readFileSync(s.data('sessions/' + actor + '.json')).equals(session));
    assert.equal(s.read('SESSION_REGISTRY.json').sessions.filter(item => item.id.toLowerCase() === actor).length, 1);
    success(await s.call(mutation('heartbeat', actor, 1, ['--note', 'original session remains usable']))); assert.equal(s.head().revision, 2); await validation(s);
  });

scenario('reserved Windows identifiers refuse before COMMIT',
  'Device aliases and trailing-dot IDs cannot create files or receipts; every rejected request leaves revision zero and the next valid registration works.', async s => {
    const head = fs.readFileSync(path.join(s.meta, 'HEAD.json'));
    for (const id of ['CON', 'con.txt', 'PRN', 'AUX', 'NUL', 'COM1', 'com9.log', 'LPT1', 'lpt9.txt', 'worker-aa.', '..', 'a'.repeat(101)]) {
      refusal(await s.call(mutation('register', id, 0, ['--tool', 'synthetic', '--lane', 'qualification', '--branch', 'synthetic'])), ['invalid_windows_id']);
      assert.equal(s.head().revision, 0); assert(fs.readFileSync(path.join(s.meta, 'HEAD.json')).equals(head));
      assert.equal(fs.readdirSync(path.join(s.meta, 'transactions')).length, 0); assert.equal(fs.readdirSync(path.join(s.meta, 'operations')).length, 0);
    }
    assert.equal(fs.readdirSync(s.data('sessions')).length, 2);
    success(await s.call(mutation('register', 'worker-valid', 0, ['--tool', 'synthetic', '--lane', 'qualification', '--branch', 'synthetic'])));
    assert.equal(s.head().revision, 1); await validation(s);
  });

scenario('maximum supported IDs and handoff names remain writable',
  '100-character task/session IDs create a 241-character handoff basename using a fixed 110-character atomic temporary; publication and replay succeed.', async s => {
    const actor = 'w'.repeat(100), task = 'T'.repeat(100);
    success(await s.call(mutation('register', actor, 0, ['--tool', 'synthetic', '--lane', 'qualification', '--branch', 'synthetic'])));
    success(await s.call(claim(actor, task, 1)));
    const file = path.join(s.root, 'summary.md'), bytes = Buffer.from('Maximum supported IDs\r\n'); fs.writeFileSync(file, bytes);
    const args = mutation('handoff', actor, 2, ['--task', task, '--sha', 'a'.repeat(40), '--summary', file]);
    const handoff = success(await s.call(args)).task.handoff, basename = path.basename(handoff.file);
    assert.equal(basename.length, 241); assert.equal(atomicTemporaryName(basename, randomUUID()).length, 110);
    assert(fs.readFileSync(s.data(handoff.file.slice('.xenios/'.length))).equals(bytes));
    assert.equal(success(await s.call(args)).coordination.replayed, true); assert.equal(fs.readdirSync(s.data('handoffs')).length, 1);
    success(await s.call(mutation('heartbeat', actor, 3, ['--note', 'usable after maximum-length handoff']))); assert.equal(s.head().revision, 4); await validation(s);
  }, { taskA: 'T'.repeat(100) });

const gateEvents = (scope, actor) => fs.readFileSync(path.join(scope.root, 'gates', actor + '.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(line => JSON.parse(line));
async function pastWaitBudget(scope, actor) {
  const attempt = await scope.waitEvent(actor, 'mutex-attempt');
  const paused = await scope.waitEvent(actor, 'paused-before-owner-unlink');
  // Real elapsed time after an observed production dead-owner unlink boundary;
  // no mocked clock or guessed contention. The exact three-second budget stays.
  await new Promise(resolve => setTimeout(resolve, 3_250));
  assert(Date.now() - Date.parse(attempt.at) > 3_000);
  assert(Date.now() - Date.parse(paused.at) >= 3_000);
  assert(!gateEvents(scope, actor).some(event => event.kind === 'mutex-acquired'));
}

scenario('slow proven-dead reclamation gets one immediate acquisition',
  'After actual trusted death proof and more than3s at its unlink gate, reclamation can acquire once and return recovery_required; exact recovery/replay preserves one claim.', async s => {
    const args = claim(A, TA, 0), dead = await killAt(s, args, 'after-corpus-1', 'slow-dead-owner');
    const reader = s.launch(['validate'], { actor: 'slow-reclaimer', gates: ['before-owner-unlink'] });
    await pastWaitBudget(s, 'slow-reclaimer'); s.release('slow-reclaimer', 'before-owner-unlink');
    refusal(await reader.done, ['recovery_required']);
    assert.equal(gateEvents(s, 'slow-reclaimer').filter(event => event.kind === 'mutex-acquired').length, 1);
    assert.deepEqual(gateEvents(s, 'slow-reclaimer').filter(event => event.kind === 'owner-observer-started').map(event => event.subjectPid), [reader.receipt.pid, dead.receipt.pid]);
    assert.equal(s.head().revision, 0); success(await s.call(['recover'])); const id = oneClaim(s); assert.equal(s.head().revision, 1);
    const replay = success(await s.call(args)); assert.equal(replay.coordination.replayed, true); assert.equal(replay.task.claimId, id);
    refusal(await s.call(claim(B, TB, 1)), ['path_conflict']); assert.equal(oneClaim(s), id); await validation(s);
  });

scenario('expired reclaimer preserves another replacement live owner',
  'A delayed old-token unlink cannot delete a new live winner; after its budget the losing atomic rename returns busy without another probe/reclamation, and ordinary work remains usable.', async s => {
    const dead = await killAt(s, claim(A, TA, 0), 'after-lock', 'replaced-dead-owner');
    const loser = s.launch(['validate'], { actor: 'expired-reclaimer', gates: ['before-owner-unlink'] });
    await pastWaitBudget(s, 'expired-reclaimer');
    const winner = s.launch(['validate'], { actor: 'replacement-winner', gates: ['after-lock'], cwd: s.linked });
    await s.waitEvent('replacement-winner', 'paused-after-lock');
    const mutex = path.join(s.meta, 'mutex'), name = fs.readdirSync(mutex)[0], file = path.join(mutex, name), bytes = fs.readFileSync(file);
    const owner = JSON.parse(bytes); assert.equal(owner.pid, winner.receipt.pid); assert.equal(winner.receipt.exited, false);
    s.release('expired-reclaimer', 'before-owner-unlink'); refusal(await loser.done, ['coordination_busy']);
    assert(fs.readFileSync(file).equals(bytes)); assert.equal(winner.receipt.exited, false);
    assert(!gateEvents(s, 'expired-reclaimer').some(event => event.kind === 'mutex-acquired'));
    assert.deepEqual(gateEvents(s, 'expired-reclaimer').filter(event => event.kind === 'owner-observer-started').map(event => event.subjectPid), [loser.receipt.pid, dead.receipt.pid]);
    s.release('replacement-winner', 'after-lock'); success(await winner.done); assert.equal(s.head().revision, 0);
    success(await s.call(claim(A, TA, 0))); oneClaim(s); assert.equal(s.head().revision, 1); await validation(s);
  });
