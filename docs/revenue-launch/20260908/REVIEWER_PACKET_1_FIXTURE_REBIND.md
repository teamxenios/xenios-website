# Reviewer packet 1 — synthetic-credential fixture registry re-bind

**CLOSED.** ASTRA-B recorded the acceptance on A's branch at `c350ab1c…`,
updating B's own registry under `docs/revenue-launch/20260907/` in place
(status `ACCEPTED`, `reviewedSourceSha` `bf7b5fe`, digest `b82169d4…`). Claude
verified the scan binds there: 102 reviewed, 0 unresolved. The release
operator uses **that** pair; the `20260908/` proposal below is history. The
remaining conditions B attached — the strict scan must bind the final
candidate and print that digest; privacy qualification and the full-suite
condition stay separate — are unchanged.

For an independent reviewer who is **not** Claude (the author of the re-bind)
and **not** the author of `bf7b5fe`. Narrow scope: decide whether B's accepted
dispositions still apply to the candidate after one file changed by one
trailing blank line. This is not a general secret or PII audit, and accepting
it does not make the strict scan pass; the approved-name input is a separate
requirement.

## What you are deciding

B accepted, on 2026-09-07, that 102 "generic assigned secret" matches in 20
test/preview/harness files are demonstrably synthetic and local
(`docs/revenue-launch/20260907/SYNTHETIC_CREDENTIAL_REVIEW_ACCEPTANCE.md`,
registry and context review beside it). The registry pins each file's LF
SHA-256 at reviewed source `8e125ca7` and refuses to bind if any pinned file
differs at the candidate.

`bf7b5fe` removed one trailing blank line from
`scripts/revenue-launch/new-account-browser-qualification.mjs`. The proposed
records under `docs/revenue-launch/20260908/` re-pin the same 102 findings to
the bytes at `bf7b5fe` (equal to the candidate `45f95dfe`). Status is
`PENDING_REACCEPTANCE`, which the loader refuses until you change it.

## What to examine

1. `FIXTURE_REBIND_DELTAS.txt` — the exact `git diff` of the one file (a
   single `-` line that is empty), the field-level diff of the two registries
   (only `reviewedSourceSha`, `independentReviewStatus`, `contextReview` and
   one `lfSha256` differ; all 20 match lists unchanged), the field-level
   diff of the two context reviews (`candidateSha`, placeholder `reviewedAt`,
   one appended limitation; 102 findings byte-identical), and the recount
   showing every match occurrence is still present in the candidate's diff.
2. Run the check yourself from a checkout of the repository on the pinned
   Node, naming the evidence commit you are reviewing:
   ```
   node docs/revenue-launch/20260908/verify-rebind-packet.mjs --at <evidence commit>
   ```
   It reads the four record files **from Git at that commit** and the source
   files from their pinned commits — never from the working directory — so
   local edits cannot influence the verdict; it prints the commit it used,
   then one PASS/FAIL per claim. It does not accept anything. Without
   `--at` it uses `HEAD`, so make sure `HEAD` is the commit you mean.
3. Open both context reviews and confirm the dispositions you are carrying
   forward are the ones B wrote; the script proves they are byte-identical,
   you confirm they are the right ones.
4. Confirm the scan still refuses the proposed registry today:
   ```
   XENIOS_RELEASE_REVIEWED_FIXTURES_FILE=docs/revenue-launch/20260908/REVIEWED_SYNTHETIC_CREDENTIALS.json \
   node scripts/acceptance/scan-release-diff.mjs ff3c496245739233b71e46f9e5d6e26af9d57017 45f95dfe51ef0aa226b39413c1fbd02fc121ece8
   ```
   Expected now: `reviewed fixture registry: independent review has not been accepted`.

## If you accept

1. In `docs/revenue-launch/20260908/REVIEWED_SYNTHETIC_CREDENTIALS.json` set
   `independentReviewStatus` to `ACCEPTED`.
2. In `docs/revenue-launch/20260908/synthetic-credential-context-review.json`
   set `reviewedAt` to your acceptance time (ISO 8601), then recompute the
   context file's LF SHA-256 and write it into the registry's
   `contextReview.lfSha256` (the loader checks it).
3. Record your identity, time and a one-line basis under "Acceptance" in
   `SYNTHETIC_CREDENTIAL_REBIND_REQUEST.md`.
4. Commit those three files as one docs-only commit above `45f95dfe`; the
   release owner rebinds the candidate SHA to that commit and re-runs the
   scan, which should then print `reviewed fixture findings: 102` and
   `unresolved secret findings: 0`.

## If you do not accept

Write the exact deficiency in the same file. Nothing else changes; the
strict scan keeps failing, honestly.
