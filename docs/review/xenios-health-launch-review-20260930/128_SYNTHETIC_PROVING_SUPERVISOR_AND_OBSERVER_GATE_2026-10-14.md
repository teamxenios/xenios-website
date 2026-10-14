# Revision 24: sequential synthetic proving supervisor, observer, closure, manifest and the mandatory observer-result gate

**SOURCE-COMPATIBLE with retained limits, taken together with the mandatory addendum. No required source
correction.** The frozen supervisor (23,155 B `bfbe6d19…`), observer (4,328 B `c4dde5b6…`), closure (7,078 B
`c0a0e272…`) and whole manifest (26,295 B `32dcd697…`) at Core `2d97340f` (tree `7404997e`), plus the addendum
(4,015 B `44413e31…`) at Core `d201070f` (tree `fa4d30a0`), form a coherent, fail-closed proving design for the two
accepted synthetic groups. The supervisor enforces an exact ticket (fields, bounds, literal six-element invocation,
window with `lastStart = ends − aggregate − 45 s`, manifest hash), an exact selected-input set per group, pre- and
post-run pins, the fixture-to-parent 28-line containment before and after, a real 512 MiB admission reading with the
accepted counter slice and its own 30-second startup fence, a non-resetting real outer envelope anchored to its own
process creation, per-child identity from a retained handle with the pinned executable per command, cooperative
deadlines, capped byte capture of both streams, exact per-case output contracts, and a provisional receipt that never
claims completion. The observer independently binds the one supervisor process by command line, pinned executable,
handle-versus-CIM creation agreement and `cmd.exe` ancestry, and records actual exit and lifetime. The closure binds
observer rows, receipt, per-case streams and hashes, two known-PID absence checks (plus runner-parent absence for the
scheme group), post pins and immutability. The addendum correctly identifies that two observer rows do not prove the
observer's own exit, and makes an externally captured observer result (exit 0, lifetime, complete streams, identity)
a mandatory conjunct before closure and before any credit; I agree, and nothing in the frozen source needs to change
for that.

Reviewer: this session, `claude-fable-5-1`, revision 24. Read-only; nothing parsed, imported, executed or probed.
Docs 124–127 closed; application `8e85daa`/`25507c2f` and tooling `3dd3d96`/`7a4ce7c3` unchanged. Archive:
`hl12/128_synthetic_proving_supervisor_and_observer_gate.json`.

**Where the bytes are.** Root `DOC125_127_REVISION24_PROVING_SOURCE_REVIEW_READY_20261014/`: eight files, each
byte-identical to the Core blob its `ROOT_RAW_INDEX.json` names (source commit `2d97340f`; records-and-addendum
commit `d201070f`, whose tree carries the same seven source blobs plus the addendum). `SOURCE_HANDOFF.json` 10,152 B
`350bbd78…`, `STATIC_SOURCE_BYTE_PROOF.json` 4,222 B `85133694…`. Every pinned path in both manifest groups resolves to
the pinned bytes on this host today, including the binaries the handoff says were copied rather than rehashed.

## 1. Manifest coherence, verified

- Counter group: seven selected pins (pwsh, supervisor, observer, closure, fixture `c43d4b22…`, counter parent
  `fc6ea41b…`, `SYNTHETIC_PROVING_SOURCE_REQUIREMENTS.json`), plus the manifest as the eighth ticket input; fifteen
  cases whose names, kinds, exit codes and bare stderr tokens equal the fixture's own expectation table (thirteen
  refusals exit 1; `valid-floor` expects 512 MiB and `valid-fast` 1,024 MiB, exit 0), each with the literal child
  command `pwsh -NoProfile -NonInteractive -File <fixture> -TestCase <name>`.
- Scheme group: nine selected pins (pwsh, supervisor, observer, closure, Node 20.19.0, old driver `b2f0901d…`, new
  driver `5c90b077…`, canary `ad9b6548…`, the scheme `ASSEMBLED_SOURCE_HANDOFF.json`), plus the manifest as the tenth;
  one case with the literal command `node --max-old-space-size=256 --test <canary>` and nineteen test names that
  equal, in order, the names the canary generates.
- Bounds: counter 90 s work, 10 s finalization, 120 s aggregate, observer 135 s; scheme 20 / 10 / 30 s, observer
  45 s; both 5 s per direct child, 16 KiB combined child streams, 10 s closure, one attempt, zero retries, zero stops;
  parent output caps 256 KiB per file and 1 MiB total. These touch neither the later three-controls parent's 30 s nor
  the browser 2,048 MiB floor.

## 2. Supervisor, as read (lines)

- **Envelope and admission.** Outer age sampled once from `Process.StartTime` (11–12) and combined with a Stopwatch in
  `F-Outer` (47–49), checked with reserves before admission (137) and output creation (167), after each case
  (175, 247, 250), after post-pins (272, 277), after the receipt write (291) and on the final exit line (296). The
  accepted counter admission slice (138–165) keeps its own 30-second startup fence in both modes, so admission is a
  real OS-free/available/commit reading at 512 MiB, independent of the fixture's mocked numbers.
- **Ticket and inputs.** Hash equals the argument (103); `approved`, mode `sequential-synthetic-proving`, group,
  Core owner, output `attempt-<group>-r1`, exclusive reservation (105); exact per-group bounds and
  `counterOperationTimeoutSec = 2` (106); invocation exactly `[pwsh, -NoProfile, -File, <self>, -ProvingGroup,
  <group>]` with normalized executable and script paths (107); window ≤ 20 min with `lastStart = ends − (aggregate/1000
  + 45) s` and now within it (109); manifest hash equals the ticket's (111); the group's pin paths must equal the
  required set exactly (116–122); the case names are a closed ordered set (123–124) and each case command equals the
  literal expected array (125–128); pins hashed (129), fixture-to-parent slice containment re-derived from the
  fixture's own markers as 28 lines plus trailing newline occurring exactly once in the counter parent (89–101, 130),
  runtime is the pinned pwsh (131), output absent and ancestors reparse-free (132–136).
- **Per case.** Fresh child with cleared environment (System32 `PATH`, private `HOME`/`TEMP`), identity from the
  retained handle with the expected executable taken from the case command (pwsh or Node) and the doc 118 loop
  semantics (188–224), bounded 1 KiB reads of both streams under 16 KiB (226–239), exit code must equal the case's
  expected code and lifetime strictly under 5,000 ms (246), then the output contract (249). Refusals: stdout exactly
  empty and stderr equal to the bare token after trimming only trailing CR/LF, so a full PowerShell error record
  fails (57–59). Successes: stderr empty, stdout exactly one line (CRLF normalized), closed outer and resource key
  sets, kind, case, `calls` 2, both booleans false, numeric fields finite and non-negative, the expected MiB,
  floor 512, timeout 2, read under 2,000 ms, the fixture's own 30-second age arithmetic and ordered timing fields,
  and a UTC timestamp (61–75). Scheme: no `not ok`, bail-out, skip or todo lines; exactly nineteen `ok N - <name>` and
  nineteen `# Subtest: <name>` lines in the manifest's order; and `TAP version 13`, `1..19` and the complete
  `19/0/19/0/0/0/0` summary each exactly once (76–87). An unexpected exit 2, a missing case or any mismatch throws and
  stops the group; partial streams are preserved; children are disposed only after exit and never stopped.
- **Finalization.** Post pins, slice re-derivation and manifest/ticket hashes (274–276); status
  `PRELIMINARY_SYNTHETIC_GROUP_PROVEN_REQUIRES_OUTER_EXIT_AND_CLOSURE` or `FAILED_OR_INCOMPLETE`; finalization stop
  `min(aggregate, start + 10 s)`; receipt, terminal-failure on overrun; exit 0 only with no failure, all cases passed and
  closed, and every clock including the real outer envelope unexpired (278–297).

## 3. Observer and closure, as read

- Observer: ticket hash and scope; after 200 ms, exactly one `pwsh.exe` other than itself whose command line contains
  the supervisor source path (17–19); that command line must carry `-ProvingGroup <group>` and `-AdmissionSha256
  <hash>` (21); retained handle; handle and CIM creation within 1 ms (25); executable equals the pinned pwsh (27);
  parent must be `cmd.exe` (28–29); first JSON row; wait up to aggregate + 15 s; `PROVING_OUTER_UNCLOSED` and exit 3 if
  the parent has not exited; second JSON row with actual exit and lifetime; exit 1 unless exit 0, lifetime below the
  aggregate and the observer's own clock within its window (31–42).
- Closure: ticket and manifest; `observer.stdout.bin` ≤ 16 KiB whose hash equals the supplied parameter; exactly two
  rows, same group and hash, zero stops, same parent PID and creation, recomputed lifetime within 0.01 ms, exit 0 and
  lifetime below aggregate (31–38); receipt bound to the observer's parent identity, provisional status, no failure,
  full case count, no terminal-failure (39–43); each case's name, exit code, lifetime, flags, identity fields and
  stream hashes with per-stream and combined 16 KiB caps (49–62); two CIM absence checks 500 ms apart over the parent,
  `cmd.exe` ancestor, observer and every child PID, plus any process whose parent is the scheme runner (63–78); post
  pins; manifest and ticket hashes; ten-second ceiling (79–91). It states `departedWorkerLifetimeMeasured: false` and
  `globalKernelGuarantee: false`.
- **The addendum's finding is correct.** The observer can emit both rows and still exit 1 when its own observation
  clock has expired, and the closure sees only the rows. The frozen source is unchanged; the gate is an external
  conjunct: actual observer identity (pinned pwsh, script hash, group, ticket hash, PID equal to the first row's
  `observerPid`), exit code exactly 0, OS creation-to-exit strictly below 135,000 ms (counter) or 45,000 ms (scheme),
  complete stdout and stderr to EOF with stderr empty and bytes, lengths and hashes preserved, no retry or stop, all
  recorded before the closure is invoked, and the future ticket binding the addendum hash. I agree with the ordering
  and with the three-part acceptance: exact outputs and parent/children success, gate PASS, and independent known-scope
  closure, none substituting for another. The addendum's reading of the handoff's `outputsAbsent: false` as an
  existence boolean matches `STATIC_SOURCE_BYTE_PROOF.json`, and the on-disk outputs are indeed absent.

## 4. The Node worker evidence limit, dispositioned

Node 20 runs each `--test` file in a separate child process. The supervisor measures the direct runner only: its
handle-derived creation, exit and lifetime under 5 s, its exit code and both streams. The runner exits only after its
child completes, its exit code aggregates the child's result, and its stdout relays the child's TAP, so the lifetime
bound and the output contract do cover the inner process's work; the inner process's own creation, exit and lifetime
are not individually captured, and the closure's two checks for any process whose parent is the runner PID (parent
PIDs persist on Windows after the parent exits) are absence evidence at two instants, not a family or kernel
guarantee. **Disposition: this limit is accepted for the scheme proving group only**, because the canary is
source-reviewed (doc 127) to read two pinned files and perform no network, browser or application action, so an
undetected straggler could only be a Node process holding those two files. It is not one-process equivalence, it is
not a waiver, and it does not transfer to the browser diagnostic, the controls or any scope with external effects.

## 5. Exact prerequisites before any run

- An execution owner holding the exclusive slot, with the applicable human-scope comparison recorded for the exact
  runtime authority (the recorded authoring scope is not that comparison).
- A concrete launcher that starts the supervisor as a direct child of `cmd.exe` with the literal invocation plus
  `-AdmissionSha256`, then starts the observer with the same group and hash after the supervisor process exists and
  before it exits (an observer that finds zero or several candidates fails), captures the observer's stdout and
  stderr to EOF under 16 KiB with exit code and retained-handle creation and exit, writes the gate record with hashes,
  and only then writes `observer.stdout.bin` and invokes the closure with that hash.
- Per group, in order counter then scheme: a fresh finite ticket at the fixed path with mode, group, owner,
  `attempt-<group>-r1` output, exclusive reservation, the group's bounds and `counterOperationTimeoutSec 2`, the literal
  invocation, a real issuance window, the manifest hash and the addendum hash; the consumed ticket archived before the
  next is issued; never reused.
- Fresh 512 MiB admission inside the supervisor; pre- and post-run pins with the binaries actually rehashed; outputs
  absent beforehand.
- Acceptance only when all three hold: exact outputs with parent exit 0, every child under 5 s with its contract met,
  real parent lifetime strictly below the group aggregate; the externally captured observer gate PASS; and the
  independent known-scope closure with post pins and immutability.

## 6. What a pass would and would not establish

Counter: that the exact 28-line admission slice refuses empty, multiple, missing, null, negative and non-finite
readings, refuses a late return, propagates a throw, applies the three floors and the negative headroom, accepts the
exact floor and records the four timing fields, in fifteen fresh processes. Scheme: that the extracted handler maps
the twelve schemes, the unknown scheme, relative and malformed URLs to the enum, leaks no canary byte, preserves the
record shape, acceptance, refusal and the 64 cap. Neither measures RAM, proves a real two-second counter read,
exercises the parent-age branches, runs the finalization controls, the Git diff census, the browser diagnostic or
anything about the release. No execution follows from this disposition; consumed tickets, failures and private
profiles stay as they are.
