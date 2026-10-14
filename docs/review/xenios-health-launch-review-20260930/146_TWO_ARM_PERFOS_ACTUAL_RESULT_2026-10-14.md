# Two-arm PerfOS diagnostic: actual result disposition

**EVIDENCE ACCEPTED as a complete two-arm diagnostic. Both arms failed the same way, so the environment is not
implicated.**
- The single call ran inside its window, sampled as the clock exception required, and returned complete evidence.
- Both arms hit the identical MI failure at about 2.16 s, just past the 2 s provider timeout: `Failed`, CIM status
  1. That happened first in the operator's ordinary environment and then in the rebuilt one.
- Unbounded reads of the same class have succeeded in many earlier actual runs on this host.
- The blocking predicate is therefore the bounded memory-counter read in the G0 admission slice, not the
  application and not the rebuilt environment.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only. Archive:
`hl12/146_two_arm_perfos_actual_result.json`.

## 1. Binding

- **Receipt.** Core commit `5ee7f88f` (tree `4af23779`, parent `bb3f8e62`) adds only the receipt
  `DOC146_TWO_ARM_PERFOS_ACTUAL_NATIVE_RECEIPT_20261014.json` (15,967 B, `4e2f1d15…`) plus continuity. Root's archive
  `RECEIPT.json` is byte-identical. The verbatim native output `NATIVE_OUTPUT.jsonl` (3,195 B, `4b355298…`) holds the
  three records the receipt parses.
- **Unchanged inputs.** The diagnostic namespace is unchanged since `0bc62fe7`, and the application is unchanged.
- **Authority chain.** Samuel's full approval `a2890065`, my Doc 145, Root's admission ticket `006cd807`, slot
  `f9ab2fc8` and frozen command `d511ca13`, then Core's ticket-bound FINAL READY. The window was
  13:28:48–13:48:48Z with last start 13:48:28Z.

## 2. Completeness against Doc 140

| Requirement | Observed |
|---|---|
| Native exit 0, no session, untruncated | chunk `31d34f`, exit 0, no session, 799 tokens against an 18,000 limit, all three records present |
| Two arm captures in order | ordinary, then rebuilt; each with a retained-handle identity on the pinned pwsh, handle exit 0, lifetime 2,572 ms and 2,583 ms, both EOF flags, stream hashes and a closed-key record |
| Pair summary | 2 attempted, 2 complete, driver PID 34924, no retries or stops, reservation not released |
| Per-arm status | `QUERY_FAILED`, one query, `CimException`, native code 1 `Failed`, CIM status 1 |
| Timing kept distinct | external UTC 6,014 ms; native wall 5,809 ms; driver conservative 5,926.6 ms; query stopwatches 2,170.0 ms and 2,160.6 ms; external monotonic null |
| Arm launch inside budget | 609 ms and 3,301 ms after the anchor, both under 10 s |
| Inputs and output | all four pins unchanged at 13:39:41Z; output absent before the call at 13:35:56Z |

**Complete.** One limitation: `metadataRejected` is true in both records. The two message IDs existed but failed
the shape check, so they are null. The codes that matter were recorded. This is not blocking.

## 3. Timestamp sampling

The receipt discloses the method: `new Date().toISOString()` in the same orchestration step immediately before the
native call. Only a pure in-memory window guard and the single substitution came between the sample and the call:
no I/O, offset, model turn or helper. An in-memory comparison is not one of the actions the exception forbids, and
it only adds a refusal path.

The figures are consistent with immediate sampling:
- anchor 13:39:12.975Z;
- driver process created 13:39:13.0234587Z, 48.5 ms later;
- native wall time 205 ms shorter than the external UTC span, which is the tool's own overhead.

**Accepted as sufficient for this diagnostic.** As Doc 143 noted, the order of sample and call rests on the
disclosed method and this consistency, not on independent proof. Collector acceptance alone would not show it.

## 4. Supported interpretation

- **The environment is not implicated.** Both arms failed with identical codes and nearly identical times, which is
  the first row of the Doc 138 table. The second arm, rebuilt, also failed at the same time, so a first-access
  warm-up did not rescue it within about 3 s.
- **The failure coincides with the timeout.** Both failures land about 160 ms after the 2 s provider timeout. The
  record across this host:

| Read | Result |
|---|---|
| No timeout: Doc 118 diagnostic parent and many accepted runners (static CLI, affected-mode, browser R2) | succeeded |
| 1 s timeout (Doc 120) | `Timed out` |
| 2 s timeout (R3 and both arms here) | generic `Failed` at about 2.16 s |

  Most likely, this query takes longer than 2 s here, and the expiry surfaces as a generic failure. That is an
  inference, strongly supported but not proven: no message ID was retained and no duration of a successful read is
  on record.
- **Not credit.** No memory was measured. This gives no G0, counter, browser, customer or release credit, and no
  proof of cause.

## 5. Known-process closure

- The two arm processes, 57700 and 57048, have handle-recorded exit 0 within their lifetimes. Each runs only one
  CIM query and starts no process.
- The driver, 34924, ended with the native call's exit 0, no session left, after 5,809 ms.
- No cleanup was done and no stop was needed.

This is a sufficient factual basis for Root's reservation decision. The residuals: the driver's exit comes from the
native transport only, and WMI provider-host activity is not owned by this run.

## 6. The blocking predicate and the smallest correction

**Predicate.** The accepted G0 admission slice requires `@(Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
-OperationTimeoutSec 2)` to return exactly one row with a read time under 2,000 ms. That is supervisor lines
148–152, the same slice the counter parent and fixture carry. On this host it fails, and it would refuse at G0
before any case in all of these:
- counter proving;
- scheme proving, through the same supervisor;
- the finalization controls.

The release diff-check runner's own G0 uses the same class with a 1 s timeout (`execute-admitted-exact-diff-check-r3.ps1`
line 200), so it would fail the same way. Runners that read the class without a timeout are not affected.

**Correction A, recommended.** Take the admission figures from `Win32_OperatingSystem` alone, which the slice
already reads at line 139. R3 showed that read completing within its 1 s bound under the rebuilt environment.
- **Available memory.** In three successful runs, `FreePhysicalMemory` tracked the counter's `AvailableBytes` within
  15–63 MiB, in either direction. So it is the same quantity sampled at a different instant, and the counter reading
  is a second sample rather than an independent safeguard. Keep the 512 MiB floor on it.
- **Commit headroom.** Use `FreeVirtualMemory`, documented as unused available virtual memory, that is, commit limit
  minus commit charge, with the 512 MiB floor. That equivalence comes from documentation and is not yet observed on
  this host.

This removes the failing read instead of guessing a duration.

**Correction B.** Keep the class with a longer bound. Unbounded reads do succeed, but no duration is recorded, so
any bound would be unproven. It also changes the 2,000 ms late check, the 30 s fence arithmetic and the fixture's
timeout expectations.

**Scope of either correction.** Either one is a source change to the accepted slice and needs a narrow re-review
and re-pin of:
- the counter parent;
- the fixture's expectations, with refusal cases rebased on the new fields;
- the supervisor slice;
- the manifest;
- the diff-check runner's G0.

**Proving check for A.** One bounded `Win32_OperatingSystem` read under the rebuilt environment returns exactly one
row. `FreePhysicalMemory`, `FreeVirtualMemory` and `TotalVirtualMemorySize` are finite and non-negative, free virtual
memory is no larger than the total, and the read finishes within 1 s. The rebased fixture refusal cases supply the
negative side.

The choice and the proposal are Core's. Nothing here authorizes it.

## 7. Next

1. Root's reservation decision, which may rest on section 5.
2. Core's smallest G0-slice correction proposal, A or B, including the diff-check runner. Then narrow review, its
   proving check, and fresh counter admission.
3. The rest of the release path is unchanged: scheme, controls, diff check, browser journey, manifest, security,
   release, deployment and served identity.
