# Revision 21: controls G0 counter-read failure (evidence) and the unapplied two-second counter-read proposal (source)

**Failure record: ACCEPTED as preserved evidence of a G0 refusal with zero controls run.** The corrected `6cf8…`
ticket was invoked once; the 60f parent (PID 51472, pinned pwsh) lived 1,981.6 ms and exited 1 because the
one-second `Win32_PerfFormattedData_PerfOS_Memory` read at parent line 64 timed out; no output directory, parent
receipt, child, case or identity loop existed; the nine pins and the ticket were unchanged afterwards; the parent, its
`cmd.exe` ancestor and the outer observer were absent at 23:49:18.5Z with zero stops. The record correctly draws no
memory conclusion from a timeout, aggregates nothing from the earlier R1/R2 failures, and treats the ticket as
consumed.

**Proposal: SOURCE-COMPATIBLE with retained limits. No correction required.** The patch (3,431 B `4ded07e4…`, Core
`78b591e2`, tree `06534954`) has one hunk whose five-line preimage occurs exactly once in the accepted 60f parent
(17,188 B `31674d82…`) at lines 62–66; textual application yields 19,074 B `e605b2dc…`, the projection named in
`BYTE_PROOF.json`, with prefix and suffix unchanged. It changes only the memory-counter read: the same single
`Get-CimInstance` call with `-OperationTimeoutSec 2` instead of 1, fenced by cooperative checks that require strictly
more than two seconds of the real 30-second envelope to remain before the query, refuse a read that returns at or
after two seconds or after the envelope, refuse an empty, multiple, null, missing, non-finite or negative reading,
keep the three 512 MiB comparisons byte-identical, record four bounded numeric timing fields in the existing resource
record, and re-check the envelope after validation. The `Win32_OperatingSystem` read stays at one second. No retry,
warm-up, fallback, second query, API, native code, import, loop or stop authority is added. The projection
deliberately keeps the 60f namespace and `attempt-identity-r1` literals and is not an executable successor.

Reviewer: this session, `claude-fable-5-1`, revision 21. Read-only; the projection was computed as text, not
parsed or executed; no resource probe. Docs 117–122 closed; application `8e85daa`/`25507c2f` and tooling
`3dd3d96`/`7a4ce7c3` unchanged. Archive: `hl12/123_controls_g0_failure_and_counter_read_proposal.json`.

**Where the bytes are.** Failure: Core `0425d550` (tree `381c8fe7`), `finalization-controls-doc118-g0-failure/`;
Root `DOC118_CONTROLS_G0_FAILURE_ACTUAL_RAW_20261013/`, 16 files, each byte-identical to the Core blob its
`ROOT_RAW_INDEX.json` names: `ACTUAL_RESULT.json` 6,307 B `ef08e3fc…`, `INDEPENDENT_CLOSURE.json` `e7b59298…`,
`OUTER_OBSERVATION.json` `bd1c7210…`, `PRE_INVOCATION_BINDING.json` `56f3d1e8…`, `TOOL_EXECUTION_RECORD.json`
`4036e984…`, `raw/ADMISSION.json` 14,334 B `6cf810d0…`, and the nine `raw/source` inputs, which equal the doc 118
bytes (parent `31674d82…`, fixtures `1661a218…` / `f3e8af53…` / `2663618f…`, slices `7c685cef…` / `9587eb57…`,
pins `dd690c5b…`, R3 parent `b98f7a25…`). Proposal: Core `78b591e2`,
`finalization-controls-counter-source-proposal/` is not yet a namespace; the proposal lives under
`DOC122_REVISION21_COUNTER_SOURCE_REVIEW_READY_20261013/`: `EXACT_DIFF.patch`, `BYTE_PROOF.json` 954 B,
`ASSESSMENT.json` 4,711 B, `PROPOSAL.json` 6,144 B, all byte-identical to the Core blobs.

## 1. The failure, as the bytes show it

- Ticket `6cf8…`: mode `doc114-finalization-controls`, Core owner, output `attempt-identity-r1`, pins hash
  `dd690c5b…`, nine frozen inputs (eight rows plus the pin file), bounds 20,000 / 10,000 / 30,000 / 5,000 ms, 512 MiB,
  16,384 B, one attempt, zero retries, zero stops, window 23:42:44.602Z–23:57:44.602Z with `lastStart = ends − 45 s`,
  UTF-8 without BOM, exclusive slot. Pre-invocation binding at 23:48:26.57Z: nine inputs matched, output absent,
  parent not yet invoked.
- Parent: created 23:48:51.9054363Z (CIM 23:48:51.905436Z), exit 1 at 23:48:53.8870548Z, lifetime 1,981.6 ms,
  observed externally (PID 35780) with the `cmd.exe` ancestor 52764. Failure at line 64 of the 60f parent, phase
  "G0 before output creation and control children"; `completeCapacityReading` null; `minimumFloorSatisfied` null;
  cases 0, children 0, output not created, receipt not created, identity loop not executed. The tool transcript is
  labelled as tool-returned text, not raw OS stderr.
- Closure 23:49:18.24–18.52Z (observer PID 41944): PIDs 51472, 52764, 35780 absent; output absent; all nine post pins
  matched; ticket unchanged; zero stops; no memory read. The narrow scope is adequate here because no child was ever
  spawned: the output directory that precedes every spawn was never created.
- Prior runs are correctly kept separate: the 1077 metadata rejection preceded any invocation; R1 (`42eb…`) failed at
  the same G0 read with zero cases; R2 (`49ca…`) proved one case and failed the second child's identity. Nothing is
  aggregated.
- Interpretation I agree with: the timeout says nothing about available RAM. The accepted R3 static parents and the
  diagnostic parent read the same counter class without an operation timeout and succeeded (docs 111, 113, 120), so
  the counter is readable on this host; the one-second bound was the failing element.

## 2. The hunk, as read

Lines 62–89 of the projection. The OS query (line 63) is unchanged at one second. A monotonic Stopwatch starts (66),
then the parent's own age is sampled once from `Process.StartTime` (67) and rejected if NaN, infinite or negative
(`COUNTER_PARENT_AGE_UNKNOWN`). Before the query, `age + elapsed + 2000 ≥ 30000` refuses
(`COUNTER_OUTER_BUDGET_UNAVAILABLE`), so exactly 2,000 ms remaining refuses and strictly more may proceed. One
`Get-CimInstance` with a two-second operation timeout (72); a thrown timeout terminates under the unchanged
`$ErrorActionPreference='Stop'` before any output exists, exactly as the actual failure did. After the call, read
elapsed ≥ 2,000 ms or envelope ≥ 30,000 ms refuses even on a successful return (`MEMORY_COUNTER_READ_LATE`). Row count
must be exactly one (76). Each of `AvailableBytes`, `CommitLimit`, `CommittedBytes` is looked up through
`PSObject.Properties`, which yields null rather than a strict-mode error when absent; null, non-finite or negative
values refuse (`MEMORY_COUNTER_READING_UNKNOWN`), and a failed `[double]` conversion terminates rather than being
swallowed. The resource record keeps its original keys and values and gains `counterOperationTimeoutSec: 2`,
`counterReadMs`, `counterBeforeOuterMs`, `counterAfterOuterMs`, all numbers (84). The three derived MiB values are
rejected if non-finite (85–87); a negative commit headroom falls below 512 and is refused by the unchanged floor line
(88). A final envelope check follows validation (89). Then the unchanged `LAST_START_EXPIRED`, output creation and
`$fClock` start. The suffix references neither `$fMem` nor `$fOs` again, so no later line depends on the changed shape.

## 3. Budget semantics, stated plainly

The new fence protects only the counter read: it guarantees the query cannot start with less than two seconds of the
real envelope left and cannot be credited if it returns late. It does not reserve 20 s of work and 10 s of
finalization after G0. Those remain ceilings measured by `$fClock`, which starts after G0; a run that used both fully
after a non-zero startup would exceed 30 s of real life and must be rejected by the independent OS creation-to-exit
lifetime, not by the parent's own exit code or `PRELIMINARY` receipt. The `ASSESSMENT.json` says exactly this and I
agree. Consequence for the acceptance predicate: a future controls result counts only if the external observer's
parent lifetime is below 30,000 ms, the parent exited 0, all three children exited 1 with their exact evidence, post
pins matched and the independent closure holds. A parent exit 0 with a lifetime at or above 30,000 ms is a failure.
Optional, not required: the same age-plus-Stopwatch test could be added to the parent's final exit line so the
parent's self-report agrees with the external gate; it would be a separate one-condition hunk and is not part of this
proposal.

## 4. Minimum meaningful synthetic boundary proving (separately authorized test scope)

Shadowing `Get-CimInstance` with a fixture-defined function is enough to drive every value-shape branch of the exact
slice without altering it: (a) zero rows, (b) two rows, (c) a row missing `CommitLimit`, (d) a null `AvailableBytes`,
(e) a negative or NaN value, each ending in `MEMORY_COUNTER_READING_UNKNOWN`; (f) a function that sleeps 2,000 ms and
then returns a valid row, ending in `MEMORY_COUNTER_READ_LATE`; (g) a function that throws, ending in a terminating
error with exit 1 and no later output; (h) a valid fast row with one value below 512 MiB, ending in `RESOURCE_FLOOR`;
(i) a valid fast row at or above the floors, continuing past line 89 with the four numeric fields present in the
record. The first call in each fixture must answer the `Win32_OperatingSystem` shape. The parent-age branches
(`COUNTER_PARENT_AGE_UNKNOWN`, `COUNTER_OUTER_BUDGET_UNAVAILABLE`, `COUNTER_OUTER_BUDGET_EXPIRED`) read the real
process start time and cannot be driven synthetically without changing the slice; they can be exercised only by a
dedicated fixture that sleeps until its own age reaches about 28 s before running the slice, which does not fit the
5-second child regime and would need its own bounded parent and ticket. Their arithmetic is verified by reading. None
of these fixtures is a controls run, a RAM measurement or a reliability claim.

## 5. Mechanically necessary binding before any applied successor

A new frozen namespace holding the patched parent with its `$fRoot` and `$fOut` literals changed (fresh attempt
name), the three fixtures with only their two output literals changed to that name, byte-identical copies of the two
R3 slices, and an eight-row pin file whose R3 and pwsh rows are unchanged and whose six relocated rows carry the new
hashes; a new finite ticket with the new pin-file hash, the new output, unchanged bounds, nine frozen inputs, a real
issuance window, and an explicit statement that the counter sub-operation uses a two-second timeout; the applicable
human-scope check; a fresh positive 512 MiB reading in the admitted run itself; an exclusive slot; an external
observer recording parent creation, exit and lifetime; and an independent closure of the parent, its ancestor, the
observer and any children. The projection `e605b2dc…` is not that file. The final successor bytes need my narrow
confirmation (this hunk plus the literal changes and nothing else) before a ticket. All consumed tickets stay
consumed. Source compatibility is not runtime permission, and no floor or governor is waived.
