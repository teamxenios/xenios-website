# Actual `npm run verify:migration-dag` receipt at `8e85daa` under the R3 observed-primary profile: acceptance

**ACCEPTED. This closes doc 105 §2 item 4 (checked-in migration-DAG and canonical-checksum validation) for
`8e85daa`/`25507c2f`.** The archived bytes are the R3 profile's own receipts, not transferred control credit: the
wrapper's atomic ready file, the controller's OS-observed ACK, the single hardcoded command, the strict result
comparator, 92 pins and clean exact source before and after, two quiet closure observations, and an independent
post-exit closure all verify from the bytes, and my own arithmetic on the identity ticks and the event ordering agrees.
It is not production-state, protection, manifest, browser or deployment evidence.

Reviewer: this session, `claude-fable-5-1`, on the coordinator's immediate-assessment request for one completed
receipt. Application, build reuse, QS-2, QS-R5, docs 104–110 unchanged. Reviewed directly, read-only, no agents,
nothing executed. Archive: `hl12/111_migration_dag_receipt.json`.

**Where the bytes are.** Core archive `cb2f7423`
(`doc104-baseline-reconciliation-20261013/static-migration-dag-actual/`) and Root raw copy `66d1ca52`
(`DOC110_MIGRATION_DAG_ACTUAL_PASS_20261013/`) are byte-identical for every file I compared. Re-hashed:
`receipt.json` 51,466 B `f805cb04…`; `cli-result.json` 1,446 B `c91dfe2f…`; `run.log` 210 B `4fc6d69b…`;
`INDEPENDENT_CLOSURE.json` `46d950cf…`; `ADMISSION.json` `32cb8b43…`; `primary-ready.json` `aff6c293…`;
`primary-start-ack.json` `1f3cbbd3…`; archived controller `55b7ff04…` (R3), wrapper `e3898fe7…`, pins
`305cc2e2…` (92), CLI parent `2a72dd9e…`; Root disposition `2e3a9407…`. The output folder keeps the accepted
`static-r2-migration-dag` name; the runner is R3.

## 1. What the receipt binds

- **Admission and parent.** Admission `32cb8b43…` for mode `migration-dag`, candidate `8e85daa`, finite window
  20:37:27Z–20:57:27Z, frozen inputs R3 controller / pins / parent / wrapper / pwsh. Parent consumed the attempt at
  20:37:57.17Z with 1,829 MiB available against the 1,536 MiB floor, started the controller at 20:37:57.20Z, closed at
  20:38:22.93Z, exit 0, within its observation bound; seven pins equal before and after; it binds the supervisor
  receipt by `f805cb04…`.
- **Controller.** `runnerSha256` `55b7ff04…`, `pinsSha256` `305cc2e2…` (92 files, candidate and tree pinned),
  Node v20.19.0, npm 10.8.2 before and after, heap 1,024 MiB, environment allowlisted (`NPM_CONFIG_OFFLINE=true`, no
  `XENIOS_*`), `preSource`/`postSource` HEAD `8e85daa` tree `25507c2f` clean non-shallow, lock `d25eb6b8…` unchanged,
  `sourceInvariant` and `postPinsMatch` true, `failure` null, `timedOut` false, `unclosedProbeCount` 0.
- **Real handshake, not a pure control.** Launch 20:38:05.108Z. The wrapper (PID 25916, parent 17032 = the
  supervisor's own PID in its baseline snapshot) wrote the ready file (`aff6c293…`) with its own pid/ppid, wrapper
  digest and `workStopAt`. The controller's OS snapshot observed that process at 20:38:07.716Z with
  `creationTicks 639275206851110420`, `createdUtc 2026-10-13T20:38:05.1110420Z` and the pinned Node executable, and
  wrote the ACK (`1f3cbbd3…`). I recomputed the .NET ticks from `createdUtc` and they equal `creationTicks`; the
  creation time sits 64 ms before the wrapper's own `startedAt`; the ordering launch ≤ created ≤ ready ≤ observed <
  CLI start (20:38:07.831Z) < CLI end (20:38:14.170Z) ≤ child close (20:38:14.179Z) < `workStopAt` (20:40:57.274Z)
  holds. The ACK precedes the CLI start, as the gate requires.
- **Exactly one command, strictly compared.** `cli-result.json` records
  `[node.exe, npm-cli.js, "run", "verify:migration-dag"]` with the pinned forward-slash paths, equal to the
  controller's `cliCommand`; `wrapperPid` 25916; `ackSha256` equal to the ACK file's digest; `observedPrimary`
  deep-equal to the ACK; child PID 49012; exit 0, no signal, no spawn error, within the window. The controller's
  comparator (R3 lines 537–546) therefore passes: `cliResultPassed: true`. This is the real-run counterpart of the
  mapping-15 control accepted in doc 110.
- **Output.** `run.log`: the npm `production` deprecation warning (preserved, pre-existing), the script line
  `tsx scripts/acceptance/verify-migration-dag.ts`, and `Migration DAG accepted: 37 nodes, canonical checksums
  verified.` — consistent with doc 105 §1: 37 entries, the two `sourceSha`-less entries resolved at the new baseline
  `79414143` with identical blobs.
- **Closure.** Owned identities 9, all closed; unresolved 0; no ambiguous rows or listeners; two quiet observations at
  20:38:19.25Z and 20:38:22.83Z (`TWO_QUIET_OBSERVATIONS_NOT_KERNEL_GUARANTEE`); independent closure at 20:38:58.10Z:
  no matching run identities, no scoped jobs, no owned listeners, source clean at the exact tree, parent exit 0,
  zero processes stopped, user Chrome untouched; it binds the receipt by the same `f805cb04…`.

## 2. Limits retained (not findings)

- The closure is two quiet observations plus an independent post-exit check, as the profile states; not a kernel
  guarantee or a full dependency-closure attestation.
- The wrapper received 172 s of its 180 s work budget because the controller's own preflight (baseline snapshot, 92
  pin verifications) ran first; the profile documents that work includes setup. The CLI needed 6.3 s.
- The ACK's authenticity rests on the pinned R3 identity helper's OS snapshot (accepted pattern); ACK integrity is
  filesystem-domain, as named in doc 107.
- The DAG validator checks checked-in records and Git blobs only; no SQL, ledger or provider state was read, and this
  receipt says nothing about installed database state.

## 3. Effect on the owed list

Closed by this receipt: doc 105 §2 item 4 (`verify:migration-dag`). Still owed: `verify:production-state` under the
same profile inside the QS-R6 window (ends 2026-10-20T13:49:12Z); the protection CLI `79414143 8e85daa` (17 paths);
the alternate-index export and the 17-path manifest validation with the doc 110 attestation (`20a03bb6…`); the
test-evidence assembly; the browser outcome; QS-R4 delivery, deploy-time build log and served identity; Samuel's
current release authority with destination, rollback and no-overwrite checks.

Receipt acceptance is not push, deploy or live-data authority. Nothing was executed.
