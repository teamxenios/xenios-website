# KAN-31 baseline B3 for the FIFO source, and the comparator record for run 39005307722

**ACCEPTED: baseline B3, exact bytes `6e10eff3a9aa77f3a23faf81238dd534df1bbcedbf7164a13fe11ed083e1e0c4`** (4,667 B).

- **Where B3 lives.** KAN-31 comment 10127. A copy of the exact bytes is in
  `hl12/235_KAN31_ACCEPTED_BASELINE_MANIFEST_B3.json`.
- **Doc 231 closed.** The open item from Doc 231 (Root's comparator record for run 39005307722) is verified.
- **What this is not.** Not run authority and not reopening authority.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## B3 against accepted B2 (`dea66dab`)

- **Byte diff.** Exactly two hunks:
  - `workflowSourceCommit` changes from `da2f3386…` to `fa4292e48d747d28ebbf80f6bde44d58a0ecfd09`.
  - `executableAcceptance` gains `fifoCorrection: be2a7671e6622bbeee5189e9008a150effe0f48e` (Doc 232). The trailing
    comma on `routeBoundaryCorrection` is the only other byte change.
- Key order and every other value are identical.
- **The new source is current `main`.** `fa4292e4` is still `main` (PR #314 merged at 05:55:29Z; main CI `39008020376`
  passed per Root). Its diff from `da2f3386` is exactly the six accepted PR #314 paths.
- **The hosted workflow is unchanged.** `.github/workflows/kan31-hosted-browser.yml` is blob `2890e39c` at both
  commits. It checks out `inputs.source_commit` and runs the driver from it, so the FIFO driver is what will run.
- **B3's live fields are placeholders.** `deployId`, the window, `expiresAt`, `providerProofSha256` and
  `executionAuthorization` are historical values that the comparator lets real fresh values replace. They are not
  fresh evidence.

## Doc 227 rule, now with B3

The rule applies unchanged, with these values:

- **Baselines:** manifest baseline **B3 (`6e10eff3…`)**; proof baseline `271fda86`.
- **Source:** `ref=main` and `source_commit` both equal `fa4292e48d747d28ebbf80f6bde44d58a0ecfd09` at dispatch. If
  `main` moves first (for example, PR #315 merges), B3 is stale and a new baseline is needed.
- **Inputs:** artifact `12033375179` and ZIP `73e53b02…`.
- **Proof freshness:** the proof `observedAt` must be at most 120 s before dispatch.
- **Dispatch:** run the patched comparator immediately before dispatch and dispatch only on PASS. One attempt.

## Comparator record for run 39005307722 (closes the Doc 231 note)

The record is Root's `KAN31_DOC230_DEP_DB9FRVN_RUN/`, read locally:

- `PRE_DISPATCH_COMPARISON.json` shows `PASS_SAME_KEYSETS_ONLY_ALLOWED_VALUE_CHANGES`, compared at 05:10:47.534Z,
  which is before the 05:10:48Z dispatch.
- **Changed fields were within the allowed set:**
  - Manifest: `deployId`, `providerProofSha256`, `executionAuthorization`, `expiresAt` and the two window bounds.
  - Proof: `deployId`, the two reference strings and `observedAt`.
- **Hashes match.** `RUN_MANIFEST.json` is `d2dc8e0a…` and `PROVIDER_PROOF.json` is `746c3519…`, equal to the run's
  preflight. `BASELINE_B2.json` is `dea66dab…`. `source_commit` and `workflowSourceCommit` were `da2f3386`, and
  `observedMainSha` was `da2f3386`.
- **Proof freshness:** `observedAt` 05:10:15.290Z, 33 s before dispatch (limit 120 s).
- **Window:** it matches the opening deploy (04:49:15.730Z, plus 4 h), and `expiresAt` was 06:00:15Z.

**Run 1's inputs conformed to the Doc 227/230 rule.** Its failure was the harness concurrency defect only (Doc 231).

## Next

**Samuel's one decision:** approve one new exact run and window under B3. The opening, comparator, single dispatch and
same-SHA closure work as before. Persistence remains unverified until that run passes.

NOT LIVE. No SQL. No production.
