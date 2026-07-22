---
title: Track B — commerce activation implementation plan
branch: integration/xenios-research-track-b-commerce-activation
base: main (dd1f6b4, the merged Track A production SHA)
status: IN PROGRESS (wave 1)
---

# Track B: complete and activate real commerce

This branch completes the persistent production repository layer and the
provider adapters behind the existing commerce domain services, so that
commerce can transact once it is externally cleared (COAs delivered, a payment
processor credentialed, per-SKU admin release). Nothing here enables commerce.
Every flag stays false, every provider stays disabled by default, and no real
transaction is run.

## What already exists (from the merged Track A)

The commerce DOMAIN is complete and tested: `server/research/commerce/`
(`cart.ts`, `checkout.ts`, `orders.ts`, `refunds.ts`, `webhooks.ts`,
`routes.ts`) holds the real business logic and enforces the invariants
(price-from-catalog, FEFO, capture <= authorization, refund <= capture,
idempotency, tenant isolation). Each service takes a repository interface and
ships with an in-memory implementation used by tests. `production-deps.ts`
currently injects fail-closed stubs for every stateful surface, so production
serves a real catalog and refuses every write with `commerce_disabled`.

The commerce TABLES exist as SQL (migrations 20-26 in
`supabase/production/research-full-production.sql`), pending and not applied.

## What Track B builds

The missing layer is persistence and provider adapters, mirroring the member
platform's pattern (`getSupabaseAdmin().from(table)` from `server/supabase.ts`),
never a second data system.

### Persistence bridge (the one design decision)

The cart/order services use SYNCHRONOUS repository methods, and Supabase is
async. Rather than refactor the merged, safety-critical services, persistence
bridges at the boundary: the deps layer asynchronously LOADS the member's state
into an in-memory repository, runs the synchronous service, then asynchronously
SAVES the result. This keeps the proven service logic untouched and confines
async I/O to a thin, testable store.

### Repository inventory (each: async store + in-memory double + Supabase-backed + tests)

Wave 1 (this wave): carts and cart lines. The entry point; proves the pattern.
Wave 2: orders, order lines, order state events, idempotency records.
Wave 3: inventory lots, lot documents, reservations, FEFO allocations, recalls.
Wave 4: checkout sessions, payment authorizations, captures, refunds, replacements.
Wave 5: subscriptions and subscription changes.
Wave 6: shipments, split fulfillment, delivery events, Mitch transmission log.
Wave 7: partners, attribution, organizations, commissions, commission reversals,
        payout ledger, payout runs (append-only money ledgers).
Wave 8: store credit, admin review queues, provider webhook records.

### Provider adapters (each: interface, disabled provider, deterministic test
provider, real adapter shell, env validation, default-false flag, tests)

- Payment (Stripe): `PAYMENTS_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_RESEARCH_ACTIVATION`, `STRIPE_PRICE_RESEARCH_MEMBERSHIP`.
- Shipping carrier (live rates + labels + tracking) beyond the flat-rate default.
- Mitch fulfillment transmission (allowlist-only payload, signed webhook).
- Payout provider.

Adapters are written against each provider's documented contract and unit-tested
with an injected transport (no network, no credentials). The real path is gated
behind `live=true` plus configured credentials, never reached by default.

## Invariants every persistent repository must enforce (service AND database)

- No paid order without provider proof (a paid state requires a provider reference).
- Capture cannot exceed authorization; refund cannot exceed capture.
- Money and commission ledgers are append-only (no update/delete of historical rows).
- One live accrual per order; no double checkout; no double charge; no provider replay
  (idempotency key uniqueness at the database layer).
- No cross-tenant identity from a request body; ownership is derived from the
  authenticated member, never supplied.
- No product ships from an expired, recalled, unknown-expiry, or unreleased lot.
- No compensation for recruitment; no recursive downline.

## What Track B does NOT do

- It does not enable any flag, take any payment, run any production SQL, use any
  real credential, or mark any SKU purchasable.
- It does not build the stateful path into a claim that commerce is live.
- Activation remains externally gated: delivered COAs (0 of 65 today), a
  credentialed payment processor, effective agreements, and per-SKU admin release.

## Testing

Every store and adapter is tested offline: the in-memory doubles fully, the
Supabase-backed stores via their pure row-mapping functions and an injected fake
client, the adapters via an injected transport. No test touches a real database
or provider.
