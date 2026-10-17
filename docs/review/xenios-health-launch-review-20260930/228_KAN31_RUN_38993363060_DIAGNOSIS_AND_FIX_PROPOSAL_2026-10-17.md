# KAN-31 hosted run 38993363060: diagnosis, input conformance and crash-fix proposal

**The run failed inside the test harness, not the Quick Order app.** It produced no qualification evidence and no
staging requests. Its inputs conformed to Doc 227. The window is closed.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only: the GitHub run log, Render metadata, a
Supabase table listing (row counts only), public GETs, and a safely extracted proposal ZIP. Nothing was executed.

## 1. What ran

- **The dispatch.** Run `38993363060` was a `workflow_dispatch` on head `032ec068`, created 2026-10-17T02:02:48Z.
- **What passed.** Every step passed, through `TOOL_INVENTORY_VERIFIED` (455 files) at 02:03:17.96Z. The driver's
  admission checks, which run before the browser launches, also passed.
- **The crash.** At 02:03:19.94Z, about 2 s later, the process died with an uncaught `Error: PRIOR_FAILURE` thrown
  from `guard()` inside a Playwright `RouteHandler`, and exited with code 1. The artifact `12085763359` (984 B) holds
  no browser-evidence file.

## 2. Input conformance with Doc 227

The run's recorded manifest and proof were compared against the accepted `d85a5774` and `271fda86`:

- **Same key sets.** Both files have the same keys as the accepted ones.
- **Manifest differences.** Only `deployId`, `executionAuthorization`, `expiresAt`, `providerProofSha256` and
  `publicModeWindow.startsAt`/`endsAt` differ.
- **Proof differences.** Only `deployId`, `observedAt`, `authorizationReference` and `publicStagingWindowReference`
  differ.
- **Deploy and window.** `deployId` is `dep-db9ddcu1egvs73eretp0`: the Render opening deploy for `8efa9a9e`, started
  02:00:19.09Z and live 02:02:02Z. `startsAt` equals the deploy start, `endsAt` is 4 hours later, and `expiresAt`
  (03:00:19Z) is within both limits.
- **Freshness.** `observedAt` was 02:02:17.41Z, 31 s before dispatch.
- **Dispatch inputs.** `source_commit`, the artifact and the ZIP are exact. The workflow's `MANIFEST_HASH` and
  `PROOF_HASH` checks passed.
- **Conclusion.** **The inputs conformed.** Whatever was wrong with Root's PowerShell comparator, it did not admit a
  non-conforming input.

## 3. Root cause, in accepted R2 source

- **Line 59.** Any request to a non-staging origin sets `failure='OFF_ORIGIN_TRAFFIC'` and aborts the request, but
  does not record which origin.
- **Line 60.** The next request calls `guard()` *outside* the handler's `try`, which throws `PRIOR_FAILURE`.
- **Lines 39–40.** `track()` returns the rejecting promise to Playwright. The rejection goes unhandled, and Node exits
  before `finally` writes the evidence.
- **The earliest failure.** It was therefore most likely an off-origin request during the first page load. Its origin
  is unknown.
- **My miss.** I missed this route-handler gap in Docs 209, 211 and 223.

## 4. Staging effects and closure

- **Requests.** `request_intent_private.requests` and `access_events` still each hold 1 row, the pre-existing Q1
  fixture. No request was created.
- **Sessions.** At most one anonymous unlock session may have been minted.
- **Closure.** Staging was observed still open (`openAccess:true`) at 02:22Z. Later
  `GET /api/research/early-access/session` returned `{"authenticated":false,"openAccess":false}`, so the window is
  closed (Root's closing deploy). Exposure ran from about 02:02Z until that closing deploy, within the 4-hour cap.

## 5. The offline crash-fix proposal (ChatGPT ZIP, SHA-256 `111a9bad…`, 7,601 B)

The ZIP holds five files, extracted with path checks and not executed.

- **Design.** `route-boundary.mjs` wraps each route:
  - if the run has already failed, it aborts quietly;
  - if the origin is off-staging, it records the first failure with a sanitized origin (scheme, host and port only)
    and aborts;
  - otherwise it delegates to the original handler body;
  - any thrown error is recorded as the first failure, never rethrown.

  `trackedRoute` returns a non-rejecting promise to Playwright. `recordFailure` keeps only the first failure and adds
  `firstFailure{code, phase, origin}` to the evidence. Status becomes `FAILED`, so evidence is written.
- **The patcher.** It is a fail-closed exact-fragment patcher for the R2 driver, with a check mode, and makes no
  application changes. Its fragments are unchanged in the expiry-corrected driver on `main` (`82157a9a`), but the
  check mode must confirm that.
- **Assessment.** **The design is sound**, and it is acceptable for Core to integrate. The final integrated diff,
  `node --check` and `node:test` results, and CI need my changed-line review before any further staging attempt. The
  "7/7" covers the helper only.
- **A note on the README.** Its tool-inventory remark does not apply: the helper lives in the repository checkout, not
  in the pinned tool bundle.

## 6. Recommendation before reopening staging

Identify the off-origin request **without** opening staging. Load the `8efa9a9e` build locally behind the same
origin rule and log each non-staging origin it requests. Then either:

- remove that dependency from the Quick Order page, through a reviewed application change; or
- show it is harness-specific.

Reopening staging only to rediscover `OFF_ORIGIN_TRAFFIC` would waste a window.

NOT LIVE.
