XENIOS FLEET RESUME DISPATCH - SESSION 3

PASTE-TARGET WINDOW: claude-fable-lane5-partner-portal (REASSIGNED)
PROMPT FILE: 03_FULL_RETAIL_CATALOG_PRODUCT_CONTROL.md
WORKTREE: C:/xenios-wt/lane5-partner-portal
BRANCH: FIRST checkpoint dirty portal work on lane/affiliate-partner-portal, then create lane/s3-retail-catalog from the resume base

[XENIOS FLEET RESUME BASE]
INTEGRATION BRANCH: xenios/launch-integration-20260819
RESUME BASE SHA: 6251a6ae8ad6f9e65d21233d53190d4410821ca6
PRODUCTION SHA: a66434d980c909303d3595382e5df77342fbc127 (LIVE, Release A, deploy dep-da31altg1s2s73f6tep0)
ROLLBACK SHA: 458e7284c12cfbd95bd91371afb88cb8a6201454 (flags off first)
PROTECTED LEAD PATHS (never edit; snippet handoffs only): server/index.ts, server/research/index.ts, client/src/research/section.tsx, client/src/research/adminx-section.tsx, migration DAG/production ledger, release manifests/production packet, shared .xenios fleet state, production deploy/mutation.

DIRTY-WORK INSTRUCTION FOR THIS WINDOW:
ADJUSTMENT: your worktree carries DIRTY partner-portal UI work (168 insertions) that does NOT match your new lane. FIRST commit that work onto lane/affiliate-partner-portal with a PARKED handoff (future-phase affiliate portal work), push it, THEN create lane/s3-retail-catalog from the resume base for this task.

OWNED PATHS THIS LANE:
Product Control / catalog / pricing import + reconciliation artifacts (scripts/research-launch/**, docs/research-launch pricing artifacts, dataset regeneration tooling); source CSV committed at docs/research-launch/XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv, workbook(4) sha256 6478ad0d3f710b75c6bf0c5f5e56ff1189ab2a2a4439cab23c2a28498134ea6f; production price release stays LEAD-owned

RESUME NOW. Checkpoint (save -> focused tests -> commit -> push -> heartbeat -> task -> handoff) every coherent slice / ~15 minutes. Your full lane prompt follows verbatim.

================================================================
# SESSION 3 — FULL 426-ROW RETAIL CATALOG AND PRODUCT CONTROL RECONCILIATION

## Task

Make the full current master catalog and retail-only pricing canonical.

## Source

```text
XENIOS_MASTER_CATALOG_AFFILIATE_PRICING_2026-08-16(4).xlsx
MASTER CATALOG -> Suggested Sell Price
XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv
```

Verified:

```text
426 catalog rows
424 numeric retail prices
2 Price on request
```

Unpriced:

```text
BAM15 500 mcg
Syringes & Alcohol Swabs
```

## Own

Claim isolated Product Control/catalog/pricing import and reconciliation paths.

Do not edit client pages or lead composition seams.

## Required output

Produce an exact reconciliation for all 426 workbook rows:

```text
Group ID
Product
Specification
Channel
Workbook Retail Price
Product Control Product ID
Variant ID
Current Canonical Price
Match Status
Price Match
Visibility
Customer Action
```

Statuses:

```text
EXACT_MATCH
NORMALIZATION_REQUIRED
VARIANT_MISSING
PRICE_MISSING
DUPLICATE_REVIEW
```

Do not guess mappings.

## Canonical pricing

- retail only
- `Suggested Sell Price` is the workbook target
- no wholesale cost
- no supplier quote
- no margin or markup
- no market median as transaction authority
- no React constants
- preserve price history and audit
- preserve buyer-scoped pricing
- preserve approved quantity tiers
- server re-resolves price at request/cart/quote/order

## Full catalog

Do not reduce visibility to:
- 39 XRUO rows
- 143 Buy Now candidates
- legacy Early Access subset

Every mapped catalog row should be discoverable with a truthful action.

Clinical/provider rows remain Care.

## Deliverables

1. retail-only safe input artifact
2. 426-row mapping report
3. deterministic importer/reconciler
4. price-update candidate through canonical APIs
5. exclusions/unmatched report
6. focused tests
7. zero wholesale/private fields in customer-safe output
8. lead integration instructions

Do not mutate production. Lead owns controlled price release.

---

# SHARED FLEET RULES — READ BEFORE WORKING

This session is being resumed from a founder-ordered pause.

## Recover this session correctly

1. Read:
   - `AGENTS.md`
   - `CLAUDE.md`
   - `.xenios/MASTER_CORPUS.md`
   - `.xenios/FULL_VISION.md`
   - `docs/research-launch/XENIOS_RESEARCH_FULL_BUILD_STATUS_2026-08-19.md`
   - latest exact-SHA handoff/message
   - `.xenios/SESSION_REGISTRY.json`
   - `.xenios/CODE_OWNERSHIP.json`
   - `.xenios/ACTIVE_TASKS.json`

2. Run:

```bash
git fetch --all --prune --tags
git status --short --branch
git log -15 --decorate --oneline
git worktree list --porcelain
node scripts/agentic/xenios-os.mjs validate
node scripts/agentic/xenios-os.mjs status
```

3. If this is the same paused session and its worktree contains dirty work:
   - do not create a replacement worktree
   - do not reset, clean, discard, or overwrite it
   - recover the exact task and preserve the current edits
   - checkpoint the coherent portion before starting new edits

4. If this is a clean/new session:
   - use the exact current remote head of `xenios/launch-integration-20260819`, or a newer exact base published by the lead
   - do not start from `main`
   - register one session and claim one non-overlapping path lease

## One writer per path

The lead owns protected integration seams unless explicitly delegated:

```text
server/index.ts
server/research/index.ts
client/src/research/section.tsx
client/src/research/adminx-section.tsx
migration DAG / production ledger
release manifests / production packet
shared .xenios fleet state
final conflict resolution
production deploy/mutation
```

Workers provide exact-SHA handoffs and integration snippets instead of editing lead seams.

## Mandatory checkpoint loop

At least every coherent slice and approximately every 15 minutes:

1. save
2. run focused tests
3. commit coherent work
4. push
5. heartbeat
6. update task state
7. refresh exact-SHA handoff
8. message dependent lanes
9. continue

Do not accumulate thousands of uncommitted lines.

## Founder product directives

### One Early Access code

The customer-facing Early Access journey must use one code prompt:

```text
XeniosGenesis
```

Display:

```text
Xenios Genesis
```

The plaintext code must never be committed, bundled, logged, snapshotted, or stored in browser storage. Production uses a secure hash in environment secrets.

Remove only the outer/first shared Research password from the Early Access customer route/API. Do not weaken admin, member, supplier, affiliate, finance, or Care authorization.

### Full catalog and retail-only pricing

Source workbook:

```text
XENIOS_MASTER_CATALOG_AFFILIATE_PRICING_2026-08-16(4).xlsx
MASTER CATALOG -> Suggested Sell Price
```

Verified source state:

```text
426 catalog rows
424 numeric current retail prices
2 Price on request
```

The two unpriced rows are:

```text
BAM15 500 mcg
Syringes & Alcohol Swabs
```

Never show `$0`.

Customer-facing surfaces may show retail pricing only. Never expose wholesale cost, supplier quotes, multiplier, margin, markup, benchmark internals, or supplier identities.

Retail prices must resolve through Product Control / canonical server pricing, not React constants.

### Quantity

Default maximum:

```text
100 units per exact product variant
```

Reconcile UI, shared contracts, server validation, assisted orders, cart, quotes, canonical orders, database constraints/migrations, admin, and tests. Preserve lower explicit product limits only when backed by a real rule.

### Early Access commercial behavior

Anyone with the one Early Access code can enter the customer order flow without a second shared password or membership approval.

All catalog products should be visible with current retail price and a truthful action.

Do not force provider/clinical products through direct RUO ordering. Product actions remain server-authoritative:

```text
BUY_NOW
ASSISTED_ORDER
REQUEST_QUOTE
CARE
TEMPORARILY_HELD
NOT_AVAILABLE
```

### Manual affiliate code for the immediate launch

The immediate requirement is intentionally simple:

- optional affiliate code field on the Early Access order
- support manual entry and captured `?ref=` where already available
- normalize and store the code on the request/order
- show it in authorized admin views and order notification
- Samuel can manually match the code to an owner in the backend
- no automatic commission or payout is required for this phase
- affiliate code never changes price, access, payment, or order ownership

### Order emails

Every successfully persisted Early Access request/order must enqueue two idempotent notifications:

1. customer confirmation
2. Xenios admin/founder order alert

Use the existing durable outbox and configured server-side recipients. Do not hardcode private recipient addresses in client code. If email delivery fails, the request/order remains durable and the outbox retries.

Customer email contains only customer-safe retail/order information. Admin email includes the order/reference, customer contact summary, products, quantities, retail price state, affiliate code, and a secure admin link. Never include wholesale cost, margin, supplier internals, credentials, or raw sensitive documents.

Do not send real emails during development tests. Production sending is activated only through the lead's exact release packet.

## Research / Care separation

All products may be discoverable and priced, but clinical/provider-required products route through Care. Do not add dosing, medical advice, treatment, prescribing, or individualized guidance to Research surfaces.

## Production safety

Workers never:
- deploy
- apply production migrations
- change production environment
- change live pricing
- enable production flags
- send real email
- mark real payment/shipment
- create clinical facts

The lead owns release execution.

## Handoff

Return:

```text
[ACTIVE XENIOS BUILD CHECKPOINT]

SESSION:
TASK:
WORKTREE:
BRANCH:
BASE SHA:
PUSHED SHA:
LEASE:
COMPLETED:
FILES:
TESTS:
TYPECHECK:
BUILD:
MIGRATION:
PRODUCTION MUTATED:
BLOCKERS:
INTEGRATION INSTRUCTIONS:
NEXT CODE ACTION:
```

After completing this lane, release its lease and run `node scripts/agentic/xenios-os.mjs next`. With lead approval, claim the next dependency-ready unowned task from the full vision rather than sitting idle.
