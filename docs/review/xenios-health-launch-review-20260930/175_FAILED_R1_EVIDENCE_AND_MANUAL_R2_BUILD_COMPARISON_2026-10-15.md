# Failed `84178ce` R1 build evidence and the manual R2 successor

**R1 FAILED as recorded, with no build credit.**

- **The guard was right.** The ownership-ambiguity guard stopped the build correctly when an unowned process mentioning
  the scratch path appeared.
- **Attribution.** Attributing that process to Root's read-only status command is strongly correlated but not PID-proven.
  The guard stays unchanged.
- **Mitigation.** The new operating rule is adequate if every session on this host follows it, including this reviewer.
- **R2.** The manual R2 bindings, preparation, window and authority are SUFFICIENT.

This is not admission or invocation, and gives no R2 build, test, typecheck, browser, SQL, staff, security or
deployment credit.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
text, and read-only hashing of the prepared R2 checkout before any activation. Nothing run, no agents. Doc 174 and the
framework were not re-reviewed. Reviewed at 2026-10-15T04:56–05:00Z. Archive:
`hl12/175_failed_r1_evidence_and_manual_r2_build_comparison.json`.

## 1. R1 outcome (immutable archive `c7155f49`, tree `14a8323d`): FAILED

- **Archive.** 68 files: 63 raw and 5 records.
  - Receipt: 53,703 B, `ddd4f3f6…`.
  - Log: 592 B, `4b8cb1c8…`.
  - Capture `806d5a8c…`, result `d60b6329…`, guards `bc4ac1dd…`, independent checks `276e3fa4…`, Root correlation
    `6bc5c314…`.
- **What happened.** Ticket `c3c1da84` was consumed.
  - The child ran from 04:42:05.401Z to 04:44:08.212Z and exited 4294967295, which is −1. The supervisor exited 1 and
    finalized at 04:44:12.534Z.
  - The failure was `OWNERSHIP_OBSERVATION_UNRESOLVED`, with stop reason `PROCESS_OBSERVATION_FAILED`. It did not time
    out.
- **No build happened.** The log stops after `added 531 packages in 2m`. That line does not show the `npm ci` command
  exiting 0. `node script/build.mjs` never ran, there was no compiler output, and `renderBuildCompleted` is false.
- **What still held.** Source and pins stayed invariant. Cleanup killed only the owned primary (83232) under the
  existing policy, and the other owned identities had already exited. The independent 04:45:42Z check found all 8 owned
  identities and supervisor 83164 gone, with no scoped processes, listeners or extra stops.

## 2. The cause and the operating mitigation

- **The trigger.** Process snapshot 017, observed at 04:44:03.888Z, shows unowned `pwsh.exe` PID 79148.
  - Its parent is 17324, the same host process as the managed entry shell 83016.
  - It was created at 04:44:00.3137Z, with `scratchMention: true` and `rootMention: false`.
  - It was not the supervisor (83164), an ancestor, or owned.
  - The guard refusing on that ambiguity is correct, fail-closed behavior.
- **Root's account.** Root records issuing a read-only PowerShell metadata command (chunk `1369b8`, 1.43 s) that
  contained the exact scratch path and read `g0-r2-outer.json` and `run1/start.json` during the run.
  - The timing, the parent and the path all match. But the tool does not expose PIDs, so the attribution is strong
    correlation, not proof.
  - Calling it an operational overlap, not an application error and not grounds to weaken the guard, is correct.
- **The mitigation.** While an admitted managed group is active, no owner runs a Windows shell, status or metadata
  command that references that group's source or scratch path. Root uses only supported app wait snapshots. Core uses
  only `write_stdin` waits of 30 s or less, and real times and latency are recorded.
  - That is adequate for this cause, but only if every session on the host follows it. The guard matches any process
    whose command line mentions the path.
  - That includes this reviewer. I will run no command referencing an active group's source or scratch during an
    admitted window.
  - My own read-only scratch checks ran at about 04:37Z and 04:57Z. That was outside R1's 04:42–04:44Z run and before
    any R2 activation.
  - Root's correction of its stale RUNNING inference stands.

## 3. Manual R2 bindings (Core `d1f1b748`, tree `7b2e476a`): exact

- **Runner.** 39,601 B, `2569b88e…`. It is `954b99b7…` with only `SCRATCH` (now `…-render-build-r2-20261015`) and
  `ACTION` (`…_R2_…`) changed.
- **Entry.** 3,210 B, `b5079020…`. It is `94090792…` with only three lines changed:
  - the run root;
  - the admission label `MIXED_84178CE_LITERAL_BUILD_R2_20261015`;
  - the final runner call, with the R2 paths and pins hash `139e93f2…`.

  The G0 call still uses the existing R1-slot script (`947bba10…`, physically confirmed) and
  `-StopAtUtc '2026-10-15T05:30:00.000Z'`. The candidate and tree checks are unchanged.
- **Pins.** 5,880 B, `139e93f2…`, 28 entries. The paths moved to the R2 scratch, and the only value change is the
  runner's own pin. The candidate (`84178ce1`), tree (`24d3fa00`), Node, npm and source pins are unchanged.
- **Unchanged.** G0 functions, the R7 slice, the ownership guard, budgets, floors, Node 20.19.0, npm 10.8.2, the private
  prefix and the script.

## 4. Preparation, window and authority: sufficient

- **Preparation.** Grant `28b96c5d`, receipt `9f26d3a2`, tree `40ed4c60`. Preparation ran once, from 04:52:05.059Z to
  04:52:10.032Z, with native exit 0 and a full capture, and the independent postcheck passed at 04:52:30.975Z.
  - My read-only check confirms the R2 scratch holds only `source/`, `run-render-build.cjs` (`2569b88e…`) and
    `pins.json` (`139e93f2…`).
  - The source is at HEAD `84178ce1`, tree `24d3fa00`, with full history. All six corrected files equal their LF blobs.
  - There are no `node_modules`, `dist`, `run1` or G0 outputs.
  - The failed R1 scratch is preserved unchanged.
- **Window.** 04:50:02.527Z to 05:30:00Z, with the last full start at 05:18:00Z. The entry's `now + 720 s ≤ stop`
  check and the runner's launch check enforce it.
  - The 720 s aggregate (480 s of work plus 240 s of cleanup), the 1,536 MiB heap and all three G0 floors of at least
    1,536 MiB are unchanged.
  - This is a separately reviewed manual successor, not an automatic retry. There is no ticket reuse or extension.
- **Authority.** Run instructions in Docs 223 and 239. The same owner, under active lease `abb400e5`, with phase A's
  return PENDING.
- **Still required.** Core's fresh FINAL READY, the exclusive slot, a new single-use Root ticket, a fresh G0, and the
  full remaining time.

## 5. Holds

- **No R2 credit.** No R2 build, test, typecheck, browser, SQL, persistence, staff-read or deployment credit.
- **Tests and typecheck.** `84178ce` still needs rebound focused and typecheck slots, as Doc 174 says.
- **Security.** The exposure condition is OPEN and privileged staff reads are HELD.
- **Production.** The live revision (`7bba…`) is neither candidate.
- **Unchanged.** R8 and Docs 160–174 stay closed. Failed run `790af2ce`, tickets `404727c5`, `264a4c65`, `07024dd5`
  and `c3c1da84`, and the failed focused and typecheck results all remain as recorded. The payment and security holds
  stay open.

Not execution, admission, push, deployment or production consent; not human approval; not build, test or
qualification credit.
