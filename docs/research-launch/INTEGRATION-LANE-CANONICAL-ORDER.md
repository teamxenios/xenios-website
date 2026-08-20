# Integration lane: canonical order + customer order history

Session `claude-fable-s7`, task `CANONICAL-ORDER-HISTORY`, branch
`fable/canonical-order-history-20260819`, based at `5bb3fa9`.

Everything in this lane is **unmounted**. No route table is registered, no
composition root is edited, `server/index.ts` is untouched, and no migration is
applied. Wiring is the lead's, and this document is the contract for it.

## What this lane adds

A legitimate paid or accepted transaction becomes ONE durable canonical Xenios
order, and that order is what the customer's history renders from.

| File | Role |
| --- | --- |
| `shared/research/orders/canonical-order.ts` | Wire vocabulary, id predicate, route paths |
| `server/research/orders/order-number.ts` | Deterministic `XO-` identity derived from the source |
| `server/research/orders/canonical-order.ts` | The domain: conversion, evidence gates, progression, ownership-scoped reads |
| `server/research/orders/service.ts` | The seam the composition root wires |
| `server/research/orders/http.ts` | Two member-authenticated GET descriptors |
| `server/research/orders/memory-repository.ts` | In-memory repository (tests, and a dev root with no store) |
| `client/src/research/orders/` | Adapter, presentation, `OrderHistory`, `OrderHistoryDetail` |

## Request vs order

An `XRR-` assisted request is **not** an order. It is a request until canonical
conversion happens, and conversion is an operator act on evidence. The domain
enforces this rather than documenting it: `convertToCanonicalOrder` refuses with
`EVIDENCE_REQUIRED` unless quote-acceptance evidence, payment evidence, or both
are present.

Three sources may convert, each pinned to its own id space:

| Source kind | Id space | Evidence that admits it |
| --- | --- | --- |
| `assisted_request_quote` | `XRR-` | accepted quote (`acceptanceId`), payment optional |
| `early_access_placement` | `XEA-` | verified payment |
| `early_access_cart_checkout` | `XEC-` | verified payment (settlement) |

A source ref that does not carry its kind's prefix is refused, so one family's
identifier cannot be laundered through another family's kind.

## Payment state is derived, never stated

`paymentState` has exactly two values, and `paid` is reachable only from payment
evidence naming a verifier, a verification id and a time. There is no input
field that sets it. An input object that states `paymentState`, `totalCents`,
`subtotalCents`, `fulfillmentState` or `orderNumber` — or a line that states
`lineTotalCents` — is refused with `CLIENT_TOTAL_REFUSED` before any arithmetic
runs, which is what closes the untyped-JSON path a compiler cannot see.

An accepted quote converts to `awaiting_payment`. It becomes `paid` later
through `markPaymentVerified`, and never any other way.

## Money is computed here

The caller passes authorized unit prices and quantities. Every line total, the
subtotal and the total are recomputed in the domain. The caller also echoes
`expectedTotalCents`; a mismatch refuses with `TOTAL_MISMATCH` rather than
silently preferring either number.

## Idempotency

The order number is `XO-` plus eighty bits of SHA-256 over
`"<kind>:<sourceRef>"`. It is a pure function of the source, so two racing
converters compute the same number before either reaches the store.

- Duplicate conversion of the same source, same content → the incumbent order,
  `replayed: true`. One stored order.
- Same source, **different** content (different money, different customer,
  different evidence) → `CONVERSION_CONFLICT`. Not absorbed.

The repository must therefore be insert-once on **both** `conversionKey` and
`orderNumber`, returning the incumbent on conflict rather than throwing, and
`update` must refuse a lost update by comparing `revision`. The in-memory
implementation enforces both; the durable one must not be laxer.

## Fulfillment

Separate from payment, six states, transition-gated
(`unfulfilled → processing → shipped → delivered`, with `cancelled` and a
recoverable `exception`). Two rules matter for wiring:

1. Every event carries a non-blank `evidenceRef`. No state is asserted from
   nothing, and the same `evidenceRef` on the same target is absorbed as a
   replay.
2. An unpaid order cannot progress to `processing`, `shipped` or `delivered`.
   It can be cancelled or flagged. This is what stops an unpaid path from ever
   resembling a fulfilled paid order.

## What the lead must supply

```ts
createCanonicalOrderService({
  repository, // CanonicalOrderRepository — durable, insert-once, revisioned
  bindings,   // { customerRefsFor(memberId) } — the SAME M62 directory instance
              // already used by server/research/early-access/orders/
              // member-order-history.ts, so the two surfaces cannot disagree
});

createCanonicalOrderRouteTable(service, memberResolver);
// memberResolver must be the resolver the other member routes already use.
```

Both routes are `GET` and `auth: "member"`. There is deliberately **no**
customer-facing write route: conversion, verification and fulfillment are
operator acts, so no route a customer can reach performs them.

- `GET /api/research/order-history` → `{ ok: true, orders: CanonicalOrderView[] }`
- `GET /api/research/order-history/:orderNumber` → `{ ok: true, order }`

A failed durable read answers `503 order_history_unavailable`, never an empty
list. For a customer who has just paid, an empty history is indistinguishable
from a real answer and invites a second purchase.

### Client mounting

`client/src/research/orders/OrderHistory.tsx` exports `ORDER_HISTORY_ROUTE`
(`/research/member/order-history`) and `ORDER_HISTORY_DETAIL_ROUTE`. Both are
default-exported page components ready for `section.tsx` (a file this lane does
not touch). The pages need no capability gate: an unmounted API answers
`unavailable` and the pages render their honest not-open state.

## Relationship to what already exists

`member-order-history.ts` merges member-commerce orders, EA placements and EA
cart checkouts into `OrderSummaryDto` for the existing `/research/member/orders`
page. That decorator is a **read-side projection over three unreconciled record
families** and stays exactly as it is; nothing here modifies it.

This lane is the other half: the durable canonical record those transactions
convert INTO. The two can run side by side — the existing page keeps answering
"what did I buy" across the legacy families while canonical orders accumulate —
and once every source converts on placement, the legacy decorator can be retired
in a later lane. That retirement is **not** part of this lane and must not be
attempted as part of wiring it.

`OrderState` (14 states, `shared/research/commerce.ts`) is untouched and remains
the member-commerce payment-lifecycle authority. The canonical order splits
payment from fulfillment because a customer asks those as two questions; it does
not replace or duplicate that machine.

## Durable store (not written by this lane)

The repository port is deliberately storage-agnostic. A Supabase implementation
should follow the existing pattern: named security-definer RPCs through
`server/research/early-access/persistence/executor.ts`, never table access.
Required behaviour is exactly the port contract above — insert-once on two keys,
revisioned update, and a customer-ref-filtered list. No migration is proposed
here; the founder-approval gate on production mutation is unchanged.

## Verification at this SHA

```
npx vitest run server/research/orders client/src/research/orders
# 2 files, 37 tests, all passing

npx tsc --noEmit
# 0 errors, whole repository
```

Negative tests covering the brief: customer A cannot read customer B (including
a deliberately leaky store that ignores its filter), a client cannot alter line
totals (three routes tried), duplicate conversion returns the same order
(sequential and concurrent), an unpaid path cannot masquerade as paid, and
affiliate metadata cannot change order ownership (plus a serialization test
asserting attribution, evidence ids and verifier identity never reach the wire).
