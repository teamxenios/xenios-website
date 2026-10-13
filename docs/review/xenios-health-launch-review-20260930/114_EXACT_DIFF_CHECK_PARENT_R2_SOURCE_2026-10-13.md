# Revision 15: exact Git diff-check parent R2, source only

**SOURCE ACCEPTED as a fail-closed mechanism, with one minimal correction recommended before any ticket is spent.**
The R2 parent binds exactly one literal command, controls both output streams as raw bytes under a combined cap,
derives child identity from a retained process handle and fails closed when identity cannot be read, adopts only
descendants observed with a simultaneously owned parent, kills only exact handle-verified identities, and checks the
cleanup and aggregate deadlines before and after every observation, after every kill, after disposal, after the
measured receipt write, and once more at exit. No code path writes a completed receipt or exits 0 without two
in-deadline quiets and a timely write. Nothing in it can turn a late or failed run into a pass.

The one item I cannot settle by reading is whether the cleanup census can ever go quiet while the parent still holds
open `Process` handles to its exited Git children (§6). Either answer is safe: if the census lists such processes the
run fails `CLEANUP_DEADLINE`, never passes. But the attempt is one-shot, so the owners should either apply the one-hunk
correction in §6 or prove the point with a control before admission. Everything else below is a predicate or a proving
check, not a correction.

Reviewer: this session, `claude-fable-5-1`, on the coordinator's revision-15 request. Read-only, no agents, nothing
parsed, imported, executed or probed; no index operation; no command invoked. Scope: `PROPOSAL.json` and the R2 parent,
plus the pins template they bind. Application `8e85daa`/`25507c2f`, docs 104–113 and all accepted receipts unchanged.
Archive: `hl12/114_exact_diff_check_parent_r2_source.json`.

**Where the bytes are.** Core `de2a76f2` (tree `96f78876`), prefix
`doc104-baseline-reconciliation-20261013/exact-diff-check-runner-r2-source-proposal/`: parent
`execute-admitted-exact-diff-check-r2.ps1` 19,110 B `74e17f7f…` (blob `dcf0cae5`), `PINNED_INPUTS_SOURCE_ONLY.json`
1,933 B `6261c53e…`, `PROPOSAL.json` 5,048 B `931cfb29…`, `UNCHANGED_PREFIX_OBSERVATION.json` 336 B `4602986b…`,
`.gitattributes` `* -text`. Root's copy under `DOC113_EXACT_DIFF_R2_SOURCE_REVIEW_READY_20261013/` is byte-identical
for all five files and `ROOT_RAW_INDEX.json` (`faecd329…`) names the same blobs. R1 at `1632d4d2`: parent 16,590 B
`18a68932…`. The two parents share a common prefix of 15,447 bytes (the owners' 15,360 is a lower bound; the files
contain no CR, so characters equal bytes): lines 1–230 are identical and R1's lines 231–252 are replaced by R2's
231–286. `onlyFinalizationTailChanged` is true. The records worktree `C:/xenios-wt/tc25-app-manifest-20261012` is on
`codex/tc25-app-manifest-20261012` and holds the parent and the inventory at the exact pinned paths with the pinned
digests.

## 1. Exact command and gates

- **Command.** `$dExpected` (line 20) is the literal argument vector `-c core.fsmonitor=false -c
  core.untrackedCache=false diff --no-ext-diff --no-textconv --check 79414143… 8e85daa… --`; the ticket's `command`
  must equal `[git.exe] + $dExpected` element for element (line 187, NUL-joined), and the actual run passes
  `$dExpected` unchanged to the pinned shim `C:/Program Files/Git/cmd/git.exe` (lines 111, 221). No shell string,
  no interpolation. The pass criterion is `git diff --check` exit 0 with complete streams (line 162).
- **Ticket binding** (lines 184–190): ticket hash equals the mandatory 64-hex argument; `approved`, `mode
  exact-diff-check`, `owner` Core, `source`/`tree`/`base`, `output` = the fixed `attempt-r1` directory; bounds exactly
  15,000 / 15,000 / 30,000 ms, 512 MiB, 2,097,152 B, 1 attempt, 0 retries; window ≤ 20 min with `lastStart` exactly
  `ends − 45 s`; now within `[starts, lastStart]`, rechecked at line 206. Under `Set-StrictMode -Version Latest` any
  missing ticket field is a terminating error before the clock starts.
- **Six pins** (lines 191–194): the normalized path set must equal {this script (`$PSCommandPath`), pinned pwsh, Git
  cmd shim, mingw64 git, default index, canonical 17-path inventory}; each row needs `path`/`bytes`/`sha256`; `D-Pin`
  rejects containers, size mismatch, any reparse point on the file or any ancestor, and hash mismatch. Pins are
  rehashed after the run (line 223), so the index must be byte-identical before and after.
- **G0** (lines 195–205): running pwsh must be the pinned binary; inventory hash must be `3d260180…` and contain 17
  entries; `GIT_INDEX_FILE` must be absent; no `index.lock`; output directory must not exist (this is the one-attempt
  enforcement: a second run of the same source cannot pass G0); OS-free, available and commit headroom each ≥ 512
  MiB; no `node.exe`/`pwsh.exe`/`powershell.exe` other than self whose command line matches the qualification regex.
- **Source and index invariants** (lines 175–182, 215, 222): `rev-parse HEAD HEAD^{tree} base^{commit}
  --is-shallow-repository --path-format=absolute --git-path index` must yield exactly `8e85daa`, `25507c2f`,
  `79414143`, `false` and the pinned index path; `status --porcelain=v2 --untracked-files=all -z` must be empty; both
  before and after the diff. `GIT_OPTIONAL_LOCKS=0` plus `-c core.fsmonitor=false -c core.untrackedCache=false` keep
  `status` from writing the index, and the post pin would catch it if it did. The controlled Git environment (lines
  113–119) is cleared and rebuilt: restricted `PATH`, `HOME`/`USERPROFILE`/`TEMP`/`TMP` inside the output directory,
  system config disabled and both system and global config pointed at a zero-byte file whose hash is verified before
  and after (lines 208–209, 224), no prompt, no pager. No index overlay anywhere.
- **Path identity** (lines 216–220): `diff --name-only -z base head --` must produce exactly 17 names equal, under
  ordinal sort, to the inventory file. I confirmed the inventory file is the validator's own canonical form:
  `{"format":"xenios.git-diff-path-inventory.v1","inventory":[…sorted…]}` plus newline, whose sha256 is
  `exactGitDiffPathInventorySha256` in `verify-release-manifest.ts` (lines 596–612), the same `3d260180…` recorded
  in my doc 110 attestation; its 17 paths equal `git diff --name-only 79414143 8e85daa`. So the parent binds the live
  diff to the attestation's inventory digest by construction.

## 2. Control of the two output streams

`D-Git` (lines 108–174) redirects both standard streams, reads their `BaseStream`s with one outstanding 8 KiB
asynchronous read each (no text decoding), appends to memory, and counts every byte into a script-scoped accumulator
checked against 2,097,152 B after each read (`OUTPUT_CAP`), cumulative across all six Git invocations. The loop ends
only when both streams reach EOF and the process has exited; the work budget is checked on entry, every iteration and
after exit. On success the complete bytes are written with `CreateNew` to `<name>.stdout.bin`/`.stderr.bin`, hashed
from disk into the receipt, and a non-zero exit throws `GIT_NONZERO` after the bytes are persisted. On timeout, cap or
error the partial bytes are written under `partial-` names and `complete` stays false. For a passing `--check` the
stdout is empty; a whitespace-error outcome is preserved as bytes and fails.

## 3. Short-child identity, fail-closed

Identity comes from the retained handle immediately after `Start()` (lines 124–130): `StartTime` ticks truncated to
CIM's microsecond precision and `MainModule.FileName`, which must normalize to the pinned shim path
(`CHILD_EXECUTABLE`). If the child exits before `MainModule` can be read, .NET throws, the outer catch records
`BOUNDED_GIT_OPERATION_FAILED`, and the run is `FAILED_OR_INCOMPLETE`: identity is never inferred from the requested
path. The real `mingw64\bin\git.exe` grandchild is adopted only if a census observes it together with the owned shim
(line 79–80); when it is too short-lived to be observed, its executable bytes are still pinned before and after and the
restricted `PATH` leaves the shim no other resolution. `D-StopExact` (lines 93–107) re-verifies microsecond ticks and
executable path through a fresh handle before `Kill()` and never kills a tree.

## 4. Ownership and cleanup

Baseline is taken after the clock starts (line 214); owned = the handle-spawned shim plus descendants observed with a
simultaneously owned parent, a non-null executable path and creation ticks not before the parent's; any process that
is relevant (command line containing the source root or scratch, or named `git.exe`), not in baseline and not owned
is ambiguous and fails the run (`UNOWNED_PROCESS_AMBIGUITY`) both in flight (every 400 ms) and in cleanup. Caps: 128
owned, 128 snapshots, 16,384 census rows. Cleanup kills exact live owned identities only, clears the quiet count after
any kill, and needs two quiet censuses ≥ 500 ms apart.

## 5. Deadline checks, as read

`cleanupStop = min(30000, cleanupStarted + 15000)` (line 232). Checks: before each census (238); immediately after
each census, so a late-returning census is never credited (242); after kills (246); after handle disposal, setting
`CLEANUP_DEADLINE` or `AGGREGATE_DEADLINE` if no earlier failure (253–254); after the measured receipt write, where
overrun writes a separate `terminal-failure.json` with `CreateNew`, leaves the provisional receipt untouched and forces
exit 1 (264–271); on any write exception, exit 1 with a stderr marker (275–279); and at the very end, where exit 0
requires `dTerminalExit = 0` and both deadlines still unexpired (285–286). `dTerminalExit` defaults to 1 and becomes 0
only with no failure, two quiets and a timely write. The status literal is
`PRELIMINARY_REQUIRES_OUTER_EXIT_TIMING_AND_INDEPENDENT_CLOSURE`; the only occurrence of "COMPLETED" in the file is
the comment at line 258. The former second full stdout serialization is gone. The three corrections in
`PROPOSAL.json` map to lines 231–235/238–248, 257–279 and 281–286 respectively. The receipt records
`cleanupStartedElapsedMs`, `cleanupStopElapsedMs` and `beforeReceiptWriteElapsedMs`, and says in its own
`receiptSemantics` that the outer exit code and timing qualify it; I agree that no 30-second envelope may be read from
the JSON.

## 6. The one open mechanical item, and the minimal correction

Every Git `Process` object is kept in `$dHandles` and disposed only after the quiet loop (line 252). A Windows
process whose last handle is still open after it exits remains a kernel object, keeps its PID, and may still be
enumerated by `Win32_Process` with zero threads. If the census on this host lists such processes, the cleanup loop
sees every exited Git child as a live owned identity, `D-StopExact` cannot read its main module and records
`REFUSED_OR_ALREADY_GONE`, the quiet count is cleared each pass, and the run ends `CLEANUP_DEADLINE` → exit 1. That
is fail-closed, but it would make a correct run unpassable and consume the single attempt. The accepted R3 profile has
no precedent either way: its Node controller releases child handles on exit, and the R3 parent took no census while
holding one.

- **Minimal correction (one hunk):** move `foreach($p in $dHandles){$p.Dispose()}` from line 252 to immediately after
  line 235, before the first cleanup census. Disposal does not terminate a still-running child; `D-StopExact` already
  obtains and verifies its own handle by PID and microsecond ticks, and all stream handles were disposed in `D-Git`.
  Nothing else changes; an R3 carrying only that hunk needs byte confirmation from me, not a new review.
- **Alternative:** one bounded control on this host showing that a terminated child whose `Process` handle is retained
  is absent from `Get-CimInstance Win32_Process`. If that holds, R2 is admissible as is.

## 7. Observations (not corrections)

- The cleanup `catch` (line 251) records `CLEANUP_INCOMPLETE` for any inner throw, so `CLEANUP_DEADLINE` and
  `UNOWNED_PROCESS_AMBIGUITY` are distinguishable only from `snapshots`/`quiets`, not from `failure`. Precision only.
- `-OperationTimeoutSec 1` on `Win32_Process` enumeration has no R3 precedent (R3 used no operation timeout); the
  accepted runs saw ~480–490 processes. A census slower than one second fails closed (pre-clock terminating error, or
  `BOUNDED_GIT_OPERATION_FAILED` / `CLEANUP_INCOMPLETE`). The 400 ms in-flight census also blocks stream draining,
  which cannot affect the empty-output pass path but can make a large whitespace-error output surface as
  `BUDGET_EXCEEDED` with partial bytes rather than `GIT_NONZERO`; still a failure.
- The competing-process regex includes the parent's own script name; the launch chain must contain no
  `node.exe`/`pwsh.exe`/`powershell.exe` ancestor whose command line names the script, or the parent refuses itself.
  The ambiguity rule treats any new `git.exe` on the host as fatal, so no other session may run Git, and no process
  may be started with the source root or scratch path on its command line, during the ≤ 30 s run.
- Repository-level Git configuration is not pinned and `EXACT_SIX_PINS` cannot take a seventh row without an R3. Read
  today: `.git/config` of the main repository has only `core.symlinks=false`, `core.ignorecase=true`,
  `merge.conflictStyle=diff3`, `extensions.worktreeConfig=true`, remote/branch/user sections and nothing under
  `diff`, `core.whitespace`, `core.attributesFile`, `include` or `includeIf`; `.git/info/attributes` is absent; the
  worktree's `config.worktree` holds one `codex` key; the only in-tree `.gitattributes` at `8e85daa` is
  `docs/legal/xenios-research/v1.0.0/.gitattributes` (`* -text`), outside the 17 paths. These are the inputs that could
  change a `--check` verdict silently; Root should record them at admission and at independent closure.
- The pinned default index is currently genuine: 630,285 B, sha256 `02415548…`, last written 2026-10-13T16:11:43Z,
  unchanged across the 21:41Z and 21:46Z R3 runs. The parent re-verifies it before and after regardless.
- `ConvertFrom-Json -DateKind String`, the reparse-point walk and the PerfOS memory counters all have R3 precedent on
  the pinned pwsh; `--path-format=absolute --git-path index` needs Git ≥ 2.31 and fails closed otherwise.
- For the manifest, the validator (lines 1278–1283) requires the `diffCheck` slot to carry `status PASS`, a `command`
  string and `checkedAt`; those values must be derived from the receipt plus the outer exit code and timing, never
  from the provisional status alone.

## 8. Required proving checks and admission predicates (nothing executed)

Proving checks, before or at the one admitted attempt: (1) the §6 point, by correction or control; (2) census time
under 1 s with the current process count; (3) the handle-derived key of the spawned shim equals its CIM key in at
least one in-flight census, so the shim is owned rather than ambiguous; (4) the pre-identity command returns the five
expected lines on the installed Git; (5) a late second quiet, a late receipt write and a write failure each yield exit
1 and no `PRELIMINARY` elevation (the proposal lists these; none has run). Admission predicates the parent will
enforce and the ticket must therefore satisfy: ticket at the fixed Root path with the six rows above (paths exactly,
bytes, lowercase sha256), including the parent at `74e17f7f…` 19,110 B and the inventory at `3d260180…` 891 B; the
index row re-hashed at ticket time, not copied; `lastStart = ends − 45.000 s`; output directory absent; invocation
`pwsh.exe -NoProfile -File <records-worktree path> -AdmissionSha256 <ticket sha256>` from the pinned pwsh with no
inherited `GIT_INDEX_FILE`; fresh 512 MiB floors; one attempt, zero retries; Root/Core record the §7 configuration
facts at admission and closure; outer exit code, outer start/end timing and an independent exact-identity closure
after exit remain mandatory for any receipt to count.

## 9. Scope

No execution consent follows from this review. The Doc 110 three-mode runner does not admit this command, and this
source does not revive the old command-only profile. Doc 112 C (manifest profile) remains accepted and not executable
until this actual diff receipt and the bound index/manifest/95-pin inputs exist. Application `8e85daa`, all accepted
receipts (docs 108, 110, 111, 113), ownership attestation and runbook decisions are unchanged.
