# Website 3 Wave 3 — Member Catalog and Product Detail

## Release identity

- Branch: `feature/website-3-wave3-member-catalog-detail`
- Exact base: `ae6533f57de6619b9656c866312f953ccb7eca8d`
- Domain: `website3.research-commerce.member-catalog-detail`
- Routes: none
- Migrations: none
- Tables/functions/RLS/privileges: none
- Environment variables/providers: none

## Scope delivered

This focused unit adds a route-free member catalog and product-detail
projection over the live Product Control repository.

- `LiveProductControlReader` reads only published, public, active products and
  fails duplicate IDs/slugs closed.
- `ProductControlCurrentPriceResolver` returns one exact approved, active,
  effective price for the server-authorized purchase audience.
- Member projections include approved active variants/SKUs, normalized current
  price identity, canonical required-input/readiness versions, Website 4's
  injected availability, and injected lot/COA presentation state.
- Approved media is exposed only through an injected HTTPS presentation href.
  Product Control private Storage keys, audit history, required-input values,
  inventory quantities, lots, locations, and providers remain server-only.
- The accepted cart product-selection contract is consumed unchanged as the
  fail-closed future cart seam. This unit does not create a cart or transaction.
- Catalog search, family/category filters, and sorting operate only on the safe
  member projection.
- Product cards and detail views reuse `ResearchMemberShell` and the Research UI
  kit, with loading, empty, error, unavailable, unauthorized, documentation,
  pricing, media, and operational states.
- The layout uses responsive one/two-column structures without fixed widths or
  horizontal-scrolling dependencies for desktop, 720, 375, 320, and 200% reflow.
- Controls have native labels, keyboard operation, visible-focus-compatible
  shared classes, semantic headings, status text, and live result counts.

## Truthfulness and GLP boundary

Only exact published/public Product Control records are projected. Missing,
stale, ambiguous, cross-product, unapproved, or unauthorized facts fail closed.
Public/member copy never displays internal required-input keys.

`future_clinical`/GLP records remain non-transactional Research catalog states.
Their unreviewed content is suppressed, no cart selection is emitted, and no
prescribing, dosing, booking, or treatment control is rendered.

## Integration seams

Website 2 owns route registration, server/client wiring, capability/navigation
integration, merge, and deployment.

Website 4 supplies availability and lot/COA presentation facts. Website 3 does
not read or model inventory, reservation, lot allocation, decrement, order,
payment, shipment, or provider state.

The production integration must inject:

- a server-authorized purchase audience and evaluation instant;
- canonical required-input and domain-readiness records;
- per-product/variant inventory eligibility;
- per-product/variant lot/COA presentation state;
- approved safe media presentation hrefs.

## Validation

- Focused readers/projection/adapter/UI tests: 5 files / 29 tests passed
- Full test suite: 201 files / 3,621 tests passed
- TypeScript: passed
- Production build: passed (existing chunk-size warning only)
- Diff/allowlist/secret/leak checks: passed
- Browser route screenshots: not applicable until Website 2 registers the
  accepted unit; component-level semantic/reflow/state coverage is included.

## Rollback

Revert the eventual focused integration commit. There is no database, route,
provider, environment, permission, or production-data state to roll back.

## Production smoke

1. Confirm deployed main contains the exact accepted source blobs.
2. Verify `/api/health` is 200.
3. Confirm the member catalog/detail endpoints are registered and return 401
   signed out rather than JSON 404.
4. With an existing authorized member session only, verify catalog and detail
   projections contain no private/admin fields.
5. Verify search, filters, sorting, variant selection, price, availability,
   media, and lot/COA states at 1440/720/375/320 and 200% zoom.
6. Confirm GLP/future-clinical entries remain catalog-only.
7. Confirm no cart, order, reservation, inventory, provider, or production row
   is created by read-only catalog browsing.
8. Inspect Render/Supabase logs and production count invariants.
