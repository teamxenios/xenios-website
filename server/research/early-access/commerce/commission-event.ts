/**
 * Early Access referral commission. Server only, pure, side effect free.
 *
 * This module can produce exactly one kind of live event: a HOLD. There is no payout
 * type, no payout function, and no state in which this module says money may leave. A
 * hold is a claim recorded against a payment that a human already verified, and
 * releasing it is a separate, separately reviewed decision made later.
 *
 * THE BASIS, AND WHY IT IS NOT THE ORDER TOTAL
 * --------------------------------------------
 * The hold used to be computed from `verifiedOrder.orderTotalCents`, which is the
 * PRE-DISCOUNT merchandise subtotal. On a three unit bundle the affiliate was credited
 * against 59,700 while the customer paid 47,760, so xenios was holding a commission on
 * revenue that never existed.
 *
 * The basis is now stated explicitly by the founder decision:
 *
 *     commissionBasisCents = subtotalCents - discountCents
 *
 * Shipping, tax, overpayment, unverified money, and refunded money are all excluded. It
 * is COMPUTED here from the order's own money snapshot and PERSISTED on the accrual, so
 * nothing downstream ever has to guess the basis from whatever total happens to be in
 * scope. A test asserts it agrees with `eligibleNetRevenueCents` in
 * `shared/research/distribution.ts`, which is the same founder decision expressed for
 * the partner ledger, so the two lanes cannot drift apart without a failing test.
 *
 * An overpayment cannot raise the basis by any route, because the basis never reads the
 * amount that arrived. Refunds reduce it through append-only negative adjustments in
 * `refund.ts`, never by editing the accrual.
 *
 * WHAT THE AFFILIATE SEES
 * -----------------------
 * The HOLD carries the hold amount and nothing else about the economics. The basis, the
 * rate, the policy, and therefore the order total all live on the ACCRUAL, which is the
 * server side record, so an affiliate facing surface built on the hold still cannot
 * reconstruct the business model.
 */

import { createHash } from "node:crypto";

import {
  eligibleNetRevenueCents,
  type OrderRevenueBreakdown,
} from "@shared/research/distribution";
import {
  accepted,
  isBoundedInteger,
  isBoundedText,
  isCanonicalTimestamp,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import { readEarlyAccessVerifiedOrder } from "./payment-verification";
import type { EarlyAccessVerifiedOrder } from "./payment-verification";
import type { EarlyAccessCurrency } from "./early-access-order";

/** One basis point is one hundredth of a percent. The ceiling is half the order. */
export const EARLY_ACCESS_MAX_HOLD_BASIS_POINTS = 5_000;

/**
 * The commission plan this lane follows, named and versioned so a stored accrual can
 * always state which rule computed it.
 *
 * `basis` is the shared founder decision, not a local invention. The version is a
 * fingerprint of the statement below, so editing what the basis means changes the
 * version and every historical accrual keeps naming the version it was computed under.
 */
export type EarlyAccessCommissionPolicy = Readonly<{
  commissionPolicyId: string;
  commissionPolicyVersion: string;
  basis: "subtotal_less_discount";
  statement: string;
}>;

const COMMISSION_POLICY_STATEMENT =
  "Commission basis is the merchandise subtotal less the product discount. Shipping, " +
  "tax, overpayment, unverified money, and refunded money are excluded. Rounded down.";

function policyVersionFor(policyId: string, basis: string, statement: string): string {
  const canonical = [policyId, basis, statement]
    .map((field) => `${field.length}:${field}`)
    .join("");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export const EARLY_ACCESS_COMMISSION_POLICY: EarlyAccessCommissionPolicy = Object.freeze({
  commissionPolicyId: "xenios-subtotal-less-discount",
  commissionPolicyVersion: policyVersionFor(
    "xenios-subtotal-less-discount",
    "subtotal_less_discount",
    COMMISSION_POLICY_STATEMENT,
  ),
  basis: "subtotal_less_discount" as const,
  statement: COMMISSION_POLICY_STATEMENT,
});

export type CommissionHoldFailureCode =
  | "verified_order_invalid"
  | "attribution_invalid"
  | "referral_missing"
  | "attribution_mismatch"
  | "self_referral"
  | "hold_rate_invalid"
  | "basis_invalid"
  | "hold_amount_invalid";

/**
 * The server side record of one commission: which policy, in which version, on what
 * basis amount, at what rate, for whom, against which verified payment.
 *
 * Never persisted to an affiliate facing surface. `payout: false` is structural, not
 * advisory: this lane has no type in which money has left.
 */
export type EarlyAccessCommissionAccrual = Readonly<{
  accrualId: string;
  orderReference: string;
  commissionPolicyId: string;
  commissionPolicyVersion: string;
  basis: "subtotal_less_discount";
  /** The merchandise subtotal less the product discount. Nothing else, in either direction. */
  commissionBasisCents: number;
  /** The rate, in basis points. One basis point is a hundredth of a percent. */
  commissionRate: number;
  commissionAmountCents: number;
  currency: EarlyAccessCurrency;
  affiliateId: string;
  affiliateCustomerRef: string;
  referralCode: string;
  /** Ties the accrual to the exact human decision that confirmed the money arrived. */
  verificationIdempotencyKey: string;
  accruedAt: string;
  payout: false;
}>;

export const COMMISSION_ACCRUAL_KEYS = [
  "accrualId",
  "orderReference",
  "commissionPolicyId",
  "commissionPolicyVersion",
  "basis",
  "commissionBasisCents",
  "commissionRate",
  "commissionAmountCents",
  "currency",
  "affiliateId",
  "affiliateCustomerRef",
  "referralCode",
  "verificationIdempotencyKey",
  "accruedAt",
  "payout",
] as const;

export type EarlyAccessCommissionHold = Readonly<{
  holdId: string;
  orderReference: string;
  affiliateId: string;
  referralCode: string;
  state: "held";
  holdAmountCents: number;
  currency: EarlyAccessCurrency;
  heldAt: string;
  /** Structural, not advisory: this lane has no type in which a payout exists. */
  payout: false;
}>;

export type CommissionHoldResult = CommerceResult<
  EarlyAccessCommissionHold,
  CommissionHoldFailureCode
>;

export type CommissionAccrualResult = CommerceResult<
  EarlyAccessCommissionAccrual,
  CommissionHoldFailureCode
>;

/** The exact public shape. The test asserts the hold has these keys and no others. */
export const COMMISSION_HOLD_KEYS = [
  "holdId",
  "orderReference",
  "affiliateId",
  "referralCode",
  "state",
  "holdAmountCents",
  "currency",
  "heldAt",
  "payout",
] as const;

const ATTRIBUTION_KEYS = [
  "affiliateId",
  "affiliateCustomerRef",
  "referralCode",
  "holdBasisPoints",
] as const;

export function commissionHoldIdFor(orderId: string): string {
  return `early-access-commission-hold:${orderId}`;
}

export function commissionAccrualIdFor(orderId: string): string {
  return `early-access-commission-accrual:${orderId}`;
}

/**
 * THE BASIS. Merchandise subtotal less product discount, and nothing else.
 *
 * It reads the money snapshot, never the amount that arrived, so an overpayment cannot
 * raise it and no total that happens to be in scope can be substituted for it. Shipping
 * and tax are excluded by never being added.
 */
export function commissionBasisCentsFor(verified: EarlyAccessVerifiedOrder): number {
  return verified.money.subtotalCents - verified.money.discountCents;
}

/**
 * Map a verified Early Access order onto the shared revenue breakdown.
 *
 * Used only to CHECK the basis above against `eligibleNetRevenueCents`, which is the
 * same founder decision expressed for the partner commission ledger. Store credit,
 * chargebacks, and ineligible categories are zero because this lane has none of them,
 * and stating them as zero rather than omitting them keeps the comparison honest on the
 * day any of them becomes real.
 */
export function commissionBreakdownFor(verified: EarlyAccessVerifiedOrder): OrderRevenueBreakdown {
  return {
    grossItemsCents: verified.money.subtotalCents,
    taxCents: verified.money.taxCents,
    shippingCents: verified.money.shippingCents,
    discountsCents: verified.money.discountCents,
    storeCreditAppliedCents: 0,
    refundedCents: 0,
    chargebackCents: 0,
    ineligibleCategoryCents: 0,
  };
}

/**
 * Build the commission accrual for a verified payment.
 *
 * `attribution` carries the affiliate's own customer reference so self referral is
 * detectable here rather than trusted to a caller. An affiliate cannot earn on their
 * own order, whichever identifier they present it under.
 */
export function buildCommissionAccrual(
  verifiedOrder: unknown,
  attribution: unknown,
): CommissionAccrualResult {
  // A commission exists only against money a human confirmed arrived.
  const verified = readEarlyAccessVerifiedOrder(verifiedOrder);
  if (!verified) return refused("verified_order_invalid");

  const record = readPlainRecord(attribution, ATTRIBUTION_KEYS);
  if (!record) return refused("attribution_invalid");
  if (!isSafeIdentifier(record.affiliateId)) return refused("attribution_invalid");
  if (!isSafeIdentifier(record.affiliateCustomerRef)) return refused("attribution_invalid");
  if (!isSafeIdentifier(record.referralCode)) return refused("attribution_invalid");

  if (verified.referralCode === null) return refused("referral_missing");
  // The attribution must match the code the order was actually placed with.
  if (verified.referralCode !== record.referralCode) return refused("attribution_mismatch");

  if (
    record.affiliateCustomerRef === verified.customerRef ||
    record.affiliateId === verified.customerRef
  ) {
    return refused("self_referral");
  }

  if (!isBoundedInteger(record.holdBasisPoints, 1, EARLY_ACCESS_MAX_HOLD_BASIS_POINTS)) {
    return refused("hold_rate_invalid");
  }

  const commissionBasisCents = commissionBasisCentsFor(verified);
  // A basis of nothing is not a commission of nothing, it is an order that earns none.
  if (!Number.isSafeInteger(commissionBasisCents) || commissionBasisCents < 1) {
    return refused("basis_invalid");
  }
  // The basis can never exceed the merchandise it came from, whatever the components say.
  if (commissionBasisCents > verified.money.subtotalCents) return refused("basis_invalid");

  const commissionAmountCents = Math.floor(
    (commissionBasisCents * record.holdBasisPoints) / 10_000,
  );
  // A commission that rounds to nothing is not recorded.
  if (!Number.isSafeInteger(commissionAmountCents) || commissionAmountCents < 1) {
    return refused("hold_amount_invalid");
  }
  if (commissionAmountCents > commissionBasisCents) return refused("hold_amount_invalid");

  return accepted(
    Object.freeze({
      accrualId: commissionAccrualIdFor(verified.orderId),
      orderReference: verified.orderId,
      commissionPolicyId: EARLY_ACCESS_COMMISSION_POLICY.commissionPolicyId,
      commissionPolicyVersion: EARLY_ACCESS_COMMISSION_POLICY.commissionPolicyVersion,
      basis: EARLY_ACCESS_COMMISSION_POLICY.basis,
      commissionBasisCents,
      commissionRate: record.holdBasisPoints,
      commissionAmountCents,
      currency: verified.currency,
      affiliateId: record.affiliateId,
      affiliateCustomerRef: record.affiliateCustomerRef,
      referralCode: record.referralCode,
      verificationIdempotencyKey: verified.verificationIdempotencyKey,
      accruedAt: verified.verifiedAt,
      payout: false as const,
    }),
  );
}

/** The affiliate facing projection of an accrual. Carries the amount and nothing else. */
export function commissionHoldFrom(accrual: EarlyAccessCommissionAccrual): EarlyAccessCommissionHold {
  return Object.freeze({
    holdId: commissionHoldIdFor(accrual.orderReference),
    orderReference: accrual.orderReference,
    affiliateId: accrual.affiliateId,
    referralCode: accrual.referralCode,
    state: "held" as const,
    holdAmountCents: accrual.commissionAmountCents,
    currency: accrual.currency,
    heldAt: accrual.accruedAt,
    payout: false as const,
  });
}

/** Build the commission hold for a verified payment. */
export function buildCommissionHold(
  verifiedOrder: unknown,
  attribution: unknown,
): CommissionHoldResult {
  const accrual = buildCommissionAccrual(verifiedOrder, attribution);
  if (!accrual.ok) return refused(accrual.code);
  return accepted(commissionHoldFrom(accrual.value));
}

/** Validate a stored accrual. Fails closed on any deviation. */
export function readCommissionAccrual(value: unknown): EarlyAccessCommissionAccrual | null {
  const record = readPlainRecord(value, COMMISSION_ACCRUAL_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.orderReference)) return null;
  if (record.accrualId !== commissionAccrualIdFor(record.orderReference)) return null;
  if (!isBoundedText(record.commissionPolicyId, 128)) return null;
  if (!isBoundedText(record.commissionPolicyVersion, 128)) return null;
  if (record.basis !== "subtotal_less_discount") return null;
  if (!isBoundedInteger(record.commissionBasisCents, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (!isBoundedInteger(record.commissionRate, 1, EARLY_ACCESS_MAX_HOLD_BASIS_POINTS)) return null;
  if (!isBoundedInteger(record.commissionAmountCents, 1, record.commissionBasisCents)) return null;
  // The stored commission must be the one the stored rate and basis produce.
  if (
    record.commissionAmountCents !==
    Math.floor((record.commissionBasisCents * record.commissionRate) / 10_000)
  ) {
    return null;
  }
  if (record.currency !== "USD") return null;
  if (!isSafeIdentifier(record.affiliateId)) return null;
  if (!isSafeIdentifier(record.affiliateCustomerRef)) return null;
  if (!isSafeIdentifier(record.referralCode)) return null;
  if (!isSafeIdentifier(record.verificationIdempotencyKey)) return null;
  if (!isCanonicalTimestamp(record.accruedAt)) return null;
  if (record.payout !== false) return null;

  return Object.freeze({
    accrualId: record.accrualId,
    orderReference: record.orderReference,
    commissionPolicyId: record.commissionPolicyId,
    commissionPolicyVersion: record.commissionPolicyVersion,
    basis: "subtotal_less_discount" as const,
    commissionBasisCents: record.commissionBasisCents,
    commissionRate: record.commissionRate,
    commissionAmountCents: record.commissionAmountCents,
    currency: "USD" as const,
    affiliateId: record.affiliateId,
    affiliateCustomerRef: record.affiliateCustomerRef,
    referralCode: record.referralCode,
    verificationIdempotencyKey: record.verificationIdempotencyKey,
    accruedAt: record.accruedAt,
    payout: false as const,
  });
}
