---
title: Commerce, Catalog, Evidence, and Distribution API Contracts
lane: Website 3 (G6, G7, G8)
status: FROZEN for the shapes below
types: shared/research/commerce-api.ts
last_updated: 2026-07-20
---

# Commerce API contracts

Types are authoritative in `shared/research/commerce-api.ts`. Import them, do not
re-declare them.

Envelope conventions are inherited from
`docs/agent-coordination/blitzscale/API_CONTRACTS.md` and are not re-invented:

```ts
success  { ok: true, ...payload }
denial   { ok: false, code: "<machine_code>", message?: string }
```

**Route on `code`, never on `message`.** Messages are free to change; codes are stable.

All member and admin JSON is `Cache-Control: no-store`.

## Guards (reuse, do not invent)

| Guard | Meaning |
|---|---|
| `requireMember` | valid JWT, recovery-purpose sessions denied |
| `requireActiveMember` | active membership plus billing state |
| `requireSupabaseAdmin` | founder admin, recovery sessions denied |

Inherited denial codes the UI already handles: `activation_required`,
`billing_past_due`, `membership_inactive`, `recovery_session`.

## The rule that shapes every payload here

**An unconfirmed supplier fact is never serialized to a member.**

32 supplier facts across the 15 SKUs lack written confirmation and 13 are disputed
(see `SUPPLIER_FACT_RECONCILIATION.md`). Therefore:

- `ProductSummaryDto` has **no** composition, strength, shelf life, storage, or COA field.
- `priceCents` is `number | null`. Null means not confirmed, and the UI must render an
  honest state rather than `$0.00` or a blank.
- `ProductDetailDto.confirmedFacts` is a **partial** map. An unconfirmed fact is simply
  not a key. Do not render a placeholder for a missing key.
- `purchasable` is `false` for every product today, and `unavailableReason` carries the
  member-safe explanation.

## G0 capabilities

```http
GET /api/research/capabilities            requireActiveMember
```

Member-safe booleans only. No environment variable names, no approval counterparties.

```json
{ "ok": true, "capabilities": { "product_commerce": { "enabled": false } } }
```

## G6 catalog, goals, guides

```http
GET /api/research/products                requireActiveMember  -> ProductsResponse
GET /api/research/products/:slug          requireActiveMember  -> ProductDetailResponse
GET /api/research/goals                   requireActiveMember  -> GoalsResponse
GET /api/research/guides                  requireActiveMember  -> GuidesResponse
GET /api/research/guides/:slug            requireActiveMember  -> GuideDetailResponse
```

Denials: `product_not_found`, `guide_not_found`, `guide_not_published`.

**Unpublished Guides are denied to ordinary members.** A Guide in `in_development`,
`in_review`, or `coming_soon` returns `guide_not_published` from the detail route and
appears in the list route with status only, never with body, claims, or sources.

## G7 cart, checkout, orders, subscriptions

```http
GET    /api/research/cart                 requireActiveMember  -> CartResponse
POST   /api/research/cart/lines           requireActiveMember  (AddCartLineRequest)
PATCH  /api/research/cart/lines/:sku      requireActiveMember
DELETE /api/research/cart/lines/:sku      requireActiveMember
POST   /api/research/shipping/quote       requireActiveMember  (ShippingQuoteRequest)
POST   /api/research/checkout             requireActiveMember  (CheckoutRequest)
GET    /api/research/orders               requireActiveMember  -> OrdersResponse
GET    /api/research/orders/:orderId      requireActiveMember  -> OrderDetailResponse
GET    /api/research/subscriptions        requireActiveMember  -> SubscriptionsResponse
POST   /api/research/subscriptions/:id    requireActiveMember  (SubscriptionActionRequest)
POST   /api/research/claims               requireActiveMember  (CreateClaimRequest)
GET    /api/research/claims               requireActiveMember  -> ClaimsResponse
```

### Cart behavior the UI must expect

- The cart **revalidates on read and again at checkout**. A line that was valid when
  added may come back with `blockedReason` set.
- `checkoutReady` is the only field the UI should gate the checkout button on.
- `shipmentGroups` reflects split fulfillment. **Shipping is charged once per order**,
  so `shippingCents` is a single figure, not a per-group sum.
- Totals are always computed server-side from the catalog. A client-supplied price has
  no field in any request schema and would be ignored if sent.

### Checkout denials

`commerce_disabled`, `cart_empty`, `cart_revalidation_failed`,
`unconfirmed_supplier_facts`, `product_not_purchasable`, `insufficient_stock`,
`agreement_required`, `address_invalid`, `state_not_serviceable`,
`shipping_unavailable`, `payment_disabled`, `large_order_review_required`.

**Today every checkout returns `commerce_disabled`.** Build the full flow anyway; the
capability flips it on without a UI change.

`large_order_review_required` is **not an error state in the UI.** The order exists and
is held. Show it as pending founder review with an approximate two-hour target.

## G8 referrals, partners, commissions

```http
GET  /api/research/store-credit           requireActiveMember  -> StoreCreditResponse
GET  /api/research/partner/dashboard      requireMember        -> PartnerDashboardResponse
GET  /api/research/partner/links          requireMember        -> PartnerLinksResponse
```

**Partner payloads are aggregates only.** `PartnerDashboardDto` contains no member id,
email, name, health data, rejection reason, Blueprint, plan, tracker record, or private
order. The server builds it by explicit construction, not by filtering a richer object,
and a test asserts the forbidden fields cannot survive serialization.

Store credit: `spendableCents` counts **approved entries only**. Pending, held,
reversed, and fraud-flagged credit is not spendable and is reported separately, so a
credit under review cannot be spent while still reversible.

## G10 admin

```http
GET /api/admin/research/commerce/queues   requireSupabaseAdmin -> AdminCommerceQueuesResponse
```

Includes `supplierFactBlocks`, which is the live reconciliation worklist.

## Registration

This lane exports:

```ts
export function registerCommerceApi(app: Express, deps: CommerceDependencies): void
```

It does **not** touch `server/research/index.ts`. The integration lane adds the call.

## Status

| Contract | State |
|---|---|
| Types in `shared/research/commerce-api.ts` | FROZEN |
| Route paths above | FROZEN |
| Payload shapes above | FROZEN |
| Handler implementations | in progress, wave by wave |

The UI may build against these shapes now. Where a handler is not yet implemented, it
returns a denial with a listed code rather than a different shape.
