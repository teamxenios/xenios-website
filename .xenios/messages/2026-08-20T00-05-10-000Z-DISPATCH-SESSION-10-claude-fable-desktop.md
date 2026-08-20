XENIOS FLEET RESUME DISPATCH - SESSION 10

PASTE-TARGET WINDOW: claude-fable-s9-conversion-qa (REASSIGNED to Session 10)
PROMPT FILE: 10_COMPOSED_E2E_SECURITY_AND_PHASE_CONTINUATION.md
WORKTREE: C:/xenios-wt/s9-conversion-qa
BRANCH: lane/e2e-conversion-qa-20260819 (continue on it)

[XENIOS FLEET RESUME BASE]
INTEGRATION BRANCH: xenios/launch-integration-20260819
RESUME BASE SHA: 6251a6ae8ad6f9e65d21233d53190d4410821ca6
PRODUCTION SHA: a66434d980c909303d3595382e5df77342fbc127 (LIVE, Release A, deploy dep-da31altg1s2s73f6tep0)
ROLLBACK SHA: 458e7284c12cfbd95bd91371afb88cb8a6201454 (flags off first)
PROTECTED LEAD PATHS (never edit; snippet handoffs only): server/index.ts, server/research/index.ts, client/src/research/section.tsx, client/src/research/adminx-section.tsx, migration DAG/production ledger, release manifests/production packet, shared .xenios fleet state, production deploy/mutation.

DIRTY-WORK INSTRUCTION FOR THIS WINDOW:
Your worktree carries an UNCOMMITTED local dev shim in server/index.ts (a lead-owned seam) plus supabase local config. EXTRACT any QA findings into a handoff, then DISCARD the shim (git checkout -- server/index.ts in YOUR worktree only) - do not commit lead-seam edits. Then build the composed E2E/security proof for the P0 (one code, 426 catalog, retail-only, qty 100, affiliate code, order, both emails, payment, canonical order, fulfillment, status; attack the negative list).

OWNED PATHS THIS LANE:
e2e/**, browser-test infrastructure, security negative-control test files; isolated client fixes only in files no other session owns

RESUME NOW. Checkpoint (save -> focused tests -> commit -> push -> heartbeat -> task -> handoff) every coherent slice / ~15 minutes. Your full lane prompt follows verbatim.

================================================================
# SESSION 10 — COMPOSED E2E, MOBILE, SECURITY, AND NEXT-PHASE CONTINUATION

## Task

Independently prove the complete Early Access journey and attack every consequential boundary.

This session may fix isolated test/frontend defects but must not redesign shared architecture or edit lead seams without delegation.

## Composed journey

Test:

```text
/research/early-access
-> one Xenios Genesis prompt
-> full catalog
-> retail price
-> product detail
-> multi-product order
-> quantity 100
-> optional affiliate code
-> contact/shipping
-> agreements
-> submit
-> XRR
-> customer notification queued
-> admin notification queued
-> admin queue
-> payment
-> canonical order
-> fulfillment
-> customer status/tracking
```

## Mobile/browser matrix

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

Attack:
- double password
- dead route
- lost cart
- lost affiliate code
- back/refresh
- session expiry
- duplicate submit
- slow loading
- horizontal overflow
- keyboard overlap
- missing CTA
- hidden total
- email error
- proof upload error
- admin status error

## Security negative controls

- plaintext XeniosGenesis absent from source/client/log/snapshot
- customer cannot access admin
- browser cannot set retail price/total
- wholesale/cost/margin absent from customer DTO/bundle
- Care product cannot enter RUO direct order
- held/unavailable product cannot Buy Now
- quantity 101 refused
- customer A cannot read B
- affiliate code cannot alter price/access/payment
- browser cannot set affiliate owner
- browser cannot mark paid
- proof does not equal paid
- unpaid order cannot release
- duplicate request/order/payment/email/fulfillment event is idempotent

## Retail coverage

Prove:

```text
426 source rows accounted for
424 numeric retail prices
2 Price on request
0 $0 fallbacks
0 wholesale fields
```

## Gate coordination

Workers run focused tests. Coordinate with lead before heavy full-suite execution.

Classify failures:

```text
REAL REGRESSION
PRE-EXISTING
LOAD FLAKE
ENVIRONMENT
STALE ASSERTION
TEST DEFECT
```

Do not normalize real defects as flakes.

## Post-P0 continuation

Once the lead accepts the composed Early Access release:

1. commit/push QA evidence
2. release this lease
3. run `xenios-os next`
4. with lead approval, take the highest-priority unowned full-vision lane, likely:
   - quote engine mount
   - customer order history
   - affiliate onboarding/portal
   - organization accounts
   - supplier workspace
   - notifications
   - expanded Buy Now
   - Care
5. continue the same checkpoint discipline

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
