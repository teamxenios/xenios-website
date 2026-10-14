# Revision 22 B: counter-read synthetic proving fixture, source disposition

**SOURCE-COMPATIBLE. No required correction.** `counter-synthetic-case.ps1` (7,237 B `c43d4b22…`, Core `adce58de`)
pins the final parent by hash before anything else, embeds the parent's exact 28-line counter slice (final parent
lines 62–89 equal fixture lines 56–83; one occurrence in each; sha256 of the 28 lines with trailing newline
`58cf74d1…`, as Root states), shadows `Get-CimInstance` with a script function that records every call, demands
exactly two calls in the exact order and shapes the slice makes (first `Win32_OperatingSystem` with timeout 1, second
`Win32_PerfFormattedData_PerfOS_Memory` with timeout 2), drives fifteen finite cases through the untouched slice, and
reports each outcome with a precise contract: an expected refusal exits 1 with the exact token on stderr and nothing on
stdout; an unexpected result, including a wrong refusal or a wrong call count, exits 2 with
`SYNTHETIC_EXPECTATION_MISMATCH`; the two valid cases exit 0 with one JSON line asserting the three expected MiB values,
four finite non-negative timing fields, two calls, `ramMeasured:false` and `releaseCredit:false`. It performs no real
CIM query, no RAM measurement, no file write, no process spawn and no clock or age manipulation; the parent-age
branches run on the fixture process's own real age and are not exercised, exactly as doc 123 §4 said. The fixture does
not admit itself.

Reviewer: this session, `claude-fable-5-1`, revision 22 item B. Read-only; nothing parsed or executed. Archive:
`hl12/125_counter_synthetic_proving_source.json`.

## 1. The shadow and the slice

Lines 27–52 define `Get-CimInstance` as a function, which PowerShell resolves ahead of the cmdlet for calls in this
script. It takes `ClassName` positionally and `OperationTimeoutSec` by name, so the slice's two calls bind unchanged.
Call 1 must be the OS class at one second (`SYNTHETIC_OS_CALL_MISMATCH` otherwise) and returns an object whose
`FreePhysicalMemory` is 511·1024 KiB for `low-os`, 512·1024 for `valid-floor`, else 1024·1024. Call 2 must be the
counter class at two seconds (`SYNTHETIC_COUNTER_CALL_MISMATCH` otherwise) and returns, per case: nothing (`zero-rows`),
two rows (`two-rows`), a row without `CommitLimit`, a null `AvailableBytes`, `-1`, `NaN`, `+Infinity` for
`CommitLimit`, a valid row after a 2,000 ms sleep (`late-read`), a throw (`counter-throws`), or a valid row with
`AvailableBytes` 511 MiB, `CommittedBytes` 1,537 MiB (headroom 511), `CommittedBytes` 2,049 MiB (headroom −1),
exactly 512/512/512 (`valid-floor`) or the default 1,024/1,024/1,024 (`valid-fast`). The slice at lines 56–83 is the
parent's text with no edit, run inside one `try` whose `catch` keeps only a token-shaped message or
`UNEXPECTED_SYNTHETIC_ERROR`.

## 2. Expected branches, traced

- `zero-rows`, `two-rows`: row count ≠ 1 → `MEMORY_COUNTER_READING_UNKNOWN`.
- `missing-commit-limit`, `null-available`: `PSObject.Properties` lookup null or null value → same token.
- `negative-available`, `nan-available`, `infinite-limit`: finite/non-negative check → same token.
- `late-read`: read elapsed ≥ 2,000 ms → `MEMORY_COUNTER_READ_LATE`.
- `counter-throws`: the throw propagates through the `@(…)` wrapper to the slice's catch → token
  `SYNTHETIC_COUNTER_THROW` → exit 1; this proves propagation, not the real CIM timeout text, which is not
  token-shaped and would surface as `UNEXPECTED_SYNTHETIC_ERROR`.
- `low-os`, `low-available`, `low-commit`, `negative-headroom`: pass the shape checks (the raw fields are
  non-negative) and fail the unchanged floor line → `RESOURCE_FLOOR`.
- `valid-floor`: exactly 512 in all three derived values, not below the floor → continues; `valid-fast`: 1,024.
- All fifteen cases make exactly two calls; the second call is recorded before any throw, so the call-count check
  holds for `counter-throws` too.
- Output discipline: no statement in the fixture emits to stdout before line 102 (`List.Add`, `OrderedDictionary.Remove`
  and `Thread.Sleep` return nothing), so negative cases leave stdout empty; the valid line is a single compact JSON
  object containing only the case name, counts, booleans and the resource record (which holds a timestamp, MiB numbers
  and timing numbers, nothing private).
- Strict mode: hashtable lookups of null-valued keys and `$fResource[$name]` do not throw; a `$null -cne $null`
  comparison is false, so valid cases pass the expectation check.

## 3. Points for the outer supervisor (requirements, not fixture corrections)

- The fixture writes stderr with `Console.Error.WriteLine`, which emits `CRLF` on Windows; the requirements file
  lists expected stderr as the token plus `\n`. The supervisor must compare after trimming trailing CR/LF, as the
  controls parent already does for its own marker, or every negative case would mismatch.
- A parent-pin failure before the `try` (line 8) exits 1 with a full PowerShell error record on stderr, not a bare
  token; the supervisor must treat anything other than the exact expected token as failure, which the exit-code and
  stderr contract already implies.
- The fixture pins the parent but cannot pin itself; the supervisor must pin the fixture bytes (`c43d4b22…`) and the
  parent (`fc6ea41b…`) before and after, and should re-derive the slice containment textually (parent `Contains`
  fixture lines 56–83) as the controls parent does for the R3 slices.
- Budget: each child is a fresh pwsh start plus the case; `late-read` adds 2,000 ms. Fifteen sequential children at
  roughly one to three seconds each do not fit a 30-second aggregate with margin; the supervisor's own work and
  aggregate ceilings must be sized for fifteen cases, with each child still strictly under 5,000 ms.
- Optional robustness, not required: `late-read` sleeps exactly 2,000 ms and the slice refuses at `≥ 2000`; the
  Windows wait never completes early against the interrupt clock, but a margin such as 2,050 ms would remove any
  dependence on clock agreement under a one-attempt, no-retry regime.

## 4. What the proving does and does not establish

Once run under its own finite ticket with a pinned sequential supervisor, exit codes and streams captured, every child
under 5 s, outer clock, post pins and independent closure, the fifteen results prove that the exact counter slice
refuses empty, multiple, missing, null, negative and non-finite readings, refuses a late return, propagates a throw,
applies the three floors including a negative headroom, accepts the exact floor, and records the four timing fields.
They do not measure RAM, do not show that a real two-second counter read succeeds on this host, do not exercise the
parent-age branches (read-verified in doc 123), are not finalization controls, not the Git diff census, not browser
behaviour and not release readiness. No execution follows from this disposition.
