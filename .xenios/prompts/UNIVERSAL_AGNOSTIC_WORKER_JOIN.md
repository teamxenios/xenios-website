# Universal agnostic worker join prompt

Founder-issued 2026-08-20. This is THE prompt to paste into any additional
Claude Code, Fable, Codex, other coding model, or human engineer session.

Purpose: the joining session decides its own task by inspecting real state
instead of the founder assigning lanes by hand. Open model → paste this →
the session recovers state, finds the highest-priority unowned lane, builds it,
pushes an exact SHA, hands off to the lead, and takes the next task.

Paste everything below the line, verbatim.

---

```text
XENIOS RESEARCH — UNIVERSAL AGNOSTIC WORKER JOIN PROMPT

You are joining an already-running multi-model Xenios Research engineering fleet.

You may be Claude Code, Fable, Codex, another coding model, or a human engineer.

Your job is NOT to restart the project, re-audit everything from scratch, or invent a new architecture.

Your job is to:

1. recover the exact current Xenios Research state
2. determine what work is already owned
3. preserve any existing work
4. claim the highest-priority useful UNOWNED lane
5. implement it at high quality
6. test it
7. commit and push it
8. hand the exact SHA back to the lead
9. continue onto the next unowned task when approved

==================================================
SYSTEM OF RECORD
==================================================

Trust in this order:

1. current production read-only truth
2. current Git remote and commit graph
3. current worktrees and dirty state
4. `.xenios` continuity state
5. latest exact-SHA handoff
6. current task/lease ownership
7. `.xenios/FULL_VISION.md`
8. old prompts or chat history

Read:

AGENTS.md
CLAUDE.md
.xenios/MASTER_CORPUS.md
.xenios/FULL_VISION.md
.xenios/PROJECT_STATE.json
.xenios/RELEASE_STATE.json
.xenios/ACTIVE_TASKS.json
.xenios/SESSION_REGISTRY.json
.xenios/CODE_OWNERSHIP.json
.xenios/DECISIONS.md
.xenios/FOUNDER_ACTIONS.md
docs/research-launch/XENIOS_RESEARCH_FULL_BUILD_STATUS_2026-08-19.md
latest .xenios/handoffs/**
latest .xenios/messages/**

Run:

git fetch --all --prune --tags
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log -20 --decorate --oneline
git worktree list --porcelain

node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
node scripts/agentic/xenios-os.mjs next

If a helper command does not exist, inspect the underlying files directly.

==================================================
DO NOT DUPLICATE ACTIVE WORK
==================================================

Before editing anything:

1. inspect current leases
2. inspect all active Claude/Codex/Fable workers
3. inspect worktrees
4. inspect dirty state
5. identify exact path ownership
6. identify the current integration/base SHA

ONE WRITER PER PATH FAMILY.

If another active session already owns a task or path:

DO NOT edit it.

Instead:

- choose a different unowned task
- perform independent QA/review
- build tests against its interface
- find integration defects
- prepare a future-phase lane
- or run `xenios-os next` and claim another dependency-ready task

Do not create two implementations of the same authority.

==================================================
LEAD OWNERSHIP
==================================================

The main Claude/Fable lead remains the sole integration, release, and production owner unless current `.xenios` explicitly says otherwise.

Normally DO NOT edit:

server/index.ts
server/research/index.ts
client/src/research/section.tsx
client/src/research/adminx-section.tsx
migration DAG
production migration ledger
release manifests
production release packet
shared fleet `.xenios` state
production environment
production feature flags

If your implementation needs one of those:

provide an exact integration snippet and handoff to the lead.

Do not directly merge into the integration branch.

==================================================
PROTECT THE LIVE SITE
==================================================

Xenios Research is being built while a minimum live Early Access surface exists.

Every new phase must preserve the already-working phase.

Do not make broad rewrites that take the site down.

Engineering pattern:

BUILD
-> TEST
-> PUSH EXACT SHA
-> HANDOFF
-> LEAD INTEGRATES
-> FULL GATES
-> DARK DEPLOY
-> SMOKE EXISTING LIVE FEATURES
-> ENABLE NEW FEATURE
-> SMOKE NEW FEATURE

Prefer:

EXPAND
-> MIGRATE
-> ENABLE
-> CONTRACT LATER

Feature flag OFF is normally the first rollback.

Never destroy durable business data just to roll code back.

==================================================
CURRENT FOUNDER P0
==================================================

The immediate priority is a fully working Early Access revenue path.

Target journey:

/research/early-access
-> one Xenios Genesis code
-> full catalog
-> retail pricing
-> exact products/variants
-> quantities up to 100
-> optional affiliate code
-> contact
-> shipping
-> Research agreements
-> review
-> submit
-> durable XRR/order reference
-> customer email
-> Xenios admin email
-> admin queue
-> manual payment
-> canonical order
-> fulfillment
-> tracking/customer status

Do not block this on advanced automation.

==================================================
EARLY ACCESS ACCESS RULE
==================================================

Customer-facing Early Access uses ONE code:

XeniosGenesis

Display:

Xenios Genesis

Never commit the plaintext value.

Production uses a secure hash in environment secrets.

There must not be a second outer customer password before the Early Access gate.

Do not weaken:

admin
private member data
affiliate admin
supplier
finance
organization admin
Care/provider access

==================================================
FULL CATALOG + RETAIL PRICING
==================================================

Current founder source:

XENIOS_MASTER_CATALOG_AFFILIATE_PRICING_2026-08-16(4).xlsx

Retail source:

MASTER CATALOG -> Suggested Sell Price

Target:

426 catalog rows
424 numeric retail prices
2 Price on request

The two price-on-request rows are:

BAM15 500 mcg
Syringes & Alcohol Swabs

Never show $0.

CUSTOMER SURFACES SHOW RETAIL ONLY.

Never expose:

wholesale cost
supplier quote
supplier pricing
margin
markup
pricing multiplier
benchmark calculations
internal pricing notes

Use canonical Product Control/server-side pricing.

Do not hardcode customer retail pricing into React.

==================================================
PRODUCT PATHWAYS
==================================================

Visibility and pricing do not automatically mean direct purchase.

Server-authoritative product actions remain:

BUY_NOW
ASSISTED_ORDER
REQUEST_QUOTE
CARE
TEMPORARILY_HELD
NOT_AVAILABLE

Care/provider-required products must not enter RUO direct commerce.

Do not create dosing, prescribing, administration, treatment, or individualized medical guidance on Research surfaces.

==================================================
QUANTITY
==================================================

Default maximum:

100 units per exact product variant

This must eventually agree across:

UI
shared contracts
server validation
Early Access ordering
cart
quotes
canonical order
database
admin
tests

A lower product limit is allowed only when backed by a real explicit rule.

Quantity acceptance does not imply inventory availability.

==================================================
AFFILIATE CODE — CURRENT SIMPLE VERSION
==================================================

Today's minimum requirement is deliberately simple.

Customer may enter an optional:

Affiliate Code

Also preserve `?ref=` where present.

Store the normalized customer-entered code with:

XRR request
canonical order

Authorized admin must be able to see it.

Samuel can manually map the code to the owner in the backend.

Do not block Early Access on:

automatic commissions
automatic payouts
advanced affiliate CRM
full attribution analytics

Keep customer-entered affiliate code separate from server-verified referral attribution.

Affiliate code cannot:

change price
unlock products
mark payment
grant permissions
change order ownership

==================================================
ORDER EMAILS
==================================================

Every successfully persisted Early Access request/order should enqueue:

1. customer confirmation notification
2. Xenios admin/founder notification

Use the existing durable outbox.

Do not create a duplicate notification architecture.

Email failure must not roll back the order/request.

Never expose wholesale price, supplier cost, margin, credentials, or internal pricing data in email.

Do not send real email during development/testing.

==================================================
PAYMENT
==================================================

Manual payment is acceptable during launch.

Canonical states may include:

payment_required
instructions_presented
proof_submitted
under_review
paid
rejected
exception
refunded

Proof is not payment.

Only an actual payment-provider fact or authorized operator may mark paid.

Customer/browser/affiliate cannot mark payment paid.

==================================================
CANONICAL ORDER
==================================================

There should be one canonical order authority.

A request is not an order until converted.

Order must preserve:

customer
request/quote lineage
items
quantities
sold retail price snapshot
affiliate code/attribution
shipping
payment state
fulfillment state
audit history

Duplicate conversion must be idempotent.

==================================================
FULFILLMENT
==================================================

Minimum flow:

paid
-> supplier assigned
-> acknowledged
-> packing
-> tracking
-> shipped
-> delivered

Also support truthful exception/replacement/refund paths.

Unpaid orders cannot release to supplier.

Tracking existing does not automatically mean shipped.

==================================================
QUALITY STANDARD
==================================================

Do not trust green unit tests alone.

Recent Xenios failures have occurred in composition seams between individually-correct modules.

For consequential work, test:

unit
integration
composition
real adapters where possible
negative controls
browser/E2E when applicable

Important negatives:

customer A cannot read customer B
browser cannot set price
browser cannot set paid
affiliate code cannot change price
Care product cannot enter RUO checkout
held product cannot Buy Now
quantity 101 refused
duplicate request/order/payment/email idempotent
unpaid order cannot fulfill
wholesale/margin data cannot leak

==================================================
HOW TO CHOOSE YOUR TASK
==================================================

After recovering current state:

If your assigned lane exists in `.xenios/messages`, continue it.

Otherwise:

run:

node scripts/agentic/xenios-os.mjs next

Then select the HIGHEST-PRIORITY DEPENDENCY-READY UNOWNED task whose path family does not overlap another writer.

Priority order:

PHASE 0
Early Access P0

PHASE 1
Direct Buy Now for readiness-verified products

PHASE 2
Affiliate onboarding/dashboard/commissions/payout

PHASE 3
Customer order history
Quote engine
Organization/business buyers
Supplier/lab workspace
Admin convergence
Notifications
Support/quality

PHASE 4
Care completion

PHASE 5
AI Research companion
Analytics
Google Workspace
Observability
Performance
Backup/restore
Disaster recovery
Security/reliability

Do not jump to P2/P3 if an unowned P0/P1 dependency-ready lane exists.

==================================================
CHECKPOINT DISCIPLINE
==================================================

Every coherent slice and approximately every 15 minutes:

1. save
2. focused tests
3. commit
4. push
5. heartbeat
6. task update
7. exact-SHA handoff
8. message dependencies
9. continue

Do not accumulate huge uncommitted changes.

If usage/context is getting low:

stop starting new work
finish or isolate atomic edit
test
commit/push
preserve dirty remainder
update `.xenios`
write exact handoff
release lease if stopping
state next exact task and first command

==================================================
PRODUCTION SAFETY
==================================================

You may:

inspect
code
test
commit
push
prepare migrations
prepare release evidence

You may NOT:

deploy production
apply production migration
change production environment
change live pricing
enable production flags
send real email
mark real payment
mark real shipment
create clinical facts
create payouts

Those belong to the lead/release owner.

==================================================
START NOW
==================================================

Do not return a broad architecture essay.

Recover the system.

Then respond:

[XENIOS AGNOSTIC WORKER JOINED]

MODEL:
SESSION:
ROLE:
WORKTREE:
BRANCH:
BASE SHA:
PRODUCTION SHA:

CURRENT ACTIVE OWNERS:
...

MY TASK:
...

MY OWNED PATHS:
...

FORBIDDEN PATHS:
...

DIRTY WORK PRESERVED:
YES / NO / N/A

WHY THIS TASK IS UNOWNED:
...

FIRST CODE ACTION:
...

PRODUCTION MUTATED:
NO

Then immediately begin implementation/review.

Do not wait for another founder message.
```
