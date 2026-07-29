---
title: Authoritative Pricing Core
lane: XCA-W1-PRICING-CORE
status: FROZEN_LOCAL_AWAITING_QA
types: shared/research/pricing.ts
last_updated: 2026-07-28
---

# Authoritative pricing core

One price authority, one customer-safe contract, one projection a catalog card
may render. Everything downstream of Product Control resolves prices through
this core, and nothing downstream can invent, default, or zero a price.

## The lineage

```
Product Control (research_product_prices, approved and activated by an admin)
  -> ProductControlCurrentPriceResolver   (existing authority, fail closed)
  -> AuthoritativePriceResolver           (this lane: customer-safe facade)
  -> CatalogPriceProjection               (this lane: what a card may show)
  -> CartPriceSnapshot                    (cart binding lane, pins price identity)
  -> checkout recompute                   (checkout lane, re-resolves against the authority)
  -> OrderLinePriceSnapshot               (order lane, records the agreed price)
```

The single authority for "which price row is current" stays
`ProductControlCurrentPriceResolver` in
`server/research/catalog/product-control-reader.ts`. This lane imports it and
never re-implements its judgment. When this lane's failure classifier and the
authority disagree, the authority wins and the result fails closed.

## What this lane provides

### shared/research/pricing.ts (dependency free)

- `CustomerPrice`: the only price fields that may reach a browser. Positive
  safe integer cents, allowlisted currency, no internal fields.
- `PriceResolution`: `available | unavailable | ambiguous`, with a closed
  failure enum: `price_missing`, `price_ambiguous`, `price_inactive`,
  `price_unapproved`, `price_future`, `price_expired`, `wrong_audience`,
  `wrong_currency`, `product_inactive`, `variant_inactive`,
  `variant_unapproved`, `member_ineligible`.
- `CatalogPriceProjection`: `priced` with a `CustomerPrice`, or an explicit
  `not_currently_available`. No third shape.
- `CartPriceSnapshot` and `OrderLinePriceSnapshot`: the shapes the cart and
  order lanes persist, pinning `priceId`, `priceVersion`, audience, currency,
  unit amount, quantity, and line total, plus `pricedAt` (cart) or `agreedAt`
  (order). `computeLineTotalCents` is integer only and throws on anything
  unsafe. Validity guards check internal consistency, including
  `lineTotalCents === unitAmountCents * quantity`.
- `CUSTOMER_PRICE_AUDIENCES` mirrors `CART_PURCHASE_AUDIENCES` (retail,
  member, professional, wholesale) and never includes `compare_at`. A test
  pins the two lists together.

### server/research/pricing/authoritative-price-resolver.ts

`AuthoritativePriceResolver.resolveApprovedResearchPrice({ productId,
variantId, authenticatedAudience, currency, at })` returns a
`PriceResolution`.

- The audience input is the branded `ServerAuthorizedAudience`. Its brand
  symbol is not exported, so the only way to build one is
  `authorizeAudienceFromServerIdentity`, and that function must be called
  with facts derived from the authenticated server session (member tier,
  account role). A browser-supplied audience can never reach the resolver.
  The authorization must also be evaluated at the same instant as the
  resolution, so a stale authorization fails closed.
- Currency is normalized (trim, uppercase) and allowlisted. USD only today.
- The response is built by explicit field picks. It never carries supplier
  cost, wholesale source, margin, source URL, approval note, approver
  identity, creator identity, or audit timestamps.
- Amounts are positive safe integers. The authority tolerates a zero amount;
  this facade does not, and maps it to `price_missing`.
- `CatalogPricingProductSource` adapts the existing drift-checked catalog
  reader (`ProductCatalogReader`) to the one-product read this facade needs,
  failing closed on absent or duplicated ids.

### server/research/pricing/catalog-price-projection.ts

`projectCatalogPrice(resolution)` returns the card contract. Every
non-available resolution, every malformed price, and every zero or negative
amount maps to `{ state: "not_currently_available" }`. There is no default
amount anywhere in the module, so a "$0" display cannot be derived from its
output. `projectedAmountCents` returns a positive integer or null, never 0.

## Failure taxonomy in one table

| Reason | Meaning |
|---|---|
| `price_missing` | no price row for this product and variant, or a defensive fail-closed fallback |
| `price_ambiguous` | more than one candidate matched; nothing is displayable |
| `price_inactive` | rows exist but are expired or superseded |
| `price_unapproved` | rows exist but are draft, approved-not-activated, or missing approval facts |
| `price_future` | the price becomes effective after the resolution instant |
| `price_expired` | the price window closed before the resolution instant |
| `wrong_audience` | no row for the authorized audience, or the authorization itself is invalid |
| `wrong_currency` | the requested or stored currency is off the allowlist |
| `product_inactive` | the product is missing, unpublished, hidden, or inactive |
| `variant_inactive` | the variant is missing or deactivated |
| `variant_unapproved` | the variant exists but is not approved |
| `member_ineligible` | member audience on a variant not flagged member eligible |

## Integration notes (for the release manager; leased files, one-line edits)

Nothing in this lane is wired into the running server. The later wiring edits,
each one line in a file leased to another lane:

1. `server/research/index.ts`: construct the resolver once at startup, for
   example
   `const priceResolver = createAuthoritativePriceResolver(new CatalogPricingProductSource(createProductionProductControlReader()));`
   and pass it to the routes that need it.
2. `server/index.ts`: register any new pricing route module the catalog or
   cart lanes add, following the existing route registration pattern.
3. Cart binding lane: on add-to-cart, call
   `resolveApprovedResearchPrice(...)`, then persist a `CartPriceSnapshot`
   built with `computeLineTotalCents`.
4. Checkout lane: recompute every line against
   `resolveApprovedResearchPrice(...)` at checkout time and compare against
   the cart snapshot; any drift or non-available result blocks checkout.
5. Order lane: write the `OrderLinePriceSnapshot` (with `agreedAt`) from the
   checkout recompute result, never from the cart display.
6. Decision import lane: activated Product Control price rows are already the
   input; no change here, the resolver reads whatever Product Control has
   activated.

## Invariants QA should try to break

- No resolution path returns an amount of 0 or less.
- No resolution response serializes `approvalNote`, `approvedBy`,
  `createdBy`, or any supplier or margin field.
- A missing price can only render as not currently available, never "$0".
- The audience cannot be chosen by the browser; forging one past the type
  system still fails closed at runtime.
- When the classifier and the authority disagree, the result is
  `price_missing`, never `available`.
