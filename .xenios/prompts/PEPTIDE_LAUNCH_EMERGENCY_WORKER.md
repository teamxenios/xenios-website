# Xenios peptide launch — emergency worker prompt

Founder-issued 2026-08-21. Paste into every additional Claude/Fable/Codex worker
session. Supersedes `UNIVERSAL_AGNOSTIC_WORKER_JOIN.md` for the duration of the
peptide launch; that one stays correct for ordinary fleet joins.

Each session inspects `CODE_OWNERSHIP` and claims the highest-priority UNOWNED
lane (A–I below), so nine sessions split across storefront, payment, money
safety, peptide QA, affiliate/email, operations, mobile, performance and
security instead of nine sessions editing the same files.

The MAIN session remains the only integrator, release owner, production owner
and RC owner.

Paste everything below the line, verbatim.

---

```text
XENIOS PEPTIDE LAUNCH — EMERGENCY WORKER MODE

WAKE UP AND START WORKING NOW.

This is an active multi-agent build.

The MAIN Claude session is the ONLY:

- integrator
- release owner
- production owner
- final RC owner

You are a WORKER.

Your purpose is to finish an unowned part of the immediate customer-facing Xenios Early Access build as fast as possible.

DO NOT sit idle.
DO NOT write a long planning document.
DO NOT ask the founder routine implementation questions.
DO NOT duplicate another worker's active files.

==================================================
0. IMMEDIATE FOUNDER GOAL
==================================================

The founder needs the actual customer-facing build finished ASAP.

Target customer experience:

/research/early-access

ONE unified storefront with:

- full canonical catalog
- retail prices
- Featured Products
- All Products
- search
- filters
- product/variant selection
- quantity up to 100
- optional affiliate code
- Buy Now for eligible RUO peptides
- Request Order for pending/non-direct products
- Continue through Care for clinical products
- Temporarily Unavailable for held products
- review
- payment/manual payment
- payment proof
- confirmation
- status
- customer email
- admin email
- mobile

We are no longer spending cycles designing the architecture.

BUILD IT.

==================================================
1. RECOVER THIS SESSION FIRST
==================================================

Read:

AGENTS.md
CLAUDE.md

.xenios/FULL_VISION.md
.xenios/MASTER_CORPUS.md
.xenios/PROJECT_STATE.json
.xenios/RELEASE_STATE.json
.xenios/ACTIVE_TASKS.json
.xenios/SESSION_REGISTRY.json
.xenios/CODE_OWNERSHIP.json

latest:
.xenios/messages/**
.xenios/handoffs/**

Then run:

git fetch --all --prune --tags
git status --short --branch
git log -20 --decorate --oneline
git worktree list --porcelain

node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
node scripts/agentic/xenios-os.mjs next

IMPORTANT:

If this session already has a dirty or paused worktree:

DO NOT reset it.
DO NOT clean it.
DO NOT delete it.

Inspect it first.

Preserve useful work.

Checkpoint it if necessary.

==================================================
2. CHECK OWNERSHIP BEFORE CODING
==================================================

Inspect:

CODE_OWNERSHIP
ACTIVE_TASKS
SESSION_REGISTRY
latest worker messages/handoffs

You must claim ONE unowned lane.

If someone owns a lane already:

DO NOT duplicate it.

Immediately claim another.

If your old task is obsolete or already integrated:

release/close it correctly
and claim a new one.

==================================================
3. CURRENT CANONICAL PRODUCT TRUTH
==================================================

Source workbook:

426 source rows

Peptide source rows:
141

After reviewed reconciliation:

424 canonical variants

139 unique canonical peptide variants

Current target:

111 directly orderable peptide variants

1 formulation-blocked peptide:

GRP-0422
CJC-1295 + Ipamorelin WITH DAC
5 mg total
$99

=> VISIBLE
=> RETAIL PRICE
=> REQUEST ORDER
=> NOT DIRECT

27 unique classification-pending peptide variants

=> Request Order

Duplicate source pairs have already been reconciled:

Hexarelin 5 mg
Oxytocin 10 mg

Each must render as ONE canonical product/variant.

==================================================
4. CJC WITH DAC DECISION
==================================================

Standalone WITH-DAC products are NOT globally blocked.

Current founder decision:

CJC-1295 WITH DAC 2 mg
confirmed RUO
priced
=> DIRECT

CJC-1295 WITH DAC 5 mg
confirmed RUO
priced
=> DIRECT

CJC-1295 WITH DAC 10 mg
classification pending
=> REQUEST ORDER

ONLY this combo is explicitly held:

GRP-0422
CJC-1295 + Ipamorelin WITH DAC
5 mg total
$99

because the component split/formulation is unresolved.

Do not broaden that hold.

==================================================
5. DIRECT PURCHASE RULE
==================================================

Direct peptide ordering is allowed when:

canonical family = research_peptides_materials

AND

classification = confirmed RUO Research

AND

approved current retail price exists

AND

no explicit commerce/formulation hold exists

=> BUY_NOW / DIRECT ORDER

DO NOT require:

legacy 22 membership
supplier assignment
inventory confirmation
lot assignment
COA
fulfillment readiness

merely to ACCEPT the customer's order.

Those are downstream operational checks.

==================================================
6. CAPSULES
==================================================

Research Capsules are NOT included in this direct-purchase expansion.

They may remain:

visible
retail-priced
request pathway

Do not accidentally make capsules BUY_NOW because they satisfy generic RUO-looking facts.

==================================================
7. CARE BOUNDARY
==================================================

Clinical / Provider Only products:

may display retail price where appropriate

BUT CTA must remain:

Continue through Care

Never route them through RUO direct checkout.

==================================================
8. PRICING
==================================================

Customer-facing pricing is RETAIL ONLY.

Never expose:

wholesale
supplier cost
supplier quote
margin
markup
multiplier
benchmark calculations
internal pricing notes

Product Control/server authority remains canonical.

Do not hard-code price values in React.

==================================================
9. CATALOG RELIABILITY
==================================================

The old pricing path caused approximately:

3,306 Supabase queries per catalog request

The replacement architecture is approximately:

3 bounded bulk reads
+
safe server snapshot/cache
+
stale-while-revalidate

Do NOT reintroduce the N+1 read path.

A temporary upstream failure must NOT convert hundreds of valid prices into:

Price on request

Only truly unpriced products may show Price on request.

==================================================
10. CLAIM ONE OF THESE LANES NOW
==================================================

Take the highest-priority UNOWNED lane.

LANE A — UNIFIED STOREFRONT

Build /research/early-access as the full canonical storefront.

Needs:

Featured Products
All Products
search
filters
product/variant cards
retail price
canonical CTA
responsive layout

Legacy 22 becomes a Featured projection only.

No competing canonical storefront.

--------------------------------------------------

LANE B — PAYMENT GENERALIZATION

Generalize the existing 8-step payment journey beyond the legacy 22.

Any canonical peptide variant resolving BUY_NOW must be able to enter it.

Preserve:

quantity
affiliate code
contact
shipping
agreements
review
payment instructions
payment proof
confirmation
status

Do not hard-code product IDs.

--------------------------------------------------

LANE C — MONEY SAFETY / ORDER REVALIDATION

Prove and strengthen:

server-authoritative price
server-authoritative action
quantity
totals
price-change handling
duplicate-submit handling
idempotency
wrong-product prevention
held-product rejection
Care-product rejection from RUO checkout

Browser values are never authoritative.

--------------------------------------------------

LANE D — FULL PEPTIDE ACCEPTANCE MATRIX

Build an exhaustive automated proof for all canonical peptide variants.

Verify:

identity
source provenance
classification
retail price
action
hold state
quantity rule
payment/request route

Expected:

139 unique canonical peptide variants

111 direct

1 formulation blocked

27 pending

0 duplicate customer peptide products

Do not sample.

--------------------------------------------------

LANE E — AFFILIATE + EMAIL

Prove/integrate:

optional typed affiliate code
normalization
declared vs verified attribution separation
direct-order propagation
request-order propagation
customer email
admin email
outbox idempotency

Customer email:
retail/customer-safe only

Admin:
order + affiliate operational details

No wholesale leakage.

--------------------------------------------------

LANE F — ADMIN / ORDER / FULFILLMENT

Complete/prove operations after customer intake:

order received
availability review
payment state
payment proof review
fulfillment release
tracking
status

Never fabricate:

inventory
supplier acceptance
COA
lot
payment
shipment

--------------------------------------------------

LANE G — MOBILE + BROWSER E2E

Run actual composed customer journey at:

430
390
375
360
320

Verify:

full catalog
price
search
filters
product
quantity
affiliate
Buy Now
Request Order
Care
payment
confirmation
status

No horizontal overflow.

--------------------------------------------------

LANE H — PRICING CACHE / PERFORMANCE

Adversarially verify the 3-query pricing source and cache.

Test:

cold
warm
cache hit
cache miss
stale
refresh failure
cold upstream failure
max stale
price update
concurrency 1
5
10
25

No production load testing.

--------------------------------------------------

LANE I — SECURITY / ADVERSARIAL COMPOSITION

Attack the composed flow:

IDOR
session ownership
price tampering
variant swapping
action tampering
Care-to-RUO bypass
held-product bypass
affiliate spoofing
quantity abuse
duplicate payment proof
duplicate submission
private-price leakage
wholesale leakage

Fix confirmed defects inside owned paths.

==================================================
11. DO NOT JUST AUDIT
==================================================

If your lane has a confirmed defect and the fix is within your owned paths:

FIX IT.

Do not merely write a report for the main session to fix later.

Code.
Test.
Commit.
Push.

Only leave a blocker when fixing it would require violating another worker's ownership.

==================================================
12. FAST CHECKPOINT LAW
==================================================

Every coherent slice and approximately every 15 minutes:

1. save
2. run focused tests
3. commit
4. push
5. heartbeat/update task
6. send exact SHA to main lead

Do not sit on hours of dirty work.

==================================================
13. MAIN LEAD HANDOFF
==================================================

When you complete a slice, send the main lead:

SESSION:
LANE:
TASK:
BRANCH:
BASE SHA:
PUSHED SHA:

FILES CHANGED:

WHAT IS NOW WORKING:

TESTS:
PASS / FAIL

KNOWN RISKS:

INTEGRATION INSTRUCTIONS:

PRODUCTION MUTATED:
NO

Then immediately inspect:

node scripts/agentic/xenios-os.mjs next

and claim the next unowned high-priority task if the lead has not told you to stop.

==================================================
14. PRODUCTION RULE
==================================================

YOU MAY:

inspect
code
test
run local app
run preview/local browser
commit
push
handoff

YOU MAY NOT:

deploy production
apply production migration
change production data
change live price
change production env
enable production flags
send real emails
mark real payment
mark real shipment

Current production stays untouched.

Only main lead receives founder production GO.

==================================================
15. DO NOT STOP FOR ROUTINE QUESTIONS
==================================================

Do not pause to ask the founder:

which component style
which function name
which local abstraction
which test structure
whether to refactor a small internal helper

Make the smallest correct decision consistent with the canonical architecture.

Only escalate if there is:

a real money-safety ambiguity
a legal/compliance conflict
a destructive operation
an ambiguity that could make the wrong product orderable
or a required production mutation

==================================================
16. START IMMEDIATELY
==================================================

Your first response should be SHORT:

[XENIOS PEPTIDE WORKER ACTIVE]

SESSION:
BRANCH:
WORKTREE:
BASE SHA:

CLAIMED LANE:

OWNED PATHS:

OWNERSHIP CONFLICT:
NONE / DETAILS

FIRST IMPLEMENTATION ACTION:

PRODUCTION MUTATED:
NO

Then immediately start coding.

Do not wait for another founder message.
```
