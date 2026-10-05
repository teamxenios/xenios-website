import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

if (process.version !== 'v20.19.0') throw new Error('Pinned Node v20.19.0 required');
const [job, ...args] = process.argv.slice(2);
if (!job || !/^[a-z0-9-]+$/.test(job) || args.length === 0) throw new Error('job and Node arguments required');
const cwd = 'C:/Users/sboad/.codex/worktrees/b22f/xenios-website';
const output = 'C:/Users/sboad/.codex/tmp/health-n2-20261001';
if (existsSync(resolve(output, `${job}-start.json`))) throw new Error('Refusing to overwrite a previous run');
const git = (...values) => execFileSync('git', values, { cwd, encoding: 'utf8' }).trim();
const env = { ...process.env, PATH: `${dirname(process.execPath)};${process.env.PATH}`,
  XENIOS_MASTER_OFFERINGS_DATASET: resolve(cwd, 'server/research/master-offerings/data/member-safe-master-offerings.generated.json') };
const npm = execFileSync(process.execPath, [resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), '--version'], { encoding: 'utf8', env }).trim();
const record = { startedAt: new Date().toISOString(), head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
  dirtyAtStart: git('status', '--short'), node: process.version, npm, execPath: process.execPath,
  command: [process.execPath, ...args], cwd, dataset: env.XENIOS_MASTER_OFFERINGS_DATASET, runnerPid: process.pid };
const log = createWriteStream(resolve(output, `${job}.log`));
const digest = createHash('sha256');
const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
record.childPid = child.pid;
writeFileSync(resolve(output, `${job}-start.json`), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record));
const provenance = [];
function snapshot() {
  try {
    const rows = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Select-Object ProcessId,ParentProcessId,ExecutablePath | ConvertTo-Json -Compress"], { encoding: 'utf8' }));
    const all = Array.isArray(rows) ? rows : [rows];
    const included = new Set([process.pid, child.pid]);
    for (let pass = 0; pass < all.length; pass++) for (const row of all) if (included.has(row.ParentProcessId)) included.add(row.ProcessId);
    provenance.push({ observedAt: new Date().toISOString(), processes: all.filter(row => included.has(row.ProcessId)) });
    writeFileSync(resolve(output, `${job}-provenance.json`), `${JSON.stringify(provenance, null, 2)}\n`);
  } catch { provenance.push({ observedAt: new Date().toISOString(), unavailable: true }); }
}
const first = setTimeout(snapshot, 4000);
const interval = setInterval(snapshot, 60000);
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { digest.update(chunk); log.write(chunk); process.stdout.write(chunk); });
child.on('error', error => console.error(error));
child.on('close', (exitCode, signal) => {
  clearTimeout(first); clearInterval(interval); log.end();
  const finishedAt = new Date().toISOString();
  const result = { ...record, finishedAt, elapsedMs: Date.parse(finishedAt) - Date.parse(record.startedAt),
    exitCode, signal, logSha256: digest.digest('hex'), finalHead: git('rev-parse', 'HEAD'), dirtyAtEnd: git('status', '--short') };
  writeFileSync(resolve(output, `${job}-result.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nCHECK_RESULT=${JSON.stringify(result)}`);
  process.exitCode = exitCode ?? 1;
});
