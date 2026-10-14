# Revision 26 item 1: CMD binding successor, source disposition

**CORRECTION REQUIRED before any new counter admission. The successor changes the wrong seam.** The frozen successor
at Core `9e5e545d` (tree `8bb220a8`) keeps every Doc 128 and Doc 129 invariant and its companion executor is sound,
but the R2 failure archive shows CMD never parsed the caller's `/d /s /c` string at all. CMD found a `/c` inside its
own image path, `C:/Windows/System32/cmd.exe`, which the caller passes as `ProcessStartInfo.FileName` with forward
slashes, and ran the built-in `md` command over the rest of its command line. The successor leaves that file name
unchanged, so a run of these bytes would fail at the same boundary and consume another ticket.

The smallest correction is one line in the caller: spell the CMD file name with Windows separators,
`$lCmd='C:\Windows\System32\cmd.exe'` at line 19, then re-pin the caller in the executor and requirements. The
successor's unquoted backslash rendering of the two inner paths can stay; it is compatible once CMD actually reads
its arguments.

Reviewer: original reviewer `6abf1edf-2b16-476e-8305-23b9a0014e06`, revision 26 item 1, model Opus 5.5 in the same
session. Read-only; nothing parsed, imported, executed or probed. Source24 and Doc 129 stay accepted within their
scope, with the one Doc 129 finding recorded in section 6. Archive: `hl12/130_cmd_binding_successor_source.json`.

## 1. Bytes

- Root `DOC129_REVISION26_CMD_BINDING_REVIEW_READY_20261014/`: caller 25,455 B `38550cc3…` (blob `61c7306a`),
  executor 17,176 B `62740ca1…` (blob `5662c79b`), requirements 11,152 B `770d5ce4…`, handoff 15,127 B `7625fe56…`,
  delta 7,395 B `beac5cf8…`, `.gitattributes` 8 B. Each is byte-identical to its Core blob.
- Commit scope is the three `.xenios` continuity files plus the six new files. The seven predecessor and accepted
  inputs are unchanged blobs at the successor commit: caller `42f9fcab`, executor `c72e6f2b`, supervisor, observer,
  closure, manifest and addendum.
- `SOURCE_DELTA.patch` carries exactly the hunks of the real old-to-new diffs. In the caller: the self path, the
  private output `caller-<group>-cmd-r3`, the scheme prior-receipt path, and the CMD rendering block. In the executor:
  self path, caller path, caller hash and 25,455-byte pin, and the private `-cmd-r3` outputs. Nothing else changed.

## 2. What R2 actually shows

The caller passed `FileName = C:/Windows/System32/cmd.exe`, and .NET quotes the file name when it builds the
command line. CMD therefore received:

```text
"C:/Windows/System32/cmd.exe" /d /s /c ""C:/Users/…/pwsh.exe" -NoProfile -File "C:/xenios-wt/…/execute-admitted-synthetic-proving.ps1" -ProvingGroup counter -AdmissionSha256 bd01…abd60"
```

The first `/c` in that line is the start of `/cmd.exe"`, not the caller's switch. Everything after it becomes the
command:

```text
md.exe" /d /s /c ""C:/Users/…/pwsh.exe" -NoProfile -File "C:/xenios-wt/…/execute-admitted-synthetic-proving.ps1" -ProvingGroup counter -AdmissionSha256 bd01…abd60"
```

CMD treats `md.exe` as the built-in `md`, and every recorded fact follows from that:

| Evidence in the R2 archive | Explained by `md` over that text |
|---|---|
| Six directories in the caller's working directory: `-NoProfile`, `-File`, `-ProvingGroup`, `counter`, `-AdmissionSha256`, the ticket hash | `md` creates one directory per valid token in its working directory, which is `caller-counter-r1` |
| Creation times 09.8736, 09.8746 ×3, 09.8756 ×2, in argument order, inside CMD's 09.8423–09.8770 lifetime | `md` walks its tokens left to right |
| No directory for either path | The first token is `.exe /d /s /c C:/Users/…/pwsh.exe` once its quotes pair up, and the supervisor token is `C:/xenios-wt/…ps1`. Both contain `/` and `:` and are rejected |
| `The filename, directory name, or volume label syntax is incorrect.` captured once, stderr EOF false | That is the first of two rejections. The caller stopped reading when CMD exited |
| CMD exit 1 after 34.68 ms | `md` sets errorlevel 1 after a rejected token |
| No pwsh child found under the CMD PID | `md` is internal, so CMD started no process |

A quoting or separator problem inside the literal cannot produce directories named after the arguments. So the
successor's own diagnosis, that the generic error cannot distinguish quotes from separators, is right about the
message alone but misses the directory evidence. That evidence points at neither. It points at the CMD image path.
I have not reproduced this, and the proving check in section 5 is how the owner confirms it.

## 3. What the successor would do

With the file name unchanged, CMD again takes `/cmd.exe"` as `/c`. The command becomes `md.exe" /d /s /c
C:\Users\…\pwsh.exe -NoProfile -File C:\…\execute-admitted-synthetic-proving.ps1 -ProvingGroup counter
-AdmissionSha256 <hash>`. The quote after `.exe` is now never closed, so `md` sees one token containing `/` and `:`
and rejects it. The result is CMD exit 1, no supervisor and `SUPERVISOR_NOT_FOUND_LIVE` within 5 s. It consumes a
third ticket, though probably without creating directories this time.

## 4. Required correction and its effects

- **Change.** Caller line 19 becomes `$lCmd='C:\Windows\System32\cmd.exe'`. Optionally add a guard that the CMD file
  name contains no `/` and matches a drive-letter backslash shape, in the style of the successor's existing check.
- **Effects, checked against every use.** `$lCmd` appears only at line 19, in `caller-start.json` (199), in the one
  CMD launch (202) and in the observer-ancestry comparison (235). Identity at launch and the ancestry comparison both
  go through `L-Norm`, which normalizes separators, so they are unchanged. The frozen observer reads CMD's
  executable from CIM, which reports the real image path however CMD was started. `caller-start.json` will record the
  backslash spelling, which is the point.
- **Keep.** The successor's literal, `/d /s /c` followed by the unquoted backslash pwsh path, `-NoProfile -File`, the
  unquoted backslash supervisor path, the enum group and the hex hash, is safe. Both paths pass a strict
  drive/letter/digit/`._-` allowlist and round-trip under `L-Norm`, and no quote or CMD metacharacter can appear.
  With `/s` and no leading quote, CMD strips nothing. The started pwsh command line then carries backslash paths.
  Caller discovery at line 212 and the frozen observer both apply `Replace('\','/')` before matching the supervisor
  path. Their group and hash regexes do not depend on separators. The supervisor compares `$PSCommandPath` through
  `F-Norm`. So the rendering change itself is compatible.
- **Companion updates.** New caller bytes need a new caller hash and byte pin in the executor, the requirements file
  and the handoff. The requirements' `supervisorDirectParent` text must state the backslash file name. The executor
  and the native transport need no other change. The executor starts pwsh directly, and R2 proved that the
  forward-slash pwsh file name works for a pwsh child. The native transport reached the executor in R2 under its own
  shell setting.

## 5. Proving check for the correction

Before the next admission, the owner can confirm both the cause and the fix with one cheap launch that needs no
proving ticket and starts no child process:

- **Pass case.** In a fresh empty private scratch directory, use the caller's exact `L-Start` settings: no shell
  execute, hidden window, cleared and rebuilt environment, both streams redirected, that directory as working
  directory. Start `C:\Windows\System32\cmd.exe` with arguments `/d /s /c exit 7`. Require exit code 7, empty stdout
  and stderr, and the directory still empty.
- **Negative control, optional.** Repeat with `C:/Windows/System32/cmd.exe`. The defect predicts a non-7 exit with
  the volume-label syntax error, because `md` receives one unclosed quoted token.
- This check uses only the CMD binary and the internal `exit` command. It is a local synthetic launch whose
  authority is Root's to bind under the standing local scope. It earns no proving-group credit. If Root skips it, the
  first evidence for the fix is the next counter attempt's startup barrier.

## 6. Doc 129 accountability

Doc 129 accepted this CMD seam and did not identify the forward-slash image-path behaviour. Its stated failure mode
held: the run failed closed well inside 5 s with partial CMD streams preserved and no process started. But `md`
created six empty directories in the private caller directory, which Doc 129 did not foresee. Doc 129's other
findings are unaffected. The R2 run earns no credit of any kind.

## 7. Executor, reviewed in full for the first time

The executor `capture-proving-caller.ps1` was not in front of me at Doc 129, so I read all of it here.

- **Binding.** It checks its self path and pinned runtime, the ticket hash and scope, and an executor object with
  path, hash, bytes, output, three non-empty references and a reservation reference equal to the caller's. It also
  checks the caller path, hash, output and limit, exact bounds (outer 210/120 s, caller 180/90 s, capture 185/95 s,
  identity 5 s, preflight 10 s, reserve 5 s, 16 KiB, 1/0/0), window format and `lastStart` rule, and all three
  invocation arrays. Before start and after the result it rehashes the ticket, the caller (25,455 B), pwsh and
  itself. All three outputs must be absent. Preflight must finish within 10 s and before `lastStart` − 15 s, and the
  same margin applies at caller launch.
- **Capture.** It starts the caller directly as pwsh with the six-element argv plus the hash, with no supervisor path
  anywhere. It retains the handle and captures identity with the pinned executable within 5 s. It reads both streams
  with 1 KiB asynchronous reads to EOF under 16 KiB, takes exit and lifetime from the handle with a creation-equality
  check and lifetime under 180/90 s, and keeps a capture deadline.
- **Acceptance.** It requires exit 0 and empty stderr. It refuses when `caller-failure.json` exists, both before
  and after reading. It requires the receipt's status, group, hash, caller hash, caller PID and creation, gate PASS,
  closure accepted and zero stops and retries. The gate file hash must equal the receipt's, and the closure stdout
  hash, empty stderr, status, group, hash, exit 0, lifetime under 10 s and both EOF flags must match. It rehashes the
  three records and writes `CALLER_EXECUTOR_CAPTURE_PASS` with `ownerConjunctionStillRequired` and
  `releaseCredit false`.
- **Failure handling.** Partials, typed failure record, `reservationReleased false`, exit 1, and only exited
  processes disposed.
- **Verdict on the executor.** It satisfies my Doc 129 prerequisite for the executor record. It also closes my
  Doc 129 observations about a receipt coexisting with a failure file and about starting the caller early enough.
  Its own lifetime is reported only by the native transport, which is acceptable for the outermost layer; adding
  another observer above it is not wanted. The fixed `doc129` field stays the predecessor reference. The new
  disposition belongs in `executorComparisonRef` and `callerSourceDispositionRef`.

## 8. Remaining prerequisites

1. Freeze the one-line caller correction, the companion re-pins and the requirements text, and submit them for a
   narrow byte confirmation. I will confirm against this disposition without re-reviewing unchanged logic.
2. Optionally run the section 5 check under Root's binding before the counter admission.
3. Resolve the held R2 reservation separately. See Doc 131.
4. For the next counter admission: a fresh ticket at the fixed path carrying the corrected caller and executor
   identities, the new disposition references, exclusive reservation, finite window, real 512 MiB admission in the
   supervisor, absent `-cmd-r3` and `attempt-counter-r1` outputs, and the native transport command for the new
   executor path.
5. Owner acceptance remains the full conjunction: native exit 0 with complete output, executor
   `CALLER_EXECUTOR_CAPTURE_PASS`, caller exit 0 under its limit, gate PASS, the independent closure, and the
   supervisor and children contracts.

Not execution consent, ticket, waiver, test credit or release GO. Application `8e85daa`/`25507c2f`, tooling
`3dd3d96`/`7a4ce7c3`, the frozen supervisor, observer, closure, manifest and addendum, the browser 2,048 MiB floor,
the later 30 s controls bound, all failures and occupied outputs, and the security incident hold are unchanged.
