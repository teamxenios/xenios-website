# Quick Order CI pilot proposal (coordinator `91deaaa`): review

**INSUFFICIENT AS SPECIFIED, with the smallest exact correction: a wording-only revision 2. No P0 or P1.**

The proposal is careful where it matters most:
- It pins the candidate `2d291d0` and checks out that exact SHA.
- It runs three existing synthetic test files in network-isolated containers, with no secrets.
- It says plainly that a pass proves neither the transaction, a SQL commit nor a customer save.
- It keeps every Windows hold, and it stays held until you approve.

The three files are a fair choice. Their imports reach no Supabase, `pg`, environment variable or real endpoint, and the
command line is valid for the locked Vitest 4.1.10.

But seven points (CI-1 to CI-7) would leave you approving something other than what would happen. Four of them matter
most:
- It describes `main` as having four release jobs; it has three.
- Its heap limit never reaches the process that runs the tests.
- The source push could start the ordinary jobs if a pull request is open.
- "One attempt" has no mechanism behind it.

Revision 2 corrects those in wording. Nine further items (CI-8 to CI-16) travel as named conditions on the
workflow-author step the proposal already requires.

This review grants nothing: no procedure change, workflow edit, landing, transfer, execution, push or deployment.
Nothing was executed.

Reviewer: this session, `claude-opus-5-5`. Board task `QUICK-ORDER-CI-PILOT-PROPOSAL-REVIEW-20261009` revision 1,
registered at coordinator `9d2dd41` and acknowledged at `8a26e65`. This session's own board check found it; no message
delivered it.

**Target**, recomputed from Git: records `91deaaa8ef9fb1963dce2ac4eb597ea486ad09a7` (tree `d0ad9d03…`).

| File | Raw SHA-256 |
| --- | --- |
| `CI_PILOT_PROPOSAL_20261009.md` | `28ef0850…` |
| `CI_PILOT_PROPOSAL_20261009.json` | `3d434604…` |
| `CI_PILOT_SOURCE_PREREQUISITES_20261009.md` | `9bc60ec1…` |
| `CI_PILOT_SOURCE_PREREQUISITES_20261009.json` | `59d8a942…` |
| `CI_ROUTE_EXISTING_RUN_EVIDENCE_20261009.json` | `85729096…` |

**Candidate:** `2d291d0` (tree `be16220c…`). It changes nothing outside `.xenios/` and `docs/` relative to `25858ad`.

**Method.** Three read-only lenses, each with an adversarial verifier, then a completeness critic:
- the candidate, commands and evidence;
- setup, isolation and resources;
- triggers, attempts and the procedure change.

**My own checks.**
- `main`'s `checks.yml` (blob `b070777a`) has three jobs; the candidate's (blob `7a2c2c58`) adds `protection` at
  lines 44-54.
- The accepted Windows manifest pairs the heap flag with `NODE_OPTIONS` (27 occurrences, e.g. `:9087@2d291d0`).

**Disclosures.**
- **Another worktree.** The agents read the installed Vitest, Vite and Supertest sources in another local worktree's
  `node_modules`, read-only.
- **Command forms.** They used two `2>&1` redirects and some command forms outside the brief.
- **Documentation.** They fetched public `docs.github.com` pages only.
- **Configuration values.** One verifier saw configuration values in `main`'s `.replit` (a Supabase URL, a publishable
  key and an admin email) while reading lines; none is reproduced.
- **Redaction.** The archive redacts one commit-author email.
- **What did not happen.** No file was written, nothing was executed, and no session was contacted. Behaviour of
  Actions, Docker, npm and Vitest is reasoned from documentation and the installed source, NOT RUN.

Output is archived as `hl12/77_ci_pilot_proposal_lens_findings.json`.

## 1. The coordinator's checklist

| Item | State |
| --- | --- |
| 1. Exact SHA checkout, not a merge or workflow ref | **Adequate** |
| 2. The three commands, their assertions and the evidence claims | **Partial:** CI-2 and CI-6 |
| 3. Pinned Node, npm, lockfile, image and actions; setup feasibility | **Adequate,** with conditions CI-11 and CI-13 |
| 4. Isolation, the Supertest listener, credentials and network | **Adequate,** with conditions CI-9 and CI-13 |
| 5. Resource bounds | **Partial:** CI-2 and CI-7 |
| 6. The 30-minute boundary | **Partial:** CI-4 and CI-8 |
| 7. Failure outputs, cleanup, unknown state and artifacts | **Adequate as policy,** with conditions CI-8 and CI-10 |
| 8. One attempt across events, re-runs and concurrency | **Partial:** CI-4 |
| 9. Which events actually execute code | **Partial:** CI-3 and CI-5 |
| 10. `main`'s three jobs against the candidate's four | **Partial:** CI-1 |
| 11. The Linux procedure change and the remaining Windows holds | **Partial:** CI-6 |
| 12. The smallest missing actions, kept separate from the transaction | **Partial:** see section 4 |

## 2. Corrections for revision 2 (P2, verified)

**CI-1. The landing premise is wrong.**
- **The error.** The proposal says to "keep ordinary four-job release gates intact" (`md:27`). `main` has three jobs.
  The `protection` job exists only on the branch, and `main` is 1,553 commits behind the candidate.
- **Other gaps.** The pilot job has no guard against the existing pull-request and push triggers. "Workflow
  successor" has no defined parent.
- **The fix.**
  - The workflow base is `main`'s blob `b070777a`, and the workflow commit's parent is the current `main` tip. It is
    not part of the source transfer.
  - `protection` is excluded; adding it to `main` is a separate release-gate decision.
  - You choose between (a) a new workflow file triggered only by `workflow_dispatch`, which leaves `checks.yml`
    unchanged but amends the proposal's "checks.yml only" path, and (b) event guards added to the three existing jobs,
    acknowledged as a change to the release-gate file.

**CI-2. The heap limit does not reach the tests.**
- **The error.** In Vitest 4.1.10, `--max-old-space-size=1024` on the outer `node` command is not passed to the forked
  worker that runs the tests. The worker's real heap limit is therefore unknown. The accepted Windows manifest avoided
  this by also setting `NODE_OPTIONS`.
- **The fix.** Choose one:
  - the single token `--execArgv=--max-old-space-size=1024`;
  - `NODE_OPTIONS=--max-old-space-size=1024` in the frozen environment;
  - or restate the limit as covering the orchestrator only.

  The receipt records the worker's actual settings.

**CI-3. The source push can start unapproved runs.**
- **The risk.** If a pull request is open with this branch as its head, pushing `2d291d0` fires the existing four-job
  workflow. That means `npm ci` with lifecycle scripts, the full suite, typecheck, build and protection, on a networked
  runner. The current pull-request state is not proven.
- **The fix.** Immediately before the push, make a read-only check for open pull requests on that branch. Stop if one
  exists or the state is unknown, unless the authority names those runs. Never open a pull request as part of the
  transfer.

**CI-4. "One attempt within four hours" has no mechanism.**
- **Why it isn't enforced.**
  - GitHub allows re-runs for 30 days, and this repository has already re-run once (run `33819528387`, attempt 2).
  - Concurrency only queues runs.
  - Once landed, the trigger stays live on `main`.
- **The fix.**
  - Add guards that can be frozen in advance: the event is `workflow_dispatch`, `run_attempt == 1`, and the ref and
    workflow ref are `refs/heads/main`.
  - Use single-queue concurrency without cancellation, and record a named dispatching identity.
  - Admission is the job's start on the runner, checked against the window.
  - You choose between a not-after time frozen into the bytes and a named, owned commit that removes the trigger after
    the attempt.
  - You define what consumes the attempt, including refusals before any test runs.

**CI-5. The automatic runs of each landing route are not listed.** You cannot authorise runs nobody has named.
- **The fix.** Add a route table. For each route (a pull request then merge, a direct push to `main`, or skip-ci with
  its limits), list the jobs, ref, token permissions and authority needed.
- **Order.** My comparison of the frozen workflow bytes comes before any landing.

**CI-6. The procedure-change text is missing.**
- **The gaps.** The proposal says the amendment "must say precisely which application evidence it accepts" but gives
  no text. It also gives no full pass rule.
- **The fix.** Add the text:
  - **The evidence:** per-file Vitest JSON at `2d291d0`.
  - **A file passes only if:** exit 0, exactly one named file, more than zero tests, zero failed, pending or todo
    tests, no unhandled errors, and admission and cleanup state known.
  - **What it does not do:** it does not clear G0, G1, G3 or any group, and `production.test.ts` is outside the
    manifest.
  - **Carry-over:** nothing carries to a successor, and the Windows holds stay.
  - **Disclosure:** it names the fake status-change and upload paths that the readback test drives.

**CI-7. The disk floor cannot be met as written.**
- **The error.** A 20 GiB free-disk floor, carried over from an illustrative figure, names no filesystem. GitHub
  documents 14 GB of SSD for this runner, so the approved attempt could refuse by design.
- **The fix.** Name the measured paths and the RAM measure, and reconcile the floor or have you re-select it.

## 3. Conditions on the workflow-author step (P3)

- **CI-8. Timeouts.**
  - Enforce timeouts on named containers (`docker stop`, then `kill`), not only on the Docker client.
  - Set job `timeout-minutes: 30`.
  - Give the unbounded 335 seconds a ceiling, or accept them.
- **CI-9. Mounts.**
  - The output and `node_modules` mounts must be writable over the read-only source. Vite writes to
    `node_modules/.vite-temp`.
  - Set the user, HOME and npm cache paths.
- **CI-10. Output ceilings.** Enforce the artifact and stream ceilings, keep only whitelisted lines in the job log, and
  record retention settings.
- **CI-11. Lock integrity.** 411 of 672 lock entries carry no integrity hash. Disclose that, record the installed
  integrity, and describe setup egress as bounded by construction only.
- **CI-12. Process limit.** The limit of 64 counts threads. Record the peak, and classify a hit as a resource refusal.
- **CI-13. Image and checkout.**
  - Every `docker run` uses the digest with `--pull=never`.
  - Assert HEAD and the tree after checkout.
  - Freeze `CI=true` or `--allowOnly=false`.
- **CI-14. Transfer payload.**
  - Attach the transfer inventory: 31 commits and 83 files, including lines with local Windows paths.
  - Disclose the option of running against the already-published `1631323` instead, where the three files are
    byte-identical. That option removes the transfer step but changes the receipt identity, so it needs my acceptance.
- **CI-15. Other consumers.** Name non-Actions consumers of a push, and the token permissions accepted for automatic
  ordinary runs.
- **CI-16. Stale status.** Revision 2 records the r3 errata as ACCEPTED (doc 76) and your decisions 2, 3 and 5 as
  received, without re-asking them.

## 4. What is missing before any run, in order

1. **Coordinator:** issue revision 2 with CI-1 to CI-7 and the CI-8 to CI-16 conditions. Mark your open choices
   without choosing them: the workflow structure, the heap option, the disk floor, the window mechanism and the
   consumption rule.
2. **Me:** a check of revision 2 against CI-1 to CI-7 only, not a repeat review.
3. **You:** the procedure decision, covering the Linux-subset amendment text and the resource, attempt and window
   values.
4. **You:** the workflow structure, its ownership and the landing route.
5. **The workflow author:** freeze the complete bytes and hash, parented on the `main` tip.
6. **Me:** compare the frozen workflow before any landing.
7. **You:** landing authority. The owner then lands exactly the frozen bytes.
8. **You:** transfer authority for `1631323..2d291d0`, with the CI-3 check. Alternatively, choose the `1631323` option
   in CI-14 and skip the transfer.
9. **You:** execution approval, naming the dispatcher, the absolute UTC window and the single reservation.
10. **One dispatch.** The receipt comes to me.

**The transaction track is separate and is gated by none of this.** The three pilot files exercise only injected
fakes, and the proposal says its receipt never carries to the implemented transaction. The transaction track continues
on its own path:
1. the steward's nonproduction connection finding;
2. my technical acceptance of the profile together with that finding;
3. path owners confirmed and the exact 17+4 lease;
4. the builder's dispatch.
