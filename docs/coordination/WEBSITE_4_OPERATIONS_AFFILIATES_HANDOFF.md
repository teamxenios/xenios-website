# Website 4 Operations, Fulfillment, and Affiliates Handoff

## Identity

- Build base: `2891dcb9ded41e6007f636bf053cd090dcd16111`
- Production reference while corrected: `2891dcb9ded41e6007f636bf053cd090dcd16111`
- Branch: `feature/website-4-takeover-operations-fulfillment-affiliates`
- Commit 1: resolved from the authoritative SHA-pinned PR manifest after the final two-commit rewrite
- Commit 2 / final source: resolve from the authoritative SHA-pinned PR manifest
- Prior draft PR #48: prohibited and not reused wholesale
- PR #104 ancestry: prohibited; replacement rebuilt directly on current main

## Commit 1 — launch-critical fulfillment

- Restricted, minimum-necessary Mitch/supplier assigned-order projection
- Fulfillment preparation stays unavailable until the canonical RPC-only
  paid-order boundary is integrated
- Candidate fulfillment command tables are namespaced away from the deployed
  `research_fulfillment_orders` and `research_fulfillment_lines` tables
- Production-shaped apply-twice verification preserves the deployed table
  shapes and authenticated grants
- Exact SKU, quantity, reservation allocation, lot, and quality binding
- Summed multi-lot allocation with exact line-quantity reconciliation
- Canonical product, variant, and sorted-lot readiness locking
- Two-session readiness invalidation races in both transaction orderings
- Supplier onboarding and server-authoritative supplier-user scope
- Supplier-specific offers and immutable settlement receipts
- Reauthorizing fixed-search-path supplier and assignment read RPCs; no direct
  service-role supplier PII reads
- Acknowledge, pick, pack, ship, deliver, exception, return, damage, loss,
  recall, and cancel transition graph
- Label, carrier, service, tracking, reason, optimistic-version, and normalized
  timestamp gates
- Cross-supplier isolation
- Six fixed-search-path mutation RPCs and three reauthorizing read RPCs
- Eleven forced-RLS tables with zero browser grants/policies
- Service role has SELECT only on command-managed tables
- Append-only idempotency and audit receipts

## Commit 2 — commercial operations

- Affiliate partner, disclosure, agreement, and lifecycle controls
- Internal-path affiliate links and campaigns
- PII-free attribution receipts derived from the canonical paid-order/refund
  economics boundary
- Commission event chains derived from paid/refund state and an immutable,
  exact Lawrence configuration version
- Commission transitions enforce the pinned Lawrence hold and payout threshold;
  `mark_paid` additionally requires immutable payout-provider/reference evidence
- Versioned affiliate statements use immutable attribution earning periods,
  exact locked item inclusion, one active lineage per attribution, and audited
  supersession
- Professional-account lifecycle and agreement gates
- CRM projection across approved commercial domains
- Atomic Lawrence configuration replacement leaves exactly one current version;
  prior economic terms become audited, immutable superseded history
- Event-derived operations command-center summary
- Eight fixed-search-path RPCs
- Ten forced-RLS tables with zero browser grants/policies
- Service role has SELECT only on command-managed tables

## Migrations

- `20260728010000_research_fulfillment_supplier_operations.sql`
- `20260728020000_research_affiliate_professional_operations.sql`

Both are unapplied. Website 2 retains sole migration, merge, deployment, and
production-smoke authority.

## Validation

- Focused correction tests: PASS (`8/8`)
- All owned TypeScript domain/UI tests: PASS (`31/31`)
- Previously accepted broader focused lane: PASS (`79/79`)
- Typecheck: PASS
- Production build: PASS
- Fresh PostgreSQL 16 bootstrap: PASS
- Both candidate migrations apply twice: PASS
- Forced RLS / zero policy / zero browser grant checks: PASS
- Service SELECT-only and exact RPC grants: PASS
- Direct service-role DML denial: PASS
- Exact-lot readiness and assignment integrity: PASS
- Supplier and actor isolation: PASS
- Sequential/concurrent replay: PASS
- Product/variant/lot readiness invalidation races: PASS in both orderings
- Immutable fulfillment, settlement, attribution, commission, statement, and
  commercial audit evidence: PASS
- Lawrence v1-to-v2 replacement, exact replay, concurrent edit serialization,
  injected-crash rollback, and economic-field immutability: PASS
- Commission hold/threshold/no-evidence denials, payout evidence persistence,
  concurrent paid replay, and injected-crash rollback: PASS
- Cross-period transition exclusion, one-attribution/one-lineage statement
  inclusion, refund reversal, and exact statement supersession: PASS
- Functional fulfillment-to-delivery and settlement lane: PASS
- Functional affiliate-to-payable-statement lane: PASS
- Rollback/cleanup zero residual candidate rows: PASS
- Full suite: `3764 passed`, `1 skipped`, `1 pre-existing base failure`
  - release-control checked-in snapshot exceeded its 5-second test timeout
- Diff ownership: exact leased files only; no central route/control-plane,
  Product Control, cart, checkout, order composition, Care, or migration ledger
- Browser: 375px, 320px, and 640px 200%-reflow proxy have no horizontal
  overflow; `main`, `nav`, and `h1` landmarks present; zero console errors

## Browser and integration posture

The existing `/admin/research/fulfillment` route renders the minimum-necessary
Mitch queue only when its adapter returns a real assignment ID, distinct
fulfillment-order ID, version, recipient country, and complete exact-lot data.
New
command-center and commercial components are deliberately unregistered because
Website 4 is prohibited from editing central routes and navigation. Website 2
must perform shared wiring after exact-SHA acceptance. No production account,
supplier, affiliate, inventory, lot, order, shipment, commission, payout, or
revenue record was created.

## Next exact action

Website 6 reviews the exact final source SHA and raw Git blobs. After acceptance,
Website 2 integrates the two migrations in order, registers the server/UI seams,
applies migrations, deploys through Render, and runs authorized persona smoke
tests with verified real inputs only.
