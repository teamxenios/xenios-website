# KAN-31 Doc418 conditional LIGHT, parse and closure admission: operational comparison

**MATCH: no material mismatch** between Root's actual conditional record and the accepted source, the stated human
instruction, the window and the bound literals.

- **What this is.** An operational comparison only. Not a new source review, not admission and not dispatch.
- **Who decides.** Root's final dispatch decision is Root's.
- **Nothing executed.** I ran nothing, made no process or CIM query and sent nothing to any session.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: file hashes,
Git objects and literal text; no agents.
- **Not reopened.** Docs 195, 197 and 198, application, CI, I3 and Q1 stay closed.
- **Timing.** Compared at 2026-10-15T22:11–22:16Z.
- **Jira.** Root relays.

Archive: `hl12/199_kan31_doc418_light_parse_admission_comparison.json`.

## 1. Authority and identity

- **The record.** Root's record `DOC418_ACTUAL_LIGHT_PARSE_CONDITIONAL_ADMISSION_20261015.json`:
  - 4,241 B, raw SHA-256 `1ed3e7e5…7038`, matching the packet;
  - committed in records `b2cfb0fe`, and unchanged through records HEAD `e3514d7b`, where the worktree is clean;
  - status `CONDITIONAL_PENDING_ORIGINAL_COMPARISON_NOT_DISPATCHED`, with `actualInvocation: null`, and the queue receipt
    shows `actualCalls: 0`.
- **The human instruction.** The record binds owner-thread message `01a1419b-4b12-77a0-bc7e-f02dfb168343`. Its text asks
  Root to bind the fresh LIGHT admission and run the corrected parent's parse, path comparison and offline checks under
  existing controls, preserving all limits and reporting actual results and closure.
  - I did not read that message myself. I rely on Samuel's statement in this conversation and Root's
    `independentlyRead: true`.
  - The record narrows the instruction: offline15 is `NOT_ADMITTED_BY_THIS_RECORD`. That narrowing is consistent with
    the instruction.
- **Resource owner.** The resource-owner attestation is present: no competing operation in owned scope; sameCore,
  serialized LIGHT only; no capacity reading.
- **Source.**
  - The record's `recordsHead` and `recordsTree` are `db03e216` and `40136602`.
  - The tc25 worktree HEAD and tree are exactly those, and `db03e216` is in history.
  - The parent at the literal's path is 27,053 B and `6488fba2…`, matching the record and Doc 197.
- **Runtime.** The pin is pwsh `362a356c…`, 301,368 B: the same pin as the frozen apparatus.

## 2. Window

- **Bounds.** 22:08:59.810Z to 22:28:59.810Z on 2026-10-15, with the last start at end − 60 s. That is 20 minutes, with
  no automatic extension.
- **Fit.** The worst case is resource under 30 s, parse under 15 s and closure under 10 s. That fits only if the
  sequence starts well before the last start. The closure refuses at the window end, so a late tail fails closed.

## 3. Literal binding

The three literal files are clean in Git, and each matches its pin: committed bytes equal the working copy.

### Resource: 12,496 B, `406360be…`

- **Region.** Lines 3–183 are **byte-identical** to parent `6488fba2` lines 76–256. Both are 181 lines, SHA-256
  `985a92d9…`, from the R7 native adapter, R5 validation and R7 phase gate. This is the same region Doc 196 found
  identical to `947bba10`.
- **Context.** The execution context is unchanged: `ErrorActionPreference Stop` and `StrictMode Latest`, as parent
  line 6. The region uses only local variables.
- **Limits.** The floor is 512 MiB on all three readings, and the budgets are 30 s age, 5 s initialization, 1 s OS and
  2 s read.
- **The callsite.** `Get-XeniosResourceAdmission 2000`, then a requirement of `floor 512` and `browserAdmission false`,
  one JSON line, and `exit 0`; otherwise a refusal on stderr and `exit 1`.
- **No dispatch.** No parent dispatch, no `Qual-Budget` and no offline case. The missing `# END` marker line is
  cosmetic.

### Parse: 1,733 B, `fc975d1a…`

- **Pins.** Pins the parent's length and hash before the parse and its hash again after it.
- **Parse only.** `Parser.ParseFile` only: no dot-sourcing, invocation or child process.
- **Path comparison.** It compares a forward-slash path with its backslash, upper-case spelling, which must be accepted,
  and with a different path, which must be refused. It uses the exact normalization on parent line 59, which Doc 197
  confirmed and the hash pins.
- **Failure.** Any error throws, and the process exits non-zero.
- **Lifetime.** Lifetime from its own process creation is checked under 15,000 ms before the result is printed.
- **Output.** It prints `pid` and `creationUtc` in exactly the 7-digit-fraction format the closure template requires,
  with `dispatches 0`.

### Closure template: 3,376 B, `eb080980…`

- **Placeholders.** Exactly three: the parse PID, its 7-fraction creation time and the 3-fraction stop time.
- **Format checks.** The PID must be a positive `int` and both times must match their formats, or the closure refuses.
- **Timing.** Two `Win32_Process` queries by PID, each with a 1 s timeout and checked under 1 s, 500 ms apart. The
  process age plus elapsed time must stay under 10 s, and the closure stops at the window end.
- **Identity.**
  - A still-present known identity throws, whether or not the executable matches.
  - Absent, or a reused PID with a different creation time, counts as closed.
- **Output and limits.** Output is capped at 8,192 B, with no stop, kill or retry and `globalGuarantee false`.
- **Substitution.** The fixed stop is the window end, `2026-10-15T22:28:59.810Z`, which matches the 3-fraction format.

## 4. Non-blocking notes and dispatch conditions

These are not mismatches.

1. **Runtime is not self-evidenced.** No literal checks its own `MainModule`, and the closure cannot see the executable
   of an exited process. Root's receipt must record the exact shell path and argv used for each of the three calls,
   which must be the pinned pwsh, with no profile and no login.
2. **Freshness and window are Root-enforced.** Only the closure checks the window. Root must show from the actual
   outputs that:
   - the resource started at or after the window start and before the last start;
   - the parse `creationUtc` minus the resource `at` is under 30,000 ms;
   - the parse creation plus its lifetime ends before the window end.

   Any miss is a FAIL.
3. **Clean-tree check needs long paths.** A plain `git status` in the tc25 worktree shows two false deletions under
   `…/raw/check/home/AppData/…/StartupProfileData-NonInteractive`, caused by Windows "Filename too long".
   `git -c core.longpaths=true status --porcelain` is clean. Root's clean check must use long-path support, or stop on
   the false report rather than waive it.
4. **Closure substitution.** Use only the PID and creation time from the complete raw parse stdout after a native exit
   of 0 with closed streams. Record the rendered closure bytes and hash before running it.
5. **Waiting and failure.** Wait at most 14 s on the parse with no kill. Any non-zero exit, stderr on a success path,
   late result, unknown closure or `KNOWN_IDENTITY_STILL_PRESENT` is a FAIL, whatever a receipt says.
6. **Offline15.** It needs its own fresh exact ticket after this sequence closes with a PASS.

The browser holds are unchanged: the 2,048 MiB browser floor, secure input setup and startup authority, source7,
staging-effects authority and Doc399 authority. No secrets, setup, browser, staging, SQL or production are authorized
here. NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | Doc418 conditional LIGHT/parse/closure admission (record 1ed3e7e5, records b2cfb0fe..e3514d7b unchanged; Core db03e216/40136602; parent 6488fba2) | reviewer 6abf1edf | MATCH, no material mismatch: authority (human msg 01a1419b-4b12 via record + Samuel; offline15 narrowed out), resource-owner attestation, window 22:08:59.810-22:28:59.810Z lastStart -60s no extension; resource 406360be region lines 3-183 byte-identical to parent 76-256 (181 lines, 985a92d9), 512 floor, 30/5/1/2 s, no dispatch; parse fc975d1a ParseFile-only + line-59 normalization same/different, pins before/after, <15 s, 7F creation; closure eb080980 three placeholders, two 1 s queries 500 ms apart, <10 s, stop at window end, 8192 cap, no kill. Conditions: receipt records exact pinned shell/argv; Root proves window and parse-minus-resource <30 s from outputs; tc25 clean check needs core.longpaths (plain status shows 2 false deletions); substitution only from complete exit-0 parse output, rendered hash first; any non-zero/late/unknown/still-present FAIL; offline15 separate | not admission or dispatch | doc 199.`

Not execution, admission, dispatch, approval, push, deployment or production consent; not human approval.
