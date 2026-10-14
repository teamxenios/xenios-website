# Two-arm PerfOS diagnostic source, disposition

**CORRECTION REQUIRED: two small changes before any admission. Everything else is compatible.** Core commit
`3121696e` (tree `1982b0c0`, parent `cc7b6756`) implements the Doc 134 question cleanly:
- one accepted query per arm;
- the exact failure fields Doc 134 asked for, with no memory values;
- retained handles, capped capture and strict timing;
- a quote-free native command.

Two design points would let the one-shot run fail to answer its own question:

1. **Arm order.** The rebuilt arm always runs first. Formatted performance-counter queries are slow on first
   access, and this host's 1 s variant timed out once (Doc 120). So "rebuilt fails, ordinary succeeds" could be
   warm-up, not environment. The contract itself lists that confounding. Run the ordinary arm first.
2. **Non-CIM failures are discarded.** If the query throws anything other than a CIM exception, the child exits 1.
   The collector then refuses without emitting the child's record, and the second arm never runs. The exception
   type, which is the information wanted, is lost. Classify any exception from the one query statement as
   `QUERY_FAILED` with its type.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; nothing
parsed, run or queried. Root had not registered this commit when I reviewed it, so I bound the Core blobs
directly. Archive: `hl12/138_two_arm_perfos_diagnostic_source.json`.

## 1. Bytes

| File | Bytes | SHA-256 |
|---|---|---|
| `collect-two-arm-perfos.ps1` | 15,798 | `00d01769…` |
| `query-perfos-arm.ps1` | 5,003 | `1820f1e2…` |
| `ACTION_CONTRACT.json` | 13,394 | `36e9817e…` |
| `SOURCE_HANDOFF.json` | 13,888 | `baaefd78…` |
| `RAW_BYTE_INDEX.json` | 3,090 | `1783a84f…` |

The contract's source pins match both scripts.

## 2. What is compatible

- **Child.**
  - It binds its arm (`rebuilt` or `ordinary`), the 64-hex ticket hash, its own path and the pinned pwsh.
  - It runs exactly `Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -OperationTimeoutSec 2`, counting rows
    without reading any property.
  - It times the query alone, and on a CIM exception records only these fields: type, `NativeErrorCode` as number
    and name, `MessageId`, and the CIM error data's `CIMStatusCode` and `MessageID`. All are allowlisted and
    shape-checked.
  - It never walks inner exceptions or serializes error data. Its output is one JSON line of at most 4 KiB, under
    a 10 s child deadline.
- **Collector binding.**
  - The ticket path and hash, mode, owner, reservation, output and three reference fields.
  - A window of at most 20 minutes, with `lastStart = ends − 20 s` and the native prelaunch anchor inside it.
  - The contract hash, source paths and exact bounds: 20 s whole, 10 s per arm, 2 s provider timeout, 4 KiB per
    record and 16 KiB total, 32 rows, one attempt per arm, no retries, no stops.
  - Rehashes of itself, the child and pwsh before each arm and at the end. A fresh output directory with a
    reparse-free ancestor.
- **Arms.**
  - Rebuilt: the cleared environment with exactly the post-change table, including both opt-outs. That is the
    environment Doc 135 asked this lane to use.
  - Ordinary: inherits the operator's environment unread, with only the two opt-outs set.
  - Each arm gets a retained handle, a live identity check with the pinned executable, 512-byte asynchronous reads
    to EOF under a 4 KiB combined cap, a handle-based exit and lifetime under 10 s, exit 0 with empty stderr, and
    exactly one record checked against a closed key set.
- **Pair record.** It says it is not a test pass and gives no G0 credit. Any refusal emits an incomplete summary
  with the current process record. There are no stops and no retries.
- **Native command.** `set POWERSHELL_TELEMETRY_OPTOUT=1&& set DOTNET_CLI_TELEMETRY_OPTOUT=1&& <pinned pwsh> -NoProfile -File <collector> -AdmissionSha256 ACTUAL_ADMISSION_SHA256 -NativeLaunchUtc ACTUAL_PRELAUNCH_UTC`.
  It has no quotes and no space before either `&&`, so it meets Docs 136 and 137. The uppercase placeholders fail
  the collector's own input check rather than acting as redirections. The output limit of 18,000 tokens fits a
  16 KiB record set.

## 3. Required corrections

1. **Ordinary arm first.**
   - **Change.** Collector line 100 becomes `@('ordinary','rebuilt')`, and the line 92 check becomes
     `'ordinary|rebuilt'`. The contract's `arms` order and `futureAdmission.arms` change to match.
   - **Why.** The first formatted-counter read may pay a warm-up cost the second does not. With ordinary first,
     the decisive outcome "ordinary succeeds, rebuilt fails" can no longer be explained by warm-up. The outcome
     "ordinary fails, rebuilt succeeds" then points to warm-up or a transient state. No query is added.
2. **Keep non-CIM query failures.**
   - **Change.** Child line 66, `else{$cRecord.failure='NON_CIM_QUERY_EXCEPTION'}`, becomes
     `else{$cRecord.status='QUERY_FAILED';$cRecord.failure=$null;$cExit=0}`.
   - **Why it is safe.** The inner `try` holds only the query pipeline and the row counter, and the row cap has its
     own flag, so any other caught exception belongs to the query. The exception type is already shape-checked.
     The collector accepts `QUERY_FAILED` with null CIM fields.
   - **Without it.** A timeout or wrapper exception, such as one from the CIM job layer, would abort the pair at
     `CHILD_EXIT_OR_STDERR_PROTOCOL`. The child's record would be discarded and the second arm would not run.
   - **Alternative.** The collector could instead embed the child's capped stdout in its incomplete summary. The
     child-side change is smaller.

Proving check for both: a narrow byte confirmation that the revised files differ from these blobs only by those
lines.

## 4. Fidelity limits to record, not corrections

- The rebuilt arm starts pwsh directly. In R3 the supervisor ran under CMD, which passes its environment through
  but adds its own internal drive entries.
- In R3 the PerfOS query was the second CIM call in its process, after `Win32_OperatingSystem`. In each arm it is
  the first.
- The rebuilt arm's home and temp point at the diagnostic's own scratch directory.

None of these plausibly decides the outcome. If both arms succeed, these differences and a transient host state at
03:56 all remain possible explanations of R3.

## 5. Interpretation with the corrected order

| Ordinary | Rebuilt | Reading |
|---|---|---|
| fails | fails, same code | Host or provider state; the environment is not implicated |
| succeeds | fails | The environment is implicated, not warm-up; a narrow environment proposal follows |
| fails | succeeds | Warm-up or transient state; R3 most likely hit the same thing |
| succeeds | succeeds | Not reproduced; transient or warm-up at 03:56; a fresh admission of the unchanged accepted sources is reasonable |

In every case the record gives the exception type, codes and elapsed time, not a proof of cause.

## 6. Remaining

1. The two corrections, frozen, then my narrow byte confirmation.
2. Root's admission: ticket at the fixed path with the contract hash, the corrected arm order, the three
   references, exclusive reservation, finite window, the substituted native command, and an absent output
   directory.
3. Still not covered: the executor process's opt-out does not apply here, because the collector is the topmost
   pwsh and its opt-out comes from the native prefix.

Not execution consent, not a G0 result, not a counter or release credit.
