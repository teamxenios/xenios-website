# Static-CLI observed-primary execution profile R2: narrow trust/handshake review (revision 8)

**CORRECTIONS REQUIRED: one P1 in the controller's final gate. The handshake itself (atomic ready, OS-observed
identity, bound ACK, exactly one hardcoded command, result bound to the ACK) is sound and fail-closed, but the
controller compares the wrapper's reported command array with its own expected array by raw string equality while the
two build the Node and npm paths with different separators, so every otherwise-successful run of any mode is refused at
`EXACT_CLI_RESULT_REFUSED`. No false pass is possible; no pass is possible either. A one-site correction, a re-pin and
a proving control close it. Everything accepted in docs 104–106 stays closed.**

Reviewer: this session, `claude-fable-5-1`. Board registration revision 8 on
`DOC96-EXISTING-WIZARD-QL11-QL12-DELTA-REVIEW-20261012` (19:41:25Z;
`DOC105_STATIC_OBSERVED_PRIMARY_PROFILE_R2_REVIEW_REGISTRATION_20261013.json`, proposal hash `303cc35e…`, records
`6193379a`). Application `8e85daa`/`25507c2f` unchanged. Reviewed directly, read-only, no agents, nothing executed,
the running browser R2 untouched. Archive: `hl12/107_static_cli_observed_primary_profile_r2.json`.

**Bytes.** All five frozen files re-hash to the proposal: controller `run-static-cli-r2.cjs` 44,592 B `68f738b3…`,
wrapper `static-primary-wrapper-r1.cjs` 5,964 B `e3898fe7…`, pins `pins-static-cli-r2.json` 18,263 B `3880381c…`
(92 entries), parent `execute-admitted-static-cli-r2.ps1` 8,791 B `cfbaa675…`, controls
`verify-static-primary-controls-r1.cjs` 3,822 B `44f33dab…`. The pins cover the `8e85daa` LF blobs of every CLI input
I spot-checked (`package.json` `5cc063f6…`, `package-lock.json` `d25eb6b8…`, `CURRENT_PRODUCTION_STATE.json`,
`verify-production-state.ts`, the release-control-plane test, the protection manifest), the wrapper, the R3 identity
helpers (`c9d5d4f3…`, `f3a92fa2…`), node/npm/git/cmd/powershell binaries, the tsx entry and the three test files.

## 1. The P1

**P1. The controller's result gate can never pass.** `run-static-cli-r2.cjs:13-14` builds `NODE` and `NPM` with
`path.join(RUNTIME, …)`; `path` is `node:path` (line 7), which on Windows normalizes to backslashes. The wrapper's
`commandFor()` (`static-primary-wrapper-r1.cjs:10-11,19-24`) uses forward-slash literals for the same two paths and
reports that array verbatim in `cli-result.json` (`record.command`, line 68). The controller's only check of that
array is `JSON.stringify(result.command) === JSON.stringify([NODE, ...cliArgs])` (line 541), with no normalization
(the `normalized` helper at line 64 is used for executables elsewhere, not here). For the two npm modes elements 0
and 1 differ; for protection mode element 0 differs (element 1 is `path.join(ROOT, …)` on both sides and matches).
`cliResultPassed` is therefore false after any exit-0 run, `EXACT_CLI_RESULT_REFUSED` is raised, and the receipt is
`FAILED_OR_INCOMPLETE`. Consequence: the profile cannot produce the migration-DAG, production-state or protection
receipts it exists to produce; it fails closed, so nothing can be mis-accepted. The pure36 controls would not catch
this: they assert `commandFor(mode)[0] === ack.executablePath` against the wrapper's own literal and never exercise the
controller's comparison.

- **Smallest correction (controller only; wrapper stays at `e3898fe7…`):** compare path elements under the existing
  `normalized()` on both sides, or define `NODE`/`NPM` in the controller as the same forward-slash literals the wrapper
  uses (`RUNTIME + '/node.exe'`, `RUNTIME + '/node_modules/npm/bin/npm-cli.js'`; `spawn` and the other `normalized`
  comparisons accept either form). Because the pins file pins the controller and the parent script pins the pins file's
  hash in `$qualExpected`, the correction re-freezes three files (controller, pins, parent); the wrapper and the pure36
  controls are unchanged.
- **Proving check (pure, no CLI spawn, fits the existing LIGHT control profile):** one added control that builds the
  controller's expected array exactly as the controller does for each of the three modes and asserts the controller's
  comparison succeeds against `commandFor(mode)`; it must fail at `68f738b3…` and pass at the corrected hash. The
  corrected profile then needs one actual run per mode under its own admission to bind receipts, as already planned.

## 2. What is sound (accepted as written)

- **Readiness and ACK are atomic and fresh.** Wrapper refuses if any of ready/ACK/result pre-exist, writes
  `primary-ready.pending.json` with `wx` then renames; the controller waits ≤30 s for the ready file (`:582-584`),
  validates every field against its own `child.pid`, `process.pid`, mode, candidate, tree, wrapper hash and
  `workStopAt` (`:587-590`), takes an OS process snapshot through the pinned identity helper, requires the wrapper to be
  an owned depth-0 row with the pinned Node executable (`:594-595`), and only then writes the ACK with the observed
  `pid`, `parentPid`, `creationTicks`, `createdUtc`, `executablePath`, `observedUtc` and `workStopAt`, again `wx`
  plus rename, refusing if an ACK already exists (`:596-601`).
- **The wrapper trusts nothing it cannot check.** `gateStart` requires the exact twelve-key set, protocol, mode,
  candidate, tree, its own file digest, its own `process.pid`/`process.ppid`, the pinned Node path, the same
  `workStopAt`; it recomputes the .NET ticks from `createdUtc` and requires equality; it requires creation within
  30 s before its own start, observation between its start and now, now before the stop, and at most 30 s since start
  (`:25-39`). ACK path must be a regular, non-symlink file ≤4 KiB at its real path. A missing ACK ends in
  `ACK_DEADLINE`, exit 1, no command. No sleep is used as proof.
- **Exactly one hardcoded command.** `commandFor` admits three modes, otherwise `CLI_MODE_REFUSED`; a `started` flag
  makes a second start `SECOND_CLI_REFUSED`; protection mode passes the literal `79414143…` and `8e85daa…`; the
  production-state mode receives `XENIOS_EXPECTED_PRODUCTION_SHA/HEAD_SHA/PRODUCTION_BRANCH` and no
  `XENIOS_OBSERVED_*` (`:233-237`), i.e. checked-in evidence validation, not a provider read.
- **Result binding.** `cli-result.json` is written once (`wx`) with the command, `ackSha256`, the ACK itself, the
  child PID, timestamps and exit/signal; the controller requires protocol, mode, candidate, tree, `wrapperPid ===
  child.pid`, wrapper hash, `ackSha256 === digest(ackPath)`, byte-equal `observedPrimary`, exit 0, no signal, within
  the work window, and `startedUtc ≥ observedUtc` (`:532-545`) — all before the P1 comparison.
- **Environment, pins, budgets, cleanup.** Allowlisted child environment (private HOME/TEMP/npm prefix/cache,
  `NPM_CONFIG_OFFLINE=true`, heap 1,024 MiB, no inherited `NODE_OPTIONS`/`NODE_PATH`), bin-shadow refusal for
  node/npm/git, 92 pins verified before start and after close with size caps, source HEAD/tree/clean/non-shallow before
  and after, npm 10.8.2 probe before and after, 180 s work + 60 s cleanup within 240 s, zero retries, owned-process
  census with two quiet observations and exact pid+creation-ticks kills only (`:395-424`), supervisor identity and
  ancestor collision checks. The parent script verifies the admission ticket hash, exact invocation array, a finite
  window ≤20 min with last-start = end − 270 s, fresh outputs, pre/post pins, no competing qualification processes, a
  1,536 MiB floor on all three memory measures, a cleared environment, and never force-kills a supervisor.

## 3. Retained limits (P3)

- ACK integrity is filesystem-domain (same user, same scratch), with no nonce or MAC; a pre-planted ACK can only make
  the run fail (controller refuses an existing ACK; result equality), never pass.
- `creationTicks`/`createdUtc` consistency is between two supervisor-sourced values; authenticity rests on the pinned
  identity helper's OS snapshot, the accepted R3 pattern (helpers live under the doc 99 scratch root, pinned by hash).
- Descendants of the wrapper (`npm` → `cmd.exe` → `node tsx` for the two npm modes) are adopted through the identity
  helper's reconciliation, not by the controller's depth-0 rule; cleanup relies on that reconciliation.
- Pure36 controls are prepared, not run; they prove the wrapper's gate and command mapping only (and, as above, not the
  controller's comparison).
- Production-state mode is bounded by the QS-R6 window (valid until 2026-10-20T13:49:12Z) and does not satisfy QS-R7
  (fresh provider read).
- Leftover `reportPath`/`testFiles` fields in the controller are inert ("no test mode is accepted").
- 30-second readiness and ACK tolerances are generous for a loopback handshake but bounded by the work window.

## 4. Next steps

1. **Owners:** apply the one-site correction, re-pin controller/pins/parent, add the proving control; register the
   corrected trio with the control result.
2. **Coordinator:** register the correction as the next revision; do not admit the `68f738b3…` controller.
3. **Reviewer:** narrow re-check of the corrected lines, the re-pinned hashes and the proving control's result; then
   the three actual receipts on sight.

Nothing here authorizes execution, a push or deployment. Nothing was executed.
