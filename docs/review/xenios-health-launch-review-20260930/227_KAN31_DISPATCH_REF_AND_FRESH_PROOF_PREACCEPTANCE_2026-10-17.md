# KAN-31 dispatch-ref correction and bounded pre-acceptance of the fresh-proof manifest

## 1. The first attempt (no run occurred)

- **What failed.** GitHub rejected the dispatch with HTTP 422 "No ref found", because `ref` was a commit SHA and
  `workflow_dispatch` requires a branch or tag. No workflow run was created, nothing was retried, and nothing ran in
  the browser.
- **The window was closed.** Staging was closed by `OPEN_ACCESS=false` plus a same-SHA deploy
  `dep-db9d6pu1egvs73eqokig` on `8efa9a9e`, with `openAccess:false` reported (Root receipt, KAN-31 comment 10093).
- **The correction is transport only.** Dispatch with `ref=main`, verified immediately before dispatch to resolve to
  `032ec068e3102c9f04bb194dc6c261e02b5e6f73`, keeping `source_commit=032ec068…`. No source change is needed.

## 2. Timing evidence

- **The earlier run.** Compatibility run `38903643279` used the same checkout, setup-node and artifact retrieval
  pattern. It took about 4 s from queue to job start and about 30 s from job start to its checks: checkout 11 s and
  11 s, setup-node 5 s, artifact 3 s.
- **Expected admission time.** The hosted driver's 5-minute provider-proof freshness check at admission is therefore
  expected to be reached about 1 minute after dispatch.
- **The real risk.** That risk is the human relay latency between the proof's `observedAt` and dispatch, not runner
  setup.

## 3. Bounded pre-acceptance

**I pre-accept**, for exactly one dispatch, any run manifest and provider proof meeting ALL of the following. I do not
need to re-check them by hand.

- **Manifest.** Byte-for-byte the same JSON structure as accepted manifest
  `d85a577402bad4abc829c4229928c2f5af855675f16323785496b3a20eb5dbf1`, with the same key set. Only these field values
  may differ:
  - `deployId`, which must equal the new live opening deploy on `srv-d9h4f4m7r5hc73ctjng0` for commit `8efa9a9e…`,
    as read from Render;
  - `publicModeWindow.startsAt`, which must be no earlier than that deploy's start, and `publicModeWindow.endsAt`,
    which must be at most `startsAt` plus 4 hours;
  - `expiresAt`, which must be at most `endsAt` and at most 60 minutes after the proof's `observedAt`;
  - `providerProofSha256`, which must equal the SHA-256 of the exact provider-proof bytes;
  - `executionAuthorization`, a non-secret text reference to Samuel's approval.
- **Provider proof.** The same key set as accepted proof
  `271fda861bf01097a0a959b25676fa8f4a956f7c0905c9a2a1052043e300a49e`. Only these may differ:
  - `deployId`, which must equal the manifest's;
  - `observedAt`, which must be no more than 120 s before dispatch;
  - `authorizationReference` and `publicStagingWindowReference`, as non-secret text references.

  `status` must be `live`, `providerOnlyBasisAccepted` must be `true`, and the app, tree, service and origin must
  be unchanged.
- **Dispatch.** `ref=main`, resolving to `032ec068…` at dispatch. `source_commit=032ec068…`, artifact
  `12033375179`, ZIP `73e53b02…`. Exactly one attempt, no retry.
- **Root's record before dispatch.** Root records a mechanical comparison against both accepted files listing every
  changed field, the new SHA-256 values, and the Render read of the deploy. Any other difference means **no
  dispatch**.
- **My check afterwards.** I verify the run's recorded inputs against this rule after the run. A violation
  invalidates the run as evidence.

This pre-acceptance does **not** authorize reopening staging or dispatching. Both require Samuel's approval.

NOT LIVE.
