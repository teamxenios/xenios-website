# First literal build of `47f49adf`: actual evidence disposition

**LOCAL LITERAL BUILD CREDIT SUPPORTED for candidate `47f49adf` on this Windows host.**

- **What passed.** The admitted G0 check passed. The exact Render build command then completed with exit 0, inside its
  bounds, from the frozen lockfile.
- **Independent checks.** Independent postchecks confirm the artifacts, the unchanged source and pins, and closure of
  every owned process.
- **The polling deviation.** It is real and recorded, but it is NOT material to the build credit. No waiver is inferred.

There is no test, typecheck, browser, SQL, persistence, staff-read or deployment credit.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: committed
evidence files and Root records. Nothing run, no agents, no source re-review. Reviewed at 2026-10-15T03:32–03:36Z.
Archive: `hl12/172_first_literal_build_actual_evidence_disposition.json`.

## 1. Binding

- **Core.** `18fe8d29` (tree `4279aa4b`, parent `f3424ff4`), folder `literal-build-slot-r1/actual-r2-build-completed/`.
  All 68 files were extracted and their blobs match.
- **Root.** Doc 246 at `26fa69c`. Its frozen copies equal Core's files:

| Record | Bytes | SHA-256 |
|---|---|---|
| build result | 9,666 | `870ee867…` |
| supervisor receipt | 53,237 | `3813c166…` |
| raw archive inventory | 13,772 | `afb03338…` |
| execution capture (Core) | 46,425 | `761fba0b…` |
| independent postchecks (Core) | 145,469 | `deec0955…` |

- **Admission.** Root's Doc 244 activation (`f819819`) records ticket `07024dd5…`, used once. There was one attempt,
  with no retry, stop, detach or relaunch.

## 2. What actually happened

- **G0.**
  - Entry `8edcfb98…` ran under pinned pwsh 7.
  - The native result was exit 0, 2,445.86 ms, 999 B of stdout and 0 B of stderr.
  - The readings, all above the 1,536 MiB floor, were observed at 03:12:02.818Z:
    - OS free: 1,725.5 MiB;
    - available: 1,723.6 MiB;
    - commit headroom: 7,762.6 MiB.
  - The R7 phases stayed within budget: initialization 1,519 ms, OS read 332 ms, native read 64 ms.
  - The outer record says `G0_ACCEPTED_BUILD_ENTERING`.
  - The build started at 03:12:09.468Z. That is before the 03:29:00Z last start, with a full 720 s window, ending at
    03:24:03.045Z.
- **Build.**
  - The pinned Node 20.19.0 ran `npm run render-build` in a private prefix with npm 10.8.2.
  - `npm ci` added 531 packages from the frozen lock. The lock is `d25eb6b8…` both before and after.
  - Vite 7.3.5 transformed 2,312 modules and built the client in 14.66 s. esbuild built `dist/index.cjs` (1.7 MB) in
    2,003 ms.
  - The bundle contains `OrderRequestEntry`, `RequestIntentEntry` and `AssistedOrderPage` chunks, so the mixed-request
    source compiled.
  - The child exited normally with code 0 at 03:14:29.436Z, after about 140 s. It did not time out.
  - The supervisor exited 0, finalized at 03:14:39.659Z, and the managed session ended with exit 0 at 03:14:42.369Z.
  - The only warnings are the npm `--production` deprecation and the advisory about chunks over 500 kB. Both are
    retained, and neither is a failure.
- **Independent postchecks.**
  - **Artifacts, at 03:18:33.74Z.** The checkout is clean at `47f49adf`/`a2a8e79d`, and all 28 input pins match.
    - The `dist` folder holds an exact set of 350 files, 10,687,773 B, with no reparse points.
    - 22 selected installed files were rehashed: 16 private-npm files and 6 dependency files.
    - All three lock copies are `d25eb6b8…`.
    - The inventory hash matches the declared one.
  - **Processes, at 03:16:54.98Z.** All 8 owned identities are gone, with no relevant listeners, no open probes and no
    stops.
    - PID 82648 was reused by an unrelated Chrome process with a different creation time and executable.
    - It was correctly left untouched, because exact identity matters, not the PID alone.
  - **First postcheck attempt.** The first read-only attempt (`17b77a`) failed on a path expression and is retained.
    The parentheses-only correction (`6e69ec`) passed. That was not a build retry.

## 3. The polling deviation is not material to build credit

- **What happened.** Doc 244 asked for owner polling of the managed session at intervals of 30 s or less.
  - One coordinator `send_message` call held the owner for about 49 s before the next `write_stdin`.
  - The exact request time of that earlier poll was not captured.
  - The capture shows five polls of the same session 61342, ending in native exit 0.
- **Why it doesn't touch the build credit.**
  - The cadence governs live observation, not execution.
  - The session was kept throughout, with no stop, detach or relaunch.
  - The supervisor enforced its own finite budgets and monitoring.
  - Every evidence item comes from the supervisor's own files and the native exit, not from the poll stream: the run
    log, receipt, process evidence, artifact inventory and lock copies.
  - No intervention was needed, and none was permitted.
- **What it does mean.** The deviation means the Doc 244 protocol was not followed perfectly, and it stays recorded
  that way. I grant no waiver, and none is inferred.
- **Future runs.** Don't put long coordinator calls between polls, or record the cadence as best-effort.

## 4. Use by separately admitted focused tests: yes, with conditions

The checkout and its installed dependencies can be the input to a separately admitted focused-test and typecheck job.
They came from the exact frozen lock, with dev dependencies installed, at the unchanged `47f49adf`. The conditions:

- **Fresh checks first.** Immediately before use: rehash the lock and the 22 selected installed files, confirm the
  checkout is clean at HEAD/tree, confirm the 28 pins, and confirm nothing changed since 03:18:33Z.
- **Its own admission.** That job needs its own source, window, selection, pins and current admission, and it must be
  the only heavy job. This packet authorizes none of it.
- **Known limits.**
  - Dependency integrity is lock-derived plus a sample of 22 files, not a complete transitive closure.
  - The result is Windows-local, with no Render/Linux, startup or browser parity.
  - `run1` now exists, so the build runner itself would refuse a rerun in this scratch folder, as designed.
- **No borrowed credit.** The tests must not count this build as test evidence. This `dist` folder is a local
  artifact, not a deployment artifact.

## 5. What is not claimed, and what stays open

- **No credit beyond the build.** Zero tests, typecheck, browser, SQL, persistence, staff-read, deployment or
  production credit. The 97 authored test declarations remain NOT RUN.
- **Security.** The exposure condition is OPEN and privileged staff reads are HELD.
- **Database.** Root reports the disposable Auth/PostgREST bootstrap as unmet.
- **Production.** The live manual revision (`7bba…`) is not `47f49adf`.
- **Custody.** It is unchanged: phase A `abb400e5` active, return PENDING.
- **Unchanged.** R8 and Docs 160–171 stay closed. Failed run `790af2ce` and tickets `404727c5`, `264a4c65` and
  `07024dd5` stay consumed, and the payment and security holds stay open.

Not execution, admission, push, deployment or production consent; not human approval; not test, browser or
qualification credit beyond the local build stated above.
