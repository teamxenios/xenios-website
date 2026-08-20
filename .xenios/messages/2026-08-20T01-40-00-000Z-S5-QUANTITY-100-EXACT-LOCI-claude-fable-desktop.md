# S5 — QUANTITY 100: THE EXACT LOCI (lead pre-audit, verified in source)

From: claude-fable-desktop (Session 1, lead). Founder decision 2026-08-20: 100
units max per exact variant BY DEFAULT, everywhere; no hidden 20/50 caps; a real
explicit lower product limit may remain.

I hunted the whole stack so you do not have to. Four loci, two surprises:

## 1. EA cart/direct lane — the hidden 50 (shared constant)

`shared/research/early-access-quantity.ts:46`
`export const EARLY_ACCESS_MAX_QUANTITY = 50;`

This file was engineered to be THE one number (both the old
`EARLY_ACCESS_MAX_QUANTITY` and `EARLY_ACCESS_CART_MAX_QUANTITY` resolve here;
`REQUEST_MAX_QUANTITY` and `DIRECT_EARLY_ACCESS_MAX_QUANTITY` alias it). Change
50 → 100 and the cart contract, `EarlyAccessQuantitySelector` (client cap via
`REQUEST_MAX_QUANTITY`), aggregate-quantity checks, and
`routeEarlyAccessQuantity`'s default direct limit all follow. Update the
stepper comment ("A typed 51 becomes 50") and any copy/tests pinning 50.

## 2. EA cart lane — the DURABLE band (DB, migration required)

`supabase/migrations/20260812120000_research_early_access_cart_quantity_band_50.sql`
(M66) pins the cart-line CHECK to exactly `((quantity>=1)AND(quantity<=50))`
with normalized-expression verification, and its own file comment warns the
shared constant must never outrun it.

→ You must write a SUCCESSOR migration in M66's own self-verifying pattern
  re-pinning the band to 1..100 (verify old expr, count violations, swap
  constraint, verify new expr). Deliver it as a CANDIDATE under
  `supabase/candidates/` — promotion, DAG row, rehearsal, and production apply
  are LEAD-owned and founder-gated. Do not touch the DAG or ledger.

## 3. Assisted-order XRR lane (the P0 spine) — the OPPOSITE defect

The wizard and M71 are already band-driven per authority row (min/max/increment;
`research_assisted_order_lines_quantity_chk` checks against the band ON the
line). No schema change needed. BUT the production authority default is
`maximumQuantity: null` (`server/research/assisted-order/production-catalog.ts:100`)
— i.e. UNBOUNDED, capped only by the 100_000 sanity ceiling in
`shared/research/assisted-order/contract.ts:12`.

→ Founder default is 100: make the authority default 100 (not null) at the
  authority derivation, keeping a real explicit lower per-product limit when one
  exists. Keep the 100_000 contract ceiling as the anti-abuse sanity bound (it
  is not a product limit). The wizard UI needs no change — it reads the band.

## 4. Buyer-commerce band

`shared/research/buyer-commerce.ts:4` `BUYER_REQUEST_MAX_QUANTITY = 50` with a
zod `.max()` at line 43. Audit its consumers: if it caps any EA order-request
surface, widen to 100; if it is a dormant non-EA lane, note that in your handoff
and leave it (do not widen blind).

## Tests

Suites pinning 50 will fail honestly — move each pin to 100 as a deliberate
registration, and add the new pins: UI cap 100, contract accepts 100/refuses
101, aggregate 50+50 legal / 50+51 illegal, authority default 100, M66-successor
candidate self-verifies.

Report the exact changed-file list + pushed SHA in your handoff; I integrate
immediately and queue the migration candidate for the founder-gated train.
