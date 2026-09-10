# Durable checkout: exact composition patch for the integration owner

Author: Fable (`fable-durable-payment-20260909`). Not applied: the two files
below are inside the integration owner's active lease
(`codex-seth-revenue-launch-20260905`). Everything the patch calls exists and
is tested at `70ab791b9bfacff41f8387b8ee9d2b11ab9a0c8d` on
`claude/durable-payment-port-20260909` (server composition builder and its
HTTP tests in `server/research/commerce/durable-checkout-composition{,.test}.ts`).

What the patch does in production TODAY (provider resolver still Disabled):
every durable door is mounted as a precise 503 refusal, the browser
configuration answers `payment_disabled`, and the checkout page keeps the
ordering door exactly as it is. No flag flips, no provider is constructed, no
in-memory money store is ever composed outside `NODE_ENV=test`.

What it does the day A composes a durable provider under the standing
authorization (resolver change inside A's pinned release): the same doors
become live over the managed execution store, and verified webhook events
bind to executions first.

## 1. `server/research/commerce/production-deps.ts`

Imports (top of file):

```ts
import {
  composeDurableCheckout,
  resolveDurableCheckoutStores,
  unavailableDurableCheckout,
  type DurableCheckoutComposition,
} from "./durable-checkout-composition";
```

Return type: `buildCommerceDependencies` (and the three state builders) return
`CommerceDependencies & { durableCheckout: DurableCheckoutComposition }`.
`routes.ts` is untouched: the extra key is an intersection on the builder's
return type only.

State 1 (`disabledDependencies`) and state 2 (`unprovisionedDependencies`):
add to the returned object

```ts
    durableCheckout: unavailableDurableCheckout("provider_not_durable"),
```

State 3 (`liveDependencies`): after `checkoutService` is created and BEFORE
`createWebhookHandler`, compose once and thread the processor into the handler.

```ts
  // ----- the durable card checkout surface (fail-closed) ---------------------
  // Composed here so the webhook handler can offer a verified payment event to
  // the execution that owns it before the legacy order projection. READY only
  // with a provider that can pay (the resolver returns Disabled in production
  // today) AND the managed execution store/inbox; otherwise the surface mounts
  // as precise refusals and the checkout page keeps the ordering door.
  const durableCheckout = composeDurableCheckout({
    env,
    provider: payment,
    checkout: checkoutService,
    orders: orderRepository,
    ...resolveDurableCheckoutStores(),
    inventory: inventoryReservations,
    // Same fraud gate the legacy checkout uses, when one is wired; absent means "not flagged".
    // isFraudFlagged: ...,
    // Stripe Connect account id when events must be scoped; null = platform events only.
    expectedProviderAccountId: env.STRIPE_ACCOUNT_ID ?? null,
    // Downstream after a committed order. No commerce-lane order notifier
    // exists today (only the Early Access outbox notifier); leave absent until
    // the canonical outbox mechanism is decided, or pass the notifier here.
    // onCommitted: (order) => ...,
    now,
  });

  const webhookHandler = createWebhookHandler({
    store: webhookEventStore,
    payment,
    fulfillment,
    orders: webhookOrderStoreOverOrders(orderRepository),
    // Verified payment events bind to durable executions first; unbound events
    // fall through to the legacy projection unchanged.
    executions: durableCheckout.ready ? durableCheckout.webhookProcessor : undefined,
    commerceEnabled: true,
  });
```

and add `durableCheckout,` to the object `liveDependencies` returns.

## 2. `server/index.ts`

Immediately after `registerCommerceApi(app, commerceDependencies, {...})`:

```ts
import { registerDurableCheckoutSurface } from "./research/commerce/durable-checkout-composition";

// The durable card checkout surface: config, submit, continuation
// (status/continue/cancel). Fail-closed: with the Disabled provider every door
// answers 503 and the page keeps the ordering door. Same merged guard.
registerDurableCheckoutSurface(
  app,
  { requireActiveMember: adaptGuard(requireActiveMember) },
  commerceDependencies.durableCheckout,
  { now: commerceDependencies.now },
);
```

Paths registered (none collide with `registerCommerceApi`):

- `GET  /api/research/checkout/payment-config`
- `POST /api/research/checkout/durable`
- `GET  /api/research/checkout/executions/:requestKey/continuation`
- `POST /api/research/checkout/executions/:requestKey/continue`
- `POST /api/research/checkout/executions/:requestKey/cancel`

Express matches `/api/research/checkout/durable` before any `/checkout`
handler only because the legacy door is an exact-path `POST /api/research/checkout`;
there is no wildcard under `/checkout` in `routes.ts`.

## 3. Tests to add (A's files)

`server/research/commerce/production-wiring.test.ts`:

- state 1 and state 2: `deps.durableCheckout` is `{ ready: false, reason: "provider_not_durable" }`
  and `deps.durableCheckout.clientConfig()` is `{ ok: false, code: "payment_disabled" }`;
  the resolver spies still never ran.
- state 3 with the `TestPaymentProvider` and sandbox stores under
  `NODE_ENV=test`: `ready` is `false` with `execution_store_not_durable` unless the
  test injects durable-labelled stores; with `allowInMemoryStores: true` the
  surface runs the connected journey (the composition test file already proves
  it over HTTP; the wiring test only needs to prove the readiness decision).
- with `env.NODE_ENV = "production"` and the Disabled provider: `ready` is `false`
  and `reason` is `provider_not_durable`.

`server/index.ts` route registration: the existing release-control-plane
route inventory (if it enumerates paths) gains the five paths above.

## 4. Environment the ready composition needs (staging first)

- `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED=true`, database configured (unchanged).
- `PAYMENTS_PROVIDER=stripe` with `STRIPE_SECRET_KEY` (sk_test_/rk_test_),
  `STRIPE_WEBHOOK_SECRET`, and NEW `STRIPE_PUBLISHABLE_KEY` (pk_test_). The
  browser configuration refuses a live/test mode mismatch between the
  publishable and secret keys.
- The candidate migration `supabase/candidates/20260909150000_research_checkout_executions.sql`
  applied and rehearsed (A owns), or the composition reports
  `execution_store_not_durable` only under tests; in staging the Supabase
  stores are durable by construction and the functions must exist.
- The resolver change (`resolvePaymentProvider` returning the adapter for
  `stripe`) remains A's, inside the pinned release, after the connected
  test-mode journey and B's verdict.

## 5. Remaining seams this patch does not close

- Recovery sweep for parked executions (a scheduler that calls
  `executor.recover` for old `reconciliation_required` rows): needs a
  member-agnostic list function on the store (an additive SQL function on a
  later candidate) and a scheduler slot; not in this patch.
- Canonical downstream outbox for `onCommitted`: A's decision.
- Operations visibility of executions (admin read of a member's execution by
  order id): the store has `findByOrder`; no admin route yet.
