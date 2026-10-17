# KAN-31 PR #316 re-review: real 8efa rehearsal reaches the submit boundary

**ACCEPTED at exact head `4970a71932f94c7b4d8616f7cdf67bb3fed106cd`** (tree `a169b24aa68027ec206201522e9a59fbf8459e36`).

- **Review cycle.** Cycle 2 of 2.
- **What it is not.** Not run authority and not persistence proof.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## Delta from `3cd042b7`

- **One commit, one test file, one line.** The synthetic `/policies` fixture now has a non-empty readable section, where
  before it had `sections:[]`.
- **The driver is byte-identical.** `driverSha256` is `e8d038cd…` in both rehearsals. The Doc 237 driver acceptance
  therefore carries over unchanged.
- **The diagnosis was refined.** The disabled Continue came from the agreement/policy readiness chain, which an
  unreadable policy blocked. The config shape was fine.

## Evidence

- **Offline CI `39047652842`** (head `4970a71`, push) ran the real `8efa9a9e` client with pinned Chromium 149 and a
  loopback synthetic API. Staging was not contacted.
  - **32/32 tests pass, 0 skipped.** The real-browser test 16 ran; it was not skipped.
  - `DOC236_REHEARSAL` status is **`PASS_SUBMIT_BOUNDARY_NO_REQUEST_POST`**.
  - Both exact cards were selected, with a decoy whose name matches and whose specification is longer. Quantities were
    `[2,3]`.
  - Contact validation was required and passed. All 5 acknowledgments were checked, and **Submit was enabled**.
  - There were **0 request-intent POSTs**, 0 POSTs in total and 0 off-origin requests, across 41 requests. FIFO peak 8.
    The browser and server closed.
  - The empty-catalog loopback diagnostic still passes as before.
- **PR CI `39047656566`:** build, typecheck and test pass.

## Note (downgraded from Doc 237 item 2; not blocking)

- **Not done:** the pre-Continue readiness assertion and the bounded, named codes for the later clicks.
- **Why it no longer blocks:**
  - The rehearsal proves the real bundle enables Continue, Review and Submit once the agreement, config and policy are
    valid.
  - Run 39044855017 already showed those endpoints returning 200 with the agreement accepted on real staging.
- **Remaining risk: misleading evidence, not wrong behavior.** If staging ever leaves a button disabled, the Playwright
  timeout message fails the `failureCode` pattern and would be recorded as the misleading `NETWORK_CHECK_FAILED`.
  Recommended as a follow-up. If the next hosted run shows `NETWORK_CHECK_FAILED` in the `populate` phase, read it as
  a disabled control first.

## Next

1. Merge, under the normal rules.
2. Root builds baseline **B4**: B3 with `workflowSourceCommit` set to the new `main` SHA, plus an `executableAcceptance`
   entry for this review. I review it under Doc 227.
3. Samuel gives a new single-run approval, with the same opening and closure procedure.
4. Keep PR #315 unmerged until that run is done, or rebaseline after it.

NOT LIVE. No SQL. No production.
