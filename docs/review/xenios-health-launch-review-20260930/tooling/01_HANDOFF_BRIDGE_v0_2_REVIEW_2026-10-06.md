# Xenios Handoff Bridge v0.2 repair candidate: bounded tooling review

**Scope:** a standalone transport prototype, not the website. This record sits beside the website review chain only
because this branch is the reviewer's records lease. Nothing here touches website source, `.xenios` task authority,
the Quick Order holds, A1, A2, GATE-01, the Core hash pairs or any release decision.

**Verdict: ACCEPT WITH LIMITS** for the v0.2 repair candidate against the four v0.1 findings. All four are fixed in
the shipped bytes with regression tests that would fail on v0.1 behaviour. The candidate is **not ready for a
synthetic live pilot on this host** until the limits in section 5 are addressed, the first two of which were found by
running the suite on the Windows pilot host for the first time.

Reviewer: this session, `claude-fable-5-1`, effort `xhigh` as reported. Method: manifest and diff verification,
full read of `lib/core.mjs`, `lib/providers.mjs`, `lib/paths.mjs`, `lib/primitives.mjs`, `bridge.mjs` and the three
test files, two read-only specialist lenses with adversarial verifiers (workflow `wf_df788e16-939`, 4 agents, 70 tool
calls; 16 findings, 15 upheld, 1 refuted; full output `evidence/bridge-v0.2-lens-findings.json`), and two executions
of the package's own test suite on this Windows host under the pinned Node 20.19.0 from a scratch copy. No signing
key was provisioned, live transport stayed disabled, no provider CLI was invoked, no coordinator precheck was taken,
no v0.1 state was migrated, and no file under `Downloads` or any repository was written.

## 1. Identity and integrity (verified)

| Item | Result |
| --- | --- |
| Package | `Xenios_Handoff_Bridge_v0_2.zip` sha256 `9a82deb5da08441493e36e20e0d9c8b680de8fbfac0f4f7d9d605957c069aeab`; extracted at `C:/Users/sboad/Downloads/Xenios_Handoff_Bridge_v0_2/Xenios_Handoff_Bridge_v0_2` |
| v0.2 manifest | 75 entries, 75 match by sha256 and byte length; no file on disk outside the manifest; none missing |
| v0.1 baseline | 27 entries, 27 still match; the v0.1 folder is unmodified |
| Repair diff | `evidence/REPAIR_DIFF.patch` applies cleanly to a scratch copy of v0.1 (`git apply --check`) and, compared ignoring CR/LF, reproduces every v0.2 source, test, tool, doc and example file byte for byte |
| Producer receipt | `evidence/TEST_RECEIPT.json`: Linux x86_64, Node v22.16.0, 129 pass, 0 fail, 0 skipped, 17 before/after bindings unchanged, `nativeWindowsExecuted:false`, `Node20Executed:false`; the pre-final failed run differs from the final run only in `tests/providers.test.mjs`, so the fixture repair touched no product code |

## 2. The four findings

| v0.1 finding | v0.2 status | Decisive anchors | Regression coverage (would fail on v0.1) |
| --- | --- | --- | --- |
| **1. Consumption bound to a permit UUID, not the authorization** | **FIXED** | `grantPermit` requires a signed envelope object (`core.mjs:172-173`); Ed25519 over canonical JSON against a trust pinned once (`:12-32`, `:158`); exact-key envelope, body, evidence and scope (`:151-169`, scope equality via `authorizationScope`); audience = `stateId` (`:159`); 24 h window (`:162-166`). Three tombstones keyed on issuer plus authorization ID, decision ID and evidence sha256 (`:141-147`) written O_EXCL before `consumedAt`, before the state rewrite and before the resource probe (`:209-211`, `:222-224`); checked at grant and consume (`:177`, `:202`); cross-job reuse refused (`:183`); same-envelope grant idempotent (`:178-182`); v0.1 state refused (`:37`). No debug or force flag exists (`bridge.mjs:31`). | `tests/core.test.mjs:25` (free text refused), `:35` (exactly one permit for a repeated envelope), `:39` (re-permit after refusal), `:40`, `:42`, `:44`, `:45`, `:74` (tombstone checks that a ledger-only implementation would fail), `:43` (restart), `:46` (fresh store) |
| **2. Unconstrained output paths, lexical attempt check, reusable directories** | **FIXED** | one guard, `lib/paths.mjs:21-53`: per-component `lstat`, symlink and junction refusal, `realpathSync.native` equality, `.git`/`.xenios` component and ancestor refusal including bare repositories, final file must be a singly linked regular file, containment checked only after the boundary itself is validated; every controller write goes through it (`bridge.mjs` and `demo.mjs` have no raw `fs` writes); attempt directories are created with a non-recursive exclusive `mkdir` after refusing any existing path (`:66-74`); attempt root pinned at `makeRecipe` (`providers.mjs:28-31`), rebuilt and re-checked by the CLI before dispatch (`bridge.mjs:67-71`), re-checked at `runRecipe` (`providers.mjs:91-93`); bounded `O_NOFOLLOW` readback with double `fstat` (`paths.mjs:110-120`) | `tests/paths.test.mjs:18-20`, `:30-34`, `:37` (repository destinations incl. CLI exports and demo), `:21-25`, `:36` (aliases and hardlinks), `:26` (escape), `:27-29` and `tests/providers.test.mjs:45` (reused and empty directories, stale result file refused before spawn) |
| **3. `last-message.json` accepted before failure events; stale results** | **FIXED** | `parseProvider` (`providers.mjs:52-85`): every line must decode; `error` / `turn.failed` throw before any file is considered; exactly one `thread.started` first, one `turn.started`, one trailing `turn.completed`; last agent message bound to request ID, attempt ID and request digest (`:45-49`); the file, when present, must equal the event result (`:79-82`); Claude requires `type:result`, `subtype:success`, `is_error:false` and a session ID (`:55-57`). Request and attempt identifiers are fresh UUIDs with a digest over job, recipe, config and authorization (`core.mjs:205-206`), required by schema and prompt, checked three times (`providers.mjs:47`, `core.mjs:123`, `:242`). A stale file cannot survive because the attempt directory cannot pre-exist (`:93`, `:113`). | `tests/providers.test.mjs:23-31`, `:32` (three stale-identifier cases, both providers), `:34-37`, `:45-47`, `:49`, `tests/core.test.mjs:62` |
| **4. Lost evidence and flattened signals** | **FIXED** | logs opened O_EXCL and fsynced, receipt saved before spawn (`providers.mjs:106-107`), pid recorded synchronously and on `spawn` (`:156-157`), per-chunk capped writes (`:141-151`), exit code and signal stored separately with `closeObserved` (`:162`), final save in `finally` (`:198`); `dispatch` holds the slot for any unbound result, signal, missing close, unpersisted receipt, timeout or truncation (`core.mjs:243-247`) and releases only for `NOT_STARTED`, `PROVIDER_FAILED`, `OUTPUT_REJECTED` and `RESULT_RECORDED`, each of which requires an observed close or no spawn | `tests/providers.test.mjs:50-61` (nonzero exit, signal, timeout, overflow, abort, spawn exception, pin mismatch, exit 0 without envelope, provider failure, stream error, missing close, real dispatch timeout), `tests/core.test.mjs:58-62`, `:71` |

## 3. Executed on this host (first native Windows evidence)

| Run | Result |
| --- | --- |
| Syntax check, all seven modules, Node 20.19.0 | ok |
| Suite with the default temp directory (`%TEMP%` under the user profile) | **39 pass, 88 fail, 2 skipped**; every failure is `OUTPUT_INSIDE_REPOSITORY` from `noRepoAncestors` while constructing the store, because `C:\Users\sboad\.xenios` exists (a profile-level directory holding two credential files, unrelated to the repository corpus) and the guard treats any ancestor containing a directory named `.xenios` as a repository tree |
| Suite with `TEMP`/`TMP` pointed at `C:\Users\Public\xenios-bridge-v02-tmp` (created for the run, removed afterwards) | **126 pass, 1 fail, 2 skipped**, 189 s. Skips are the two declared Windows skips (file-symlink privilege; native signal semantics). The failure is test 65, "R1 expiry during preflight": a 250 ms authorization expired inside `consume()` itself on this filesystem (lock, read, three fsynced tombstones, atomic rewrite) and was refused with `AUTHORIZATION_EXPIRED_OR_EARLY` before any tombstone was written. That refusal is the correct safety behaviour; the fixture's window is too tight for Windows. Controller-initiated termination was exercised natively: timeout (test 120), output limit (121), abort (122), spawn exception (123), the three dispatch-level hold tests (45, 46, 48) and the real-runner timeout that asserts the recorded `SIGTERM` signal and a held slot across reload (129) all passed |
| Guard probe | relative paths (`.\x`, `..\x`, `./x`) are refused on win32 because the trailing-dot rule matches the `.` and `..` components before resolution; every path under the user profile, including the package's own default demo output under `Downloads`, is refused; the website worktree is refused (intended); `C:\Users\Public\...` is accepted |

Receipts: `evidence/bridge-v0.2-tests-windows-node20-profile-temp.tap`, `evidence/bridge-v0.2-tests-windows-node20-public-temp.tap`, `evidence/bridge-v0.2-reviewer-run-receipt.json`, `evidence/bridge-v0.2-guard-probe-windows-node20.txt`.

## 4. Evidence classes

Immutable: manifests, diff reproduction, file reads at exact lines. Producer receipts verified: the Linux 129-pass TAP and
its bindings. Independently executed: the two Windows runs and the guard probe above. Narrative only: the producer's
statements about the pre-final fixture bytes (only a hash is shipped). NOT PROVEN: real Codex and Claude CLI event and
envelope formats for the installed versions; a non-Node coordinator producing byte-identical canonical JSON; Windows
junction and mount-point reporting through `lstat`, 8.3 and subst aliases through `realpathSync.native`; externally
killed children on Windows (reported as exit 1 with no signal, which still lands UNKNOWN by inspection); power-loss
durability (directory fsync is skipped on win32 by design).

## 5. Findings and limits (verifier-calibrated)

| ID | Sev | Finding | Smallest correction |
| --- | --- | --- | --- |
| **W-1** | **P2** (pilot gate on this host) | The `.xenios` ancestor heuristic refuses the entire user profile on this machine because of an unrelated profile-level `.xenios` credentials folder; `START_DEMO.ps1` writes under the package directory, so the shipped demo cannot run from `Downloads`; the README's "outside any `.xenios` tree" advice does not anticipate a profile-level marker. Fail-closed, so not a safety defect, but the pilot host is this machine. | Treat `.xenios` as a repository marker only when it carries the corpus signature (for example `MASTER_CORPUS.md` or `ACTIVE_TASKS.json`) or sits beside `.git`; or document that the state root, demo output and temp directory must be absolute paths outside the profile on this host and make `START_DEMO.ps1` take an explicit output root. Either way add a test. |
| **W-2** | **P2** (pilot gate) | `lib/paths.mjs:27` applies the trailing-dot rule to the `.` and `..` components, so every relative `--state`, `--out` or demo path is refused on Windows with "Ambiguous Windows path component". Direct evidence the win32 branch had never run before today. Fail-closed. | Exclude `.` and `..` from that rule or apply it after `path.resolve`; add win32-conditional tests for ADS, trailing dot or space, reserved device names and a junction ancestor. |
| **F1F2-01** | P2 | The CLI `permit` and `dispatch` commands (`bridge.mjs:62-72`) have no test; the realistic uncaught regression is dropping the `within` containment at `providers.mjs:29`, after which only the post-consume check at `:91` remains and a bad recipe would burn the signed authorization. | CLI-level tests: `init --trust`, `prepare`, `recipe`, `permit --authorization`, `dispatch` against the fake provider script, asserting escape and tamper refusals before consumption and a happy path with exactly three tombstones. |
| F-001 | P2 → largely closed today | Windows termination semantics were unexecuted. Today's run passed the timeout, overflow, abort, spawn-exception and real-runner-timeout tests natively, including the recorded `SIGTERM` on controller kill. Still open: the self-SIGTERM test (skipped by design) and an externally killed child. | Add a Windows-runnable external-kill test asserting UNKNOWN with the slot held; keep the skip for self-signal. |
| T-65 | P3 (test fragility) | The 250 ms expiry fixture fails on a slower filesystem for the right reason. | Widen the window (for example 2 s expiry, 2.5 s probe) or inject a clock. |
| F1-02 | P3 | A `transport.json` copied alone into an empty directory carries `stateId` without the tombstones; the docs' "cannot be reused by creating a new state directory" is true only for an init-provisioned store. Within the declared trust exclusion. | Reword `REVIEW_FIXES.md:11`; state that the directory including `authorization-use/` is the unit of backup; optionally pin a store-id marker O_EXCL at provisioning. |
| F1-03 | P3 | Canonical JSON for an external coordinator is under-specified (number and string formatting, UTF-16 key order). Fails closed. | Pin the form (RFC 8785 or an explicit subset) and ship one signed test vector with a test. |
| F1-04 | P3 | The trust pin lives only inside `transport.json`; re-validated for shape, not identity, on read. | O_EXCL trust marker at provisioning, checked on read. |
| F1-06 / F-004 | P3 | `RECONCILED_UNKNOWN` is terminal for that job ID while the return field and `LIVE_PILOT.md:41` imply a new authorization suffices. The verifier corrected the lens here: identical content under a new job ID gets a new digest and is re-permittable, so no new store is needed. | Rename the return field to "new job ID plus new authorization" and align the doc. |
| F-002 | P3 | A pre-spawn abort is classified UNKNOWN although the code intends `NOT_STARTED`; unreachable from the CLI. | Treat `!spawned && ABORTED` as `NOT_STARTED`; add a test. |
| F-003 | P3 | Only `error` and `turn.failed` count as Codex failure; other event types are ignored. | Allow-list known event types once the installed CLI is pinned. |
| F-005 | P3 | `e.receipt` is always null for refusals thrown before the receipt exists. | Attach a minimal pre-receipt to those errors. |
| F-006 | P3 | stdout and stderr share one 2 MiB stop budget. | Separate stderr retention or document the limit in the CLI compatibility evidence. |
| F-007 | P3 | Single `SIGTERM`, no escalation or process-tree kill; disclosed. | Operator runbook: check for surviving processes before `recover`. |
| F-008 | P3 | `acknowledgeStopped` accepts any ten-character string and does not consult the receipt before releasing the slot; dispatch's late-return writes do not re-check slot ownership. | Require the receipt path or pid in the evidence and probe pid liveness; guard the late mutations with `s.active?.job===id`. |
| F-009 | P3 | Two tests labelled R3 would also pass on v0.1 for an unrelated reason; the discriminating tests are elsewhere. | Doc precision only. |
| Hygiene | P3 | `createPublicKey` accepts a private-key PEM on `init --trust`; `validId` accepts prototype names such as `constructor`; unused imports; the reproduction tool executes v0.1 modules in place (writes only to a temp dir). | Refuse `PRIVATE KEY` PEMs; use null-prototype maps; remove dead code. |

Refuted by the verifier: TOOL-07 (no "temp copies" wording exists in the package; the docs are accurate).

## 6. Pilot prerequisites unchanged by this review

Real coordinator issuer behind the signature; installed CLI version and envelope compatibility evidence for both
providers; a coordinator execution reservation; Windows validation of junctions, nlink and rename semantics beyond
today's run. A schema-valid provider result remains text: not an accepted task, an owner decision, qualification or
release authority.

## 7. Smallest next step

Fix W-1 and W-2 (both small, both fail-closed today), widen the T-65 fixture, add the CLI-level permit and dispatch
tests, then re-run the suite on this host under the pinned Node 20 with an absolute state root. After that, the
synthetic live pilot still waits on the coordinator issuer and CLI compatibility evidence, which are outside this
package.
