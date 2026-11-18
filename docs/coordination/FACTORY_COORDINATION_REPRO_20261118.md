# Actual coordinator contention and interruption qualification

Task: `FACTORY-COORDINATION-REPRO-20261118`. Source baseline:
`e6e11c3f923491d55bc2cd221c29da77001a0822`.

This slice prepares an isolated reproduction harness. **Runtime is NOT RUN.**
No coordination defect is claimed reproduced, no fix is implemented, and no
real controller, registry, cockpit, native seat or external service is changed.
Root retains the one-heavy-job allocation and all canonical controller seams.

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
The source baseline is suspected to violate the two contention/crash checks;
that remains a hypothesis until an actual allocated run produces its receipt.

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
