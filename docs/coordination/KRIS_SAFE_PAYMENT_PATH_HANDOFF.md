# Kris safe payment path — strict handoff

## Authority

- Clean application authority: `a34ff0e197a15eff93b0122f6bc69b7d0b64e7df`.
- Clean typecheck successor and this branch's exact parent:
  `91367eccea94fd6e7062431bbe97d1c2e40b7b49`.
- Application authority's exact code parent:
  `4d96331587a0b6b9f08751b069eb0af2d518e0ca`.
- Successor branch: `codex/kris-safe-payment-20260813`.
- The earlier `73fa0f30daff8bd4f42877d0eec277ea8d60bd68`
  Buyer ancestry is not part of this successor.

## Scope delivered

The existing Private Early Access path remains canonical:

`cart -> quote -> durable checkout/order + invoice/payment reference -> payment instructions -> proof claim -> named-admin verification -> atomic receipt + child release -> fulfillment`

This successor closes one narrow safety gap in that path. The authenticated
payment-instructions read now consults the settlement projection from the same
durable cart store that owns checkout and settlement. It returns
`409 PAYMENT_CLOSED`, without payment destination or reference, when:

- a durable settlement already exists, even if the checkout projection is
  stale and still says `awaiting_payment`;
- the checkout is already `under_review`, `payment_verified`, or
  `payment_rejected`; or
- the checkout was superseded.

The existing opaque `customerRef` and alias ownership seam remains unchanged.
The alias is used only for ownership; neither the Roman Health account identity
nor either customer reference is serialized in the response.

## Safety invariants retained

- Checkout/order and its invoice/payment reference are durable before payable
  instructions are returned.
- Proof submission remains a claim, never payment confirmation.
- Provider/email work remains after the durable proof-claim row and retains its
  deterministic idempotency key.
- Named-admin confirmation remains the only settlement door.
- Settlement remains the atomic creator of one receipt and the child releases;
  replay returns the existing settlement and does not notify or fulfill twice.
- No automatic capture was added or enabled.
- No supplier ID, supplier SKU, provider credential, account destination, or
  private identity was added to a customer response.

## Files

- `server/research/early-access/cart/payment-instructions-route.ts`
- `server/research/early-access/cart/payment-instructions-route.test.ts`
- `server/research/early-access/register.ts`
- `docs/coordination/KRIS_SAFE_PAYMENT_PATH_HANDOFF.md`

## Explicit non-scope

No catalog purchase-mode, Roman account, semantic-intent database/migration,
Product Control, order-history, RLS/grant, payment-provider, or fulfillment
implementation file changed. No database, Docker, production SQL, payment,
deployment, tag, cart enablement, or production mutation was run.

The operator fact supplied for the release is Kristopher Lopez and the buyer
fact is Roman Health in Texas, USA. Those facts were not used to create a new
identity source, infer an organization, or widen authorization.

## Verification

Run from the repository root:

```text
npm test -- server/research/early-access/cart/payment-instructions-route.test.ts server/research/early-access/cart/cart-idempotency-ownership.test.ts server/research/early-access/proof/submission-service.test.ts server/research/early-access/cart/admin-payment-review.test.ts server/research/early-access/cart/settlement.test.ts server/research/early-access/cart/cart-settlement-adversarial.test.ts server/research/early-access/b2-b3-composition.test.ts
npm run check
```

The focused suite passed `93/93` before this handoff was written. The full
typecheck also passed with `--target ES2022 --incremental false`. The standard
check's target omission was repaired by the exact parent `91367ec`; after that
parent was applied, standard `npm run check` passed. The final handoff report
must state the exact successor SHA.

## Integration rule

Integrate in this exact order:

1. `91367eccea94fd6e7062431bbe97d1c2e40b7b49`
2. the safe-payment successor commit from this branch

Do not merge or recreate it from `73fa0f3`; the intended safe-payment change is
exactly the four files listed here.
