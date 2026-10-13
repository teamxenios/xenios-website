# Revision 18: finalization-controls parent, identity-acquisition successor (source only)

**SOURCE ACCEPTED, with the retained limits below. No correction.** The successor parent at Core `60f64fc0` (tree
`6560661e`; 17,188 B `31674d82…`) replaces the single immediate identity read that failed in the actual R2 with a
bounded loop that re-reads the same retained child handle only while that child is live, sleeps 10 ms between reads,
checks the 5-second child and 20-second work clocks before and after every read, refuses a changed creation time or
a non-pinned executable at once, refuses a child that has exited before its identity was verified, and records only a
fixed phase and .NET exception type names on failure. The final one-line delta from the preserved `d7c64c55` proposal
is exactly the post-read `HasExited` refusal immediately before the verified branch that Root's support pass found
missing. The three fixtures differ from the doc 115-accepted bytes only in the two `attempt-identity-r1` output
literals; both R3 slices are byte-identical to the accepted ones; the case assertions, bounds, environment, caps, no-
stop rule and provisional finalization are unchanged.

Reviewer: this session, `claude-fable-5-1`, revision 18. Read-only, no agents, nothing parsed, imported, executed or
probed. Application `8e85daa`/`25507c2f`, docs 104–117, all accepted receipts and the doc 117 diagnostic disposition
unchanged and not duplicated here. Archive: `hl12/118_controls_identity_successor_source.json`.

**Where the bytes are.** Core `60f64fc0`, new namespace
`doc104-baseline-reconciliation-20261013/finalization-controls-identity-source-proposal/`: parent blob `64b8f42e`
17,188 B `31674d82…`; `late-second-quiet.ps1` 8,247 B `1661a218…`; `late-receipt-write.ps1` 8,248 B `f3e8af53…`;
`write-failure.ps1` 8,243 B `2663618f…`; `r3-finalization.slice.ps1.txt` 3,762 B `7c685cef…` and
`r3-write-functions.slice.ps1.txt` 403 B `9587eb57…` (both identical to doc 115); `PINNED_INPUTS_SOURCE_ONLY.json`
3,153 B `dd690c5b…` (8 rows); `PROPOSAL.json` 7,065 B `f289f5cf…`; cumulative `MECHANICAL_DIFF.patch` 14,666 B
`4e71442c…`. Every Root packet file under `DOC116_REVISION18_CORRECTED_CONTROLS_REVIEW_READY_20261013/` is
byte-identical to the Core blob its `ROOT_RAW_INDEX.json` names. Predecessor `d7c64c55` (tree `0d59451d`): parent
17,125 B `69453f43…`, same fixtures, slices and pins except the parent row. The records worktree
`C:/xenios-wt/tc25-app-manifest-20261012` (at `2876254`) holds all six source files at the pinned paths with the pinned
digests. The doc 115 source `2dc86167`, the actual R1 (`80a778e3`) and R2 (`21f777df`) records are preserved and not
reinterpreted here; no partial aggregation of R2's first case is made.

## 1. Deltas, verified from bytes

- **Doc 115 parent (`fcd6fd15…`) → 60f parent.** Four hunks, matching the cumulative patch: (1) `$fRoot` to the new
  namespace and `$fOut` to `attempt-identity-r1`; (2) the per-case row gains `phase`, `failurePhase`,
  `exceptionType`, `innerExceptionType`, `identityAttempts`, `identityLastObservation`,
  `identityLastExceptionType`, `identityLastInnerExceptionType`, and the two original identity lines are replaced by
  the loop at lines 86–122; (3) phase markers `CHILD_EXIT` and `CASE_EVIDENCE`; (4) `COMPLETE` on success and the
  three failure fields in the per-case catch. Nothing else: ticket, pin-file hash binding, eight-input set, pinned
  runtime, R3 and fixture slice binding, output freshness, 512 MiB floors, child environment and argv, stream reads
  with the 16 KiB cap, exit-1/lifetime/stdout-empty assertions, case inventory and per-case assertions, partial
  preservation, dispose-only-after-exit, post pins, finalization deadline and the provisional status are the doc 115
  bytes.
- **d7 parent → 60f parent.** One inserted line (112): `if($p.HasExited){throw 'CHILD_EXITED_BEFORE_IDENTITY'}`,
  after the creation-stability check and immediately before the verified branch. Nothing else.
- **Fixtures.** Each differs from doc 115 only at lines 13–14 (`$dOut` prefix and the `$cTicket.output` literal, both
  `attempt-identity-r1`); identical between d7 and 60f.
- **Pins.** Rows 1–2 (R3 parent `b98f7a25…`, pinned pwsh) unchanged; rows 3–8 relocated to the new namespace; only
  row 7 (0-based; the parent) differs from d7. The parent's set check normalizes separators and case, so the
  backslash spellings in rows 3–8 match its forward-slash literals; `-LiteralPath` accepts either.

## 2. The identity loop (lines 86–122), as read

Start; record PID; acquire the handle. Loop: refuse on child or work deadline; refuse if already exited; count the
attempt; `Refresh()`; read `StartTime` and `MainModule` from the retained handle inside a try whose catch records only
`identityLastObservation = READ_EXCEPTION` and the outer and inner exception type names; refuse on deadline after the
read, so a late synchronous return cannot qualify; if a creation time was read and differs from a previously recorded
one, `CHILD_CREATION_CHANGED`; the new post-read `HasExited` refusal; if both creation and a non-blank executable were
read, the executable must normalize to the pinned pwsh (`CHILD_EXECUTABLE` otherwise, with no retry), then
`VERIFIED`; else one more exited check and a 10 ms sleep. Only after `VERIFIED` are the stream readers attached. The
retained handle means `StartTime` cannot drift and PID reuse cannot substitute a process; the loop's only purpose is
to outlast the transient window in which a just-started process exposes no module list (the condition the actual R2
recorded as a null executable), and it does so without restarting or respawning anything. A child that exits inside
that window fails closed at one of three `HasExited` checks, and a child that never exposes its module list fails
closed at the 5-second child or 20-second work deadline. The receipt gains a fixed phase vocabulary
(`CHILD_START`, `CHILD_IDENTITY`, `CHILD_STREAMS`, `CHILD_EXIT`, `CASE_EVIDENCE`, `COMPLETE`), the attempt count, the
last observation kind, and type names only; no messages, stacks, environment or private paths are serialized.

## 3. Retained limits and prerequisites

- The post-read `HasExited` check is a sample taken after the metadata returned; it is not an atomic guarantee
  against an exit a moment later. Synchronous `Refresh`/`StartTime`/`MainModule` reads are cooperative; the
  before/after clock checks reject an overrun but cannot interrupt a stalled call. Overrun cannot qualify.
- Stream readers attach only after identity is verified; for these fixtures, which write nothing before their final
  marker, the pipe cannot fill in that window. The loop is time-bounded, not attempt-bounded.
- Everything in doc 115 §5–§6 still applies: these are three synthetic negative controls; they prove nothing about
  the real census, shim handle-to-CIM key equality, the five-line pre-identity output, Git configuration facts, the
  R3 disposal move on a real census or any positive path. Ticket as UTF-8 without BOM; clean pwsh stderr under the
  reduced child environment; Root reserves the slot since the parent takes no competing-process census.
- Owed before the controls count: a new finite ticket binding the whole pin file (`dd690c5b…`) and the eight rows,
  `output = attempt-identity-r1`, one fresh 512 MiB reading and an exclusive slot; the actual run with all three
  children exiting 1 with their exact evidence, parent exit 0, outer start/end timing, post pins unchanged, and an
  independent closure of the exact child identities. The consumed R1/R2 tickets do not carry over; R2's first-case
  proof is not combined with any later run. The real Git diff check separately still needs the current-host census
  under one second, shim/CIM identity equality, the pre-identity, configuration and default-index facts, and the
  host-exclusive 30-second window (doc 114 §8).

No execution consent follows from this acceptance.
