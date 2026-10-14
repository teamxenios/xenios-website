# CMD image path correction, narrow byte confirmation

**CONFIRMED. Doc 130's correction requirement is met.** The CMD binding successor at Core `82fe41df` (tree
`1fef61bc`, parent `a715a5bb`) is SOURCE-COMPATIBLE with retained limits. The caller's one changed line is exactly
the line Doc 130 required. The executor, requirements and handoff carry the new caller identity consistently.
Nothing else changed. The fix is not runtime-proven: neither the optional proving check nor any attempt has run.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, Opus 5.5 in the same session. Read-only;
nothing parsed, imported, executed or probed. Archive: `hl12/132_cmd_image_path_correction_confirmation.json`.

## What I compared

Root had not yet registered this commit or archived a raw packet when I reviewed it, so I bound the Core blobs
directly. The handoff records its status as `DOC130_ONE_LINE_CMD_FILENAME_CORRECTION_NARROW_CONFIRMATION_PENDING`.

| File | Bytes | SHA-256 | Blob |
|---|---|---|---|
| `invoke-proving-with-observer-gate.ps1` | 25,455 | `b2225a0d…` | `81af0ac7` |
| `capture-proving-caller.ps1` | 17,176 | `fa7f72d2…` | `6bf35fe2` |
| `CALLER_TICKET_REQUIREMENTS.json` | 11,145 | `46f375d7…` | `40cb838e` |
| `SOURCE_HANDOFF.json` | 16,090 | `4e69a191…` | `3315c006` |
| `SOURCE_DELTA.patch` | 7,671 | `1e1a5d49…` | `9593770a` |

- **Commit scope.** The five files above plus the three `.xenios` continuity files. The edit is made in place in the
  unaccepted Revision 26 namespace. Commit `9e5e545d` stays immutable in history and Root's Revision 26 snapshot is
  untouched, so that is acceptable.
- **Caller.** One line differs from `9e5e545d`. Line 19 changes from `$lCmd='C:/Windows/System32/cmd.exe'` to
  `$lCmd='C:\Windows\System32\cmd.exe'`. In a single-quoted PowerShell string the backslashes are literal. The file
  length is unchanged. `$lCmd` is still used only at lines 199, 202 and 235, as Doc 130 checked.
- **Executor.** One line differs: the caller hash constant becomes `b2225a0d…`. The 25,455-byte pin, all capture
  logic and the outputs are unchanged.
- **Requirements.** `sourceSha256` and `newCallerSha256` become `b2225a0d…`. `supervisorDirectParent` now states
  `C:\Windows\System32\cmd.exe`. Nothing else changed.
- **Handoff.** It pins all four other files at the values in the table. The executor `sourceSha256` in the future
  admission block is `fa7f72d2…`. A new `doc130Correction` block records the Doc 130 commit, the superseded diagnosis
  and that no runtime attempt was made.
- **Delta.** `SOURCE_DELTA.patch` covers exactly the three changed files. Its changed lines equal the real diff
  from `9e5e545d`.
- **Not added.** The optional guard against a `/` in the CMD file name was not added. That was optional, so this is
  not a gap.

## Unchanged from Doc 130

Everything Doc 130 accepted in the successor still holds:

- the allowlisted, unquoted backslash literal for the pwsh and supervisor paths;
- the separator-normalized discovery and observer matching;
- the direct CMD parent and the unique live supervisor barrier;
- retained identities, exits and lifetimes, EOF and caps;
- gate before closure, the private `-cmd-r3` outputs and all bounds;
- the executor review.

## Remaining before a counter run

1. Root's decision on the held R2 reservation. Doc 131 covers the postcheck that can inform it.
2. Optionally, the Doc 130 proving check: `C:\Windows\System32\cmd.exe /d /s /c exit 7` with the caller's launch
   settings must return 7 and create nothing. If it is skipped, the next attempt's startup barrier is the first
   runtime evidence.
3. A fresh counter ticket at the fixed path, binding all of the following:
   - caller `b2225a0d…` at 25,455 B and executor `fa7f72d2…` at 17,176 B;
   - requirements `46f375d7…`, the native command template for the executor path, and the doc 130 and doc 132
     commits as disposition references;
   - the exclusive reservation, a finite window, real 512 MiB supervisor admission, and absent `-cmd-r3` and
     `attempt-counter-r1` outputs.
4. Owner acceptance only on the full conjunction:
   - native exit 0 with complete output, and executor `CALLER_EXECUTOR_CAPTURE_PASS`;
   - caller exit 0 under its limit, and gate PASS;
   - the independent closure, and the supervisor and child contracts.

Not execution consent, ticket, waiver, test credit or release GO. Application `8e85daa`, tooling `3dd3d96`, the
frozen proving sources, floors, all failures and occupied outputs, and the security incident hold are unchanged.
