# Clock exception and new window: actual approval comparison

**MATCHES. Samuel approved exactly the payload confirmed in Doc 143, and the window satisfies the collector's
rule.** Root's `DOC145_ACTUAL_HUMAN_INVOKING_OWNER_CLOCK_AND_NEW_WINDOW_APPROVAL_20261014.json` (11,414 B,
`0deacf96…`, board `672c9d2`) holds Samuel's answer "Approve this exact clock exception and window". The decision
is `60ee8959…`. The record embeds a payload equal to the prepared Doc 144 payload, and it recomputes to that
identity. Root's clock-observed acknowledgment is 13:24:23 UTC; the message ID and receive time are not exposed.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Compared at about
13:26 UTC. Read-only. Archive: `hl12/144_clock_exception_approval_window_comparison.json`.

## Comparison

- **Approved action.** The single invoking-owner clock exception confirmed in Doc 143, on the unchanged
  `0bc62fe7` diagnostic under `bb3f8e62`, with every source, pin, limit, arm, output and command field as in
  Doc 141.
- **Window.** Starts 13:24:23.000Z, which is the acknowledgment time. Ends 13:44:23.000Z, exactly 20 minutes later.
  Last start 13:44:03.000Z, which is ends minus 20 s, matching the collector's lines 84–85. One attempt, with no
  extension, retry or stop. Both earlier windows are closed and not reused.
- **Remaining, in order:**
  1. Root's slot and fixed ticket.
  2. Core's FINAL READY on the ticket hash and current head.
  3. Root's frozen hash-bound command and anchor rule.
  4. Core's real, unadjusted last-action UTC sample and single native call, before 13:44:03Z.
  5. Evidence review against Docs 138 and 140. The executed command, sampled UTC, external start and return, and
     native wall time are kept distinct, with external monotonic null.

Not a G0 result, test credit or release credit.
