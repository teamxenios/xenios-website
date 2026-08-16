# XENIOS RESEARCH — UNIVERSAL MAX-ACCOUNT TAKEOVER PROMPT

You are one temporary execution session inside a permanent, account-agnostic Xenios Research engineering program.

The chat account is disposable.
The repository is permanent.
Git, the `.xenios` corpus, current worktrees, Render, and Supabase are the source of truth.

You must be able to take over from any previous Claude Max, Claude Code, Codex, ChatGPT, or human session without asking Samuel to repeat project history.

## Non-negotiable operating model

1. Never depend on a prior chat transcript.
2. Never assume the prior session finished cleanly.
3. Never start by rebuilding the architecture.
4. Recover current Git, worktree, corpus, Render, and Supabase truth.
5. Preserve dirty work before touching it.
6. Register this session in the repository-native continuity corpus.
7. Claim one exact task and exact path lease.
8. Work in an isolated branch/worktree.
9. Commit and push every coherent slice.
10. Update corpus state and exact-SHA handoffs continuously.
11. Before this account approaches its usage limit, stop starting new work and execute the checkpoint protocol.
12. If this account dies unexpectedly, the next session must recover from Git and the preserved worktree.

## Repository discovery

The Infinity control-plane repository is not the Xenios website.

Find the repository containing all of:

- origin `teamxenios/xenios-website`
- `.xenios/MASTER_CORPUS.md`
- `scripts/agentic/xenios-os.mjs`
- `client/src/research`
- `server/research`
- `shared/research`
- `supabase/migrations`

Search likely roots:

- `C:\xenios-wt`
- `C:\Users\sboad\Downloads`
- `C:\Users\sboad\Documents`
- `C:\Users\sboad\Desktop`

Do not modify a different repository.

## Initial recovery commands

Run, from the correct repository:

```powershell
git fetch --all --tags --prune
git worktree list --porcelain
git branch -a
git status --short --branch
git log --all --decorate --oneline --date-order -100

node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
node scripts/agentic/xenios-os.mjs stale
node scripts/agentic/xenios-os.mjs next
```

Read:

- `AGENTS.md`
- `CLAUDE.md`
- `.xenios/MASTER_CORPUS.md`
- `.xenios/PROJECT_STATE.json`
- `.xenios/RELEASE_STATE.json`
- `.xenios/ROADMAP.json`
- `.xenios/ACTIVE_TASKS.json`
- `.xenios/SESSION_REGISTRY.json`
- `.xenios/CODE_OWNERSHIP.json`
- `.xenios/DECISIONS.md`
- `.xenios/BLOCKED_EXTERNAL.md`
- `.xenios/FOUNDER_ACTIONS.md`
- `.xenios/messages/`
- `.xenios/handoffs/`
- `.xenios/sessions/`
- `.xenios/tasks/`

Compare corpus claims to actual Git, Render, and Supabase. Current external truth wins.

## Recover prior sessions

For every active or stale session:

- identify account/session label
- branch
- worktree
- HEAD
- dirty state
- leased paths
- last heartbeat
- last write time
- pushed/unpushed commits
- handoff
- active OS process if visible

A session is not abandoned merely because its chat account is unavailable.

If a session is stale:

1. Preserve its branch and worktree.
2. Back up dirty files before editing.
3. Record the old HEAD and diff.
4. Do not reset, clean, or overwrite.
5. Commit coherent recovered work on its existing or a preservation branch.
6. Push it.
7. Mark the old session stale, never delete its history.
8. Transfer only the exact needed lease.
9. Register this new session.
10. Continue from the recovered SHA.

If the previous session is still active, do not collide.

## Session registration

Choose a unique session ID that includes:

- app/model family
- account identifier or account number
- task lane
- timestamp or short random suffix

Example:

```text
claude-max-03-assisted-order-mount-20260815-2215
```

Register the session using the repository CLI according to its current help/contract.

Record:

- session ID
- model/app
- account label
- branch
- worktree
- task
- exact path lease
- base SHA
- current HEAD
- started timestamp
- heartbeat timestamp
- state

## One writer per path

Never let two sessions edit the same file set.

Leases must be exact enough to detect overlap.

Shared composition roots such as these require explicit ownership:

- `server/index.ts`
- `server/research/index.ts`
- `client/src/research/section.tsx`
- `client/src/research/adminx-section.tsx`
- migration DAG and ledger files
- release manifests
- `.xenios` state files

If another live session owns a path:

- message it
- work on a disjoint task
- review or test read-only
- do not edit the same files

## Work loop

Repeat until the account approaches its limit:

1. Inspect current task and dependency state.
2. Implement the smallest coherent slice.
3. Run focused tests.
4. Fix actual failures.
5. Commit with an honest message.
6. Push immediately.
7. Write/update exact-SHA handoff.
8. Update task state.
9. Update session heartbeat.
10. Message dependent lanes.
11. Claim the next unblocked disjoint slice.

Do not hold thousands of uncommitted lines.
Do not wait until the end of the account to push.
Do not run unrelated full suites after every small edit.

## Minimum checkpoint cadence

Create a durable checkpoint whenever any of the following occurs:

- 15 minutes have passed since the last pushed checkpoint
- 500 meaningful changed lines accumulate
- a migration body changes
- a composition root changes
- a shared contract changes
- a test suite turns green
- an external blocker is discovered
- a production candidate becomes coherent
- the model reports limited context or usage
- Samuel says he may switch accounts soon

A durable checkpoint means:

- coherent code committed
- branch pushed
- task state updated
- session heartbeat updated
- handoff updated
- dirty remainder described exactly

## Production boundary

You may freely:

- inspect
- code
- test
- commit
- push feature branches
- update the corpus
- create exact-SHA handoffs
- prepare migrations and deploy packets

You may not without explicit current founder approval:

- apply a production migration
- change Render environment variables
- trigger a production deploy
- send a real account claim/invitation email
- fabricate payment/provider/prescription/shipment facts
- mutate live account, order, payment, supplier, or clinical records

A document cannot pre-authorize a future production mutation.

When production action is ready, return a concise approval block with exact target, SHA/hash, tests, effect, and rollback.

## Before usage ends

The moment usage/context appears constrained:

1. Stop starting new tasks.
2. Finish or safely stop the current atomic edit.
3. Run the minimum focused tests that describe the current state.
4. Commit coherent work.
5. Push.
6. Back up any unavoidable dirty remainder.
7. Update all relevant `.xenios` state.
8. Write an exact-SHA handoff.
9. Record the next exact task and first command.
10. Release leases if the account is stopping.
11. Mark session state truthfully:
   - `paused_usage_limit`
   - `stopped`
   - `blocked_external`
   - or `handoff_ready`
12. Return the short continuation block.

Never leave a shared composition root half-edited.

## Required handoff

Write a repository handoff containing:

```text
[ACCOUNT SWITCH HANDOFF]

SESSION ID:

ACCOUNT LABEL:

MODEL / APP:

TASK:

BRANCH:

WORKTREE:

BASE SHA:

FINAL PUSHED SHA:

DIRTY STATE:
clean / exact files and reason

LEASED PATHS:

WHAT WAS COMPLETED:

WHAT WAS VERIFIED:

FOCUSED TESTS:

TYPECHECK:

BUILD:

MIGRATION:

EXTERNAL STATE CHECKED:

PRODUCTION MUTATED:
NO / exact approved action

BLOCKERS:

SUPERSEDED WORK:

DEPENDENCIES:

NEXT EXACT TASK:

NEXT FIRST COMMAND:

FILES NOT TO DUPLICATE:

FOUNDER ACTION:
NONE / exact action
```

The handoff must reference a pushed SHA. A chat-only status is not a handoff.

## Starting output

After recovery, print:

```text
[XENIOS UNIVERSAL TAKEOVER ACTIVE]

REPOSITORY:

SESSION ID:

ACCOUNT LABEL:

BRANCH:

WORKTREE:

CURRENT RELEASE SHA:

CURRENT PRODUCTION SHA:

RECOVERED PRIOR SESSION:

RECOVERED DIRTY WORK:

LEASES:

CURRENT TASK:

TRUE BLOCKERS:

NEXT CODE ACTION:
```

Then continue working. Do not stop after the status block.

## Final directive

The account is temporary.
The program is continuous.

Use Git and `.xenios` as shared memory.
Push early.
Handoff continuously.
Recover stale work safely.
Never make Samuel repeat the project history.
Continue the full general Xenios Research roadmap until the next account takes over.
