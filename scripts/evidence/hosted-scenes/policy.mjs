import assert from 'node:assert/strict';
export const REPO = 'teamxenios/xenios-website';
export const SOURCE = 'ea78e6bcb24b247074f3b76f5e73addc73bb755a';
export const TREE = '49651b5d5ab6914227957e7b3faf84c7e2445847';
export const ORIGINAL = Object.freeze({ run: 45427854472, attempt: 1, job: 138564644523, artifact: 14938575655,
  sha256: '5dca57a0644751cf18cc27b5b33d36fc97473c76b8b5bb70e98e739d6818e4ee', bytes: 2605620,
  runner: '857cf5155d4fd28614f2a1a4993b2db3e48d78fe', base: 'dbdb88639b3b08370e9e1114686ea491ff250164' });
export const BRANCH = 'qual/ea-ea78e6bc-chrome158-startup-observation-20261124';
export const ROOT_ARCHIVE_SELECTION_SHA256 = 'f98d847aa77578ba7533d922abb738b1057c1da5ffdb7554dc0ebceee5b5ec26';
export function validateScenes(scenes) {
  assert(JSON.stringify(scenes) === '["staff","owner"]', 'CLOSED_SEQUENTIAL_SCENE_SELECTION');
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
