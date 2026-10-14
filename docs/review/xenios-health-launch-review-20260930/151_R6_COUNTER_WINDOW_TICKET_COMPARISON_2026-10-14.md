# R6 counter group: actual window and ticket comparison

**CONFIRMED. The fixed ticket, window, native command and inputs match the applied R6 source, the current bounds and
the standing section 6 scope. I found no defect.** This is the original comparison the ticket's
`executorComparisonRef` names. It is not a dispatch, an invocation or test credit.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
file hashes, JSON fields and one directory listing. Nothing compiled, parsed as code, probed or run. No agents.
Compared at 16:04 to 16:07Z, inside the window and before its last start. Archive:
`hl12/151_r6_counter_window_ticket_comparison.json`.

## Records

| Record | Bytes | SHA-256 |
|---|---|---|
| Fixed ticket `DOC123_SYNTHETIC_PROVING_ADMISSION_20261014.json` | 11,343 | `c73c8827…` |
| Admission `DOC151_COUNTER_R6_ACTUAL_ADMISSION_20261014.json` | 6,545 | `e45de149…` |
| Reservation `DOC151_COUNTER_R6_EXCLUSIVE_RESERVATION_20261014.json` | 2,208 | `87d7aba3…` |

## Ticket against the applied source at `240de0df`

- **Paths.** The ticket sits at the fixed path all three scripts hard-code. Its outputs equal the literal constants:
  `attempt-counter-r1` for the supervisor, `caller-counter-cmd-r4` for the caller and `executor-counter-cmd-r4` for the
  executor. All three are absent now. Earlier attempts' directories remain in place.
- **Binding fields.** Approved, mode, group `counter`, owner `01a0e098`, exclusive reservation, `readBudgetMs` 2,000,
  manifest `93a557cf…` and addendum `44413e31…` all equal what the supervisor and caller check. The caller's
  `doc128` is `8af08bc`, and the executor's `doc129` is `cab6120`. Both are the commits those scripts require. All
  six reference fields are non-empty, and the caller and executor reservation references agree.
- **Bounds.** Supervisor: work 90,000, finalization 10,000, aggregate 120,000, child 5,000, floor 512 MiB, child
  output 16,384, one attempt, no retry, no stop. Caller: 180,000, reserve 5,000, observer 135,000, CMD 125,000,
  discovery 5,000, closure 10,000, preflight 10,000, streams 16,384. Executor: outer 210,000, capture 185,000,
  identity 5,000, preflight 10,000. Each equals the constant or derivation in the applied source and the manifest's
  counter bounds.
- **Invocations.** The supervisor, caller, observer-prefix, closure-template and executor arrays name the pinned
  `pwsh.exe` and the applied scripts with group `counter`. The closure template keeps both sentinels for the caller
  to fill.
- **Window.** 16:00:36.000Z to 16:20:36.000Z is exactly 20 minutes. The last start of 16:17:51.000Z equals the end
  minus 165 s, which is what all three scripts require for a 120,000 ms aggregate. The executor's preflight cutoff is
  15 s before that, at 16:17:36.000Z. All three timestamps use the required millisecond format. Nothing reuses
  Doc 146 and nothing is offset.
- **Pins on disk.** The seven selected inputs equal the manifest's counter files in order, path for path. Those seven
  and the five additional inputs match their recorded sizes and hashes on disk, including `pwsh.exe` 301,368 B
  `362a356c…` and `cmd.exe` 327,680 B `a6e3b3b2…`. The executor's own pwsh pin is that same hash. The scripts on disk
  equal the Doc 150 bytes.
- **Cases.** The manifest's counter group has 25 cases.
- **Native command.** It is the accepted Doc 137 prefix `set POWERSHELL_TELEMETRY_OPTOUT=1&& `, 36 B `063b76d4…`,
  followed by the ticket's executor invocation and `-AdmissionSha256` set to the ticket hash. It has no quotes, no
  space before `&&`, no `DOTNET` setting and no native launch timestamp. The shell is `cmd.exe` and the working
  directory is the applied worktree.
- **Authority.** The ticket and admission name section 6 of the founder text `20041ef0…`, as compared in Doc 150.
  This is one counter group only. The scheme group, the controls, the browser and the diff check remain held for
  their own comparisons.

## What a run under this ticket can and cannot show

Doc 149's section on what a successful run would prove applies unchanged. A late, failed or incomplete run fails. No
memory, global closure, 32-bit, browser or diff credit follows from it. The run must start before 16:17:51Z, and the
executor's preflight must finish before 16:17:36Z. A missed start lapses this ticket. It cannot be extended or
reused.

Not execution consent, not human approval and not test credit. Root still owns dispatch and Core's final readiness.
