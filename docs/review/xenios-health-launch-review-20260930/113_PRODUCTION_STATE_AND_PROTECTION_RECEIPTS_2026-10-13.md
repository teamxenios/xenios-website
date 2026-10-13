# Actual `verify:production-state` and protection-CLI receipts at `8e85daa` under the R3 observed-primary profile: two bound acceptances

**Production-state receipt — ACCEPTED.** `npm run verify:production-state`, run once at `8e85daa`/`25507c2f` inside the
QS-R6 evidence window with the three expected-identity variables set, exited 0 with
`Trusted release baseline accepted: 79414143d4355d5d3d14cd5fe6e5a536dc68d99d / dep-daqft3vf3r2c73b7e88g.` The
handshake, strict command comparison, 92 pins and clean exact source before and after, two quiet observations and the
independent closure all verify from the archived bytes. This closes doc 105 §2 item 3 (checked-in production-evidence
validation) for `8e85daa`. It is not a provider readback, not served identity, and it expires with the recorded
evidence at 2026-10-20T13:49:12Z.

**Protection receipt — ACCEPTED.** `node scripts/acceptance/verify-core-site-protection.mjs 79414143… 8e85daa…`, run
once at `8e85daa`/`25507c2f`, exited 0 with `RESULT: PASS` over exactly 17 changed paths (3 allowed, 8 infrastructure,
5 tests, 1 seam) and 28 protected hashes verified. The 17 paths and their classes equal `git diff --name-only
79414143 8e85daa` classified by the gate's own rules at `8e85daa`. The same profile checks hold from the bytes. One
precise limit is retained exactly as Core and Root already state it: the 0.7-second CLI child (PID 52452) was not
captured as a separately observed OS identity; its exit 0 rests on the observed wrapper's record. This closes doc 105
§2 item 5 (protection CLI at the exact base/successor) for `8e85daa`. It is not browser, manifest or deployment
evidence.

Reviewer: this session, `claude-fable-5-1`, on the coordinator's revision-14 request for two completed receipts, each
as its own bound result. Reviewed directly from the archived bytes, read-only, no agents, nothing executed (no tests,
imports, resource, provider or browser probes). Source acceptance of `8e85daa` is not reopened; no browser, manifest
or served-identity claim is made. Archive: `hl12/113_production_state_and_protection_receipts.json`.

**Where the bytes are.** Production-state: Core `daaa6478`
(`doc104-baseline-reconciliation-20261013/static-production-state-r3-actual/`), Root `04280624`
(`DOC110_PRODUCTION_STATE_ACTUAL_PASS_20261013/`, disposition
`DOC110_PRODUCTION_STATE_ROOT_QUALIFIED_DISPOSITION_20261013.json` `e42f8b82…`). Protection: Core `e82d3cac`
(`static-protection-actual/`), Root `7e3c58a5` (`DOC110_PROTECTION_ACTUAL_PASS_20261013/`, disposition
`DOC110_PROTECTION_ROOT_QUALIFIED_DISPOSITION_20261013.json` `e1a0f1b4…`). Every file I compared is byte-identical
across the Core and Root copies. Re-hashed: production-state `receipt.json` 57,142 B `99157ea2…`, `cli-result.json`
1,455 B `09b6a983…`, `run.log` 256 B `67843d4b…`, `ADMISSION.json` `9b1994a2…`, `INDEPENDENT_CLOSURE.json`
`a07597c7…`, `primary-ready.json` `7816c1d4…`, `primary-start-ack.json` `7e1d026a…`, parent `receipt.json`
`6bf63b56…`; protection `receipt.json` 46,360 B `64b03d3b…`, `cli-result.json` 1,509 B `4320c0c3…`, `run.log` 1,031 B
`da9f12eb…`, `ADMISSION.json` `40d0955a…`, `INDEPENDENT_CLOSURE.json` `e8ebb35f…`, `primary-ready.json` `2d4314ae…`,
`primary-start-ack.json` `2314cf2f…`, parent `receipt.json` `16abc51d…`. Both archives carry the accepted R3 controller
`55b7ff04…`, wrapper `e3898fe7…`, pins `305cc2e2…` (92) and CLI parent `2a72dd9e…`; the output folders keep the
accepted `static-r2-<mode>` names.

## 1. Checks common to both receipts (all pass from bytes)

- **Admission and parent.** Each ticket names mode, candidate `8e85daa`, tree `25507c2f`, a finite 20-minute window
  with `lastStart` 270 s before its end, frozen inputs (controller, pins, parent, wrapper, pwsh `362a356c…`), the
  pinned Node `6e3a3978…` (71,046,288 B) and the dependency-copy receipt `3c9c461d…`; bounds attempts 1, automatic
  retries 0, 180 s work + 60 s cleanup, heap 1,024 MiB, floor 1,536 MiB, one concurrent group. The parent consumed each
  attempt inside its window, measured G0 above every floor, found zero competing qualifications, pinned seven inputs
  equal before and after, exited 0 within its observation bound, and binds the supervisor receipt by its exact digest.
- **Controller.** `runnerSha256` `55b7ff04…`, `pinsSha256` `305cc2e2…` with 92 pins incl. both acceptance scripts at
  their `8e85daa` blob digests (`verify-production-state.ts` `8057a46d…`, `verify-core-site-protection.mjs`
  `e0cd56bf…`, equal to `git cat-file blob` at `8e85daa`), Node v20.19.0, npm 10.8.2 before and after, allowlisted
  environment (`NPM_CONFIG_OFFLINE=true`, `TSX_DISABLE_CACHE`, isolated git/npm config, no `GITHUB_EVENT_PATH` or
  `XENIOS_OBSERVED_*`), `preSource`/`postSource` HEAD `8e85daa` tree `25507c2f` clean non-shallow lock `d25eb6b8…`,
  `sourceInvariant` and `postPinsMatch` true, `failure` null, `timedOut` false, `stopReason NORMAL_EXIT`,
  `unclosedProbeCount` 0, `cleanupActions` empty, `logSha256` equal to `run.log`.
- **Real observed-primary handshake.** The wrapper wrote its ready file with its own pid, the supervisor's pid, the
  wrapper digest and `workStopAt`; the controller's OS snapshot observed that pid with creation ticks, `createdUtc`
  and the pinned `node.exe`, and wrote the 12-key ACK. I recomputed the .NET ticks from `createdUtc` and they equal
  `creationTicks`; ack pid = ready pid = `cli-result.wrapperPid` = receipt `childPid`; ack parent = supervisor pid;
  `cli-result.observedPrimary` deep-equals the ACK and `ackSha256` equals the ACK file digest; the ordering
  launch ≤ created ≤ ready ≤ observed < CLI start < CLI end ≤ child close < `workStopAt` holds.
- **Exactly one command, strictly compared.** `cli-result.command` equals the controller's `cliCommand` and the
  literal array I expect for the mode (below); exit 0, no signal, no spawn error, within the work window;
  `cliResultPassed` true.
- **Closure.** Two quiet observations; independent closure after final exit lists exactly the receipt's owned
  identities plus the supervisor by (pid, creationTicks), all `ABSENT`, no scoped jobs, no listeners for known pids,
  source `8e85daa`/`25507c2f` clean, zero processes stopped, memory not resampled. The closure binds the run by
  identity, not by a receipt digest.
- **Sequencing honoured.** Production-state's ticket cites the migration-DAG closure (20:38:58Z) as prior qualified
  closure; protection's ticket cites the production-state closure (21:42:43Z). Protection's `preparedAt` 20:26:14Z
  predates its window (21:45:20Z–22:05:20Z) by 79 minutes, but the ticket's prior-closure field proves its bytes were
  finalized after 21:42:43Z, and the parent enforces the window, not `preparedAt`. Observation only.

## 2. Production-state receipt (admission `9b1994a2…`)

- Window 21:37:27.710Z–21:52:27.710Z; attempt consumed 21:40:57.97Z; G0 OS free 1,978.04 / available 1,940.55 /
  commit headroom 7,247.90 MiB; parent 21:40:58.08Z–21:42:03.43Z, exit 0.
- Expected environment (ticket) = child environment (receipt): `XENIOS_EXPECTED_PRODUCTION_SHA=79414143…`,
  `XENIOS_EXPECTED_HEAD_SHA=8e85daa…`, `XENIOS_EXPECTED_PRODUCTION_BRANCH=release/early-access-code-session-checkout`;
  nothing else from `XENIOS_*`.
- Command `[node.exe, npm-cli.js, "run", "verify:production-state"]` (pinned forward-slash paths). Launch 21:41:08.612Z;
  wrapper PID 48532 under supervisor 41852; created 21:41:08.6164090Z (ticks `639275244686164090`); observed
  21:41:11.783Z; CLI 21:41:11.925Z–21:41:55.913Z (44.0 s), exit 0; `workStopAt` 21:43:58.302Z (wrapper got 169.7 s of
  the 180 s budget after controller preflight).
- Output (`run.log` 256 B): the pre-existing npm `production` deprecation warning, the script line
  `tsx scripts/acceptance/verify-production-state.ts`, and `Trusted release baseline accepted: 79414143… /
  dep-daqft3vf3r2c73b7e88g.` The deployment id and the 13:49:12Z observation are the ones recorded in
  `docs/coordination/CURRENT_PRODUCTION_STATE.json` and `ACTIVE_RELEASE_GRAPH.json` at `8e85daa` (doc 105).
- Run time 21:41Z on 2026-10-13 is inside the validator's 7-day window from the 13:49:12Z record (QS-R6).
- Closure: 8 owned identities observed during the 44 s run (wrapper node, npm node, cmd, two tsx nodes, esbuild, two
  conhosts) incl. the CLI child PID 28148; quiets 21:41:59.59Z and 21:42:03.29Z; independent closure 21:42:43.26Z–
  21:42:44.69Z, nine identities (8 + supervisor) absent.
- Attempt history, as the ticket records it: two earlier parent G0 refusals (`b66f119c`, `da04d290`, values unknown,
  no automatic retry); this is one fresh attempt after an owner-recorded manual window change. I verify only the bound
  G0 reading of this attempt; the recovery narrative is not evidence I can check and does not need to be.

## 3. Protection receipt (admission `40d0955a…`)

- Window 21:45:20.367Z–22:05:20.367Z; attempt consumed 21:46:42.53Z; G0 OS free 2,068.86 / available 2,056.51 /
  commit headroom 7,243.66 MiB; parent 21:46:42.57Z–21:46:55.56Z, exit 0. `expectedEnvironment` null; child
  environment contains no `XENIOS_*`.
- Command `[node.exe, C:\xenios-wt\doc104-baseline-reconciliation\scripts\acceptance\verify-core-site-protection.mjs,
  79414143d4355d5d3d14cd5fe6e5a536dc68d99d, 8e85daa156ab04837fc5bfb73c0e661bba83cfee]` (backslash script path on both
  sides, as the R3 comparator requires). Launch 21:46:45.962Z; wrapper PID 51936 under supervisor 7332; created
  21:46:45.9652120Z (ticks `639275248059652120`); observed 21:46:48.505Z; CLI 21:46:48.740Z–21:46:49.452Z (0.71 s),
  exit 0; `workStopAt` 21:49:42.630Z.
- Output (`run.log` 1,031 B): `manifest baseline : 766f19fc…` (the manifest's `baselineSha`, as in doc 99),
  `comparing 79414143..8e85daa`, `changed files : 17`, `allowed (research/care) : 3`, `infrastructure : 8`,
  `protected file hashes : 28 verified`, five test files reported, one seam file (`package.json`) reported,
  `RESULT: PASS`.
- Independent classification. `git diff --name-only 79414143 8e85daa` is 17 paths. By the gate's order at `8e85daa`
  (seam, then test suffix, then allowed, then infrastructure): seam `package.json` (1); tests
  `AssistedOrderPage.test.tsx`, `draft-store.test.ts`, `release-control-plane.test.ts`, `http-e2e.test.ts`,
  `service.test.ts` (5); allowed `AssistedOrderPage.tsx`, `draft-store.ts`, `server/research/assisted-order/service.ts`
  (3); infrastructure the six `docs/coordination/*` records, `ql-protection-carryforward-20261012/APPROVAL_AND_PREIMAGE.json`
  and `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` (8). 1 + 5 + 3 + 8 = 17; no violation class. The 28 hashes are
  checked against the manifest as it exists at `8e85daa`, whose carry-forward amendment was reviewed in docs 99/103;
  nothing there is reopened here.
- The gate's own notices stand as notices: the five tests must have been strengthened, not weakened, and the
  `package.json` seam needs lease/minimum-diff/regression confirmation. Both were addressed in the source acceptances
  (docs 103–105) and are not re-adjudicated by this receipt.
- Closure: 2 owned identities (wrapper node 51936, conhost 47776); the CLI child PID 52452 ran entirely between the
  snapshots at 21:46:48.50Z and 21:46:52.49Z and does not appear in the owned list; quiets 21:46:52.49Z and
  21:46:55.46Z; independent closure 21:47:15.52Z–21:47:16.53Z, three identities (2 + supervisor) absent. Root's
  disposition states this limit in the same terms. It is a precise scope statement, not a finding: the wrapper that
  recorded the child's exit is the OS-observed primary, the command array is strictly bound, and the output bytes are
  the gate's.

## 4. Limits retained (not findings)

- Closure is two quiet observations plus an independent post-exit identity check, as the profile states; not a kernel
  guarantee. For protection, the short CLI child is covered by the wrapper's exit record only.
- ACK authenticity rests on the pinned R3 identity helper's OS snapshot (accepted pattern); ACK integrity is
  filesystem-domain (doc 107).
- Production-state validates checked-in evidence against the expected identity; it reads no provider, performs no
  readback and proves nothing about what is served. Its evidence expires 2026-10-20T13:49:12Z (QS-R6); QS-R4 (served
  identity) and QS-R7 (fresh provider read) remain open.
- Protection compares two local refs against the checked-in manifest; it proves nothing about tests, build, browser,
  manifest validation or deployment.

## 5. Effect on the owed list

Closed by these receipts: doc 105 §2 items 3 (`verify:production-state`) and 5 (protection CLI, 17 paths). All three
static CLI receipts under the R3 profile are now accepted (doc 111 + this doc). Still owed: the bounded exact Git
diff-check parent and its receipt (source proposal `1632d4d` seen on the records branch, not registered to me, not
assessed); the final manifest with `diffCheck`, the placed attestation artifact (`20a03bb6…`), the built alternate
index with exact-entry proof, the real 95-pin file, live default-index pin, finite ticket + G0, and the actual
`verify:release-manifest` receipt; the browser outcome; QS-R1, QS-R4, QS-R7; Samuel's current release authority with
destination, rollback and no-overwrite checks.

Receipt acceptance is not push, deploy or live-data authority. Nothing was executed; no agents were used.
