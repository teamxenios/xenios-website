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

## Findings and repairs log (waves 14+15 audit closure)

Six minor findings from the wave 14 persistence audit, each closed with a code
repair and a regression test, plus the wave 15 schema fidelity work. All in
`server/research/commerce/persistence/`; nothing here flips a flag, runs SQL, or
enables commerce.

1. **Payout batch overwrite (commissions-store).** The in-memory
   `recordBatch` silently replaced an existing batch by id, which the durable
   primary key would never allow. Repair: a duplicate id now throws the new
   typed `DuplicatePayoutBatch` in BOTH implementations (the Supabase store maps
   the 23505 unique violation to the same error), so a batch is never
   overwritten. Tests: duplicate rejection plus proof the recorded totals
   survive, against the reference and the fake client.
2. **Unguarded claim enum casts (claims-store).** `claimRowToRecord` cast
   `reason`/`state`/`resolution` straight from the row. Repair: the mapper now
   validates each against the exact domain sets and returns null for an unknown
   value, and every read path drops such a row (cart-store's drop-not-guess
   discipline); `get` returns null, lists exclude the row while keeping valid
   ones. Tests: per-column drop cases plus list/get behavior.
3. **Recall timestamp drift (inventory-store).** `inventoryLotToRow` stamped
   `recalled_at` with the current clock on every re-save of an already-recalled
   lot, so the traceability record of WHEN the recall happened drifted. Repair:
   the save path reads the stored `recalled_at` first and the mapper preserves
   it (`existingRecalledAt` wins over `now`); the clock is used only by the save
   that first flips the lot to recalled, and clearing the recall clears the
   date. Tests: pure-mapper cases and a two-save fake-client scenario proving
   the original date survives a later operational save.
4. **Partners-store seam reconciliation.** The three async interfaces it
   declared (`AsyncPartnerLinkStore`, `AsyncAttributionTouchStore`,
   `AsyncAttributionConversionStore`) are KEPT and now documented in-file as THE
   seams the partner services adopt when the synchronous AttributionRepository
   goes async (the partner modules declare no async repository of their own;
   same pattern as the payout port in commissions-store). Verbs mirror the sync
   seam so adoption is a mechanical async conversion. The audit's real gap was
   found and fixed here too: the in-memory `saveLink` overwrote `byCode` on a
   duplicate code while the old partner's listing kept the stale link, so one
   code could appear under two partners (an attribution integrity hole the DB's
   UNIQUE code makes impossible). Repair: duplicate codes now throw the typed
   `DuplicatePartnerLinkCode` in both implementations. Tests: rejection plus
   proof the original owner and listings are untouched.
5. **Unguarded order state cast (orders-store).** `headerRowToOrder` cast
   `state` from the row. An order holds money, so dropping it silently could
   hide it from the review queue or let it be re-created; repair: an unknown
   state THROWS. Test: the throw case.
6. **Unguarded money-ledger casts (commissions-store).** Commission entry
   state, payout batch state, and payout attempt outcome were cast from rows.
   Dropping a commission row silently would corrupt chain reconstruction (kind
   is derived from position, so a dropped accrual makes a reversal read as an
   accrual) and change balances; repair: unknown values THROW in
   `rowToCommissionEntry` (and therefore `chainRowsToEntries`),
   `payoutBatchRowToRecord`, and `payoutAttemptRowToRecord`. Tests: each throw
   case. Order shipments (below) got the same guard in the drop direction, since
   a shipment row is not money.

### Wave 15 schema fidelity

The wave 14 audit found the orders store DROPPING OrderRecord fields on the
durable round trip (`shipments`, `approvedBy`, `approvedAt`,
`cancellationReason`, `authorizationReleaseFailed`) and the claims store
dropping `notes`, while the in-memory references kept them. Closed by:

- **`supabase/research-track-b-fidelity.sql`** (NEW, idempotent, no destructive
  DDL, RLS consistent with siblings; DRAFT and NOT RUN, like every Track B
  migration): adds nullable `approved_by text`, `approved_at timestamptz`,
  `cancellation_reason text`, `authorization_release_failed boolean` to
  `research_orders`; adds `notes text` to `research_claims`; and creates the
  typed child table `research_order_shipments` (order_id FK, seq with
  UNIQUE(order_id, seq), owner CHECK in mitch/xenios, status, tracking_number,
  carrier) rather than dumping the structured shipment shape into an untyped
  json column. NOTE: `supabase/MIGRATIONS.md` is owned by another lane in this
  wave; this file still needs its ledger row there before any production run.
- **orders-store**: the four columns and the shipments child table now persist
  and round-trip; shipments are current-state (replaced together on save,
  ordered by seq), a null column reads back as the absent optional key, and an
  explicit `authorizationReleaseFailed: false` survives as false. Round-trip
  equality tests prove the Supabase store (via the fake client) now matches the
  in-memory reference exactly, including replace-and-clear semantics.
- **claims-store**: `notes` persists to its own column and round-trips exactly
  (a pre-migration null reads as ""); the Supabase-versus-reference equality
  test now compares the full record with no carve-out.

Verification: 132 tests across the five store test files, green; `tsc --noEmit`
clean.
