# Two-arm PerfOS diagnostic: actual approval, action and window comparison

**MATCHES. The human approval names exactly the source, action and bounds of Docs 138/139, and the window satisfies
the collector's own rule.** Root's record `DOC140_ACTUAL_HUMAN_SOURCE_AND_DIAGNOSTIC_APPROVALS_20261014.json`
(18,813 B, `a4d31e63…`, board `e832b56c`) holds Samuel's answer "Approve this one bounded local diagnostic" to the
prepared decision `fe4e1b95…`.

The record does not include the message ID or receive time. I do not treat that as missing consent, because the
coordinator's acknowledgment at 12:11:24 UTC is clock-observed.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Compared at about
12:25 UTC. Read-only; no query or process. Archive: `hl12/140_diagnostic_approval_window_comparison.json`.

## 1. Approval against the confirmed source

| Item | Approved payload | Docs 138/139 |
|---|---|---|
| Source | `0bc62fe7` / tree `d4d43d1b` | same |
| Contract | 14,970 B `e4b53989…` | same |
| Collector | 15,798 B `d8e990cb…` | same |
| Child | 5,023 B `c4dbfc0b…` | same |
| Native command | two quote-free `set …=1&&` prefixes, then the pinned pwsh and collector with the two placeholders | same as Doc 138, meets Docs 136/137 |
| Bounds | 20 s whole, 10 s per arm, 2 s provider, 4 KiB / 16 KiB, 32 rows, 1 attempt per arm, 0 retries, 0 stops | same |
| Arms | ordinary first, rebuilt second only after actual exit, EOF and a full 10 s remaining | same |
| Output | `ql-doc134-two-arm-perfos-20261014-r1` | same |

The approved operation allows at most two unchanged queries, no other WMI or process query, no memory values, no
environment export and no stop or cleanup. That is exactly what the source does.

The separate four-file source approval `febaf2b1…` gives no runtime authority. If applying it moves the Core head,
the diagnostic's own pins still bind its files, and the execution tree must be recorded before admission, as Root
says.

## 2. Window

- Starts 12:11:24.000Z, which is the acknowledgment time, as the decision requires. Ends 12:31:24.000Z, exactly 20
  minutes later. Last start 12:31:04.000Z, which is ends minus 20 s. These are the collector's checks at lines 84–85.
- The window is one attempt with no extension. If the native prelaunch timestamp falls after 12:31:04, the collector
  refuses `FINITE_WINDOW` and the window is consumed. It cannot be renewed.

## 3. What a complete result needs

**Native.**
- Exit 0, no active session left, and complete untruncated output within the 18,000-token limit.
- The real prelaunch UTC used as the command argument, inside the window.

**Collector.**
- One `PERFOS_ARM_CAPTURE` record per arm, ordinary then rebuilt.
- Each with the arm's process identity, handle-based exit, lifetime under 10 s, both EOF flags, stdout and stderr
  hashes, and the child's closed-key record.
- Then the `PERFOS_PAIR_SUMMARY` reporting two attempted, two completed, and the conservative native-budget figure.

**Each arm.**
- Exit 0, empty stderr, and status `QUERY_COMPLETED` with a row count, or `QUERY_FAILED` with exception type and the
  allowlisted codes.
- `QUERY_FAILED` is a completed observation of a failure. It is never a G0 result, a pass or a cause proof.

**Timing.** Three figures stay distinct and none is relabeled:
- the native wall time;
- external UTC start and return;
- each child's query stopwatch.

External monotonic stays null.

**Incomplete states.** Any refusal, late arm, unresolved exit or capture gap means `INCOMPLETE`: the reservation
stays held, nothing is stopped or retried, and whatever records exist are preserved.

**Afterwards.** The pins of the collector, child, contract and pwsh are unchanged.

I will judge the result against the Doc 138 interpretation table.

## 4. Before Root admits

Root's own items remain: same-owner custody, exclusive slot, current pins, absent output, the ticket at the fixed
path with the contract hash, arm order, bounds and three references, and the fully substituted native command
frozen just before invocation. This comparison is Docs 138/139's original review applied to the actual approval and
window. It does not substitute for those items.

Not a G0 result, test credit or release credit.
