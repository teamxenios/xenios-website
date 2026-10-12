'use strict';

// Scratch supervisor, not execution authorization. Use only in the reserved
// coordinator window after the physical dependency copy and pins are frozen.
// Manifest v1: {schemaVersion:1,candidate,tree,nodeVersion,npmVersion,
//               files:[{path:<literal absolute path>,sha256:<64 lowercase hex>}]}.
// This is a targeted unit/component run, not a build, full suite, browser,
// served journey, hosted qualification, or fresh npm-ci in this worktree.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const ROOT = 'C:/xenios-wt/doc99-followup';
const SCRATCH = 'C:/Users/sboad/.codex/tmp/ql-doc99-red-20261012';
const RUNTIME = 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64';
const NODE = path.join(RUNTIME, 'node.exe');
const NPM = path.join(RUNTIME, 'node_modules/npm/bin/npm-cli.js');
const GIT = 'C:/Program Files/Git/cmd/git.exe';
const CMD = 'C:/Windows/System32/cmd.exe';
const TASKKILL = 'C:/Windows/System32/taskkill.exe';
const CANDIDATE = '9d7bfe4b32b09e887a0ee23b12eae007c6dd94dd';
const TREE = 'dc79ee5b04aaaf1fe6f0dbde944fa654311dc35e';
const TESTS = [
  'client/src/research/assisted-order/AssistedOrderPage.test.tsx',
  'client/src/research/assisted-order/draft-store.test.ts',
];
const TIMEOUT_MS = 180000;
const HEAP_MIB = 1024;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_LOG_BYTES = 20 * 1024 * 1024;
const normalized = value => path.resolve(value).replace(/\\/g, '/').toLowerCase();
const within = (parent, child) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};
const absoluteLiteral = value => typeof value === 'string' && /^[A-Za-z]:[\\/]/.test(value) && !/[\r\n\0]/.test(value);
const physical = value => {
  if (!absoluteLiteral(value) || normalized(fs.realpathSync(value)) !== normalized(value)) throw new Error('Nonliteral or redirected path');
};
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exactKeys = (value, expected) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
const errorKind = error => ({
  name: typeof error?.name === 'string' ? error.name.slice(0, 64) : 'Error',
  code: typeof error?.code === 'string' ? error.code.slice(0, 64) : Number.isInteger(error?.code) ? error.code : null,
  killed: typeof error?.killed === 'boolean' ? error.killed : null,
  signal: typeof error?.signal === 'string' ? error.signal.slice(0, 64) : null,
  // Do not preserve stderr, stdout, stacks, inherited environment or multiline
  // command output. These probes have only fixed, non-secret executable/argv.
  message: typeof error?.message === 'string'
    ? error.message.split(/\r?\n/, 1)[0].replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 512)
    : null,
});


const [pinsPath, pinsSha256, stopAtText, ...extra] = process.argv.slice(2);
if (extra.length || !absoluteLiteral(pinsPath) || !SHA256.test(pinsSha256 || '')
  || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stopAtText || '')) {
  throw new Error('Usage: pinned-node run-targeted.cjs <absolute-pins.json> <raw-pins-sha256> <stopAt UTC ISO with milliseconds>');
}
const stopAt = Date.parse(stopAtText);
if (!Number.isFinite(stopAt) || new Date(stopAt).toISOString() !== stopAtText || Date.now() + TIMEOUT_MS + 15000 > stopAt) throw new Error('Insufficient fresh reserved window');
if (process.version !== 'v20.19.0' || normalized(process.execPath) !== normalized(NODE) || process.execArgv.length !== 0) throw new Error('Full-path pinned launcher without extra Node flags required');
for (const key of ['NODE_OPTIONS', 'NODE_PATH']) if (process.env[key]) throw new Error('Launcher must start without inherited Node injection settings');
for (const dir of [ROOT, SCRATCH, path.join(ROOT, 'node_modules')]) physical(dir);
physical(__filename);
if (normalized(__filename) !== normalized(path.join(SCRATCH, 'run-targeted.cjs'))) throw new Error('Exact scratch launcher required');
if (!within(SCRATCH, pinsPath)) throw new Error('Pins manifest must be a private scratch descendant');
physical(pinsPath);
if (fs.statSync(pinsPath).size > 2 * 1024 * 1024 || digest(pinsPath) !== pinsSha256) throw new Error('Pins manifest binding failed');
const pins = JSON.parse(fs.readFileSync(pinsPath, 'utf8'));
if (!exactKeys(pins, ['schemaVersion', 'candidate', 'tree', 'nodeVersion', 'npmVersion', 'files'])
  || pins.schemaVersion !== 1 || pins.candidate !== CANDIDATE || pins.tree !== TREE
  || pins.nodeVersion !== 'v20.19.0' || pins.npmVersion !== '10.8.2'
  || !Array.isArray(pins.files) || pins.files.length < 1 || pins.files.length > 5000) throw new Error('Invalid frozen pins manifest');
const pinMap = new Map();
for (const entry of pins.files) {
  if (!exactKeys(entry, ['path', 'sha256']) || !absoluteLiteral(entry.path) || !SHA256.test(entry.sha256)) throw new Error('Invalid literal file pin');
  if (!(within(ROOT, entry.path) || within(RUNTIME, entry.path)
    || [GIT, CMD, TASKKILL, __filename].some(file => normalized(file) === normalized(entry.path)))) throw new Error('Pin outside allowed inputs');
  const key = normalized(entry.path);
  if (pinMap.has(key)) throw new Error('Duplicate file pin');
  pinMap.set(key, entry);
}
const requiredPins = [
  NODE, NPM, GIT, CMD, TASKKILL, __filename,
  path.join(RUNTIME, 'node_modules/npm/package.json'), path.join(RUNTIME, 'node_modules/npm/lib/cli.js'),
  ...[
    'package.json', 'package-lock.json', '.npmrc', 'tsconfig.json', 'vitest.config.ts', 'vite.config.ts',
    'client/src/research/assisted-order/AssistedOrderPage.tsx',
    'client/src/research/assisted-order/draft-store.ts', ...TESTS,
    'client/src/research/assisted-order/api.ts',
    'node_modules/.package-lock.json',
    'node_modules/vitest/package.json', 'node_modules/vitest/vitest.mjs',
    'node_modules/vitest/dist/cli.js', 'node_modules/vitest/dist/config.js',
    'node_modules/vitest/dist/worker.js', 'node_modules/vitest/dist/environments.js',
    'node_modules/vite/package.json', 'node_modules/vite/dist/node/index.js',
    'node_modules/jsdom/package.json', 'node_modules/jsdom/lib/api.js',
    'node_modules/react/package.json', 'node_modules/react/index.js',
    'node_modules/react-dom/package.json', 'node_modules/react-dom/client.js',
    'node_modules/esbuild/package.json', 'node_modules/esbuild/lib/main.js',
    'node_modules/@esbuild/win32-x64/esbuild.exe',
  ].map(file => path.join(ROOT, file)),
];
for (const file of requiredPins) if (!pinMap.has(normalized(file))) throw new Error('Missing mandatory input pin: ' + file);
function verifyPins(before) {
  let totalBytes = 0;
  for (const entry of pinMap.values()) {
    if (Date.now() >= before) throw new Error('Pin verification deadline exhausted');
    physical(entry.path);
    const stat = fs.statSync(entry.path);
    totalBytes += stat.size;
    if (totalBytes > 256 * 1024 * 1024) throw new Error('Pin byte census exceeds bounded verifier');
    if (!stat.isFile() || stat.size > 128 * 1024 * 1024 || digest(entry.path) !== entry.sha256) throw new Error('Frozen input pin changed: ' + entry.path);
    if (Date.now() >= before) throw new Error('Pin verification deadline exhausted');
  }
  if (digest(pinsPath) !== pinsSha256) throw new Error('Manifest changed');
}
verifyPins(stopAt - 16000);
for (const dir of [ROOT, path.join(ROOT, 'client')]) for (const name of fs.readdirSync(dir)) {
  if (name.startsWith('.env') && name !== '.env.example') throw new Error('Unexpected environment file');
}
for (let dir = path.dirname(ROOT); ; dir = path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'node_modules/.bin'))) throw new Error('Unexpected ancestor executable directory');
  if (path.dirname(dir) === dir) break;
}
for (const name of fs.readdirSync(path.join(ROOT, 'node_modules/.bin'))) {
  if (/^(node|npm|git)(\.(com|exe|bat|cmd))?$/.test(name.toLowerCase())) throw new Error('Installed tool shadow');
}
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
for (const entry of Object.values(lock.packages || {})) {
  if (Object.keys(entry.bin || {}).some(name => ['node', 'npm', 'git'].includes(name.toLowerCase()))) throw new Error('Unexpected package binary shadow');
}

const output = path.join(SCRATCH, 'run1');
if (!within(SCRATCH, output) || fs.existsSync(output)) throw new Error('Fresh output required; no overwrite or retry');
fs.mkdirSync(output);
physical(output);
for (const dir of ['home', 'tmp', 'npm-cache', 'npm-prefix', 'node-gyp-cache']) fs.mkdirSync(path.join(output, dir));
for (const file of ['user.npmrc', 'global.npmrc', 'gitconfig']) fs.writeFileSync(path.join(output, file), '', { flag: 'wx' });
const env = {
  SYSTEMROOT: 'C:\\Windows', WINDIR: 'C:\\Windows', COMSPEC: CMD,
  PATH: RUNTIME + ';C:\\Program Files\\Git\\cmd;C:\\Windows\\System32;C:\\Windows', PATHEXT: '.COM;.EXE;.BAT;.CMD',
  USERPROFILE: path.join(output, 'home'), HOME: path.join(output, 'home'),
  APPDATA: path.join(output, 'home/AppData/Roaming'), LOCALAPPDATA: path.join(output, 'home/AppData/Local'),
  TEMP: path.join(output, 'tmp'), TMP: path.join(output, 'tmp'),
  NODE_ENV: 'test', CI: '1', NODE_OPTIONS: '--max-old-space-size=' + HEAP_MIB,
  NO_COLOR: '1', TSX_DISABLE_CACHE: '1',
  NPM_CONFIG_USERCONFIG: path.join(output, 'user.npmrc'), NPM_CONFIG_GLOBALCONFIG: path.join(output, 'global.npmrc'),
  NPM_CONFIG_CACHE: path.join(output, 'npm-cache'), NPM_CONFIG_PREFIX: path.join(output, 'npm-prefix'),
  NPM_CONFIG_DEVDIR: path.join(output, 'node-gyp-cache'), NPM_CONFIG_OFFLINE: 'true',
  NPM_CONFIG_FETCH_RETRIES: '0', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_FUND: 'false', NPM_CONFIG_UPDATE_NOTIFIER: 'false',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(output, 'gitconfig'), GIT_TERMINAL_PROMPT: '0',
};
const reportPath = path.join(output, 'vitest-results.json');
const args = [path.join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.config.ts',
  '--maxWorkers', '1', '--no-file-parallelism', '--reporter', 'verbose', '--reporter', 'json', '--outputFile.json', reportPath, ...TESTS];
const receipt = {
  schemaVersion: 1, action: 'QL_DOC99_TWO_CLIENT_FILES_20261012', candidate: CANDIDATE, tree: TREE,
  command: [NODE, ...args], cwd: ROOT, testFiles: TESTS,
  runnerSha256: digest(__filename), pinsPath, pinsSha256, pins, environment: env,
  coordinatorStopAt: stopAtText, timeoutMs: TIMEOUT_MS, cleanupMarginMs: 15000, attempts: 1, automaticRetries: 0,
  nodeVersion: process.version, heapMiB: HEAP_MIB, preparedUtc: new Date().toISOString(),
  status: 'PREFLIGHT', childCleanupConfirmed: false, metadataProbes: [],
  dependencyMode: 'Physical project-local copy with separate donor npm-ci provenance; no install by this runner.',
  limits: [
    'Only the two named client unit/component files; no full-suite, build, browser, server, SQL or hosted qualification.',
    'Real api.ts wrapper cases use stubbed fetch. Reviewed test code, not this supervisor, provides that mock boundary.',
    'No credentials or inherited application environment. No external network operation authorized; no OS network sandbox claim.',
    'No aggregate memory containment, child-worker self-attestation or independent process-cleanup claim.',
    'Pinned dependency entry files and lock metadata, not a complete recursive byte attestation of every installed dependency.',
  ],
};
const logPath = path.join(output, 'run.log');
const logFd = fs.openSync(logPath, 'wx');
let logBytes = 0;
let finalized = false;
let child = null;
let killChild = null;
let runTimer = null;
let timedOut = false;
let absoluteDeadline = stopAt - 1000;
let deadlineTimer = null;
const activeProbes = new Set();

function finish(exitCode, forced = false) {
  if (finalized) return;
  finalized = true;
  clearTimeout(runTimer); clearTimeout(deadlineTimer);
  for (const probe of activeProbes) { try { probe.kill(); } catch {} }
  fs.closeSync(logFd);
  receipt.logBytes = logBytes;
  receipt.logSha256 = digest(logPath);
  receipt.finalizedUtc = new Date().toISOString();
  receipt.supervisorExitCode = exitCode;
  receipt.forcedExit = forced;
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ status: receipt.status, receipt: path.join(output, 'receipt.json'), exitCode }) + '\n');
  // The durable raw receipt is written before exit. A stuck taskkill handle or
  // inherited pipe cannot extend this supervisor's cleanup deadline forever.
  // The coordinator must still independently inspect owned descendant cleanup.
  process.exit(exitCode);
}
function forceDeadline() {
  receipt.status = 'SUPERVISOR_DEADLINE_INCOMPLETE_CLEANUP_NOT_CONFIRMED';
  receipt.timedOut = true;
  receipt.forcedFinalization = true;
  receipt.childCleanupConfirmed = false;
  terminateOwnedTree('absolute_deadline');
  finish(124, true);
}
function armDeadline() {
  clearTimeout(deadlineTimer);
  deadlineTimer = setTimeout(forceDeadline, Math.max(1, absoluteDeadline - Date.now()));
}
armDeadline();
function terminateOwnedTree(reason) {
  if (finalized || killChild || !child?.pid) return;
  receipt.stopReason = reason;
  killChild = spawn(TASKKILL, ['/T', '/F', '/PID', String(child.pid)], { env, windowsHide: true, stdio: 'ignore' });
  receipt.cleanupPid = killChild.pid;
  const killTimeout = setTimeout(() => { try { killChild.kill(); } catch {} }, Math.max(1, Math.min(8000, absoluteDeadline - Date.now() - 1000)));
  killChild.on('error', error => { if (!finalized) receipt.cleanupError = errorKind(error); });
  killChild.on('close', (code, signal) => {
    clearTimeout(killTimeout);
    if (!finalized) receipt.taskkillResult = { exitCode: code, signal, independentlyConfirmed: false };
  });
}
function appendLog(chunk) {
  if (finalized) return;
  if (logBytes + chunk.length > MAX_LOG_BYTES) {
    receipt.outputLimitExceeded = true;
    terminateOwnedTree('output_limit');
    return;
  }
  try {
    let written = 0;
    while (written < chunk.length) {
      const count = fs.writeSync(logFd, chunk, written, chunk.length - written);
      if (count < 1) throw new Error('Log write made no progress');
      written += count;
      logBytes += count;
    }
  } catch (error) { receipt.logWriteError = errorKind(error); terminateOwnedTree('log_write_failure'); }
}
function probe(executable, probeArgs) {
  if (finalized) return Promise.reject(new Error('Already finalized'));
  const budget = Math.min(10000, absoluteDeadline - Date.now() - 2500);
  const startedNs = process.hrtime.bigint();
  const observed = {
    executable, argv: [...probeArgs], timeoutMs: Math.max(0, budget),
    startedUtc: new Date().toISOString(), endedUtc: null, elapsedMs: null,
    exitCode: null, killed: null, signal: null, status: 'STARTING',
  };
  receipt.metadataProbes.push(observed);
  const completeObservation = () => {
    observed.endedUtc = new Date().toISOString();
    observed.elapsedMs = Number(process.hrtime.bigint() - startedNs) / 1000000;
  };
  if (budget < 1) {
    observed.status = 'NOT_STARTED_DEADLINE_EXHAUSTED';
    completeObservation();
    return Promise.reject(new Error('Probe deadline exhausted'));
  }
  return new Promise((resolve, reject) => {
    const process = execFile(executable, probeArgs, { cwd: ROOT, env, windowsHide: true, timeout: budget, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
      activeProbes.delete(process);
      completeObservation();
      observed.killed = typeof error?.killed === 'boolean' ? error.killed : false;
      observed.signal = typeof error?.signal === 'string' ? error.signal.slice(0, 64) : observed.signal;
      if (error) {
        observed.status = 'FAILED';
        observed.error = errorKind(error);
        if (Number.isInteger(error.code)) observed.exitCode = error.code;
      } else {
        observed.status = 'COMPLETED';
        observed.exitCode = 0;
      }
      if (finalized) { reject(new Error('Supervisor finalized')); return; }
      if (error) { reject(error); return; }
      resolve(stdout.trim());
    });
    observed.status = 'RUNNING';
    process.once('exit', (code, signal) => {
      observed.exitCode = Number.isInteger(code) ? code : null;
      observed.signal = typeof signal === 'string' ? signal.slice(0, 64) : null;
    });
    activeProbes.add(process);
  });
}
const git = (...gitArgs) => probe(GIT, ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', ...gitArgs]);
async function sourceState() {
  const head = await git('rev-parse', 'HEAD');
  const tree = await git('rev-parse', 'HEAD^{tree}');
  const status = await git('status', '--porcelain=v2', '--untracked-files=all');
  return { head, tree, status, lockSha256: digest(path.join(ROOT, 'package-lock.json')) };
}
function sourceMatches(state) {
  return state.head === CANDIDATE && state.tree === TREE && state.status === ''
    && state.lockSha256 === pinMap.get(normalized(path.join(ROOT, 'package-lock.json'))).sha256;
}
function inspectReport() {
  if (!fs.existsSync(reportPath) || fs.statSync(reportPath).size > MAX_LOG_BYTES) throw new Error('Missing or oversized Vitest report');
  const raw = fs.readFileSync(reportPath);
  const result = JSON.parse(raw.toString('utf8'));
  const expected = new Set(TESTS.map(file => normalized(path.join(ROOT, file))));
  if (!Array.isArray(result.testResults) || result.testResults.length !== TESTS.length) throw new Error('Unexpected reporter file count');
  const seen = new Set();
  let assertionCount = 0;
  for (const file of result.testResults) {
    if (typeof file.name !== 'string' || !absoluteLiteral(file.name)) throw new Error('Unexpected reporter file identity');
    const key = normalized(file.name);
    if (!expected.has(key) || seen.has(key) || !Array.isArray(file.assertionResults) || file.assertionResults.length < 1) throw new Error('Unexpected or empty reporter file');
    seen.add(key);
    assertionCount += file.assertionResults.length;
  }
  receipt.reporter = {
    path: reportPath, bytes: raw.length, sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    success: result.success, numPassedTests: result.numPassedTests, numFailedTests: result.numFailedTests,
    numPendingTests: result.numPendingTests, numTodoTests: result.numTodoTests, numTotalTests: result.numTotalTests,
    exactFileCount: seen.size, assertionCount,
  };
  receipt.reporterPassed = result.success === true && result.numFailedTests === 0 && result.numPendingTests === 0
    && (!('numTodoTests' in result) || result.numTodoTests === 0)
    && Number.isInteger(result.numTotalTests) && result.numTotalTests > 0 && result.numTotalTests === assertionCount
    && result.numPassedTests === assertionCount
    && result.testResults.every(file => file.status === 'passed' && file.assertionResults.every(assertion => assertion.status === 'passed'));
}
async function postcheck(code, signal) {
  if (finalized) return;
  clearTimeout(runTimer);
  Object.assign(receipt, { childEndedUtc: new Date().toISOString(), childExitCode: code, childSignal: signal, timedOut });
  try {
    if (timedOut || receipt.outputLimitExceeded || receipt.logWriteError) throw new Error('Run interrupted; postchecks withheld');
    receipt.postSource = await sourceState();
    receipt.postNpmVersion = await probe(NODE, [NPM, '--version']);
    if (finalized) return;
    if (Date.now() >= absoluteDeadline - 2500) throw new Error('Postcheck deadline exhausted');
    verifyPins(absoluteDeadline - 2000);
    receipt.postPinsMatch = true;
    receipt.sourceInvariant = sourceMatches(receipt.postSource);
    inspectReport();
  } catch (error) { if (!finalized) receipt.postcheckError = errorKind(error); }
  if (finalized) return;
  const completed = code === 0 && !timedOut && !receipt.outputLimitExceeded && !receipt.logWriteError
    && receipt.sourceInvariant === true && receipt.postPinsMatch === true && receipt.postNpmVersion === '10.8.2'
    && receipt.reporterPassed === true;
  receipt.status = completed ? 'COMPLETED_REQUIRES_INDEPENDENT_PROCESS_POSTCHECK' : 'FAILED_OR_INCOMPLETE';
  finish(timedOut ? 124 : completed ? 0 : code || 1);
}
async function main() {
  receipt.preSource = await sourceState();
  receipt.npmVersion = await probe(NODE, [NPM, '--version']);
  if (!sourceMatches(receipt.preSource) || receipt.npmVersion !== '10.8.2') throw new Error('Frozen source/runtime precheck failed');
  verifyPins(absoluteDeadline - 2000);
  if (finalized) return;
  if (Date.now() + TIMEOUT_MS + 15000 > stopAt) throw new Error('Complete execution window no longer remains');
  receipt.startedUtc = new Date().toISOString();
  absoluteDeadline = Math.min(stopAt - 1000, Date.now() + TIMEOUT_MS + 14000);
  receipt.absoluteFinalizeBefore = new Date(absoluteDeadline).toISOString();
  receipt.status = 'RUNNING';
  fs.writeFileSync(path.join(output, 'start.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  armDeadline();
  child = spawn(NODE, args, { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  receipt.childPid = child.pid;
  runTimer = setTimeout(() => { timedOut = true; terminateOwnedTree('execution_timeout'); }, TIMEOUT_MS);
  child.stdout.on('data', appendLog); child.stderr.on('data', appendLog);
  child.on('error', error => { if (!finalized) receipt.childStartError = errorKind(error); });
  child.on('close', (code, signal) => { void postcheck(code, signal).catch(error => {
    if (!finalized) { receipt.status = 'SUPERVISOR_POSTCHECK_FAILED'; receipt.postcheckError = errorKind(error); finish(1); }
  }); });
}
void main().catch(error => {
  if (!finalized) { receipt.status = 'PREFLIGHT_FAILED_NO_JOB_STARTED'; receipt.preflightError = errorKind(error); finish(1); }
});

