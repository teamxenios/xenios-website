# Two-arm PerfOS diagnostic: method concurrence and delivery-sequence deficiency

**Method: CONCUR. Delivery sequence: one deficiency.** Finishing the existing bounded diagnostic, with no new
source, platform or layer, is the right choice. The latest executed failure is R3's line 148 PerfOS error, with
unknown cause, and no authorized equivalent browser path exists.

But the proposed sequence has Root sample the prelaunch timestamp and then deliver the command to Core. That cannot
reliably meet the collector's own timing guard, and the guard does not depend on who samples. The smallest
correction is for the invoking owner to sample the timestamp immediately before the native call.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only. Bound Root
checkpoint `56b46a77` (tree `12d6cf83`):

| Record | Bytes | SHA-256 |
|---|---|---|
| `DOC143_IMMEDIATE_REQUEST_ONLY_ACTUAL_SCOPE_20261014.json` | 2,488 | `ca2803f8…` |
| `DOC143_DOC141_SECOND_WINDOW_UNEXECUTED_ROOT_CLOSURE_20261014.json` | 3,184 | `c4e31f55…` |
| `DOC143_ONE_METHOD_EXECUTION_OWNER_RECOMMENDATION_20261014.json` | 2,386 | `03330222…` |

Archive: `hl12/142_diagnostic_method_and_delivery_sequence.json`.

## 1. Method concurrence

Concurred:
- One collector invocation of the unchanged `0bc62fe7` diagnostic, confirmed in Docs 138 and 139.
- It runs under the applied machinery at `c7f852aa` and current head `bb3f8e62`.
- All limits, the arm order, privacy, network and cleanup are as accepted.
- No source change, alternate platform or extra supervisor.

The diagnostic stays a diagnostic. It is not customer-journey, G0 or release evidence. The proving, browser,
admin and readback, diff, manifest, security, release, deployment and served-identity conditions all remain.

## 2. The deficiency

- **The 10-second budget.** The collector measures its budget from the `-NativeLaunchUtc` anchor:
  - At collector start the anchor must be under 20 s old (line 75).
  - Before creating output (line 98), and again before each arm launches (lines 116 and 118), it requires
    `anchor age + elapsed + 10 s < 20 s`.
  - So both arms must launch within 10 s of the anchor. The first arm alone takes about 2–4 s: pwsh start-up plus
    a query of up to 2 s.
- **Root-sampled anchor.** Under the proposed sequence, the 10 s would also have to cover Root composing and sending
  the message, delivery to Core's session, and Core's model turn to read it and issue the call.
- **The record shows that path takes far longer.** In the R2 postcheck, Root's admission was recorded at
  03:42:35.367Z and Core's call started at 03:43:48.868Z, about 73 s later. In the second diagnostic window, the
  handoff did not arrive before the last start at all.
- **Consequence.** The likely result is a collector refusal, `WHOLE_ALLOWANCE_UNAVAILABLE` or
  `STALE_OR_FUTURE_ANCHOR`, before any query. Under the one-attempt rule that consumes a third human-approved window
  and yields no diagnostic information.
- **Smallest correction.** Root freezes everything except the timestamp: ticket, ticket hash, command template with
  the hash substituted, native options, and the anchor rule. Core, the invoking owner, samples the prelaunch UTC as
  the last action before the native call, ideally in the same tool step that issues it. It substitutes only that
  value, records it with its own external start and return times, and then reports the full command as run.
- **Why this does not weaken the guard.**
  - Every collector check is unchanged: anchor format, anchor no later than the collector's own process start, age
    under 20 s, at least 10 s remaining at each arm launch, and the window bounds.
  - Forward-dating is impossible, because the collector refuses an anchor later than its process start.
    Backdating only shrinks the executor's own budget.
  - The native tool's wall time stays the independent duration evidence.
  - The 20 s bound keeps measuring what it was designed for, the run itself, not inter-agent messaging.
- **What it does to "no self-anchor".** This replaces that phrase in the sequence. It is a correction of where the
  timestamp is sampled, not a waiver.

## 3. Removing reviewer latency

A future window-only approval may change only `starts`, `ends` and `lastStart`. If it is byte-identical in every
other payload field to the Doc 141 approval, if its window is at most 20 minutes, and if
`lastStart = ends − 20 s`, then Doc 141 already covers it. Root may record that mechanical comparison and proceed.
I will confirm afterwards, not beforehand. Any other difference needs a new comparison first.

## 4. Corrected delivery sequence

1. Before requesting a window: nonvolatile source, pin, custody, output and options reads.
2. Window approval, then the window-only check from section 3, then Root's slot and fixed ticket.
3. Core verifies the ticket hash and current head and declares FINAL READY.
4. Root sends the frozen command template with the ticket hash and the anchor rule. Root does not sample the time.
5. Core samples UTC and makes the native call immediately, with no record write, reread or poll in between.
6. Core then records the anchor, external start and return, native wall time, exit, session state and full output.
7. If Core cannot sample and invoke inside the window's last start, Core stops: no call, no retry, no extension.

The evidence requirements stay those of Doc 140.

No authority, ticket, window or execution is created by this disposition.
