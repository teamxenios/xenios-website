# Two-arm PerfOS diagnostic: new window approval comparison

**MATCHES. The new approval changes only the window, and the window satisfies the collector's rule.** Root's record
`DOC141_ACTUAL_HUMAN_NEW_DIAGNOSTIC_WINDOW_APPROVAL_20261014.json` (9,331 B, `8212b68c…`, board `b99f1fe3`) holds
Samuel's answer "Approve the new 20-minute window" to decision `c1a8e6a5…`. Root's clock-observed acknowledgment is
12:43:01 UTC. The message ID and receive time are not exposed, as with Doc 140.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Compared at about
12:54 UTC. Read-only; no query or process. Archive: `hl12/141_diagnostic_new_window_comparison.json`.

## Comparison

- **Unchanged diagnostic.** Field by field, the new payload is identical to the Doc 140 approval:
  - action contract `e4b53989…`, collector `d8e990cb…`, child `c4dbfc0b…` and pwsh pin;
  - quote-free native command and native options;
  - bounds, the ordinary-then-rebuilt arms, the output path, the operation and the allowed output;
  - owner, session, task, lease and worktree.
  Its immutable diagnostic source is the Docs 138/139 commit `0bc62fe7` (tree `d4d43d1b`).
- **Current head.** Core `bb3f8e62` (tree `072488c8`) adds only the expiry receipt and continuity on top of the
  applied `c7f852aa`. The two-arm diagnostic namespace has no diff since `0bc62fe7`, so Docs 138, 139 and 140 still
  bind the files that would run.
- **Old window.** 12:11:24–12:31:24Z expired with no attempt and no query. It is closed and is not reused.
- **New window.** Starts 12:43:01.000Z, which is the acknowledgment time. Ends 13:03:01.000Z, exactly 20 minutes
  later. Last start 13:02:41.000Z, which is ends minus 20 s, matching the collector's lines 84–85. One attempt, no
  extension, retry or stop. A prelaunch after 13:02:41 is refused and consumes the window.

## Unchanged from Doc 140

- **What a complete result needs:**
  - native exit 0, no session left and untruncated output;
  - two arm captures, ordinary then rebuilt, each with identity, exit, EOF and hashes;
  - a 2/2 pair summary and unchanged pins;
  - each arm exit 0 with `QUERY_COMPLETED` or `QUERY_FAILED`. `QUERY_FAILED` is never G0, a pass or a cause proof.
- **Timing.** Native wall time, external UTC and the child stopwatches stay distinct, and external monotonic stays
  null.
- **Anything else** is `INCOMPLETE`, with the reservation held.
- **Root's items:** custody, slot, pins, absent output, a fresh fixed-path ticket and the substituted command. They
  remain Root's, and this comparison does not substitute for them.

Not a G0 result, test credit or release credit.
