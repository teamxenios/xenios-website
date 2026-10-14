# R7 counter group: actual fixed ticket and window comparison

**CONFIRMED, no defect.** The fixed ticket (11,503 B, `790af2ce4f80f2cfef9a8c171a0c675b9f1894befbf5c0aa15c0a79d619697a0`),
its window, its native command and its pins all match the applied R7 source `1911873d`, the manifest
`c389a415…` and the section 6 scope.

This is the original comparison that the ticket's `executorComparisonRef` names. It is not admission, dispatch or
test credit.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: hashes, JSON
fields and one absence check on the output root. Nothing was compiled, queried or run, and no agents were used.
Compared at 18:45:47 to 18:46:27Z, inside the window and before its last start. Archive:
`hl12/157_r7_counter32_ticket_window_comparison.json`.

## Checks

- **Ticket.** The fixed-path ticket equals Root's frozen pre-comparison copy byte for byte. The old consumed
  `c73c8827…` ticket is preserved byte-identically in Root's replacement copy and in the Doc 153 archive. It is not
  reused.
- **Window.** It runs from 18:40:29.000Z to 19:00:29.000Z, exactly 20 minutes. The last start, 18:57:44.000Z, equals
  the end minus 165 s, as a 120,000 ms aggregate requires. The executor's preflight must finish before 18:57:29.000Z.
  All three timestamps use the millisecond format.
- **Binding fields.** The ticket is approved, in `sequential-synthetic-proving` mode, for group `counter`, owned by
  `01a0e098`, with exclusive reservation. It carries `readBudgetMs` 2,000, `initBudgetMs` 5,000 and `osBudgetMs`
  1,000. It names manifest `c389a415…`, addendum `44413e31…`, `doc128` `8af08bc` and `doc129` `cab6120`.
- **Bounds.** Each bound equals the applied constant and the manifest's counter bounds:
  - supervisor: work 90,000, finalization 10,000, aggregate 120,000, child 5,000 and 16,384 B, one attempt, no retry,
    no stop;
  - caller: 180,000, observer 135,000, CMD 125,000, discovery 5,000, closure 10,000, preflight 10,000;
  - executor: outer 210,000, capture 185,000.
- **Invocations.** The supervisor, caller, observer-prefix, closure-template and executor arrays name the pinned
  `pwsh.exe` and the applied scripts with group `counter`.
- **Outputs.** `attempt-counter-r1`, `caller-counter-cmd-r4` and `executor-counter-cmd-r4` sit under the R7 root
  `ql-doc154-r7-synthetic-proving-20261014`. That root does not exist yet.
- **Pins.** The seven selected inputs equal the manifest's counter files in order. Those seven, plus the manifest,
  caller, executor, addendum and `cmd.exe`, all match their sizes and hashes on disk. The manifest has 32 cases.
- **Native command.** It hashes to `9acaae245eaaefb06a802a10963baf29b69ebd9c5a26a25d7c2b810f918ee531`. It is exactly
  the Doc 137 prefix, then the executor invocation, then `-AdmissionSha256` set to this ticket's hash. The shell is
  `cmd.exe` with login false, the working directory is the applied worktree, the yield is 1,000 and the maximum
  output is 3,000.
- **References.** The caller and executor reservation references agree. The post-application and reservation records
  exist. The admission record and this comparison record do not exist yet. The code only requires the fields to be
  non-empty. Root's rule is that both must exist before any invocation.
- **Scope.** Section 6 of the founder text `20041ef0…` covers this one R7 counter program, as Doc 150 and Doc 156
  stated. The 13-path grant gives no runtime consent.

## Limits that apply to this run

- Any non-finite or negative case-child lifetime fails at evidence review.
- The four classifiers are arithmetic, not measured timings.
- Real timing fit is unproven.
- The observer gate, the capture, the closure and EOF stay mandatory.
- A late, failed or incomplete run fails.
- A missed last start lapses the ticket, with no extension or reuse.
- The scheme group, the controls, the diff check and the browser remain held.

Not execution consent, not human approval and not test credit. Root's final admission and Core's final readiness are
still required.
