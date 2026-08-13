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

## Superseded local candidates

Do not integrate these outputs as quantity authority without recreating them under the new founder decision:

- `098e26df757e6a94d3ea1f9c1ece2035f61443d2` (`codex/xenios-quantity-1-50-candidate`) retains direct maximum 20 and routes 21 through 50 to manual review.
- `7977aaa2074d6b51089d6803b9f12d521c83ba59` (`codex/pack09-q50-evidence-20260812`) explicitly records the same 20-direct/21–50-manual model.
- `supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql` is the older 1-through-20 durable band and cannot represent the new final policy by itself.

The successor must preserve the existing canonical architecture while changing the single shared quantity authority, Product Control effective limit, cart/order/checkout/release validation, durable database candidate, and review evaluator together. It must prove 1, 20, 21, 49, and 50 are accepted subject to real non-quantity rules; 51 is refused; and neither 21 nor 50 receives a quantity-only review trigger. No production SQL or deployment is authorized by this document.

## Legal state consumed by Pack 02

Founder Binding is complete and its postcheck passed. Pack 02 must never recreate or replay Founder Binding. The remaining legal chain is four native signatures, agreement attestation, proof door, deploy/production smoke, and then `FINAL_EA_FAST_FOLLOW_BASE`. Tebra is a fast-follow dependency and is not a blocker for the Research Early Access commercial launch.
