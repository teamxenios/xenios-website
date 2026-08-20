XENIOS FLEET RESUME DISPATCH - SESSION 4

PASTE-TARGET WINDOW: claude-fable-storefront
PROMPT FILE: 04_STOREFRONT_PRODUCT_DETAIL_MOBILE.md
WORKTREE: C:/xenios-wt/storefront
BRANCH: lane/launch-public-storefront (continue on it)

[XENIOS FLEET RESUME BASE]
INTEGRATION BRANCH: xenios/launch-integration-20260819
RESUME BASE SHA: 6251a6ae8ad6f9e65d21233d53190d4410821ca6
PRODUCTION SHA: a66434d980c909303d3595382e5df77342fbc127 (LIVE, Release A, deploy dep-da31altg1s2s73f6tep0)
ROLLBACK SHA: 458e7284c12cfbd95bd91371afb88cb8a6201454 (flags off first)
PROTECTED LEAD PATHS (never edit; snippet handoffs only): server/index.ts, server/research/index.ts, client/src/research/section.tsx, client/src/research/adminx-section.tsx, migration DAG/production ledger, release manifests/production packet, shared .xenios fleet state, production deploy/mutation.

DIRTY-WORK INSTRUCTION FOR THIS WINDOW:
Your worktree carries DIRTY storefront work (9 new files: shared contract, server projection/routes/mount, client storefrontApi, entry-intent) that MATCHES this lane. Recover it, checkpoint the coherent portion FIRST (commit+push), then continue building on it against the resume base.

OWNED PATHS THIS LANE:
Early Access catalog UI, product cards, product detail, search/filter/sort, CTA presentation, responsive storefront tests (client storefront family + your existing new files); NOT pricing authority, order persistence, affiliate persistence, or route composition

RESUME NOW. Checkpoint (save -> focused tests -> commit -> push -> heartbeat -> task -> handoff) every coherent slice / ~15 minutes. Your full lane prompt follows verbatim.

================================================================
# SESSION 4 — EARLY ACCESS STOREFRONT, PRODUCT DETAILS, SEARCH, AND MOBILE UX

## Task

Make the Early Access experience understandable, complete, and commercially usable after the one-code gate.

## Own

Claim customer-facing storefront paths:

- Early Access catalog UI
- product cards
- product detail
- search/filter/sort
- pathway/CTA presentation
- responsive storefront tests

Do not own pricing authority, order persistence, affiliate persistence, or top-level route composition.

## Required storefront

After valid code:

```text
full catalog
-> search/filter
-> product detail
-> retail price
-> exact variant
-> quantity/action
```

Show all canonical products, not only directly purchasable items.

## Card/detail content

- product
- specification/strength
- dosage form/presentation
- current retail price or `Price on request`
- availability/pathway
- obvious next action
- Research-use designation where applicable

Never show wholesale, cost, margin, supplier quote, or internal notes.

## Truthful CTA

Render only the server-supplied action:

```text
Buy now
Add to Early Access Order
Request quote
Continue through Care
Temporarily unavailable
Not available
```

No dead-end cards.

Do not infer direct commerce from price.

## Quantity UI

Support up to 100 per exact variant while respecting a real lower server-supplied limit.

## Preserve state

Across detail/navigation/auth/session refresh preserve:

- selected variant
- quantity
- cart/request
- affiliate code/ref token where provided

## Mobile

Verify:

```text
1440
1366
768
430
390
375
360
320
```

Fix:
- overflow
- tiny targets
- hidden CTA
- input zoom/keyboard overlap
- broken sticky controls
- loading/error/empty states
- back button behavior

## Tests

Use mocked server-authoritative DTOs. Do not hardcode production prices in tests except explicit fixtures.

Provide screenshots or route matrix where supported.

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
