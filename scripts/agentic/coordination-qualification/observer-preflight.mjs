// Diagnostic pair only. No corpus binding, registry, task, or protocol acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contentHash, REQUIRED_NODE } from '../corpus-store.mjs';
import observerDiagnostics from './observer-diagnostics.cjs';

const executable = fileURLToPath(import.meta.url), sourceRoot = path.resolve(path.dirname(executable), '../../..');
const args = process.argv.slice(2), frozenSha = '8bf5db291a77a1f5e49055f7cad605f00a5052cc';
const originalRelative = 'scripts/agentic/corpus-owner-process.ps1';
const taggedRelative = 'scripts/agentic/coordination-qualification/observer-diagnostic-process.ps1';
const stageNames = ['runtime_before', 'runtime_after', 'authority_before', 'authority_after', 'fixed_ntfs_before', 'fixed_ntfs_after',
  'os_cim_before', 'os_cim_after', 'process_cim_before', 'process_cim_after', 'serialization_before', 'serialization_after', 'caught_error'];
const insertionLines = new Set(stageNames.map(stage => `  try { [Console]::Error.WriteLine('XENIOS_OBSERVER_STAGE_V1 ${stage}') } catch { } # XENIOS_DIAGNOSTIC_INSERTION`));
const normalize = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function copyReceipt() {
  const original = normalize(fs.readFileSync(path.join(sourceRoot, originalRelative)));
  const tagged = normalize(fs.readFileSync(path.join(sourceRoot, taggedRelative)));
  const counts = new Map([...insertionLines].map(line => [line, 0]));
  const stripped = Buffer.from(tagged.toString('utf8').split('\n').filter(line => {
    if (!insertionLines.has(line)) return true;
    counts.set(line, counts.get(line) + 1); return false;
  }).join('\n'));
  assert([...counts.values()].every(value => value === 1), 'Each exact known insertion must occur once');
  assert(stripped.equals(original), 'Tagged copy changes more than exact known stderr insertion lines');
  return { originalNormalizedSha256: contentHash(original), taggedNormalizedSha256: contentHash(tagged),
    strippedNormalizedSha256: contentHash(stripped), exactKnownInsertions: counts.size, originalEqualsStripped: true };
}
function sourceReceipt(expectedSha) {
  const git = values => execFileSync('git', values, { cwd: sourceRoot, windowsHide: true, timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const head = git(['rev-parse', 'HEAD']).toString().trim(); assert.equal(head, expectedSha);
  assert.equal(git(['status', '--porcelain']).toString(), '', 'Exact source must be clean');
  const frozenOriginal = git(['cat-file', 'blob', frozenSha + ':' + originalRelative]);
  assert(normalize(fs.readFileSync(path.join(sourceRoot, originalRelative))).equals(frozenOriginal), 'Frozen observer changed');
  const files = [originalRelative, taggedRelative, 'scripts/agentic/corpus-store.mjs',
    'scripts/agentic/coordination-qualification/observer-diagnostics.cjs',
    'scripts/agentic/coordination-qualification/observer-preflight.mjs'].map(file => {
    const actual = fs.readFileSync(path.join(sourceRoot, file)), committed = git(['cat-file', 'blob', head + ':' + file]);
    assert(normalize(actual).equals(committed), 'Uncommitted preflight source');
    return { file, rawSha256: contentHash(actual), committedSha256: contentHash(committed) };
  });
  return { head, frozenOriginalSha: frozenSha, files, copy: copyReceipt(), observedAt: new Date().toISOString() };
}
function ownedDirectory(root) {
  const resolved = fs.realpathSync(root), temp = fs.realpathSync(os.tmpdir());
  assert(resolved.toLowerCase().startsWith(temp.toLowerCase() + path.sep));
  assert(path.basename(resolved).startsWith('xenios-owner-preflight-'));
  assert(!fs.lstatSync(resolved).isSymbolicLink());
  const marker = json(path.join(resolved, 'fixture-owner.json'));
  assert.equal(marker.kind, 'xenios-owner-diagnostic-preflight-v1');
  return { root: resolved, marker };
}
function runHelper(label, relative, fixture) {
  const started = process.hrtime.bigint(), startedAt = new Date().toISOString();
  // Same executable, PowerShell args, inherited six-key environment, 8s timeout,
  // output cap and pipe options as observeOwner. spawnSync also returns the
  // actual helper PID/status on success; this is a tool probe, not a core call.
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(sourceRoot, relative),
    '-OwnerProcessId', String(process.pid), '-AuthorityPath', fixture.root],
  { windowsHide: true, timeout: 8_000, maxBuffer: 64_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const error = result.error ? { code: result.error.code, pid: result.pid, status: result.status, signal: result.signal }
    : result.status !== 0 || result.signal ? { pid: result.pid, status: result.status, signal: result.signal } : null;
  const diagnostic = observerDiagnostics.invocation({ stdout: result.stdout, stderr: result.stderr, error,
    subjectPid: process.pid, elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6 });
  const stderrLines = Buffer.from(result.stderr ?? '').toString('utf8').split(/\r?\n/).filter(Boolean);
  const stageTokens = [], unrecognized = [];
  for (const line of stderrLines) {
    const stage = line.startsWith('XENIOS_OBSERVER_STAGE_V1 ') ? line.slice('XENIOS_OBSERVER_STAGE_V1 '.length) : null;
    if (stageNames.includes(stage)) stageTokens.push(stage); else unrecognized.push(true);
  }
  const exited = Number.isInteger(result.status) || typeof result.signal === 'string';
  const succeeded = exited && result.status === 0 && diagnostic.helper.available === true
    && diagnostic.helper.schemaVersion === 1 && diagnostic.helper.stage === 'complete'
    && diagnostic.helper.pid === process.pid && diagnostic.helper.found === true;
  const record = { label, helperRelativeSource: relative, pid: Number.isInteger(result.pid) ? result.pid : null,
    startedAt, finishedAt: new Date().toISOString(), exited, exitCode: result.status, signal: result.signal,
    timedOut: result.error?.code === 'ETIMEDOUT', succeeded, diagnostic, fixedStageTokens: stageTokens,
    lastFixedStage: stageTokens.at(-1) ?? null, unrecognizedStderrLineCount: unrecognized.length,
    processCustody: 'actual owned spawnSync invocation; no PID lookup or post-return kill; kernel birth not sampled' };
  console.error('XENIOS_OWNER_PREFLIGHT_DIAGNOSTIC ' + JSON.stringify(record));
  return { record, stdout: Buffer.from(result.stdout ?? '') };
}
async function worker(root) {
  const explicitBase = new Set(['systemroot', 'windir', 'path', 'pathext', 'temp', 'tmp']);
  // Node20.19's pinned Windows libuv adds missing required keys even when env is
  // explicit: https://github.com/nodejs/node/blob/v20.19.0/deps/uv/src/win/process.c
  const runtimeRequired = new Set(['homedrive', 'homepath', 'logonserver', 'path', 'systemdrive',
    'systemroot', 'temp', 'userdomain', 'username', 'userprofile', 'windir']);
  const observedKeys = Object.keys(process.env).sort(); // Names only, never values.
  let fixture = null, activeGuard = null;
  const result = { schemaVersion: 2, kind: 'diagnostic-helper-pair-not-protocol-qualification', runId: null,
    workerPid: process.pid, observations: [], probeCompleted: false, helperPairSucceeded: false,
    startedAt: new Date().toISOString(), copiedObserverSource: null, preconditions: [], failedPrecondition: null,
    environment: { observedKeyNames: observedKeys, explicitSuppliedKeyNames: null,
      runtimeRequiredKeyNames: [...runtimeRequired].sort(), observedRuntimeAddedKeyNames: null,
      unknownExtraKeyNames: observedKeys.filter(key => !explicitBase.has(key.toLowerCase()) && !runtimeRequired.has(key.toLowerCase())) } };
  const guard = (name, check) => {
    activeGuard = name; check(); result.preconditions.push({ name, passed: true }); activeGuard = null;
  };
  try {
    guard('owned_fixture_directory', () => { fixture = ownedDirectory(root); });
    result.runId = fixture.marker.runId;
    guard('orchestrator_parent', () => assert.equal(fixture.marker.orchestratorPid, process.ppid));
    guard('explicit_environment_metadata', () => {
      const supplied = fixture.marker.explicitSuppliedEnvironmentKeyNames;
      assert(Array.isArray(supplied) && supplied.every(key => typeof key === 'string' && explicitBase.has(key.toLowerCase())));
      assert.equal(new Set(supplied.map(key => key.toLowerCase())).size, supplied.length);
      result.environment.explicitSuppliedKeyNames = supplied;
      const suppliedSet = new Set(supplied.map(key => key.toLowerCase()));
      result.environment.observedRuntimeAddedKeyNames = observedKeys.filter(key => !suppliedSet.has(key.toLowerCase()));
    });
    guard('received_environment_keys', () => assert.equal(result.environment.unknownExtraKeyNames.length, 0));
    guard('os_label_absent', () => assert(!observedKeys.some(key => key.toLowerCase() === 'os')));
    guard('tagged_source_preserved', () => { result.copiedObserverSource = copyReceipt(); });
    const original = runHelper('frozen_original', originalRelative, fixture); result.observations.push(original.record);
    const tagged = runHelper('tagged_diagnostic_copy', taggedRelative, fixture); result.observations.push(tagged.record);
    result.allOwnedHelpersExited = result.observations.every(value => value.exited && value.pid > 0);
    result.probeCompleted = result.observations.length === 2 && result.allOwnedHelpersExited;
    result.stdoutEqualWhenBothSucceeded = original.record.succeeded && tagged.record.succeeded ? original.stdout.equals(tagged.stdout) : null;
    result.helperPairSucceeded = result.probeCompleted && result.observations.every(value => value.succeeded)
      && result.stdoutEqualWhenBothSucceeded === true;
  } catch (error) {
    if (activeGuard) {
      result.failedPrecondition = activeGuard; result.preconditions.push({ name: activeGuard, passed: false });
      result.errorCode = 'worker_precondition_' + activeGuard + '_failed';
    } else result.errorCode = typeof error.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'preflight_unavailable';
  }
  finally {
    result.finishedAt = new Date().toISOString();
    // A failed ownership fence gets log evidence, never an unfenced file write.
    // Every later setup guard has a trusted fixture and writes the result too.
    console.error('XENIOS_OWNER_PREFLIGHT_WORKER_RESULT ' + JSON.stringify(result));
    if (fixture) put(path.join(fixture.root, 'worker-result.json'), result);
    console.log(JSON.stringify({ probeCompleted: result.probeCompleted, helperPairSucceeded: result.helperPairSucceeded }));
    process.exitCode = result.helperPairSucceeded ? 0 : 1;
  }
}
async function orchestrate() {
  assert.equal(process.platform, 'win32'); assert.equal(process.versions.node, REQUIRED_NODE);
  assert.equal(args.length, 4); assert.equal(args[0], '--expect-sha'); assert(/^[a-f0-9]{40}$/.test(args[1])); assert.equal(args[2], '--receipt');
  const parent = fs.realpathSync(path.dirname(path.resolve(args[3]))), receiptFile = path.join(parent, path.basename(args[3]));
  const actualSource = fs.realpathSync(sourceRoot).toLowerCase();
  assert(parent.toLowerCase() !== actualSource && !parent.toLowerCase().startsWith(actualSource + path.sep), 'Receipt cannot enter source');
  assert(!fs.existsSync(receiptFile)); assert(!fs.lstatSync(parent).isSymbolicLink());
  const before = sourceReceipt(args[1]);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xenios-owner-preflight-'))), runId = randomUUID();
  const minimal = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  put(path.join(root, 'fixture-owner.json'), { kind: 'xenios-owner-diagnostic-preflight-v1', runId,
    orchestratorPid: process.pid, createdAt: new Date().toISOString(), explicitSuppliedEnvironmentKeyNames: Object.keys(minimal).sort() });
  const child = spawn(process.execPath, [executable, '--diagnostic-worker', root],
    { env: minimal, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const processRecord = { pid: child.pid, startedAt: new Date().toISOString(), exited: false, exitCode: null, signal: null,
    timedOut: false, completeOutput: true, stdout: '', stderr: '' };
  const capture = key => chunk => {
    processRecord[key] += chunk.toString('utf8');
    if (Buffer.byteLength(processRecord.stdout + processRecord.stderr) > 256_000) {
      processRecord.completeOutput = false; child.kill('SIGKILL');
    }
    if (key === 'stderr') process.stderr.write(chunk);
  };
  child.stdout.on('data', capture('stdout')); child.stderr.on('data', capture('stderr'));
  const timeout = setTimeout(() => { processRecord.timedOut = true; child.kill('SIGKILL'); }, 30_000);
  let launchFailed = false;
  await new Promise(resolve => {
    child.once('error', error => { launchFailed = true; processRecord.launchCode = typeof error.code === 'string' ? error.code.slice(0, 80) : null; });
    child.once('close', (exitCode, signal) => { clearTimeout(timeout); Object.assign(processRecord,
      { exited: !launchFailed, exitCode, signal, finishedAt: new Date().toISOString() }); resolve(); });
  });
  const workerFile = path.join(root, 'worker-result.json');
  let result = null, workerResultFailureCode = null;
  try {
    if (fs.existsSync(workerFile)) result = json(workerFile);
    else workerResultFailureCode = 'worker_result_missing';
  } catch { workerResultFailureCode = 'worker_result_unreadable_or_invalid_json'; }
  let after = null, sourceUnchanged = false;
  try { after = sourceReceipt(args[1]); assert.deepEqual(after.files, before.files); sourceUnchanged = true; } catch { /* Preserve failure evidence. */ }
  const receipt = { schemaVersion: 2, kind: 'observer-diagnostic-only-not-corpus-qualification', runId, fixtureRoot: root,
    retained: true, sourceBefore: before, sourceAfter: after, sourceUnchanged, workerProcess: processRecord, result, workerResultFailureCode,
    sequentialWarmupLimit: 'Original runs first, tagged copy second; cache/startup warming may differ. Tagged stages locate only the tagged invocation wait.',
    probeCompleted: sourceUnchanged && processRecord.exited && processRecord.completeOutput && result?.probeCompleted === true,
    helperPairSucceeded: sourceUnchanged && processRecord.exitCode === 0 && result?.helperPairSucceeded === true,
    noBindingOrRegistryMutation: true, noProtocol38OrLiveAdoption: true,
    processCustody: { workerExited: processRecord.exited, helperExitsReported: result?.allOwnedHelpersExited ?? null,
      limit: result ? 'Only owned worker and direct synchronous helpers; no exhaustive descendant proof.' : 'Missing worker result: helper exits unverified.' } };
  put(receiptFile, receipt); console.log(JSON.stringify({ receipt: receiptFile, probeCompleted: receipt.probeCompleted,
    helperPairSucceeded: receipt.helperPairSucceeded })); process.exitCode = receipt.helperPairSucceeded ? 0 : 1;
}
try {
  if (args[0] === '--diagnostic-worker') await worker(args[1]); else await orchestrate();
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: typeof error.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'observer_preflight_unavailable' }));
  process.exitCode = 1;
}
