# G0 R2 literal-build successor: diagnostic result and narrow comparison

**SUFFICIENT, with no material issue.**

- **Diagnostic.** The callsite test confirms the Doc 170 cause.
- **Adapter.** The R2 adapter removes exactly that one expression.
- **Entry.** The R2 entry changes only the declared items, and it also fixes the date-parsing fault that Root
  demonstrated.
- **Reuse, window and capture.** All are adequate for one G0 call followed by one conditional build.

This is not admission, invocation, or a capacity, build, test or deployment result.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git objects and
text. Nothing parsed or run, no agents. Docs 163–169 were not re-reviewed. Reviewed at 2026-10-15T03:05–03:10Z,
inside the window. Archive: `hl12/171_g0_r2_literal_build_successor_comparison.json`.

## 1. Binding

- **Root.** Doc 242 at `7e28fda`.
- **Core.** `f3424ff4` (tree `fafe3618`, parent `8e6723d`).
- **Records.** All match the packet's pins, and Root's frozen copies equal Core's files:

| Record | Bytes | SHA-256 |
|---|---|---|
| actual result | 11,108 | `642a265a…` |
| R2 adapter | 15,919 | `8b1e85ed…` |
| R2 entry | 3,202 | `8edcfb98…` |
| proposal | 17,069 | `624b5769…` |
| comparison-ready record | 8,196 | `1f50f1bd…` |

- **Reuse check.** Core's `REUSE_INPUT_CHECK.json` is 19,561 B, `6de74898…`.

## 2. Diagnostic interpretation: confirmed

- **What ran.** Ticket `264a4c65` was used once. Native chunk `6df5fe` exited 1 after a tool wall time of 0.6014555 s.
- **What it reported.** Stage `ARGUMENT_AND_FORMAT_CHECK`, `System.Management.Automation.RuntimeException`, category
  `InvalidOperation`, with a process age of 296 ms. There was no R7 call, memory query or build.
- **What it means.** This is exactly the Doc 170 confirming signal.
  - The `[Parameter()]` attribute makes the script advanced, so `$args` is unset. Reading it under StrictMode throws.
  - A token `throw` would have reported `OperationStopped`, and the fixed stop input is well-formed.
- **Limits, as recorded.** The tool exposes merged output only, so there is no separately measured stderr. Neither the
  `FullyQualifiedErrorId` nor the original message was captured. The fixture's exit 1 is the reproduced fault, not an
  application test failure.

## 3. R2 adapter: accepted

- **The change.** The old adapter (15,941 B, `4630d6b0…`) minus its one occurrence of `$args.Count -ne 0 -or ` (22 B)
  equals the new adapter byte for byte. No `$args` reference remains.
- **The guard.** It is now `if($StopAtUtc -cnotmatch …){throw 'G0_INVOCATION_BINDING'}`. Advanced parameter binding
  rejects extra named or positional arguments before the script body runs. Pwsh exits nonzero with stderr, and the
  entry refuses that.
- **Accepted code.** The accepted R7 slice (12,131 B, `e11e657d…`) is unchanged.
- **Static scan.** The code after the old failure point has never executed. A static scan finds no script- or
  global-scope references, and no variable read without an assignment or parameter.

## 4. R2 native entry: accepted

- **Changes.** Reversing these against the old `bd6c386b…` recovers it:
  - the adapter path, `g0-preflight-r1` to `g0-preflight-r2`;
  - three fresh output names, `g0-r2-result.json`, `g0-r2-stderr.txt` and `g0-r2-outer.json`, which the entry requires
    to be absent;
  - the stop literal `2026-10-15T03:41:00.000Z` in the G0 argument, the window check and the runner argument;
  - the admission label `DOC242_G0_R2_LITERAL_BUILD_20261015`;
  - `ConvertFrom-Json -DateKind String`.
- **Unchanged.** Floors, strict phase budgets, the closed-result checks, the 30 s limit, the 8,192 B limit, empty
  stderr, the full 720 s rule, and the continuous G0-to-build step.
- **Stop literal.** It satisfies both the adapter's `\.\d{3}Z` format and the runner's exact ISO round trip.
- **The date fix, correcting my Doc 169 note.**
  - Root's metadata run (`86c1b5`) shows that default `ConvertFrom-Json` turns `…Z` timestamps into `DateTime`. The
    implicit conversion back to a string then drops the zone and the milliseconds, and `Parse` reads the result as
    local time, five hours off.
  - That produced a false refusal in Root's precheck.
  - In the old entry it would have made the freshness check meaningless rather than refusing. The 30 s wall bound
    still held, but I called this kind- and culture-dependent, and it was in fact a real shift.
  - `-DateKind String` keeps the observed UTC string intact. Root's corrected precheck (`97e468`, exit 0) shows the
    parameter works in the pinned shell.

## 5. Reuse, window and capture: sufficient

- **Reuse.** Core's 02:57:30.99Z read-only check confirms:
  - all 28 physical pins match;
  - a clean, full-history checkout at exactly `47f49adf`/`a2a8e79d`;
  - no `run1`, dependencies, `dist` or r2 outputs.

  Not repeating the four preparation commands is correct. The runner re-checks pins, HEAD, tree, cleanliness and
  injection at startup, and this check must be repeated immediately before activation. The runner (`baaf43b1…`) and
  pins (`ce9ccf79…`) are unchanged.
- **Window.** Root's new operational window runs from 02:56:00.000Z to 03:41:00.000Z, with the last full start at
  03:29:00.000Z.
  - It is under the recorded human run instructions, Docs 223 and 239.
  - It is not an extension, and not claimed as a human-approved exact window.
  - Consumed tickets `404727c5` and `264a4c65` are not reused. The entry's `now + 720 s ≤ 03:41:00.000Z` check
    enforces the last start, and so does the runner's own check.
- **Capture.** The existing managed exec session runs pinned pwsh 7, login false, and is held for at least 780 s, with
  no detach, stop or relaunch. Yielding output is not a timeout. That satisfies the transport condition from Doc 169.

## 6. Still required, and limits

- **Before activation.** Core's fresh FINAL READY, with an exclusive single heavy job, a fresh repeat of the reuse
  checks, and Root's new ticket. That means one G0 call and one conditional build, with no retry.
- **Possible refusal.** A refusal is still possible in the newly reachable code: the R7 read, the thresholds or the age
  checks. It would fail closed.
- **Capacity.** It is unknown. The historical reading of about 1,403 MiB would not meet the 1,536 MiB floor.
- **Not in scope.** Tests, typecheck, browser, SQL, production and security work.
- **Security.** The exposure condition is OPEN and privileged staff reads are HELD.
- **Production.** The current manual production revision (`7bba…`) is not mixed-request source `47f49adf`.
- **Unchanged.** Custody stays as is: phase A active, return PENDING. R8 and Docs 160–170 stay closed, failed run
  `790af2ce` and tickets `404727c5` and `264a4c65` stay consumed, and the payment and security holds stay open.

Not execution, admission, push, deployment or production consent; not human approval; not capacity, build, test or
qualification credit.
