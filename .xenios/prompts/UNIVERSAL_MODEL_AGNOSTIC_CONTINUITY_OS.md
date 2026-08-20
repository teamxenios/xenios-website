# XENIOS RESEARCH — UNIVERSAL MODEL-AGNOSTIC CONTINUITY OS + BUILD TAKEOVER PROMPT
**Version:** 2026-08-19  
**Compatible with:** Claude Code, Claude/Fable, Codex, ChatGPT coding sessions, and human engineers  
**Repository:** `teamxenios/xenios-website`

---

# FOUNDER RESUME DIRECTIVE

Resume the Xenios Research build from the exact current repository and production state.

Do not ask Samuel to repeat project history.

Do not restart from `main` merely because it is the default branch.

Do not choose an arbitrary number of parallel sessions.

Do not rebuild solved systems.

Do not trust this chat, an old prompt, or an old handoff more than current Git, `.xenios`, production, and exact test evidence.

This prompt works for:

- the same active account continuing
- a new Claude account
- a switch from Claude to Codex
- a switch from Codex to Claude
- a single session
- a lead coordinator
- an isolated worker
- emergency recovery after usage exhaustion

Your first responsibility is to determine which situation applies.

---

# 1. SYSTEM OF RECORD

Authority order:

1. Current production read-only truth
2. Current Git remote and commit graph
3. Current worktrees and dirty state
4. `.xenios` continuity corpus
5. Latest exact-SHA handoff
6. Current task/lease
7. Canonical full vision
8. Old prompts and chat transcripts

Read:

```text
AGENTS.md
CLAUDE.md
.xenios/MASTER_CORPUS.md
.xenios/PROJECT_STATE.json
.xenios/RELEASE_STATE.json
.xenios/ACTIVE_TASKS.json
.xenios/SESSION_REGISTRY.json
.xenios/CODE_OWNERSHIP.json
.xenios/DECISIONS.md
.xenios/BLOCKED_EXTERNAL.md
.xenios/FOUNDER_ACTIONS.md
docs/research-launch/XENIOS_RESEARCH_FULL_BUILD_STATUS_2026-08-19.md
.xenios/FULL_VISION.md if present
latest .xenios/handoffs/**
latest .xenios/messages/**
```

Also read the attached or repository copy of:

```text
XENIOS_RESEARCH_CANONICAL_FULL_VISION_2026-08-19.md
```

If you are the lead and `.xenios/FULL_VISION.md` is absent, add the canonical vision there as a durable, version-controlled source.

---

# 2. LAST KNOWN STATE — VERIFY, DO NOT ASSUME

Last reported audit state:

```text
Production runtime: a66434d980c909303d3595382e5df77342fbc127
Release: RESEARCH_PLATFORM_0_5_RELEASE_A_RC2
Rollback runtime: 458e7284
Release A: live
M71: applied
M70: absent/parked
M72/M73/M74: registered but not applied
Canonical production catalog: 420 rows / 217 products / 417 active variants / 417 active member prices
Latest founder workbook: 426 rows / 424 numeric retail prices / 2 Price on request
Latest 426-row workbook: not yet fully reconciled at the time of audit
Direct Buy Now: dark
Care discovery: not live
Paused fleet: lead plus nine workers
Fragile state: seven dirty worktrees containing uncommitted worker work
Canonical integration branch: xenios/launch-integration-20260819
Audit-recommended base: 3a072b8, with status commit 7fc0aab on top
```

This block ages quickly.

Verify every item.

Never clean or prune the seven dirty worktrees until their contents are safely committed, patched, or backed up.

---

# 3. STARTUP COMMANDS

Run:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git fetch --all --prune --tags
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log -20 --decorate --oneline
git worktree list --porcelain
git branch -a --sort=-committerdate
```

Run:

```bash
node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
node scripts/agentic/xenios-os.mjs stale
node scripts/agentic/xenios-os.mjs next
```

If a command does not exist, continue using the underlying JSON/corpus files and record that the helper is unavailable.

Inspect the live OS process list or session tooling before deciding that a session is stale.

---

# 4. DETERMINE YOUR ROLE

## A. Same active session

You are the same active account/session when:

- your session ID is registered
- your worktree exists
- your lease is current
- no other session has legitimately taken the path
- the worktree state matches your task

Then:

- do not re-register
- do not mark yourself stale
- do not release your current lease
- continue the current task
- refresh facts only enough to avoid drift

This preserves the active-account rules.

## B. New account taking over a clean handoff

When the prior account produced `handoff_ready` or `paused_usage_limit`:

- read the exact handoff
- verify its pushed SHA exists on origin
- verify dirty state
- register this session
- claim the released exact-path lease
- continue the stated next task
- do not re-audit the entire platform unless the handoff requires it

## C. Emergency recovery

When the prior account disappeared or exhausted usage:

1. locate its worktree
2. determine whether a live process still writes there
3. back up dirty files
4. record branch/HEAD/diff/untracked files
5. never reset or clean before preservation
6. commit coherent work or create a recovery branch/patch
7. mark the old session stale, not deleted
8. transfer only the necessary lease
9. continue

## D. Lead coordinator

You are lead only if the corpus/current founder message assigns integration/release authority.

The lead owns:

- integration branch
- protected composition seams
- route registration
- migration DAG
- release manifests
- final conflict resolution
- production packet
- exact release SHA

The lead does not need to open a fixed number of sessions.

Use existing sessions first.

Add a session only when:

- a dependency-ready P0/P1 lane is unowned
- its file paths are disjoint
- the machine can support it
- integration capacity exists

## E. Isolated worker

A worker owns one exact path family and one coherent task.

A worker:

- does not edit lead seams
- does not merge into integration
- does not deploy
- does not mutate production
- runs focused tests
- commits/pushes coherent slices
- hands off exact SHA

---

# 5. FOUNDER PRIORITY DIRECTIVES

These are current build requirements.

## 5.1 Single Early Access code

The customer-facing Early Access flow must have one code prompt.

Founder access code:

```text
XeniosGenesis
```

Display:

```text
Xenios Genesis
```

Never commit plaintext.

Use a secure hash in environment configuration.

Remove the outer/first shared Research password from the Early Access customer route and API path.

Keep the one dedicated Early Access code gate.

Do not weaken admin/member/supplier/affiliate/Care authorization.

## 5.2 Anyone with the Early Access code can enter the customer order flow

They do not need a second shared password.

They still must:

- provide required customer/contact/shipping information
- accept the current Research Use Policy
- use only allowed Research product pathways
- obey applicable jurisdiction/identity/age/business rules already required by the legal architecture

## 5.3 Quantity up to 100 per exact variant

Reconcile all layers to a default maximum of 100.

Do not leave hidden 20/50 limits.

Preserve only real explicit lower product limits.

## 5.4 Full retail catalog

Read:

```text
XENIOS_MASTER_CATALOG_AFFILIATE_PRICING_2026-08-16(2)(2).xlsx
XENIOS_FULL_CURRENT_RETAIL_PRICING_426_VARIANTS_2026-08-19.csv
```

Target:

```text
426 catalog rows
424 numeric retail prices
2 Price on request
```

Retail, not wholesale.

Reconcile through Product Control/canonical pricing.

Do not hard-code prices in the client.

## 5.5 Continue the entire full vision

Revenue P0 comes first, but do not lose the larger platform.

Read the canonical full vision and execute its dependency order.

---

# 6. IMMEDIATE RESUME ORDER

Because the last audit paused all sessions, resume safely.

1. Re-verify production and integration state.
2. Inventory all dirty worktrees.
3. Preserve and checkpoint every dirty lane before new edits.
4. Reconcile the 426-row workbook.
5. Implement the one-code Early Access entry.
6. Reconcile quantity 100 across UI/server/database/tests.
7. Prove assisted order end to end.
8. Prove affiliate attribution.
9. Close request -> quote/payment -> canonical order.
10. Prove fulfillment/tracking.
11. Enable Buy Now only for readiness-verified subset.
12. Continue P1/P2 full vision.

Do not start from scratch.

---

# 7. ONE WRITER PER PATH

Before editing:

- inspect active leases
- inspect current worktrees
- inspect last-write times where relevant
- declare owned paths
- declare forbidden paths

Never edit another session's active paths.

Lead-owned examples commonly include:

```text
server/index.ts
server/research/index.ts
client/src/research/section.tsx
client/src/research/adminx-section.tsx
migration DAG
release manifests
.xenios shared state
```

A worker sends a wiring snippet/handoff instead.

---

# 8. BUILD LOOP

For every coherent slice:

1. inspect exact current state
2. implement the smallest complete change
3. run focused tests
4. run typecheck when shared contracts changed
5. commit
6. push
7. update heartbeat/task
8. update exact-SHA handoff
9. message dependent lanes
10. continue

Checkpoint approximately every 15 minutes while writing and immediately after:

- migration changes
- composition changes
- shared contract changes
- green gate milestone
- blocker discovery
- release candidate
- before usage becomes low

Do not accumulate thousands of uncommitted lines.

---

# 9. QUALITY STANDARD

The goal is fast output and high-level code quality.

Every consequential domain needs:

- server authority
- closed input projection
- idempotency
- cross-customer isolation
- audit
- negative tests
- truthful fail-closed behavior
- no secret/private field leakage
- exact-SHA evidence

Critical negative controls:

- browser cannot set authoritative price
- browser cannot set paid
- affiliate cannot set commission
- customer A cannot read customer B
- Care product cannot enter RUO checkout
- unpaid order cannot release to fulfillment
- held product cannot Buy Now
- duplicate requests/orders/payments/commissions are idempotent

---

# 10. PRODUCTION SAFETY

Ordinary engineering may continue:

- inspect
- code
- test
- commit
- push
- update corpus
- prepare release packets

Without current explicit exact-action approval, do not:

- apply production migrations
- deploy
- change production env
- change live pricing
- enable consequential flags
- send real email
- mark payments
- mark shipments
- create clinical facts
- publish legal terms
- create real payouts

Never print secret values.

---

# 11. PRE-SWITCH CHECKPOINT

The canonical checkpoint procedure lives in
`.xenios/prompts/PRE_SWITCH_CHECKPOINT_PROMPT.md` — follow that file exactly;
the summary below restates it and yields to it on any difference.

When usage or context is approaching its limit:

1. stop starting new work
2. finish or isolate the atomic edit
3. run focused tests
4. commit/push coherent work
5. back up dirty remainder
6. update:
   - PROJECT_STATE
   - RELEASE_STATE
   - ACTIVE_TASKS
   - SESSION_REGISTRY
   - CODE_OWNERSHIP
   - DECISIONS
   - BLOCKED_EXTERNAL
   - FOUNDER_ACTIONS
   - exact handoff
7. release lease if stopping
8. set session:
   - `handoff_ready`
   - `paused_usage_limit`
   - `blocked_external`
   - `stopped`
9. provide the next exact task and first command
10. stop coding

Required handoff:

```text
[ACCOUNT SWITCH HANDOFF]

SESSION ID:
ACCOUNT:
MODEL:
TASK:
BRANCH:
WORKTREE:
BASE SHA:
FINAL PUSHED SHA:
DIRTY STATE:
LEASED PATHS:
COMPLETED:
VERIFIED:
TESTS:
TYPECHECK:
BUILD:
MIGRATION:
PRODUCTION MUTATED:
BLOCKERS:
NEXT EXACT TASK:
NEXT FIRST COMMAND:
FILES NOT TO DUPLICATE:
FOUNDER ACTION:
```

---

# 12. NEW MODEL START RESPONSE

After recovery, return one compact block:

```text
[XENIOS MODEL TAKEOVER COMPLETE]

MODEL:
SESSION:
ROLE:
REPOSITORY:
WORKTREE:
BRANCH:
BASE SHA:
CURRENT HEAD:
PRODUCTION SHA:
TASK:
LEASE:
DIRTY WORK PRESERVED:
LAST HANDOFF:
FIRST CODE ACTION:
PRODUCTION MUTATED:
```

Then keep working.

Do not stop after this status.

---

# 13. MILESTONE RESPONSE

At a coherent milestone:

```text
[ACTIVE XENIOS BUILD CHECKPOINT]

SESSION:
TASK:
BRANCH:
PUSHED SHA:
LEASE:
COMPLETED:
TESTS:
BLOCKERS:
PRODUCTION MUTATED:
NEXT CODE ACTION:
```

Then continue.

---

# 14. FINAL DIRECTIVE

The account is temporary.

The program is continuous.

Git, production, and `.xenios` are shared memory.

Continue the exact build rather than recreating context.

Preserve dirty work.

Use one writer per path.

Commit and push continuously.

Build the minimum complete revenue loop first.

Continue the full Xenios Research vision after P0.

Do not ask Samuel to repeat history.
