# Counter R3: actual G0 provider failure, evidence and source disposition

**The launch boundary is now proven at runtime. The G0 failure has an unknown host or provider cause, and no
source defect is established.** R3 shows the Doc 132 correction working: CMD started the real supervisor as its
direct child, the caller found it uniquely and bound it, and the observer started while it was alive. Every process
was captured and its exit recorded as designed. The supervisor then failed at its first memory-counter query, line
148, with WMI's generic failure, before any floor check, attempt directory or fixture child. The evidence does not
show low memory, a timeout or a defect in the accepted query. It does show that this was the first read of that
class in the lineage made under the caller's rebuilt environment. One bounded two-way question can separate the
environment from the host.

Separately, the rebuilt environment lacks the PowerShell telemetry opt-out, so each pwsh start may contact
Microsoft. That conflicts with the stated network isolation and has a one-key fix.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only; no query,
process or provider action. Archive: `hl12/134_r3_g0_provider_failure_evidence.json`.

## 1. Bytes

Core commit `78ab1418` (tree `b425c3c2`, parent `1a63b45e`) holds the R3 archive. All 21 files in it are
byte-identical to Root's `DOC132_R3_ACTUAL_IMMUTABLE_20261014/` mirror. Those are the outcome, preflight, native
result, post pins, the consumed ticket `5bddf2a1…` (12,820 B), and the 16 raw files.

## 2. What runtime proved

| Process | PID | Created (UTC) | Exit | Lifetime | Recorded by |
|---|---|---|---|---|---|
| Executor | not recorded | 03:56:00.8 approx. | 1 | 4.79 s, native tool | native transport |
| Caller | 54484 | 03:56:01.3983 | 1 | 4,133 ms | executor's retained handle |
| CMD | 33360 | 03:56:02.1293 | 1 | 3,176 ms | caller's retained handle |
| Supervisor | 44076 | 03:56:02.1632 | 1 | 3,130 ms | caller's handle and the observer's handle, both 05.2930892Z |
| Observer | 45272 | 03:56:02.4761 | 1 | 2,891 ms | caller's retained handle |

- **The Doc 132 correction works at runtime.** CMD, started from `C:\Windows\System32\cmd.exe`, ran the
  supervisor as its direct child. The caller's discovery found exactly that one supervisor. The observer bound the
  same process with handle and CIM creation 0.0007 ms apart and the correct CMD ancestor. The observer was created
  after the supervisor and before its exit.
- **Capture worked as designed.** CMD and observer streams were read to EOF. The supervisor's stderr arrived
  through CMD, which is not direct capture, and the record says so. Both observer rows bind the supervisor's
  identity and actual exit. The caller then refused with `ACTUAL_PROCESS_EXIT_FAILURE`, so no gate and no closure
  ran, and the executor refused in turn. That is the correct conjunctive behaviour.
- **No proof beyond the launch boundary.** No G0 reading completed, no case ran, and nothing earns counter,
  scheme, browser or release credit.

## 3. The G0 failure

The 693-byte CMD stderr is PowerShell's rendered error record for an uncaught error at supervisor line 148:

```text
$fMemRows=@(Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -OperationTimeoutSec 2)
A general error occurred that is not covered by a more specific error code.
```

- **Expected shape.** The supervisor's pre-admission section, lines 137–168, runs before the attempt directory
  exists, so a failure there exits 1 without a receipt. The rendered record is the only detail, and that matches
  Doc 128.
- **What it is.** The message is the generic MI failure. The exception type, native error code, CIM error data and
  call duration were not captured. The earlier `Win32_OperatingSystem` read on line 139 succeeded, but its value
  was not retained.
- **What it is not.**
  - Not low memory: no floor comparison ran.
  - Not `RESOURCE_FLOOR`, and not the supervisor's own late check, which sits on line 151 after the call.
  - Probably not the provider timeout. When the 1 s variant of this query timed out on this host in Doc 120, it
    reported `Timed out`. This message is different. The call's duration was not recorded, so a timeout cannot be
    fully excluded.

## 4. Is there a defect in the accepted query or environment contract?

No defect is established. What the record shows:

1. **The class works on this host.** The Doc 118 diagnostic parent read `Win32_PerfFormattedData_PerfOS_Memory`
   successfully: available memory 2,070.6 MiB, commit headroom 6,807.5 MiB. It ran in its own normal environment,
   with no timeout argument.
2. **The 1 s variant timed out once.** That was Doc 120, also in a normal environment, as far as the record shows.
3. **R3 is the first read under the rebuilt environment.** The supervisor inherits the caller's environment
   through CMD: `SYSTEMROOT`, `WINDIR`, `COMSPEC`, `PATH`, `HOME`, `USERPROFILE`, `TEMP` and `TMP` pointing at the
   private output, plus the .NET telemetry opt-out. Variables a normal process has are absent, such as
   `SystemDrive`, `ProgramData`, `ALLUSERSPROFILE`, `APPDATA`, `LOCALAPPDATA`, `COMPUTERNAME`, `USERNAME`,
   `PROCESSOR_ARCHITECTURE` and `NUMBER_OF_PROCESSORS`.
4. **WMI itself works under that environment.** The same supervisor completed `Win32_OperatingSystem`, and the
   observer, under the same environment, completed `Win32_Process`.

Performance-counter classes are computed inside WMI's own provider host, not in the client. I know of no mechanism
by which the client's environment variables would fail them while other classes succeed. So the environment is a
candidate the record cannot exclude, not a finding. The host or provider cause is **UNKNOWN**. Possibilities
include the performance adapter's state at that moment or counter registration, but they are not evidenced. None of
this supports changing the API, timeout, floor or manifest.

## 5. Smallest next diagnostic question

No execution consent is given here; this needs Root's own binding.

- **The question.** Does the single accepted query `Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
  -OperationTimeoutSec 2` return exactly one row within 2 s on this host now? Run it once under the caller's exact
  rebuilt environment and once under the operator's ordinary environment, each in a fresh pinned pwsh.
- **What to record on failure.** The `CimException` type, `NativeErrorCode`, the CIM error data's code and message
  ID, the call's elapsed milliseconds and the row count. The memory values are not needed for the question.
- **What each outcome means.**

| Outcome | Meaning |
|---|---|
| Both fail with the same code | Host or provider state; the environment is cleared of suspicion |
| Rebuilt fails, ordinary succeeds | The environment is implicated; a narrow environment proposal follows, with re-review |
| Both succeed | A transient host state at 03:56; a fresh admission of the unchanged accepted sources is reasonable, with no source change |

That is two read-only queries of one class, with no other provider call, no retry and no stop.

## 6. Separate finding: PowerShell telemetry under the rebuilt environment

- **Evidence.** pwsh wrote `AppData/Local/Microsoft/PowerShell/telemetry.uuid` into both private home
  directories, the executor's and the caller's. PowerShell creates that identifier only when its telemetry is
  enabled, so the caller, supervisor and observer each ran with telemetry on. Each start may have attempted an
  outbound send to Microsoft.
- **Cause.** The caller, the executor and the frozen supervisor's child environment set the .NET opt-out but not
  `POWERSHELL_TELEMETRY_OPTOUT`, and clearing the environment drops any user-level setting. That conflicts with
  the stated "no network target" isolation. It has nothing to do with the G0 failure.
- **Smallest correction.** Add `POWERSHELL_TELEMETRY_OPTOUT='1'` to the caller's and executor's environment
  tables. The frozen supervisor's fixture children would still lack it unless the supervisor is revised. Root can
  either record that remaining deviation explicitly or request a supervisor revision.
- **Handling.** The archived 16-byte `telemetry.uuid` files are pseudonymous device identifiers. They are fine in
  the local records but should not be published.

## 7. Root's R3 reservation decision

R3's records already cover every process the scripts created:

- caller, CMD, supervisor and observer exits come from retained handles, and the supervisor's exit from two
  independent handles that agree to the tick;
- the closure was never started;
- the executor's exit comes from the native transport.

The supervisor failed at line 148 and `attempt-counter-r1` does not exist. Fixture children start only after that
directory is created at line 168, so none could have been launched, and nothing on lines 137–168 starts a process.
Together this is a sufficient factual basis for Root to decide the R3 reservation without a further observation.
It is stronger than R2's basis, because R3 captured the supervisor itself.

Residuals:
- the executor exit is from the transport only;
- system-created console hosts and WMI provider activity were not observed and are not R3-owned;
- there is no global absence or cleanup claim.

Releasing the reservation is Root's decision.

Not execution consent, not a counter PASS, not a release. The accepted sources (Doc 128 supervisor, Doc 132
caller) remain accepted; the consumed ticket stays non-reusable.
