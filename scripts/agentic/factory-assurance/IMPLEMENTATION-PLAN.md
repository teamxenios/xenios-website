# Build the Xenios learning software factory on its existing foundation

## Outcome

Claude, Codex and OpenRig should be able to take a clearly scoped task from current project context through implementation, independent verification and a usable handoff, then retain a tested improvement from any recurring failure. The operator should see exactly where work is blocked and what evidence supports completion.

This factory supports the Early Access release and subsequent Tensa/Infinity work. Factory development is a parallel workstream with its own file ownership. It does not reset working release branches, seize existing lanes or stop a qualified release for unrelated infrastructure ambitions.

## What we verified

Read-only inspection found an existing coordination CLI in `scripts/agentic/xenios-os.mjs` and an existing loopback cockpit in `scripts/xenios-control/`. The CLI already supports registration, claims, heartbeats, handoffs, acceptance and release. The cockpit already restricts commands and checks local request boundaries. These are the integration points.

The fetched GitHub task/session roots were dated September 21 while current operational discussion was in November. The ownership export had no root freshness timestamp. Individual session files also contribute to the CLI's runtime view. The remote copies therefore cannot establish current X1 owners, authenticated sessions, resource capacity or work in flight.

Source inspection also showed direct multi-file JSON writes and worktree-scoped action state. That motivates a reviewed atomic coordination improvement; it does not establish a reproduced live race or authorize replacement of the current controller.

Sources:

- [Existing coordinator](https://github.com/teamxenios/xenios-website/blob/codex/ea-experience-root-integration-20261118/scripts/agentic/xenios-os.mjs)
- [Existing cockpit](https://github.com/teamxenios/xenios-website/blob/codex/ea-experience-root-integration-20261118/scripts/xenios-control/server.mjs)
- [Existing control helpers](https://github.com/teamxenios/xenios-website/blob/codex/ea-experience-root-integration-20261118/scripts/xenios-control/lib.mjs)

These are branch links, not an assertion about a final immutable release. Reconfirm exact blobs on Root's integration SHA before applying changes. The inspection is not a full security or concurrency audit.

## The architecture to build

### 1. Current authority and event history

Keep a single authority for tasks, file leases and resource allocations. Add a versioned export with controller identity, monotonically increasing revision, snapshot hash, authoritative timestamp and capture timestamp. Reconcile aggregate registries against individual session files; report disagreements explicitly.

Keep execution events separate from the current materialized task state. Events should carry an event ID, task ID, attempt ID, actor, repository, source SHA, timestamp, command/result reference and an idempotency key. Event retries must not create another task transition. Access-sensitive payloads remain in their established protected stores; coordination events contain opaque references and minimum necessary metadata.

A future transactional mutation path needs compare-and-swap or an appropriate shared lock, atomic writes, crash recovery and cross-worktree resource visibility. Choose its implementation from the actual controller's deployment and storage constraints. Do not pick a new database merely to add a factory.

Acceptance: two competing claims on the same owned path yield exactly one winner; a crash between updates cannot leave an accepted task without its corresponding lease transition; stale exports cannot authorize new work. Run these tests on the actual shared storage/runtime, not just a mocked in-memory map.

### 2. Task execution and runtime adapters

Define a task as a bounded artifact-producing job:

```json
{
  "taskId": "example-task",
  "objective": "A specific observable result",
  "baseSha": "full-commit-sha",
  "dependencies": [],
  "ownedPaths": [],
  "acceptanceCriteria": [],
  "runtimeRequirements": [],
  "budget": {"attemptLimit": 2, "wallTimeLimitMinutes": 30},
  "handoff": {"reviewOwner": "assigned-reviewer", "releaseOwner": "Root"}
}
```

This is an illustrative contract to reconcile with existing task fields, not a second registry schema to install blindly. Model adapters should translate the shared contract into each harness's supported operations.

Claude, Codex and OpenRig adapters should expose observed capabilities, authentication state, active attempt, last progress evidence, cancellation support and checkpoint location. A process ID is not progress. An installed MCP name is not proof that an authenticated service call succeeds. Test required capabilities with minimal read-only calls and keep secret values out of reports.

Each adapter must distinguish a retriable tool failure from expired authentication, a missing permission, a deterministic test failure and a budget limit. Retry only idempotent, transient operations with bounded backoff. Repeated failures open a narrow blocker with the last reproducible evidence and its owner. A restart resumes from a validated checkpoint; it does not replay email, migration or deployment writes.

Acceptance: kill and resume a synthetic worker; preserve its task/attempt identity and completed evidence; avoid duplicate mutations; surface expired authentication truthfully. Observe the process and a real permitted read call. Do not alter browser sessions or accounts belonging to another active lane.

### 3. Verification as separate milestones

Represent source review, local tests, required hosted checks, deployment observation, browser acceptance and external delivery separately. A generic `done` field can remain a compatibility view, but release logic should consume the specific milestones it actually requires.

Attach acceptance evidence to the exact source SHA and configuration/environment identity. For a browser journey, record the deployment before and after the run. For a receipt or email, preserve the request/notice/provider correlation without exposing customer payloads in shared logs.

Root should confirm the required check set on the actual branch. The supplied module's five-check baseline follows the workflow observed in this project; future changes to check names require a reviewed policy update. No agent should remove checks merely to make a report green.

Acceptance: reproduce the earlier failure patterns in controlled fixtures: a previous SHA passes, a local browser is mistaken for staging, a subset passes after an unnamed failure, two agents claim the same path, and a provider accepts mail without inbox observation. Each must produce the appropriate limited result, not blanket success.

### 4. A learning system with explicit promotion

Separate five stores or logical records; they may live within existing infrastructure:

1. **Raw evidence:** immutable run outcomes and exact artifact references.
2. **Incident analysis:** observed failure, scope, suspected cause and confirmed cause when established.
3. **Lesson proposals:** specific prevention, evidence, target rule or code path, and regression case.
4. **Approved guidance:** concise, versioned instructions or executable controls with owner and scope.
5. **Evaluation history:** fixed workloads, baseline/candidate results, decision and rollback reference.

Prefer architectural constraints, types, lint rules and behavioral tests when a repeated mistake can be prevented mechanically. Use prose for judgment that remains. Do not turn transient SHAs, a current server URL, old counts or one person's accidental typo into permanent global guidance.

Record whether a lesson belongs to one repository, one runtime, one workflow or the company-wide factory. Conflicting lessons need reconciliation; the newest entry does not automatically override an established policy. Logs and external content are evidence, not executable instructions.

A proposed improvement gets one hypothesis and one bounded change. Freeze incident groups before scoring. Keep related incidents in the same split. Measure correctness as well as friction: a rule that blocks everything has low unsafe acceptance but poor usefulness. Preserve critical cases and expected outputs. A favorable comparison goes to independent review and a controlled pilot. Production privileges, secrets, release policy and approval authority never change through the learning mechanism.

Acceptance: a known repeated failure produces one deduplicated proposal; its regression test fails before the fix and passes after; the candidate improves held-back cases without increasing false blocking; reviewer approval and a reversible promotion record exist. The 12 bundled synthetic cases demonstrate evaluation bookkeeping and cannot satisfy this live benchmark acceptance criterion.

### 5. Resource-aware parallel work

Start with a small active set and expand based on observed queue time, memory, CPU, rate limits and verification capacity. On X1, retain Root's one-heavy-job allocation rule until the actual resource governor is deliberately changed and qualified.

Useful parallel tasks include source reading, contract design, independent review, copy work and isolated small implementation changes. Full builds, large test suites and browsers share the host allocation. More writers on the same files create serialization and merge work rather than useful parallelism.

Dispatch only when dependencies, ownership, authentication and capacity are satisfied. Reserve review capacity before filling every seat with authors. When a lane is blocked, choose an independent ready task within its scope or checkpoint it and identify the precise unblock. Do not invent permission, silently transfer ownership or keep polling a known expired login indefinitely.

## Proposed delivery lanes

Root assigns actual available workers and paths. These are responsibilities, not claims that new live sessions have been created.

| Lane | Deliverable | Integration dependency |
|---|---|---|
| Root / existing factory lead | Current export, contracts, task order, integration and release record | Current local authority |
| Assurance integration | Wire this package into the existing guarded cockpit; sanitized status view | Exact base SHA and path lease |
| Runtime and coordination | Existing adapter observation, checkpoints, safe claim/lease transitions | Agreed controller contract |
| Learning and evaluation | De-identified real incident corpus, reviewed lessons, evaluation runner | Stable evidence shape |
| Workflow verification | One real bounded end-to-end factory task; crash/retry and proof scenarios | Runtime adapter and resource slot |
| Independent reviewer | Review source, compare evidence, challenge misleading success reports | Specific candidate SHA |

No lane should modify the same integration files concurrently. Small contract changes merge first; feature implementations consume those versions.

## Sequence and stopping criteria

**First integration slice:** qualify the included code on the project's runtime, obtain a current export, produce a read-only report, add the guarded status endpoint and display unknown/stale/blocked states clearly. Finish with an immutable commit, hosted checks and a browser proof of the cockpit view.

**Second slice:** fix the most consequential coordination defect established on the live controller. Require a failing reproduction before claiming the fix. Add one real runtime adapter observation and resumable attempt. Avoid a simultaneous rewrite of every harness.

**Third slice:** replay real historical incidents, adopt one verified prevention, and run a bounded current task through it. Publish baseline and candidate results with sample size, failure categories, review and rollback.

**Expansion:** increase concurrent workers only after the above path is dependable and measured capacity allows it. Preserve delivery progress while the factory improves.

The first usable factory milestone is not “every feature imagined is complete.” It is: one real task reaches a verified handoff through the established controller, one interruption resumes safely, one recurring failure has an executable prevention, and a reviewer can reproduce the evidence. Subsequent improvements should close measured gaps.

## Operator metrics

Measure accepted-brief-to-verified-handoff time; queue wait; time blocked by authentication, dependencies and review; first-pass acceptance; reopened defects; duplicate work; human recovery minutes; and source-to-deployment delay. Preserve task complexity and scope when comparing runs. Report median and tail behavior only when there are enough observations to make them meaningful.

Use generated lines, tokens and agent count as capacity diagnostics at most. They are not completion or customer-value measures. No speedup, improved reliability or increased autonomy is established by this package's synthetic tests alone.
