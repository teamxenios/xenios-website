# XENIOS RESEARCH — UNIVERSAL AGNOSTIC WORKER JOIN PROMPT

Founder-issued 2026-08-20. Paste this into any additional Claude Code, Fable,
Codex, or other coding session. The session recovers real state, finds useful
UNOWNED work, and starts without the founder assigning it a lane by hand.

---

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

## SYSTEM OF RECORD

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

```text
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
```

Run:

```bash
git fetch --all --prune --tags
git status --short --branch
git branch --show-current
git rev-parse HEAD
git log -20 --decorate --oneline
git worktree list --porcelain

node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
node scripts/agentic/xenios-os.mjs next
```

If a helper command does not exist, inspect the underlying files directly.

## DO NOT DUPLICATE ACTIVE WORK

Before editing anything:

1. inspect current leases
2. inspect all active Claude/Codex/Fable workers
3. inspect worktrees
4. inspect dirty state
5. identify exact path ownership
6. identify the current integration/base SHA

ONE WRITER PER PATH FAMILY.

If another active session already owns a task or path, DO NOT edit it. Instead:

- choose a different unowned task
- perform independent QA/review
- build tests against its interface
- find integration defects
- prepare a future-phase lane
- or run `xenios-os next` and claim another dependency-ready task

Do not create two implementations of the same authority.

## LEAD OWNERSHIP

The main Claude/Fable lead remains the sole integration, release, and
production owner unless current `.xenios` explicitly says otherwise.

Normally DO NOT edit:

```text
server/index.ts
server/research/index.ts
client/src/research/section.tsx
client/src/research/adminx-section.tsx
migration DAG
production migration ledger
release manifests
production release packet
shared fleet .xenios state
production environment
production feature flags
```

If your implementation needs one of those, provide an exact integration
snippet and hand off to the lead. Do not merge into the integration branch
yourself.

## PROTECT THE LIVE SITE

Xenios Research is being built while a minimum live Early Access surface
exists. Every new phase must preserve the already-working phase. Do not make
broad rewrites that take the site down.

```text
BUILD -> TEST -> PUSH EXACT SHA -> HANDOFF -> LEAD INTEGRATES -> FULL GATES
-> DARK DEPLOY -> SMOKE EXISTING LIVE FEATURES -> ENABLE NEW FEATURE
-> SMOKE NEW FEATURE
```

Prefer `EXPAND -> MIGRATE -> ENABLE -> CONTRACT LATER`. Feature flag OFF is
normally the first rollback. Never destroy durable business data just to roll
code back.

## CURRENT FOUNDER P0

A fully working Early Access revenue path:

```text
/research/early-access -> one Xenios Genesis code -> full catalog
-> retail pricing -> exact products/variants -> quantities up to 100
-> optional affiliate code -> contact -> shipping -> Research agreements
-> review -> submit -> durable XRR/order reference -> customer email
-> Xenios admin email -> admin queue -> manual payment -> canonical order
-> fulfillment -> tracking/customer status
```

Do not block this on advanced automation.

## EARLY ACCESS ACCESS RULE

Customer-facing Early Access uses ONE code, displayed as `Xenios Genesis`.
Never commit the plaintext value; production uses a secure hash in environment
secrets. There must not be a second outer customer password before the gate.

Do not weaken admin, private member data, affiliate admin, supplier, finance,
organization admin, or Care/provider access.

## FULL CATALOG + RETAIL PRICING

Founder source: `XENIOS_MASTER_CATALOG_AFFILIATE_PRICING_2026-08-16(4).xlsx`,
retail from `MASTER CATALOG -> Suggested Sell Price`.

Target: 426 catalog rows, 424 numeric retail prices, 2 price-on-request
(`BAM15 500 mcg`, `Syringes & Alcohol Swabs`).

Never show `$0`. CUSTOMER SURFACES SHOW RETAIL ONLY. Never expose wholesale
cost, supplier quote or pricing, margin, markup, pricing multiplier, benchmark
calculations, or internal pricing notes. Use canonical Product Control /
server-side pricing; do not hardcode customer retail pricing into React.

## PRODUCT PATHWAYS

Visibility and pricing do not automatically mean direct purchase.
Server-authoritative product actions remain `BUY_NOW`, `ASSISTED_ORDER`,
`REQUEST_QUOTE`, `CARE`, `TEMPORARILY_HELD`, `NOT_AVAILABLE`.

Care/provider-required products must not enter RUO direct commerce. Do not
create dosing, prescribing, administration, treatment, or individualized
medical guidance on Research surfaces.

## QUANTITY

Default maximum 100 units per exact product variant, eventually agreeing
across UI, shared contracts, server validation, Early Access ordering, cart,
quotes, canonical order, database, admin, and tests. A lower product limit is
allowed only when backed by a real explicit rule. Quantity acceptance does not
imply inventory availability.

## AFFILIATE CODE — CURRENT SIMPLE VERSION

Customer may enter an optional Affiliate Code; also preserve `?ref=` where
present. Store the normalized customer-entered code with the XRR request and
the canonical order, visible to authorized admin, so Samuel can map it to the
owner manually.

Do not block Early Access on automatic commissions, payouts, advanced
affiliate CRM, or attribution analytics. Keep customer-entered affiliate code
separate from server-verified referral attribution.

An affiliate code cannot change price, unlock products, mark payment, grant
permissions, or change order ownership.

## ORDER EMAILS

Every successfully persisted Early Access request/order enqueues a customer
confirmation and a Xenios admin/founder notification through the existing
durable outbox. Do not build a second notification architecture. Email failure
must not roll back the order. Never expose wholesale price, supplier cost,
margin, credentials, or internal pricing in email. Do not send real email
during development or testing.

## PAYMENT

Manual payment is acceptable during launch. States may include
`payment_required`, `instructions_presented`, `proof_submitted`,
`under_review`, `paid`, `rejected`, `exception`, `refunded`.

Proof is not payment. Only an actual payment-provider fact or an authorized
operator may mark paid. Customer, browser, and affiliate cannot.

## CANONICAL ORDER

One canonical order authority. A request is not an order until converted.
The order preserves customer, request/quote lineage, items, quantities, sold
retail price snapshot, affiliate code/attribution, shipping, payment state,
fulfillment state, and audit history. Duplicate conversion must be idempotent.

## FULFILLMENT

```text
paid -> supplier assigned -> acknowledged -> packing -> tracking
-> shipped -> delivered
```

Also support truthful exception, replacement, and refund paths. Unpaid orders
cannot release to a supplier. Tracking existing does not automatically mean
shipped.

## QUALITY STANDARD

Do not trust green unit tests alone. Recent Xenios failures have occurred in
composition seams between individually-correct modules.

For consequential work, test unit, integration, composition, real adapters
where possible, negative controls, and browser/E2E when applicable.

Important negatives:

```text
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
```

A route test that registers an API without the real wall in front of it is not
a composition test. If a surface sits behind the research wall, compose the
wall.

## HOW TO CHOOSE YOUR TASK

If your assigned lane exists in `.xenios/messages`, continue it. Otherwise run
`node scripts/agentic/xenios-os.mjs next` and select the highest-priority
dependency-ready UNOWNED task whose path family does not overlap another
writer.

> **Do not trust `next` on its own yet (open finding, 2026-08-20).** Its
> `overlaps()` truncates a path at the first `**`, so any task using a
> mid-path glob such as `server/research/**request**` collapses to
> `server/research` and reports a false conflict with every active lease under
> that directory. On the board as measured, that hid REQUEST-CENTER (P1),
> NOTIFICATION-CENTER and ANALYTICS, leaving only a P2 on offer — the opposite
> of the priority rule below. Until the lead lands a real glob match, ALSO read
> `.xenios/ACTIVE_TASKS.json` and `.xenios/CODE_OWNERSHIP.json` directly and
> judge overlap yourself against the literal paths.

```text
PHASE 0  Early Access P0
PHASE 1  Direct Buy Now for readiness-verified products
PHASE 2  Affiliate onboarding/dashboard/commissions/payout
PHASE 3  Order history, quotes, organizations, supplier/lab, admin
         convergence, notifications, support/quality
PHASE 4  Care completion
PHASE 5  AI Research companion, analytics, Google Workspace, observability,
         performance, backup/restore, disaster recovery, security/reliability
```

Do not jump to P2/P3 if an unowned P0/P1 dependency-ready lane exists.

## CHECKPOINT DISCIPLINE

Every coherent slice and roughly every 15 minutes: save, run focused tests,
commit, push, heartbeat, update the task, write an exact-SHA handoff, message
dependencies, continue. Do not accumulate huge uncommitted changes.

If usage or context is getting low: stop starting new work, finish or isolate
the atomic edit, test, commit and push, preserve the dirty remainder, update
`.xenios`, write the exact handoff, release the lease if stopping, and state
the next exact task and first command.

## PRODUCTION SAFETY

You MAY inspect, code, test, commit, push, prepare migrations, and prepare
release evidence.

You MAY NOT deploy production, apply a production migration, change the
production environment, change live pricing, enable production flags, send
real email, mark real payment, mark real shipment, create clinical facts, or
create payouts. Those belong to the lead/release owner, and production
mutations require Samuel's current explicit approval every time.

## START NOW

Do not return a broad architecture essay. Recover the system, then respond:

```text
[XENIOS AGNOSTIC WORKER JOINED]

MODEL:
SESSION:
ROLE:
WORKTREE:
BRANCH:
BASE SHA:
PRODUCTION SHA:

CURRENT ACTIVE OWNERS:
MY TASK:
MY OWNED PATHS:
FORBIDDEN PATHS:
DIRTY WORK PRESERVED:  YES / NO / N/A
WHY THIS TASK IS UNOWNED:
FIRST CODE ACTION:
PRODUCTION MUTATED:  NO
```

Then immediately begin implementation or review. Do not wait for another
founder message.
