// Read-only original GitHub artifact acquisition; never a build or provider action.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO, SOURCE, TREE, ORIGINAL, validatePush, validateOriginal, validateScenes } from './policy.mjs';
import { importHostedProductStudio } from '../import-hosted-product-studio.mjs';
import { readPinnedPwaAssets } from '../lib/hosted-preview-pwa.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
validatePush(process.env);
assert(process.version === 'v20.19.0', 'PINNED_NODE');
const repo = realpathSync(process.cwd()), temp = realpathSync(process.env.RUNNER_TEMP);
const root = join(temp, 'xenios-hosted-scenes-inputs-' + process.env.GITHUB_RUN_ID + '-1');
assert(!existsSync(root) && root.startsWith(temp + '/'), 'FRESH_INPUT_DIRECTORY'); mkdirSync(root);
assert(process.env.GITHUB_OUTPUT && resolve(process.env.GITHUB_OUTPUT) === realpathSync(process.env.GITHUB_OUTPUT));
writeFileSync(process.env.GITHUB_OUTPUT, 'input_root=' + root + '\n', { flag: 'a' });
let phase = 'verify_qualification_source';
const stateFile = join(root, 'acquisition-state.json');
writeFileSync(stateFile, JSON.stringify({ state: 'STARTED', source: SOURCE, browserExecuted: false }) + '\n', { flag: 'wx' });
process.on('uncaughtException', () => {
  writeFileSync(stateFile, JSON.stringify({ state: 'FAILED_NO_RETRY', phase, source: SOURCE, browserExecuted: false }) + '\n');
  console.error('HOSTED_SCENES_ACQUISITION_FAILED_NO_RETRY'); process.exitCode = 1;
});
const spec = JSON.parse(readFileSync(new URL('./selection.json', import.meta.url))); validateScenes(spec.scenes);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }).trim();
assert.equal(git('rev-parse', 'HEAD'), process.env.GITHUB_SHA);
assert.deepEqual(git('show', '-s', '--format=%P', 'HEAD').split(' '), [SOURCE], 'ONE_DIRECT_CHILD_QUALIFICATION_COMMIT');
assert.equal(git('rev-parse', SOURCE + '^{tree}'), TREE);
assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '', 'CLEAN_QUALIFICATION_CHECKOUT');
const changes = git('diff', '--name-status', SOURCE, 'HEAD').split('\n').filter(Boolean).map(s => s.split('\t'));
assert(changes.every(([s, p]) => s === 'A' && spec.allowedAdditions.includes(p))
  && changes.length === spec.allowedAdditions.length && new Set(changes.map(r => r[1])).size === changes.length, 'ADDITIVE_QA_ONLY_TREE');
for (const f of spec.acceptedStudioFiles) { const b = readFileSync(join(repo, f.path)); assert.equal(b.length, f.bytes); assert.equal(hash(b), f.sha256); }
{ const f = spec.tb500Driver, b = readFileSync(join(repo, f.path)); assert.equal(b.length, f.bytes); assert.equal(hash(b), f.sha256, 'ONLY_ACCEPTED_V4_DRIVER'); }
assert.deepEqual(spec.namespaceInitFiles.map(f => f.path), ['scripts/evidence/hosted-scenes/namespace-init.mjs', 'scripts/evidence/hosted-scenes/namespace-init.test.mjs'], 'EXACT_NAMESPACE_INIT_FILES');
for (const f of spec.namespaceInitFiles) { const b = readFileSync(join(repo, f.path)); assert.equal(b.length, f.bytes); assert.equal(hash(b), f.sha256, 'REVIEWED_NAMESPACE_INIT_FILE'); }
const token = process.env.GH_TOKEN; assert(token, 'EPHEMERAL_ACTIONS_READ_TOKEN_REQUIRED');
const ghConfig = join(root, 'gh-private'); mkdirSync(ghConfig);
const ghEnv = { PATH: process.env.PATH, GH_TOKEN: token, GH_HOST: 'github.com', GH_CONFIG_DIR: ghConfig, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' };
function api(path, zip = false) {
  assert(path.startsWith('repos/' + REPO + '/'), 'FIXED_REPOSITORY');
  try { return execFileSync('gh', ['api', path], { env: ghEnv, stdio: ['ignore', 'pipe', 'pipe'], timeout: 45000, maxBuffer: zip ? 8 * 1024 * 1024 : 2 * 1024 * 1024 }); }
  catch { throw Error('FIXED_GITHUB_READ_FAILED_NO_RETRY'); } // Never print token, signed redirect, stderr or inherited env.
}
phase = 'read_original_github_identity';
const rawRun = api(`repos/${REPO}/actions/runs/${ORIGINAL.run}`);
const rawJobs = api(`repos/${REPO}/actions/runs/${ORIGINAL.run}/attempts/1/jobs?per_page=100`);
const rawArtifact = api(`repos/${REPO}/actions/artifacts/${ORIGINAL.artifact}`);
const rawCommit = api(`repos/${REPO}/git/commits/${ORIGINAL.runner}`);
const run = JSON.parse(rawRun), jobs = JSON.parse(rawJobs), artifact = JSON.parse(rawArtifact), commit = JSON.parse(rawCommit);
validateOriginal(run, jobs, artifact, commit);
phase = 'download_original_archive_once';
const zip = api(`repos/${REPO}/actions/artifacts/${ORIGINAL.artifact}/zip`, true);
assert.equal(zip.length, ORIGINAL.bytes); assert.equal(hash(zip), ORIGINAL.sha256);
writeFileSync(join(root, 'artifact.zip'), zip, { flag: 'wx' });
const write = (name, value) => { const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); writeFileSync(join(root, name), bytes, { flag: 'wx' }); return { path: join(root, name), sha256: hash(bytes) }; };
const selection = write('artifact-selection.json', { repo: REPO, run: ORIGINAL.run, attempt: 1, buildJob: ORIGINAL.job, artifact });
const progress = write('original-qualification.json', { liveRun: { id: ORIGINAL.run, attempt: 1, head: SOURCE, buildJob: ORIGINAL.job }, currentSource: { tree: TREE },
  originalRunConclusion: run.conclusion, originalBuildConclusion: 'success', rawReadSha256: { run: hash(rawRun), jobs: hash(rawJobs), artifact: hash(rawArtifact), runner: hash(rawCommit) } });
const rootSelection = write('root-selected-input.json', { source: SOURCE, tree: TREE, runner: ORIGINAL.runner, node: 'v20.19.0',
  run: ORIGINAL.run, attempt: 1, job: ORIGINAL.job, artifact: ORIGINAL.artifact, archiveBytes: ORIGINAL.bytes, archiveSha256: ORIGINAL.sha256,
  role: 'Root-reviewed QA-only branch input selection; not production authorization', selectionSha256: hash(readFileSync(new URL('./selection.json', import.meta.url))) });
const binding = { kind: 'ROOT_SELECTED_HOSTED_PREVIEW_BINDING_V1', profile: 'XENIOS_HOSTED_STATIC_PREVIEW_IMPORT_V1', source: SOURCE, tree: TREE,
  base: ORIGINAL.base, runner: ORIGINAL.runner, runnerTree: TREE, runnerParents: [ORIGINAL.base, SOURCE], runId: ORIGINAL.run, attempt: 1,
  jobId: ORIGINAL.job, jobName: 'build', jobConclusion: 'success', artifactId: ORIGINAL.artifact, artifactName: artifact.name, artifactExpired: false,
  archiveBytes: ORIGINAL.bytes, archiveSha256: ORIGINAL.sha256, archiveRoot: '', node: 'v20.19.0', custodian: 'Single Root-selected hosted qualification job',
  rootSelectionPath: rootSelection.path, rootSelectionSha256: rootSelection.sha256, runnerSelectionEvidenceSha256: rootSelection.sha256,
  artifactEvidencePath: selection.path, artifactEvidenceSha256: selection.sha256, progressEvidencePath: progress.path,
  runEvidenceSha256: progress.sha256, jobEvidenceSha256: progress.sha256, optionalBareImports: spec.optionalBareImports };
const bindingFile = write('binding.json', binding).path;
phase = 'verify_and_import_static_subset';
const dist = join(root, 'imported-dist'); const importResult = importHostedProductStudio({ archive: join(root, 'artifact.zip'), bindingFile, repo, out: dist });
phase = 'compose_exact_static341_git_media11_and_git_pwa2';
const staticRoot = join(root, 'tb500-static'); mkdirSync(staticRoot);
const inventoryBytes = readFileSync(join(repo, 'scripts/evidence/hosted-scenes/tb500-static-inventory.json'));
assert.equal(hash(inventoryBytes), spec.tb500InventorySha256);
const inventory = JSON.parse(inventoryBytes);
assert.equal(inventory.length, 354); assert.equal(new Set(inventory.map(f => f.path)).size, 354);
const pwa = readPinnedPwaAssets(repo);
let compiledCopies = 0, gitCopies = 0, pwaCopies = 0;
for (const f of inventory) {
  assert(/^[A-Za-z0-9_./-]+$/.test(f.path) && !f.path.split('/').some(p => !p || p === '..' || p === '.'), 'STATIC_MEMBER_PATH');
  const from = join(dist, 'public', f.path);
  const compiled = existsSync(from);
  const pwaAsset = pwa.get('/' + f.path);
  if (!compiled) assert(f.path.startsWith('research/product-media/') || pwaAsset, 'ONLY_PINNED_GIT_MEDIA_OR_EXACT_PWA_SUPPLEMENT');
  const bytes = compiled ? readFileSync(from) : pwaAsset ? pwaAsset.bytes : execFileSync('git', ['show', `${SOURCE}:client/public/${f.path}`], { maxBuffer: 4 * 1024 * 1024 });
  if (compiled) compiledCopies++; else if (pwaAsset) pwaCopies++; else gitCopies++;
  assert.equal(bytes.length, f.bytes); assert.equal(hash(bytes), f.sha256);
  const target = join(staticRoot, f.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: 'wx' });
}
assert.equal(compiledCopies, 341); assert.equal(gitCopies, 11); assert.equal(pwaCopies, 2);
const context = { kind: 'ACTUAL_READ_ONLY_ORIGINAL_ARCHIVE_IMPORT_FOR_NEW_QA_RUN', source: SOURCE, tree: TREE,
  original: ORIGINAL, importResult, dist, staticRoot, scenes: spec.scenes, archiveSha256: hash(zip),
  newExecution: { run: process.env.GITHUB_RUN_ID, attempt: '1', job: process.env.GITHUB_JOB,
    commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), parents: [SOURCE] },
  sourceQaReceiptSha256: spec.sourceQaReceiptSha256, canonicalWorkflowUnchanged: true, builtApplication: false, browserExecuted: false,
  gitPwaSupplements: [...pwa.values()].map(({ bytes, ...pin }) => ({ ...pin, bytes: bytes.length, source: SOURCE, fromImportedArchive: false })) };
write('context.json', context);
writeFileSync(stateFile, JSON.stringify({ state: 'IMPORTED_NO_BUILD_NO_BROWSER', source: SOURCE, files: 341, staticFiles: 354, gitPwaSupplements: 2 }) + '\n');
console.log(JSON.stringify({ state: 'ORIGINAL_ARCHIVE_VERIFIED_IMPORTED_NO_BUILD', source: SOURCE, files: importResult.importedFiles, contextSha256: hash(readFileSync(join(root, 'context.json'))) }));
