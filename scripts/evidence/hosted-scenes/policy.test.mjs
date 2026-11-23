import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, SOURCE, TREE, ORIGINAL, BRANCH, validateOriginal, validatePush, validateScenes, validateOwnedRelease } from './policy.mjs';
const fixture = () => [
  { id: ORIGINAL.run, run_attempt: 1, head_sha: SOURCE, conclusion: 'success', repository: { full_name: REPO } },
  { jobs: [{ id: ORIGINAL.job, run_id: ORIGINAL.run, name: 'build', conclusion: 'success' }] },
  { id: ORIGINAL.artifact, name: 'homepage-preview-' + SOURCE, expired: false, size_in_bytes: ORIGINAL.bytes,
    digest: 'sha256:' + ORIGINAL.sha256, workflow_run: { id: ORIGINAL.run, head_sha: SOURCE } },
  { sha: ORIGINAL.runner, tree: { sha: TREE }, parents: [{ sha: ORIGINAL.base }, { sha: SOURCE }] }
];
test('exact original run/job/artifact/graph positive', () => assert.equal(validateOriginal(...fixture()).id, ORIGINAL.job));
for (const [name, mutate] of [
  ['source', r => r[0].head_sha = 'a'.repeat(40)], ['run attempt', r => r[0].run_attempt++],
  ['failed run', r => r[0].conclusion = 'failure'], ['job ID', r => r[1].jobs[0].id++],
  ['failed job', r => r[1].jobs[0].conclusion = 'failure'], ['expired artifact', r => r[2].expired = true],
  ['artifact digest', r => r[2].digest = 'sha256:' + '0'.repeat(64)], ['artifact source', r => r[2].workflow_run.head_sha = 'a'.repeat(40)],
  ['runner tree', r => r[3].tree.sha = 'a'.repeat(40)], ['runner parents', r => r[3].parents.reverse()]
]) test('refuses changed ' + name, () => { const f = fixture(); mutate(f); assert.throws(() => validateOriginal(...f)); });
const env = () => ({ GITHUB_ACTIONS: 'true', RUNNER_OS: 'Linux', GITHUB_REPOSITORY: REPO, GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/' + BRANCH, GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '123' });
test('one exact qualification branch push is admitted', () => assert.doesNotThrow(() => validatePush(env())));
for (const [key, value] of [['GITHUB_REF', 'refs/heads/main'], ['GITHUB_EVENT_NAME', 'pull_request'], ['GITHUB_RUN_ATTEMPT', '2'], ['RUNNER_OS', 'Windows']]) {
  test('refuses wrong execution capability ' + key, () => assert.throws(() => validatePush({ ...env(), [key]: value })));
}
test('closed scene selector is sequential and not an arbitrary command', () => {
  for (const s of [['tb500'], ['product-studio'], ['tb500', 'product-studio']]) assert.deepEqual(validateScenes(s), s);
  for (const s of [[], ['product-studio', 'tb500'], ['tb500', 'tb500'], ['deploy'], ['arbitrary/path']]) assert.throws(() => validateScenes(s));
});
test('wrapper retains namespace/privilege guards, owned tmp, timeout and failure capture', () => {
  const sh = readFileSync(new URL('./run-isolated.sh', import.meta.url), 'utf8');
  for (const marker of ['--mount --net --pid --fork --kill-child=SIGKILL --mount-proc', '--bounding-set=-all', '--no-new-privs', '/usr/bin/env -i', 'readlink /proc/self/ns/pid', 'readlink /proc/self/ns/net', '--make-rprivate /', '--bind "$out/tmp" /tmp', 'capture_isolated_exit', 'isolated_command_exited=true', 'trap finish EXIT']) assert(sh.includes(marker), marker);
  assert(!sh.includes('--no-sandbox')); assert(sh.includes('300000'));
});
test('scene cleanup is checked before the next phase, not inferred from exit0', () => {
  const text = readFileSync(new URL('./controller.mjs', import.meta.url), 'utf8');
  assert(text.includes("['page', 'connection', 'browserExitObserved', 'profileAbsent', 'previewClosed']"));
  assert(text.includes("assert.equal(proof.cleanup[key], true")); assert(text.includes('FAILURE_PRESERVED_NO_RETRY'));
  assert(text.includes('validateIsolation(') && text.includes('validateSourceBinding(') && text.includes('assertPinnedExecutingRuntime()'));
});
test('actual unchanged original namespace validator still refuses privilege/route/host escapes', async () => {
  const { validateIsolation } = await import(pathToFileURL(resolve('scripts/evidence/owned-runner-browser-qa.mjs')).href);
  const ok = { uid: 1001, netNamespace: 'net:[22]', parentNetNamespace: 'net:[11]', interfaces: ['lo'], routes: [], effectiveCaps: '00000000', noNewPrivs: '1' };
  assert.equal(validateIsolation(ok).uid, 1001);
  for (const bad of [{ uid: 0 }, { netNamespace: 'net:[11]' }, { interfaces: ['lo', 'eth0'] }, { routes: [{ dst: 'default' }] }, { effectiveCaps: '1' }, { noNewPrivs: '0' }]) assert.throws(() => validateIsolation({ ...ok, ...bad }));
});
test('actual process/profile observations prove release without trusting c068 close catches', () => {
  const b = [{ pid: 1, startTicks: '10' }];
  assert(validateOwnedRelease({ baseline: b, current: b, ownerPid: 1, profileNames: [] }));
  for (const current of [[...b, { pid: 2, startTicks: '20' }], [{ pid: 1, startTicks: '11' }], []]) assert.throws(() => validateOwnedRelease({ baseline: b, current, ownerPid: 1, profileNames: [] }));
  assert.throws(() => validateOwnedRelease({ baseline: b, current: b, ownerPid: 1, profileNames: ['xr-evidence-chrome-old'] }));
});
