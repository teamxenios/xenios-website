/**
 * Early Access refunds and the commission they reverse. Server only, pure, side effect
 * free.
 *
 * THREE HARD RULES
 * ----------------
 * 1. THE CEILING IS `verifiedAmountCents - completedRefundsCents`. Not the merchandise
 *    subtotal, and not the payable total. It is bounded by the amount a named human
 *    confirmed actually arrived, less everything already refunded. Refunding more than
 *    was received is xenios paying a customer money it never took. This cuts both ways:
 *    a discounted order cannot be refunded above what was actually paid, and an
 *    overpayment can legitimately need refunding MORE than the order was ever worth.
 * 2. GOING ABOVE THE PAYABLE TOTAL NEEDS THE OVERPAYMENT PATH. The only reason to refund
 *    more than the order cost is that the customer sent more than it cost, and that is a
 *    recorded decision by a named human, not something a refund may assume.
 * 3. THE ORIGINAL COMMISSION IS NEVER REWRITTEN. A refund appends a NEGATIVE adjustment
 *    referencing the accrual it reduces. The accrual keeps stating what was accrued and
 *    on what basis, so an audit can replay the whole history rather than read a total
 *    that was quietly edited. This is the same append-only shape the partner commission
 *    ledger in `server/research/partners/commissions.ts` already uses.
 *
 * The reversal is proportional to how much of the eligible basis went back, and it
 * rounds UP, so a partial refund can never leave xenios holding a commission on revenue
 * it returned. A refund at or beyond the basis reverses the whole commission.
 *
 * Nothing here moves money. A refund record is a decision; executing it is a separate,
 * separately reviewed step outside this domain.
 */

import {
  accepted,
  isBoundedInteger,
  isBoundedText,
  isCanonicalTimestamp,
  isNotBefore,
  isOneOf,
  isSafeIdentifier,
  readPlainArray,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import { EARLY_ACCESS_MAX_MONEY_CENTS, type EarlyAccessCurrency } from "./order-money";
import {
  EARLY_ACCESS_VERIFIER_ROLES,
  type EarlyAccessVerifierRole,
} from "./payment-reconciliation";
import {
  exceptionAuthorizesExcessRefund,
  readOverpaymentException,
} from "./payment-exception";
import { readEarlyAccessVerifiedOrder } from "./payment-verification";
import { readCommissionAccrual, type EarlyAccessCommissionAccrual } from "./commission-event";

/** Bounded like every other chain here. More refunds than this is an escalation. */
export const EARLY_ACCESS_MAX_REFUNDS_PER_ORDER = 8;

const MIN_REASON_LENGTH = 8;
const MAX_REASON_LENGTH = 500;

export type RefundFailureCode =
  | "input_invalid"
  | "verified_order_invalid"
  | "actor_invalid"
  | "forbidden"
  | "reason_insufficient"
  | "amount_invalid"
  | "currency_mismatch"
  | "refund_history_invalid"
  | "refund_limit_reached"
  | "refund_exceeds_verified_paid"
  | "excess_refund_not_authorized"
  | "timestamp_invalid";

/** One refund decision, exactly as it is recorded. Append only. */
export type EarlyAccessRefund = Readonly<{
  refundId: string;
  orderId: string;
  amountCents: number;
  currency: EarlyAccessCurrency;
  /** What the human confirmed arrived, carried so the bound can be checked on the row. */
  verifiedPaidCents: number;
  /** Everything already refunded before this one. */
  priorRefundedCents: number;
  reason: string;
  actorId: string;
  actorRole: EarlyAccessVerifierRole;
  refundedAt: string;
  /** One based position in this order's trail. Corrections append, never overwrite. */
  sequence: number;
}>;

export const EARLY_ACCESS_REFUND_KEYS = [
  "refundId",
  "orderId",
  "amountCents",
  "currency",
  "verifiedPaidCents",
  "priorRefundedCents",
  "reason",
  "actorId",
  "actorRole",
  "refundedAt",
  "sequence",
] as const;

export type RefundResult = CommerceResult<EarlyAccessRefund, RefundFailureCode>;

const REFUND_REQUIRED_KEYS = [
  "verifiedOrder",
  "refunds",
  "actor",
  "amountCents",
  "currency",
  "reason",
  "refundedAt",
] as const;

/** The recorded overpayment decision, required only to refund above the payable total. */
const REFUND_OPTIONAL_KEYS = ["overpaymentException"] as const;

const ACTOR_KEYS = ["id", "role"] as const;

export function refundIdFor(orderId: string, sequence: number): string {
  return `early-access-refund:${orderId}:${sequence}`;
}

/** Validate a stored refund row. Fails closed on any deviation. */
export function readEarlyAccessRefund(value: unknown): EarlyAccessRefund | null {
  const record = readPlainRecord(value, EARLY_ACCESS_REFUND_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (
    !isBoundedInteger(record.sequence, 1, EARLY_ACCESS_MAX_REFUNDS_PER_ORDER)
  ) {
    return null;
  }
  if (record.refundId !== refundIdFor(record.orderId, record.sequence)) return null;
  if (!isBoundedInteger(record.amountCents, 1, EARLY_ACCESS_MAX_MONEY_CENTS)) return null;
  if (record.currency !== "USD") return null;
  if (!isBoundedInteger(record.verifiedPaidCents, 1, EARLY_ACCESS_MAX_MONEY_CENTS)) return null;
  if (!isBoundedInteger(record.priorRefundedCents, 0, EARLY_ACCESS_MAX_MONEY_CENTS)) return null;
  // The bound is restated on the row, so a stored refund that breaks it is unreadable
  // rather than merely wrong in a report somebody has to notice.
  if (record.priorRefundedCents + record.amountCents > record.verifiedPaidCents) return null;
  if (!isBoundedText(record.reason, MAX_REASON_LENGTH)) return null;
  if (record.reason.trim().length < MIN_REASON_LENGTH) return null;
  if (!isSafeIdentifier(record.actorId)) return null;
  if (!isOneOf(record.actorRole, EARLY_ACCESS_VERIFIER_ROLES)) return null;
  if (!isCanonicalTimestamp(record.refundedAt)) return null;

  return Object.freeze({
    refundId: record.refundId,
    orderId: record.orderId,
    amountCents: record.amountCents,
    currency: "USD" as const,
    verifiedPaidCents: record.verifiedPaidCents,
    priorRefundedCents: record.priorRefundedCents,
    reason: record.reason,
    actorId: record.actorId,
    actorRole: record.actorRole,
    refundedAt: record.refundedAt,
    sequence: record.sequence,
  });
}

export function readEarlyAccessRefundHistory(value: unknown): readonly EarlyAccessRefund[] | null {
  const entries = readPlainArray(value, EARLY_ACCESS_MAX_REFUNDS_PER_ORDER);
  if (!entries) return null;

  const records: EarlyAccessRefund[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const refund = readEarlyAccessRefund(entries[index]);
    if (!refund) return null;
    if (refund.sequence !== index + 1) return null;
    const previous = records[index - 1];
    if (previous !== undefined && refund.orderId !== previous.orderId) return null;
    records.push(refund);
  }
  return Object.freeze(records);
}

export function refundedTotalCents(refunds: readonly EarlyAccessRefund[]): number {
  return refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
}

/**
 * Validate one refund against the payment it reverses.
 *
 * The ceiling is the VERIFIED amount, read off the verified order projection, so it is
 * the number a named human confirmed rather than anything derived from a price list. A
 * projection that is not payment_verified cannot reach this function at all, because
 * `readEarlyAccessVerifiedOrder` refuses any other status.
 */
export function recordRefund(input: unknown): RefundResult {
  const record = readPlainRecord(input, REFUND_REQUIRED_KEYS, REFUND_OPTIONAL_KEYS);
  if (!record) return refused("input_invalid");

  const actor = readPlainRecord(record.actor, ACTOR_KEYS);
  if (!actor || !isSafeIdentifier(actor.id)) return refused("actor_invalid");
  if (!isOneOf(actor.role, EARLY_ACCESS_VERIFIER_ROLES)) return refused("forbidden");

  if (!isBoundedText(record.reason, MAX_REASON_LENGTH)) return refused("reason_insufficient");
  if (record.reason.trim().length < MIN_REASON_LENGTH) return refused("reason_insufficient");

  const verified = readEarlyAccessVerifiedOrder(record.verifiedOrder);
  if (!verified) return refused("verified_order_invalid");

  if (!isCanonicalTimestamp(record.refundedAt)) return refused("timestamp_invalid");
  // A refund stamped before the approval it reverses is not an ordering, it is a story.
  if (!isNotBefore(record.refundedAt, verified.verifiedAt)) return refused("timestamp_invalid");

  if (!isBoundedInteger(record.amountCents, 1, EARLY_ACCESS_MAX_MONEY_CENTS)) {
    return refused("amount_invalid");
  }
  if (record.currency !== verified.currency) return refused("currency_mismatch");

  const history = readEarlyAccessRefundHistory(record.refunds);
  if (!history) return refused("refund_history_invalid");
  if (history.some((refund) => refund.orderId !== verified.orderId)) {
    return refused("refund_history_invalid");
  }
  if (history.length >= EARLY_ACCESS_MAX_REFUNDS_PER_ORDER) return refused("refund_limit_reached");

  const priorRefundedCents = refundedTotalCents(history);
  const refundedTotal = priorRefundedCents + record.amountCents;
  // THE CEILING. Verified paid less completed refunds, never the subtotal and never the
  // payable total.
  if (refundedTotal > verified.verifiedAmountCents) {
    return refused("refund_exceeds_verified_paid");
  }
  // Above the payable total, the only legitimate reason is an overpayment somebody
  // recorded and decided to refund. Without that decision on file, the refund is refused
  // rather than allowed on the strength of the ceiling alone.
  if (refundedTotal > verified.money.payableTotalCents) {
    const exception = readOverpaymentException(record.overpaymentException);
    if (!exception) return refused("excess_refund_not_authorized");
    if (
      !exceptionAuthorizesExcessRefund(
        exception,
        verified.orderId,
        refundedTotal,
        verified.money.payableTotalCents,
      )
    ) {
      return refused("excess_refund_not_authorized");
    }
  }

  const sequence = history.length + 1;
  return accepted(
    Object.freeze({
      refundId: refundIdFor(verified.orderId, sequence),
      orderId: verified.orderId,
      amountCents: record.amountCents,
      currency: verified.currency,
      verifiedPaidCents: verified.verifiedAmountCents,
      priorRefundedCents,
      reason: record.reason,
      actorId: actor.id,
      actorRole: actor.role,
      refundedAt: record.refundedAt,
      sequence,
    }),
  );
}

// ---------------------------------------------------------------------------
// The commission adjustment
// ---------------------------------------------------------------------------

export type CommissionAdjustmentFailureCode =
  | "input_invalid"
  | "accrual_invalid"
  | "refund_invalid"
  | "adjustment_history_invalid"
  | "order_mismatch"
  | "adjustment_exceeds_accrual";

/**
 * One append-only reduction of a commission.
 *
 * `amountCents` is always NEGATIVE. There is no field for a corrected commission and no
 * function that edits an accrual, so the only way this number can change is another row.
 */
export type EarlyAccessCommissionAdjustment = Readonly<{
  adjustmentId: string;
  accrualId: string;
  orderReference: string;
  kind: "refund_reversal";
  amountCents: number;
  refundId: string;
  refundedCents: number;
  currency: EarlyAccessCurrency;
  recordedAt: string;
  sequence: number;
}>;

export const EARLY_ACCESS_COMMISSION_ADJUSTMENT_KEYS = [
  "adjustmentId",
  "accrualId",
  "orderReference",
  "kind",
  "amountCents",
  "refundId",
  "refundedCents",
  "currency",
  "recordedAt",
  "sequence",
] as const;

export type CommissionAdjustmentResult = CommerceResult<
  EarlyAccessCommissionAdjustment,
  CommissionAdjustmentFailureCode
>;

export function commissionAdjustmentIdFor(orderId: string, sequence: number): string {
  return `early-access-commission-adjustment:${orderId}:${sequence}`;
}

/**
 * How much of a commission a refund reverses.
 *
 * Proportional to the share of the eligible basis returned, rounded UP so a partial
 * refund can never leave a commission standing on revenue that went back. A refund at or
 * beyond the basis reverses the whole commission. This mirrors the reversal arithmetic
 * the partner commission ledger already uses, so the two lanes reverse the same way.
 */
export function reversalCentsFor(
  accrual: EarlyAccessCommissionAccrual,
  refundedCents: number,
): number {
  if (accrual.commissionBasisCents <= 0) return accrual.commissionAmountCents;
  if (refundedCents >= accrual.commissionBasisCents) return accrual.commissionAmountCents;
  return Math.ceil((accrual.commissionAmountCents * refundedCents) / accrual.commissionBasisCents);
}

/**
 * Build the negative adjustment one refund produces.
 *
 * The accrual and the prior adjustments are supplied rather than fetched, so the whole
 * decision is a pure function of the trail: the same inputs always produce the same row,
 * and a caller cannot reach a different answer by reordering its reads.
 */
export function buildRefundAdjustment(input: {
  readonly accrual: unknown;
  readonly refund: unknown;
  readonly adjustments: unknown;
}): CommissionAdjustmentResult {
  const accrual = readCommissionAccrual(input.accrual);
  if (!accrual) return refused("accrual_invalid");

  const refund = readEarlyAccessRefund(input.refund);
  if (!refund) return refused("refund_invalid");
  if (refund.orderId !== accrual.orderReference) return refused("order_mismatch");

  const prior = readPlainArray(input.adjustments, EARLY_ACCESS_MAX_REFUNDS_PER_ORDER);
  if (!prior) return refused("adjustment_history_invalid");

  let alreadyReversed = 0;
  for (let index = 0; index < prior.length; index += 1) {
    const entry = readCommissionAdjustment(prior[index]);
    if (!entry) return refused("adjustment_history_invalid");
    if (entry.sequence !== index + 1) return refused("adjustment_history_invalid");
    if (entry.orderReference !== accrual.orderReference) return refused("order_mismatch");
    alreadyReversed += Math.abs(entry.amountCents);
  }

  // The refund row already states everything refunded before it, so the cumulative
  // reversal is computed from the total rather than from this refund alone. Reversing
  // each refund in isolation would round up more than once on the same commission.
  const cumulativeRefunded = refund.priorRefundedCents + refund.amountCents;
  const cumulativeReversal = reversalCentsFor(accrual, cumulativeRefunded);
  const amount = cumulativeReversal - alreadyReversed;
  // A reversal that would take back more than was accrued is refused rather than
  // clamped, because a clamp hides the fact that the trail disagrees with itself.
  if (cumulativeReversal > accrual.commissionAmountCents) return refused("adjustment_exceeds_accrual");
  if (amount < 0) return refused("adjustment_exceeds_accrual");

  const sequence = prior.length + 1;
  return accepted(
    Object.freeze({
      adjustmentId: commissionAdjustmentIdFor(accrual.orderReference, sequence),
      accrualId: accrual.accrualId,
      orderReference: accrual.orderReference,
      kind: "refund_reversal" as const,
      // Negative by construction. There is no branch on which this module adds value.
      // Zero is normalized so a no-op adjustment never stores a negative zero, which
      // reads as a different value from zero to a strict comparison.
      amountCents: amount === 0 ? 0 : -amount,
      refundId: refund.refundId,
      refundedCents: cumulativeRefunded,
      currency: accrual.currency,
      recordedAt: refund.refundedAt,
      sequence,
    }),
  );
}

/** Validate a stored adjustment. Fails closed on any deviation. */
export function readCommissionAdjustment(
  value: unknown,
): EarlyAccessCommissionAdjustment | null {
  const record = readPlainRecord(value, EARLY_ACCESS_COMMISSION_ADJUSTMENT_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.orderReference)) return null;
  if (!isBoundedInteger(record.sequence, 1, EARLY_ACCESS_MAX_REFUNDS_PER_ORDER)) return null;
  if (record.adjustmentId !== commissionAdjustmentIdFor(record.orderReference, record.sequence)) {
    return null;
  }
  if (!isBoundedText(record.accrualId, 200)) return null;
  if (record.kind !== "refund_reversal") return null;
  // Never positive. An adjustment that adds commission is not this kind of row.
  if (
    typeof record.amountCents !== "number" ||
    !Number.isSafeInteger(record.amountCents) ||
    record.amountCents > 0 ||
    record.amountCents < -EARLY_ACCESS_MAX_MONEY_CENTS
  ) {
    return null;
  }
  if (!isBoundedText(record.refundId, 200)) return null;
  if (!isBoundedInteger(record.refundedCents, 1, EARLY_ACCESS_MAX_MONEY_CENTS)) return null;
  if (record.currency !== "USD") return null;
  if (!isCanonicalTimestamp(record.recordedAt)) return null;

  return Object.freeze({
    adjustmentId: record.adjustmentId,
    accrualId: record.accrualId,
    orderReference: record.orderReference,
    kind: "refund_reversal" as const,
    amountCents: record.amountCents,
    refundId: record.refundId,
    refundedCents: record.refundedCents,
    currency: "USD" as const,
    recordedAt: record.recordedAt,
    sequence: record.sequence,
  });
}

/** The commission still standing after every adjustment. Derived, never stored. */
export function outstandingCommissionCents(
  accrual: EarlyAccessCommissionAccrual,
  adjustments: readonly EarlyAccessCommissionAdjustment[],
): number {
  const reversed = adjustments.reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0);
  return Math.max(0, accrual.commissionAmountCents - reversed);
}
