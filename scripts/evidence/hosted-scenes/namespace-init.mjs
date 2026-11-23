// QA-only: reuse a package-verified system Tini, never install/download a reaper.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, realpathSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { observeNamespaceProcesses } from './process-observation.mjs';
const SELF = fileURLToPath(import.meta.url);
export const INIT_PATHS = Object.freeze(['/usr/bin/tini', '/usr/bin/docker-init', '/usr/libexec/docker/docker-init']);
const sha = b => createHash('sha256').update(b).digest('hex');
export function validateInstalledInit({ path, uid, mode, packageName, packageStatus, version, md5sums }, bytes) {
  assert(INIT_PATHS.includes(path) && uid === 0 && (mode & 0o6022) === 0 && (mode & 0o111) !== 0, 'TRUSTED_INIT_PATH_OWNER_MODE');
  assert(bytes.length >= 64 && bytes.length <= 2097152 && bytes.subarray(0, 6).equals(Buffer.from([127, 69, 76, 70, 2, 1])) && bytes.readUInt16LE(18) === 62, 'INIT_AMD64_ELF');
  assert(/^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?$/.test(packageName) && /^installed\t\S+\tamd64$/.test(packageStatus), 'INSTALLED_INIT_PACKAGE');
  assert(/^tini version 0\.19\.0(?: - git\.de40ad0)?$/.test(version), 'STRICT_TINI_VERSION');
  const rows = md5sums.trim().split('\n').map(line => /^([a-f0-9]{32})\s{2}(.+)$/.exec(line)).filter(Boolean).filter(m => m[2] === path.slice(1));
  assert.equal(rows.length, 1, 'INIT_PACKAGE_FILE_RECORD');
  assert.equal(createHash('md5').update(bytes).digest('hex'), rows[0][1], 'INIT_INSTALLED_PACKAGE_CHECKSUM');
  return { path, bytes: bytes.length, sha256: sha(bytes), packageName, packageStatus, version,
    trust: 'EXISTING_ROOT_OWNED_RUNNER_PACKAGE_AND_MATCHING_INSTALLED_FILE_CHECKSUM',
    downloadedOrInstalled: false, flags: ['-g', '--'], exitRemapping: false };
}
export function selectInstalledInit(diagnostics = { candidates: [] }) {
  assert(process.platform === 'linux' && process.getuid() !== 0, 'RUNNER_INIT_SELECTION_CONTEXT');
  for (const path of INIT_PATHS) {
    const observation = { path, state: 'STARTED', commands: [] }; diagnostics.candidates.push(observation);
    let stat;
    try { stat = lstatSync(path); }
    catch (error) { if (error.code === 'ENOENT') { observation.state = 'ABSENT'; continue; } observation.state = 'STAT_FAILED'; throw error; }
    for (let parent = dirname(path); parent !== '/'; parent = dirname(parent)) {
      const s = lstatSync(parent); assert(s.isDirectory() && !s.isSymbolicLink() && s.uid === 0 && (s.mode & 0o022) === 0, 'INIT_TRUSTED_PARENT');
    }
    if (stat.isSymbolicLink()) {
      assert.equal(stat.uid, 0, 'ROOT_OWNED_INIT_SYMLINK');
      observation.canonicalPath = realpathSync(path);
      assert(INIT_PATHS.includes(observation.canonicalPath), 'INIT_SYMLINK_TARGET_NOT_ALLOWLISTED');
      observation.state = 'ROOT_SYMLINK_DEFERRED_TO_FIXED_CANONICAL_CANDIDATE'; continue;
    }
    assert(stat.isFile() && realpathSync(path) === path, 'INIT_REGULAR_CANONICAL_FILE');
    const env = { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC' };
    const run = (file, args) => {
      const command = { file, args }; observation.commands.push(command);
      try {
        const stdout = execFileSync(file, args, { env, encoding: 'utf8', timeout: 3000, maxBuffer: 262144, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        command.exit = 0; command.stdoutBytes = Buffer.byteLength(stdout);
        if (args.includes('md5sums')) command.stdoutSha256 = sha(Buffer.from(stdout));
        else command.stdout = stdout.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '?').slice(0, 2048);
        return stdout;
      } catch (error) {
        command.exit = Number.isInteger(error.status) ? error.status : null;
        command.code = /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'INIT_METADATA_COMMAND_FAILED';
        command.stderr = String(error.stderr ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '?').slice(0, 2048);
        observation.state = 'FAILED'; throw Error('INIT_METADATA_COMMAND_FAILED:' + file + ':' + args[0]);
      }
    };
    const owners = run('/usr/bin/dpkg-query', ['-S', path]).split('\n').filter(l => l.endsWith(': ' + path));
    assert.equal(owners.length, 1, 'ONE_INIT_PACKAGE_OWNER');
    const packageName = owners[0].slice(0, -(path.length + 2));
    assert(/^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?$/.test(packageName), 'INIT_PACKAGE_NAME');
    const bytes = readFileSync(path);
    const info = { path, uid: stat.uid, mode: stat.mode, packageName,
      packageStatus: run('/usr/bin/dpkg-query', ['-W', '-f=${db:Status-Status}\t${Version}\t${Architecture}', packageName]),
      md5sums: run('/usr/bin/dpkg-query', ['--control-show', packageName, 'md5sums']) };
    observation.packageMetadata = { packageName, packageStatus: info.packageStatus,
      selectedPathChecksumRows: info.md5sums.split('\n').filter(l => l.includes(path.slice(1))).slice(0, 4).map(l => l.slice(0, 512)),
      checksumFormatSample: info.md5sums.split('\n').slice(0, 2).map(l => l.slice(0, 512)) };
    // Validate bytes/package metadata before executing even --version.
    validateInstalledInit({ ...info, version: 'tini version 0.19.0' }, bytes);
    const selected = validateInstalledInit({ ...info, version: run(path, ['--version']) }, bytes);
    observation.state = 'SELECTED_VERIFIED_EXISTING_PACKAGE'; return { ...selected, diagnostics };
  }
  throw Error('NO_EXISTING_VERIFIABLE_TINI_NO_INSTALL_FALLBACK');
}
function readSelection() {
  const root = realpathSync(process.env.XR_QA_OUT), file = process.env.XR_QA_INIT_RECORD;
  assert(file === join(root, 'reaper-selection.json') && !lstatSync(file).isSymbolicLink(), 'OWNED_INIT_RECORD');
  const record = JSON.parse(readFileSync(file));
  assert.equal(sha(readFileSync(file)), process.env.XR_QA_INIT_RECORD_SHA256, 'ROOT_NAMESPACE_INIT_RECORD_HASH');
  assert(INIT_PATHS.includes(record.path) && record.flags?.join(' ') === '-g --' && record.exitRemapping === false, 'EXACT_INIT_SELECTION');
  const stat = lstatSync(record.path), bytes = readFileSync(record.path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o6022) === 0 && sha(bytes) === record.sha256 && bytes.length === record.bytes, 'SELECTED_INIT_BYTES_CHANGED');
  return record;
}
export function verifyInitParent() {
  const record = readSelection();
  assert(process.platform === 'linux' && process.getuid() !== 0 && process.ppid === 1 && process.pid !== 1, 'UNPRIVILEGED_CONTROLLER_UNDER_INIT_PID1');
  assert.equal(realpathSync('/proc/1/exe'), record.path, 'ACTUAL_INIT_PID1_EXECUTABLE');
  assert.equal(sha(readFileSync('/proc/1/exe')), record.sha256, 'ACTUAL_INIT_PID1_BYTES');
  const snapshot = observeNamespaceProcesses(); assert.equal(snapshot.readErrors.length, 0, 'INIT_PROC_READ');
  const pid1 = snapshot.processes.find(p => p.pid === 1);
  assert(pid1 && pid1.parent === 0 && !['Z', 'X'].includes(pid1.state), 'LIVE_INIT_PID1');
  return { ...record, process: pid1, controllerPid: process.pid, controllerParentPid: process.ppid };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(check, code, ms = 2500) {
  const end = Date.now() + ms;
  do { if (check()) return; await sleep(20); } while (Date.now() < end);
  throw Error(code);
}
function proc(pid) {
  const s = observeNamespaceProcesses(); assert.equal(s.readErrors.length, 0, 'CANARY_PROC_OBSERVATION');
  return s.processes.find(p => p.pid === pid);
}
function put(out, name, data) { writeFileSync(join(out, name + '.json'), JSON.stringify(data) + '\n', { flag: 'wx' }); }
const get = (out, name) => JSON.parse(readFileSync(join(out, name + '.json')));
async function role(mode, out) {
  if (mode === '--orphan-leaf') {
    put(out, 'orphan-ready', proc(process.pid));
    await until(() => proc(process.pid)?.parent === 1, 'ORPHAN_NOT_ADOPTED_BY_INIT');
    put(out, 'orphan-adopted', proc(process.pid)); process.exit(23);
  }
  if (mode === '--orphan-middle') {
    spawn(process.execPath, [SELF, '--orphan-leaf', out], { stdio: 'ignore', env: process.env });
    await until(() => existsSync(join(out, 'orphan-ready.json')), 'ORPHAN_NOT_READY'); process.exit(0);
  }
  if (mode === '--exit37') process.exit(37);
  if (mode === '--signal-leaf') {
    process.on('SIGTERM', () => { put(out, 'signal-leaf-ack', { signal: 'SIGTERM', process: proc(process.pid) }); process.exit(0); });
    put(out, 'signal-leaf-ready', proc(process.pid)); setInterval(() => {}, 1000); return;
  }
  if (mode === '--signal-child') {
    process.on('SIGTERM', async () => { put(out, 'signal-child-ack', { signal: 'SIGTERM', process: proc(process.pid) }); await until(() => existsSync(join(out, 'signal-leaf-ack.json')), 'GROUP_SIGNAL_NOT_FORWARDED'); process.exit(42); });
    spawn(process.execPath, [SELF, '--signal-leaf', out], { stdio: 'ignore', env: process.env });
    await until(() => existsSync(join(out, 'signal-leaf-ready.json')), 'SIGNAL_LEAF_NOT_READY');
    put(out, 'signal-child-ready', proc(process.pid)); setInterval(() => {}, 1000); return;
  }
  assert.equal(mode, '--canary');
  const selection = readSelection(), proof = { kind: 'REAL_LINUX_NAMESPACE_INIT_CAUSAL_CANARY', state: 'STARTED', tests: {}, failure: null, browserExecuted: false };
  let saved = false;
  const save = () => { if (!saved) { put(out, 'result', proof); saved = true; } };
  process.once('SIGTERM', () => { proof.state = 'FAILURE_PRESERVED_NO_RETRY'; proof.failure ??= 'CANARY_TERMINATED'; save(); process.exit(143); });
  const status = child => new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  try {
    assert(process.platform === 'linux' && process.getuid() !== 0 && process.pid !== 1, 'REAL_NAMESPACE_REQUIRED');
    assert.equal(realpathSync('/proc/1/exe'), selection.path, 'SELECTED_REAL_INIT');
    const middle = spawn(process.execPath, [SELF, '--orphan-middle', out], { stdio: 'ignore', env: process.env });
    const middleStatus = await status(middle); assert.equal(middleStatus.code, 0);
    await until(() => existsSync(join(out, 'orphan-adopted.json')), 'ORPHAN_ADOPTION_NOT_OBSERVED');
    const ready = get(out, 'orphan-ready'), adopted = get(out, 'orphan-adopted');
    assert.equal(ready.pid, adopted.pid); assert.equal(ready.startTicks, adopted.startTicks); assert.equal(adopted.parent, 1);
    await until(() => !proc(adopted.pid), 'ORPHAN_REAPING_NOT_CONFIRMED');
    proof.tests.orphan = { ready, adopted, actualProcAbsent: true, middleStatus };
    const codeChild = spawn(selection.path, ['-s', '-g', '--', process.execPath, SELF, '--exit37', out], { stdio: 'ignore', env: process.env });
    const codeStatus = await status(codeChild); assert.deepEqual(codeStatus, { code: 37, signal: null });
    proof.tests.exitStatus = { expected: 37, actual: codeStatus, remapped: false };
    const signalInit = spawn(selection.path, ['-s', '-g', '--', process.execPath, SELF, '--signal-child', out], { stdio: 'ignore', env: process.env });
    const signalStatus = status(signalInit);
    await until(() => existsSync(join(out, 'signal-child-ready.json')), 'SIGNAL_TREE_NOT_READY');
    const owned = proc(signalInit.pid); assert(owned && owned.parent === process.pid, 'OWNED_SIGNAL_TARGET');
    assert.equal(proc(signalInit.pid)?.startTicks, owned.startTicks, 'SIGNAL_PID_REUSE');
    assert(signalInit.kill('SIGTERM'), 'OWNED_SIGNAL_SEND');
    const actual = await signalStatus; assert.deepEqual(actual, { code: 42, signal: null });
    const first = get(out, 'signal-child-ack'), leaf = get(out, 'signal-leaf-ack');
    assert.equal(first.signal, 'SIGTERM'); assert.equal(leaf.signal, 'SIGTERM');
    await until(() => !proc(first.process.pid) && !proc(leaf.process.pid), 'SIGNAL_TREE_EXIT_UNCONFIRMED');
    proof.tests.signal = { owned, forwardedToChild: first, forwardedToGrandchild: leaf, actual, actualProcAbsent: true };
    proof.state = 'PASS_REAL_ORPHAN_REAPING_SIGNAL_FORWARDING_AND_EXIT_STATUS';
  } catch (error) { proof.state = 'FAILURE_PRESERVED_NO_RETRY'; proof.failure = String(error.message).split('\n')[0].slice(0, 160); process.exitCode = 1; }
  finally { save(); }
}
if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const [mode, out, ...extra] = process.argv.slice(2);
  assert(extra.length === 0 && typeof out === 'string', 'EXACT_INIT_ARGUMENTS');
  if (mode === '--select') {
    assert(process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_OS === 'Linux', 'ACTIONS_INIT_DISCOVERY_ONLY');
    const parent = realpathSync(dirname(out)), temp = realpathSync(process.env.RUNNER_TEMP);
    assert(parent.startsWith(temp + '/xenios-owned-hosted-scenes.') && out === join(parent, 'reaper-selection.json') && !lstatSync(parent).isSymbolicLink(), 'OWNED_INIT_SELECTION_OUTPUT');
    const diagnostics = { candidates: [] };
    try { const record = selectInstalledInit(diagnostics); writeFileSync(out, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' }); console.log(record.path); }
    catch (error) {
      writeFileSync(out, JSON.stringify({ state: 'FAILED_NO_INSTALL_NO_BROWSER', diagnostics, failure: String(error.message).split('\n')[0].slice(0, 200) }, null, 2) + '\n', { flag: 'wx' });
      console.error('VERIFIED_SYSTEM_INIT_UNAVAILABLE_NO_INSTALL'); process.exitCode = 1;
    }
  } else {
    const parent = realpathSync(process.env.XR_QA_OUT);
    assert(out === join(parent, 'reaper-canary'), 'OWNED_CANARY_PATH');
    if (mode === '--canary') { assert(!existsSync(out), 'FRESH_CANARY_DIRECTORY'); mkdirSync(out); }
    else assert(lstatSync(out).isDirectory() && !lstatSync(out).isSymbolicLink(), 'EXISTING_OWNED_CANARY_DIRECTORY');
    await role(mode, out);
  }
}
