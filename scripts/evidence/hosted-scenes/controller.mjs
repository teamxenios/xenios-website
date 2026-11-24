import assert from 'node:assert/strict';
import { readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync, statSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { freemem } from 'node:os';
import { createHash } from 'node:crypto';
import { SOURCE, TREE, validateScenes, validateOwnedRelease } from './policy.mjs';
import { validateIsolation, validateSourceBinding } from '../owned-runner-browser-qa.mjs';
import { assertPinnedExecutingRuntime } from '../lib/provenance.mjs';
import { assertHostedDist } from '../lib/hosted-preview-dist.mjs';
import { observeNamespaceProcesses, browserAbsenceDecision } from './process-observation.mjs';
import { verifyInitParent } from './namespace-init.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const env = { ...process.env }, repo = realpathSync(process.cwd()), out = realpathSync(env.XR_QA_OUT), inputs = realpathSync(env.XR_QA_INPUTS);
assert(process.platform === 'linux' && env.XR_QA_ACTIONS === 'true', 'ACTIONS_CAPABILITY_MISSING');
assert(/^\d+$/.test(env.XR_QA_RUN_ID ?? '') && env.XR_QA_RUN_ATTEMPT === '1' && /^[a-zA-Z0-9_-]+$/.test(env.XR_QA_JOB_KEY ?? ''), 'ACTIONS_IDENTITY');
const proc = readFileSync('/proc/self/status', 'utf8');
const isolation = validateIsolation({ uid: process.getuid(), netNamespace: readlinkSync('/proc/self/ns/net'), parentNetNamespace: env.XR_QA_PARENT_NET_NS,
  interfaces: JSON.parse(execFileSync('/usr/sbin/ip', ['-j', 'link', 'show'], { encoding: 'utf8' })).map(r => r.ifname).sort(),
  routes: [[], ['-6']].flatMap(f => JSON.parse(execFileSync('/usr/sbin/ip', [...f, '-j', 'route', 'show', 'table', 'main'], { encoding: 'utf8' }))),
  effectiveCaps: /^CapEff:\s*(\w+)/m.exec(proc)?.[1], noNewPrivs: /^NoNewPrivs:\s*(\d+)/m.exec(proc)?.[1] });
assert(/^pid:\[\d+\]$/.test(env.XR_QA_PARENT_PID_NS ?? '') && readlinkSync('/proc/self/ns/pid') !== env.XR_QA_PARENT_PID_NS, 'PID_NAMESPACE_MISSING');
assert(readlinkSync('/proc/self/ns/mnt') !== env.XR_QA_PARENT_MNT_NS && /^CapBnd:\s*0+$/m.test(proc), 'MOUNT_OR_CAPABILITY_BOUNDARY');
const runtime = assertPinnedExecutingRuntime(), context = JSON.parse(readFileSync(join(inputs, 'context.json')));
const spec = JSON.parse(readFileSync(new URL('./selection.json', import.meta.url))); validateScenes(spec.scenes);
assert.deepEqual(context.scenes, spec.scenes); assert.equal(context.source, SOURCE); assert.equal(context.tree, TREE);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '', 'CHECKOUT_DIRTY');
assert.equal(git('rev-parse', 'HEAD'), context.newExecution.commit); assert.equal(git('rev-parse', 'HEAD^{tree}'), context.newExecution.tree);
assert.equal(context.newExecution.run, env.XR_QA_RUN_ID); assert.equal(context.newExecution.job, env.XR_QA_JOB_KEY);
const provenance = assertHostedDist(context.dist, SOURCE, TREE);
const originalBinding = validateSourceBinding({ sourceHead: SOURCE, sourceTree: TREE, runnerHead: context.original.runner, runnerTree: TREE,
  runnerParents: [context.original.base, SOURCE], preview: JSON.parse(readFileSync(join(context.dist, 'public/PREVIEW-SOURCE.json'))) });
const result = { kind: 'QA_ONLY_SEQUENTIAL_HOSTED_SCENES', source: SOURCE, tree: TREE, actualNewExecution: context.newExecution,
  originalBinding, runtime, isolation, importedInventory: provenance.distInventorySha256, startedAt: new Date().toISOString(),
  state: 'NOT_RUN', phases: [], cleanup: {}, releaseAuthorized: false, failure: null };
result.initIdentity = verifyInitParent();
const childEnv = { ...env, XR_EVIDENCE_CHROME: realpathSync(env.XR_EVIDENCE_CHROME) };
const deadline = Date.now() + 265000; let server;
const ownedTmp = join(out, 'tmp');
assert(statSync('/tmp').dev === statSync(ownedTmp).dev && statSync('/tmp').ino === statSync(ownedTmp).ino, 'OWNED_TMP_BIND_MISSING');
function processSnapshot(label) {
  const snapshot = observeNamespaceProcesses();
  const record = { label, observedAt: new Date().toISOString(), ...snapshot };
  (result.cleanup.processObservations ??= []).push(record);
  assert(result.cleanup.processObservations.length <= 128, 'PROCESS_OBSERVATION_BOUND');
  return snapshot;
}
function processes() {
  const snapshot = processSnapshot('owned-release');
  assert.equal(snapshot.readErrors.length, 0, 'PROC_OBSERVATION_INCOMPLETE');
  assert(snapshot.processes.some(r => r.pid === process.pid), 'PROC_OBSERVATION_MISSING');
  return snapshot.processes;
}
const baseline = processes();
assert(baseline.some(p => p.pid === 1 && p.startTicks === result.initIdentity.process.startTicks), 'VERIFIED_INIT_BASELINE');
assert(baseline.every(p => p.pid === 1 && p.startTicks === result.initIdentity.process.startTicks || p.pid === process.pid || p.parent === process.pid && /^(node|esbuild)$/.test(p.name)), 'UNEXPECTED_NAMESPACE_BASELINE');
async function confirmReleased() {
  let last;
  for (let i = 0; i < 25; i++) {
    try { return validateOwnedRelease({ baseline, current: processes(), ownerPid: process.pid, profileNames: readdirSync(ownedTmp).filter(n => n.startsWith('xr-evidence-chrome-')) }); }
    catch (error) { last = error; await new Promise(r => setTimeout(r, 40)); }
  }
  throw last;
}
async function stopServer() {
  if (!server) return;
  const owned = server;
  await new Promise(resolve => { if (owned.exitCode !== null || owned.signalCode !== null) return resolve(); const timer = setTimeout(resolve, 3000); owned.once('exit', () => { clearTimeout(timer); resolve(); }); owned.kill('SIGTERM'); });
  assert(owned.exitCode !== null || owned.signalCode !== null, 'OWNED_SERVER_EXIT_UNCONFIRMED'); server = null;
}
function phaseClock() { assert(freemem() >= 1400 * 1048576, 'RESOURCE_GATE_1400_MIB'); assert(Date.now() < deadline, 'SEQUENCE_DEADLINE'); }
async function child(args, name, maxMs) {
  const stdout = openSync(join(out, name + '.stdout.log'), 'wx'), stderr = openSync(join(out, name + '.stderr.log'), 'wx');
  const p = spawn(process.execPath, args, { cwd: repo, env: childEnv, stdio: ['ignore', stdout, stderr] });
  let timeout = false; const timer = setTimeout(() => { timeout = true; p.kill('SIGTERM'); }, Math.max(1, Math.min(maxMs, deadline - Date.now())));
  try { const status = await new Promise((resolve, reject) => { p.once('error', reject); p.once('exit', (code, signal) => resolve({ code, signal })); }); assert(!timeout && status.code === 0 && status.signal === null, 'PHASE_FAILED_NO_RETRY:' + name); return { pid: p.pid, ...status }; }
  finally { clearTimeout(timer); closeSync(stdout); closeSync(stderr); }
}
function noStrayBrowser() {
  const snapshot = processSnapshot('browser-absence'), decision = browserAbsenceDecision(snapshot);
  (result.cleanup.browserAbsenceDecisions ??= []).push(decision);
  assert(decision.absent, 'OWNED_BROWSER_CLEANUP_UNCONFIRMED:' + decision.status);
}
function cleanupCause(stage, error) {
  // Fixed assertion codes only, never raw environment, URLs or /proc command lines.
  (result.cleanup.failureCauses ??= []).push({ stage, code: String(error.message).split('\n')[0].slice(0, 120) });
}
try {
  phaseClock(); noStrayBrowser();
  result.initCanaryExit = await child(['scripts/evidence/hosted-scenes/namespace-init.mjs', '--canary', join(out, 'reaper-canary')], 'init-canary', 25000);
  const initProof = JSON.parse(readFileSync(join(out, 'reaper-canary/result.json')));
  assert.equal(initProof.state, 'PASS_REAL_ORPHAN_REAPING_SIGNAL_FORWARDING_AND_EXIT_STATUS');
  result.initQualification = { state: initProof.state, resultSha256: hash(readFileSync(join(out, 'reaper-canary/result.json'))) };
  result.initQualification.cleanup = await confirmReleased(); noStrayBrowser();
  for (const scene of spec.scenes) {
    phaseClock(); noStrayBrowser();
    if (scene === 'tb500') {
      const entry = { scene, state: 'STARTED' }; result.phases.push(entry);
      entry.exit = await child(['--max-old-space-size=256', '--import', 'tsx', 'scripts/evidence/hosted-scenes/tb500-scene.mjs', '--repo', repo, '--input', context.staticRoot, '--out', join(out, 'tb500')], 'tb500', 120000);
      const proof = JSON.parse(readFileSync(join(out, 'tb500/result.json')));
      assert.equal(proof.state, 'OBSERVED_ONE_SUPPLEMENT_NOT_YET_VISUALLY_ACCEPTED');
      for (const key of ['page', 'connection', 'browserExitObserved', 'profileAbsent', 'previewClosed']) assert.equal(proof.cleanup[key], true, 'TB500_CLEANUP:' + key);
      entry.cleanup = await confirmReleased(); noStrayBrowser(); entry.state = 'OBSERVED_NOT_VISUALLY_ACCEPTED'; entry.resultSha256 = hash(readFileSync(join(out, 'tb500/result.json')));
    } else {
      const entry = { scene, state: 'STARTED' }; result.phases.push(entry);
      const stdout = openSync(join(out, 'studio-server.stdout.log'), 'wx'), stderr = openSync(join(out, 'studio-server.stderr.log'), 'wx');
      server = spawn(process.execPath, ['--max-old-space-size=256', '--import', 'tsx', 'scripts/preview-product-studio.ts', '--port', '52943', '--dist-dir', context.dist], { cwd: repo, env: childEnv, stdio: ['ignore', stdout, stderr] }); closeSync(stdout); closeSync(stderr);
      let ready = false;
      for (let i = 0; i < 80; i++) { assert(server.exitCode === null, 'STUDIO_SERVER_EARLY_EXIT'); try { const r = await fetch('http://127.0.0.1:52943/__product_studio_fixture', { redirect: 'error', signal: AbortSignal.timeout(500) }); if (r.status === 200) { const b = await r.json(); assert.equal(b.source, SOURCE); assert.equal(b.tree, TREE); ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
      assert(ready, 'STUDIO_SERVER_NOT_READY');
      entry.exit = await child(['--max-old-space-size=256', 'scripts/evidence/product-studio-browser.mjs', '--base-url', 'http://127.0.0.1:52943', '--dist-dir', context.dist, '--out-dir', join(out, 'studio')], 'studio', 135000);
      const proof = JSON.parse(readFileSync(join(out, 'studio/product-studio-browser-result.json'))); assert.equal(proof.status, 'PASS_SYNTHETIC_BROWSER_ONLY');
      entry.state = 'PASS_SYNTHETIC_BROWSER_ONLY'; entry.resultSha256 = hash(readFileSync(join(out, 'studio/product-studio-browser-result.json')));
      await stopServer();
      entry.cleanup = await confirmReleased();
      noStrayBrowser();
      entry.cleanup.pageAndCdp = 'RELEASE_BY_OBSERVED_BROWSER_AND_DRIVER_PROCESS_EXIT_NOT_CALL_SUCCESS_CLAIM';
      entry.cleanup.previewServerExitObserved = true;
    }
  }
  assertHostedDist(context.dist, SOURCE, TREE); assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '');
  result.state = 'OBSERVED_SELECTED_SCENES_ONLY_NOT_RELEASE_ACCEPTANCE';
} catch (error) { result.state = 'FAILURE_PRESERVED_NO_RETRY'; result.failure = String(error.message).slice(0, 200); process.exitCode = 1; }
finally {
  if (server) { try { await stopServer(); result.cleanup.serverExitObserved = true; } catch (error) { cleanupCause('server-exit', error); result.cleanup.serverExitObserved = false; process.exitCode = 1; } }
  // Give the verified PID1 reaper the existing bounded release-observation
  // interval. Require actual absence; no process state or name is exempted.
  try { result.cleanup.finalOwnedRelease = await confirmReleased(); } catch (error) { cleanupCause('final-owned-release', error); result.state = 'FAILURE_PRESERVED_NO_RETRY'; result.failure ??= 'OWNED_CHILD_OR_PROFILE_RELEASE_UNCONFIRMED'; process.exitCode = 1; }
  try { noStrayBrowser(); result.cleanup.noStrayBrowser = true; } catch (error) { cleanupCause('browser-absence', error); result.cleanup.noStrayBrowser = false; result.state = 'FAILURE_PRESERVED_NO_RETRY'; result.failure ??= 'OWNED_BROWSER_CLEANUP_UNCONFIRMED'; process.exitCode = 1; }
  result.finishedAt = new Date().toISOString(); writeFileSync(join(out, 'sequence-result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
}
