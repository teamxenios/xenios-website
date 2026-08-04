/**
 * Early Access referral commission hold. Server only, pure, side effect free.
 *
 * This module can produce exactly one kind of event: a HOLD. There is no payout type,
 * no payout function, and no state in which this module says money may leave. A hold
 * is a claim recorded against a payment that a human already verified, and releasing
 * it is a separate, separately reviewed decision made later.
 *
 * The hold carries the hold amount and nothing else about the economics. The order
 * total, the unit price, the commission rate, the cost, and the margin all stay on the
 * server side of this boundary, so an affiliate facing surface built on this event
 * cannot reconstruct the business model.
 */

import {
  accepted,
  isBoundedInteger,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import { readEarlyAccessVerifiedOrder } from "./payment-verification";
import type { EarlyAccessCurrency } from "./early-access-order";

/** One basis point is one hundredth of a percent. The ceiling is half the order. */
export const EARLY_ACCESS_MAX_HOLD_BASIS_POINTS = 5_000;

export type CommissionHoldFailureCode =
  | "verified_order_invalid"
  | "attribution_invalid"
  | "referral_missing"
  | "attribution_mismatch"
  | "self_referral"
  | "hold_rate_invalid"
  | "hold_amount_invalid";

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

/**
 * Build the commission hold for a verified payment.
 *
 * `attribution` carries the affiliate's own customer reference so self referral is
 * detectable here rather than trusted to a caller. An affiliate cannot earn on their
 * own order, whichever identifier they present it under.
 */
export function buildCommissionHold(
  verifiedOrder: unknown,
  attribution: unknown,
): CommissionHoldResult {
  // A hold exists only against money a human confirmed arrived.
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

  const holdAmountCents = Math.floor((verified.orderTotalCents * record.holdBasisPoints) / 10_000);
  // A hold that rounds to nothing is not recorded as a hold.
  if (!Number.isSafeInteger(holdAmountCents) || holdAmountCents < 1) {
    return refused("hold_amount_invalid");
  }
  if (holdAmountCents > verified.orderTotalCents) return refused("hold_amount_invalid");

  return accepted(
    Object.freeze({
      holdId: commissionHoldIdFor(verified.orderId),
      orderReference: verified.orderId,
      affiliateId: record.affiliateId,
      referralCode: record.referralCode,
      state: "held" as const,
      holdAmountCents,
      currency: verified.currency,
      heldAt: verified.verifiedAt,
      payout: false as const,
    }),
  );
}
