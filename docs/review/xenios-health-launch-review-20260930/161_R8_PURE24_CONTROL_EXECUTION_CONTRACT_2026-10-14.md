# R8 pure 24-control execution contract

**CONFIRMED as sufficient for the pure-unit scope only.** The native file-redirection contract in Core `14bdf5a4` is
an adequate way to run the 24 pure identity controls that Doc 160 requires. That holds with the acceptance framing in
section 3 and the limits in section 4.

No other credit follows: no counter, scheme, closure, resource, browser or release credit, and no consent.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5, same session. Read-only: Git blobs,
JSON fields, hashes and existence checks. Nothing was run or parsed as code, and no agents were used. Archive:
`hl12/161_r8_pure24_control_execution_contract.json`.

## 1. Binding

- **Commit.** Core `14bdf5a4` (tree `5e086f7c`, parent `9e1ddbc0`) adds exactly one file:
  `identity-qualified-closure-r8-pure24-entry-preparation/CONTROL_EXECUTION_TEMPLATE.json`, 23,330 B `adc2bda0…`, blob
  `851af1ee`. Root's mirror is byte-identical.
- **Pins.**
  - The fixture is 6,871 B `5118b193…`, blob `848639fd`, the exact file Doc 160 reviewed.
  - The runtime is `pwsh.exe` 301,368 B `362a356c…`.
  - Both match on disk.
  - The required closure is 14,620 B `a153292c…`, blob `1e6be1b8`. The canonical closure is still R7, 7,081 B
    `02dd023e…`, so the fixture would refuse on its own pin today, as the template says.
- **Command.** It is 498 B `7338a1fc1d7ece68a96b813feda8f5e79e15bb489349903d8f6097db022c30c4`. That is exactly the
  accepted Doc 137 prefix, the pinned `pwsh.exe -NoProfile -File` and the fixture, followed by
  `1><stdout path> 2><stderr path>`. It has no quotes, no space before `&&`, one `&&`, no pipe and no spaces in any
  path. The options are `cmd.exe`, login false, the Core worktree, yield 1,000 and maximum output 3,000.
- **Outputs.** Both are under `C:/Users/sboad/.codex/tmp`, which exists. Neither file exists now.

## 2. Why this route is needed and why it is enough here

The existing capture executor is closed to the counter and scheme groups. It requires a caller receipt, an observer
gate and a closure, none of which a pure fixture produces. So it cannot host these controls, and the template is
right not to stretch it.

For this scope, the stronger guarantees of the group contract are not needed:
- The fixture starts no process.
- It makes no CIM, resource, network or file-write call.
- It evaluates 24 in-memory vectors against the pinned, hash-checked closure helper block, and prints one JSON object
  only if all 24 match.

What has to be shown is that this exact fixture, on these exact closure bytes, produced exactly the expected 24
outcomes. A final native return with exit 0, plus complete redirected files, shows that. With no descendants, the
files are complete once the single `pwsh` process and its `cmd.exe` parent have returned.

**Timing evidence.** Today's native records show this tool waits about 10 s before yielding, despite the 1,000 ms
request:

| Run | Result |
|---|---|
| R6 counter | Returned final at 7.31 s |
| Postcheck | Returned final at 0.54 s |
| R7 counter | Returned a session at 10.005 s |

So a run under 5 s should come back final. A session or a late return fails, as the contract says.

## 3. Acceptance framing for Root

All of these are required:

1. **Native result.** The first native result is final, with no session, exit 0, a finite wall time under 5,000 ms and
   empty combined output.
2. **Stdout.** The file is at most 16,384 B and contains exactly one line: the compact JSON object, UTF-8 without a
   byte-order mark, followed by one line ending. No other bytes are allowed.
   - Its fields are `kind` `PURE_CLOSURE_IDENTITY_CONTROLS`, `sourceSha256` `a153292c…`, `count` 24, the 24 `cases` in
     the template's exact order with equal `case`, `expected` and `actual` values, and `realProcessesQueried`,
     `timingMeasured` and `groupAcceptance` all false.
   - Missing, extra, duplicated, reordered or unequal entries fail.
3. **Stderr.** The file exists and is exactly 0 B.
4. **Hashes.** The fixture, the applied closure and the runtime are rehashed right before and right after the call,
   and must equal the pins.
5. **Output paths.** Both are freshly absent right before the call, with a reparse-free parent chain and a sole-owner
   reservation. A collision means no invocation.
6. **Preservation.** Any failure, session or late result is preserved as it is, with no stop, retry or retroactive pass.

## 4. Limits

- **Not cleared.** The environment is the native tool's, not the executor's cleared table, so module paths are
  inherited. That is acceptable for a pure check whose output must match exactly. It is not group evidence.
- **Engine side effects.** PowerShell may write its own startup or cache files. That is not claimed absent, and it is
  outside the fixture's code path.
- **Post-return checks.** The 5 s bound is a check after return. It does not enforce termination, and the output cap
  is a file-length check, not a write cap.
- **Not shown.** There is no separate end-of-stream flag, no retained-handle lifetime and no process-absence claim.
- **Dependency.** The run is valid only after the five-path exception, its application and my applied-byte
  confirmation. Before then the fixture refuses by design.

## 5. Still held

1. Samuel's exact corrected five-path exception, payload `8a360515…`, which is still pending.
2. Same-owner application and my applied-byte confirmation.
3. Root binds this exact command, the paths, the source and runtime hashes and the limits under section 6. Root also
   sets a finite window, an exclusive slot and fresh absence checks.
4. Core gives fresh readiness, then one call.
5. Then the separate fresh 32-case counter window and ticket follow, with my comparison, admission and one call.

The R7 run under ticket `790af2ce` stays FAILED, and its outputs are not reused. The payment and security holds stay
open. The fixed one-hour target was missed and is not reset.

Not execution consent, not human approval and not test credit.
