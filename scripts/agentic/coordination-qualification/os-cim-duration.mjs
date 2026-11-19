// Diagnostic measurement only. Does not replace observeOwner, return authority
// facts, change its8s timeout, bind a corpus, or qualify the38 protocol cases.
// Root's one hosted stream owns execution and an outer OS-stall timeout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceFile = fileURLToPath(import.meta.url), sourceRoot = path.resolve(path.dirname(sourceFile), '../../..');
const relativeSource = 'scripts/agentic/coordination-qualification/os-cim-duration.mjs';
const frozenObserver = 'scripts/agentic/corpus-owner-process.ps1';
const frozenObserverSha256 = 'd745886cfecf6bd42ad1c8e09a2be2b9d8f76030977140c09b0d82b071127fa2';
const diagnosticDeadlineMs = 30_000, outputLimitBytes = 64_000, observerBudgetMs = 8_000;
let diagnosticStage = 'setup.runtime';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const prefix = 'XENIOS_OS_CIM_DURATION_V1 ';
// Fixed script; CIM objects and environment values are never serialized.
// A warm measurement starts only after the first query actually completes.
const queryScript = String.raw`
$ErrorActionPreference = 'Stop'
$diagnosticClock = [Diagnostics.Stopwatch]::StartNew()
function Emit-Measurement($Value) {
  # Primitive fixed-field serialization avoids autoloading ConvertTo-Json's
  # module before the first CIM query, which would perturb cold-start timing.
  try {
    $text = '{"event":"' + $Value.event + '","ordinal":' + $Value.ordinal + ',"at":"' + $Value.at + '","scriptElapsedMilliseconds":' + $Value.scriptElapsedMilliseconds
    if ($Value.Contains('queryElapsedMilliseconds')) { $text += ',"queryElapsedMilliseconds":' + $Value.queryElapsedMilliseconds }
    if ($Value.Contains('exceptionType')) {
      $safeType = ([string]$Value.exceptionType).Replace('\','\\').Replace('"','\"')
      $text += ',"exceptionType":"' + $safeType + '","hresult":' + $Value.hresult
    }
    [Console]::Error.WriteLine('XENIOS_OS_CIM_DURATION_V1 ' + $text + '}')
  } catch { }
}
Emit-Measurement ([ordered]@{event='runtime_ready';ordinal=0;at=[DateTime]::UtcNow.ToString('o');scriptElapsedMilliseconds=$diagnosticClock.ElapsedMilliseconds})
foreach ($ordinal in 1..2) {
  Emit-Measurement ([ordered]@{event='query_started';ordinal=$ordinal;at=[DateTime]::UtcNow.ToString('o');scriptElapsedMilliseconds=$diagnosticClock.ElapsedMilliseconds})
  $queryClock = [Diagnostics.Stopwatch]::StartNew()
  try {
    $osMeasurement = Get-CimInstance -ClassName Win32_OperatingSystem
    $queryClock.Stop()
    Emit-Measurement ([ordered]@{event='query_completed';ordinal=$ordinal;at=[DateTime]::UtcNow.ToString('o');scriptElapsedMilliseconds=$diagnosticClock.ElapsedMilliseconds;queryElapsedMilliseconds=$queryClock.ElapsedMilliseconds})
    $osMeasurement = $null
  } catch {
    $queryClock.Stop()
    Emit-Measurement ([ordered]@{event='query_failed';ordinal=$ordinal;at=[DateTime]::UtcNow.ToString('o');scriptElapsedMilliseconds=$diagnosticClock.ElapsedMilliseconds;queryElapsedMilliseconds=$queryClock.ElapsedMilliseconds;exceptionType=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult})
    exit 2
  }
}
exit 0
`;
function sourceReceipt(expectedSha) {
  const git = args => execFileSync('git', args, { cwd: sourceRoot, windowsHide: true, timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), expectedSha, 'Exact source SHA required');
  assert.equal(git(['status', '--porcelain']).toString(), '', 'Clean source required');
  const files = [relativeSource, frozenObserver].map(file => {
    const actual = fs.readFileSync(path.join(sourceRoot, file)), committed = git(['cat-file', 'blob', expectedSha + ':' + file]);
    assert(normalized(actual).equals(committed), 'Uncommitted diagnostic source');
    return { file, rawSha256: sha(actual), committedSha256: sha(committed) };
  });
  assert.equal(files[1].committedSha256, frozenObserverSha256, 'Frozen observer changed');
  return { sourceSha: expectedSha, frozenObserverBase: '8bf5db291a77a1f5e49055f7cad605f00a5052cc',
    files, queryScriptSha256: sha(Buffer.from(queryScript)), observedAt: new Date().toISOString() };
}
function parseEvents(stderr) {
  const events = [], rejections = [];
  const fields = new Set(['event', 'ordinal', 'at', 'scriptElapsedMilliseconds', 'queryElapsedMilliseconds', 'exceptionType', 'hresult']);
  const names = new Set(['runtime_ready', 'query_started', 'query_completed', 'query_failed']);
  let unrecognizedLineCount = 0;
  for (const line of stderr.toString('utf8').split(/\r?\n/).filter(Boolean)) {
    if (!line.startsWith(prefix)) { unrecognizedLineCount++; continue; }
    try {
      const value = JSON.parse(line.slice(prefix.length));
      assert(value && !Array.isArray(value) && Object.keys(value).every(key => fields.has(key)));
      assert(names.has(value.event) && [0, 1, 2].includes(value.ordinal));
      assert(typeof value.at === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.at) && Number.isFinite(Date.parse(value.at)));
      assert(Number.isSafeInteger(value.scriptElapsedMilliseconds) && value.scriptElapsedMilliseconds >= 0);
      if (value.event === 'runtime_ready') assert.equal(value.ordinal, 0); else assert(value.ordinal > 0);
      if (value.event === 'query_completed' || value.event === 'query_failed') assert(Number.isSafeInteger(value.queryElapsedMilliseconds) && value.queryElapsedMilliseconds >= 0);
      else assert(value.queryElapsedMilliseconds === undefined);
      if (value.event === 'query_failed') {
        assert(typeof value.exceptionType === 'string' && /^[A-Za-z0-9_.+`]{1,160}$/.test(value.exceptionType));
        assert(Number.isSafeInteger(value.hresult));
      } else assert(value.exceptionType === undefined && value.hresult === undefined);
      events.push(value);
    } catch { rejections.push('invalid_measurement_event'); }
  }
  const expected = ['runtime_ready:0', 'query_started:1', 'query_completed:1', 'query_started:2', 'query_completed:2'];
  const keys = events.map(value => value.event + ':' + value.ordinal);
  const completeOrderedPair = rejections.length === 0 && JSON.stringify(keys) === JSON.stringify(expected);
  return { events, rejections, unrecognizedLineCount, completeOrderedPair };
}
function transportCode(error) {
  return ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS'].includes(error?.code) ? error.code : error ? 'OTHER_TRANSPORT_ERROR' : null;
}
function run(expectedSha, receiptFile) {
  diagnosticStage = 'setup.source_before';
  const sourceBefore = sourceReceipt(expectedSha);
  const explicitEnvironment = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const startedAt = new Date().toISOString(), started = process.hrtime.bigint();
  diagnosticStage = 'measurement.launch';
  const child = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', queryScript],
    { env: explicitEnvironment, windowsHide: true, timeout: diagnosticDeadlineMs, maxBuffer: outputLimitBytes, stdio: ['ignore', 'pipe', 'pipe'] });
  const elapsedMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  const finishedAt = new Date().toISOString(), stdout = Buffer.from(child.stdout ?? ''), stderr = Buffer.from(child.stderr ?? '');
  diagnosticStage = 'measurement.parse_events';
  const measurement = parseEvents(stderr), code = transportCode(child.error);
  const exited = Number.isInteger(child.status) || typeof child.signal === 'string';
  const completed = exited && child.status === 0 && !child.error && measurement.completeOrderedPair;
  const classification = code === 'ETIMEDOUT' ? 'diagnostic_deadline_reached'
    : code === 'ENOBUFS' ? 'diagnostic_output_limit'
      : ['ENOENT', 'EACCES', 'EPERM'].includes(code) ? 'diagnostic_tool_launch_failed'
        : measurement.events.some(value => value.event === 'query_failed') ? 'native_query_error'
          : completed ? 'two_queries_completed' : 'diagnostic_incomplete';
  const completions = measurement.events.filter(value => value.event === 'query_completed');
  const first = completions.find(value => value.ordinal === 1), second = completions.find(value => value.ordinal === 2);
  let sourceAfter = null, sourceUnchanged = false;
  diagnosticStage = 'finalize.source_after';
  try { sourceAfter = sourceReceipt(expectedSha); assert.deepEqual(sourceAfter.files, sourceBefore.files); sourceUnchanged = true; } catch { /* Preserve actual process/partial measurement evidence. */ }
  const receipt = { schemaVersion: 1, kind: 'os-cim-duration-diagnostic-not-authority-or-protocol-qualification',
    sourceBefore, sourceAfter, sourceUnchanged, diagnosticDeadlineMs, productionObserverBudgetMs: observerBudgetMs,
    explicitSuppliedEnvironmentKeyNames: Object.keys(explicitEnvironment).sort(),
    windowsRuntimeMayAddPinnedRequiredKeys: true, startedAt, finishedAt, elapsedMilliseconds, classification,
    process: { pid: Number.isInteger(child.pid) ? child.pid : null, exited, exitCode: child.status, signal: child.signal,
      transportCode: code, custody: 'actual owned spawnSync; kernel birth not sampled; no PID lookup/post-return kill' },
    output: { stdoutBytes: stdout.length, stderrBytes: stderr.length, stdoutSha256: sha(stdout), stderrSha256: sha(stderr) },
    measurement, completed, firstQueryMilliseconds: first?.queryElapsedMilliseconds ?? null,
    secondQueryMilliseconds: second?.queryElapsedMilliseconds ?? null,
    firstCompletionFromLaunchWallEstimateMs: first ? Date.parse(first.at) - Date.parse(startedAt) : null,
    firstQueryExceedsProductionBudget: first ? first.queryElapsedMilliseconds > observerBudgetMs : null,
    firstSlowSecondWithinBudgetPattern: first && second ? first.queryElapsedMilliseconds > observerBudgetMs && second.queryElapsedMilliseconds <= observerBudgetMs : null,
    lastEvent: measurement.events.at(-1) ?? null,
    limits: ['30s is this diagnostic process deadline, never a changed production observer timeout.',
      'Noncompletion by the deadline is not proof of a permanent hang.',
      'First/second query timing is consistent with cold/warm behavior, not an identified cause.',
      'Fresh PowerShell query includes module resolution/autoload; other earlier hosted probes may have warmed host caches.',
      'Wall estimate includes process startup and is not a monotonic per-query duration.',
      'OS stalls may outlive spawnSync timeout; Root must enforce an outer hosted step timeout.',
      'No observer authority, current binding, core source, permission,38-case or live-adoption change.'] };
  diagnosticStage = 'finalize.receipt_write';
  put(receiptFile, receipt);
  console.log(JSON.stringify({ receipt: receiptFile, classification, completed, sourceUnchanged,
    pid: receipt.process.pid, exited, firstQueryMilliseconds: receipt.firstQueryMilliseconds,
    secondQueryMilliseconds: receipt.secondQueryMilliseconds, lastEvent: receipt.lastEvent }));
  process.exitCode = completed && sourceUnchanged ? 0 : 1;
}
try {
  assert.equal(process.platform, 'win32'); assert.equal(process.versions.node, '20.19.0');
  diagnosticStage = 'setup.arguments';
  const args = process.argv.slice(2);
  assert.equal(args.length, 4); assert.equal(args[0], '--expect-sha'); assert(/^[a-f0-9]{40}$/.test(args[1])); assert.equal(args[2], '--receipt');
  diagnosticStage = 'setup.receipt_destination';
  const parent = fs.realpathSync(path.dirname(path.resolve(args[3]))), receiptFile = path.join(parent, path.basename(args[3]));
  const actualSource = fs.realpathSync(sourceRoot).toLowerCase();
  assert(parent.toLowerCase() !== actualSource && !parent.toLowerCase().startsWith(actualSource + path.sep));
  assert(!fs.lstatSync(parent).isSymbolicLink() && !fs.existsSync(receiptFile));
  run(args[1], receiptFile);
} catch (error) {
  console.error(JSON.stringify({ ok: false, stage: diagnosticStage, code: error?.code === 'ERR_ASSERTION' ? 'diagnostic_setup_assertion' : 'diagnostic_setup_unavailable' }));
  process.exitCode = 1;
}
