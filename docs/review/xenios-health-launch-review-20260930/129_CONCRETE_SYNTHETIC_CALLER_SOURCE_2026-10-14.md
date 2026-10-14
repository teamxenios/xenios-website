# Revision 25: concrete synthetic caller with observer-result gate, source disposition

**SOURCE-COMPATIBLE with retained limits. No required source correction.** The frozen caller
`invoke-proving-with-observer-gate.ps1` (24,985 B `59457370…`, blob `42f9fcab`) and `CALLER_TICKET_REQUIREMENTS.json`
(9,326 B `53e69f6f…`) at Core `9df9f1f5` (tree `75b37598`, parent `2c73341e`) implement every launcher prerequisite I
set in doc 128 section 5 and every actual-evidence requirement of the mandatory observer-result gate addendum, without
touching the accepted supervisor, observer, closure, manifest or addendum. The caller launches the supervisor as the
direct child of a hidden `cmd.exe` with one literal quoted command, discovers exactly one live supervisor under that
retained CMD PID, binds it by executable, command line, handle creation and CIM creation, starts the frozen observer
only while the supervisor is alive, drains CMD and observer streams concurrently to EOF under caps, records actual
exits and lifetimes from retained handles for CMD, supervisor, observer and closure, binds the two observer rows to
the retained observer PID and the retained supervisor identity, writes a flushed gate record before the
closure-visible stream exists, runs the independent closure only after all three processes have exited, and ends with
a receipt that claims nothing beyond a preliminary caller completion. What remains is external and exact: the
executor's record of the caller's own exit, the per-group ticket with references that resolve to real records, the
exclusive slot, fresh outputs, and the owner's three-part disposition.

Reviewer: this session, `claude-fable-5-1`, revision 25. Read-only; nothing parsed, imported, executed or probed; no
ticket, no process, no resource reading. Doc 128 (`8af08bc`) invariants stay closed: supervisor `2d97340f` with
addendum `d201070f` accepted, Node `--test` worker evidence limit accepted for the scheme group only. Archive:
`hl12/129_concrete_synthetic_caller_source.json`.

**Bytes.** Root `DOC128_REVISION25_CONCRETE_CALLER_REVIEW_READY_20261014/`: four files, each byte-identical to the Core
blob named in `ROOT_RAW_INDEX.json` (caller `42f9fcab`, requirements `62a9a17a`, handoff `f84d9f6d` 9,398 B
`ab7ce258…`, `.gitattributes` `fa1385d9` 8 B `* -text`). Commit scope is exactly the seven listed paths (three `.xenios`
registry files plus the four new files). The five accepted inputs are the same blobs at `9df9f1f5` as at `2d97340f`
and `d201070f`; the proving namespace has no diff between those commits. The requirements' `sourceSha256` equals the
caller's bytes; its invocation, observer-prefix and closure-template arrays, ticket path, output template and
per-group bounds equal the caller's literal constants with `<selected-group>` substituted. The Root scope-comparison
record named by the handoff exists at `955bc141` with the stated 3,620 B and hash `8b5a3369…`.

## 1. Doc 128 section 5 against the source (line numbers)

- **Direct CMD parent and literal command.** `cmd.exe` is started with `UseShellExecute=false`, `CreateNoWindow=true`,
  cleared environment and `/d /s /c "<literal>"` where the literal is the quoted pinned pwsh, `-NoProfile -File`, the
  quoted frozen supervisor path, the enum group and the hex hash (102–105, 170–171, 198). With `/s` the outer quote
  pair is stripped once and the remainder is the command; both paths are space-free and contain no CMD metacharacters,
  and the group and hash come from `ValidateSet` and `ValidatePattern`, so no text field reaches the shell (comment at
  169). The ticket's six-element supervisor invocation is compared literally (172), and `caller-start.json` records the
  exact CMD arguments before CMD starts (195).
- **Unique live supervisor barrier.** While CMD is alive and within 5 s, one CIM query per iteration filtered to
  `ParentProcessId=<retained CMD PID> AND Name='pwsh.exe'` with a 1 s operation timeout; more than one row or CMD
  exit fails; zero rows retries after 10 ms (199–207). The found row's command line must contain the supervisor path and
  carry `-ProvingGroup <group>` and `-AdmissionSha256 <hash>` as whole tokens (208). A handle is retained on that PID,
  the executable must be the pinned pwsh, and handle creation must agree with CIM creation within 1 ms and the CIM
  parent must be the retained CMD PID (209–211). No guessed sleep, no guessed PID.
- **Caller argv cannot duplicate discovery.** The caller's own command line names only
  `invoke-proving-with-observer-gate.ps1`; CMD is excluded from the frozen observer's `Name='pwsh.exe'` filter; the
  observer excludes itself; the closure names only its own file. Exactly one `pwsh.exe` carries the supervisor path
  while the supervisor lives. The executor must keep the supervisor path out of the caller's command line.
- **Observer created while the parent lives.** Immediate `HasExited` check (213), then the frozen observer is started
  as a separately retained pinned pwsh with argv `-NoProfile -File <observer> -ProvingGroup <g> -AdmissionSha256
  <hash>` (167, 214). After both finish, observer creation must be at or after supervisor creation and strictly before
  supervisor exit (221).
- **Actual exits and lifetimes, not rows.** `L-Exit` reads creation and exit from the retained handle, requires the
  creation string to equal the identity captured live, and requires a finite, non-negative lifetime strictly below the
  per-process limit: CMD aggregate + 5 s, supervisor aggregate, observer aggregate + 15 s, closure 10 s (131–138).
  Exit codes of CMD, supervisor and observer must all be 0 before any row is read (220). Rows are then bound: exactly
  two, kinds in order, `observerPid` equal to the retained observer PID (229); each row's group, hash, zero stops,
  `parentPid` and `creationUtc` equal to the retained supervisor identity (230); the first row's executable equal to
  the pinned pwsh and its CMD ancestor PID, executable and creation (within 1 ms) equal to the retained CMD identity
  (231); the second row's exit code and exit timestamp equal to, and lifetime within 0.01 ms of, the handle values
  (232).
- **Concurrent capped EOF capture.** Both base streams of CMD and of the observer are read with 1 KiB asynchronous
  reads, pumped alternately with the exit check, capped at 16 KiB combined per process, with EOF required on both
  streams and a per-process deadline that covers inherited pipe handles (93–99, 114–130, 215–218). Observer stderr
  and CMD stderr must be empty (227). The supervisor's streams are inherited through CMD and captured there; the
  supervisor state is identity-only and is labelled so (209, 143).
- **Gate before the closure-visible stream, closure after exits.** Raw CMD and observer bytes are written `CreateNew`
  with `Flush(true)` (225–226, 68–69); pins, ticket, manifest, addendum and the caller's own hash are rechecked (233);
  `observer-result-gate.json` is written and hashed (235–237); only then is `observer.stdout.bin` created in the
  frozen attempt directory from the same bytes and its hash verified against the raw copy (239–240). The closure is
  started after CMD, supervisor and observer have all exited and been measured (219–220, 246), with argv equal to the
  ticket's template with the two sentinels replaced by the actual ticket hash and the captured stdout hash (168, 176,
  245). The closure's identity, exit 0, lifetime under 10 s, empty stderr and bound JSON (status, group, hash,
  observer stdout hash, zero stops, `globalKernelGuarantee false`) are required (246–252), then pins and the gate and
  stream hashes are rechecked (253–254).
- **Binding and immutability.** Self path and pinned runtime (153); ticket hash, scope, owner, frozen output,
  exclusive reservation (154–157); caller object: source path, 64-hex source hash, caller output, doc 128 commit,
  addendum hash, manifest hash (159); explicit gate-required and closure-permitted flags (160); three reference fields
  non-empty (161); exact caller bounds (162); window format and the same `lastStart` rule as the supervisor (163–165);
  manifest and addendum sizes and hashes (177–178). `L-PostBindings` rehashes the ticket, manifest, addendum, the
  running caller against the ticket's caller hash, and every selected pin of the group including the binaries, before
  start, before the gate, before the closure and after it (145–149, 180, 233, 242, 253). This satisfies my doc 128
  requirement that the binaries be actually rehashed.
- **Fresh outputs and scheme prerequisites.** Both `caller-<g>-r1` and `attempt-<g>-r1` must be absent (188), the
  nearest existing ancestor must be reparse-free (189–192), preflight must finish within 10 s of caller creation and
  before `lastStart` (193, 197). The scheme group requires the counter receipt file under 256 KiB whose hash equals
  the ticket's `priorCounterReceiptSha256`, non-empty owner-acceptance and archive references, and the receipt's group,
  preliminary status, `observerGate PASS` and `closureAccepted true` (181–187).

## 2. Envelopes, clocks, reserves and failure paths

- One non-resetting envelope: process age sampled once at start plus a Stopwatch (8–11), checked by `L-Time` at every
  write, every pump iteration, every identity iteration and every phase (14 call sites). Normal work must end 5 s
  before the caller limit (180,000 ms counter, 90,000 ms scheme) and 5 s before the ticket's `ends`; the failure path
  drops the reserve to zero and may use exactly that remainder (53–57, 259). The ticket window is the tighter bound
  when the caller starts near `lastStart`: from `lastStart` the window leaves aggregate + 45 s, which covers a
  full-length supervisor, the observer's prompt return, the gate writes and a 10 s closure.
- CMD 125,000 / 35,000 ms, discovery 5,000 ms, preflight 10,000 ms, observer 135,000 / 45,000 ms, closure 10,000 ms,
  16 KiB combined streams per captured process, 256 KiB per file and 1 MiB total including the closure-visible observer
  copy (12–14, 64, 121, 162, 193, 198, 202, 205, 214, 246). The frozen supervisor 120,000 / 30,000, observer
  135,000 / 45,000, child 5,000 and closure 10,000 ceilings are not touched; the caller enforces them a second time
  from its own handles.
- Failure: 48 closed tokens; any other exception is reported as `CALLER_FAILED_OR_INCOMPLETE` with its type only
  (260–261). Partial streams are written under new `.partial-` names so they never replace successful raw files, and
  `caller-failure.json` carries the phase, token, `gateWritten`, `closureStarted`, every process summary with its EOF
  flags, capture completion, byte counts, hashes and over-cap flag, and `reservationReleased false` (262–269). If
  evidence writing itself fails, `CALLER_FAILURE_EVIDENCE_INCOMPLETE` is the terminal stderr line (270). No `Kill`,
  `Stop-Process`, retry, dynamic execution, call operator or dot-sourcing exists in the file; `finally` disposes only
  processes that have exited and keeps handles on anything live (275–278). A supervisor that overruns is caught first
  by CMD's deadline, leaving the owner reservation unresolved by design.

## 3. Observations, none a required correction

- CMD quoting cannot be verified without execution. The `/s` form is the correct one for a single quoted program
  path; if the shell rejected it, the caller fails within 5 s as `SUPERVISOR_NOT_FOUND_LIVE` with CMD's streams
  preserved as partials and nothing else started.
- The caller measures the closure's OS lifetime, which includes pwsh startup, against the same 10 s the closure
  measures internally from script start. That is a tighter, fail-closed reading, not a change to the frozen ceiling.
- The executor must start the caller early enough: the supervisor's own `lastStart` check runs after the caller's
  preflight of up to 10 s and the shell start-up, and a late start fails closed as `FINITE_WINDOW` inside the
  supervisor and `ACTUAL_PROCESS_EXIT_FAILURE` in the caller.
- The receipt is written and then one more deadline check runs (256–257). A caller can therefore leave both
  `caller-receipt.json` and `caller-failure.json` and exit 1. The scheme prerequisite reads only the receipt; the
  executor's exit record and the owner's counter disposition are what refuse that case. An optional hardening would be
  to refuse the scheme run when `caller-counter-r1/caller-failure.json` exists; it is not required for compatibility
  because a non-zero counter exit can never receive an owner acceptance reference.
- The child environment table is the accepted supervisor's, with `HOME`, `USERPROFILE`, `TEMP` and `TMP` rooted in
  the caller directory; nothing new is inherited and no credential is copied.
- The gate's `observerScriptSha256` is a constant; the actual observer bytes are enforced through the manifest pin
  rehash immediately before the gate, and the manifest's observer pin equals that constant.

## 4. Exact remaining prerequisites

1. **Executor record for the caller.** The existing executor invokes the pinned pwsh with `-NoProfile -File
   <caller> -ProvingGroup <g> -AdmissionSha256 <actual ticket hash>`, with no supervisor path anywhere in that
   command line, and records the caller's actual exit code (0 required), OS creation-to-exit lifetime strictly below
   180,000 ms counter or 90,000 ms scheme, and both terminal streams to EOF with stderr empty. It confirms
   `caller-<g>-r1/caller-receipt.json` present with `observerGate PASS` and `closureAccepted true`, and
   `caller-failure.json` absent. A receipt without that record is a preliminary file, not a result.
2. **Per-group ticket at the fixed path**, counter first: every frozen supervisor field unchanged, plus the `caller`
   object exactly as the requirements file with `<selected-group>` substituted: source path, `sourceSha256 59457370…`,
   `doc128 8af08bc…`, `addendumSha256 44413e31…`, `manifestSha256 32dcd697…`, caller output, both flags true, the
   six-element caller invocation, the seven-element observer prefix, the ten-element closure template with its literal
   sentinels, and the group's bounds. The three reference fields must resolve to real records: the human scope
   comparison (`955bc141`, whose applicability is Root's and the founder's determination, not mine), this disposition
   (doc 129 at the commit stated in the queue row), and the current exclusive-reservation record. The caller checks
   only that they are non-empty; strings are not authority.
3. **Scheme ticket additions**: `counterAcceptedByOwnerRef` naming the owner's disposition of the counter executor
   record, gate, parent and children and closure; `counterAdmissionArchiveRef` naming the archived consumed counter
   ticket, verified by Root before issuance; `priorCounterReceiptSha256` equal to the actual counter receipt bytes.
4. **Fresh state**: both output directories absent; exclusive slot with no competing heavy job; real 512 MiB admission
   inside the supervisor; consumed ticket archived before the next is issued; no reuse.
5. **Owner acceptance only on the conjunction**: closure-validated outputs with parent exit 0 and every child under
   5 s, gate PASS as recorded in `observer-result-gate.json` with the hash carried in the receipt, the independent
   closure record, and the executor's caller record. The gate, the receipt and the closure each state they are not
   group acceptance on their own; none is.

## 5. What this disposition is not

Not execution consent, runtime permission, ticket issuance, gate waiver or release GO. Not a test pass or admission
credit. Not a reopening of the accepted supervisor, observer, closure, manifest, addendum, fixtures, canary,
application `8e85daa`/`25507c2f` or tooling `3dd3d96`/`7a4ce7c3`. The browser 2,048 MiB floor, the later
finalization-controls 30 s parent bound, consumed tickets, failures, private profiles and the incident plan at
`2c73341e` are unchanged. The modern credential identification record is source identification only; no credential
action or release authority follows from anything here.
