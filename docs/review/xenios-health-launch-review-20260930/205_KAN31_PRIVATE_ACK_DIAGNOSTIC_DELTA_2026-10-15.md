# KAN-31 private-acknowledgment diagnostic labels: changed bytes and actual static evidence

**CONFIRMED: no gap in this delta.**

- **The change.** `human-private-staging-input-once.ACK_DIAGNOSTIC.ps1` (15,211 B, `bd5b273a…`) differs from the Doc 204
  corrected helper (`6a86664d…`) **only** in six `$siPhase` failure-stage labels. One existing label is renamed and five
  new label assignments are inserted. No guard, prompt, recipient, limit or launch logic changed.
- **The evidence.** The actual pinned PowerShell 7 static check reports 0 parse errors before and 0 after, exactly six
  rules, and all other bytes unchanged.
- **What this is not.** Not helper execution or setup authority. The consumed Doc437 attempt is not reusable.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects,
hashes and my own `diff`; no execution; no agents. Doc 204 and accepted evidence are preserved.
- **Timing.** Compared at 2026-10-15T23:59–00:00Z.
- **Jira.** Root relays.

Archive: `hl12/205_kan31_private_ack_diagnostic_delta.json`.

## 1. The delta

- **Commits.** Core `e3ced91b` (tree `127eabd0`, parent `ba237e11`) adds the diagnostic helper. Evidence `37e1c55f`
  (tree `360b8bdb`) adds the result. Exactly four files are added, and tc25 is clean with long paths.
- **My diff** of `6a86664d` against `bd5b273a` shows exactly one changed line and five inserted lines, all inside the
  acknowledgment block:
  1. `PRIVATE_OPERATOR_ACK` becomes `PUBLIC_ACK_CONSOLE_OUTPUT`, before the two disclosure `WriteLine` lines.
  2. `PUBLIC_ACK_READ_HOST` is inserted before the acknowledgment `Read-Host`.
  3. `PUBLIC_ACK_COMPARE` is inserted before the exact-phrase check.
  4. `PUBLIC_ACK_WINDOW` is inserted before `SI-Window`.
  5. `PUBLIC_ACK_SCRATCH_CREATE` is inserted before the directory creation and record set-up.
  6. `PUBLIC_ACK_MARKER_WRITE` is inserted before `SI-WriteOnce` of `operator-attempt.json`.

  This matches the six `onlyAllowedRules` in `EXACT_DIAGNOSTIC_DELTA_IDENTITY.json` (3,107 B).
- **Where the label is reported.** The `catch` already records `failurePhase=$siPhase` without exception text. The
  record is always printed to the console after `finally`, so these labels reach Samuel even when the failure comes
  before `operator-result.json` has a path. That holds for any stage before scratch creation.
- **What the labels distinguish.** The six statements the old label covered can now be told apart. Samuel saw no prompt
  in the last attempt; that is consistent with either a disclosure-output failure or a `Read-Host` failure. These labels
  separate those two, but the historical cause remains **unknown**, and the public-only `PROMPT_OK` check does not prove
  the helper's behavior.

## 2. Actual static evidence

- **The literal.** `STATIC_PHASE_DELTA_AND_PARSE_LITERAL_PROPOSED.ps1.txt`, 3,740 B, `1a543f88…`, matches.
- **The run.** Native `2d62da`, requested 23:57:22.539Z and returned 23:57:23.083Z: inside the stated window
  23:56:59Z–00:00:59Z, with a deadline of 00:01:59Z. Core's preflight came at 23:57:17.850Z.
  - Wall 0.33 s, exit 0, one attempt, no stops.
  - The output is one JSON line: before 0 errors, after 0 errors, `exactPhaseRules 6`, `allOtherBytesUnchanged true`,
    `helperInvocations 0`, `passed true`.
- **Limits.** Static parse plus literal equality only. The budget is cooperative, there was no process census, and the
  outer channel was combined.
- **Records observation (not material).** Unlike Doc433, I found no separate Root admission file for this call that was
  committed before it ran. The window and authority appear in the Core evidence and in Doc439, written at 23:58Z after
  the call. Because the call was a static parse only and its evidence is complete, this does not change the result.
  Future admitted calls should keep the pre-run admission record.

## 3. Remaining conditions

1. **New exact records.** Any new human attempt needs a new decision record whose `snippetPin` is the diagnostic
   helper's path and `bd5b273a`, plus Samuel's new concrete approval, readiness, admission and fresh window, and a new
   exact command.
2. **No reuse.** The Doc437 decision, grant and attempt are consumed and may not be reused or retried.
3. **Run time.** A fresh 2,048 MiB G0.
4. **Separately controlled.** Staging scope and the deferred populated Doc399 query.
5. **Afterwards.** My final-result review.

NOT LIVE.

Comment text for KAN-31, for Root to relay: `REVIEW | KAN-31 | private-ack diagnostic labels (Core e3ced91b / tree 127eabd0; evidence 37e1c55f / tree 360b8bdb; helper bd5b273a) | reviewer 6abf1edf | CONFIRMED, no gap in delta: diff vs 6a86664d = 1 renamed + 5 inserted $siPhase labels (CONSOLE_OUTPUT, READ_HOST, COMPARE, WINDOW, SCRATCH_CREATE, MARKER_WRITE), matching the six allowed rules; no guard/prompt/recipient/limit/launch change; labels reach the console record even before a receipt path exists; actual static 2d62da exit 0 in window: before 0 / after 0 parse errors, 6 rules, other bytes unchanged, 0 helper invocations. Historical cause stays unknown; PROMPT_OK is not helper proof. Records note: no pre-run admission file (window only in evidence and post-run Doc439), not material | new attempt needs decision with snippetPin bd5b273a, Samuel's new approval/readiness/window, new command, fresh 2048 G0; Doc437 not reusable | doc 205.`

Not execution, setup, invocation, approval, push, deployment or production consent; not human approval.
