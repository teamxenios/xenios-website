---
title: Track B — commerce activation (consolidated plan and progress)
branch: integration/xenios-research-track-b-commerce-activation (PR #38)
base: main, post Track A + the member-platform SQL split (PR #34 + PR #36)
status: IN PROGRESS
---

# Track B: complete and activate real commerce

This is the single canonical Track B plan. It supersedes the earlier
`TRACK_B_IMPLEMENTATION_PLAN.md` (removed) and `TRACK_B_BUILD_PLAN.md` (PR #37,
closed as superseded); their useful decisions are folded in below. PR #38 is the
only Track B implementation PR, and this session is the sole Track B integrator.

Everything here is reversible engineering behind off-by-default flags. Nothing in
Track B enables commerce, takes payment, runs production SQL, or uses real
credentials. Product commerce stays gated by
`NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` (false), per-SKU eligibility (0 of 15, no
COAs on file), and the absent payment provider. The goal is to replace the
fail-closed stubs in `server/research/commerce/production-deps.ts` with real,
tested persistence and adapter code that stays refusing until it is activated.

## Consolidated conventions (drift resolved)

Two sessions started Track B with different conventions. Resolved here, once:

1. **One directory: `server/research/commerce/persistence/`.** All persistent
   stores and repositories live here (idempotency store, cart store, and every
   later repository). The earlier `repositories/` directory is removed and its
   contents moved here.
2. **One plan document: this file.**
3. **One async design (below).**

## Architecture decision: async-native repository seams

The commerce domain services were written against SYNCHRONOUS repository
interfaces, because their only implementation so far is in-memory. For example,
`server/research/commerce/cart.ts`:

```ts
export interface CartRepository {
  load(memberId: string): StoredCart | null;    // sync
  save(memberId: string, cart: StoredCart): void; // sync
}
```

A real Supabase/Postgres repository is asynchronous, so a persistent
implementation cannot satisfy a synchronous interface. Two designs were tried:

- **A sync-preserving bridge** (load-operate-save orchestrated around the sync
  service). Lower churn, but keeps a sync facade over async storage, reloads the
  whole aggregate per operation, and cannot be the long-term seam.
- **An async-native conversion** of the repository seams and the service methods
  that call them.

**Decision: the async-native conversion.** It is the honest design (async
storage, async interface), it matches the already-async idempotency store, and
it prevents the two efforts from fighting. The conversion is mechanical and has
NO behavior change: the in-memory repositories become `async` too, and every
existing commerce test still passes after adding `await`. It must land as ONE
reviewed change (the seam conversion across `cart.ts`, `checkout.ts`,
`orders.ts`, `refunds.ts`, `webhooks.ts`, and the `CommerceDependencies` surface
in `routes.ts`) before more persistent repositories are added. Until that lands,
the persistent stores built so far expose async interfaces and are exercised by
their own tests; they are not yet wired into the still-fail-closed deps.

## Invariants (enforced at BOTH the service and the database layers)

No paid order without provider proof; capture <= authorization; refund <=
capture; append-only money and commission ledgers (UPDATE/DELETE rejected at the
database); one live accrual per order; no double checkout; no double charge; no
provider replay (idempotency uniqueness at the DB); no body-supplied ownership;
no ship from an expired, recalled, unreleased, or unknown-expiry lot; no
compensation for recruitment; no recursive downline.

## Current persistence reality (from the repo assessment)

3 of roughly 36 commerce-relevant entities are persistent today, and those 3
belong to the Track A membership lane. Commerce is real, well-tested domain logic
on in-memory stores behind a fully disabled production wall. The SQL DDL for the
commerce tables exists (migrations 20-26) and passed a live scratch-Postgres
dry-run (`MIGRATION_DRY_RUN_REPORT.md`): RLS on, append-only money ledgers proven
to reject UPDATE/DELETE at the database level. Those migrations are NOT applied
and are excluded from the Track A SQL that Samuel runs first.

## Verification standard (per wave, non-negotiable)

- **Contract test**: run the SAME behavioral suite against the in-memory
  reference and the persistent implementation, so behavior is proven identical.
- **Persistence test**: exercise the Supabase-backed store against an injected
  fake client (offline), plus a live-DB integration test where the DB-level
  guarantee is the point (append-only ledgers, idempotency uniqueness).
- **No wave flips a feature flag.** Activation is a separate, credential-gated,
  Samuel-approved step.

## Waves

1. **Async repository-seam conversion** (no behavior change; in-memory repos
   become async; all commerce tests green). Foundation for everything below.
2. **Persistent idempotency store.** DONE: `persistence/idempotency-store.ts`
   (`IdempotencyStore` port, `InMemoryIdempotencyStore` reference,
   `SupabaseIdempotencyStore` durable via the DB `UNIQUE (scope, key)`
   constraint). The no-double-charge foundation; replaces checkout's per-process
   maps. Table `supabase/research-idempotency-keys.sql` (not run).
3. **Persistent cart.** DONE: `persistence/cart-store.ts` (`AsyncCartStore`,
   pure row mapping, in-memory double, Supabase-backed store, `resolveCartStore`
   fallback). Tables `research_carts` / `research_cart_lines` (migration 22, not run).
4. Orders, order lines, order state events (append-only).
5. Checkout sessions, payment authorizations, captures, refunds, replacements.
6. Inventory, lots, lot documents, reservations, FEFO, recalls.
7. Subscriptions and subscription changes.
8. Shipments, split fulfillment, delivery events, Mitch transmission (allowlist only).
9. Partners, attribution, organizations, commissions, reversals, payout ledger + runs.
10. Store credit, admin review queues, provider webhook + diagnostics records.
11. Production wiring: replace the `production-deps.ts` stubs with the async
    repositories behind the commerce flag (still off by default).
12. Provider adapters (Stripe payment, shipping carrier, Mitch, payout): interface,
    disabled provider, deterministic test provider, real adapter behind `live=true`
    plus configured credentials, env validation, default-false flag, injected-transport tests.
13. Running-server integration tests through the canonical app with test providers.
14. Track B migrations bundle + verification + rollback notes (separate from Track A).
15. Frontend connection (remove pending UI only where a real endpoint exists;
    keep truthful disabled states everywhere else).
16. Full tests, typecheck, build, security review.

## What Track B does NOT do

No flag flipped, no payment taken, no production SQL run, no real credential
used, no SKU made purchasable. Activation stays externally gated on delivered
COAs (0 of 65 today), a credentialed payment processor, effective agreements,
and per-SKU admin release.
