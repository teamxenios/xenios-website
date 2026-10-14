# R6 counter run: failure evidence, closure and one method decision

**FAILED, with zero credit.** The earliest boundary is the supervisor's G0 refusal `MEMORY_COUNTER_READ_LATE`
at line 262.

**Closure:**
- **Closed.** The retained evidence closes CMD, the supervisor, the observer and the executor.
- **Not closed.** The caller had begun exiting but its completion is not recorded. One bounded observation of that
  single process ID closes it.

**Method:** direction A is selected, with the binding conditions in section 5. Those conditions include a required
companion correction for an exit-time race that caused this run's secondary failure.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
archived bytes and source lines. Nothing compiled, probed, stopped or run. No agents. Archive:
`hl12/152_r6_counter_failure_closure_and_method.json`.

## 1. Binding

- Core receipt commit `6cc733c1` (tree `f1744b0e`, parent `37b15b7`) and raw freeze `5d63daca` (tree `6c7ce07f`).
- Root's collection is 4,056 B `1583a02b…`. All thirteen archived files match its sizes and hashes, including the
  receipt at 33,797 B `5a2c75c5…` and the consumed ticket at 11,343 B `c73c8827…`.
- No tooling file changed between `240de0df` and `5d63daca`. The post-run pin record names all twelve pins.

## 2. Earliest boundary and credit

- **One call.** One native call ran from 16:10:44.441Z to 16:10:51.970Z. It returned exit code 1 with no session,
  and its only output was `EXECUTOR_FAILED_OR_INCOMPLETE`.
- **The refusal.** The supervisor `64096` wrote the closed token `MEMORY_COUNTER_READ_LATE` at line 262 to its
  inherited stderr, which the caller captured through CMD.
  - Line 262 refuses if the read took 2,000 ms or more, or if the process age exceeded 30 s.
  - The age half cannot have fired, because the supervisor lived 4,930.45 ms in total.
  - So the timed read took at least 2,000 ms and less than the supervisor's whole lifetime.
- **What the timed read covers.** The timed function runs the cold `Add-Type` compile at line 202. Line 203 then runs
  the adapter's size and offset assertions and the `K32GetPerformanceInfo` call.
  - The late check runs before the read-failure check, so this token cannot distinguish a slow success from a slow
    failure.
  - Neither the compile's share of the time nor whether the read would have succeeded is established.
- **Fail-closed chain.** No attempt directory exists and 0 of 25 cases ran. No resource value and no exact read time
  were persisted.
  - The observer's exit row binds supervisor exit 1 at 16:10:51.326Z, matching the caller's own handle record.
  - The caller then failed closed with `ACTUAL_PROCESS_EXIT_FAILURE`. No gate was written and no closure was started.
  - The executor failed closed with `CALLER_ACTUAL_LIFETIME_OR_IDENTITY_FAILURE`.
- **Credit.** None. This run gives no counter, G0, memory, timing-fit, closure, browser, diff or release credit.

## 3. Missing closure evidence, and why the caller's exit time is invalid

- **Nothing reached closure.** No observer gate, no independent closure and no caller receipt exist.
- **The executor's caller record is invalid. It stays invalid and is not repaired.**
  - The record carries exit code 1 but an exit time equal to the zero file time, so the lifetime is negative.
  - The executor reached that branch at line 145 only because its retained handle's `HasExited` returned true.
  - On Windows, .NET reports `HasExited` as soon as the exit code is no longer `STILL_ACTIVE`. That can happen before
    the process has finished terminating and before its handle is signaled. An exit time read in that gap is zero.
  - So the caller had set exit code 1 and begun terminating at about 16:10:51.76Z. The executor read its exit time
    before termination completed, and its own lifetime check refused it.
- **Missing EOF is consistent with that.** The executor lacks EOF on the caller's streams. The executor threw at the
  exit check in the same loop that drains those streams, so the missing EOF is consistent with the same timing. This
  is an inference, not evidence of a live writer.
- **The caller has the same race.** Its `L-Exit` also reads `ExitTime` right after `HasExited`, without waiting. It
  happened to record valid exit times for CMD, the supervisor and the observer in this run.

## 4. Operational reservation

The reservation stays a separate operational matter from the FAILED qualification.

- **Closed by retained evidence:**
  - CMD `63252`, the supervisor `64096` and the observer `62652` each have retained handles, exit codes and valid exit
    times within their limits. The CMD and observer streams reached EOF.
  - The executor `61256` ran synchronously under the native `cmd.exe`, which returned exit 1 with no session.
- **Started nothing further.** The supervisor stopped before its attempt directory and before any case child. The
  closure was never started.
- **Not closed by retained evidence.** The caller `46104` is shown to have begun terminating, not to have finished.
- **The one bounded observation needed** is in the Doc 131 failed-run postcheck class under section 6. It is one
  read-only lookup of process ID 46104 alone, compared with its recorded creation time `2026-10-14T16:10:45.2358933Z`.
  It uses no census, no other process and no stop.
  - If no process is found, or a process is found with a different creation time, the caller is closed. Root may then
    release the reservation as operationally closed.
  - If the same process is still present, nothing is stopped and the reservation stays held for Samuel.

Either way the qualification stays FAILED, and no global closure is claimed.

## 5. Method decision: direction A

I select direction A with the same owner: a bounded repair of the existing native adapter by separating its cold
initialization from the fresh read. This is the separate-initialization option from Doc 148. The combined 2,000 ms
choice has failed.

The source-only proposal must satisfy every condition below.

1. **Phases.** Run a separately timed initialization first: the `Add-Type` compile and the adapter's size and offset
   assertions, with no API call. Then run the fresh OS query, still under 1,000 ms. Then run the native read, which
   now covers only the `K32GetPerformanceInfo` call and its validation. The read stays under 2,000 ms in the
   supervisor and the controls parent, and under 1,000 ms in the diff runner.
2. **The initialization bound is a proposal, not a measurement.** The only measurement is from this run: compile,
   assertions and call together took at least 2,000 ms and less than 4,930 ms. A 5,000 ms bound exceeds that
   ceiling, so this run's initialization alone would have fit. Nothing establishes it for colder states or other
   runners.
3. **Fences and bounds.** Initialization, OS query and read must all finish inside the unchanged 30 s process-age
   fence. Floors, refusals and every outer bound stay unchanged. The proposal must show the arithmetic for each of the
   three runners rather than assume the extra time fits.
4. **Truthful semantics.** The owner timing decision `KEEP_EXISTING_COMBINED_BUDGETS` and Doc 149's combined wording
   are superseded for future runs. The requirements, manifest notes and receipt fields must say that initialization
   has its own bound and that the read bound excludes it. Nothing may be labelled unchanged scope.
5. **Diagnosability.** The one open question is which phase is slow, and whether either phase fails.
   - Each G0 refusal must name its phase and kind: initialization late, initialization failed, read late or read
     failed.
   - Lateness must not mask failure.
   - Any G0 refusal must persist the measured initialization and read durations, as numbers only with no resource
     values.
   - Without this, another failure would be as uninformative as this one.
6. **Required companion correction: the exit-time race.** Both the executor's caller-exit read and the caller's
   `L-Exit` must read the exit time only after the retained handle is signaled, within the existing bounds, and must
   fail closed otherwise. This run shows that a caller exiting normally can fail the executor even when everything
   else passes.
7. **Fixtures and pins.** The 25 cases must cover each new refusal. Any change in the case count, the shared 24-line
   slice, the manifest or the pin chain must be disclosed and rebound, as in R5 and R6.
8. **No additions.** No new launcher, observer, cache, prewarm, persisted compiled assembly or test platform.

**Not selected.** A compiler-free rewrite would remove the compile, but it would replace reviewed adapter code rather
than re-time it. Only one direction is selected.

**Authority.** This is source-authoring direction only. Applying it needs Samuel's actual protected-path exception
after a frozen proposal and my review. A run needs a fresh admission and window, because `c73c8827` is consumed.

## 6. Unchanged

Payment and security holds are unchanged. The application `8e85daa` and the accepted reviews are not reopened.
Scheme, controls, diff and browser stay held.

Not execution consent, not human approval and not test credit.
