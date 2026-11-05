import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCaptureAllowance } from "./capture-dispatch.mjs";

const predecessor = "a".repeat(40);
const harnessSha = "b".repeat(40);
const scope = "KAN-31/11250";

function dispatch(attempt = 1, maximumAttempts = 1) {
  const repository = "teamxenios/xenios-website";
  const ref = "refs/heads/codex/qo-synthetic-qa-20261105";
  return {
    env: {
      CANDIDATE_SHA: "c".repeat(40), CANDIDATE_TREE: "d".repeat(40),
      CAPTURE_PREPARED_PREDECESSOR: predecessor, CAPTURE_EXECUTION_SCOPE_ID: scope,
      CAPTURE_ALLOWANCE_ATTEMPT: String(attempt), CAPTURE_ALLOWANCE_MAX_ATTEMPTS: String(maximumAttempts),
      CAPTURE_PRIOR_RUN_IDS: attempt === 2 ? '["95001"]' : "[]", CAPTURE_RECONCILED_AT: "2026-11-05T12:10:00Z",
      CAPTURE_DIAGNOSIS: attempt === 2 ? "Correct the wrong variant selector." : "",
      GITHUB_EVENT_NAME: "push", GITHUB_REPOSITORY: repository, GITHUB_REF: ref,
      GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "95002", GITHUB_SHA: harnessSha,
    },
    event: {
      repository: { full_name: repository }, ref, before: predecessor, after: harnessSha,
      created: false, deleted: false, forced: false,
      head_commit: { id: harnessSha, message: "QO capture " + scope + " attempt " + attempt },
    },
    harnessSha, parents: [predecessor], predecessorSubject: "Prepare dormant synthetic QA",
    history: attempt === 2 ? [{ subject: "QO capture " + scope + " attempt 1", maximumAttempts: 2 }] : [],
  };
}

test("binds an initial attempt and preserves the downstream allowance fields", () => {
  const result = buildCaptureAllowance(dispatch());
  assert.equal(result.id, scope);
  assert.equal(result.attempt, 1);
  assert.equal(result.maximumAttempts, 1);
  assert.equal(result.remainingAfterThisRun, 0);
  assert.deepEqual(result.distinctRunIds, ["95002"]);
  assert.equal(result.standingAuthority, "KAN-225/11225");
  assert.equal(result.qaRecord, "KAN-31/11226");
  assert.equal(result.preparedPredecessor, predecessor);
  assert.equal(result.harnessSha, harnessSha);
});

test("permits one diagnosed correction after the first distinct marked dispatch", () => {
  const result = buildCaptureAllowance(dispatch(2, 2));
  assert.equal(result.consumedIncludingThisRun, 2);
  assert.equal(result.remainingAfterThisRun, 0);
  assert.deepEqual(result.distinctRunIds, ["95001", "95002"]);
});

test("refuses historical and unbound execution references", () => {
  for (const id of ["UNBOUND_ROOT_EXECUTION_SCOPE", "KAN-31/10969", "KAN-31/11224", "KAN-31/11226", "KAN-225/11250"]) {
    const input = dispatch();
    input.env.CAPTURE_EXECUTION_SCOPE_ID = id;
    assert.throws(() => buildCaptureAllowance(input), /new Root execution scope/, id);
  }
});

test("binds the exact repository, branch, checkout parent and normal push event", () => {
  const input = dispatch();
  const invalid = [
    { parents: [predecessor, harnessSha] },
    { predecessorSubject: "QO capture " + scope + " attempt 1" },
    { event: { ...input.event, ref: "refs/heads/main" } },
    { event: { ...input.event, before: harnessSha } },
    { event: { ...input.event, repository: { full_name: "other/site" } } },
    ...["created", "deleted", "forced"].map((flag) => ({ event: { ...input.event, [flag]: true } })),
  ];
  for (const changed of invalid) assert.throws(() => buildCaptureAllowance({ ...input, ...changed }), /normal push/);
});

test("rejects dormant pins, marker variants and GitHub reruns", () => {
  const input = dispatch();
  assert.throws(() => buildCaptureAllowance({ ...input, env: { ...input.env, CANDIDATE_TREE: "UNBOUND" } }), /must be bound/);
  const head_commit = { ...input.event.head_commit, message: input.event.head_commit.message + " " };
  assert.throws(() => buildCaptureAllowance({ ...input, event: { ...input.event, head_commit } }), /exact deliberate/);
  assert.throws(() => buildCaptureAllowance({ ...input, env: { ...input.env, GITHUB_RUN_ATTEMPT: "2" } }), /ordinal/);
});

test("rejects replays on different pushes, missing history and expanded budgets", () => {
  const first = dispatch();
  const second = dispatch(2, 2);
  assert.throws(() => buildCaptureAllowance({ ...first, history: second.history }), /already dispatched/);
  assert.throws(() => buildCaptureAllowance({ ...second, history: [] }), /predecessor attempt is missing/);
  assert.throws(() => buildCaptureAllowance({ ...second, history: [...second.history, { subject: "QO capture " + scope + " attempt 2" }] }), /already dispatched/);
  assert.throws(() => buildCaptureAllowance({ ...second, history: [{ ...second.history[0], maximumAttempts: 1 }] }), /cannot be expanded/);
  assert.throws(() => buildCaptureAllowance(dispatch(2, 1)), /budget exhausted/);
  assert.throws(() => buildCaptureAllowance(dispatch(1, 3)), /ordinal/);
  assert.throws(() => buildCaptureAllowance({ ...second, env: { ...second.env, CAPTURE_PRIOR_RUN_IDS: '["95002"]' } }), /distinct prior/);
  assert.throws(() => buildCaptureAllowance({ ...second, env: { ...second.env, CAPTURE_DIAGNOSIS: "" } }), /diagnosis/);
});
