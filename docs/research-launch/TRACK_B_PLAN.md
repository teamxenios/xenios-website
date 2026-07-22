# Track B — Commerce Activation (plan and progress)

Branch: `integration/xenios-research-track-b-commerce-activation`, based on the
merged Track A `main` (`dd1f6b4`). Everything here is reversible engineering
behind off-by-default flags. Nothing in Track B enables commerce, takes payment,
runs production SQL, or uses real credentials. Product commerce stays gated by
`NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` (false), per-SKU eligibility (0/15, no
COAs), and the absent payment provider.

## Goal

Replace the fail-closed commerce stubs in `server/research/commerce/production-deps.ts`
with real persistent repositories and provider adapters, using the existing
architecture (one commerce system, not a second). Each stateful surface keeps
refusing while flags are off; the real persistence and adapter code exists,
tested, ready for activation once COAs + processor + counsel land.

## Invariants (enforced at service and DB layers)

No paid order without provider proof; capture <= authorization; refund <=
capture; append-only money/commission ledgers; one live accrual per order; no
double checkout; no double charge; no provider replay; no body-supplied
ownership; no ship from expired/recalled/unreleased/unknown-expiry lot; no
recruitment compensation; no recursive downline.

## Waves

- **Wave 1 (this change): persistent idempotency store.** `server/research/commerce/persistence/idempotency-store.ts`
  — `IdempotencyStore` port, `InMemoryIdempotencyStore` reference (concurrency-
  safe within a process), and `SupabaseIdempotencyStore` (durable, concurrency-
  safe via the DB UNIQUE (scope, key) constraint). Table:
  `supabase/research-idempotency-keys.sql` (Track B migration, not run). Tests:
  `idempotency-store.test.ts` (single execution, per-scope isolation, concurrent
  de-duplication, failure-not-cached). This is the foundation for no-double-charge
  and replaces the per-process maps in `checkout.ts`.

## Next waves (not yet built)

2. Persistent repositories: carts/cart lines, orders/order lines/events,
   subscriptions, claims, refund keys, webhook events — Supabase-backed behind
   the same port pattern, wired into `buildCommerceDependencies`.
3. Inventory, lots, FEFO, recall; reservations.
4. Provider adapters: payment (Stripe abstraction), shipping, Mitch fulfillment,
   payout — disabled/test/live tiers, env-validated, default-false.
5. Referrals/affiliates/commissions/payout ledger (append-only).
6. Track B migration bundle + verification + rollback (`supabase/production/`).
7. Frontend wiring; running-server integration tests; visual QA.

## External gates (unchanged, not engineering)

Actual COAs (0/65 present), a chosen and approved payment processor, counsel
clearance, per-SKU admin release. Activation is a separate, human, credentialed
step, never part of this branch.
