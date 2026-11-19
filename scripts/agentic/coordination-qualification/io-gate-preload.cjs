// Test-only scheduling/crash boundary. Loaded only into an owned synthetic CLI
// child. It changes neither the coordinator source nor its returned file bytes.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = fs.realpathSync(process.env.XENIOS_COORDINATION_FIXTURE_ROOT || '');
const temp = fs.realpathSync(os.tmpdir());
const normalize = value => path.resolve(value).toLowerCase();
assert(normalize(root).startsWith(normalize(temp) + path.sep));
assert(path.basename(root).startsWith('xenios-coordination-'));
assert.equal(normalize(process.cwd()), normalize(root));
const marker = JSON.parse(fs.readFileSync(path.join(root, 'fixture-owner.json'), 'utf8'));
assert.equal(marker.kind, 'xenios-coordination-qualification-v1');
assert.equal(marker.runId, process.env.XENIOS_COORDINATION_RUN_ID);
const actor = process.env.XENIOS_COORDINATION_ACTOR;
assert(/^[a-z][a-z0-9-]{1,40}$/.test(actor));
const mode = process.env.XENIOS_COORDINATION_GATE;
assert(['after-ownership-read', 'after-task-write'].includes(mode));

const originalRead = fs.readFileSync;
const originalWrite = fs.writeFileSync;
const originalAppend = fs.appendFileSync;
const originalExists = fs.existsSync;
const board = normalize(path.join(root, '.xenios', 'ACTIVE_TASKS.json'));
const ownership = normalize(path.join(root, '.xenios', 'CODE_OWNERSHIP.json'));
const gateDirectory = path.join(root, 'gates');
const journal = path.join(gateDirectory, actor + '.jsonl');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let boardReadSha256 = null;
let used = false;
function fileKey(value) {
  return typeof value === 'string' || Buffer.isBuffer(value) ? normalize(String(value)) : null;
}
function event(kind, details = {}) {
  const value = { kind, pid: process.pid, at: new Date().toISOString(), ...details };
  originalAppend.call(fs, journal, JSON.stringify(value) + '\n');
  return value;
}
function pause(kind, details) {
  if (used) return;
  used = true;
  const value = event(kind, details);
  originalWrite.call(fs, path.join(gateDirectory, actor + '.ready.json'), JSON.stringify(value));
  const release = path.join(gateDirectory, actor + '.release');
  const deadline = Date.now() + 20_000;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (!originalExists.call(fs, release)) {
    if (Date.now() >= deadline) {
      event('gate_timeout');
      process.exit(87);
    }
    Atomics.wait(sleeper, 0, 0, 10);
  }
  event('gate_released');
}
event('process_started');
fs.readFileSync = function (file, ...args) {
  const value = originalRead.call(fs, file, ...args);
  if (fileKey(file) === board) boardReadSha256 = hash(value);
  if (mode === 'after-ownership-read' && fileKey(file) === ownership) {
    pause('ownership_read', { ownershipReadSha256: hash(value), boardReadSha256 });
  }
  return value;
};
fs.writeFileSync = function (file, data, ...args) {
  const value = originalWrite.call(fs, file, data, ...args);
  if (mode === 'after-task-write' && fileKey(file) === board) {
    pause('task_write_committed', { boardWrittenSha256: hash(data) });
  }
  return value;
};
