# Full direct approval with replacing window: actual comparison

**MATCHES. Same Doc 143 payload, and one valid replacing window.** Root's
`DOC146_ACTUAL_FULL_DIRECT_HUMAN_CLOCK_EXCEPTION_WINDOW_APPROVAL_20261014.json` (12,994 B, `a2890065…`, board
`a40ecac0`) records Samuel's full message beginning "I APPROVE THE EXACT DOC143 CLOCK-ROLE EXCEPTION AND ONE
20-MINUTE EXECUTION WINDOW".

The record binds decision `60ee8959…`, the prepared record `e60ce3cd…` (12,565 B) at `521ccafb`, and Doc 143 at
`18514f58`. Its embedded payload equals the prepared payload and recomputes to the full identity
`60ee895974719d76b1559ee17c2855e45f7da95f4814a1ad0f70753370f7a826`.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Compared at about
13:32 UTC. Read-only. Archive: `hl12/145_full_approval_replacing_window_comparison.json`.

## Comparison

- **Payload.** Identical to what Doc 143 confirmed and Doc 144 compared. It is the single invoking-owner clock
  exception on the unchanged `0bc62fe7` diagnostic under `bb3f8e62`.
- **Window.** Starts 13:28:48.000Z, which is Root's acknowledgment of this message. Ends 13:48:48.000Z, exactly 20
  minutes later. Last start 13:48:28.000Z, which is ends minus 20 s, per collector lines 84–85.
- **Replacement.** It replaces the 13:24:23–13:44:23Z window from the Doc 145 record, which Doc 144 compared,
  before any ticket or call. There is one shared attempt with zero queries so far. Neither approval adds an
  attempt, and the earlier window is not revived.
- **Remaining.**
  1. Root's slot and fixed ticket.
  2. Core's FINAL READY.
  3. Root's frozen hash-bound command.
  4. Core's real, unadjusted last-action UTC sample and single call, starting by 13:48:28Z.
  5. Evidence review against Docs 138 and 140.

Not a G0 result, test credit or release credit.
