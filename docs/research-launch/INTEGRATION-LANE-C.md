# Lane C integration: EA cart as the canonical launch order

Branch: `lane/launch-ea-cart-order` (on top of `fix/phase-zero-assisted-order-wiring-20260818` @ c287b82).

Lane C delivered, entirely inside its owned paths:

1. **Attribution at checkout** — `cart/attribution-adapter.ts` (`ReferralGrantCartAttribution`) over the durable referral grant. Needs ONE wiring line in `register.ts` (§1).
2. **Grant writer** — `SupabaseEarlyAccessReferralGrantWriter` in `persistence/commerce-ports.ts`, exported for the customer-bind seam (§2).
3. **Commission hold at cart settlement** — `cart/commission.ts` + extended `cart/settlement.ts`, atomic-or-refused through the candidate RPC. Needs ONE dependency added to `cartSettlementDeps` in `register.ts` (§3), and the founder-gated SQL in §5.
4. **Member-visible cart orders** — `orders/cart-order-history.ts` + extended `orders/member-order-history.ts`. Already wired in Lane-C-owned `persistence/production-deps.ts`, gated on `RESEARCH_EARLY_ACCESS_CART_HISTORY_ENABLED === "true"` (§4). No lead edit needed.
5. **Candidate SQL** — three founder-gated sets under `supabase/candidates/`, apply order in §5.

Nothing below is live until the lead applies §1 and §3 and the founder acts on §4–§5. Every code path fails closed (named refusal / structurally absent section) until then.

---

## §1. register.ts — attribution port on the cart checkout route

At the `createEarlyAccessCartCheckoutRoute` construction (`server/research/early-access/register.ts:1105-1116` at the base SHA), which today constructs WITHOUT an attribution port so `NO_ATTRIBUTION` stores null on every checkout.

Add the import (register.ts import block):

```ts
import { ReferralGrantCartAttribution } from "./cart/attribution-adapter";
```

Replace the construction at :1105-1116 with (only the `attribution:` line is new):

```ts
    const checkoutCart = createEarlyAccessCartCheckoutRoute({
      identity: cartIdentity,
      quotes: cartStore,
      checkouts: cartStore,
      audit: {
        async record(event) {
          await audit.record(event as never);
        },
      },
      // Attribution from the durable referral grant and from nothing else.
      // `commerce.referrals` is the SAME SupabaseEarlyAccessReferralResolver
      // instance the single-product settlement lane already trusts
      // (persistence/production-deps.ts:261). No grant / expired grant / any
      // read of browser input => null => the order places unattributed.
      attribution: new ReferralGrantCartAttribution({ referrals: commerce.referrals }),
      now,
      notify: cartNotifier,
    });
```

`commerce` is register.ts's existing `EarlyAccessOrderRouteDependencies` binding (register.ts:855), whose `referrals` is `options.referrals ?? new NoEarlyAccessReferrals()` (register.ts:870) — so the line is safe in every composition: with no durable resolver wired, `NoEarlyAccessReferrals` answers null and every checkout places unattributed, which is the current behaviour exactly.

Behaviour: attribution is a snapshot written into the checkout record by the existing commit RPC (no schema change). A resolver failure fails the checkout 503 (honest), never a silently-unattributed order.

## §2. Customer-bind seam — the grant writer

When the lead's seam receives the **opaque verified-ref string** from the partners lane (the cookie contract is the partners lane's; Lane C consumes only the already-verified result), record the arrival durably:

```ts
import { SupabaseEarlyAccessReferralGrantWriter } from "./research/early-access/persistence/commerce-ports";

const grantWriter = new SupabaseEarlyAccessReferralGrantWriter(run); // same `run` as every persistence adapter

// At the point where the seam has BOTH a server-resolved customerRef and the
// server-verified partner referral facts (never from a request body):
const outcome = await grantWriter.grant({
  customerRef,              // the eac_… handle the identity seam resolved
  referralCode,             // from the verified-ref resolution, server side
  affiliateId,              // idem
  affiliateCustomerRef,     // the affiliate's own eac_… handle, server side
  holdBasisPoints,          // the partner's configured rate, 1..5000
});
// outcome: "granted" (idempotent upsert — safe to retry) | "input_invalid"
// (named refusal, nothing sent to the DB). A driver fault throws the opaque
// EarlyAccessPersistenceError naming research_early_access_grant_referral.
```

The RPC (`research_early_access_grant_referral`) is ALREADY DEPLOYED (migration 20260804120000) — this seam call needs no SQL. One grant per customer; re-granting replaces attribution and clears revocation.

## §3. register.ts — referrals on the cart settlement deps

In `cartSettlementDeps` (register.ts:1261-1285 at the base SHA) add one line:

```ts
    const cartSettlementDeps = {
      checkouts: cartStore,
      settlements: cartStore,
      // Re-resolves the durable grant at settlement time so the commission
      // rate and affiliate handles come from the server's CURRENT record.
      // Same instance as §1. Without this line, settling an ATTRIBUTED cart
      // checkout refuses `commission_persistence_unavailable` (503) rather
      // than silently dropping the affiliate's hold — that refusal is the
      // designed pre-wiring state, not a bug.
      referrals: commerce.referrals,
      audit: { /* unchanged */ },
      ...(options.cartPaymentReview ? { submissionEvidence: options.cartPaymentReview } : {}),
    };
```

No other settlement change: unattributed checkouts settle through the unchanged deployed RPC. Attributed checkouts additionally require §5-A applied (the store calls `research_early_access_commit_cart_settlement_with_commission`; while absent, the call throws the named persistence error and the door answers 503 with nothing written).

## §4. Founder switch — member-visible cart orders

Already wired (Lane C owns `persistence/production-deps.ts`). Founder sequence, strictly in this order:

1. Apply §5-B (the read RPC).
2. Set env `RESEARCH_EARLY_ACCESS_CART_HISTORY_ENABLED=true` and restart.

Before both: the cart section of member order history is structurally absent (placements-only, today's behaviour). Setting the flag WITHOUT the SQL makes every member history read fail honestly — do not set the flag first.

## §5. Founder-gated candidate SQL (apply order)

All under `supabase/candidates/`, each with `_precheck` / `_postcheck` siblings following the `20260815_research_assisted_order_bridge*` pattern. Run precheck → expect `APPLY_READY`; apply; run postcheck → expect `APPLIED_OK`. None of these may be auto-applied; production mutations require Samuel's current explicit approval every time.

| Order | File | What it does | Unblocks |
|---|---|---|---|
| A | `20260819_research_ea_cart_commission_settlement.sql` | Cart commission ledger (`research_early_access_cart_commission_events`, append-only, state `held` only, forced RLS, zero table grants) + `research_early_access_commit_cart_settlement_with_commission` (wraps the DEPLOYED M62 settlement RPC; settlement + hold in one transaction, both-or-neither; malformed commission refuses before anything settles). | Settling ATTRIBUTED cart checkouts (§3). |
| B | `20260819_research_ea_cart_member_order_history.sql` | Read-only, STABLE, security-definer `research_early_access_cart_checkouts_for_customers(text[])`, service_role-only, M67 pattern; each row carries the M62 binding provenance (`verified_link` / `admin_attested` / null). | Member-visible cart orders (§4). |
| C | `20260819_research_ea_cart_settlement_canonical_txn.sql` | Closes `EARLY_ACCESS_SETTLEMENT_NEEDS_CANONICAL_TXN_COLUMN`: STORED GENERATED `canonical_transaction_id` on `research_early_access_cart_settlements` + unique index, so canonical uniqueness holds at the TABLE, not only at the M62 wrapper. Precheck refuses on pre-existing duplicate canonical forms. | Hardens the money identity now feeding commissions. Independent; apply any time after precheck passes. |

A and B are independent of each other; C is independent of both. The order above is simply the launch-value order.

## Refusal vocabulary added (for the lead's dashboards)

- `commission_persistence_unavailable` (503 at the cart confirm door): attributed checkout + missing referrals wiring or missing candidate RPC A. Nothing written.
- `commission_invalid` (409): candidate RPC A refused the commission record it was handed. Nothing settled, nothing written.

## What Lane C did NOT touch

`register.ts`, `routes/admin-routes.ts`, `server/index.ts`, `server/research/index.ts`, `server/research/partners/**`, `client/**`, `shared/research/early-access-cart.ts` (no change was needed — the attribution shape and checkout record already carried everything), `supabase/migrations/**`, `.xenios/**`, `docs/coordination/**`.
