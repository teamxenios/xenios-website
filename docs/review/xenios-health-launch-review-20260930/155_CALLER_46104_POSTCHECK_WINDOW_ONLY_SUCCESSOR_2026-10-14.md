# Single-PID caller postcheck: window-only successor comparison

**CONFIRMED.** The successor binding is byte-identical to the Doc 153 binding except for the three window
timestamps. The new window is valid. No defect.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only byte
comparison and JSON fields. No query was made, no output was created, no agents. Compared at 18:10:11 to 18:10:19Z,
inside the window. Archive: `hl12/155_caller_46104_postcheck_window_only_successor.json`.

## Comparison

| Record | Bytes | SHA-256 |
|---|---|---|
| Old binding, Doc 153 | 12,740 | `33e0a6c7…` |
| Successor `DOC160_EXACT_SINGLE_CALLER_POSTCHECK_WINDOW_ONLY_SUCCESSOR_UNADMITTED_20261014.json` | 12,740 | `b2660a02…` |
| Root's frozen record `DOC160_ACTUAL_ONE_POSTCHECK_WINDOW_ONLY_SUCCESSOR_FROZEN_20261014.json` | 6,741 | `b2555b67…` |

- **Only the window changed.** The two bindings have the same length. The only differing bytes are on the three
  window lines. With the old window restored, the successor's JSON equals the old binding exactly.
- **Body unchanged.** The payload, the command, the query, the options, the pinned `pwsh.exe`, the output path,
  the limits and the closure interpretation are all unchanged. So are the original `preparedAt` and the
  process ID 46104 with creation time `16:10:45.2358933Z`. So Doc 153's payload, action and scope confirmation
  carries over without re-review.
- **New window.**

| Field | Value |
|---|---|
| Start | `2026-10-14T18:04:37.000Z` |
| End | `2026-10-14T18:24:37.000Z` |
| Last start | `2026-10-14T18:24:27.000Z` |

  It is 20 minutes long, and the last start is 10 s before the end, the same rule as the old window. One attempt,
  no automatic extension.
- **Output path.** `C:/Users/sboad/.codex/tmp/ql-doc154-r6-caller46104-postcheck-20261014-r1` does not exist now.
- **Distinct window.** This is a separate window under the existing section 6 failed-run postcheck class. It is not
  an extension of the expired one, and it does not use the consumed counter ticket or the Doc 146 window. The old
  window stays recorded as expired, not run, with zero queries.

## Still required, and what the result means

- **Before the call.** Core's acknowledgment of this exact successor, then Root's sole admission, then Core's final
  readiness and one call before `18:24:27.000Z`.
- **If the window is missed.** It stays not run. There is no automatic extension.
- **What the result means.** A complete query with zero rows, or a creation time more than 1 ms off, closes only
  the caller's operational reservation. A matching, late, incomplete or ambiguous result stays held for Samuel. The
  counter stays FAILED either way.

Not execution consent, not human approval and not test credit.
