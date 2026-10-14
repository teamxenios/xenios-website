# Revision 26 item 2: R2 failed-reservation postcheck proposal, action disposition

**BOUNDED ACTION COMPATIBLE WITH ITS STATED LIMITS, as one contributing observation for Root's R2 reservation
decision.** It is not closure, not a PASS for R2, not a release of the reservation and not execution consent.
`R2_FAILURE_POSTCHECK_PROPOSAL_20261014.json` (7,409 B `4a14f977…`, blob `e82a3ecc`) at Core `a715a5bb` (tree
`23d39747`) proposes one local `Win32_Process` query that selects only `ProcessId`, `ParentProcessId` and
`CreationDate`. It covers the caller PID 58428, the CMD PID 55812 and any direct child of either, with a 2 s
provider timeout, a 10 s envelope, 32 rows and 16 KiB, zero retries and zero stops. There is no global inventory, no
command line, no path, no environment and no cleanup. I accept the query, its caps and its prohibitions as written.
One rule can be stated more precisely than the proposal does, and one optional coverage addition is noted.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, revision 26 item 2, model Opus 5.5 in the same
session. Read-only; no query run. Archive: `hl12/131_r2_failure_postcheck_proposal.json`.

## 1. Bytes and scope

The Root archive copy is byte-identical to the Core blob. Commit `a715a5bb` adds only this records file plus the
three `.xenios` continuity files. No script exists, and the proposal binds the R2 outcome `1eedbf16`, the directory
addendum `235f9042`, the consumed ticket `bd01b387…` and the recorded identities:

| Process | PID | Creation (UTC) | Exit (UTC) | Exit recorded by |
|---|---|---|---|---|
| Caller | 58428 | 02:44:09.1875883 | 02:44:09.9933733 | the executor's retained handle |
| CMD | 55812 | 02:44:09.8423360 | 02:44:09.8770185 | the caller's retained handle |

## 2. What the query can establish

- **Known PIDs.** Both exits already come from retained handles, so a row for 58428 or 55812 can only be a later
  process that reused the number. Comparing its `CreationDate` with the recorded creation classifies it. A row with
  the recorded creation would contradict an actual exit record and stays unresolved, as the proposal says.
- **Direct children: attribution is decidable, not merely ambiguous.** A process cannot create children before it
  exists or after it has exited. Windows also does not hand an exited process's PID to a new process while a handle
  to it is open, and both handles were held through each exit. So a live row whose `ParentProcessId` is P and whose
  `CreationDate` falls inside P's recorded creation-to-exit interval is P's child. A row created outside that interval
  belongs to another holder of the same number and is unrelated. Only rows within the 1 ms precision tolerance of
  either boundary stay ambiguous. I ask that the execution binding state this rule with the 1 ms tolerance, in place
  of the proposal's softer "may be reuse/ambiguity" wording. It narrows unknowns without widening the query.
- **What no rows means.** A complete observation with no rows means no live direct child of the caller or CMD
  existed at that instant. It does not cover a child that started and exited, or a grandchild of such a child. The
  proposal already says this.

## 3. How it combines with evidence already recorded

The reservation exists to keep an exclusive slot while R2 processes might still run. Together with a complete
no-row observation, the recorded evidence bounds the residual tightly:

- The caller's only child was CMD, whose exit is recorded. The executor's only child was the caller, whose exit is
  recorded. The executor's own exit 1 is reported by the native transport.
- `attempt-counter-r1` does not exist. The supervisor creates that directory before it starts any case child, so no
  supervisor reached the point of launching fixtures.
- Doc 130 finds that CMD ran its built-in `md` and started no process. That is an inference from the directory
  evidence, not an observation, and the query is the observation that tests its live consequence.
- All fourteen post pins and the ticket hash are unchanged.

On that basis, a complete no-row result is a sufficient factual basis for Root to decide the R2 reservation, with
the residual stated: departed transient processes and their descendants were not observed. Whether that suffices
is Root's decision. Releasing the reservation is Root's act, not this review's.

## 4. Optional coverage

The executor PID 43380 (created 02:44:08.6701455) has no OS-handle exit record, only the native transport's exit
code. If Root wants that row covered in the same single query, add `OR ProcessId = 43380 OR ParentProcessId =
43380`. Attribution of executor children would then use the native completion time as the upper bound. This is
optional and not a condition of compatibility.

## 5. Outcomes and what each means

| Observation result | What Root may conclude |
|---|---|
| `OBSERVATION_COMPLETE_NO_SELECTED_LIVE_RELATION` | Basis for the reservation decision with the stated residual |
| A row attributable by the window rule | A live R2 descendant exists. The reservation stays held, nothing is stopped, and a separate decision is needed |
| Rows outside the window only | PID reuse. Record the classification and treat the outcome as no selected live relation |
| `FAILED_OR_INCOMPLETE` (timeout, over cap, interrupted or unproven completion) | Unknown. The reservation stays held and there is no second query |

## 6. Required before execution

1. Root's determination that standing local scope applies to this one read-only observation.
2. The same owner's acknowledgment of one observation, the unchanged identities and no competing owned job.
3. A fresh finite UTC window, the exact literal command through the existing native transport and pinned pwsh, the
   query text and its hash, one fresh private output path, the caps, and completion capture: start and end
   timestamps, operation status, row count and complete-output status.
4. The window-rule classification and its 1 ms tolerance written into the binding.
5. No inherited R2 admission, warm-up, G0, browser, source change, retry, stop, cleanup or self-release, as the
   proposal already prohibits.

This disposition does not alter Doc 130's correction requirement for the CMD successor. The two items are
independent: this one serves the R2 reservation, Doc 130 serves the next counter attempt.
