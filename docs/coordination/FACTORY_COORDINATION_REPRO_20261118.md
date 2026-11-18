# Actual coordinator contention and interruption qualification

Task: `FACTORY-COORDINATION-REPRO-20261118`. Source baseline:
`e6e11c3f923491d55bc2cd221c29da77001a0822`.

This slice initially prepared an isolated reproduction harness without running
it. Root subsequently executed exact source `4ae9816d` under its exclusive slot;
the results and bounded repair proposal are recorded below. The proposal is
**NOT IMPLEMENTED OR EXECUTED**. This worker has not changed the real controller,
registry, cockpit, native seat or external service. Root retains allocation and
all canonical controller seams.

## Existing source and suspected boundary

The actual `scripts/agentic/xenios-os.mjs` claim command reads the task board and
ownership registry, checks path conflicts with the actual `path-overlap.mjs`,
then synchronously writes `ACTIVE_TASKS.json` before `CODE_OWNERSHIP.json`.
This source has no claim-wide lock or transaction around those two writes.
Source inspection alone does not establish what any live concurrent run did.

The harness launches that actual CLI file. Its working directory is a newly
created, marked `xenios-coordination-*` directory beneath the host temporary
directory. Every task, session, path and record is fictional. A minimal child
environment omits provider credentials and inherited Node preload settings.
The source files must match the inspected baseline before execution and are
compared with committed Git blobs before and after the run. Both Windows
worktree and normalized committed-byte hashes are recorded. A changed subject
is refused until Root reviews and repins the harness for that source.

A test-only CommonJS preload gates the actual synchronous filesystem calls in
the child process. It returns the original read bytes and performs the original
write before pausing. It requires the marked physical temporary root and exact
run ID, and refuses another working directory. It does not edit a source file.

## Three checks

1. **Serialized positive control:** two tasks own the same synthetic path.
   A claims first; B must be denied. The acknowledged task and active lease
   must agree. Failure invalidates the later contention interpretation.
2. **Same-snapshot contention:** both real CLI processes pause after reading
   the same task and ownership snapshots. A is released and exits before B is
   released. The safety assertion requires one acknowledged winner, even if a
   stale write would leave only one visible lease and conceal an earlier ACK.
3. **Interrupted write and resume:** the real claim process pauses after its
   task-board write. The parent kills only that owned synthetic child, reads
   both durable files, invokes the real `validate` and `resume`, retries the
   same claim, and attempts the overlapping second task. Claimed-task/lease
   correspondence must hold across the interruption; JSON validity alone does
   not satisfy that invariant.

All child stdout/stderr, exit codes, signals, PIDs, invocation IDs, timestamps,
gate journals and durable snapshots go into the complete JSON receipt. Fixture
files are retained rather than recursively deleted. Harness invocation IDs are
explicitly **not canonical controller attempt IDs**. No existing canonical
attempt or controller revision is invented.

The forced-read gate targets the inspected synchronous source. If a successor
uses locking and prevents the second process reaching that boundary, the gate
times out and reports **inconclusive/harness failure**, never a safety pass.
Root must review an appropriate successor contention schedule or injection seam
before using this as fixed-controller qualification. No production injection
hook is requested or installed by this slice.

## Exact bounded commands, after Root allocates the slot

Use the existing pinned executable:
`C:/Users/sboad/projects/xr-toolchains/node-v20.19.0-win-x64/node.exe`.
There is no dependency installation, application build, browser or database.

```powershell
& 'C:/Users/sboad/projects/xr-toolchains/node-v20.19.0-win-x64/node.exe' scripts/agentic/coordination-qualification/run.mjs --out 'C:/Users/sboad/projects/factory-coordination-repro-20261118/qualification.json'
```

Exit `0` means the declared checks passed, `1` means an invariant violation was
observed, and `2` means the harness/environment did not establish a result.
The initial source-only handoff treated the two violations as hypotheses. Root's
subsequent allocated baseline receipt below establishes those specific results;
it does not qualify any repair or a different controller source.

The Node safety-test form preserves expected invariants and should fail on any
observed violation rather than treating reproduction as a healthy-controller pass:

```powershell
& 'C:/Users/sboad/projects/xr-toolchains/node-v20.19.0-win-x64/node.exe' --test scripts/agentic/coordination-qualification/coordination-contract.node-test.mjs
```

Only one of these equivalent execution forms is needed for the initial
qualification; do not duplicate the run for a redundant green/red signal.
The runner may own two small CLI children concurrently within the one allocated
qualification job, with 30-second process and 20-second gate bounds. Root should
capture the entire terminal output and wait for all owned children to exit.

## Acceptance and remaining work

Before a canonical change: independent exact-source review, Node 20 execution,
the actual first failing invariant and complete output, and a Root-approved
minimal fix scope. A later fix must retain authoritative task/lease coupling,
same-task retry semantics and meaningful crash/contention qualification. This
source-only harness does not implement resumable task attempts, authenticate a
native worker, mount the assurance cockpit or complete the factory milestone.

## Executed baseline preserved

Root's receipt is
`C:/Users/sboad/projects/factory-coordination-repro-20261118/qualification.json`,
SHA256 `082d0193c055602779a68a6c2f64ddfe3b06668479d4c4778ce75f6fa4bbeae3`.
It ran on Node20.19.0 from `2026-11-18T16:31:40.908Z` through
`2026-11-18T16:31:42.208Z`, exact harness source
`4ae9816d84b3f7c792f5f8b2f395bed9a45f2c00`. Its CLI/path-overlap files match e6
before and after. All owned children exited. KAN-234/13448 records the result.
The receipt and four baseline executable files remain unchanged by this proposal.

- Serialized control passed with one claimed task and corresponding active lease.
- The forced same-snapshot schedule produced **two successful overlapping claim
  acknowledgements**. The final stale write erased `SYNTHETIC-CLAIM-A`; one
  visible final lease concealed the earlier successful acknowledgement.
- The interrupted task-file write left a claimed task without its lease.
  `validate` returned `ok:true`, `resume` exposed the orphan, retry was refused,
  and the competing overlapping task then claimed successfully.

These are isolated actual-CLI results, not evidence of a particular live fleet
incident. Their persisted files and complete process output are retained.

## Repair boundary

Keep the existing canonical task/session/lease files. Add a small transaction
and snapshot helper to the existing coordinator, not another task registry,
scheduler or daemon. The journal below is recovery metadata for those files;
the command receipt is a deduplication record, not a second task authority.

**An exclusive lock alone is insufficient.** It stops the stale-read race while
its owner lives, but a process can still die after writing one of several files.
The proposal therefore requires serialized access, a recoverable commit decision,
idempotent materialization and integrity-checked readers together.

The initial guarantee is process interruption on the qualified local Windows
filesystem/runtime. Power-loss durability, network filesystems, WSL/Windows
mixed lock semantics and cross-host coordination remain unsupported until
separately qualified. Do not advertise them from a Node unit test.

### One authority across linked worktrees

Resolve Git's common directory and real filesystem paths before reading mutable
corpus state. Root installs one explicit, uncommitted repository-local binding
under `<git-common-dir>/xenios-coordination/authority-binding.json`, pointing to
the actual current canonical corpus, repository identity, protocol version and
supported host/runtime namespace. This is a pointer, not copied task data.

All linked worktrees must resolve the same authority identity, lock and journal.
Do not silently use each worktree's checked-in `.xenios` snapshot, choose the
newest mtime, merge divergent copies or treat another clone as linked merely
because its remote URL matches. Missing, changed, unsupported or ambiguous
bindings fail closed for mutations. Legacy local files can still be inspected
as explicitly untrusted diagnostic inputs. Root must approve initial binding
and inventory reconciliation before adoption; this proposal installs nothing.

### Exclusive mutex without timeout-based owner theft

Use a pre-populated unique candidate directory, then a same-filesystem atomic
rename to the fixed mutex directory. Its immutable owner marker's filename
contains an unpredictable owner token. The marker records the exact host/runtime
namespace, PID and process-birth identity. Qualify that renaming onto an occupied
nonempty mutex cannot replace it on the actual host.

Release/reclamation removes only `owner-<expected-token>.json`, then uses
nonrecursive `rmdir`. A stale observer cannot remove a new owner's differently
named marker; a nonempty-directory refusal must never become recursive deletion.
Creating candidates populated before publication also makes an empty published
mutex a release/reclamation remnant, not an owner still creating its marker.
Every transition and competing reclaimer interleaving needs an actual test.

Reclaim only after a trusted, bounded process observation proves that specific
owner process has exited in the same namespace. PID reuse must compare birth
identity. Missing permission, an unsupported host, stale heartbeat, elapsed TTL
or a paused process is not death proof. No automatic TTL-based stealing. When
birth/liveness cannot be established, return a precise lock/recovery blocker.
After reclaiming metadata, acquire a new mutex before touching any corpus data.

If Node alone cannot establish Windows process identity, use one stateless
read-only PowerShell helper returning PID/birth/boot observation or explicit
unavailable; no command line, environment or credential payload. No persistent
helper process or new controller is required. Its exact filename is in the
lease request below. Other host adapters stay disabled rather than guessed.

Reclaiming the short-lived **transaction mutex never releases a task's file
lease**. The CLI process may die while the assigned coding seat remains alive.
A committed logical claim stays with that session. Takeover still requires the
existing explicit preservation/release procedure; an interrupted or idle owner
does not silently lose its work or gain replacement permissions.

### Journaled commit and recovery

All command state reads occur after acquiring the shared mutex. Compute the
write set in memory; do not issue interleaved canonical writes as the current
helpers do. Validate the complete proposed task/lease/session relation first.

| Phase | Persisted action | After interruption |
| --- | --- | --- |
| Prepare | Stage allowlisted after-images plus old/new hashes, operation identity, expected revision and minimal result in a private transaction directory. Flush files and the manifest. | Without a valid commit decision, canonical files must still match the before-image. Archive the uncommitted intent; conflicting actual bytes require explicit repair. |
| Decide | Publish a complete, checksummed commit marker by same-filesystem atomic rename. | This is the logical linearization point. A valid committed intent is completed, not silently rolled back. |
| Materialize | Replace each existing authority file with its staged after-image using atomic file replacement. | Before-hash means apply, after-hash means already applied. Any third value means interference/corruption: preserve it and fail closed instead of overwriting it. |
| Publish clean revision | Atomically publish one metadata record containing revision, file hashes and committed operation identity; verify the resulting state and record applied completion. | Repeating recovery must finish the same revision/receipt without creating another lease, handoff, message or task transition. |
| Acknowledge | Return success only after a clean verified publication. | Loss of this reply is handled by exact-operation replay, not another mutation. |

The metadata head contains hashes/revision, not another copy of task state.
After-images exist only to complete a decided transaction. Incomplete/corrupt
journals are not skipped to make status green. Bound journal and input sizes;
initial adoption has no automatic history/receipt deletion that could erase an
unknown-result retry's deduplication record. A retention/compaction policy can
follow after its replay consequences are reviewed.

Stable caller-supplied operation IDs must bind actor, command, task and canonical
input fingerprint. A replay with different input or actor is refused. The same
committed operation returns its recorded minimal result and original revision,
without another commit. Callers must still verify the **current** logical claim
before writing files; a historical successful receipt is not current authority
after a legitimate transfer. Preserve existing command-level checks and SHA
bindings; this work does not create an admin role or a new approval bypass.

Recovery only materializes a committed coordination transaction. It never
re-executes a deployment, migration, email, browser attestation or native task.
External effects need their own established idempotency/evidence boundaries.

### Trusted reads, exports and truthful validation

Route `status`, `next`, `stale`, `resume` and `validate` through one coherent
snapshot helper rather than independent raw reads. A trusted read acquires the
same mutex, checks metadata hashes/protocol and validates relations before
returning a revision-bound snapshot. It must not return `ok:true` from parseable
JSON alone. Mutations recover valid committed intents under the mutex before
fresh authorization/state evaluation; an explicit recovery command can do the
same without adding a business transition.

Read-only status/export and the future cockpit GET do **not** replay a journal
or repair canonical records as a hidden read side effect. Pending recovery yields
`recovery_required`/unavailable with no trusted task snapshot. Acquiring/releasing
ephemeral mutex metadata must be disclosed separately from changing task inputs.
The pure assurance doctor continues to read an exported snapshot without writing
its inputs; a raw directory read is advisory and cannot establish authority.

Validate at least unique task/session/lease IDs, existing references, exact
owner/path/claim coupling, incompatible active overlaps, supported state
transitions, handoff/accepted-SHA relationships and aggregate/individual session
agreement. `claimed` requires a corresponding active claim lease. QA/blocked/
retained-writer variants need explicitly reconciled compatibility rules, not
guessed normalization or automatic release. Existing corpus drift must be
reported and preserved in an adoption preflight; do not invent missing leases.

An unacknowledged physical intermediate state can exist while the exclusive
mutex is held or recovery is pending. It must not be exposed as an externally
accepted **consistent** snapshot. Legacy raw JSON readers can observe that
intermediate state and do not gain atomicity from per-file rename. Label them
untrusted or migrate them. Preserve original source timestamps and distinguish
controller revision, source SHA and observation time in exports.

All writers must participate, including private Root checkpoint helpers and
session-file updaters. A version marker cannot physically stop an old binary or
manual editor running under the same OS identity. Adoption therefore needs an
explicit writer barrier and fail-closed mixed-version policy. If uncooperating
writers must be technically prevented, that is a larger principal/IPC boundary
using the existing controller, not a guarantee this file protocol can claim.

### Candidate-compatible qualification

Keep the four original baseline executables and receipt immutable. Add separate
candidate tests; do not force both contenders past a mutex to repeat the old
unsafe schedule. Hold A after actual mutex acquisition, observe B's actual
acquisition attempt, then release A. B may wait or return busy, but a fresh retry
must evaluate A's committed claim. Require exactly one successful new claim ACK,
no lost acknowledged claim and a consistent trusted snapshot.

Fault injection should observe the actual filesystem transaction boundaries,
without changing file bytes or production policy. Crash after prepare, commit
decision, each file replacement, clean-revision publication and just before ACK;
also interrupt recovery. Before a commit decision, the prior consistent state
survives. After it, recovery completes the same operation and preserves its
owner/claim ID. During a live partial write, a trusted reader must block/refuse;
after recovery, it must return a complete revision. Do not require raw files to
look jointly atomic at each physical cut point, and do not accept a raw orphan
as a clean exported state.

Use two actual temporary Git worktrees sharing one explicit fixture authority to
test cross-worktree exclusion. Also test dead-owner reclamation with PID reuse,
live/paused owner refusal, two reclaimers, changed operation payload/actor,
corrupt journals, third-value file hashes, unknown protocol, legacy drift and
unsupported host/filesystem refusal. No fixed sleep alone proves contention.
No current real corpus or seat is touched by these tests.

## Exact proposed lease and integration requests

The next author needs these canonical paths only after Root accepts the design:

- `scripts/agentic/xenios-os.mjs`: route existing commands through the common
  transaction/snapshot helper; preserve command authority and output semantics
  except explicit revision/recovery/idempotency fields and fail-closed errors.
- `scripts/agentic/corpus-store.mjs`: new binding, mutex, journal, recovery and
  coherent-snapshot helper over the same existing authority files.
- `scripts/agentic/corpus-store.node-test.mjs`: real filesystem/process negative
  tests for that helper; no mocked substitute for the contested code.
- `scripts/agentic/corpus-owner-process.ps1`: only if needed for the bounded
  read-only Windows PID/birth/boot observation; unsupported hosts fail closed.
- Existing `scripts/agentic/coordination-qualification/**`: add a separate
  candidate schedule and tests while preserving the original baseline files.

Root retains `.github/workflows/checks.yml` to add an explicit pinned Node-test
step; application Vitest currently omits these files. Runtime-generated
`.xenios/.coordination/**` and the Git-common binding are an explicit adoption
step, not source files to install against the live corpus during authoring.

The present cockpit's `collectStatus` reads its process/action/catalog state;
it does not already expose a coherent task-registry export. Root's subsequent
bounded assurance mount should use the new snapshot API in
`scripts/xenios-control/server.mjs`, with focused
`scripts/xenios-control/control.test.mjs`; `lib.mjs` changes only if that
composition actually needs a helper. Preserve the current loopback/host/mutation
guards and action state. Do not claim cockpit atomicity from the CLI fix alone.

At the e5b51965 design freeze, no canonical code had been edited and no candidate
test had run. The subsequently authorized isolated implementation is described
below. Root/independent reviewer must accept its exact source and actual host
results before adoption. The larger authenticated runtime, real-task resume,
cockpit and learning evaluation milestones remain separate.

## Isolated repair candidate — source only, 2026-11-18

Root extended the same task and original lease start after independent
SOURCE-DESIGN ACCEPT. This candidate changes the CLI and adds the store,
stateless Windows observation helper and separate synthetic qualification
source. It installs no authority binding and changes no current corpus or
controller. The baseline executables, baseline receipt and path-overlap source
remain unchanged. No candidate test or build has run at this source freeze.

### Source inventory and behavior

| File | Responsibility |
| --- | --- |
| `scripts/agentic/xenios-os.mjs` | All seven writers use one transaction. Existing reads plus `export` use coherent snapshots; explicit `recover` adds no business transition. Every mutation requires a caller operation UUID and expected revision. |
| `scripts/agentic/corpus-store.mjs` | Explicit common-Git binding; same-host/boot/birth mutex; bounded checksummed before/after journal; COMMIT decision; idempotent materialization; clean HEAD and operation receipts; relational and byte-hash validation. |
| `scripts/agentic/corpus-owner-process.ps1` | Read-only CIM process/birth/boot and fixed-NTFS observation. Unknown observations refuse. It neither wakes nor terminates processes. |
| `scripts/agentic/corpus-store.node-test.mjs` | 38 real CLI/filesystem/process cases with expected assertions and actual output/exit receipts; original baseline hashes are asserted. |
| `scripts/agentic/coordination-qualification/candidate-fixture.mjs` | New marked temp repository and actual linked worktree per case; one synthetic common binding. Fixtures and process receipts are retained. |
| `scripts/agentic/coordination-qualification/candidate-io-preload.cjs` | Observes actual rename/unlink/stdout boundaries and holds only explicitly owned temp CLI children. No substituted coordinator, returned bytes or logical transitions. |

The store requires a separately installed binding and initialized metadata/data
directories. It has no bootstrap/adoption command. A worktree without a valid
common-directory binding cannot fall back to its local `.xenios`. A separate
clone also refuses. The initial authority must satisfy the strict schema,
including explicit claim IDs and handoff content hashes. Existing legacy
QA/retained-writer variants are not silently converted or released.

Registration refuses a second new registration operation for the same identity;
heartbeat preserves `startedAt`. Handoff reads its source once and fingerprints
the exact UTF-8 bytes/length without EOL or Unicode normalization. Session
mirrors, dynamic handoff files and message files are included in the same
decision as their aggregate task/registry changes. Acceptance requires a
registered active independent reviewer and exact handoff SHA. Release requires
the current active claim; an old handoff author cannot release a later reviewer's
claim. These local session IDs remain the existing corpus identity mechanism;
the candidate does not create an authentication service.

Commit publication is the decision point. Physical files can be intermediate
until recovery. Trusted reads acquire the mutex and either return a validated
revision or refuse; they do not secretly repair data. Valid committed recovery
checks every canonical file against the journal's before/after indexes before
materializing. Any third-value hash or unknown journal/protocol fails closed.
Recognized interrupted atomic sibling files are removable only when they are a
prefix of the decided after-image at the exact journal target. Corrupt committed
journals and invalid applied markers remain unavailable and preserved.

Exact operation replay returns the original result/revision without a new
transition. Its coordination metadata explicitly says
`historical_result_only_revalidate_current_claim`; a historical claim result is
not permission to write after a later transfer. The current actor must still be
active. Claim IDs are independent of process IDs, and process death/recovery
never releases a logical task lease. No stale-heartbeat/TTL lock theft exists.

Bounds are 5 MiB per file/journal, 32 MiB per corpus snapshot, 10,000 corpus files
and operation receipts, and 1,000 transaction directories. Capacity refuses;
there is no automatic history deletion or receipt expiration. This finite
history limit needs an independently reviewed compaction design before sustained
use reaches it. Failed unknown process observations can require human recovery;
they never justify stealing a lock.

### Exact allocated qualification command

Do not run before Root grants the exclusive resource slot. Commit/push the
candidate first: the suite refuses dirty or different source bytes.

```powershell
$env:XENIOS_COORDINATION_CANDIDATE_RECEIPT = 'C:/Users/sboad/projects/factory-coordination-repro-20261118/candidate-qualification-NEW-UNIQUE-NAME.json'
& 'C:/Users/sboad/projects/xr-toolchains/node-v20.19.0-win-x64/node.exe' --test --test-concurrency=1 scripts/agentic/corpus-store.node-test.mjs
```

Run from this isolated source worktree on the bound Windows/local NTFS host.
Use a new receipt filename. No install/build/browser/server is required. The
suite launches short-lived CLI/CIM/Git children only against marked temp data,
captures complete bounded stdout/stderr and exit events, verifies source hashes
before/after, and retains each fixture's `receipt.json`. A failed assertion must
retain its actual output and stop adoption; static checks cannot substitute.

The 38 cases cover all writers/replays and raw summary bytes; actual linked
contention and a fresh overlapping retry; pre-commit crash; six post-decision
cuts through lost ACK; aggregate/dynamic-file crash recovery for register,
heartbeat, handoff and message; a trusted reader during live partial apply; interrupted
recovery; actor/command/task/revision conflicts and historical replay; live
owner refusal; actual kernel PID/birth comparison with synthetic old-birth
metadata and unknown owner markers; delayed competing reclaimers; corrupt
prepare/commit; third-value interference; indexed orphan/session drift; invalid
applied/missing history; partial atomic remnants; binding/boot/host/filesystem
refusal and an actual separate clone. The birth-mismatch case does not force the
OS to recycle a PID. The remnant case constructs a synthetic partial temporary;
it does not claim an actual mid-sector crash. Those limits must remain visible.

Static validation at authoring is limited to Node `--check`, PowerShell parser,
JSON parsing, Git whitespace/source review and immutable hashes. No runtime
qualification, Windows locking guarantee, repair acceptance or live adoption is
claimed. Mixed WSL/Windows, cross-host/network filesystems, boot changes and
machine power loss remain unsupported. Directory flush/power-loss durability is
not provided by file fsync plus rename. Root retains direct-writer retirement,
real adoption/preflight, private wrappers, CI wiring and cockpit integration.

### Independent Windows review corrections — source only

The independent review of `78701011293db7626f307166d427b2126dbafc28`
required three P1 corrections. That commit and its private source inventory remain
preserved; no claim is made that it qualified. This successor addresses them in
the same isolated scope, without modifying the baseline matcher.

1. Every lease comparison now validates and canonicalizes Windows spellings
   before calling that matcher: ASCII case folds, backslashes/repeated
   separators normalize, dot segments disappear, and trailing component dots
   or spaces normalize to the same physical name. Parent traversal, devices,
   alternate streams, reserved/unsupported characters, short-name `~` aliases
   and non-ASCII patterns refuse. Raw source spellings remain in the existing
   task/lease records; the canonical comparison keys do not become a registry.
2. Session and task IDs must be safe Windows components; device names, device
   extensions and trailing-dot IDs refuse. Case-folded duplicate session IDs
   and case-folded corpus-file keys refuse before preparing or committing any
   after-image. The CLI gives an explicit session-alias refusal rather than
   allowing two logical session files to collide physically. Initial adoption
   and trusted validation enforce the same namespace rules.
3. Atomic writes use a fixed 110-character sibling temporary basename comprising
   a full SHA256 of the case-folded target basename and a UUID. They no longer
   append 45 characters to a potentially 241-character handoff name. Recovery
   recognizes only the exact target-derived prefix/UUID and validates partial
   bytes against the decided after-image. All corpus components are checked
   against the 255-character limit before COMMIT.

Ten additional real CLI cases are written: seven equivalent-path conflicts,
case-folded session registration, twelve reserved/invalid identifier requests
within one case, and maximum-length task/session registration/claim/handoff.
Each negative case asserts no new decision/revision, preservation of the clean
head and success of the next ordinary operation. The maximum-ID case requires
the 241-character handoff to publish, replay once and remain usable with the
short temporary name. These assertions are source only until Root allocates
execution. Non-ASCII source paths and NTFS short-name alias patterns remain
explicitly unsupported; no filesystem discovery or current-corpus rewrite
attempts to guess their identity.

### Actual b0575b46 first failure and bounded observer successor

Root allocated one pinned serial run of the independently source-accepted
`b0575b4645496a40c55a04346ea0b7e797ca71e9` on 2026-11-18. The actual phase
ran 17:57:41.7834821Z–17:57:45.6981679Z and stopped at the first failing case.
Initial registration returned `owner_observation_unavailable`: 0 cases passed,
1 failed, 0 skips reported, and 35 remained unqualified. Full stdout/stderr,
fixture outputs and process-exit receipts are preserved privately. The final
failure JSON is SHA256
`b78df21fc01d82b014d35f2a53be569978a15b6d9581b202fb0db439334d0629`.
No retry or source repair occurred within that allocation. Root released its
slot before granting this narrow source successor.

The fixture intentionally supplies only six base environment keys and omits
`OS`. The helper previously required ambient `OS=Windows_NT`; that is not an
authoritative platform observation. The successor uses
`System.Environment.OSVersion.Platform == System.PlatformID.Win32NT` instead.
Node's actual `process.platform`/pinned runtime check, CIM boot/process-birth
observations and fixed-local-NTFS requirement are preserved. No fake Windows
environment label is injected into the fixture.

The same production `observeOwner` has an optional diagnostic receipt callback.
It reports helper exit/status, safe raw protocol JSON, validation result and raw
stdout/stderr byte counts/hashes. Arbitrary stderr/output is not disclosed.
Helper refusals include a bounded stage, exception type and HRESULT; no paths,
credentials or environment values are dumped. Diagnostics cannot change the
validated facts or weaken a refusal.

New `scripts/agentic/coordination-qualification/observer-preflight.mjs` authors a
small separately allocated preflight before another full 36-case run. It uses
the exact production observer in a child with the same six-key minimal
environment and asserts `OS` is absent. It observes its current worker, then a
fresh owned live child, waits for that child's actual exit, and observes the
exited identity. PID reuse is reported as a different birth, never killed or
mistaken for the original child. All fixture files are in a new marked temp
directory; no `.xenios`, binding, registry or task is created.

After exact-source review and Root's separate small slot, the command is:

```powershell
& 'C:/Users/sboad/projects/xr-toolchains/node-v20.19.0-win-x64/node.exe' scripts/agentic/coordination-qualification/observer-preflight.mjs --expect-sha EXACT_REVIEWED_SUCCESSOR_SHA --receipt 'C:/Users/sboad/projects/factory-coordination-repro-20261118/observer-preflight-NEW-UNIQUE-NAME.json'
```

Use the full reviewed SHA and a new receipt path. No install/build/browser is
needed. The preflight captures source hashes before/after, complete bounded
worker stdout/stderr, raw observer metadata and actual owned child exits. A
worker timeout or missing result does not qualify descendant cleanup. The
preflight's worker is limited to 45 seconds, its held child to 20 seconds, and
each existing production helper call to 8 seconds. The preflight source has
not run at this freeze; neither this correction nor a small preflight alone
qualifies the full coordination protocol or permits live adoption.

### Actual a535b8f4 results and deadline successor — source only

The separately allocated production-observer preflight on exact
`a535b8f4f50ac73cd800d47afec4d4c12d791d02` passed three observations with `OS`
absent: current worker, fresh live owned child, and that child absent after
actual exit. All helpers and owned processes exited0; source hashes were
unchanged. Its private receipt SHA256 is
`a896b3e185fa57e34264fbb8d6a9591cccba2ed5f42e84d32a200bb3409e9e7a`.
That pass was observer-only.

The subsequent full run at the same exact source stopped with **4 PASS, 1 FAIL,
0 reported skips and 31 unqualified**. The fifth case, committed crash after
the first corpus replacement, received `coordination_busy` instead of
`recovery_required`. The phase was 18:24:09.9767582Z–18:25:28.2463059Z on
2026-11-18, recorded KAN-234/13489. Full failure/root-cause JSON SHA256 is
`49bfcaddb59e0b33934dac51ceed30e333a65fa0d617ec46c7677c25eb6f1981`.
The earlier baseline, b057 first failure and observer evidence remain preserved.

Read-only analysis established that the dead-owner mutex had been successfully
removed. The validator made one atomic attempt at 18:25:10.150Z, ran its trusted
owner observation, then exited busy at 18:25:16.358Z with no second attempt.
The three-second waiting budget expired during the bounded accepted observation;
after proven-dead reclamation, the loop-top deadline check prevented acquisition
of the now-free mutex. The raw removed owner token and exact found-versus-birth
result were not retained and are not reconstructed.

After independent finite design review, Root authorized moving the elapsed-budget
check to the failed-rename catch. Every loop may first try the immediate atomic
publication. If that fails, an expired waiting budget stops before any new sleep,
observation or reclamation path. An already validated dead-owner removal can
finish after the budget and get one immediate acquisition attempt; another live
winner makes that attempt fail and receives no further probe/removal. The default
budget stays three seconds. Token, PID/birth, boot/namespace checks, assertHeld,
no-TTL-theft policy and explicit recovery are unchanged.

Two additional real-time regression cases bring the authored suite to 38:

- A reclaimer pauses at the actual production old-owner unlink boundary for more
  than three seconds, then must acquire once and report recovery_required. Exact
  recovery/replay retains the original revision/claim and denies the overlap.
- A second actual CLI replaces the dead token with a new live populated mutex
  while the first reclaimer is held past its budget. The delayed old unlink must
  preserve the replacement; its failed rename returns busy, and the winning owner
  and subsequent ordinary operation remain usable.

These use observed filesystem boundaries and real elapsed time, not fake clocks
or substituted observer facts. The candidate preload records the actual helper
invocations without changing their arguments/results, so the expired loser must
also prove it did not probe the replacement winner. The new source/tests have not
run at this freeze.

The prior first-failure monitor performed expensive CIM discovery before killing
known retained handles. **Case6 did start**: a marked after-corpus-2 fixture was
created at 18:25:16.3668513Z; its CLI4852 started but emitted no mutex attempt,
was killed and exited-1. It has no completed receipt or PASS. All174 captured
actual process handles exited; unknown already-exited fast children remain a
coverage limit. The next private monitor must kill the known retained worker/root
handles before discovery, then sweep descendants with exact birth checks. The
executed old monitor and incomplete sixth fixture are preserved.

Root may qualify exact corrected source on hosted Windows with Node **20.19.0**,
one test worker and a new receipt destination. Check out the exact reviewed
commit, rather than a moving branch or generated merge commit. Root retains
hosted/local resource allocation, fail-fast supervision, artifact collection and
CI wiring. A passing application workflow does not execute these Node tests by
implication. No local test/probe/build or live adoption is authorized by this
source freeze.

### Hosted-compatible finite supervisor — authored, not run

`scripts/agentic/coordination-qualification/run-candidate.ps1` is a one-shot
qualification wrapper, not a controller or daemon. It resolves the repository
relative to itself, obtains the actual Node executable through Get-Command and
requires v20.19.0, PowerShell7/Windows, exact reviewed HEAD, a clean worktree and
three fresh RAM samples of at least700MiB. It starts one serial Node suite with
384MiB old-space. The candidate CLI's six-key environment remains unchanged.

The wrapper creates a new marked artifact directory outside the worktree. It
retains complete UTF-8 stdout/stderr, the suite receipt when available, actual
retained process handles with birth/exit evidence, source/script identity and
copies of only marked owned synthetic fixtures. Fixture ownership is now written
before Git setup so interrupted setup is also preservable. Test source receipts
include the supervisor itself. The newly created temp root is resolved to its
real path before deriving worktrees/gates, so a runner's short-name temp spelling
does not split event paths from the explicit binding. No fixture is deleted,
recovered or adopted.

```powershell
pwsh -NoProfile -File scripts/agentic/coordination-qualification/run-candidate.ps1 -ExpectedSourceSha EXACT_REVIEWED_SUCCESSOR_SHA -AllocationId HOSTED-COORDINATOR38 -OutputParentDirectory $env:RUNNER_TEMP -ExpectedCaseCount 38
```

Root owns checkout of the exact commit, Node setup, outer job timeout and upload
of the newly printed artifact directory. No workflow file is included here.
The monotonic budget is600seconds, with570for supervision and30reserved for
cleanup/artifacts. No longer test budget or automatic retry is introduced.
The wrapper cannot return qualified unless Node exits0, all38cases pass with no
skips, the source stays exact/clean, streams are complete, captured handles have
exited, the source-bound suite receipt agrees, and all38fixture receipts are
collected. The source-only wrapper has not been executed or qualified yet.

On the first observed TAP failure it terminates already retained known
worker/root handles before expensive CIM discovery, then sweeps descendants
with exact birth checks. It never kills a process merely by name or an old PID.
Synchronous CIM may still delay *observation* of a failure; firstFailureObservedAt
does not claim the time of occurrence. Later incomplete cases may have begun and
are preserved/disclosed rather than counted as passes. Already-exited fast
children that were never captured are not individually proved. Unmarked setup
directories are listed, never copied as trusted fixtures. Finally, an OS or
filesystem call can stall despite operation budgets, so Root's CI must enforce
an outer wall-clock job timeout. These are explicit supervision limits, not a
claim of exhaustive process accounting, a hosted runtime PASS, or live adoption.
