# R7 counter run: PID-reuse closure failure, operational closure and remedy

**FAILED, with no group credit.** The earliest and only failing boundary is the independent closure at
`verify-proving-closure.ps1:75`. It is a defect in the closure, not in the application or the gate.

- **Cause.** The closure checks bare process IDs with no creation-time identity. Its own process was given PID 63340,
  which an earlier case child had used and released. So its query found itself.
- **Operational closure is supported** by the retained exit evidence.
- **Remedy.** One unapplied, identity-qualified closure correction under the conditions in section 5.
- **No reuse of outputs.** The 32 preliminary outputs cannot be accepted without a fresh bounded successor run.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
the decoded raw archive and source lines. No query, run or agents. Archive:
`hl12/158_r7_counter32_pid_reuse_closure_failure.json`.

## 1. Evidence

- **Core commit.** `bfb007e6` (tree `100a7d64`, parent `eeb5c17`) adds exactly six files under
  `doc168-r7-counter32-actual-run-20261014/`.
- **Records.**

| Record | Bytes | SHA-256 |
|---|---|---|
| Receipt | 29,146 | `355b88e6…` |
| Raw run files | 119,149 | `b3a48735…` |

- **Raw files.** The 88 raw files, 74,917 B in total, decode and match their recorded hashes. Root's collection binds
  the same receipt, raw set, commit, ticket and command.
- **The call.** One native call ran under ticket `790af2ce…` and command `9acaae24…`.
  - It was submitted at 18:51:02.794Z, before the last start.
  - It returned a session after 10 s. The same session was polled twice.
  - It ended at 18:51:33.593Z with exit 1 and `EXECUTOR_FAILED_OR_INCOMPLETE`.
  - That is one invocation, with no retry or stop.

## 2. The failure chain

1. **Gate passed.** The supervisor `63492` measured initialization at 788.48 ms, the OS query at 182.37 ms and the
   read at 72.31 ms, all within their budgets and with the three floors met.
2. **Cases passed.** All 32 cases passed in order, with complete streams and expected exits. Their lifetimes were
   finite and between 485.49 and 2,664.16 ms.
3. **Clean exits.** The supervisor exited 0 at 27,910.29 ms. The observer gate passed. CMD `20680` and the observer
   `63336` exited 0, with EOF on their streams.
4. **The closure failed.** The caller started the closure, which became `63340` at 18:51:32.1870127Z.
   - Case `negative-headroom` had been PID `63340` from 18:51:15.3095327Z, with a valid exit about 0.57 s later.
   - Lines 44 to 64 build the filter from the parent, CMD, observer and 32 case IDs, with no creation times.
   - Line 75 throws on any row. The query for `ProcessId=63340` necessarily returned the closure's own running row,
     so `KNOWN_IDENTITY_STILL_PRESENT` was certain.
   - The closure kept no rows, so whether any other known ID was also matched cannot be known.
5. **Fail-closed afterwards.** The caller then failed closed with `CLOSURE_ACTUAL_RESULT_FAILURE`. The executor
   recorded the caller's exit validly: exit 1, a 30,097.69 ms lifetime and EOF on both streams. It then failed closed
   because the exit was 1.

This is not a waiver. The group stays FAILED, and the old failure is not relabelled.

## 3. What the run showed, as observations only

These are observations of a failed run. None of them is counter credit.

- **Gate times.** For the first time, the real cold initialization, OS query and native read succeeded, with the
  times above, for this one supervisor process on this host.
- **Signaled exits.** The signaled-exit fixes worked. Every recorded exit is valid, including the executor's record of
  the caller, which was the R6 defect.
- **Refusal lines.** The refusal lines from the real-clock cases reached the preserved stream files.
- **Counter fit.** The counter body fitted easily, at 27.9 s of a 120 s aggregate.
- **Not shown.** The scheme, controls and diff fit, and the browser.

## 4. Operational closure

The retained evidence supports releasing this run's operational reservation, separately from the FAILED
qualification.

- **Directly started processes.** The supervisor, CMD, observer and closure each have retained-handle exits that the
  caller read only after a signaled wait. The caller has the executor's signaled exit. The executor ended inside the
  native session, which returned its exit code.
- **Case children.** All 32 have valid, non-zero exit times. Windows records an exit time only once a process has
  terminated.
- **Inherited streams.** The supervisor's streams were not captured directly. CMD's streams reached EOF, and the
  supervisor and its children inherited those handles.
- **Nothing more started.** The fixture starts no compiler, CIM or native process.
- **Limits.** No global absence and no lifetime for any unknown process are claimed. No new query is needed.

## 5. Smallest bounded remedy: one unapplied identity-qualified closure correction

The same Core may prepare one unapplied correction in its own namespace. It touches `verify-proving-closure.ps1` and
only the pins that depend on it. The conditions are:

1. **Identity, not ID.** A row counts as a known process only if both its ID and its creation time match a recorded
   identity within 1 ms, the same guard as Doc 153. A matching ID with a different creation time is a reused ID. It
   is recorded, not counted.
2. **Self.** The closure must never count its own process. An explicit rule compares its own ID and creation time.
3. **Missing identity fails closed.** Every known ID needs a creation time from a hash-bound input. The parent, CMD
   and cases have one today, but the observer's creation time exists only in the caller's gate record. Core must
   bind that record by hash or another reviewed path, or the closure must fail closed. A bare-ID match may never be
   read as absence.
4. **Scheme worker check.** The scheme group's `ParentProcessId` check must also qualify by identity. A row counts as
   the runner's child only if it was created between the runner's recorded creation and exit. The worker guard is
   not weakened.
5. **Retain rows.** Both quiet checks must record every observed row's ID, parent ID and creation time. That makes a
   failure diagnosable without a new query.
6. **Controls.** Use the existing fixture or control style, with no new layer. Cover four cases:
   - a reused ID, which is not present;
   - the closure itself, which is not present;
   - an exact identity, which is present and fails;
   - a missing identity, which fails.
7. **Unchanged.** The two quiets, the 500 ms spacing, the 10 s closure limit, EOF, floors, budgets and every other
   guard stay unchanged.

## 6. Can the existing 32 outputs be accepted? No.

- **Nothing to re-evaluate.** The failed closure kept no rows, so it cannot be re-evaluated under the corrected rule.
- **A later check proves something else.** A closure run now would observe a different moment. The contract needs
  the closure inside the same caller run: after the exits, within 10 s, bound to that run's observer stream, and
  producing that caller's receipt.
- **No cross-run composition.** Combining outputs from separate runs would be a new evidence rule nobody has reviewed.
- **The ticket is consumed.** `790af2ce` cannot be reused.

So the remedy needs one bounded successor run: a fresh counter group of all 32 cases under the corrected closure.
This run's outputs stay preserved as failed evidence.

## 7. Prerequisites, in order

1. Core freezes the unapplied correction, then I review it.
2. Samuel gives an exact protected-path exception for those paths, then I confirm the applied bytes.
3. Root freezes a fresh window and ticket under section 6, then I compare them.
4. Core acknowledges freshly, Root admits, and Core gives final readiness.
5. One call is made.

Scheme, controls, diff and browser stay held. Payment and security holds are unchanged.

Not execution consent, not human approval and not test credit.
