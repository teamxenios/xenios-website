// Isolated actual-candidate controls, not observer adoption or the38 suite.
// Frozen core runs unchanged; an owned-process-only hook selects the real new
// helper instead of the frozen helper. No returned fact/JSON is fabricated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { observeOwner, createCorpusStore } from '../corpus-store.mjs';
import { fixture as actualFixture } from './candidate-fixture.mjs';
import diagnostics from './observer-diagnostics.cjs';

const executable = fileURLToPath(import.meta.url), sourceRoot = path.resolve(path.dirname(executable), '../../..');
const originalHelper = path.join(sourceRoot, 'scripts/agentic/corpus-owner-process.ps1');
const candidateHelper = path.join(sourceRoot, 'scripts/agentic/coordination-qualification/observer-direct-wmi-process.ps1');
const originalExec = childProcess.execFileSync, args = process.argv.slice(2), frozenSha = '8bf5db291a77a1f5e49055f7cad605f00a5052cc';
const managementIdentity = 'System.Management, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a';
const stageNames = new Set(['runtime', 'authority_path', 'fixed_ntfs', 'serializer_selfcheck', 'management_assembly',
  'management_load_before', 'management_load_after', 'management_identity_validated', 'local_scope', 'operating_system', 'process', 'serialization', 'serialization_after']);
const sha = value => createHash('sha256').update(value).digest('hex');
const normal = value => path.resolve(value).toLowerCase();
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function sourceReceipt(expectedSha) {
  const git = values => originalExec('git', values, { cwd: sourceRoot, windowsHide: true, timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), expectedSha); assert.equal(git(['status', '--porcelain']).toString(), '');
  const frozen = ['scripts/agentic/corpus-owner-process.ps1', 'scripts/agentic/corpus-store.mjs', 'scripts/agentic/xenios-os.mjs', 'scripts/agentic/path-overlap.mjs'];
  const files = [...frozen, 'scripts/agentic/coordination-qualification/observer-direct-wmi-process.ps1',
    'scripts/agentic/coordination-qualification/observer-direct-wmi-preflight.mjs',
    'scripts/agentic/coordination-qualification/candidate-fixture.mjs', 'scripts/agentic/coordination-qualification/observer-diagnostics.cjs'].map(file => {
    const actual = fs.readFileSync(path.join(sourceRoot, file)), committed = git(['cat-file', 'blob', expectedSha + ':' + file]);
    assert(Buffer.from(actual.toString('utf8').replaceAll('\r\n', '\n')).equals(committed), 'Uncommitted source');
    if (frozen.includes(file)) assert(committed.equals(git(['cat-file', 'blob', frozenSha + ':' + file])), 'Frozen core changed');
    return { file, rawSha256: sha(actual), committedSha256: sha(committed) };
  });
  const helperSource = fs.readFileSync(candidateHelper, 'utf8');
  assert(!/\b(?:Add-Type|ConvertTo-Json|Import-Module|New-Object)\b/i.test(helperSource), 'Candidate reintroduced utility command dependency');
  assert(helperSource.includes(managementIdentity) && helperSource.includes('[Reflection.Assembly]::Load($managementIdentity)'));
  assert(helperSource.includes('$managementAssembly.GlobalAssemblyCache') && helperSource.includes('$managementAssembly.IsDynamic'));
  assert(!/LoadFrom|LoadFile|LoadWithPartialName|AssemblyResolve|PSModuleAutoLoadingPreference/.test(helperSource));
  assert(helperSource.includes('function Json-String') && helperSource.includes("Emit-Stage 'serializer_selfcheck'"));
  return { sourceSha: expectedSha, frozenSha, files, observedAt: new Date().toISOString(),
    candidateSourceContract: { kind: 'static_source_assertions_not_runtime_proof', utilityCommandsAbsent: true,
      managementIdentity, gacAndExactIdentityRequired: true, explicitPathOrPartialLoadFallback: false,
      defaultContextNonGacResultRefused: true, primitiveAsciiSerializerRequired: true } };
}
function stageEvidence(stderr) {
  const text = Buffer.from(stderr ?? '').toString('utf8');
  const stages = [...text.matchAll(/^XENIOS_DIRECT_WMI_STAGE ([a-z_]+)\r?$/gm)].map(match => match[1]).filter(stage => stageNames.has(stage));
  const timings = [...text.matchAll(/^XENIOS_DIRECT_WMI_ELAPSED ([a-z_]+) (\d{1,12})\r?$/gm)]
    .filter(match => stageNames.has(match[1])).map(match => ({ stage: match[1], scriptElapsedMilliseconds: Number(match[2]) }));
  const before = timings.filter(value => value.stage === 'management_load_before'), after = timings.filter(value => value.stage === 'management_load_after');
  return { stages, timings, monotonic: timings.every((value, index) => index === 0 || value.scriptElapsedMilliseconds >= timings[index - 1].scriptElapsedMilliseconds),
    assemblyLoadMilliseconds: before.length === 1 && after.length === 1 ? after[0].scriptElapsedMilliseconds - before[0].scriptElapsedMilliseconds : null };
}
function wireContract(stdout) {
  const bytes = Buffer.from(stdout ?? ''); let value = null;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { /* No raw content enters diagnostics. */ }
  const successKeys = ['schemaVersion', 'stage', 'available', 'platform', 'hostId', 'bootId', 'fileSystem', 'localFixedDrive', 'pid', 'found', 'birthId'];
  const exactKeys = value && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(successKeys.sort());
  const canonicalDate = text => typeof text === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}0Z$/.test(text) && Number.isFinite(Date.parse(text));
  const validSuccess = !!exactKeys && value.schemaVersion === 1 && value.stage === 'complete' && value.available === true
    && value.platform === 'win32' && typeof value.hostId === 'string' && value.hostId.length > 0 && canonicalDate(value.bootId)
    && value.fileSystem === 'NTFS' && value.localFixedDrive === true && Number.isSafeInteger(value.pid) && value.pid > 0
    && typeof value.found === 'boolean' && (value.found ? canonicalDate(value.birthId) : value.birthId === null);
  return { value, evidence: { parseable: value !== null, asciiOnly: bytes.every(byte => byte < 128), exactSuccessKeys: !!exactKeys, validSuccessSchema: validSuccess } };
}
function owned(root) {
  const physical = fs.realpathSync(root), temp = fs.realpathSync(os.tmpdir());
  assert(normal(physical).startsWith(normal(temp) + path.sep));
  assert(path.basename(physical).startsWith('xenios-direct-wmi-') && !fs.lstatSync(physical).isSymbolicLink());
  const marker = json(path.join(physical, 'fixture-owner.json'));
  assert.equal(marker.kind, 'direct-wmi-preflight-v1'); assert(/^[a-f0-9-]{36}$/.test(marker.runId));
  return { root: physical, marker };
}
function launch(values, env, timeoutMs, ipc = false) {
  const child = childProcess.spawn(process.execPath, [executable, ...values], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])] });
  const record = { pid: child.pid, startedAt: new Date().toISOString(), exited: false, exitCode: null, signal: null, timedOut: false,
    completeOutput: true, stdout: '', stderr: '' };
  for (const key of ['stdout', 'stderr']) child[key].on('data', bytes => {
    record[key] += bytes.toString('utf8');
    if (Buffer.byteLength(record.stdout + record.stderr) > 1_000_000) { record.completeOutput = false; child.kill('SIGKILL'); }
    if (key === 'stderr') process.stderr.write(bytes);
  });
  const timer = setTimeout(() => { record.timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
  let failed = false;
  const done = new Promise(resolve => {
    child.once('error', error => { failed = true; record.launchCode = ['ENOENT', 'EACCES', 'EPERM'].includes(error.code) ? error.code : 'launch_unavailable'; });
    child.once('close', (exitCode, signal) => { clearTimeout(timer); Object.assign(record,
      { exited: !failed, exitCode, signal, finishedAt: new Date().toISOString() }); resolve(record); });
  });
  return { child, record, done };
}
async function worker(root) {
  let scope = null, subject = null, selected = null, active = 'setup', hookInstalled = false;
  const result = { kind: 'direct-wmi-candidate-controls-not-adoption', runId: null, workerPid: process.pid, startedAt: new Date().toISOString(),
    controls: [], helperCalls: [], passed: false, helperSourceChanged: false, coreSourceChanged: false, productionObserverSelectedByRuntime: false,
    historicalCimProducerParityQualified: false };
  const allowedPids = new Set([process.pid]);
  const control = async (name, callback) => {
    active = name; const record = { name, result: 'RUNNING', startedAt: new Date().toISOString() }; result.controls.push(record);
    try { const evidence = await callback(); record.result = 'PASS'; record.evidence = evidence ?? null; }
    catch (error) { record.result = 'FAIL'; record.code = typeof error.code === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(error.code) ? error.code : 'control_unavailable'; throw error; }
    finally { record.finishedAt = new Date().toISOString(); }
  };
  try {
    selected = owned(root); result.runId = selected.marker.runId; assert.equal(selected.marker.orchestratorPid, process.ppid);
    const allowed = new Set(['systemroot', 'windir', 'path', 'pathext', 'temp', 'tmp', 'homedrive', 'homepath', 'logonserver', 'systemdrive', 'userdomain', 'username', 'userprofile']);
    result.observedEnvironmentKeyNames = Object.keys(process.env).sort();
    assert(result.observedEnvironmentKeyNames.every(key => allowed.has(key.toLowerCase()))); assert(!result.observedEnvironmentKeyNames.some(key => key.toLowerCase() === 'os'));
    const scenario = 'direct-WMI-frozen-store-controls-' + selected.marker.runId;
    const authorityOwned = authority => {
      if (normal(fs.realpathSync(authority)) === normal(selected.root)) return true;
      const candidateRoot = path.dirname(path.dirname(authority)), markerFile = path.join(candidateRoot, 'fixture-owner.json');
      assert(normal(fs.realpathSync(candidateRoot)).startsWith(normal(fs.realpathSync(os.tmpdir())) + path.sep));
      assert(path.basename(candidateRoot).startsWith('xenios-coordination-candidate-') && !fs.lstatSync(candidateRoot).isSymbolicLink());
      assert(normal(fs.realpathSync(authority)).startsWith(normal(fs.realpathSync(candidateRoot)) + path.sep));
      assert(!fs.lstatSync(authority).isSymbolicLink() && !fs.lstatSync(path.dirname(authority)).isSymbolicLink());
      const marker = json(markerFile); assert.equal(marker.kind, 'xenios-coordination-candidate-v1'); assert.equal(marker.scenario, scenario);
      assert.equal(normal(marker.corpusRoot), normal(authority)); return true;
    };
    childProcess.execFileSync = function (file, values, options) {
      if (path.basename(String(file)).toLowerCase() !== 'powershell.exe' || !Array.isArray(values) || normal(String(values[3] ?? '')) !== normal(originalHelper))
        return originalExec.call(childProcess, file, values, options);
      assert.equal(values.length, 8); assert.deepEqual(values.slice(0, 3), ['-NoProfile', '-NonInteractive', '-File']);
      assert.equal(values[4], '-OwnerProcessId'); assert.equal(values[6], '-AuthorityPath');
      assert(allowedPids.has(Number(values[5])) && authorityOwned(values[7]));
      assert.equal(options.timeout, 8_000); assert.equal(options.maxBuffer, 64_000); assert.equal(options.windowsHide, true);
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']); assert.equal(options.env, undefined);
      const invocationId = randomUUID(), started = process.hrtime.bigint(); let stdout, failure;
      try { stdout = originalExec.call(childProcess, file, [...values.slice(0, 3), candidateHelper, ...values.slice(4)], options); return stdout; }
      catch (error) { failure = error; throw error; }
      finally {
        const diagnostic = diagnostics.invocation({ stdout: failure?.stdout ?? stdout, stderr: failure?.stderr, error: failure,
          subjectPid: Number(values[5]), elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6 });
        const evidence = stageEvidence(failure?.stderr);
        const row = { invocationId, control: active, diagnostic, stagesOnFailure: evidence.stages, stageTimingOnFailure: evidence,
          exited: !failure || Number.isInteger(failure.status) || typeof failure.signal === 'string',
          helperPid: Number.isInteger(failure?.pid) ? failure.pid : null,
          custody: 'actual execFileSync invocation; success hides helper PID; no PID lookup/post-return kill' };
        result.helperCalls.push(row); console.error('XENIOS_DIRECT_WMI_DIAGNOSTIC ' + JSON.stringify(row));
      }
    };
    syncBuiltinESMExports(); hookInstalled = true;
    let ownFacts, liveFacts;
    await control('actual_current_owner', () => {
      // A single direct diagnostic call retains stderr even on success, unlike
      // execFileSync. Its real facts must then equal the frozen observer API's
      // independently obtained candidate facts. Failure stops before a repeat.
      const started = process.hrtime.bigint();
      const probe = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', candidateHelper,
        '-OwnerProcessId', String(process.pid), '-AuthorityPath', selected.root],
      { windowsHide: true, timeout: 8_000, maxBuffer: 64_000, stdio: ['ignore', 'pipe', 'pipe'] });
      const error = probe.error ? { code: probe.error.code, status: probe.status, signal: probe.signal, pid: probe.pid }
        : probe.status !== 0 || probe.signal ? { status: probe.status, signal: probe.signal, pid: probe.pid } : null;
      const wire = wireContract(probe.stdout), timing = stageEvidence(probe.stderr);
      result.loaderProbe = { pid: Number.isInteger(probe.pid) && probe.pid > 0 ? probe.pid : null, exited: Number.isInteger(probe.status) || typeof probe.signal === 'string',
        exitCode: probe.status, signal: probe.signal,
        diagnostic: diagnostics.invocation({ stdout: probe.stdout, stderr: probe.stderr, error, subjectPid: process.pid,
          elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6 }),
        stageEvidence: timing, wireContract: wire.evidence, authorityFactsRecorded: false };
      console.error('XENIOS_DIRECT_WMI_LOADER_PROBE ' + JSON.stringify(result.loaderProbe));
      assert(result.loaderProbe.pid > 0 && result.loaderProbe.exited && !probe.error && probe.status === 0 && wire.evidence.validSuccessSchema && wire.evidence.asciiOnly);
      assert(timing.monotonic && timing.stages.includes('management_identity_validated') && timing.stages.includes('serialization_after'));
      assert(timing.assemblyLoadMilliseconds !== null && timing.assemblyLoadMilliseconds >= 0);
      ownFacts = observeOwner(process.pid, selected.root); assert.equal(ownFacts.found, true);
      assert.deepEqual(ownFacts, wire.value);
      assert.equal(ownFacts.pid, process.pid); assert(/\.\d{6}0Z$/.test(ownFacts.birthId));
      return { pid: process.pid, found: true, canonicalUtcShape: true };
    });
    put(path.join(selected.root, 'worker-owner.json'), { runId: result.runId, workerPid: process.pid });
    subject = launch(['--held-child', selected.root], process.env, 20_000, true); allowedPids.add(subject.child.pid);
    await Promise.race([new Promise((resolve, reject) => subject.child.once('message', message => {
      try { assert.equal(message.runId, result.runId); assert.equal(message.pid, subject.child.pid); resolve(); } catch (error) { reject(error); }
    })), subject.done.then(() => { throw new Error('subject_exited_before_ready'); })]);
    await control('actual_owned_live_process', () => {
      liveFacts = observeOwner(subject.child.pid, selected.root); assert.equal(liveFacts.found, true);
      assert.equal(liveFacts.hostId, ownFacts.hostId); assert.equal(liveFacts.bootId, ownFacts.bootId);
      return { pid: subject.child.pid, found: true, sameBootAndHost: true };
    });
    subject.child.send({ kind: 'exit', runId: result.runId }); await subject.done; assert.equal(subject.record.exitCode, 0);
    await control('actual_exited_original_process', () => {
      const gone = observeOwner(subject.child.pid, selected.root);
      assert(!gone.found || gone.birthId !== liveFacts.birthId);
      return { pid: subject.child.pid, originalProcessGone: true, pidReused: gone.found };
    });
    await control('boot_and_birth_stable_across_fresh_helpers', () => {
      const repeated = observeOwner(process.pid, selected.root); assert.equal(repeated.bootId, ownFacts.bootId);
      assert.equal(repeated.hostId, ownFacts.hostId); assert.equal(repeated.birthId, ownFacts.birthId);
      return { exactBootEquality: true, exactBirthEquality: true };
    });
    active = 'frozen_fixture_setup'; scope = actualFixture(scenario);
    active = 'frozen_store_construction'; const store = createCorpusStore(scope.main);
    const namespace = { platform: ownFacts.platform, hostId: ownFacts.hostId, bootId: ownFacts.bootId, fileSystem: ownFacts.fileSystem };
    const mutex = path.join(scope.meta, 'mutex');
    const markerBytes = (token, birth = ownFacts.birthId, ns = namespace) => Buffer.from(JSON.stringify({ protocol: 1, token, pid: process.pid, birthId: birth, namespace: ns }) + '\n');
    const install = (fileToken, bytes) => { assert(!fs.existsSync(mutex)); fs.mkdirSync(mutex); const file = path.join(mutex, 'owner-' + fileToken + '.json'); fs.writeFileSync(file, bytes, { flag: 'wx' }); return file; };
    const clear = (file, bytes) => { assert.deepEqual(fs.readdirSync(mutex), [path.basename(file)]); assert(fs.readFileSync(file).equals(bytes)); fs.unlinkSync(file); fs.rmdirSync(mutex); };
    await control('frozen_core_live_birth_preserves_mutex', async () => {
      const token = randomUUID(), bytes = markerBytes(token), file = install(token, bytes);
      try { await assert.rejects(store.read(() => true), error => error.code === 'coordination_busy'); assert(fs.readFileSync(file).equals(bytes)); }
      finally { clear(file, bytes); }
      return { unchangedLiveOwnerMarker: true, deniedByActualCore: true };
    });
    await control('frozen_core_wrong_birth_reclaims_only_old_token', async () => {
      const token = randomUUID(), wrongBirth = new Date(Date.parse(ownFacts.birthId) + 1).toISOString();
      assert.notEqual(wrongBirth, ownFacts.birthId); assert(Date.parse(wrongBirth) <= Date.now());
      const file = install(token, markerBytes(token, wrongBirth));
      const read = await store.read(() => true); assert.equal(read.coordination.revision, 0); assert(!fs.existsSync(file)); assert(!fs.existsSync(mutex));
      return { livePidDifferentRecordedBirth: true, actualCoreReadSucceeded: true, revision: 0 };
    });
    await control('frozen_core_token_path_mismatch_refuses', async () => {
      const bytes = markerBytes(randomUUID()), file = install(randomUUID(), bytes);
      try { await assert.rejects(store.read(() => true), error => error.code === 'unknown_coordination_owner'); assert(fs.readFileSync(file).equals(bytes)); }
      finally { clear(file, bytes); }
      return { mismatchedTokenPreserved: true, deniedByActualCore: true };
    });
    await control('frozen_core_different_boot_namespace_refuses', async () => {
      const token = randomUUID(), bytes = markerBytes(token, ownFacts.birthId, { ...namespace, bootId: new Date(Date.parse(ownFacts.bootId) + 1).toISOString() });
      const file = install(token, bytes);
      try { await assert.rejects(store.read(() => true), error => error.code === 'unknown_coordination_owner'); assert(fs.readFileSync(file).equals(bytes)); }
      finally { clear(file, bytes); }
      return { unknownBootPreserved: true, deniedByActualCore: true };
    });
    await control('frozen_core_authority_nonce_mismatch_refuses', async () => {
      const file = path.join(scope.meta, 'HEAD.json'), before = fs.readFileSync(file);
      const changed = Buffer.from(JSON.stringify({ ...JSON.parse(before), authorityId: randomUUID() }) + '\n');
      fs.writeFileSync(file, changed);
      try { await assert.rejects(store.read(() => true), error => error.code === 'invalid_corpus_head'); }
      finally { assert(fs.readFileSync(file).equals(changed)); fs.writeFileSync(file, before); }
      return { wrongAuthorityNonceRefused: true, deniedByActualCore: true, originalHeadRestored: true };
    });
    const final = await store.read(() => true); assert.equal(final.coordination.revision, 0); assert.equal(scope.head().revision, 0);
    result.syntheticFixtureRoot = scope.root; result.syntheticAuthorityOnly = true; result.passed = result.controls.length === 9 && result.controls.every(item => item.result === 'PASS');
  } catch (error) {
    result.failedStage = active; result.errorCode = typeof error.code === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(error.code) ? error.code : 'preflight_unavailable';
  } finally {
    result.cleanupFailures = [];
    try { if (hookInstalled) { childProcess.execFileSync = originalExec; syncBuiltinESMExports(); } }
    catch { result.cleanupFailures.push('helper_hook_restore_failed'); }
    result.helperPathHookRestored = childProcess.execFileSync === originalExec;
    try { if (subject) { if (!subject.record.exited) subject.child.kill('SIGKILL'); await subject.done; result.subjectProcess = subject.record; } }
    catch { result.cleanupFailures.push('owned_subject_cleanup_failed'); }
    try { if (scope) await scope.close(); } catch { result.cleanupFailures.push('synthetic_fixture_receipt_failed'); }
    result.allReportedSynchronousHelpersExited = result.helperCalls.every(item => item.exited) && (!result.loaderProbe || result.loaderProbe.exited);
    result.finishedAt = new Date().toISOString(); result.passed = result.passed && result.cleanupFailures.length === 0 && result.helperPathHookRestored
      && result.allReportedSynchronousHelpersExited && (!subject || subject.record.exited);
    console.error('XENIOS_DIRECT_WMI_WORKER_RESULT ' + JSON.stringify(result));
    if (selected) put(path.join(selected.root, 'worker-result.json'), result);
    process.exitCode = result.passed ? 0 : 1;
  }
}
async function orchestrate() {
  assert.equal(process.platform, 'win32'); assert.equal(process.versions.node, '20.19.0');
  assert.equal(args.length, 4); assert.equal(args[0], '--expect-sha'); assert(/^[a-f0-9]{40}$/.test(args[1])); assert.equal(args[2], '--receipt');
  const parent = fs.realpathSync(path.dirname(path.resolve(args[3]))), receiptFile = path.join(parent, path.basename(args[3]));
  assert(!normal(parent).startsWith(normal(fs.realpathSync(sourceRoot)) + path.sep) && normal(parent) !== normal(fs.realpathSync(sourceRoot)));
  assert(!fs.lstatSync(parent).isSymbolicLink() && !fs.existsSync(receiptFile));
  const before = sourceReceipt(args[1]), root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'xenios-direct-wmi-'))), runId = randomUUID();
  put(path.join(root, 'fixture-owner.json'), { kind: 'direct-wmi-preflight-v1', runId, orchestratorPid: process.pid });
  const minimal = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const handle = launch(['--worker', root], minimal, 90_000); await handle.done;
  let result = null, workerResultFailureCode = null;
  try { result = json(path.join(root, 'worker-result.json')); } catch { workerResultFailureCode = 'worker_result_missing_unreadable_or_invalid'; }
  let after = null, sourceUnchanged = false;
  try { after = sourceReceipt(args[1]); assert.deepEqual(after.files, before.files); sourceUnchanged = true; } catch { /* Preserve exits/diagnostics. */ }
  const receipt = { kind: 'direct-wmi-candidate-not-live-adoption-or38', sourceBefore: before, sourceAfter: after, sourceUnchanged,
    runId, fixtureRoot: root, retained: true, explicitSuppliedEnvironmentKeyNames: Object.keys(minimal).sort(), workerProcess: handle.record,
    result, workerResultFailureCode, passed: sourceUnchanged && handle.record.exitCode === 0 && result?.passed === true,
    limits: ['Each actual helper keeps frozen8000ms timeout; worker is capped90s; OS stalls require an outer hosted timeout.',
      'Successful execFileSync proves synchronous completion but does not expose helper PID or kernel birth; unknown fast children are not individually proved.',
      'Missing worker result leaves descendant exits unverified. No PID lookup or process-name kill.',
      'UTC shape/two conversion equality are checked; original CIM producer parity remains unqualified while its transport is unavailable.',
      'Only new marked synthetic corpus/binding files are used; current authority, controller and task registry are untouched.'] };
  put(receiptFile, receipt); console.log(JSON.stringify({ receipt: receiptFile, passed: receipt.passed, controls: result?.controls?.length ?? 0,
    helperCalls: result?.helperCalls?.length ?? 0, sourceUnchanged })); process.exitCode = receipt.passed ? 0 : 1;
}
try {
  if (args[0] === '--worker') await worker(args[1]);
  else if (args[0] === '--held-child') {
    const selected = owned(args[1]), owner = json(path.join(selected.root, 'worker-owner.json'));
    assert.equal(owner.runId, selected.marker.runId); assert.equal(owner.workerPid, process.ppid); assert(process.send);
    process.on('disconnect', () => process.exit(0)); process.on('message', message => { if (message?.kind === 'exit' && message.runId === owner.runId) process.exit(0); });
    setTimeout(() => process.exit(88), 18_000); process.send({ runId: owner.runId, pid: process.pid });
  } else await orchestrate();
} catch (error) { console.error(JSON.stringify({ ok: false, code: typeof error.code === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(error.code) ? error.code : 'direct_wmi_preflight_unavailable' })); process.exitCode = 1; }
