# KAN-31 PR #314: bounded FIFO network forwarding (the Doc 231 correction)

**ACCEPTED at exact head `a10f9ca6e4773a13b58b2ec3b19530b277cd868d`** (tree `0f11fd71ff6357888e4ca5a6655d6513e3f4122b`,
base `main` `da2f3386cbd031c37f4b804c7553306c9edfe49f`).

- **What it changes.** Six paths, all harness, CI or diagnostic. No application, hosted-workflow permission or
  tool-pin changes.
- **What it is not.** Not run authority, not persistence proof, not a production approval.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## Doc 231 requirements against the diff

1. **FIFO semaphore of 8 or less around forwarding.**
   - `createForwardingQueue` is a strict FIFO, `pending.shift()`.
   - Capacity is validated to 1–8, and the driver's `BOUNDED_LIMITS` check still caps `maxInflight` at 8 or less.
   - `onAllowed` acquires a slot before any policy work or `route.fetch`, and `active` is counted only after
     admission. **Met.**
2. **Separate limits kept.**
   - `REQUEST_LIMIT` is now `count<=maxRequests` only, checked before queueing.
   - `POST_LIMIT`, the unlock and agreement caps, and `UNAPPROVED_MUTATION` are unchanged and run after admission.
   - The queue length is capped at `maxRequests` (`INFLIGHT_QUEUE_LIMIT`). **Met.**
3. **Bounded wait.**
   - The wait limit is `min(now+requestTimeoutMs, run deadline, manifest expiresAt, per-request deadline)`.
     Expiry produces `INFLIGHT_WAIT_TIMEOUT`, and one timeout cancels the whole queue (fail-closed).
   - The fetch timeout is the per-request time remaining, so queue wait counts against the existing 10-second budget.
     No silent retry. **Met.**
4. **Permits always released.**
   - `finally { if(admitted) active--; release?.(); }`, and release is idempotent.
   - On cancellation, all waiters are rejected before they forward. **Met.**
5. **First failure kept.**
   - `recordFailure` still records only the first failure, then cancels the queue with that code.
   - Waiters rejected with the same code cannot overwrite it.
   - `guard()` is re-checked after admission, inside `try`. **Met.**
6. **Cleanup and evidence.**
   - The final `finally` cancels the queue and records `forwarding{capacity,active,pending,peakActive,peakPending,closed}`
     and `cleanup.pendingRequests`.
   - The exit code still fails on any active request, open task or failure. **Met.**

## Evidence (first-hand reads)

- **Required CI on `a10f9ca6`:** build, typecheck and test pass (run `39007808737`).
- **Offline rehearsal:** workflow `.github/workflows/kan31-offline-origin.yml`, run `39007805913` (push, same head):
  - **26/26 node tests pass.** The six new queue unit tests cover: 24 delayed parallel requests in FIFO order with peak
    exactly 8; wait timeout cancelling the remaining waiters; cancellation keeping the first reason; the queue bound
    and the capacity of 9 refused; an expired deadline; and release on exception.
  - **Full-driver scenarios cover:** asset bursts of 24 and 40 (all delivered, start order exact FIFO, peak 8),
    queued-failure (no fetch), queue-timeout, total-limit 401, post-limit 41, off-origin, method-throws and
    request-limit.
  - **The real driver ran against the exactly built `8efa9a9e` client bundle,** with loopback synthetic APIs and
    staging not contacted.
    - The client was built from a checkout verified at `8efa9a9e`, with a clean tree, Node 20.19.0 and npm 10.8.2.
    - The tools were restored from artifact `12033375179` with the unchanged safe extraction and hash checks.
    - The driver was spawned unmodified behind a transport-only adapter. The adapter refuses `continue` and any
      off-origin fetch.
    - **Result:** `REAL_DRIVER_BUNDLE_BOOTSTRAP_FIFO_PROVED_EXPECTED_EMPTY_CATALOG_STOP`. 76 asset responses were
      delivered. `forwarding.peakActive` 8, `peakPending` 3. All 5 session checks completed.
    - It stopped at the expected `ACTUAL_RESEARCH_AND_CLINICAL_REQUIRED`, because the synthetic catalog is empty.
    - Cleanup: 0 active, 0 handlers, 0 pending, contexts closed, browser closed. 14.6 GiB was available against the
      2 GiB floor.

**This directly answers Doc 231 item 3.** The real bundle's parallel chunk loads now complete through public bootstrap
under the 8-slot cap. Run 39005307722 failed at exactly that point.

## Limits and notes (not blocking)

- **Not a qualification.** The rehearsal uses synthetic APIs and an empty catalog. It proves neither form submission
  nor Supabase persistence. Only a hosted staging run can do that.
- **The rehearsal workflow is inert after merge.** It triggers only on pushes to the PR branch, with read-only
  permissions and `run_attempt == 1`. Remove it later or keep it as a record; it does not affect the hosted workflow.
- **No process census.** Independent OS process census remains unproved, as before.

## Next steps

1. **Merge,** under the repository's normal rules.
2. **Root prepares a new manifest template and a populated baseline** whose `workflowSourceCommit` is the new `main`
   SHA. The Doc 227 rule applies: only the live fields may differ. I review that before any dispatch. **B2
   (`dea66dab`) is superseded once `main` moves.**
3. **Samuel gives a new single-run approval and opens a new window,** with the same opening and closing procedure
   and the comparator immediately before dispatch.
4. **After a passing browser run,** the separately gated Doc455 SQL snapshot and staff readback follow.

NOT LIVE. No SQL. No production.
