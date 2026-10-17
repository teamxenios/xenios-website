# KAN-31 PR #313: route-boundary crash fix and pre-dispatch comparator, changed lines

**ACCEPTED at source scope.** PR #313 head `9af63640` (base `032ec068`) is accepted.

- **What it fixes.** It closes the Doc 228 crash path without loosening any check.
- **What it adds.** A fail-closed pre-dispatch comparator that implements the Doc 227 rule.
- **What this is not.** Not merge, staging or run authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only diff of the six files. CI run `38996712528`
passed test, typecheck and build, per the PR checks. No execution by the reviewer.

## Driver and route boundary (`hosted-browser.UNAPPLIED.mjs` +31/-15, new `route-boundary.mjs`)

- **`guardedRoute`.**
  - If the run has already failed, it denies quietly.
  - A `data:` URL continues.
  - An off-staging origin is denied with `OFF_ORIGIN_TRAFFIC`, recording the **sanitized origin** (scheme, host and
    port only; never path, query or credentials).
  - Otherwise it runs the original handler. Any throw, including `guard()`'s `PRIOR_FAILURE` or `WINDOW_EXPIRED`, is
    recorded and denied, never rethrown.
  - The `abort` and `onDenied` calls are wrapped as well.
- **`trackedRoute`.** It returns a non-rejecting promise to Playwright, so the unhandled-rejection crash cannot recur.
- **`recordFailure`.** It keeps only the **first** failure as `evidence.firstFailure{code, phase, recordedAt, origin?}`.
  All former `failure??=` sites now route through it: the run deadline, the outer catch, and the handler catch.
- **Accounting.** Denied requests add bounded rows containing only `origin` and outcome `ABORTED_BY_BOUNDARY`, capped
  at `maxRequests`, with truncation flagged.
- **Cleanup.** `finally` now waits for every route task. Context-close and browser-close failures are recorded. When
  there is a failure, status is set to `FAILED` and the evidence is still written.
- **Unchanged.** All accepted R2 checks, limits, post-checks and the mutation allow-list.

## Comparator (`scripts/agentic/kan31-pre-dispatch-comparison.ps1`)

- **Inputs.** Each JSON file is read by exact SHA-256, at most 32 KiB, as strict UTF-8. Duplicate keys are rejected
  recursively.
- **Comparison.** A recursive exact comparison of type, key set and array length is followed by value equality. Only
  the Doc 227 allow-lists may change. Anything else fails with `UNAPPROVED_FIELD_CHANGE` or `KEYSET_CHANGED`.
- **Bindings.**
  - `main` and the manifest's workflow source are both `032ec068`.
  - The provider receipt is for app `8efa9a9e`, status `live`, on the staging service.
  - The deploy ID is equal across the receipt, manifest and proof; app and tree are pinned in both; provider-only
    basis is `true`.
  - `providerProofSha256` must equal the hash of the read proof file.
  - The authority strings must be non-empty.
- **Times are read as literal strings** (correctly avoiding the auto-conversion of `ConvertFrom-Json`):
  - `startsAt` no earlier than the deploy start, and not after now;
  - `endsAt` at most `startsAt` plus 4 hours;
  - `expiresAt` at most `endsAt`, in the future, and at most `observedAt` plus 60 minutes;
  - `observedAt` within 120 s of now, and no earlier than the deploy finished.
- **Output.** `dispatchAuthorized:false`.
- **Syntax.** Every multi-line condition ends its line with `-or`, so it parses correctly; this is the Doc 198 lesson
  applied. It requires PowerShell 7, for `System.Text.Json`.

## Notes and conditions

1. **Re-run immediately before dispatch.** The 120 s freshness is measured at comparison time, so dispatch must follow
   immediately. Re-run the comparator if more than a few seconds pass.
2. **PowerShell tests are local only.** `checks.yml` does not execute the PowerShell test file. Root must keep the
   actual test transcript, with the PowerShell 7 version, as evidence.
3. **The off-origin request is still unidentified.** The local browser was blocked by memory (1,855.74 MiB available
   against a 2,048 MiB floor; the floor must not be lowered). From static review of the Quick Order client, the only
   hard-coded external origins are Calendly (a link default) and the Meta pixel, which is unset on staging and blocked
   on research paths. Neither is fetched on this page. Remaining candidates include browser-library traffic, such as
   the Supabase browser client. The fixed harness will now **name** the origin in `firstFailure` on the next attempt
   instead of crashing.
4. **Still separate.** Samuel's merge approval for PR #313; then any reopening, fresh proof, comparator pass and
   one-run approval.

NOT LIVE.
