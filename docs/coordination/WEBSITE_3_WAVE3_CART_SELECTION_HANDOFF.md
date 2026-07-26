# Website 3 Wave 3 — Cart Product Selection

## Scope

Route-free and persistence-free typed product selection between Product Control
and a future authenticated cart/checkout. This unit does not create cart rows,
reserve inventory, calculate fulfillment, call providers, or enable commerce.

- Branch: `feature/website-3-wave3-cart-product-selection`
- Exact base: `f4de7f371177beaa2f4de7eb2e7b6a88d7378a19`
- Migration delta: none
- Route/API delta: none

## Contract

- Shared types: `shared/research/cart-product-selection.ts`
- Server selector: `server/research/commerce/cart-product-selection.ts`
- Browser-safe adapter: `client/src/research/adapters/cartProductSelection.ts`

The selector carries exact product, variant, SKU, audience, active price
identity/version, approved primary-media identity, canonical required-input and
domain-readiness versions, and Website 4's injected inventory-eligibility fact.

It fails closed for missing or ambiguous identity, cross-product variants,
unpublished/inactive products, draft/archived/inactive variants, missing SKU,
unapproved/future/expired/ambiguous price, absent approved media, incomplete
per-product required inputs or canonical readiness, and unavailable or
cross-product inventory eligibility.

The client adapter performs no request. It accepts only the server-selected
browser-safe projection and rejects malformed or cross-identity projections.
It carries no private Storage key, required-input value, audit history,
inventory quantity, lot, reservation, order, member, payment, shipment, or
provider data.

## Integration boundary

Website 2 owns any future route registration, shared wiring, merge, and release.
Website 4 owns the inventory-eligibility implementation. This unit accepts that
result as an injected typed fact and does not read or model operations tables.

## Validation

- focused server/client regressions: 2 files / 13 tests passed
- complete suite: 195 files / 3,543 tests passed
- TypeScript check: passed
- production build: passed (existing chunk-size warning only)
- diff check: passed
- exact six-file allowlist check: passed

## Production

No migration, row, seed, route, capability, navigation, provider, or production
state change is included.
