// Exact local evidence for the finance sprint. No hosted command is available.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
assert.equal(process.cwd(), root, 'Run from the isolated checkout root');
assert.equal(process.version, 'v20.19.0', 'Use the pinned Node runtime');
const [job, runName] = process.argv.slice(2);
assert.match(runName ?? '', /^[a-z0-9][a-z0-9-]{2,90}$/);
const vitest = ['node_modules/vitest/vitest.mjs', 'run'];
const serial = ['--maxWorkers=1', '--no-file-parallelism'];
const jobs = {
  focused: [...vitest, 'server/research/assisted-order', ...serial],
  attribution: [...vitest, 'server/research/assisted-order/provider-attribution-sql.test.ts', ...serial],
  functional: ['supabase/verification/research_assisted_order_provider_attribution_local.mjs'],
  'races-deferred': ['supabase/verification/research_assisted_order_provider_attribution_races.mjs'],
  typecheck: ['node_modules/typescript/bin/tsc', '--noEmit'],
  full: [...vitest, ...serial],
  dag: ['--import', 'tsx', 'scripts/acceptance/verify-migration-dag.ts'],
  routes: ['--import', 'tsx', 'scripts/acceptance/verify-route-uniqueness.ts'],
  protection: ['scripts/acceptance/verify-core-site-protection.mjs'],
  pgcrypto: ['--import', 'tsx', 'scripts/acceptance/verify-pgcrypto-qualification.ts'],
};
assert.ok(Object.hasOwn(jobs, job), `Unknown check: ${job}`);
const args = jobs[job];
const folder = path.join(root, '.local/finance-sprint-20261003', runName);
await mkdir(folder, { recursive: false }).catch(async error => {
  if (error.code !== 'ENOENT') throw error;
  await mkdir(path.dirname(folder), { recursive: true });
  await mkdir(folder);
});
const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const trackedPaths = git('ls-files', '--', 'server', 'shared', 'client', 'supabase',
  'scripts', 'script', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'vitest.config.ts', 'docs/coordination', 'docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json')
  .split(/\r?\n/).filter(Boolean);
async function snapshot() {
  const manifest = {};
  for (const name of trackedPaths) {
    // Continuity/evidence cannot alter tested source, but is recorded in dirty state.
    if (name.includes('/finance-sprint-20261003/') || name.endsWith('/FINANCE_SPRINT_V2_20261003.md')) continue;
    manifest[name] = digest(await readFile(path.join(root, name)));
  }
  return { head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    dirty: git('status', '--porcelain'), sourceManifestSha256: digest(JSON.stringify(manifest)), manifest };
}
const start = await snapshot();
const evidenceRunnerSha256 = digest(await readFile(fileURLToPath(import.meta.url)));
const startedAt = new Date().toISOString();
const started = performance.now();
const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ''}`,
  XENIOS_MASTER_OFFERINGS_DATASET: path.join(root, 'server/research/master-offerings/data/member-safe-master-offerings.generated.json') };
let stdout = '', stderr = '';
console.log(JSON.stringify({ job, runName, startedAt, head: start.head, dirty: start.dirty,
  executable: process.execPath, args, hostQualification: 'SHARED_HOST_UNQUALIFIED' }));
const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
const outcome = await new Promise(resolve => {
  child.on('error', error => resolve({ exitCode: null, signal: null, error: String(error) }));
  child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
});
const finishedAt = new Date().toISOString();
const durationSeconds = (performance.now() - started) / 1000;
await writeFile(path.join(folder, 'stdout.log'), stdout);
await writeFile(path.join(folder, 'stderr.log'), stderr);
const end = await snapshot();
const receipt = { schemaVersion: 1, job, runName, startedAt, finishedAt, durationSeconds,
  executable: process.execPath, nodeVersion: process.version, args, ...outcome,
  evidenceRunnerSha256,
  start: { ...start, manifest: undefined }, end: { ...end, manifest: undefined },
  sourceUnchangedAtBoundaries: start.sourceManifestSha256 === end.sourceManifestSha256,
  continuousFilesystemAttestation: false, hostQualification: 'SHARED_HOST_UNQUALIFIED',
  stdoutSha256: digest(stdout), stderrSha256: digest(stderr),
  productionMutated: false, managedDatabaseUsed: false };
await writeFile(path.join(folder, 'source-start.json'), JSON.stringify(start.manifest, null, 2) + '\n');
await writeFile(path.join(folder, 'source-end.json'), JSON.stringify(end.manifest, null, 2) + '\n');
await writeFile(path.join(folder, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(`FINANCE_CHECK_RECEIPT ${JSON.stringify(receipt)}`);
process.exitCode = start.sourceManifestSha256 === end.sourceManifestSha256 ? (outcome.exitCode ?? 1) : 1;
