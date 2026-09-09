# Durable purchasing: three delivered units and the exact remaining seams

Session: `fable-durable-payment-20260909` (Claude Fable; optional capacity; not the production executor). Branch `claude/durable-payment-port-20260909` on the latest combined source `4c81572` (live application `c545a70e`). Worktree `C:/Users/sboad/projects/fable-probes-20260908`, pinned Node 20.19.0.

## Units (each a reviewable commit; none mounted in production composition)

1. `30e8b7a` **Provider-verified idempotent payment port** over the canonical adapter (`commerce/durable-payment-port.ts`), with the additive `DurablePaymentProvider` extension in `providers/payment.ts` and the package's coordinator/contract vendored unchanged (`commerce/durable-checkout-executor.ts`, `shared/research/durable-checkout-execution.ts`).
2. `8baaead` **Webhook-evidence binding** through the existing `createWebhookHandler` (optional `executions` dep): pure binding (`commerce/webhook-execution-binding.ts`), durable-receipt processor (`commerce/webhook-execution-processor.ts`), `execution_contention` -> 503 at the route.
3. (this commit) **Payment-authentication continuation**: `commerce/checkout-continuation.ts` (owner-only status/continue service and two guarded routes on the canonical active-member guard, subject via `subjectOf`), `PaymentSnapshot.clientSecret` from the provider read (never logged, never in a URL), client adapter `client/src/research/adapters/checkoutContinuation.ts` and the customer step `client/src/research/payments/PaymentAuthenticationStep.tsx` (Stripe.js `handleNextAction` behind an injected authenticator; principal fence on token change/unmount; explicit uncertain state with no second-payment prompt). The step is not mounted yet: the checkout page mounts it once durable checkout returns an execution request key.

## Tests actually executed (local, Node 20.19.0, no network, no Stripe test-mode or managed call)

- Server: port (19), coordinator (8), binding (18), processor (15, incl. real Stripe-signed events through `StripePaymentAdapter.verifyWebhook`), continuation service + routes (10), plus unchanged `providers/payment.test.ts`, `commerce/webhooks.test.ts`, `commerce/routes.test.ts`.
- Client: `PaymentAuthenticationStep.test.tsx` (5, jsdom).
- Full project `tsc --noEmit`: exit 0 at each commit.
- Provider mode everywhere: the REAL `StripePaymentAdapter` over an in-test model of Stripe request idempotency (`commerce/stripe-model.test-helper.ts`) and `TestPaymentProvider`. The scripted-transport PASS is local qualification only.

## Exact remaining seams (owner)

- **Canonical execution store** (A, foundation lane): persisted `CheckoutExecutionRecord` with UNIQUE (member, request key), version CAS for `claim`/`recordProvider`, atomic `commitCaptured` (order/payment evidence + reservation finalize + credit debit + outbox) and `commitCancelled`; lookups `findByProviderReference`/`findByOrder`; webhook inbox rows UNIQUE (provider_name, event_id) with payload digest and state. One reviewed migration candidate; staging rehearsal.
- **Composition** (A): `resolvePaymentProvider` still returns Disabled for Stripe on purpose; compose store + port + coordinator + webhook processor + continuation routes behind the existing readiness boundary; mount the step from the checkout page; publishable-key config route (package `payment-client-config.ts`) if not already present.
- **Provider/managed qualification**: run the connected journey against the authorized Stripe test-mode environment and managed staging; reconcile provider records with database state. Confirm Stripe's idempotency-key retention (documented 24 hours) against the execution's retry window before relying on replay-by-key for late recovery.
- **Independent review** of these Fable-authored commits before integration.

## Next command

```
node ./node_modules/vitest/vitest.mjs run server/research/commerce/checkout-continuation.test.ts server/research/commerce/webhook-execution-processor.test.ts server/research/commerce/webhook-execution-binding.test.ts server/research/commerce/durable-payment-port.test.ts server/research/commerce/durable-checkout-executor.test.ts server/research/commerce/webhooks.test.ts server/research/commerce/routes.test.ts server/research/providers/payment.test.ts client/src/research/payments/PaymentAuthenticationStep.test.tsx
```
