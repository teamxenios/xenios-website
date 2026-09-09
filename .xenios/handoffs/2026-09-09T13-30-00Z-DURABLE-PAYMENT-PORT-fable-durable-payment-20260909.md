# Durable purchasing unit: provider-verified idempotent payment port

Session: `fable-durable-payment-20260909` (Claude Fable; optional capacity, not the production executor). Branch: `claude/durable-payment-port-20260909`, based on the latest combined source `4c81572` (application `c545a70e` live). Worktree: `C:/Users/sboad/projects/fable-probes-20260908` (own `npm ci`, pinned Node 20.19.0).

## What this delivers

The canonical Stripe adapter was real but structurally disabled by `resolvePaymentProvider` because nothing could reconcile a provider success across a lost response, a restart or a duplicate submission. The package's recovery coordinator (`createDurableCheckoutExecutor`) defined the two ports it needs and supplied neither. This slice supplies the **payment side** on the canonical boundary, with recovery tests through the real Stripe adapter over a scripted transport.

Files (new unless noted):

- `server/research/providers/payment.ts` (modified, additive): `PaymentPending`, `PaymentSnapshot`, `DurablePaymentProvider` (adds `createAuthorizationOrPending` and `retrievePayment`), `supportsDurableExecution`. Implemented on Disabled (refuses), Test (with `requireCustomerAction`/`completeCustomerAction` hooks that model 3DS) and Stripe (pending keeps the reference and client secret; snapshot verifies id, currency, amounts and echoes server-authored metadata). `createAuthorization` keeps its exact contract and messages; it now delegates to the pending-aware call and flattens pending into the same refusal as before. The existing 1,142-line adapter suite passes unchanged.
- `shared/research/durable-checkout-execution.ts` and `server/research/commerce/durable-checkout-executor.ts`: the package contract and coordinator, reformatted, behavior unchanged, **not mounted** anywhere.
- `server/research/commerce/durable-payment-port.ts`: `createProviderVerifiedPaymentPort(provider)` implementing `IdempotentCheckoutPaymentPort` (authority `provider_verified_idempotent_execution_v1`). Authorize uses the record's stable `authorizationKey` as the provider idempotency key and the record's provider-hosted `pm_` reference; capture uses the record's exact amount; reconcile reads the existing payment back by reference, or replays the same creation key when the create response was lost (an idempotent provider answers with the original payment); cancel reports zero-capture evidence or, when refused, the read-back truth. Evidence counts only when it names the record's amount, currency, member and order. Transport failures, 5xx, rate limits and adapter-refused evidence map to `unknown`; `refused` with `definitiveNoEffect: true` only when no effect was possible (disabled, misconfigured, invalid binding).
- `server/research/commerce/durable-payment-port.test.ts` (19 cases) and `durable-checkout-executor.test.ts` (8 cases, ported from the package's node tests).

## Tests actually executed (local, no network, no managed service)

`vitest run` on the two new files plus `server/research/providers/payment.test.ts`: **165/165**. Cases include: same request retried after a lost create response replays the same key and recovers the same payment (one key ever, one intent); same key with a changed body is refused by the provider and never authorizes; concurrent duplicate coordinator runs produce one provider authorization; provider 5xx and 429 map to unknown; 3DS surfaces `action_required` with the reference and reconciles to authorized after completion; a lost capture response resolves from the read-back as captured and a retry never captures twice; cancel of an uncaptured authorization yields zero-capture evidence and a refused cancel after capture reports the captured money; evidence naming another order, member, amount or reference is unknown; another principal cannot resume; an amount that drifted from the provider's payment is never captured. Provider mode: the real `StripePaymentAdapter` over an in-test transport model of Stripe request idempotency, plus `TestPaymentProvider`. **No Stripe test-mode call was made**: live-key qualification remains a release prerequisite.

## What still stands between this and live purchasing

- The **canonical transaction store** (`CanonicalCheckoutExecutionStore`: execution records with version CAS, atomic commit of order/payment evidence, reservation finalize, credit debit, outbox) needs schema and belongs to A's foundation lane; this port is ready to be composed under it.
- Composition: the resolver still returns Disabled for Stripe on purpose; nothing here changes `resolvePaymentProvider`, routes or flags. Checkout continuation for `action_required` (returning the client secret to the customer's client) is a route/UI slice.
- Webhook verification/dedup already exists (`commerce/webhooks.ts` atomic apply store); binding webhook evidence to execution records is a follow-on unit.
- Independent review of this authored code is required before integration (A reviews Fable-authored implementation per the review policy).

## Next command for whoever continues

```
node ./node_modules/vitest/vitest.mjs run server/research/commerce/durable-payment-port.test.ts server/research/commerce/durable-checkout-executor.test.ts server/research/providers/payment.test.ts
```
