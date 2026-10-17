# KAN-225 PR #315 re-review: diff-only hosted Claude review (the Doc 233 correction)

**ACCEPTED at exact head `61163336c1eb5a8ec5309cf42e4ad35928cf2435`** (tree `61b75eb349cdc0aed0c35f9c54397995c982cc15`).
This is cycle 2 of 2.

- **What is accepted.** The source of the disabled pilot.
- **What is not.** Activation, credentials, spending and merge timing remain Samuel's decisions. Keep the PR unmerged
  and the automation off until he decides.

Reviewer: `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5. Read-only.

## Delta from `13f022f0` (one commit, four files)

1. **The Claude job no longer checks out the candidate.** Only the trusted `github.sha` checkout remains. The test
   asserts there is exactly one checkout in the job, with no `path: candidate` or `inputs.head` ref.
2. **Review data is built as follows:**
   - `prepareTaskData` refuses an existing `candidate/` directory (`REVIEW_CANDIDATE_TREE_PRESENT`).
   - It fetches the base and head commit objects only, with `git fetch --no-tags origin <base> <head>`, and runs
     `git diff --no-ext-diff --no-textconv base...head -- <custody paths>`.
   - The data is capped at 200,000 bytes (`TASK_DATA_LIMIT`), and PR head drift is still refused.
   - No author tree is materialized, so a candidate `CLAUDE.md` cannot auto-load as subdirectory memory. It only
     appears as diff text inside the untrusted JSON.
3. **The provider-key exposure (Doc 233 note) is fixed.** The `PROVIDER_KEY` env and its `test -n` check are removed.
   The test asserts exactly two secret references, both inside the provider action inputs.
4. **Tests.** There are three new tests:
   - A mocked-git unit test: fetch then diff, no checkout, ext-diff and textconv off, and injected instruction text
     stays data.
   - A real CLI fixture: with `candidate/docs/CLAUDE.md` present, the controller exits `REVIEW_CANDIDATE_TREE_PRESENT`
     before writing any prompt or data, and the instruction text never appears in its output.
   - The byte-limit and head-drift refusals.

## Evidence

- **30/30 tests pass locally** (Node 24.14.1), on files extracted from the exact head.
- **CI on `61163336` passes:** build, typecheck and test (run `39008956473`).
- **The anonymous `git fetch` works because the repository is public.** If it is ever made private, the fetch fails
  closed (no persisted credentials). That is safe, but the job would then need a read token for fetching.

## Remaining notes (not blocking)

- **Codex still checks out the candidate tree** (implement stage). The output is a proposal only: it is
  custody-validated, never applied, and Root publishes it and then gets real CI and an independent review. Codex loads
  `AGENTS.md` from the repository root down to the working directory, not from sibling subfolders. Acceptable as is.
- **Re-confirm the action pin before activation.** `claude-code-action` v1.0.252 is about a day old; pin to a release
  at least 14 days old, or record the reason.
- **Reconcile instruction files** (root `AGENTS.md`/`CLAUDE.md`) with the integration branch.
- **Advisory status, as before.** A hosted Action verdict is advisory, and the original reviewer remains reviewer of
  record for Quick Order.

NOT LIVE. No SQL. No production.
