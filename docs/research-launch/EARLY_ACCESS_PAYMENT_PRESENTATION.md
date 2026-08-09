# Early Access payment presentation

Lane: `release/ea-payment-lane`. Base: `ba2bd2e858a08fdebce4483b4e5b60b296f9af27`.

## The gap this closes

A customer who reaches the Early Access payment screen holds a valid invoice and
still has no way to learn where to send the money. That was deliberate on both
sides of the existing code:

- `server/research/early-access/commerce/early-access-invoice.ts` issues a
  method-agnostic instruction line and is tested to contain no destination.
- `server/research/commerce/manual-order-payment-method-adapter.ts` publishes
  category codes only (`zelle`, `venmo`, `cash_app`, `paypal`, `apple_cash`,
  `ach_wire`, `other`), and `client/src/research/early-access/PaymentMethodSelector.tsx`
  states in copy that transfer details are not displayed in it.

Neither is wrong. What was missing is a second, separately reviewed projection
that turns server configuration into the exact customer-facing values needed to
complete a transfer. That projection is what this lane adds.

## What was built

| File | Role |
| --- | --- |
| `shared/research/early-access-payment-instructions.ts` | Browser-safe wire contract plus a strict decoder that fails closed |
| `server/research/early-access/commerce/payment-instructions-config.ts` | Server configuration contract, strict parser, env source, log-safe describe, presentation builder |
| `server/research/early-access/cart/payment-instructions-route.ts` | Authenticated, owner-scoped read boundary (constructed, not registered) |
| `client/src/research/early-access/EarlyAccessPaymentInstructions.tsx` | The customer-facing panel |
| `client/src/research/early-access/cart/EarlyAccessCartPayment.tsx` | Renders the panel from a new OPTIONAL `paymentInstructions` prop |

## The configuration contract

One JSON document, injected at boot through the environment variable named by
`EARLY_ACCESS_PAYMENT_INSTRUCTIONS_ENV`:

```
EARLY_ACCESS_PAYMENT_INSTRUCTIONS
```

The document is never committed, never printed, never echoed in an error, and
never reaches an unauthenticated route. Only the variable NAME appears in source.

```json
{
  "referenceLabel": "Payment reference",
  "methods": [
    {
      "code": "zelle",
      "methodName": "Zelle",
      "destinationLabel": "Zelle email",
      "destinationValue": "<the Zelle email or phone Xenios receives at>",
      "paymentUrl": null,
      "steps": ["Open your bank app.", "Send the exact amount due."],
      "copyValue": null,
      "referenceRequired": true
    }
  ]
}
```

Field rules, enforced in code:

| Field | Required | Rule |
| --- | --- | --- |
| `referenceLabel` | no | Defaults to "Payment reference". Max 64 characters |
| `methods` | yes | At least one entry, no duplicate `code` |
| `code` | yes | One of the seven canonical option codes |
| `methodName` | yes | Max 64 characters, no control or bidirectional characters |
| `destinationLabel` | no | Max 64. What the destination is called on screen |
| `destinationValue` | no | Max 128. The handle, cashtag, email, or beneficiary name |
| `paymentUrl` | no | Absolute `https` only, no embedded credentials, max 512 |
| `steps` | no | Up to 6 plain-language steps, max 240 each |
| `copyValue` | no | Max 128. Defaults to `destinationValue` |
| `referenceRequired` | yes | Boolean |

A method must give the customer something to act on: at least one of
`destinationValue`, `paymentUrl`, or a non-empty `steps`.

Refusal is all-or-nothing. One malformed method refuses the whole document and
the screen shows "Payment details are being confirmed", because a partially
resolved list of ways to send money is worse than none.

### Per-method guidance for the seven codes

| Code | `destinationValue` holds | Typical `paymentUrl` | `referenceRequired` |
| --- | --- | --- | --- |
| `zelle` | The receiving email or phone | none | true |
| `venmo` | The receiving handle | the Venmo profile link | true |
| `cash_app` | The receiving cashtag | the Cash App link | true |
| `paypal` | The receiving PayPal identifier, or leave null and use the link | the PayPal.me link | true |
| `apple_cash` | Usually null, since Apple Cash is arranged directly | none | false |
| `ach_wire` | Beneficiary NAME only | none | true |
| `other` | null | none | false |

Only what is configured is shown. An unconfigured method never appears.

### ACH and wire, specifically

`ach_wire` presentation is served ONLY to an authenticated Early Access customer
who owns the checkout, over a `no-store, private` response, and is limited by the
same 128-character `destinationValue`. Put the beneficiary name there and carry
account and routing numbers out of band. Nothing in this lane stores, encrypts,
or transmits account or routing numbers, and nothing here is a substitute for the
encrypted receiving-instructions registry in
`server/research/membership-activation/payment-methods.ts`.

## What is enforced, not merely intended

- **Configuration alone never makes a method payable.** A method appears only
  when it is configured AND the protected registry
  (`resolveEarlyAccessPaymentOptionsPresentation`) reports it enabled at the
  evaluation instant.
- **No client-side money calculation.** The server formats the amount once from
  its own integer cents. The wire contract has no cents field, so the browser
  cannot divide, sum, discount, or re-total anything. A source-level test asserts
  the panel contains no `/ 100`, no `* 100`, and no `Intl.NumberFormat`.

  One residual, deliberately left alone: the pre-existing invoice summary row in
  `EarlyAccessCartPayment.tsx` still formats `payableTotalCents` in the browser
  through the file's own `money()` helper. That predates this lane and belongs to
  the cart contract, so it was not rewritten here. Once the presentation is wired,
  `decoded.amountDueDisplay` is the authoritative amount on the screen and that
  row can be switched to it in a follow-up.
- **Server amount and server reference only.** Both come from the checkout's own
  invoice record, read server-side after ownership is proved.
- **No payment side effects.** Selecting, copying, or opening a link marks
  nothing received, settles no checkout, issues no receipt, releases no supplier,
  and creates no supplier outbox entry. The order stays `awaiting_payment` until
  a named admin verifies it. The panel has no form and no submit control.
- **Unauthenticated access is blocked.** 401 without a session, 404 for a
  checkout the caller does not own (the same answer an unknown checkout gets, so
  the route cannot be used to probe for orders), 503 on any configuration or
  registry problem, and never a partial list.
- **No sensitive configuration logging.** Neither the config module nor the route
  contains a `console` call. `describeEarlyAccessPaymentInstructionsConfig`
  exists so an operator can log that configuration loaded (codes and counts)
  without logging what it contained.

## Founder configuration required

None of the following exists in the repository, and none can be invented:

1. The Zelle receiving email or phone.
2. The Cash App cashtag and its link.
3. The Venmo handle and its profile link.
4. The PayPal identifier or PayPal.me link.
5. Whether Apple Cash is offered, and how it is arranged.
6. The ACH beneficiary name to display (account and routing numbers stay out of
   band).
7. Which of the seven methods are actually approved and enabled in the protected
   method registry.

Compose these into the JSON document above and set
`EARLY_ACCESS_PAYMENT_INSTRUCTIONS` in the deployment's environment. Until then
the screen truthfully says details are being confirmed.

## Integration still owed (TOP)

This lane deliberately registers nothing, because registration and the
research-wall admission entry are one decision and TOP owns final integration.
Four steps, in this order.

### 1. Register the route

In `server/research/early-access/register.ts`, beside the existing cart mounts
and AFTER the literal cart paths (a literal segment placed after
`:cartCheckoutNumber` is swallowed by it):

```ts
import {
  createEarlyAccessCartPaymentInstructionsRoute,
  EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH,
} from "./cart/payment-instructions-route";
import { createEnvPaymentInstructionsConfigSource } from "./commerce/payment-instructions-config";

const paymentInstructions = createEarlyAccessCartPaymentInstructionsRoute({
  identity,
  checkouts: cartStore.checkouts,
  config: createEnvPaymentInstructionsConfigSource(),
  methodRegistry,
  clock,
});

app.get(EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH, (req, res) => {
  void paymentInstructions(
    {
      cookieHeader: req.headers.cookie,
      cartCheckoutNumber: req.params.cartCheckoutNumber,
    },
    res as unknown as CartResponsePort,
  );
});
```

Add `EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH` to
`EARLY_ACCESS_CART_API_PATHS`. Mount it inside the same
`earlyAccessCartEnabled()` branch as the other cart routes, so a disabled cart
has no extra surface to probe.

`methodRegistry` and `clock` are the protected manual-payment registry port and
the server clock. If the cart composition root does not have them yet, that is
the one genuinely new dependency this route introduces, and it must be the
protected registry, never request JSON.

### 2. Admit the path through the research wall

Without this the earlier gateway in `server/research/index.ts` answers first and
the route is unreachable in production, which reads as broken rather than closed.
The path carries a checkout number, so anchor it like the existing order routes
rather than adding a bare prefix:

```ts
const EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS =
  /^\/early-access\/cart\/XEC-[A-Z0-9]{16,40}\/payment-instructions$/;
```

and admit it for `GET` and `HEAD` only, alongside `EARLY_ACCESS_ORDER_READ`. The
route owns the stronger gate downstream: it resolves the Early Access session,
proves the caller owns the checkout, and answers 404 otherwise, so reaching it
through the wall reaches a refusal, never payment details.

### 3. Fetch the presentation in the journey

In `client/src/research/early-access/cart/EarlyAccessMultiCartJourney.tsx`, when
the journey enters the `payment` step and a `checkout` exists:

```ts
import { loadEarlyAccessPaymentInstructions } from "../../adapters/earlyAccessPaymentInstructions";

const [paymentInstructions, setPaymentInstructions] = useState<unknown>(undefined);

// after checkout is set, or when step becomes "payment"
void loadEarlyAccessPaymentInstructions(checkout.cartCheckoutNumber).then(
  setPaymentInstructions,
);
```

The adapter never throws and never returns a partial value: every denial,
404, 503, network failure, or malformed body resolves to
`{ state: "unresolved" }`.

### 4. Pass it to the payment screen (the only edit inside the TOP-owned file)

```diff
       {step === "payment" && checkout ? (
         <EarlyAccessCartPayment
           checkout={checkout}
           copied={copied}
+          paymentInstructions={paymentInstructions}
           onCopy={() => {
```

The prop is optional. Until step 4 lands, the payment screen renders exactly as
it does today except for a panel that says details are being confirmed.
