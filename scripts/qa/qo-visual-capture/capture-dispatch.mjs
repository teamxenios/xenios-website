const repository = "teamxenios/xenios-website";
const ref = "refs/heads/codex/qo-synthetic-qa-20261105";
const standingAuthority = "KAN-225/11225";
const qaRecord = "KAN-31/11226";

export const historyAnchor = "8611e9311891ffbe40246bf877ab9e111bd59ecd";

const oid = /^[0-9a-f]{40}$/;
const runId = /^[1-9][0-9]{0,19}$/;
const rootScope = /^KAN-31\/([1-9][0-9]{0,19})$/;
const marker = (id, attempt) => "QO capture " + id + " attempt " + attempt;
const isOid = (value) => typeof value === "string" && oid.test(value) && value !== "0".repeat(40);

/** Evaluate the recorded dispatch. Root reconciles actual provider run IDs before the push. */
export function buildCaptureAllowance({ env, event, harnessSha, parents, predecessorSubject, history }) {
  const id = env.CAPTURE_EXECUTION_SCOPE_ID;
  const predecessor = env.CAPTURE_PREPARED_PREDECESSOR;
  if (!isOid(env.CANDIDATE_SHA) || !isOid(env.CANDIDATE_TREE) || !isOid(predecessor) || !isOid(harnessSha)) {
    throw new Error("Exact candidate, tree, harness and dormant predecessor must be bound");
  }
  if (env.GITHUB_EVENT_NAME !== "push" || env.GITHUB_REPOSITORY !== repository ||
      event.repository?.full_name !== repository || env.GITHUB_REF !== ref || event.ref !== ref ||
      event.created !== false || event.deleted !== false || event.forced !== false ||
      event.before !== predecessor || event.after !== harnessSha || event.head_commit?.id !== harnessSha ||
      env.GITHUB_SHA !== harnessSha || parents.length !== 1 || parents[0] !== predecessor ||
      predecessorSubject.startsWith("QO capture ")) {
    throw new Error("Dispatch must be one normal push from its exact prepared predecessor");
  }
  const match = rootScope.exec(id ?? "");
  if (!match || BigInt(match[1]) <= 11226n) throw new Error("A new Root execution scope under the standing approval is required");
  if (!/^[12]$/.test(env.CAPTURE_ALLOWANCE_ATTEMPT ?? "") || !/^[12]$/.test(env.CAPTURE_ALLOWANCE_MAX_ATTEMPTS ?? "") ||
      env.GITHUB_RUN_ATTEMPT !== "1" || !runId.test(env.GITHUB_RUN_ID ?? "")) {
    throw new Error("Invalid capture ordinal, budget or hosted attempt");
  }
  const attempt = Number(env.CAPTURE_ALLOWANCE_ATTEMPT);
  const maximumAttempts = Number(env.CAPTURE_ALLOWANCE_MAX_ATTEMPTS);
  if (attempt > maximumAttempts) throw new Error("Capture budget exhausted");
  const priorRunIds = JSON.parse(env.CAPTURE_PRIOR_RUN_IDS);
  if (!Array.isArray(priorRunIds) || priorRunIds.length !== attempt - 1 ||
      priorRunIds.some((value) => typeof value !== "string" || !runId.test(value)) ||
      new Set(priorRunIds).size !== priorRunIds.length || priorRunIds.includes(env.GITHUB_RUN_ID)) {
    throw new Error("Root must reconcile distinct prior run IDs");
  }
  const previousMarkers = history.filter(({ subject }) => subject.startsWith("QO capture " + id + " attempt "));
  if (attempt === 1 ? previousMarkers.length !== 0 :
      previousMarkers.length !== 1 || previousMarkers[0].subject !== marker(id, 1)) {
    throw new Error("Execution scope or ordinal was already dispatched, or its predecessor attempt is missing");
  }
  if (attempt === 2 && previousMarkers[0].maximumAttempts !== maximumAttempts) {
    throw new Error("The original finite capture budget cannot be expanded");
  }
  const reconciledAt = env.CAPTURE_RECONCILED_AT;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(reconciledAt ?? "") ||
      !Number.isFinite(Date.parse(reconciledAt))) throw new Error("Root reconciliation timestamp is required");
  const diagnosis = (env.CAPTURE_DIAGNOSIS ?? "").trim();
  if ((attempt === 2 && !diagnosis) || diagnosis.length > 240 || /[\r\n]/.test(diagnosis)) {
    throw new Error("A second attempt requires a short sanitized correction diagnosis");
  }
  if (event.head_commit.message?.replace(/\r?\n$/, "") !== marker(id, attempt)) {
    throw new Error("The push lacks the exact deliberate capture marker");
  }
  return {
    id, attempt, maximumAttempts, consumedIncludingThisRun: attempt,
    remainingAfterThisRun: maximumAttempts - attempt,
    priorRunIds, currentRunId: env.GITHUB_RUN_ID, distinctRunIds: [...priorRunIds, env.GITHUB_RUN_ID],
    reconciledAt, diagnosis: diagnosis || null,
    accounting: "Root reconciled actual hosted run IDs before the deliberate push; not GitHub run_attempt",
    standingAuthority, qaRecord, candidateSha: env.CANDIDATE_SHA, candidateTree: env.CANDIDATE_TREE,
    harnessSha, preparedPredecessor: predecessor, ref,
  };
}
