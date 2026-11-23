import assert from 'node:assert/strict';
export const REPO = 'teamxenios/xenios-website';
export const SOURCE = '83f95809d66520e7ab89588a3d99fbdf28bfc9aa';
export const TREE = '687cd9d57fc0a86a616db0731bd0a8441a4edfd5';
export const ORIGINAL = Object.freeze({ run: 45264187606, attempt: 1, job: 138006604146, artifact: 14861368170,
  sha256: 'cfb63e2855beb885fa65a94c3fc7eab1ac6139d8ca106c9d51237f8d2db446b2', bytes: 2597265,
  runner: '12592f6c2d7c9aba8a47291de3396925bd580666', base: '2b1ed5f7ccac66477c97de280640ffa72b720c91' });
export const BRANCH = 'qual/ea-83f95809-studio-owner-query-20261123';
export function validateScenes(scenes) {
  assert(['["tb500"]', '["product-studio"]', '["tb500","product-studio"]'].includes(JSON.stringify(scenes)), 'CLOSED_SEQUENTIAL_SCENE_SELECTION');
  return scenes;
}
export function validateOwnedRelease({ baseline, current, ownerPid, profileNames }) {
  assert(baseline.some(p => p.pid === ownerPid) && current.some(p => p.pid === ownerPid), 'OWNER_PROCESS_OBSERVATION_MISSING');
  assert(profileNames.length === 0, 'OWNED_PROFILE_REMOVAL_UNCONFIRMED');
  for (const p of current) assert(baseline.some(b => b.pid === p.pid && b.startTicks === p.startTicks), 'OWNED_CHILD_EXIT_UNCONFIRMED');
  return { ownerPid, processes: current, profileNames, release: 'ACTUAL_CHILD_EXIT_AND_PROFILE_ABSENCE_NOT_CLOSE_CALL_ASSUMPTION' };
}
export function validatePush(env) {
  assert(env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Linux' && env.GITHUB_REPOSITORY === REPO
    && env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/' + BRANCH && env.GITHUB_RUN_ATTEMPT === '1', 'EXACT_ONE_PUSH_CAPABILITY');
  assert(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && /^\d+$/.test(env.GITHUB_RUN_ID ?? ''), 'NEW_QUALIFICATION_IDENTITY');
}
export function validateOriginal(run, jobList, artifact, commit) {
  assert(run.id === ORIGINAL.run && run.run_attempt === 1 && run.head_sha === SOURCE && run.conclusion === 'success'
    && run.repository?.full_name === REPO, 'ORIGINAL_RUN_IDENTITY');
  const jobs = jobList.jobs?.filter(j => j.id === ORIGINAL.job);
  assert(jobs?.length === 1 && jobs[0].run_id === ORIGINAL.run && jobs[0].conclusion === 'success' && jobs[0].name === 'build', 'ORIGINAL_JOB_IDENTITY');
  assert(artifact.id === ORIGINAL.artifact && artifact.name === 'homepage-preview-' + SOURCE && artifact.expired === false
    && artifact.size_in_bytes === ORIGINAL.bytes && artifact.digest === 'sha256:' + ORIGINAL.sha256
    && artifact.workflow_run?.id === ORIGINAL.run && artifact.workflow_run.head_sha === SOURCE, 'ORIGINAL_ARTIFACT_IDENTITY');
  assert(commit.sha === ORIGINAL.runner && commit.tree?.sha === TREE
    && JSON.stringify(commit.parents?.map(p => p.sha)) === JSON.stringify([ORIGINAL.base, SOURCE]), 'ORIGINAL_RUNNER_GRAPH');
  return jobs[0];
}
