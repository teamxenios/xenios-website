import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BASELINE_SHA = 'e6e11c3f923491d55bc2cd221c29da77001a0822';
export const DEFAULT_SUBJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const preload = fileURLToPath(new URL('./io-gate-preload.cjs', import.meta.url));
const sourcePaths = ['scripts/agentic/xenios-os.mjs', 'scripts/agentic/path-overlap.mjs'];
const sessionA = 'synthetic-worker-a', sessionB = 'synthetic-worker-b';
const taskA = 'SYNTHETIC-CLAIM-A', taskB = 'SYNTHETIC-CLAIM-B';
const sharedPath = 'synthetic-owned/one-file.txt';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

export function captureSubject(subjectRoot) {
  const root = fs.realpathSync(subjectRoot);
  const git = args => execFileSync('git', args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const head = git(['rev-parse', 'HEAD']).toString().trim();
  assert(/^[a-f0-9]{40}$/.test(head));
  const files = sourcePaths.map(file => {
    const worktree = fs.readFileSync(path.join(root, file));
    const committed = git(['cat-file', 'blob', head + ':' + file]);
    const baseline = git(['cat-file', 'blob', BASELINE_SHA + ':' + file]);
    const normalized = Buffer.from(worktree.toString('utf8').replaceAll('\r\n', '\n'));
    assert(normalized.equals(committed), 'Subject source has uncommitted changes: ' + file);
    return { file, worktreeSha256: hash(worktree), committedSha256: hash(committed),
      baselineSha256: hash(baseline), baselineUnchanged: committed.equals(baseline) };
  });
  return { root, head, sourceFiles: files, baselineSha: BASELINE_SHA,
    baselineSourceUnchanged: files.every(file => file.baselineUnchanged) };
}

function fixture(runId, scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xenios-coordination-'));
  fs.mkdirSync(path.join(root, '.xenios', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(root, '.xenios', 'handoffs'));
  fs.mkdirSync(path.join(root, 'gates'));
  write(path.join(root, 'fixture-owner.json'), { kind: 'xenios-coordination-qualification-v1', runId, scenario });
  const at = new Date().toISOString();
  const sessions = [sessionA, sessionB].map(id => ({ id, tool: 'synthetic', lane: 'qualification',
    branch: 'synthetic-only', state: 'active', startedAt: at, heartbeatAt: at }));
  for (const session of sessions) write(path.join(root, '.xenios', 'sessions', session.id + '.json'), session);
  write(path.join(root, '.xenios', 'SESSION_REGISTRY.json'), { schemaVersion: 1, sessions });
  write(path.join(root, '.xenios', 'ACTIVE_TASKS.json'), { schemaVersion: 1, tasks:
    [taskA, taskB].map(id => ({ id, title: 'Synthetic overlapping claim', priority: 'P1',
      state: 'ready', owner: null, paths: [sharedPath], dependsOn: [] })) });
  write(path.join(root, '.xenios', 'CODE_OWNERSHIP.json'), { schemaVersion: 1, leases: [] });
  for (const name of ['PROJECT_STATE.json', 'RELEASE_STATE.json', 'ROADMAP.json']) {
    write(path.join(root, '.xenios', name), { schemaVersion: 1, synthetic: true });
  }
  return { root, runId, scenario };
}

function minimalEnvironment(extra) {
  const result = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']) {
    if (process.env[key] !== undefined) result[key] = process.env[key];
  }
  return { ...result, ...extra };
}

function launch(subject, scope, args, { actor = 'plain', gate = null } = {}) {
  const executable = path.join(subject.root, sourcePaths[0]);
  const cliArgs = [...(gate ? ['--require', preload] : []), executable, ...args];
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, cliArgs, { cwd: scope.root, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'], env: minimalEnvironment(gate ? {
      XENIOS_COORDINATION_FIXTURE_ROOT: scope.root,
      XENIOS_COORDINATION_RUN_ID: scope.runId,
      XENIOS_COORDINATION_ACTOR: actor,
      XENIOS_COORDINATION_GATE: gate,
    } : {}) });
  const result = { harnessInvocationId: randomUUID(), canonicalAttemptId: null, pid: child.pid,
    args, actor, gate, startedAt, stdout: '', stderr: '', completeOutput: true,
    exitCode: null, signal: null, finishedAt: null, timedOut: false };
  let settled = false;
  const capture = stream => data => {
    result[stream] += data.toString('utf8');
    if (Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > 2 * 1024 * 1024) {
      result.completeOutput = false; child.kill('SIGKILL');
    }
  };
  child.stdout.on('data', capture('stdout')); child.stderr.on('data', capture('stderr'));
  const timer = setTimeout(() => { result.timedOut = true; child.kill('SIGKILL'); }, 30_000);
  const done = new Promise((resolve, reject) => {
    child.once('error', error => { clearTimeout(timer); settled = true; reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer); settled = true; result.exitCode = code; result.signal = signal;
      result.finishedAt = new Date().toISOString(); resolve(result);
    });
  });
  return { child, done, result, get settled() { return settled; } };
}

async function ready(scope, handle) {
  const file = path.join(scope.root, 'gates', handle.result.actor + '.ready.json');
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(file)) {
    if (handle.settled) throw Error('CLI exited before the requested boundary: ' + JSON.stringify(handle.result));
    if (Date.now() > deadline) throw Error('Boundary not observed; schedule is inconclusive, not a passing safety result.');
    await sleep(10);
  }
  return json(file);
}
function release(scope, actor) { fs.writeFileSync(path.join(scope.root, 'gates', actor + '.release'), 'release\n'); }
function claimArgs(session, task) { return ['claim', '--session', session, '--task', task]; }
function succeeded(result) {
  try { return result.exitCode === 0 && !result.timedOut && result.completeOutput && JSON.parse(result.stdout).ok === true; }
  catch { return false; }
}
function state(scope) {
  const board = json(path.join(scope.root, '.xenios', 'ACTIVE_TASKS.json'));
  const ownership = json(path.join(scope.root, '.xenios', 'CODE_OWNERSHIP.json'));
  const active = ownership.leases.filter(lease => lease.state === 'active');
  const orphanClaimedTasks = board.tasks.filter(task => task.state === 'claimed'
    && active.filter(lease => lease.task === task.id && lease.session === task.owner).length !== 1).map(task => task.id);
  const orphanLeases = active.filter(lease => !board.tasks.some(task => task.id === lease.task
    && task.state === 'claimed' && task.owner === lease.session)).map(lease => lease.task);
  return { board, ownership, orphanClaimedTasks, orphanLeases,
    consistent: orphanClaimedTasks.length === 0 && orphanLeases.length === 0 };
}
function trace(scope, actor) {
  const file = path.join(scope.root, 'gates', actor + '.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
}

export async function runQualification({ subjectRoot = DEFAULT_SUBJECT, outputFile } = {}) {
  const runId = randomUUID(), handles = [];
  const receipt = { schemaVersion: 1, kind: 'isolated_actual_cli_coordination_qualification', runId,
    startedAt: new Date().toISOString(), nodeVersion: process.versions.node, subject: null,
    canonicalControllerRevision: null, canonicalAttemptId: null, scenarios: [],
    status: 'RUNNING', noRealRegistryMutation: true, noExternalSideEffects: true,
    fixtureRetention: 'All synthetic fixture files and complete child output retained; no recursive deletion.',
    instrumentation: 'Node preload schedules real synchronous reads/writes after returning original bytes; no coordinator source modification. Crash is an owned-child kill after an actual task-file write.' };
  const launchOwned = (...args) => { const handle = launch(...args); handles.push(handle); return handle; };
  try {
    const subject = captureSubject(subjectRoot);
    receipt.subject = subject;
    assert(subject.baselineSourceUnchanged,
      'Subject CLI differs from the inspected baseline; review and repin the harness before execution.');
    const serial = fixture(runId, 'serialized-positive-control');
    const serialA = await launchOwned(subject, serial, claimArgs(sessionA, taskA)).done;
    const serialB = await launchOwned(subject, serial, claimArgs(sessionB, taskB)).done;
    const serialState = state(serial);
    const positiveControlPassed = succeeded(serialA) && !succeeded(serialB) && serialState.consistent
      && serialState.ownership.leases.filter(lease => lease.state === 'active').length === 1;
    receipt.scenarios.push({ id: serial.scenario, fixtureRoot: serial.root,
      processes: [serialA, serialB], finalState: serialState, invariantPassed: positiveControlPassed });
    assert(positiveControlPassed, 'Serialized control failed; contention results cannot be accepted.');

    const race = fixture(runId, 'same-snapshot-overlapping-claims');
    const a = launchOwned(subject, race, claimArgs(sessionA, taskA), { actor: 'race-a', gate: 'after-ownership-read' });
    const ar = await ready(race, a);
    const b = launchOwned(subject, race, claimArgs(sessionB, taskB), { actor: 'race-b', gate: 'after-ownership-read' });
    const br = await ready(race, b);
    assert.equal(ar.ownershipReadSha256, br.ownershipReadSha256, 'The forced ownership snapshots differ.');
    assert.equal(ar.boardReadSha256, br.boardReadSha256, 'The forced task-board snapshots differ.');
    release(race, 'race-a'); const resultA = await a.done;
    release(race, 'race-b'); const resultB = await b.done;
    const raceState = state(race), successfulClaims = [resultA, resultB].filter(succeeded).length;
    const lostAcknowledgedClaims = [resultA, resultB].filter(succeeded).map(result => JSON.parse(result.stdout).task)
      .filter(task => !raceState.board.tasks.some(current => current.id === task.id
        && current.state === 'claimed' && current.owner === task.owner)).map(task => task.id);
    receipt.scenarios.push({ id: race.scenario, fixtureRoot: race.root,
      sameOwnershipSnapshot: true, sameTaskBoardSnapshot: true, successfulClaims, lostAcknowledgedClaims,
      processes: [resultA, resultB], trace: [...trace(race, 'race-a'), ...trace(race, 'race-b')],
      finalState: raceState, invariantPassed: successfulClaims === 1 && lostAcknowledgedClaims.length === 0
        && raceState.consistent });

    const crash = fixture(runId, 'interrupted-task-write-resume');
    const interrupted = launchOwned(subject, crash, claimArgs(sessionA, taskA),
      { actor: 'crash-a', gate: 'after-task-write' });
    const boundary = await ready(crash, interrupted);
    const afterTaskWrite = state(crash);
    assert.equal(afterTaskWrite.board.tasks.find(task => task.id === taskA).owner, sessionA);
    interrupted.child.kill('SIGKILL'); const killed = await interrupted.done;
    const validation = await launchOwned(subject, crash, ['validate']).done;
    const resumed = await launchOwned(subject, crash, ['resume', '--session', sessionA]).done;
    const sameTaskRetry = await launchOwned(subject, crash, claimArgs(sessionA, taskA)).done;
    const overlappingOtherTask = await launchOwned(subject, crash, claimArgs(sessionB, taskB)).done;
    const crashState = state(crash);
    receipt.scenarios.push({ id: crash.scenario, fixtureRoot: crash.root, boundary,
      afterTaskWrite, processes: [killed, validation, resumed, sameTaskRetry, overlappingOtherTask],
      validatorReportedConsistent: succeeded(validation), sameTaskRetrySucceeded: succeeded(sameTaskRetry),
      overlappingOtherTaskSucceeded: succeeded(overlappingOtherTask), finalState: crashState,
      trace: trace(crash, 'crash-a'), invariantPassed: afterTaskWrite.consistent && crashState.consistent });
    const after = captureSubject(subjectRoot);
    assert.deepEqual(after.sourceFiles, subject.sourceFiles, 'Coordinator source changed during qualification.');
    receipt.subjectSourceUnchangedAfterRun = true;
    receipt.status = receipt.scenarios.every(scenario => scenario.invariantPassed)
      ? 'ALL_DECLARED_INVARIANTS_PASSED' : 'COORDINATION_INVARIANT_VIOLATION_OBSERVED';
  } catch (error) {
    receipt.status = 'HARNESS_OR_ENVIRONMENT_FAILURE';
    receipt.error = error instanceof Error ? error.message : String(error);
  } finally {
    for (const handle of handles) if (!handle.settled) handle.child.kill('SIGKILL');
    await Promise.allSettled(handles.map(handle => handle.done));
    receipt.allOwnedChildrenExited = handles.every(handle => handle.settled);
    receipt.processes = handles.map(handle => handle.result);
    receipt.finishedAt = new Date().toISOString();
    receipt.outputFile = outputFile ? path.resolve(outputFile)
      : path.join(os.tmpdir(), 'xenios-coordination-report-' + runId + '.json');
    fs.mkdirSync(path.dirname(receipt.outputFile), { recursive: true });
    write(receipt.outputFile, receipt);
  }
  return receipt;
}
