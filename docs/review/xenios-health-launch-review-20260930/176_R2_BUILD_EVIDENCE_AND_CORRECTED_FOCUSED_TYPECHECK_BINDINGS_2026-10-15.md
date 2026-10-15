# `84178ce` R2 build evidence, and the corrected focused and typecheck bindings

**LOCAL LITERAL BUILD CREDIT SUPPORTED for corrected candidate `84178ce1` on this Windows host.**

- **Build.** The R2 build passed G0 and completed the exact Render command with exit 0. Independent artifact, source,
  pin and owned-closure checks pass.
- **Test slots.** The rebound focused and typecheck slots are SUFFICIENT. They are exact five-scalar and seven-binding
  rebindings of the slots already used for `47f49adf`, with unchanged helpers and controls.

This is not admission or invocation. The new focused and typecheck runs are NOT RUN. There is no browser, full-suite,
SQL, staff, security or deployment credit.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only. No command named any active source or scratch path, consistent with Doc 175's discipline. Nothing run.
The workflow and agents were not used, because this brief requires the same original reviewer with no substitute.
Docs 173 and 174 were not reopened. Reviewed at 2026-10-15T05:22–05:28Z. Archive:
`hl12/176_r2_build_evidence_and_corrected_focused_typecheck_bindings.json`.

## 1. R2 build (archive `2d502f0a`, tree `91973a85`, 66 files: 62 raw and 4 records)

- **Admission.** Ticket `3a86c9ae…`, used once. Runner `2569b88e…` and pins `139e93f2…`, both reviewed in Doc 175.
- **G0.**
  - Native exit 0, from 05:02:10.515Z to 05:02:12.039Z, 1,525.31 ms, with 994 B of stdout and 0 B of stderr.
  - The candidate is `84178ce1` and the tree `24d3fa00`.
  - Readings: OS free 2,070.1 MiB, available 2,068.7 MiB, commit headroom 7,431.2 MiB. All three are above the
    1,536 MiB floor.
  - The outer record says `G0_ACCEPTED_BUILD_ENTERING`.
- **Build.**
  - The child ran from 05:02:17.548Z to 05:04:38.763Z and exited normally with code 0. It did not time out.
  - The supervisor exited 0 at 05:04:45.559Z, inside its cap ending at 05:14:12.130Z. `renderBuildCompleted` is true,
    with no cleanup actions needed.
  - The whole literal `npm run render-build` chain returning 0 shows that `npm ci` completed. The individual
    subcommand exits were not separately instrumented.
  - `npm ci` added 531 packages. Vite 7.3.5 transformed 2,312 modules and built in 12.97 s. The server bundle took
    1,285 ms.
  - Three warnings are retained: the npm `--production` deprecation, a mixed dynamic and static import of
    `AdminResearchHome`, and the chunk-size advisory. None is a failure.
- **Records.** Receipt `0aac8e0c…`, artifact inventory `72f5ae02…`.
- **Independent checks.**
  - **Processes, at 05:05:28.75Z.** None of the eight known identities (seven owned plus supervisor 82180) is present,
    with no scoped processes, no listeners and 0 stops.
  - **Artifacts, at 05:05:57.31Z.** An exact set of 350 `dist` files, 10,688,390 B. 22 selected installed files were
    rehashed, all 28 pins match, the three lock copies match, and the source is clean at `84178ce1`/`24d3fa00`.
- **Limits.** Cleanup is verified at a point in time, and only selected dependencies were rehashed. This is not kernel
  proof, a whole dependency closure, Render/Linux parity or a browser result. The polling discipline held: only
  `write_stdin` waits, with no interleaved owner commands.
- **R1 stays as is.** The failed R1 remains FAILED, and no credit transfers from it.

## 2. Corrected focused and typecheck bindings (Core `d7cd426a`, tree `f815487b`): sufficient

- **Files.** 14 files, all matching the packet:
  - focused runner `a1cd68f8…`, pins `1b0b0235…` (2,472 entries), entry `0a166cc4…`;
  - typecheck runner `05efb4c7…`, pins `40055f58…` (44 entries), entry `fa50c3d3…`.
- **Runners.** Each differs from its `47f49adf` version (`edab84df…` and `404d1e95…`) in exactly five constants:
  `ROOT`, `CANDIDATE`, `TREE`, `SCRATCH` and the action label.
  - `ROOT` is now the successful R2 build source, used in place.
  - The 16-file `SELECTED` list, the fixture hash, `--allowOnly=false`, `--retry 0`, the single worker, the budgets,
    the heaps, the guards and the process-only LF Git config are all unchanged.
- **Helpers.** All four are byte-identical: `owned-processes.ps1`, `process-identity.cjs`,
  `process-identity.test.cjs` and `selection-reporter.cjs`.
- **Entries.** Each differs from its `47f49adf` version (`54b53e4a…` and `df2ddfb7…`) in seven bindings across six
  lines:
  - the run root;
  - the G0 script, now the corrected candidate's `correction-84178ce-build-slot-r1/invoke-first-build-g0.ps1`
    (`947bba10…`, which reports `84178ce1`);
  - stop `2026-10-15T06:15:00.000Z`;
  - the labels `MIXED_84178CE_{FOCUSED,TYPECHECK}_SLOT_R1_20261015`;
  - the closed-result candidate and tree;
  - the window check, 600,000 ms for focused and 360,000 ms for typecheck;
  - the final runner call with the new pins hash.
- **Pins.** The path sets are identical after scratch normalization.
  - **Focused.** The only value changes are the runner and exactly the six corrected files. All 2,435 tracked-source
    pins equal their `84178ce1` blobs.
  - **Typecheck.** The only value change is the runner. All 15 tracked pins equal their blobs.
  - Other top-level fields are unchanged, apart from the candidate, tree and provenance.
  - Bound inputs stay exact. As Doc 173 noted, unbound test caches under ignored `node_modules` are not a new immutable
    dependency closure.
- **Not results.** The six new authored cases and the pinned pure identity test are not results.
- **Materialization.** The 8-file copy map is proposed, not granted or performed. The scratch folders must be absent.
  No source, dependency or `dist` is copied, and no install happens.

## 3. Window, authority and operating rule

- **Window.** Root's new-group window runs from 05:06:32.310Z to 06:15:00Z.
  - The entry checks put the theoretical last starts at 06:05Z for focused and 06:09Z for typecheck.
  - Root's stricter 720 s reserve makes the effective last admission earlier.
  - The R2 build's 05:30Z stop is unchanged and unrelated.
- **Authority.** Docs 223 and 239, the same owner under active lease `abb400e5`, with phase A's return PENDING. Each
  group needs its own copy grant, Core's fresh FINAL READY, a new single-use Root ticket and a fresh G0. The runs are
  strictly serial, each after actual native completion and owned closure.
- **Operating rule.** The Doc 175 discipline now covers the R2 build source used in place, as well as both group
  scratch folders. While a group runs, no session, this reviewer included, runs a command that references them. Root
  uses only app waits.

## 4. Holds

- **No credit.** No test, typecheck, browser, full-suite, SQL, persistence, staff-read, security or deployment credit
  for `84178ce`.
- **Custody.** The phase A return and final manifest are PENDING.
- **Security.** The exposure condition is OPEN and privileged staff reads are HELD.
- **Production.** The live revision (`7bba…`) is neither candidate.
- **Unchanged.** R8 and Docs 160–175 stay closed. Failed run `790af2ce`, the consumed tickets, the failed `47f49adf`
  focused and typecheck results, and the failed `84178ce` R1 all remain as recorded. The payment and security holds
  stay open.

Not execution, admission, push, deployment or production consent; not human approval; not test or qualification
credit beyond the local build stated above.
