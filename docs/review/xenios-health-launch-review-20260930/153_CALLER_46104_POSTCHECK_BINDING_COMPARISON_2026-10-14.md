# Single-PID caller postcheck: binding and window comparison

**The payload, action and section 6 scope are CONFIRMED. The window is LAPSED and cannot be used.**

- **Window.** It ran from 16:33:08.382Z to 16:53:08.382Z, with a last start of 16:52:58.382Z. This packet reached me at
  about 17:53Z, an hour after it closed. Root had already recorded at 16:56:14Z that it expired with zero
  invocations and zero queries.
- **The correction is the window only.** A successor that changes nothing but the window fields needs only a narrow
  window comparison and a fresh Core acknowledgment. Everything else stays as bound: the payload bytes, the command
  hash and the output path, which is still absent.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: JSON fields,
a base64 and UTF-16LE decode, and hashes. Nothing was run and no process or provider was queried. No agents. Archive:
`hl12/153_caller_46104_postcheck_binding_comparison.json`.

## 1. Records

| Record | Bytes | SHA-256 |
|---|---|---|
| Pasted packet, equal to Root's `DOC154_SINGLE_PID_POSTCHECK_ORIGINAL_WINDOW_COMPARISON_PROMPT_20261014.txt` | 1,912 | `524aaea2…` |
| Binding `DOC154_EXACT_SINGLE_CALLER_POSTCHECK_BINDING_UNADMITTED_20261014.json` | 12,740 | `33e0a6c7…` |
| Root's expiry record `DOC154_ACTUAL_SINGLE_CALLER_POSTCHECK_WINDOW_EXPIRED_NOT_RUN_20261014.json` | 1,159 | recorded 16:56:14Z |

## 2. Payload and action

- **Command.**
  - The command is the quote-free Doc 137 prefix `set POWERSHELL_TELEMETRY_OPTOUT=1&& `, then the pinned `pwsh.exe`
    with `-NoProfile -EncodedCommand`. Nothing else follows.
  - Its hash `c23d2e31…` matches.
  - It has no quotes and no space before `&&`.
- **Payload.**
  - The base64 decodes as UTF-16LE without a byte-order mark to exactly the bound script text.
  - That text is 2,439 B in UTF-8, with hash `28e16546…`.
- **One query.**
  - The script makes exactly one `Get-CimInstance` call in `root/cimv2`, with a 2 s operation timeout.
  - The query text is exactly the bound query, hash `25131136…`.
  - It selects only `ProcessId`, `ParentProcessId` and `CreationDate`, filtered to process ID 46104 alone.
  - There is no stop, no other process cmdlet, no `Add-Type`, no dynamic invocation and no call operator.
- **Bounds.** An internal 10 s envelope, a 32-row cap, more than one row treated as ambiguous, and a 16,000 B evidence
  cap. The evidence goes to a `CreateNew` record in a fresh private directory, which does not exist now. One
  attempt, no retry. Exit 0 only for a complete query inside the envelope.
- **Scope.** This is exactly the observation Doc 152 section 4 named: Doc 131 failed-run postcheck class under
  section 6 `20041ef0…`. It does not use the consumed counter ticket or the Doc 146 diagnostic window.

## 3. Closure interpretation

Root's interpretation is confirmed:

- **The caller closes** if the query completes and returns zero rows, or returns a row whose creation time differs
  from `2026-10-14T16:10:45.2358933Z` by more than 1 ms. Root may then release the reservation as operationally
  closed.
- **The reservation stays held for Samuel** if the creation time matches within 1 ms. Nothing is stopped.
- **The reservation also stays held** if the query is incomplete, late, ambiguous or errors.
- **The 1 ms guard fits the data.** CIM creation times carry microseconds. Earlier today the observer's CIM creation
  time for the supervisor differed from the handle value by 0.0006 ms. So the same process would match, and a
  reused process ID would not.
- **What does not change.** The counter qualification stays FAILED. Nothing repairs the missing EOF or the invalid
  exit time, and no global closure is claimed.
- **Foreseeable outcome.** A slow provider fails closed and spends the window. Earlier today a filtered
  `Win32_Process` query with a 1 s timeout completed during the caller's discovery step, so 2 s is a reasonable
  bound, though not a guarantee.

## 4. Transport

This packet reached me because Samuel pasted it. Root's record shows Samuel chose to keep Computer Use paused. This
verdict is published on the review branch as usual. Root's R7 review packet (3,680 B `9a89e3a1…`) is recorded as
prepared but undelivered. I have not reviewed R7, and I will review it when it is delivered.

Not execution consent, not human approval and not test credit.
