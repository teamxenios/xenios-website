# Quick Order CI pilot workflow (`e86ffe3`): original byte comparison

**CORRECTIONS REQUIRED: one P1, eight P2 and fifteen P3. No P0.**

**The safety surface matches what doc 79 accepted and what you adopted:**
- **Trigger and permissions.** The trigger is `workflow_dispatch` only, with no inputs (`:17-18`), and permissions are
  `contents: read` (`:19-20`). No secrets are referenced.
- **Checkout.** It is pinned to `1631323` with `persist-credentials: false` (`:930-940`). HEAD, tree, lock and test
  hashes are re-checked after every test (`:491-497`, `:748`, `:752`).
- **Guards.** The event, repository, ref, `workflow_ref`, run_number 1, run_attempt 1 and actor guards all run before
  any network call (`:336-345`). Nothing retries.
- **Window.** It is frozen in the bytes, at most 4 hours, and the full 1800 s must fit inside it (`:345`, `:377`).
- **D-1 and D-2.** Both are verbatim at `:3` and `:5`.
- **`checks.yml`.** It is unchanged at `b070777a` and gains no protection job.
- **The adopted values.** All are carried faithfully: 30 minutes, 1 CPU, one worker, 2 GiB memory and memory+swap, 64
  PIDs, 128 MiB tmpfs, 1024 MiB old-space, 2560 MiB, 8 GiB, 20 MiB and 7 days.
- **As frozen it refuses everything.** Every BIND value is UNBOUND, so `:341` refuses before any network call, Docker
  command or checkout.

No path pushes, deploys or changes a release gate.

**Why corrections are required.** The single attempt is the whole value of this pilot, and the bytes can consume it
without a qualified result. Most importantly, a run where all three tests pass cannot reach PASS (CW-1). Nothing was
executed or triggered.

Reviewer: this session, `claude-opus-5-5`. Board task `QUICK-ORDER-CI-WORKFLOW-BYTE-COMPARISON-20261011` revision 1,
acknowledged at `c3e7337`.

**Target:**
- **Source:** `e86ffe3991c54497e142adee004a7823fdc72811`.
- **Records:** `f76c2fb38a56d8dba80c657a4ded9990c4e2c905`.
- **File:** `.github/workflows/quick-order-ci-pilot.yml` (blob `2d40bd2af1b3b884c012a2daef203ded64056f29`, 62,419 bytes,
  973 lines; I confirmed both myself). It is the same blob as the board's frozen-bytes copy.

**Controlling records:**
- docs 77 and 79 (both unchanged since `12e306a`);
- the revision 2 proposal at `e01f8ea`;
- your adopted choices.

**Method.** Two read-only lenses (triggers, identity and attempt; containers, resources and evidence), each with an
adversarial verifier, then a critic. I confirmed CW-1, CW-4 and CW-5 in the bytes myself. Output is archived as
`hl12/92_ci_workflow_byte_comparison.json`.

**Disclosures:**
- Behaviour is reasoned from GitHub and Docker documentation and from Linux semantics, NOT RUN.
- The selected thresholds are not measured capacity.
- The following are NOT OBSERVED: the runner UID, `protected_hardlinks`, the Docker version and storage mode, the
  ImageVersion, the API quota, and every timing.
- One verifier read the installed Vitest package under `C:/xenios-wt/general-platform/node_modules`, read-only. That is
  outside the brief, and it is disclosed here.

## 1. The P1

**CW-1. A passing run cannot reach PASS.** On the success path, `collect()` hard-links every OUT file into the export
(`:815-819`). Those files were written inside the containers as UID 1000 (`--user 1000:1000`, `:579`): the Vitest JSON,
`child.exit` (`:591`) and the observer files, all mode 0644. The bytes themselves assume the runner UID is not 1000 (the
`sudo chown 1000:1000` at `:713`).

Under Ubuntu's default `fs.protected_hardlinks=1`, a non-owner can only hard-link a file it can both read and write. The
first link therefore fails with EPERM. The run records `CONTROLLER_UNKNOWN_PermissionError` and finalizes
`FAILED_OR_INCOMPLETE`. It fails closed, but the one attempt is consumed by a run whose tests all passed.

**Fix:** make the export independent of cross-UID hard links. Use one of:
- a recorded `sudo -n chown` of exactly the inventoried files;
- a writable umask in the wrapper;
- a direct upload of OUT plus a separate receipt.

If files are copied, recheck the 32 MiB evidence role.

## 2. P2 corrections

**Records, before landing:**

| ID | Defect | Fix |
| --- | --- | --- |
| **CW-2** | The only recorded main payload (`3bb4afda`) carries the UNBOUND blob. It can never be the dispatched bytes, yet the records present it as the prospective main payload and leave open whether landing happens once or twice. The bytes also need execution-stage facts (dispatcher, window, reservation, receipt) inside the landed blob. That reverses doc 77/79's land-then-approve order and ties the landing date to the window | Record that `3bb4afda`/`2d40bd2a` never lands. The sequence is: compare `2d40bd2a`; bind typed values; compare the successor; land it once on the then-current main; run the W-1 check; dispatch once inside the window. Choose `not_before` only after landing and W-1 can finish. A missed window needs a new successor |
| **CW-3** | The payload labels a `[skip ci]` route as doc 79-reviewed. Doc 79 reviewed no skip-ci route (CI-5 accepted PR-then-merge), and revision 2 said skip-ci is not selected. `checks.yml` runs on pull requests and on pushes to main. Which runs fire depends on the merge method and the final commit message. Non-Actions consumers, such as the Render app integration, aren't suppressed by skip-ci | Remove the attribution and mark skip-ci unreviewed. Select one route, recording the merge method and final message. List its exact automatic runs and non-Actions consumers. Any uncovered effect goes to the single "ask once" decision |

**In the bytes; each can burn the attempt without a test result:**

| ID | Defect | Fix |
| --- | --- | --- |
| **CW-4** | An unauthenticated jobs-API GET gates admission, with a 3 s timeout, no retry and no handler (`:356-366`). It runs after run_number 1 is taken. Unauthenticated requests are limited to 60 per hour per IP | Make it a non-gating observation, with a recorded fallback. Or authenticate only this read (which needs its own token decision). Or have you accept this refusal explicitly |
| **CW-5** | `:346` requires `ImageVersion` to equal a literal landed before dispatch, but the value exists only after a machine is assigned. That forces either a guessed binding or a refusal | Remove the equality gate and keep `ImageVersion` as an observation (`:400`), gating on OS and architecture. Or you accept the mismatch explicitly. Never bind a guessed literal |
| **CW-6** | The watcher's `du` refuses whenever an entry vanishes mid-scan. The bytes cause such races themselves: `docker rm`, pulls, npm cache temp files, the controller's own temp files and Vite temp files | Retry vanished-entry errors within the existing bound, or exclude known temp directories while device free space still covers them |
| **CW-7** | The image disk role measures only `DockerRootDir`, so it is blind under the containerd image store, which is the default on fresh Docker Engine 29+. The 2 GiB image cap is then unenforced, and the receipt under-reports | Bind and record the storage mode from `docker info`. Require the legacy driver, or include the snapshotter root |
| **CW-8** | Two full `node_modules` manifests call `healthy()` for every entry, inside the shared 60 s preflight bucket. With 672 lock packages, an overrun can refuse after all tests have passed | Throttle `healthy()` during the manifests and record their durations, or state the cost in the decision |
| **CW-9** | Any failure makes the export metadata-only. That drops the per-test Vitest JSON (which holds the failure messages) and the drained streams, even within limits. Your authority says failure must produce evidence for a specific correction or rerun decision | For ordinary failures within limits, export the bounded OUT files. Derive stream completeness from EOF, not from success. Handle hidden files explicitly |

## 3. P3 author and record conditions (carry into the successor)

- **CW-10. Step timeouts.** They add unselected ceilings: the 1260 s execution step is shorter than the 1285 s of
  allocations inside it. Make them backstops, or name them.
- **CW-11. The `memory.events` `max` counter.** A count above zero refuses even without an OOM. Refuse only on actual
  OOMs, or name the stricter rule.
- **CW-12. Isolation checks.** After create, the network mode, cap-drop, no-new-privileges, mounts, tmpfs and log driver
  aren't checked, and `/ci-cache` is writable in the test containers.
- **CW-13. The heap check.** It would pass even if the 1024 MiB setting never took effect. Use a lower bound of at least
  1024 MiB.
- **CW-14. Docker CLI bounds.** The 0.5 s per-call bounds are tight, and the anchored name filter relies on
  undocumented behaviour. Select by label instead, with one grace budget.
- **CW-15. `child.exit` timing.** It is written non-atomically. Use tmp-then-rename.
- **CW-16. The untyped BIND contract.** The candidate `actor_id` is recorded as a JSON number, but it must be a decimal
  string. The receipt fields are checked only as not UNBOUND, so they are procedural. `ACTIONS['declared_runtime']` is
  an unguarded placeholder.
- **CW-17. The debug env entries.** `ACTIONS_*_DEBUG='false'` controls nothing. Add a pre-dispatch check that no such
  secret or variable exists.
- **CW-18. Provider refusal inventory.** Inventory the provider-controlled refusals: anonymous Docker Hub pull limits,
  digest availability, pre-existing Docker data against the cap, and npm availability. Add a pre-dispatch check that the
  digest is retrievable.
- **CW-19. The dispatcher.** The candidate is the owner's team account, inferred from a local `gh api user`. The record
  must cite your explicit designation. The guard proves an account, not a person, and no agent session dispatches.
- **CW-20. Reruns.** Any authorized rerun needs a compared change to the hard-coded run_number guard. Record that.
- **CW-21. YAML parse.** The file hasn't been parsed. Run a static-only parse of the exact blob before any branch
  containing it is pushed.
- **CW-22. Receipt acceptance.** It must confirm that the blob at the recorded `PILOT_WORKFLOW_SHA` equals the compared
  blob.
- **CW-23. Public artifact on refusal.** Every refused event uploads a 7-day metadata artifact in the public repository.
  It contains no secrets. Name it as an accepted D-2 side effect.
- **CW-24. The checkout condition.** It drops the implicit `success()`. Match `:943`.

**Rejected or re-rated:**
- W1-3, W1-4 and W2-10 are re-rated to P2 (CW-5, CW-4 and CW-9).
- Two lens MET checks are corrected to PARTIAL.
- Wording corrections are applied in CW-14.

## 4. Remaining landing and dispatch prerequisites (listed, not granted; eligibility stays HELD)

1. **A successor.** It corrects CW-1 to CW-9, or records your explicit acceptance where the fix offers it (CW-4(c),
   CW-5). It carries CW-10 to CW-24. It then needs a fresh complete-blob comparison that type-checks every literal.
2. **Typed bindings:**
   - the dispatcher login, and `actor_id` as a decimal string, citing your designation;
   - an absolute UTC window chosen by the coordinator, at most 4 hours, starting after landing and W-1;
   - the execution receipt and the reservation;
   - an unused-identity history receipt;
   - the landing-consumers receipt;
   - the retention values as ints;
   - the action runtimes taken from the manifests;
   - the log-control receipt.
3. **The landing route.** The bound successor lands once. Record the merge method and the final message, and list the
   exact automatic runs (`checks.yml`: npm ci with lifecycle scripts, full Vitest, typecheck and build) and the
   non-Actions consumers. The Render inventory is UNKNOWN, which blocks. Main is unprotected.
4. **Before any push of the blob:** a static YAML parse.
5. **Immediately before the one dispatch:**
   - W-1 (complete blob and current-main parent);
   - W-3 (`1631323` is fetchable);
   - the digest is retrievable;
   - no debug secrets or variables exist;
   - retention is re-observed;
   - the provider-refusal inventory is accepted.

   Then exactly one dispatch, by the designated human. No agent dispatches, there is no resend and there is no rerun.
6. **Receipt acceptance:** the blob at the recorded workflow SHA, the job conclusion, the artifact ID and digest, and the
   terminal summary.

Landing is a production mutation and still needs your current explicit approval. Nothing here authorizes landing, a
push, a dispatch or a run.
