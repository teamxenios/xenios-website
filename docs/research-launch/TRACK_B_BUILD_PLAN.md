# Track B build plan — persistent commerce repositories and provider adapters

Status: engineering plan + wave sequence. Nothing here enables commerce, takes
payment, runs production SQL, or uses real credentials. Commerce stays gated by
`NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED=false`, 0/15 SKU eligibility, and the
absent payment provider.

## The one architectural blocker to resolve first (Wave 1)

The commerce domain services were written against **synchronous** repository
interfaces, because their only implementation so far is in-memory. Example
(`server/research/commerce/cart.ts`):

```ts
export interface CartRepository {
  load(memberId: string): StoredCart | null;   // sync
  save(memberId: string, cart: StoredCart): void; // sync
}
```

A real Supabase/Postgres repository is asynchronous. So a persistent
implementation cannot satisfy the current interface, and the correct first wave
is a **sync -> async conversion** of the repository seams and the service methods
that call them, across `cart.ts`, `checkout.ts`, `orders.ts`, `refunds.ts`,
`webhooks.ts`, and the `CommerceDependencies` surface in `routes.ts`. This is a
cross-cutting refactor with no behavior change (the in-memory repos become
`async` too and every test still passes). It must land as ONE reviewed change
before any persistent repository is added, or the two efforts fight.

## Current persistence state (from the read-only repo-reality assessment)

3 of 36 entities are persistent today, and those 3 belong to the Track A
membership lane, not commerce. Commerce is real, well-tested domain logic on
in-memory stores behind a fully disabled production wall (`production-deps.ts`).

| State | Count | Entities |
| --- | --- | --- |
| PERSISTENT (Track A) | 3 | membership customers, membership state, referrals |
| IN_MEMORY | 16 | carts, cart lines, checkout sessions, refunds, replacements, orders, order lines, shipments, partner attribution, organizations, commissions, commission reversals, payout ledger, webhooks, idempotency records, admin review queues |
| PLACEHOLDER | 5 | payment authorizations, captures, subscriptions, subscription changes, payout runs |
| PARTIAL | 2 | FEFO allocations, split fulfillment |
| ABSENT | 10 | addresses, quotes, order events, inventory, lots, lot documents, reservations, delivery events, recalls, provider diagnostics |

The SQL DDL for all of these exists (`supabase/research-{catalog,inventory-lots,orders,subscriptions,fulfillment,partners,commission-ledger}.sql`)
and has passed a live scratch-Postgres dry-run (see `MIGRATION_DRY_RUN_REPORT.md`):
69 research tables, RLS on, 0 policies, append-only money ledgers proven to
reject UPDATE/DELETE at the database level.

## Wave sequence (each is a separate reviewed PR, all disabled by default)

1. **Async repository seams** (no behavior change; in-memory repos become async; all tests green).
2. **Catalog + cart persistence** (`research_carts`, `research_cart_lines`) with a live-DB contract test.
3. **Checkout + orders + order events + refund keys** (idempotency records, append-only order-state events).
4. **Inventory, lots, FEFO, reservations, recalls** (never ship from an unreleased/expired/recalled/missing-COA lot).
5. **Subscriptions** (renewal never for an ineligible SKU).
6. **Fulfillment + shipping + Mitch** (fulfillment allowlist only; no health data transmitted).
7. **Partners, attribution, organizations, commissions (append-only), payout ledger + runs** (no recruitment comp; no recursive downline).
8. **Provider adapters** (payment, shipping, payout, identity, email, media, Telegram): disabled + test + real-shell, each with env validation, default-false flag, and a live path gated behind `live=true` + credentials.

## Verification standard per wave (non-negotiable)

- Contract test: run the SAME suite against the in-memory and the persistent
  implementation, so behavior is proven identical.
- Live-DB integration test against a real Postgres (the append-only ledger and
  idempotency uniqueness must be proven at the database level, not just in the
  service).
- No wave flips a feature flag. Activation is a separate, credential-gated,
  Samuel-approved step.

## Coordination flag (must resolve before Wave 1 code lands)

Multiple sessions have created Track B worktrees for the branch
`integration/xenios-research-track-b-commerce-activation`, which currently has
zero committed work. A sync->async refactor plus a persistence layer edited by
more than one session at once will produce conflicting histories and duplicated,
divergent commerce systems (which the repo rules forbid). Assign ONE owner for
the Track B branch before Wave 1 code begins.
