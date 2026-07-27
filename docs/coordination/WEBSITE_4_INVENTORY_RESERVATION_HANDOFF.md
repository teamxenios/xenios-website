# Website 4 atomic inventory reservation handoff

## Frozen scope

- Owner: `OWNER-W4-INVENTORY-RESERVATION`
- Branch: `feature/website-4-wave3-atomic-inventory-reservation`
- Exact base: `ef158672ce9ec3524f8bb64841b285a76e37a54b`
- Domain: route-free, UI-free, provider-free inventory reservation composition port
- Production mutation: none
- Merge, migration, shared wiring, deployment, rollback, and production smoke owner: Website 2

This unit does not enable checkout. It does not edit the dormant
`reservations-store.ts`, cart, orders, payments, fulfillment, shared routes,
capabilities, navigation, the migration ledger, or any production migration
package.

## Completed contract

- Server-authoritative `InventoryReservationPort` for reserve, release, finalize,
  and expire.
- Strict UUID, normalized millisecond instant, caller-supplied expiry, bounded
  quantity, idempotency-key, and reason validation.
- Duplicate SKU demand is consolidated before mutation.
- Deterministic SKU order and FEFO lot locking.
- Exact canonical product + variant + SKU readiness and
  `research_lot_is_allocatable` are checked while candidate lots are locked,
  both at reservation time and through the exact requested hold expiry.
- Multi-SKU reservations are all-or-nothing.
- Reserve invokes canonical versioned `research_apply_inventory_movement`
  reserve children with derived domain-separated keys.
- Release and expire reduce reserved inventory exactly once. Inventory returns
  to available only while its lot/quality gates remain valid; otherwise the
  quantity is quarantined.
- Finalize locks and revalidates every exact allocation, lot,
  product/variant/SKU binding, and current COA/readiness chain before changing
  only the reservation state; it never decrements inventory a second time.
- Release remains available after product-readiness drift. Finalize requires an
  unexpired held reservation. Expire requires a genuinely expired held
  reservation.
- Reserve/finalize and canonical product, variant, COA-document, and COA-test
  readiness invalidations share an exact per-lot transaction lock. An
  invalidation cannot commit while an active hold depends on that evidence
  through its expiry horizon.
- Lot creation, reserve, and finalize also acquire stable shared product then
  variant identity locks before the lot lock. Product/variant/COA invalidations
  use the same identity order with non-waiting exclusive locks, so an
  invalidator fails instead of resuming after a wait with a stale zero-lot
  statement snapshot.
- Release, finalize, and expire reject timestamps earlier than the locked
  reservation's creation or latest update. Exact prior command replay is
  resolved before this transition check.
- Reservation IDs are locked in deterministic order. Cross-member probes fail
  without disclosing whether a reservation exists.
- Replay order is lock, ownership/current-input binding, receipt recheck,
  transition/version validation, mutation, immutable receipt.
- Exact same actor/member/action/payload replays the original redacted result.
  Changed payload, action, actor, or member conflicts without returning the
  stored result.
- One append-only `research_inventory_reservation_events` table records a
  domain-separated idempotency-key hash, canonical command hash,
  actor/member-scope hash, action, reservation versions, stable redacted result,
  and timestamps. It stores no raw idempotency key, token, email, or request
  body.
- The existing reservation header/allocation tables and the new event table use
  forced RLS with no policies. Browser roles have no grants.
- `service_role` has SELECT only on the three reservation tables and EXECUTE
  only on the four reviewed command RPCs. Direct table mutation is revoked.
- The fixed-search-path readiness serialization guard is trigger-only and is
  not executable by browser roles or `service_role`.

## Canonical database reuse

Created when absent and otherwise converged in place with the canonical dormant
Track B schema:

- `public.research_lot_reservations`
- `public.research_lot_reservation_allocations`

Reused from deployed Product Control and Wave 2:

- `public.research_inventory_lots`
- `public.research_inventory_movements`
- `public.research_inventory_product_variant_ready`
- `public.research_lot_is_allocatable`
- `public.research_lot_quality_ready`
- `public.research_apply_inventory_movement`

Added:

- `public.research_inventory_reservation_events`
- `public.research_inventory_readiness_serialization_guard` plus paired
  before/after triggers on canonical product, variant, COA document, and COA
  test readiness mutations
- `public.research_inventory_lot_identity_serialization_guard` on canonical lot
  identity creation/change

Reviewed fixed-search-path command functions:

- `public.research_reserve_inventory`
- `public.research_release_inventory_reservations`
- `public.research_finalize_inventory_reservations`
- `public.research_expire_inventory_reservations`

## Exact changed-file lease

1. `shared/research/inventory-reservation.ts`
2. `server/research/inventory-reservation/port.ts`
3. `server/research/inventory-reservation/production.ts`
4. `server/research/inventory-reservation/production.test.ts`
5. `server/research/inventory-reservation/migration.test.ts`
6. `supabase/research-inventory-reservation-commands.sql`
7. `supabase/verification/research-inventory-reservation-disposable-bootstrap.sql`
8. `supabase/verification/research-inventory-reservation-commands.verify.sql`
9. `docs/coordination/WEBSITE_4_INVENTORY_RESERVATION_HANDOFF.md`
10. `docs/coordination/WEBSITE_4_INVENTORY_RESERVATION_RELEASE_MANIFEST.json`

## Validation evidence

- Focused: 2 files / 16 tests passed.
- Property coverage: bounded duplicate-SKU consolidation permutations passed.
- Full suite: 207 files / 3,688 tests passed.
- TypeScript: `npm run check` passed.
- Production build: `npm run build` passed with only pre-existing chunk/import
  warnings.
- Diff check: passed.
- Fresh production-shaped PostgreSQL 16 bootstrap starting from deployed Wave 2
  with zero reservation tables: passed.
- Candidate created both missing canonical reservation tables and indexes,
  applied twice, then passed the complete verifier.
- Separate preexisting dormant Track B convergence lane: passed apply twice and
  the complete verifier without replacing the canonical tables.
- Both PostgreSQL lanes ended with zero reservation headers, allocations, and
  immutable receipt rows.
- Canonical raw Git-blob migration identity: 51,665 bytes, SHA-256
  `4e30807c7f58abc2d819abf509914364b55cba029586b3492329bacb7eef6005`.
- Checksum method: `git show <frozen-sha>:supabase/research-inventory-reservation-commands.sql`;
  the Windows CRLF working-tree digest is explicitly rejected as release identity.
- Forced RLS: 3/3 reservation tables.
- Browser table/RPC grants: 0.
- Service table privileges: 3 SELECT-only privileges.
- Reviewed service RPC grants: 4.
- Direct service DML on headers, allocations, and events: denied.
- Deterministic FEFO and duplicate-SKU consolidation: passed.
- Multi-SKU all-or-nothing and insufficient-inventory rollback: passed.
- Draft, archived, expired, failed-COA, ambiguous, and mismatched bindings:
  denied.
- Requested hold beyond any selected lot's expiry/retest horizon: denied with
  zero mutation.
- Finalize against recalled or otherwise currently unready exact evidence:
  denied with zero reservation, inventory, or event mutation.
- Real concurrent reserve-versus-COA-withdrawal testing passed in both lock
  orderings: reserve-first preserves valid evidence; withdrawal-first makes
  reserve fail without a held row.
- Zero-lot phantom regressions passed for product and variant identity in both
  transaction orderings: invalidation-first blocks later create/reserve, while
  create/reserve-first makes invalidation fail without changing readiness.
- Backdated release, finalize, and expire transitions: denied with exact
  row/event/inventory snapshots unchanged.
- Sequential and concurrent identical replay: one mutation and the same result.
- Concurrent different-key same-lot demand: no oversell.
- Release, finalize, and expire transition/replay/ownership/terminal checks:
  passed.
- Immutable event and redaction checks: passed.
- Transaction rollback proof and final zero business rows: passed.

## Website 2 integration request

After Website 6 exact-SHA acceptance:

1. Package and ledger the reviewed migration after
   `20260727120000 research_inventory_lot_coa_admin`.
2. Confirm the production pre-apply still has zero reservation tables, then
   allow this migration to create the two canonical base tables before applying
   the accepted command hardening.
3. Compose the production implementation behind future authenticated
   server-authoritative callers.
4. Keep checkout disabled until the caller supplies authenticated actor/member
   identity, a reviewed hold policy, stable command idempotency, and uses this
   port instead of the dormant direct-DML store.
5. Do not expose lot allocations outside future server-side order persistence.
6. Apply through the normal production migration path, then rerun the
   verification SQL and confirm zero unexpected record-count changes.

The repository JSON is coordination evidence with its head resolved from Git.
Because a commit cannot contain its own SHA, the authoritative release manifest
is the strict schema-valid JSON posted out-of-band on the draft PR after the
candidate is frozen. Website 2 and Website 6 must use that pinned PR comment for
exact base/head/file/checksum review.

## Rollback

Before any production reservation rows exist, Website 2 may revert the
application integration and the migration transaction. After operational rows
exist, disable callers and preserve the additive schema plus immutable receipts;
do not drop reservation or audit history.

PRODUCTION STATUS: NOT YET MERGED
