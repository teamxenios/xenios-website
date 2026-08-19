/**
 * Referral commission for a settled CART checkout. Server only, pure, side
 * effect free — the same posture as commerce/commission-event.ts, whose policy,
 * ceiling, id derivations, hold projection and stored-shape validator this
 * module reuses rather than restates.
 *
 * WHY THIS IS NOT `buildCommissionHold` CALLED WITH A DRESSED-UP CART.
 *
 * The single-product builder authenticates its money against an
 * `EarlyAccessVerifiedOrder`, a projection with exactly one product, one
 * variant, one sku and one quantity. A cart checkout has N children; feeding
 * the builder a fabricated single line to satisfy its validator would put an
 * invented product on a money record, which is precisely the kind of smuggling
 * that validator exists to refuse. So this module computes the SAME founder
 * basis from the cart's own immutable invoice, applies the SAME refusals in the
 * SAME order, and then proves the result by running it through
 * `readCommissionAccrual` — the existing fail-closed validator — before
 * deriving the hold with the existing `commissionHoldFrom`. The two lanes can
 * therefore disagree about nothing an accrual actually states.
 *
 * THE BASIS is the locked founder decision, unchanged:
 *
 *     commissionBasisCents = invoice.subtotalCents - invoice.discountCents
 *
 * Shipping, tax, overpayment, unverified money and refunded money are excluded
 * by never being read. A test asserts agreement with `eligibleNetRevenueCents`,
 * the same decision expressed for the partner ledger.
 *
 * WHO IS CREDITED. The checkout's stored attribution says WHO earned the
 * order; the durable referral grant (re-resolved by the caller at settlement
 * time) says at WHAT RATE and against WHICH affiliate handles. Both must agree:
 * an attribution whose affiliate no longer matches the grant is recorded as
 * earning nothing, never as earning for whoever the grant now names.
 */

import {
  EARLY_ACCESS_MAX_HOLD_BASIS_POINTS,
  EARLY_ACCESS_COMMISSION_POLICY,
  commissionAccrualIdFor,
  commissionHoldFrom,
  readCommissionAccrual,
  type EarlyAccessCommissionAccrual,
  type EarlyAccessCommissionHold,
} from "../commerce/commission-event";
import type { EarlyAccessReferralAttribution } from "../routes/ports";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";

/**
 * Ties the accrual to the one human decision that settles this checkout. A
 * cart checkout settles at most once, so this key is deterministic per
 * checkout, exactly as the single lane's verification key is per order.
 */
export function cartSettlementVerificationKey(cartCheckoutNumber: string): string {
  return `xea-cart-settlement:${cartCheckoutNumber}`;
}

export type CartCommissionRefusal =
  | "attribution_absent"
  | "grant_missing"
  | "attribution_mismatch"
  | "self_referral"
  | "hold_rate_invalid"
  | "basis_invalid"
  | "hold_amount_invalid"
  | "accrual_invalid";

export type CartCommissionDecision =
  | Readonly<{
      commission: true;
      accrual: EarlyAccessCommissionAccrual;
      hold: EarlyAccessCommissionHold;
    }>
  | Readonly<{ commission: false; reason: CartCommissionRefusal }>;

export type CartCommissionInput = Readonly<{
  checkout: EarlyAccessCartCheckoutRecord;
  /** The durable grant re-resolved at settlement time, or null when revoked. */
  grant: EarlyAccessReferralAttribution | null;
  /** The settlement instant the caller already validated. Canonical ISO 8601. */
  settledAt: string;
}>;

function refusal(reason: CartCommissionRefusal): CartCommissionDecision {
  return Object.freeze({ commission: false as const, reason });
}

/**
 * Decide the commission for one settled cart checkout.
 *
 * Every refusal means "this settlement earns no commission", never "this
 * settlement must not happen": the money has arrived and a human verified it,
 * and refusing to record THAT because an affiliate credit did not compute is
 * the wrong failure to choose. The caller settles without a commission on any
 * refusal here, matching the single-product lane exactly.
 */
export function decideCartCommission(input: CartCommissionInput): CartCommissionDecision {
  const { checkout, grant } = input;
  const attribution = checkout.attribution;
  if (attribution === null || attribution === undefined) return refusal("attribution_absent");
  // A revoked grant resolves to nothing, and silence is the safe answer about
  // money: the order stays settled, the affiliate earns nothing.
  if (grant === null) return refusal("grant_missing");
  // The credit must go to the affiliate the ORDER was placed under. If the
  // grant has since been re-pointed at someone else, nobody earns.
  if (grant.affiliateId !== attribution.affiliateId) return refusal("attribution_mismatch");
  if (
    grant.affiliateCustomerRef === checkout.customerRef ||
    grant.affiliateId === checkout.customerRef
  ) {
    return refusal("self_referral");
  }
  if (
    !Number.isSafeInteger(grant.holdBasisPoints) ||
    grant.holdBasisPoints < 1 ||
    grant.holdBasisPoints > EARLY_ACCESS_MAX_HOLD_BASIS_POINTS
  ) {
    return refusal("hold_rate_invalid");
  }

  // THE BASIS. Merchandise subtotal less product discount, read from the
  // immutable invoice snapshot, never from the amount that arrived. Shipping
  // and tax are excluded by never being added.
  const invoice = checkout.invoice;
  const commissionBasisCents = invoice.subtotalCents - invoice.discountCents;
  if (!Number.isSafeInteger(commissionBasisCents) || commissionBasisCents < 1) {
    return refusal("basis_invalid");
  }
  if (commissionBasisCents > invoice.subtotalCents) return refusal("basis_invalid");

  const commissionAmountCents = Math.floor(
    (commissionBasisCents * grant.holdBasisPoints) / 10_000,
  );
  if (!Number.isSafeInteger(commissionAmountCents) || commissionAmountCents < 1) {
    return refusal("hold_amount_invalid");
  }
  if (commissionAmountCents > commissionBasisCents) return refusal("hold_amount_invalid");

  const accrual: EarlyAccessCommissionAccrual = Object.freeze({
    accrualId: commissionAccrualIdFor(checkout.cartCheckoutNumber),
    orderReference: checkout.cartCheckoutNumber,
    commissionPolicyId: EARLY_ACCESS_COMMISSION_POLICY.commissionPolicyId,
    commissionPolicyVersion: EARLY_ACCESS_COMMISSION_POLICY.commissionPolicyVersion,
    basis: EARLY_ACCESS_COMMISSION_POLICY.basis,
    commissionBasisCents,
    commissionRate: grant.holdBasisPoints,
    commissionAmountCents,
    currency: invoice.currency,
    affiliateId: grant.affiliateId,
    affiliateCustomerRef: grant.affiliateCustomerRef,
    referralCode: grant.referralCode,
    verificationIdempotencyKey: cartSettlementVerificationKey(checkout.cartCheckoutNumber),
    accruedAt: input.settledAt,
    payout: false as const,
  });

  // PROVEN, NOT ASSUMED. The existing fail-closed reader is the authority on
  // what a stored accrual may look like; an accrual it would refuse to read
  // back is an accrual this lane must refuse to write.
  const validated = readCommissionAccrual(accrual);
  if (validated === null) return refusal("accrual_invalid");

  return Object.freeze({
    commission: true as const,
    accrual: validated,
    hold: commissionHoldFrom(validated),
  });
}
