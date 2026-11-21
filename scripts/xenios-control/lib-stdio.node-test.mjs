import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

// Controlled native child IO only: no installed npm, application, provider,
// live corpus, issuer or client is qualified by these fixtures.
const LIBRARY = new URL('./lib.mjs', import.meta.url);
const AFTER_SHA = '773be3688b764ca45d96ce49e82c2ccdd31dbc70a4ca1bfb7b28c61a052460ff';
const DONOR_SHA = 'a31a0c124797f20eca9f30e2fb4c2488460ef8b633820550ec155a538aab61ca';
const SENTINEL = 'PRIVATE_STDIO_SENTINEL_FIXED_ONLY';
const TEST_MS = 15_000, DRIVER_MS = 8_000, GIT_INIT_MS = 3_000;
const OUTPUT_CAP = 65_536;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const SCENARIOS = ['git-success', 'git-failure', 'npm-success', 'npm-failure', 'npm-invalid', 'npm-timeout'];

const CLI = String.raw`
'use strict';
const mode = process.argv[2];
process.stderr.write('PRIVATE_STDIO_SENTINEL_FIXED_ONLY\n');
if (mode === 'npm-success') process.stdout.write('10.8.2\n');
else if (mode === 'npm-invalid') process.stdout.write('10.8.2-invalid-owned-fixture\n');
else if (mode === 'npm-failure') process.exitCode = 7;
else if (mode === 'npm-timeout') setInterval(() => {}, 1000);
else process.exitCode = 9;
`;

// Fresh owned Node process per sample. Only the fixed version probe is redirected
// to a real controlled CLI; the actual library function and its passed stdio are
// exercised. Git is the actual native Git binary against an owned repository.
// The wrapper adds a fixture-only 2s bound, never a production API or override.
const DRIVER = String.raw`
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import path from 'node:path';
const scenario = process.env.XENIOS_STDIO_FIXTURE_SCENARIO;
const nativeExec = childProcess.execFileSync;
const result = {kind:'OWNED_LIB_STDIO_NATIVE_RESULT', scenario, state:'FIXTURE_REFUSED',
  invocations:0, innerFinished:false, syncCategory:'NOT_RUN', syncExit:null,
  syncSignal:'NONE', value:'NOT_OBSERVED', nodeExact:false, npmExact:false, compatible:false};
try {
  if (!['git-success','git-failure','npm-success','npm-failure','npm-invalid','npm-timeout'].includes(scenario)) throw Error('fixed_scenario_refused');
  childProcess.execFileSync = (executable, args, options) => {
    result.invocations++;
    if (result.invocations !== 1) throw Error('fixed_child_count_refused');
    let selectedExecutable = executable, selectedArgs = args;
    if (scenario.startsWith('git-')) {
      const expected = scenario === 'git-success' ? ['rev-parse','--is-inside-work-tree'] : ['--xenios-owned-intentionally-invalid'];
      if (executable !== 'git' || JSON.stringify(args) !== JSON.stringify(expected)) throw Error('fixed_git_refused');
    } else {
      const expectedCli = path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
      if (executable !== process.execPath || args.length !== 2 || args[0] !== expectedCli || args[1] !== '--version') throw Error('fixed_npm_refused');
      selectedExecutable = process.execPath;
      selectedArgs = [process.env.XENIOS_STDIO_FIXTURE_CLI, scenario];
    }
    try {
      const value = nativeExec(selectedExecutable, selectedArgs, {...options, timeout:2000, killSignal:'SIGKILL'});
      result.innerFinished = true; result.syncCategory = 'OK'; result.syncExit = 0;
      return value;
    } catch (failure) {
      result.innerFinished = true;
      result.syncCategory = failure?.code === 'ETIMEDOUT' ? 'TIMEOUT'
        : Number.isInteger(failure?.status) && failure.status !== 0 ? 'EXIT_NONZERO'
        : typeof failure?.code === 'string' ? 'SPAWN_FAILURE' : 'OTHER';
      result.syncExit = Number.isInteger(failure?.status) && failure.status >= 0 && failure.status <= 255 ? failure.status : null;
      result.syncSignal = failure?.signal === 'SIGKILL' ? 'SIGKILL' : failure?.signal ? 'OTHER' : 'NONE';
      throw failure;
    }
  };
  syncBuiltinESMExports();
  const library = await import(process.env.XENIOS_STDIO_FIXTURE_LIBRARY);
  if (scenario.startsWith('git-')) {
    const args = scenario === 'git-success' ? ['rev-parse','--is-inside-work-tree'] : ['--xenios-owned-intentionally-invalid'];
    const value = library.command(process.cwd(), args, 'OWNED_FIXED_FALLBACK');
    result.value = value === 'true' ? 'GIT_TRUE' : value === 'OWNED_FIXED_FALLBACK' ? 'GIT_FALLBACK' : 'UNEXPECTED_VALUE';
  } else {
    const value = library.currentRuntime();
    result.nodeExact = value.nodeVersion === '20.19.0';
    result.npmExact = value.npmVersion === '10.8.2';
    result.compatible = value.compatible === true;
    result.value = value.npmVersion === 'unavailable' ? 'NPM_UNAVAILABLE'
      : value.npmVersion === '10.8.2' ? 'NPM_EXPECTED'
      : value.npmVersion === '10.8.2-invalid-owned-fixture' ? 'NPM_INVALID' : 'UNEXPECTED_VALUE';
  }
  result.state = 'OBSERVED';
} catch {
  result.state = 'FIXTURE_REFUSED';
} finally {
  childProcess.execFileSync = nativeExec;
  syncBuiltinESMExports();
}
process.stdout.write(JSON.stringify(result)+'\n');
process.exitCode = result.state === 'OBSERVED' && result.innerFinished ? 0 : 1;
`;

function fixedEnvironment(gitConfig) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(?:PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP)$/i.test(key)) env[key] = value;
  }
  return {...env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:gitConfig,
    GIT_TERMINAL_PROMPT:'0', GCM_INTERACTIVE:'Never', GIT_OPTIONAL_LOCKS:'0',
    GIT_NO_REPLACE_OBJECTS:'1', GIT_NO_LAZY_FETCH:'1', LANG:'C', LC_ALL:'C'};
}

// Never return raw child strings to assertions. Both streams stay in memory,
// capped, and only a validated fixed report/booleans/counts leave this helper.
function boundedChild(executable, args, options, deadlineMs) {
  return new Promise(resolve => {
    let child, spawned = false, spawnFailed = false, settled = false;
    let timedOut = false, overflow = false, stdoutBytes = 0, stderrBytes = 0;
    let grace, timer; const stdout = [], stderr = [];
    const finish = (directCloseObserved, exitCode, signal) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(grace);
      if (!directCloseObserved) {
        child?.stdout?.destroy(); child?.stderr?.destroy(); child?.unref();
      }
      resolve({spawned, spawnFailed, timedOut, overflow, directCloseObserved,
        exitCode, signal:signal === null ? 'NONE' : signal === 'SIGKILL' ? 'SIGKILL' : 'OTHER',
        stdoutBytes, stderrBytes, stdout:Buffer.concat(stdout), stderr:Buffer.concat(stderr)});
    };
    const terminate = () => {
      try { child?.kill('SIGKILL'); } catch { /* No unknown process is targeted. */ }
      grace = setTimeout(() => finish(false, null, null), 1000);
    };
    try {
      child = spawn(executable, args, {...options, shell:false, windowsHide:true, stdio:['ignore','pipe','pipe']});
    } catch { spawnFailed = true; finish(false, null, null); return; }
    child.once('spawn', () => {spawned = true;});
    child.once('error', () => {spawnFailed = true;});
    const collect = (target, stream) => chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (stream === 'stdout') stdoutBytes += bytes.length; else stderrBytes += bytes.length;
      if (stdoutBytes + stderrBytes > OUTPUT_CAP) {
        if (!overflow) {overflow = true; terminate();}
        return;
      }
      target.push(bytes);
    };
    child.stdout.on('data', collect(stdout, 'stdout'));
    child.stderr.on('data', collect(stderr, 'stderr'));
    child.once('close', (code, signal) => finish(true, Number.isInteger(code) ? code : null, signal));
    timer = setTimeout(() => {timedOut = true; terminate();}, deadlineMs);
  });
}

function closedReport(bytes, scenario) {
  if (bytes.length === 0 || bytes.length > 4096) return null;
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); } catch { return null; }
  const keys = ['kind','scenario','state','invocations','innerFinished','syncCategory','syncExit','syncSignal','value','nodeExact','npmExact','compatible'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).sort().join('|') !== keys.sort().join('|')) return null;
  if (body.kind !== 'OWNED_LIB_STDIO_NATIVE_RESULT' || body.scenario !== scenario || !SCENARIOS.includes(body.scenario)) return null;
  if (!['OBSERVED','FIXTURE_REFUSED'].includes(body.state) || !Number.isSafeInteger(body.invocations) || body.invocations < 0 || body.invocations > 2) return null;
  if (![body.innerFinished,body.nodeExact,body.npmExact,body.compatible].every(x => typeof x === 'boolean')) return null;
  if (!['NOT_RUN','OK','TIMEOUT','EXIT_NONZERO','SPAWN_FAILURE','OTHER'].includes(body.syncCategory)) return null;
  if (!(body.syncExit === null || Number.isSafeInteger(body.syncExit) && body.syncExit >= 0 && body.syncExit <= 255)) return null;
  if (!['NONE','SIGKILL','OTHER'].includes(body.syncSignal)) return null;
  if (!['NOT_OBSERVED','GIT_TRUE','GIT_FALLBACK','NPM_UNAVAILABLE','NPM_EXPECTED','NPM_INVALID','UNEXPECTED_VALUE'].includes(body.value)) return null;
  return body;
}

function ownedFixture(t) {
  assert.equal(process.versions.node, '20.19.0', 'pinned_node_required');
  const rawLibrary = fs.readFileSync(LIBRARY);
  assert.equal(hash(rawLibrary), AFTER_SHA, 'actual_library_pin_mismatch');
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'xenios-lib-stdio-owned-'));
  const identity = fs.lstatSync(directory), physical = fs.realpathSync(directory);
  const marker = path.join(directory, 'owned-marker.json');
  const nonce = randomUUID(); let safeToRemove = true, claimed = false;
  t.after(() => {
    try {
    // On timeout/overflow/unknown closure keep this owned fixture for external
    // runner cleanup; never delete foreign/replaced state or infer descendants.
    if (!safeToRemove || !claimed) return;
    const stat = fs.lstatSync(directory);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === identity.dev && stat.ino === identity.ino
      && fs.realpathSync(directory) === physical, 'owned_fixture_identity_changed');
    assert.ok(fs.readFileSync(marker, 'utf8') === nonce, 'owned_fixture_marker_changed');
    fs.rmSync(directory, {recursive:true, force:false, maxRetries:0});
    assert.equal(fs.existsSync(directory), false, 'owned_fixture_cleanup_incomplete');
    } catch { throw Error('owned_fixture_cleanup_refused'); }
  });
  assert.ok(identity.isDirectory() && !identity.isSymbolicLink() && path.dirname(physical) === temporaryRoot, 'owned_fixture_refused');
  fs.writeFileSync(marker, nonce, {flag:'wx', mode:0o600}); claimed = true;
  const driver = path.join(directory, 'driver.mjs'), cli = path.join(directory, 'fixed-cli.cjs');
  const gitConfig = path.join(directory, 'empty-git-config');
  fs.writeFileSync(gitConfig, '', {flag:'wx', mode:0o600});
  fs.writeFileSync(driver, DRIVER, {flag:'wx', mode:0o600});
  fs.writeFileSync(cli, CLI, {flag:'wx', mode:0o600});
  return {directory, driver, cli, gitConfig, rawLibrary, beginChild(){safeToRemove = false;},
    confirmChildClosed(){safeToRemove = true;}, retain(){safeToRemove = false;}};
}

async function sample(t, scenario, donorBefore = false) {
  let fixture;
  try { fixture = ownedFixture(t); } catch { throw Error('owned_fixture_prepare_refused'); }
  const env = fixedEnvironment(fixture.gitConfig);
  if (scenario.startsWith('git-')) {
    fixture.beginChild();
    const init = await boundedChild('git', ['init','--quiet'], {cwd:fixture.directory, env}, GIT_INIT_MS);
    if (init.directCloseObserved && !init.timedOut && !init.overflow) fixture.confirmChildClosed();
    assert.ok(init.spawned && !init.spawnFailed && init.directCloseObserved && !init.timedOut && !init.overflow && init.exitCode === 0, 'owned_git_fixture_failed');
  }
  let libraryUrl = LIBRARY.href;
  if (donorBefore) {
    // Exact immutable4cc donor, not a hand-written fake wrapper or options oracle.
    const insertion = '      stdio: "pipe",\n';
    const text = fixture.rawLibrary.toString('utf8');
    assert.equal(text.split(insertion).length - 1, 2, 'donor_reconstruction_refused');
    const before = Buffer.from(text.split(insertion).join(''));
    assert.equal(hash(before), DONOR_SHA, 'whole_donor_preimage_mismatch');
    const donorFile = path.join(fixture.directory, 'donor-before-lib.mjs');
    try { fs.writeFileSync(donorFile, before, {flag:'wx', mode:0o600}); } catch { throw Error('owned_donor_fixture_write_refused'); }
    libraryUrl = pathToFileURL(donorFile).href;
  }
  fixture.beginChild();
  const actual = await boundedChild(process.execPath, [fixture.driver], {cwd:fixture.directory, env:{...env,
    XENIOS_STDIO_FIXTURE_SCENARIO:scenario, XENIOS_STDIO_FIXTURE_LIBRARY:libraryUrl,
    XENIOS_STDIO_FIXTURE_CLI:fixture.cli}}, DRIVER_MS);
  const report = closedReport(actual.stdout, scenario);
  if (actual.directCloseObserved && !actual.timedOut && !actual.overflow && report?.innerFinished) fixture.confirmChildClosed();
  else fixture.retain();
  // Fixed/numeric diagnostics only. Never put actual stdout/stderr or errors in
  // assertions, snapshots, console, attachments, JSON reports or failure text.
  assert.ok(actual.spawned && !actual.spawnFailed && actual.directCloseObserved, 'owned_driver_close_unobserved');
  assert.ok(!actual.timedOut && !actual.overflow, 'owned_driver_deadline_or_output_refused');
  assert.equal(actual.exitCode, 0, 'owned_driver_failed');
  assert.ok(report !== null, 'closed_driver_result_refused');
  assert.equal(report.state, 'OBSERVED', 'fixture_observation_refused');
  assert.equal(report.invocations, 1, 'fixed_child_count_mismatch');
  assert.equal(report.innerFinished, true, 'synchronous_child_completion_unobserved');
  const safe = {report, stderrBytes:actual.stderrBytes,
    stderrHasControlledSentinel:actual.stderr.includes(Buffer.from(SENTINEL)),
    stdoutHasControlledSentinel:actual.stdout.includes(Buffer.from(SENTINEL)),
    directCloseObserved:actual.directCloseObserved, exitCode:actual.exitCode};
  assert.equal(safe.stdoutHasControlledSentinel, false, 'private_output_reached_report');
  return safe;
}

const options = {timeout:TEST_MS, concurrency:false};
test('owned Git success preserves real trimmed metadata and closes without test stderr', options, async t => {
  const r = await sample(t, 'git-success');
  assert.equal(r.report.value, 'GIT_TRUE'); assert.equal(r.report.syncCategory, 'OK');
  assert.equal(r.stderrBytes, 0); assert.equal(r.directCloseObserved, true);
});
test('owned Git failure keeps the real fallback without forwarding child stderr', options, async t => {
  const r = await sample(t, 'git-failure');
  assert.equal(r.report.value, 'GIT_FALLBACK'); assert.equal(r.report.syncCategory, 'EXIT_NONZERO');
  assert.equal(r.stderrBytes, 0); assert.equal(r.report.innerFinished, true);
});
test('exact donor Git counterfactual exposes the stderr channel without changing fallback', options, async t => {
  const r = await sample(t, 'git-failure', true);
  assert.equal(r.report.value, 'GIT_FALLBACK'); assert.equal(r.report.syncCategory, 'EXIT_NONZERO');
  assert.ok(r.stderrBytes > 0, 'causal_donor_git_stderr_not_observed');
});
test('real controlled npm version child preserves compatibility while its warning stays captured', options, async t => {
  const r = await sample(t, 'npm-success');
  assert.equal(r.report.value, 'NPM_EXPECTED'); assert.equal(r.report.nodeExact, true);
  assert.equal(r.report.npmExact, true); assert.equal(r.report.compatible, true);
  assert.equal(r.report.syncCategory, 'OK'); assert.equal(r.stderrBytes, 0);
  assert.equal(r.stderrHasControlledSentinel, false);
});
test('exact donor npm counterfactual exposes the controlled warning and preserves the same version', options, async t => {
  const r = await sample(t, 'npm-success', true);
  assert.equal(r.report.value, 'NPM_EXPECTED'); assert.equal(r.report.compatible, true);
  assert.ok(r.stderrBytes > 0, 'causal_donor_npm_stderr_not_observed');
  assert.equal(r.stderrHasControlledSentinel, true);
});
test('real controlled npm nonzero exit stays unavailable and incompatible with no stderr leak', options, async t => {
  const r = await sample(t, 'npm-failure');
  assert.equal(r.report.value, 'NPM_UNAVAILABLE'); assert.equal(r.report.compatible, false);
  assert.equal(r.report.syncCategory, 'EXIT_NONZERO'); assert.equal(r.report.syncExit, 7);
  assert.equal(r.stderrBytes, 0); assert.equal(r.stderrHasControlledSentinel, false);
});
test('real controlled npm invalid version is never promoted to pinned compatibility', options, async t => {
  const r = await sample(t, 'npm-invalid');
  assert.equal(r.report.value, 'NPM_INVALID'); assert.equal(r.report.npmExact, false);
  assert.equal(r.report.compatible, false); assert.equal(r.report.syncCategory, 'OK');
  assert.equal(r.stderrBytes, 0); assert.equal(r.stderrHasControlledSentinel, false);
});
test('real controlled npm timeout returns closed fallback and observes direct driver closure', options, async t => {
  const r = await sample(t, 'npm-timeout');
  assert.equal(r.report.value, 'NPM_UNAVAILABLE'); assert.equal(r.report.compatible, false);
  assert.equal(r.report.syncCategory, 'TIMEOUT'); assert.equal(r.report.innerFinished, true);
  assert.equal(r.stderrBytes, 0); assert.equal(r.directCloseObserved, true); assert.equal(r.exitCode, 0);
  // Sync completion follows the native API contract; this is not an independent
  // PID/birth/full-descendant proof or a production timeout-policy change.
});
