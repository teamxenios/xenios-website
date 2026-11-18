import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT_FILES, REQUIRED_NODE, initialHead, observeOwner, contentHash } from '../corpus-store.mjs';

export const SUBJECT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const preload = fileURLToPath(new URL('./candidate-io-preload.cjs', import.meta.url));
export const ACTOR_A = 'synthetic-worker-a', ACTOR_B = 'synthetic-worker-b';
export const TASK_A = 'SYNTHETIC-CLAIM-A', TASK_B = 'SYNTHETIC-CLAIM-B';
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sourceFiles = ['scripts/agentic/xenios-os.mjs', 'scripts/agentic/corpus-store.mjs',
  'scripts/agentic/corpus-owner-process.ps1', 'scripts/agentic/corpus-store.node-test.mjs',
  'scripts/agentic/path-overlap.mjs', 'scripts/agentic/coordination-qualification/candidate-fixture.mjs',
  'scripts/agentic/coordination-qualification/candidate-io-preload.cjs',
  'scripts/agentic/coordination-qualification/run-candidate.ps1'];
export function sourceReceipt() {
  const git = args => execFileSync('git', args, { cwd: SUBJECT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const sourceSha = git(['rev-parse', 'HEAD']).toString().trim();
  const files = sourceFiles.map(file => {
    const actual = fs.readFileSync(path.join(SUBJECT, file)), committed = git(['cat-file', 'blob', sourceSha + ':' + file]);
    assert(Buffer.from(actual.toString('utf8').replaceAll('\r\n', '\n')).equals(committed), 'Uncommitted candidate source: ' + file);
    return { file, sha256: contentHash(actual), committedSha256: contentHash(committed) };
  });
  return { sourceSha, files, node: process.versions.node, platform: process.platform, observedAt: new Date().toISOString() };
}
export function fixture(scenario, { taskA = TASK_A, pathsA = ['synthetic-owned/one.txt'], pathsB = ['synthetic-owned/one.txt'] } = {}) {
  assert.equal(process.platform, 'win32'); assert.equal(process.versions.node, REQUIRED_NODE);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xenios-coordination-candidate-')));
  const main = path.join(root, 'main'), linked = path.join(root, 'linked'), runId = randomUUID();
  const corpusRoot = path.join(main, '.xenios'), meta = path.join(corpusRoot, '.coordination');
  const marker = { kind: 'xenios-coordination-candidate-v1', runId, scenario, worktrees: [main, linked], corpusRoot };
  // Mark ownership before Git/setup so a fail-fast hosted run can preserve an
  // incomplete fixture without copying an unmarked or unrelated temp tree.
  put(path.join(root, 'fixture-owner.json'), marker);
  fs.mkdirSync(main); fs.mkdirSync(path.join(root, 'gates')); fs.mkdirSync(path.join(root, 'empty-hooks'));
  const git = args => execFileSync('git', ['-c', 'core.hooksPath=' + path.join(root, 'empty-hooks'),
    '-c', 'init.templateDir=', '-c', 'core.fsmonitor=false', ...args], { cwd: main, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--initial-branch=synthetic-main']); put(path.join(main, 'synthetic-only.json'), { runId });
  git(['add', 'synthetic-only.json']); git(['-c', 'user.name=Synthetic Qualification', '-c', 'user.email=synthetic@example.invalid', 'commit', '--no-gpg-sign', '-m', 'Owned synthetic qualification fixture']);
  git(['worktree', 'add', '-b', 'synthetic-linked', linked]);
  for (const rel of ['sessions', 'messages', 'handoffs', '.coordination/transactions', '.coordination/operations', '.coordination/aborted', '.coordination/mutex-candidates']) fs.mkdirSync(path.join(corpusRoot, rel), { recursive: true });
  const at = '2026-11-18T00:00:00.000Z';
  const sessions = [ACTOR_A, ACTOR_B].map(id => ({ id, tool: 'synthetic', lane: 'qualification', branch: 'synthetic', state: 'active', startedAt: at, heartbeatAt: at, note: '' }));
  const files = new Map();
  const add = (rel, value) => { const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); fs.writeFileSync(path.join(corpusRoot, rel), bytes); files.set(rel, bytes); };
  ROOT_FILES.slice(0, 3).forEach(rel => add(rel, { schemaVersion: 1, synthetic: true }));
  add('ACTIVE_TASKS.json', { schemaVersion: 1, tasks: [taskA, TASK_B].map((id, index) => ({ id, title: 'Synthetic overlapping claim', state: 'ready', owner: null, priority: 'P1', paths: index === 0 ? pathsA : pathsB, dependsOn: [] })) });
  add('SESSION_REGISTRY.json', { schemaVersion: 1, sessions }); add('CODE_OWNERSHIP.json', { schemaVersion: 1, leases: [] });
  sessions.forEach(session => add('sessions/' + session.id + '.json', session));
  const facts = observeOwner(process.pid, corpusRoot), authorityId = randomUUID();
  const common = fs.realpathSync(git(['rev-parse', '--path-format=absolute', '--git-common-dir']).toString().trim());
  const binding = { protocol: 1, authorityId, nodeVersion: REQUIRED_NODE, corpusRoot: fs.realpathSync(corpusRoot), gitCommonDirectory: common,
    namespace: { platform: facts.platform, hostId: facts.hostId, bootId: facts.bootId, fileSystem: facts.fileSystem } };
  fs.mkdirSync(path.join(common, 'xenios-coordination')); const bindingFile = path.join(common, 'xenios-coordination/authority-binding.json');
  put(bindingFile, binding); put(path.join(meta, 'HEAD.json'), initialHead(files, authorityId));
  const children = [], scope = { ...marker, root, main, linked, meta, binding, bindingFile, children, facts,
    data: rel => path.join(corpusRoot, rel), read: rel => json(path.join(corpusRoot, rel)),
    head: () => json(path.join(meta, 'HEAD.json')) };
  scope.launch = (args, { actor = 'plain-' + children.length, gates = [], cwd = main } = {}) => {
    assert(marker.worktrees.includes(cwd));
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    Object.assign(env, { XENIOS_CANDIDATE_FIXTURE: root, XENIOS_CANDIDATE_RUN_ID: runId, XENIOS_CANDIDATE_ACTOR: actor, XENIOS_CANDIDATE_GATES: gates.join(',') });
    const receipt = { invocationId: randomUUID(), canonicalTaskId: null, canonicalAttemptId: null, args, actor, gates, cwd,
      pid: null, startedAt: new Date().toISOString(), stdout: '', stderr: '', exitCode: null, signal: null, completeOutput: true, exited: false };
    const child = spawn(process.execPath, ['--require', preload, path.join(SUBJECT, 'scripts/agentic/xenios-os.mjs'), ...args], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    receipt.pid = child.pid;
    const capture = name => bytes => { receipt[name] += bytes.toString('utf8'); if (Buffer.byteLength(receipt.stdout + receipt.stderr) > 2 * 1024 * 1024) { receipt.completeOutput = false; child.kill('SIGKILL'); } };
    child.stdout.on('data', capture('stdout')); child.stderr.on('data', capture('stderr'));
    const timer = setTimeout(() => { receipt.timedOut = true; child.kill('SIGKILL'); }, 90_000);
    const done = new Promise((resolve, reject) => {
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => { clearTimeout(timer); Object.assign(receipt, { exitCode: code, signal, exited: true, finishedAt: new Date().toISOString() }); resolve(receipt); });
    });
    const handle = { child, receipt, done }; children.push(handle); return handle;
  };
  scope.call = async (args, options) => (await scope.launch(args, options).done);
  scope.waitEvent = async (actor, kind) => {
    const deadline = Date.now() + 35_000, file = path.join(root, 'gates', actor + '.jsonl');
    while (Date.now() < deadline) {
      if (fs.existsSync(file)) { const text = fs.readFileSync(file, 'utf8'); const found = text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).map(line => JSON.parse(line)).find(value => value.kind === kind); if (found) return found; }
      const handle = children.find(item => item.receipt.actor === actor); assert(!handle?.receipt.exited, 'Child exited before ' + kind + ': ' + JSON.stringify(handle?.receipt)); await sleep(20);
    }
    assert.fail('Missing observed event ' + actor + '/' + kind);
  };
  scope.release = (actor, kind) => fs.writeFileSync(path.join(root, 'gates', actor + '.' + kind + '.release'), 'release');
  scope.close = async () => {
    for (const handle of children) if (!handle.receipt.exited) handle.child.kill('SIGKILL');
    await Promise.all(children.map(handle => handle.done));
    put(path.join(root, 'receipt.json'), { ...marker, root, retained: true, allOwnedChildrenExited: children.every(handle => handle.receipt.exited), processes: children.map(handle => handle.receipt) });
  };
  return scope;
}
export function success(receipt) { assert.equal(receipt.exitCode, 0, JSON.stringify(receipt)); assert(receipt.completeOutput); const value = JSON.parse(receipt.stdout); assert.equal(value.ok, true); return value; }
export function refusal(receipt, codes) { assert.notEqual(receipt.exitCode, 0, JSON.stringify(receipt)); assert(receipt.completeOutput); const value = JSON.parse(receipt.stderr); assert.equal(value.ok, false); if (codes) assert(codes.includes(value.code), JSON.stringify(receipt)); return value; }
export function mutation(command, actor, revision, extra = [], operationId = randomUUID()) {
  const actorKey = command === 'register' ? '--id' : command === 'accept' ? '--by' : command === 'message' ? '--from' : '--session';
  return [command, actorKey, actor, ...extra, '--operation-id', operationId, '--expected-revision', String(revision)];
}
export const claim = (actor, task, revision, operationId) => mutation('claim', actor, revision, ['--task', task], operationId);
