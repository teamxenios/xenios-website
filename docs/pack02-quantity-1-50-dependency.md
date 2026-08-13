# Pack 02 dependency: normal order quantity 1 through 50

Founder decision effective 2026-08-13: normal order quantity is 1 through 50. Quantity alone never requires manual review anywhere in that range. Real non-quantity review rules—such as fraud, eligibility, product control, supplier readiness, inventory, payment, or another explicit rule—remain authoritative.

## Pack 02 behavior

Pack 02 does not own cart, checkout, pricing, release, or order creation. It projects canonical order history and creates organization-scoped request-again intents. This lane therefore:

- accepts and displays canonical line quantities 21 and 50 as ordinary quantities;
- carries canonical `reviewTriggers` with every projected order;
- refuses and audits a `manual_review` projection when every line is within 1 through 50 and the only trigger is the superseded `unusual_quantity` trigger;
- preserves manual review when a real non-quantity trigger exists;
- never converts a request-again intent directly into an order, charge, reservation, or release;
- keeps organization ownership checks ahead of every dashboard and reorder operation.

## Canonical authority composed in fusion

Pack 02 does not take ownership of these other-lane changes. The actual fusion base named in `PACK02_DEPLOYMENT_GATE_RESOLVED.json` already contains and reverifies the shared authority instead of reimplementing it here:

- `5e9ac687d95841529d75deb2d1d580d91380aebd` is ancestral and supplies the canonical Q50 authority. It sets the Early Access durable/runtime maximum to 50, rejects 51, and removes quantity-only review from 1 through 50. Its database candidate remains unapplied.
- Buyer Commerce `6f4c7517e762c484458d0ef9d935e518ff1398ee` is ancestral and composes the canonical cart, checkout, and `research_orders` boundaries.
- `b459c6edc242bba522441979808c49378a209395` is ancestral and removes the remaining hidden quantity caps from checkout, cart UI, payment verification, and supplier release without bypassing non-quantity restrictions.

Focused fusion verification covers persistent-cart, subscription, checkout, order, payment, release, Product Control, and Pack 02 projection boundaries. Pack 02 still does not claim authority over those systems from its account projection alone.

## Superseded local candidates

Do not integrate these outputs as quantity authority without recreating them under the new founder decision:

- `098e26df757e6a94d3ea1f9c1ece2035f61443d2` (`codex/xenios-quantity-1-50-candidate`) retains direct maximum 20 and routes 21 through 50 to manual review.
- `7977aaa2074d6b51089d6803b9f12d521c83ba59` (`codex/pack09-q50-evidence-20260812`) explicitly records the same 20-direct/21–50-manual model.
- `supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql` is the older 1-through-20 durable band and cannot represent the new final policy by itself.

Final fusion must preserve the existing canonical architecture while changing the single shared quantity authority, Product Control effective limit, cart/order/checkout/release validation, durable database candidate, and review evaluator together. It must prove 1, 20, 21, 49, and 50 are accepted subject to real non-quantity rules; 51 is refused; and neither 21 nor 50 receives a quantity-only review trigger. No production SQL or deployment is authorized by this document.

## Legal state consumed by Pack 02

Founder Binding is complete and its postcheck passed. Pack 02 must never recreate or replay Founder Binding. Legal acceptance and deployment-wide release gates remain external to Pack 02 and are not replaced by this composition resolution. The previously named `FINAL_EA_FAST_FOLLOW_BASE` ref did not exist at resolution time and is not used as Pack 02's recreation target; Pack 02 neither creates nor requires a fake tag. Tebra remains a fast-follow dependency rather than a Pack 02 account-composition blocker.
