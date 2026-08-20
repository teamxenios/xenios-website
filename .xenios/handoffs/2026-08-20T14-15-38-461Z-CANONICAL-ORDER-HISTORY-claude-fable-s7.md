# Handoff: CANONICAL-ORDER-HISTORY

- Session: `claude-fable-s7`
- Lane: canonical order + customer order history
- Branch: `fable/canonical-order-history-20260819`
- Worktree: `C:/xenios-wt/canonical-order`
- Base: `5bb3fa9d364f0d6497cebcb1766417a9bbd0ccf8`
- **Exact SHA: `cb601c74fc75f6a49ba0916daea7403842472047`**

## What landed

A canonical order domain: the one durable record a legitimate paid or accepted
transaction converts into, plus the customer-facing history that renders from
it. Thirteen new files, all under paths this lane leased. Nothing else touched.

- `shared/research/orders/canonical-order.ts` — wire vocabulary, id predicate, route paths
- `server/research/orders/order-number.ts` — deterministic `XO-` identity
- `server/research/orders/canonical-order.ts` — the domain
- `server/research/orders/service.ts` — the composition seam (three named converters)
- `server/research/orders/http.ts` — two member-authenticated GET descriptors
- `server/research/orders/memory-repository.ts` — in-memory repository
- `client/src/research/orders/` — adapter, presentation, `OrderHistory`, `OrderHistoryDetail`
- `docs/research-launch/INTEGRATION-LANE-CANONICAL-ORDER.md` — the wiring contract

## Constraints honoured

- `server/index.ts` untouched; no composition root edited; nothing mounted.
- No deploy, no migration, no production mutation, no real payment marked.
- Pricing authority unchanged: authorized unit prices are passed in, never
  decided here.
- Supplier fulfillment implementation not owned: this lane records evidence-backed
  fulfillment events only.
- No order system duplicated. `member-order-history.ts` and the 14-state
  `OrderState` machine are untouched; the relationship is documented in the packet.

## Verification at `cb601c7`

```
npx vitest run server/research/orders client/src/research/orders   # 2 files, 37 tests, pass
npx tsc --noEmit                                                   # 0 errors, whole repo
```

Negative tests from the brief, all present and passing:
customer A cannot read customer B (incl. a leaky store that ignores its filter);
client cannot alter line totals (three attack routes); duplicate conversion
returns the same order (sequential + concurrent), and a differing duplicate is a
conflict; unpaid path cannot masquerade as paid (no forward fulfillment, no
unverified payment, no second verification); affiliate metadata cannot change
ownership, and never reaches the wire.

## What the lead must do to wire it

1. Supply a durable `CanonicalOrderRepository`: insert-once on **both**
   `conversionKey` and `orderNumber` returning the incumbent on conflict, and a
   revisioned `update`. The in-memory implementation is the behavioural spec.
2. Pass the **same** M62 legal-binding directory instance the existing EA order
   history uses, so the two surfaces cannot disagree about who owns what.
3. Register `createCanonicalOrderRouteTable(service, memberResolver)` with the
   member resolver the other member routes already use.
4. Mount `ORDER_HISTORY_ROUTE` / `ORDER_HISTORY_DETAIL_ROUTE` in `section.tsx`.
5. Call the converters from the points where evidence actually appears: quote
   acceptance (assisted), payment verification (EA placement), settlement (cart).

No founder decision is pending on this lane. It changes nothing live until
wired, and the durable store remains subject to the existing production-mutation
approval gate.

## Not in scope, deliberately left

- No Supabase migration or RPC proposed; the port is storage-agnostic.
- Retiring the legacy `member-order-history.ts` decorator once every source
  converts on placement is a later lane, not part of wiring this one.
- Admin-facing canonical order surfaces (queues, detail) are unbuilt.
