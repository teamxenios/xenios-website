// Manually invoked only after Root's exclusive slot + fresh memory guard.
// Fixture qualification only. Never installs, builds, deploys or edits a ledger.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourceSha = process.argv[2];
const sha = value => createHash('sha256').update(value).digest('hex');
if (process.versions.node !== '20.19.0' || !/^[0-9a-f]{40}$/.test(sourceSha ?? '')) throw new Error('PINNED_NODE_AND_EXACT_SOURCE_REQUIRED');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (head !== sourceSha || execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()) {
  throw new Error('SOURCE_MUST_BE_EXACT_AND_CLEAN');
}
const started = Date.now();
const deadline = started + 10 * 60_000;
const receiptParent = path.join(root, '.receipts'); fs.mkdirSync(receiptParent, { recursive: true });
const receipt = fs.mkdtempSync(path.join(receiptParent, 'qualification-' + sourceSha.slice(0, 8) + '-'));
const sourceFiles = ['fixtures.mjs', 'fixtures.test.mjs', 'protocol.test.mjs', 'qualify.mjs'];
const sources = sourceFiles.map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
const records = [];
let index = 0;
let result = 'NOT_STARTED';

async function childJob(file, pattern, phase) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('OVERALL_BUDGET_EXHAUSTED');
  const id = String(++index).padStart(3, '0');
  const stdoutFile = path.join(receipt, id + '.stdout.txt');
  const stderrFile = path.join(receipt, id + '.stderr.txt');
  const stdout = fs.openSync(stdoutFile, 'wx'); const stderr = fs.openSync(stderrFile, 'wx');
  const args = ['--max-old-space-size=384', '--test', '--test-concurrency=1', '--test-name-pattern=' + pattern, path.join(root, file)];
  const record = { id, phase, file, pattern, sourceSha, command: [process.execPath, ...args],
    startedAt: new Date().toISOString(), pid: null, observedWorkers: [], exitCode: null,
    stoppedByBudget: false, stdout: path.basename(stdoutFile), stderr: path.basename(stderrFile) };
  const child = spawn(process.execPath, args, { cwd: root, windowsHide: true,
    env: { ...process.env, XENIOS_AUTH_PROTOCOL_RECEIPT: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  record.pid = child.pid ?? null; records.push(record);
  fs.writeFileSync(path.join(receipt, id + '.start.json'), JSON.stringify(record, null, 2) + '\n');
  let output = '';
  child.stdout.on('data', chunk => { fs.writeSync(stdout, chunk); output += chunk.toString(); });
  child.stderr.on('data', chunk => fs.writeSync(stderr, chunk));
  let killer;
  const timeout = setTimeout(() => {
    record.stoppedByBudget = true;
    if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || child.exitCode !== null) return;
    // Exact owned child tree only; no process-name or shared-session kill.
    if (process.platform === 'win32') {
      killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      killer.stderr.on('data', chunk => fs.writeSync(stderr, chunk));
    } else child.kill('SIGKILL');
  }, Math.min(60_000, remaining));
  try {
    record.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    if (killer) await new Promise(resolve => { if (killer.exitCode !== null) resolve(); else killer.once('close', resolve); });
  } finally { clearTimeout(timeout); fs.closeSync(stdout); fs.closeSync(stderr); }
  record.finishedAt = new Date().toISOString();
  record.observedWorkers = [...output.matchAll(/prototype-worker:(\{"pid":\d+,"at":"[^"]+"\})/g)].map(match => JSON.parse(match[1]));
  record.stdoutSha256 = sha(fs.readFileSync(stdoutFile)); record.stderrSha256 = sha(fs.readFileSync(stderrFile));
  fs.writeFileSync(path.join(receipt, id + '.exit.json'), JSON.stringify(record, null, 2) + '\n');
  if (record.exitCode !== 0 || record.stoppedByBudget) throw new Error('CHILD_FAILED:' + id);
  return output;
}
const regex = name => '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
try {
  for (const file of ['fixtures.test.mjs', 'protocol.test.mjs']) {
    // Register/import only. Every named case is skipped and never counted as
    // passed; this obtains exact parameterized names from the actual source.
    const discovery = await childJob(file, '^$', 'DISCOVERY_ONLY_ALL_SKIPPED');
    const names = [...discovery.matchAll(/^# Subtest: (.+)$/gm)].map(match => match[1]);
    if (!names.length || !/# pass 0(?:\r?\n|$)/.test(discovery)) throw new Error('INVALID_CASE_DISCOVERY');
    for (const name of names) {
      const output = await childJob(file, regex(name), 'ONE_NAMED_CASE');
      if (!/# pass 1(?:\r?\n|$)/.test(output) || !/# fail 0(?:\r?\n|$)/.test(output)) throw new Error('CASE_NOT_EXACTLY_ONE_PASS');
      console.log(JSON.stringify({ case: name, status: 'PASS', id: records.at(-1).id }));
    }
  }
  result = 'SYNTHETIC_SUITE_PASS';
} catch (error) {
  result = 'STOPPED_FIRST_FAILURE_OR_BUDGET';
  process.exitCode = 1;
  console.log(JSON.stringify({ status: result, reason: error.message, lastJob: records.at(-1)?.id }));
} finally {
  const unchanged = sources.every(source => source.sha256 === sha(fs.readFileSync(path.join(root, source.path))));
  if (!unchanged) { result = 'SOURCE_CHANGED_DURING_JOB'; process.exitCode = 1; }
  const summary = { sourceSha, node: process.versions.node, runnerPid: process.pid,
    startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(),
    overallBudgetMs: 600_000, childBudgetMs: 60_000, heapMiB: 384, workers: 1,
    result, sources, sourceUnchanged: unchanged, records, authority: 'ISOLATED_SYNTHETIC_ONLY_NO_ADOPTION' };
  fs.writeFileSync(path.join(receipt, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ status: result, receipt, jobs: records.length }));
}
