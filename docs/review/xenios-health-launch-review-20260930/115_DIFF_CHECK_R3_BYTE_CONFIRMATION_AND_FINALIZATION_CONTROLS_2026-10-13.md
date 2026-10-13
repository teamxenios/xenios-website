# Revision 16 A and B: diff-check parent R3 byte confirmation, and the three finalization proving controls (source only)

**A — CONFIRMED.** The R3 parent `execute-admitted-exact-diff-check-r3.ps1` (19,110 B `b98f7a25…`, Core `50e2609a`,
tree `e3c6e6c2`) differs from the accepted R2 (`74e17f7f…`) by exactly the one line
`foreach($p in $dHandles){$p.Dispose()}`, removed from R2 line 252 and reinserted as R3 line 236, immediately after
`cleanupStopElapsedMs` is recorded and before the first cleanup census. Same byte count, no CR bytes, 289 lines both;
removing that one line from each file leaves identical text. This is precisely the doc 114 §6 correction; the
alternative control named there is no longer needed. The pins template changes only the self row (path and hash);
the other five tuples are the retained historical observations and must be re-verified at admission, as its own note
says. Doc 114's acceptance of R2 carries to R3 unchanged; the proving checks 2–5 of doc 114 §8 remain owed.

**B — SOURCE ACCEPTED as three synthetic negative controls, with the predicates below.** The two slices are exact
one-occurrence substrings of R3; each fixture ends with the exact finalization slice and embeds the exact write
functions once; the three fixtures differ only in their case-name line; the simulated clock, census and time source
are explicit and labelled; the only real I/O is `CreateNew` plus flush into a fresh private case directory; each case
is expected to exit 1 with specific receipt, terminal-failure or sentinel evidence; no receipt can read as release
credit; the sequential parent binds all eight inputs plus the pin file through the ticket, spawns only the pinned
PowerShell, never stops a process, stops at the first mismatch, and is itself provisional until outer exit, timing and
closure are observed. They prove the three finalization behaviours and nothing else: not the real census, not handle
identity, not Git, not the positive path.

Reviewer: this session, `claude-fable-5-1`, revision 16 A/B, published without waiting for C. Read-only, no agents,
nothing parsed, executed or probed. Application `8e85daa`/`25507c2f`, all accepted receipts, docs 104–114 unchanged.
Archive: `hl12/115_diff_check_r3_and_finalization_controls.json`.

**Where the bytes are.** Root packet `DOC114_NEXT_SOURCE_PREREQUISITES_REVIEW_READY_20261013/` sub-folders `diff-r3/`
and `controls/`; each `ROOT_RAW_INDEX.json` names Core blob, bytes and sha256, and every Root file is byte-identical
to the Core blob it names. A: Core `50e2609a` `exact-diff-check-runner-r3-source-proposal/`: parent `b98f7a25…`
(blob `4d228e87`), `PINNED_INPUTS_SOURCE_ONLY.json` 1,915 B `8ffbaa4f…`, `PROPOSAL.json` 4,180 B `eec6e70f…`;
`ROOT_R3_ONE_HUNK_BYTE_PROOF.json` states lines 252 → 236 and both digests, which I reproduced. B: Core `2dc86167`
(tree `341de43c`) `exact-diff-finalization-controls-source-proposal/`: `r3-finalization.slice.ps1.txt` 3,762 B
`7c685cef…`; `r3-write-functions.slice.ps1.txt` 403 B `9587eb57…`; `late-second-quiet.ps1` 8,229 B `9bc429c5…`;
`late-receipt-write.ps1` 8,230 B `454da196…`; `write-failure.ps1` 8,225 B `c4bbc676…`;
`execute-admitted-finalization-controls-proposed.ps1` 14,826 B `fcd6fd15…`; `PINNED_INPUTS_SOURCE_ONLY.json` 3,031 B
`61859a8b…` (8 rows); `PROPOSAL.json` 9,860 B `a3ac41f7…`. The records worktree
`C:/xenios-wt/tc25-app-manifest-20261012` (now at `2dc8616`) holds the R3 parent at the pinned path with the pinned
digest.

## 1. A: what was compared

Byte diff R2 → R3: one deletion at 252, one insertion at 236, nothing else. Context at R3 229–240: `}finally{`,
cleanup comment, `cleanupStartedMs`, `cleanupStop`, `dTerminalExit=1`, the two record fields, the moved disposal, then
`try{ do{` and the first deadline check. Disposal of exited children's handles before the census is the behaviour I
asked for; disposal of a still-running child's handle does not terminate it, and `D-StopExact` opens and verifies its
own handle. R3 `PROPOSAL.json` names doc 114 commit `66005a4`, the R2 predecessor, unchanged bounds, the same
remaining proving checks and admission predicates I listed, and `executedAsSource: false`.

## 2. B: slice binding, verified from bytes

- The finalization slice equals R3 bytes 15,348 to end of file (R3 line 229 `}finally{` through `exit 0` and the two
  trailing newlines); one occurrence in R3 and in each fixture, where it is the file's suffix.
- The write-functions slice equals R3 lines 46–51 (`D-Write` with `CreateNew`/`FileShare.Read`/`Flush($true)`, and
  `D-Json`); one occurrence in R3 and in each fixture.
- The three fixtures are byte-identical except line 5 (`$cCase`). Each is 122 lines, no CR, 62 preamble lines.
- The parent re-derives the same bindings at run time: R3 hash equals the ticket's `r3Sha256`, R3 text ends with the
  tail and contains the write slice (minimum lengths 1,000 / 200), and each fixture ends with the tail and contains
  the write slice (lines 49–56); the pins file hashes all five source files and the parent itself.

## 3. B: the fixtures (one preamble, three cases)

- **Ticket and output** (lines 1–19): ticket hash equals the mandatory argument; `approved`, mode
  `doc114-finalization-controls`, Core owner, `r3Sha256` `b98f7a25…`, now within `starts..ends`; `output` must equal
  the fixed `attempt-r1` directory, which must already exist (the parent creates it) and whose ancestors must be
  reparse-free; the case directory must not exist and is created fresh. All writes go there.
- **Explicit synthetic state** (lines 20–35): `$dClock` is a mutable object starting at 1,000 ms; `D-Utc` returns
  `SIMULATED_MS_<n>`; `D-Observe` throws on a third call, sets the clock to 1,100 then 17,000 (late-second-quiet) or
  1,700 (others), and returns empty `live`/`ambiguous` with `simulated=true`; `D-StopExact` throws; `$dHandles`,
  `$dOwned` empty; `$dRecord.candidate` is `SIMULATED_FINALIZATION_CONTROL_NOT_RELEASE` with the R3 digest and case
  name.
- **Exact writers, wrapped once** (lines 36–48): the byte-exact `D-Write`/`D-Json` are defined, the original `D-Json`
  script block is captured, and a wrapper calls it and only in late-receipt-write, only for `receipt.json`, advances
  the clock to 17,000 after the real serialization, write and flush have returned. The R3 cleanup, write and terminal
  code is appended unchanged after an empty `try {`.
- **Expected traces.** Late-second-quiet: cleanupStop 16,000; first quiet at 1,100; second census returns at 17,000
  → the post-census check throws `CLEANUP_DEADLINE` → `failure CLEANUP_INCOMPLETE`, one quiet, status
  `FAILED_OR_INCOMPLETE`, receipt written at 17,000 → `terminal-failure.json` (`afterWriteElapsedMs` 17,000), exit 1.
  Late-receipt-write: quiets at 1,100 and 1,700, status `PRELIMINARY…`, receipt written, clock then 17,000 →
  `terminal-failure.json`, exit 1 with the provisional receipt left untouched. Write-failure: a sentinel
  `receipt.json` (`CONTROL_CREATE_NEW_COLLISION` + LF) is created first with the original writer; the real `CreateNew`
  then raises `IOException`, the catch writes `FINAL_RECEIPT_WRITE_FAILED_OR_INCOMPLETE` to stderr, no
  terminal-failure file, exit 1; no ACL or permission change, no pre-existing user file. Nothing is written to stdout
  in any case.

## 4. B: the sequential parent

Ticket (lines 33–39): reparse-free path, hash equals argument, fields incl. `exclusiveExecutionReserved=true`, bounds
20,000 / 10,000 / 30,000 / 5,000 ms, 512 MiB, 16,384 B, 1 attempt, 0 retries, 0 stops; window ≤ 20 min with
`lastStart = ends − 45 s`. Pins (40–47): pin-file hash equals the ticket's `pinsSha256` (ninth binding), exactly eight
normalized paths {self, pinned pwsh, R3 parent, two slices, three fixtures}, each reparse-free with bytes and hash;
re-verified after the cases together with the pin file and ticket (152–153). Runtime must be the pinned pwsh (48).
Output absent, nearest existing ancestor reparse-free, G0 512 MiB ×3, `lastStart` rechecked (57–67). Per case
(74–150): work deadline, pinned pwsh child `-NoProfile -NonInteractive -File <fixture> -AdmissionSha256 <sha>` with a
cleared environment (System32 `PATH`, private `HOME`/`USERPROFILE`/`TEMP`/`TMP`), identity from the retained handle
(PID, creation, main module must be the pinned pwsh), both streams read as bytes with a 16 KiB combined cap, child
deadline 5 s; after exit: exit code must be 1, lifetime ≤ 5 s, stdout empty; case directory must hold exactly
`control-setup.json` + `receipt.json` (+ `terminal-failure.json` except write-failure), no subdirectories or reparse
points, no file over 16 KiB; `control-setup.json` must carry the case, `SYNTHETIC_FINALIZATION_ONLY` and
`noReleaseCredit`; then the case assertions: write-failure sentinel text and exact stderr marker; late cases
`candidate`, `sourceSha256`, `cleanupStopElapsedMs 16000`, terminal `FINAL_RECEIPT_WRITE_EXCEEDED_DEADLINE`
`afterWriteElapsedMs 17000` `requiredExitCode 1`, stderr empty; late-second-quiet `FAILED_OR_INCOMPLETE` /
`CLEANUP_INCOMPLETE` / one quiet / `beforeReceiptWriteElapsedMs 17000`; late-receipt-write `PRELIMINARY…` / no failure
/ two quiets / `beforeReceiptWriteElapsedMs 1700`. Any throw preserves partial streams and rethrows, so a later
fixture never runs after a failed one; children are disposed only after they exit and are never killed. Finalization
(159–171): `finalizationStop = min(30000, start + 10000)`, receipt with status
`PRELIMINARY_THREE_NEGATIVE_CONTROLS_PROVEN_REQUIRES_OUTER_EXIT_AND_CLOSURE` or `FAILED_OR_INCOMPLETE`, post-write
overrun → `terminal-failure.json`, exit 0 only with no failure, three rows all passed and none unclosed, and both
deadlines unexpired at the final line.

## 5. What B does and does not prove

Proves, once actually run with exit 0 and outer timing: the late second census is not credited (the quiet count stays
1 and the cleanup failure is recorded); a provisional receipt physically written late coexists with a terminal-failure
record and exit 1; a receipt write failure yields the stderr marker, exit 1 and no overwrite of the colliding file.
Does not prove: real census time, shim handle-to-CIM key equality, the five-line pre-identity output, Git config
facts, the effect of the R3 disposal move on a real census, or any positive path. Those remain separate predicates
before or at the actual diff-check admission, exactly as both proposals say. Direct exit 1 counts only with the exact
case evidence; a generic parse or setup error exiting 1 fails the parent's assertions.

## 6. Observations and predicates (no corrections)

- The fixture reads the ticket with `UTF8.GetString` + `ConvertFrom-Json`, the parent with `Get-Content -Raw`; a
  UTF-8 BOM on the ticket would fail the fixture only. Predicate: write the ticket as UTF-8 without BOM.
- The child environment carries no `APPDATA`/`LOCALAPPDATA`/`PSModulePath`; pwsh resolves its paths through known
  folders, but any startup noise on stderr fails the two late cases (`UNEXPECTED_STDERR`) and the write-failure case
  (exact marker). Proving item on the first run; fail-closed.
- The 5 s child budget includes pwsh cold start and one real 500 ms sleep; the 20 s work budget covers all three
  children and the post-pin pass. Fail-closed if the host is slow.
- Unlike the diff parent, this parent takes no competing-process census; `exclusiveExecutionReserved` is Root's
  reservation claim. Predicate: Root reserves the slot and no other admitted group runs concurrently.
- `MainModule` of a just-started pwsh child may transiently be unreadable; .NET retries, and a persistent failure is
  `CHILD_EXECUTABLE`/generic failure, never a pass.
- The fixtures never check the pins file themselves; the parent's pre/post pin pass and the ticket's pin-file hash
  cover them, and the pins bind the fixture bytes, so a swapped or edited fixture fails `INPUT_PIN_MISMATCH`, and a
  mislabelled one fails `SETUP_BINDING`.

## 7. Scope

No execution consent follows from A or B. The actual diff-check admission still needs a fresh finite Root ticket
naming the R3 self path and hash, the five other rows re-verified, the live index re-hashed, the doc 114 §7
configuration facts recorded at admission and closure, and the outer exit/timing plus independent closure. C (the
owned-endpoint pre-navigation diagnostic runner) is reviewed separately in doc 116.
