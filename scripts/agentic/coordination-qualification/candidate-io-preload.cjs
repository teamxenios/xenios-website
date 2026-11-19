// Candidate-only scheduler. Hooks real filesystem operations without replacing
// returned bytes or implementation. Refuses every non-owned/non-temp target.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const childProcess = require('node:child_process');
const observerDiagnostics = require('./observer-diagnostics.cjs');
const assert = require('node:assert/strict');
const root = fs.realpathSync(process.env.XENIOS_CANDIDATE_FIXTURE || '');
const normalize = value => path.resolve(String(value)).toLowerCase();
assert(normalize(root).startsWith(normalize(fs.realpathSync(os.tmpdir())) + path.sep));
assert(path.basename(root).startsWith('xenios-coordination-candidate-'));
const marker = JSON.parse(fs.readFileSync(path.join(root, 'fixture-owner.json'), 'utf8'));
assert.equal(marker.kind, 'xenios-coordination-candidate-v1');
assert.equal(marker.runId, process.env.XENIOS_CANDIDATE_RUN_ID);
assert(marker.worktrees.some(value => normalize(value) === normalize(process.cwd())));
const actor = process.env.XENIOS_CANDIDATE_ACTOR;
assert(/^[a-z0-9-]{1,40}$/.test(actor));
const modes = new Set((process.env.XENIOS_CANDIDATE_GATES || '').split(',').filter(Boolean));
const original = { rename: fs.renameSync, unlink: fs.unlinkSync, write: fs.writeFileSync,
  append: fs.appendFileSync, exists: fs.existsSync, stdout: process.stdout.write.bind(process.stdout), execFile: childProcess.execFileSync };
const journal = path.join(root, 'gates', actor + '.jsonl'), used = new Set();
function event(kind, details = {}) { original.append(journal, JSON.stringify({ kind, pid: process.pid, at: new Date().toISOString(), ...details }) + '\n'); }
function pause(kind) {
  if (!modes.has(kind) || used.has(kind)) return;
  used.add(kind); event('paused-' + kind);
  const release = path.join(root, 'gates', actor + '.' + kind + '.release'), deadline = Date.now() + 45_000;
  while (!original.exists(release)) {
    if (Date.now() > deadline) { event('gate-timeout'); process.exit(87); }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  event('released-' + kind);
}
const corpus = normalize(marker.corpusRoot), meta = corpus + path.sep + '.coordination';
let corpusReplacements = 0;
event('started');
childProcess.execFileSync = function (file, args, ...options) {
  const index = Array.isArray(args) ? args.indexOf('-OwnerProcessId') : -1;
  const observer = path.basename(String(file)).toLowerCase() === 'powershell.exe' && index >= 0
    && args.some(value => path.basename(String(value)) === 'corpus-owner-process.ps1');
  if (!observer) return original.execFile.call(childProcess, file, args, ...options);
  const subjectPid = Number(args[index + 1]), started = process.hrtime.bigint();
  event('owner-observer-started', { subjectPid });
  let stdout, failure;
  try { stdout = original.execFile.call(childProcess, file, args, ...options); return stdout; }
  catch (error) { failure = error; throw error; }
  finally {
    // Observe exactly the production call/result. fd3 is an owned harness-only
    // pipe, preserving the CLI stdout/stderr contract and six-key base env.
    let diagnostic;
    try {
      diagnostic = observerDiagnostics.invocation({ stdout: failure?.stdout ?? stdout,
        stderr: failure?.stderr, error: failure, subjectPid,
        elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6 });
      original.write(3, JSON.stringify({ runId: marker.runId, actor,
        supervisorNonce: marker.supervisor?.nonce ?? null, diagnostic }) + '\n');
    } catch { /* Diagnostic delivery cannot alter production return/throw. */ }
    try { if (diagnostic) event('owner-observer-completed', { diagnostic }); } catch { /* Pipe delivery is independent of fixture disk writes. */ }
  }
};
// Observe the actual production invocation; never replace its bytes or facts.
require('node:module').syncBuiltinESMExports();
fs.renameSync = function (from, to) {
  const destination = normalize(to), mutex = destination === meta + path.sep + 'mutex';
  if (mutex) event('mutex-attempt');
  const result = original.rename.call(fs, from, to);
  if (mutex) { event('mutex-acquired'); pause('after-lock'); }
  else if (destination.startsWith(corpus + path.sep) && !destination.startsWith(meta + path.sep)) {
    corpusReplacements++; event('corpus-replaced', { path: path.relative(marker.corpusRoot, String(to)), index: corpusReplacements });
    pause('after-corpus-' + corpusReplacements);
  } else if (destination.startsWith(meta + path.sep)) {
    const name = path.basename(String(to));
    const kind = ({ 'PREPARE.json': 'after-prepare', 'COMMIT.json': 'after-commit', 'HEAD.json': 'after-head', 'APPLIED.json': 'after-applied' })[name];
    if (kind) { event(kind); pause(kind); }
  }
  return result;
};
fs.unlinkSync = function (file) {
  const key = normalize(file);
  if (key.startsWith(meta + path.sep + 'mutex' + path.sep + 'owner-')) pause('before-owner-unlink');
  return original.unlink.call(fs, file);
};
process.stdout.write = function (chunk, ...args) {
  if (typeof chunk === 'string' && chunk.includes('"coordination"')) pause('before-ack');
  return original.stdout(chunk, ...args);
};
