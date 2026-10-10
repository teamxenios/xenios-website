# CI pilot proposal revision 2 (coordinator `e01f8ea`): focused check

**SUFFICIENT FOR SEPARATE BOUNDED DECISIONS, WITH NAMED CONDITIONS.** No revision 3 is needed, provided your
procedure and workflow decision texts include the two sentences in section 2 verbatim.

Revision 2 corrects most of doc 77:
- **Corrected:** CI-2 (heap propagation), CI-3 (transfer boundary), CI-5 (route table) and CI-7 (disk floor).
- **Present, with wording gaps:** CI-1 (workflow structure), CI-4 (one attempt) and CI-6 (amendment text and pass
  rule).
- **Carried by name:** CI-8 to CI-16.

Every choice stays marked RECOMMENDED / OWNER DECISION PENDING, and none is recorded as your approval.

One blocking point remains: the procedure amendment never says how it relates to your existing class-2 decision. I
resolve it with a sentence for the decision text rather than another revision cycle.

**The older-baseline receipt target `1631323` is suitable as a static matter.** Everything the three tests can touch is
byte-identical there, so choosing it removes the candidate-source transfer. Choosing it remains your decision.

This check grants nothing: no procedure change, workflow edit, publication, pull request, push, installation or run.
Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `QUICK-ORDER-CI-PILOT-PROPOSAL-REVIEW-20261009` revision 2,
registered at coordinator `ddad665` and acknowledged at `dead540`.

**Target**, recomputed from Git: records `e01f8ea8e481103b1960d150f3af8bef6930e216` (tree `f7fceb8b…`).

| File | Raw SHA-256 |
| --- | --- |
| `CI_PILOT_PROPOSAL_20261009.md` | `685bb587…` |
| `CI_PILOT_PROPOSAL_20261009.json` | `01a90baa…` |
| `CI_PUBLISHED_BASELINE_COMPARISON_AC9BBE3_20261010.md` | `f3065d81…` |

Revision 1 (`91deaaa`) and doc 77 are preserved.

**Method.** Three read-only checkers, each with an adversarial verifier: CI-1 to CI-4; CI-5 to CI-7 plus the
carry-forward; and the older-baseline comparison. I confirmed N-1 myself: `RECOVERY_DECISIONS_20261007.md:108@e01f8ea`
gives class 2 as "One existing supervisor/Job route".

**Disclosures.** The agents reported read-only command-form deviations only (`git rev-list` and `merge-base`, `wc` or
`sed` on local review files, `echo`) and WebFetch of `docs.github.com` pages. No file was written, nothing was
executed, and no other worktree was read.

Output is archived as `hl12/79_ci_pilot_r2_focused_check.json`.

## 1. Item results

| Item | Result |
| --- | --- |
| CI-1 workflow structure | **Present.** The base is `main`'s three-job `checks.yml` (`b070777a`), parented on the then-current `main` tip and kept separate from any transfer. `protection` is excluded, the pilot is dispatch-only and the structure choice is pending. **Gaps (nonblocking):** no sentence says landing changes `main`'s trigger set (condition D-2 below), and option (b) is described only in the JSON |
| CI-2 heap propagation | **Corrected.** `NODE_OPTIONS=--max-old-space-size=1024` in the frozen environment is recommended, with the worker's actual execArgv, `NODE_OPTIONS` and heap statistics required as evidence. The heap is kept distinct from the 2 GiB container cap |
| CI-3 transfer boundary | **Corrected.** With target `1631323` no source transfer is needed. If `2d291d0` were chosen, a read-only open-PR check runs immediately before the push, and an open or unknown state refuses |
| CI-4 one attempt | **Present, with honesty gaps (nonblocking).** Guards, single-queue concurrency, a named dispatcher, runner-start admission, the window choice and a consumption rule covering pre-test refusals are all there. But "exact frozen workflow SHA" is listed as a machine guard, and a file cannot contain its own commit's SHA. For a manual dispatch, the workflow SHA is `main`'s tip at dispatch time, so an equality guard would refuse, and burn the only attempt, if anything lands on `main` in between. Condition W-1 |
| CI-5 route table | **Corrected.** Under target `1631323` with a new manual-only file, the pull request and the merge trigger only `main`'s three named jobs. No source push exists. My comparison of the frozen bytes comes before any landing |
| CI-6 amendment and pass rule | **Pass rule corrected:** exact source and environment, exit 0, exactly one named file, more than zero tests, zero failed, pending, skipped or todo, no unhandled errors, and admission and cleanup known. The fake status and upload paths are named. Nothing carries to newer source. **Blocking gap:** no statement of its relation to class 2 (N-1). Condition D-1 |
| CI-7 disk floor | **Corrected.** Paths, timing, units and the memory measure are named, and capacity is marked NOT OBSERVED. A refusal consumes the attempt, and the floor is left to you |
| CI-8 to CI-16 | **Carried by name.** CI-10 is partial: repository log retention is not recorded and over-limit handling is missing. Revision 2 also dropped three of revision 1's run-control rules (exit and OOM recording, no silent truncation, stop after a failure; N-2). Condition W-2 |
| Older-baseline comparison | **Accepted as static suitability.** `1631323` (tree `796f15c9`) and `2d291d0` differ only in `.xenios`, `docs` and `supabase`. Everything the three tests can touch is byte-identical: the test files, their import closure, `vitest.config.ts`, `tsconfig.json`, `package.json`, the lockfile and the `.github` tree. The six non-records differences (the supervisor and five currentness SQL files) are unreachable from the tests. Static equality does not prove the runtime environment, as the comparison says. Condition W-3 |

## 2. Binding conditions on your decision texts

Include these sentences verbatim. With them, the decision text is accurate and no revision 3 is needed.

**D-1, class 2 (resolves the blocking N-1).** My recommendation is that the route supplements rather than modifies
class 2. The choice is yours, and the decision text should say:

> "This Linux-subset route supplements class 2. Class 2's single supervisor/Job route, and every G-group's G0 and
> PREPARE requirements, stay unchanged. This is a separate, bounded, synthetic-application evidence route for the three
> named test files only. It waives no G0 prerequisite for any Windows group."

**D-2, the trigger change.**

> "Landing the pilot workflow on `main` adds a manual dispatch trigger to `main` that stays until it is removed."

The removal commit or not-after date is chosen under CI-4.

## 3. Conditions on the workflow author (nonblocking)

- **W-1. The workflow-SHA check is procedural.** The workflow-SHA and known-parent checks are not machine guards inside
  the file. Before dispatch, the dispatcher or I verify that the workflow file's blob at the dispatched commit equals the
  frozen blob. Either `main` stays unchanged between landing and dispatch, or a blob-equality check replaces any SHA
  equality. Repository-side and procedural enforcement are named as such.
- **W-2. Restore revision 1's run-control rules.**
  - Record enforced limits, admission, and exit and OOM state.
  - Treat over-limit output as a failed attempt, with no silent truncation.
  - Stop after the first failure, so tests 2 and 3 do not run after test 1 fails.
  - Record the repository's artifact and job-log retention.
- **W-3. Check `1631323` is fetchable.** Immediately before dispatch, make a read-only check that `1631323` can still be
  fetched from GitHub, so a missing commit does not consume the attempt. If `2d291d0` is chosen instead, push an exact
  refspec, not the branch name: the local branch has moved past it (`0ec1827e`).
- **W-4. Remove leftover wording:**
  - "candidate branch may include protection" (JSON:2042);
  - the stale `noOptionInserted` flag;
  - "no inherited NODE_OPTIONS", which conflicts with the recommended option;
  - the dropped ban on dynamic command or ref inputs;
  - the B-bound source inventory cited without a label.

## 4. Disposition and what follows

- **Sufficient for your separate bounded decisions,** with D-1 and D-2 in the decision texts and W-1 to W-4 carried to
  the workflow author.
- **Decision order:**
  1. You choose the receipt target (`1631323` recommended) and the procedure, including D-1.
  2. You choose the workflow structure and route, including D-2.
  3. The workflow author freezes the bytes.
  4. I compare the frozen bytes.
  5. You give landing authority.
  6. You give execution approval naming the dispatcher and window.
  7. One dispatch.
- **What it does not do.** Nothing here authorises a workflow edit, publication, pull request, push or run. The CI
  pilot neither authorises nor gates the transaction.
