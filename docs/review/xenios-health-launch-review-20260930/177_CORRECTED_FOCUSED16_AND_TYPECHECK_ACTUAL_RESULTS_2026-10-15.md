# Corrected `84178ce` focused16 and generic typecheck: actual results

**LOCAL FOCUSED16 PASS and LOCAL GENERIC TYPECHECK PASS for corrected candidate `84178ce1` on this Windows host.**

- **Focused.** Actually executed: 220 of 220 assertions passed across exactly the 16 selected files, with 0 failed, 0
  skipped, 0 todo and 0 pending.
- **Typecheck.** `tsc --incremental false` exited 0 with zero TypeScript diagnostics.
- **Independent checks.** Owned-process closure and source/pin checks pass for both runs.

The limits in section 4 apply. There is no browser, full-suite, release-control, SQL, persistence, real-Auth, staff,
security or deployment credit.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed Git
objects only, and no command named any source or scratch path. Nothing run, no agents. Docs 173, 174 and 176 were not
reopened. Reviewed at 2026-10-15T05:50–05:54Z. Archive: `hl12/177_corrected_focused16_and_typecheck_actual_results.json`.

## 1. Focused16 (archive `1155dfd2`, tree `01cf32ca`, 17 files: 13 raw and 4 records)

- **Admission.** Ticket `dca1e389…`, used once under Root 271.
- **G0.** Native exit 0, 1,468.7 ms, 998 B of stdout and 0 B of stderr. The readings were OS free 1,716.5 MiB,
  available 1,712.4 MiB and commit headroom 6,871.1 MiB, all above 1,536 MiB. That is not browser admission, which
  needs 2,048 MiB. The outer record says `G0_ACCEPTED_QUALIFICATION_ENTERING`.
- **Run.**
  - The child ran from 05:29:28.249Z to 05:30:29.250Z and exited normally with code 0.
  - The supervisor exited 0 at 05:30:35.930Z, with no cleanup actions.
  - Source and pins stayed invariant, at candidate `84178ce1` and tree `24d3fa00`.
- **Report.** `vitest-results.json` is 90,598 B, `ee4b71a7…`. The receipt is 682,526 B, `73b95ea2…`.
  - The report shows `success: true`, 40 of 40 suites passed and 220 of 220 tests passed, with `numFailedTests`,
    `numPendingTests` and `numTodoTests` all 0.
  - All 16 files show status passed. Assertion counts per file range from 1 to 87.
  - The actual selection equals the expected 16 files, and equals the accepted `SELECTED` list, with
    `exactMatch: true` and `ciEquivalent: false`.
  - The corrected Care head assertion and the round-trip context test pass, as do the six new canonical-namespace cases.
    Those cases use child-form boundary stubs.
- **Independent checks.**
  - **Closure, at 05:31:32.54Z.** None of the eight known identities (seven owned plus supervisor 81232) is present,
    with no scoped processes, no listeners and no stops. The fixture ports 54321 and 5237 are clear.
  - **Pins, at 05:32:19.69Z.** The 2,472 focused pins, the 28 build pins, the 22 installed files and the lock all
    match, the full-history checkout is clean, and the report union passes. That is Core's record, as independently
    rematched by Root 273.

## 2. Generic typecheck (archive `824c97d4`, tree `cf1843c6`, 61 files: 57 raw and 4 records)

- **Admission.** Ticket `b28ab79e…`, used once under Root 274, after the focused group's closure.
- **G0.** Native exit 0, 1,200.7 ms, 987 B of stdout and 0 B of stderr. The readings were OS free 2,103.6 MiB,
  available 2,103.5 MiB and commit headroom 7,293.5 MiB.
- **Run.**
  - `npm run check -- --incremental false` ran as a child from 05:39:24.211Z to 05:40:48.070Z and exited normally
    with code 0. It did not time out.
  - The supervisor exited 0 at 05:40:53.314Z, with no cleanup actions and no unresolved identities. Source and pins
    stayed invariant.
- **Log.** 108 B, `c1bedf9d…`. It contains only the npm `--production` warning and the `tsc --incremental false`
  command line, with zero TypeScript diagnostics. The receipt is 49,208 B, `fc19b306…`.
- **Independent checks.**
  - **Closure, at 05:41:37.33Z.** None of the five known identities (four owned plus supervisor 76828) is present, with
    no scoped processes, listeners or stops.
  - **Pins, at 05:42:51.92Z.** The 44 typecheck pins, 28 build pins, 22 installed files and the lock all match, and
    the source is canonical, clean and full-history. That is Core's record, as rematched by Root 275.

## 3. Execution discipline

- **Capture.** Both runs used the same managed-session pattern, with only `write_stdin` waits of 30 s or less.
- **Root.** Root issued only app waits while a group was active.
- **Order.** Independent closure came before the next group. Real clocks and transport latency are preserved.
- **No shortcuts.** There was no detach, retry, overlap or guard relaxation.

## 4. Named limits on this credit

- **Not CI or full suite.** Both runs are local, not CI-equivalent, and not the full suite.
- **Typecheck scope.** The generic check is not the release-control plane.
- **The receipt's skip wording.** The receipt's conservative label `PASSED_LOCAL_WITH_AUTHORED_SKIPS_NOT_CI_EQUIVALENT`
  is template wording. The actual report has no skipped, pending or todo tests, and no skips are inferred.
- **The local fixture.** It was acquired and stopped, but received zero requests. That proves availability and closure
  only, not fixture behavior, real Auth, PostgREST or the database.
- **Namespace cases.** They prove UI keying with stubbed child forms, not live identity.
- **Identity test.** The pure process-identity test was pinned but not executed. The 21 metadata probes are not
  assertions.
- **Platform.** Windows-local only. No Render/Linux, startup or browser parity.
- **Archiving.** The local archive's long-path and raw-CRLF attempts are retained in the result. They were resolved only
  through process-local long paths and native blob identity, with no byte, config or test rerun.
- **Earlier failures stay failed.** The `47f49adf` focused failure (2 failing) and typecheck failure (6 errors), and the
  failed `84178ce` R1 build, remain failed. No credit transfers between candidates. This pass belongs to `84178ce1`
  alone.

## 5. What remains

- **Release qualification still needed.**
  - The synthetic browser journey, with separate admission at 2,048 MiB.
  - Any required full-suite or release-control checks.
  - Disposable database qualification and application.
  - Real Auth and persistence proof.
- **Staff readback.** It stays HELD. The security condition is OPEN, and the staging decision (Doc 247) is pending.
- **Custody.** The phase A return and final manifest are PENDING, and must bind the final candidate.
- **Deployment and push.** Not authorized by this review. Production (`7bba…`) is not `84178ce1`.
- **Unchanged.** R8 and Docs 160–176 stay closed. Failed run `790af2ce` and the consumed tickets stay as recorded, and
  the payment and security holds stay open.

Not execution, admission, push, deployment or production consent; not human approval; not browser, full-suite or
release credit.
