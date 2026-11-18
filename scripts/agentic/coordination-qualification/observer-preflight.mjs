// Bounded observer qualification only. No corpus binding, registry or task.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { observeOwner, contentHash, REQUIRED_NODE } from '../corpus-store.mjs';

const executable = fileURLToPath(import.meta.url), sourceRoot = path.resolve(path.dirname(executable), '../../..');
const args = process.argv.slice(2);
const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function ownedDirectory(root) {
  const resolved = fs.realpathSync(root), temp = fs.realpathSync(os.tmpdir());
  assert(resolved.toLowerCase().startsWith(temp.toLowerCase() + path.sep));
  assert(path.basename(resolved).startsWith('xenios-owner-preflight-'));
  const marker = json(path.join(resolved, 'fixture-owner.json'));
  assert.equal(marker.kind, 'xenios-owner-preflight-v1'); return { root: resolved, marker };
}
function sourceReceipt(expectedSha) {
  const git = values => execFileSync('git', values, { cwd: sourceRoot, windowsHide: true, timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const head = git(['rev-parse', 'HEAD']).toString().trim(); assert.equal(head, expectedSha);
  assert.equal(git(['status', '--porcelain']).toString(), '', 'Source must be clean');
  const files = ['scripts/agentic/corpus-store.mjs', 'scripts/agentic/corpus-owner-process.ps1',
    'scripts/agentic/path-overlap.mjs', 'scripts/agentic/coordination-qualification/observer-preflight.mjs'].map(file => {
    const bytes = fs.readFileSync(path.join(sourceRoot, file)), committed = git(['cat-file', 'blob', head + ':' + file]);
    assert(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')).equals(committed), 'Changed source ' + file);
    return { file, bytes: bytes.length, sha256: contentHash(bytes), committedSha256: contentHash(committed) };
  });
  return { head, files, observedAt: new Date().toISOString() };
}
function launch(values, options = {}) {
  const child = spawn(process.execPath, [executable, ...values], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(options.ipc ? ['ipc'] : [])],
    ...(options.env ? { env: options.env } : {}) });
  const receipt = { pid: child.pid, startedAt: new Date().toISOString(), exited: false, exitCode: null, signal: null, stdout: '', stderr: '', timedOut: false };
  const capture = key => bytes => { receipt[key] += bytes.toString('utf8'); if (Buffer.byteLength(receipt.stdout + receipt.stderr) > 256_000) { receipt.outputLimitExceeded = true; child.kill('SIGKILL'); } };
  child.stdout.on('data', capture('stdout')); child.stderr.on('data', capture('stderr'));
  const timer = setTimeout(() => { receipt.timedOut = true; child.kill('SIGKILL'); }, options.timeout ?? 45_000);
  const done = new Promise((resolve, reject) => {
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => { clearTimeout(timer); Object.assign(receipt, { exited: true, exitCode: code, signal, finishedAt: new Date().toISOString() }); resolve(receipt); });
  });
  return { child, receipt, done };
}
async function worker(root) {
  const fixture = ownedDirectory(root); assert.equal(fixture.marker.orchestratorPid, process.ppid);
  const result = { schemaVersion: 1, kind: 'production-owner-observer-preflight', runId: fixture.marker.runId,
    ok: false, workerPid: process.pid, runtime: { platform: process.platform, node: process.versions.node },
    environment: { keys: Object.keys(process.env).sort(), osPresent: Object.hasOwn(process.env, 'OS') },
    observations: [], child: null, startedAt: new Date().toISOString() };
  let handle = null;
  function observed(label, pid) {
    const observation = { label, pid, at: new Date().toISOString(), accepted: false, diagnostics: null };
    result.observations.push(observation);
    try {
      const facts = observeOwner(pid, fixture.root, { onReceipt: receipt => { observation.diagnostics = receipt; } });
      observation.accepted = true; observation.facts = facts; return facts;
    } catch (error) { observation.errorCode = error.code ?? 'observer_unavailable'; throw error; }
  }
  try {
    assert.equal(result.environment.osPresent, false, 'Ambient OS must remain absent');
    const ownFacts = observed('minimal_environment_current_worker', process.pid); assert.equal(ownFacts.found, true);
    put(path.join(fixture.root, 'worker-owner.json'), { workerPid: process.pid, runId: fixture.marker.runId });
    handle = launch(['--held-child', fixture.root], { ipc: true, timeout: 25_000 }); result.child = handle.receipt;
    await new Promise((resolve, reject) => {
      handle.child.once('message', value => { try { assert.equal(value.kind, 'ready'); assert.equal(value.pid, handle.child.pid); resolve(); } catch (error) { reject(error); } });
      handle.done.then(() => reject(new Error('owned_child_exited_before_ready')), reject);
    });
    const live = observed('owned_child_current', handle.child.pid); assert.equal(live.found, true); result.child.birthId = live.birthId;
    handle.child.send('exit'); await handle.done; assert.equal(handle.receipt.exitCode, 0);
    const exited = observed('owned_child_after_actual_exit', handle.child.pid);
    assert(!exited.found || exited.birthId !== live.birthId, 'Exited original process must not remain current');
    result.originalChildAbsent = !exited.found; result.pidReused = exited.found; result.ok = true;
  } catch (error) { result.errorCode = error.code ?? 'preflight_assertion_failed'; result.assertion = error.code === 'ERR_ASSERTION' ? error.message : null; }
  finally {
    if (handle) { if (!handle.receipt.exited) handle.child.kill('SIGKILL'); await handle.done; result.allOwnedChildrenExited = handle.receipt.exited; }
    else result.allOwnedChildrenExited = true;
    result.finishedAt = new Date().toISOString(); put(path.join(fixture.root, 'worker-result.json'), result);
    console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : 1;
  }
}
async function orchestrate() {
  assert.equal(process.platform, 'win32'); assert.equal(process.versions.node, REQUIRED_NODE);
  assert.equal(args.length, 4); assert.equal(args[0], '--expect-sha'); assert(/^[a-f0-9]{40}$/.test(args[1])); assert.equal(args[2], '--receipt');
  const receiptFile = path.resolve(args[3]); assert(!fs.existsSync(receiptFile)); assert(fs.statSync(path.dirname(receiptFile)).isDirectory());
  const before = sourceReceipt(args[1]), root = fs.mkdtempSync(path.join(os.tmpdir(), 'xenios-owner-preflight-')), runId = randomUUID();
  put(path.join(root, 'fixture-owner.json'), { kind: 'xenios-owner-preflight-v1', runId, orchestratorPid: process.pid, createdAt: new Date().toISOString() });
  // Exactly the six base environment keys used by candidate-fixture. No OS,
  // USERPROFILE, NODE_OPTIONS, token, credential or synthetic Windows label.
  const minimal = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const handle = launch(['--worker', root], { env: minimal }); await handle.done;
  const workerFile = path.join(root, 'worker-result.json'), result = fs.existsSync(workerFile) ? json(workerFile) : null;
  let after = null, sourceUnchanged = false;
  try { after = sourceReceipt(args[1]); assert.deepEqual(after.files, before.files); sourceUnchanged = true; } catch { /* Still preserve diagnostic/exit receipts on source drift. */ }
  const receipt = { schemaVersion: 1, kind: 'observer-only-not-corpus-qualification', runId, fixtureRoot: root, retained: true,
    ok: sourceUnchanged && handle.receipt.exitCode === 0 && result?.ok === true && result.allOwnedChildrenExited === true,
    sourceBefore: before, sourceAfter: after, sourceUnchanged, minimalEnvironmentKeys: Object.keys(minimal).sort(),
    workerProcess: handle.receipt, result, noBindingOrRegistryMutation: true,
    processCustody: { workerExited: handle.receipt.exited, childExited: result?.allOwnedChildrenExited ?? null,
      limit: result ? null : 'Worker result missing: descendant cleanup is unverified; do not qualify.' } };
  put(receiptFile, receipt); console.log(JSON.stringify({ ok: receipt.ok, receipt: receiptFile, fixtureRoot: root })); process.exitCode = receipt.ok ? 0 : 1;
}
try {
  if (args[0] === '--held-child') {
    const fixture = ownedDirectory(args[1]), owner = json(path.join(fixture.root, 'worker-owner.json'));
    assert.equal(owner.runId, fixture.marker.runId); assert.equal(owner.workerPid, process.ppid); assert(process.send);
    process.on('disconnect', () => process.exit(0)); process.on('message', value => { if (value === 'exit') process.exit(0); });
    setTimeout(() => process.exit(88), 20_000); process.send({ kind: 'ready', pid: process.pid });
  } else if (args[0] === '--worker') await worker(args[1]);
  else await orchestrate();
} catch (error) { console.error(JSON.stringify({ ok: false, code: error.code ?? 'observer_preflight_unavailable' })); process.exitCode = 1; }
