/**
 * The Early Access overpayment exception path. Server only, pure, side effect free.
 *
 * A customer looking at a three unit bundle sends the undiscounted subtotal. They owe
 * 47,760 and they send 59,700. That is the case this lane will actually see, and the
 * founder decision about it is explicit:
 *
 *   1. It is an OVERPAYMENT. It is never auto approved.
 *   2. It never silently becomes account credit. No customer wallet is built here, and
 *      applying credit requires a reference to a credit somebody else approved.
 *   3. The excess earns no commission. The commission basis is the merchandise subtotal
 *      less the discount, so money above the amount owed cannot reach it by any route.
 *   4. The expected amount, the received amount, and the excess are all recorded, a
 *      named founder or operations admin chooses one of four actions, and the choice is
 *      auditable on the row.
 *   5. For the MVP the default is that the excess is REFUNDED.
 *
 * An UNDERPAYMENT has no path through here at all. Money is still owed, and the answer
 * is the customer sending the rest, not an admin deciding a debt away.
 */

import {
  accepted,
  isBoundedText,
  isCanonicalTimestamp,
  isOneOf,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import type { PayableTotalCents } from "./order-money";
import {
  EARLY_ACCESS_VERIFIER_ROLES,
  type EarlyAccessPaymentReconciliation,
  type EarlyAccessVerifierRole,
} from "./payment-reconciliation";

const MIN_REASON_LENGTH = 8;
const MAX_REASON_LENGTH = 500;

/**
 * The four actions a named human may take on an overpayment.
 *
 * Two of them let the verification proceed and two do not, and which is which is decided
 * here rather than by the caller. Holding the order and rejecting the verification are
 * both honest answers to "there is more money here than there should be and nobody has
 * decided what to do about it", and neither of them is an approval.
 */
export const EARLY_ACCESS_OVERPAYMENT_ACTIONS = [
  "record_overpayment_and_hold_order",
  "record_overpayment_and_refund_difference",
  "record_overpayment_and_apply_approved_credit",
  "reject_verification_pending_resolution",
] as const;

export type EarlyAccessOverpaymentAction = (typeof EARLY_ACCESS_OVERPAYMENT_ACTIONS)[number];

export const EARLY_ACCESS_OVERPAYMENT_RESOLUTIONS = [
  "refund_required",
  "credit_applied",
  "held",
  "rejected",
] as const;

export type EarlyAccessOverpaymentResolution =
  (typeof EARLY_ACCESS_OVERPAYMENT_RESOLUTIONS)[number];

/**
 * The MVP default.
 *
 * Refunding the excess needs no new system and leaves xenios holding nothing it cannot
 * explain. Applying credit would need a customer wallet, which is not built here and is
 * not something this module is entitled to invent.
 */
export const EARLY_ACCESS_DEFAULT_OVERPAYMENT_ACTION: EarlyAccessOverpaymentAction =
  "record_overpayment_and_refund_difference";

/** The action decides the resolution. A caller cannot state one that does not follow. */
const RESOLUTION_FOR_ACTION: Readonly<
  Record<EarlyAccessOverpaymentAction, EarlyAccessOverpaymentResolution>
> = Object.freeze({
  record_overpayment_and_hold_order: "held",
  record_overpayment_and_refund_difference: "refund_required",
  record_overpayment_and_apply_approved_credit: "credit_applied",
  reject_verification_pending_resolution: "rejected",
});

/** The two actions under which the payment may be treated as verified. */
const ACTION_PERMITS_VERIFICATION: Readonly<Record<EarlyAccessOverpaymentAction, boolean>> =
  Object.freeze({
    record_overpayment_and_hold_order: false,
    record_overpayment_and_refund_difference: true,
    record_overpayment_and_apply_approved_credit: true,
    reject_verification_pending_resolution: false,
  });

export function overpaymentResolutionFor(
  action: EarlyAccessOverpaymentAction,
): EarlyAccessOverpaymentResolution {
  return RESOLUTION_FOR_ACTION[action];
}

export function overpaymentActionPermitsVerification(
  action: EarlyAccessOverpaymentAction,
): boolean {
  return ACTION_PERMITS_VERIFICATION[action];
}

/**
 * One named human recording one exact overpayment on one exact order.
 *
 * Every field that makes it specific is on the record, so it cannot be replayed against
 * a different order, a different amount, or a different excess. This is a single
 * decision about a single payment, not a policy.
 */
export type EarlyAccessOverpaymentException = Readonly<{
  exceptionId: string;
  orderId: string;
  classification: "OVERPAYMENT";
  /** What the order owed. */
  expectedAmountCents: number;
  /** What the customer actually sent. */
  receivedAmountCents: number;
  /** Always positive. Received minus expected. */
  excessCents: number;
  action: EarlyAccessOverpaymentAction;
  resolution: EarlyAccessOverpaymentResolution;
  /** Names a separately approved credit. Null for every other action. */
  approvedCreditRef: string | null;
  /** Derived from the action. True only where the verification may proceed. */
  permitsVerification: boolean;
  actorId: string;
  actorRole: EarlyAccessVerifierRole;
  reason: string;
  grantedAt: string;
}>;

export const EARLY_ACCESS_OVERPAYMENT_EXCEPTION_KEYS = [
  "exceptionId",
  "orderId",
  "classification",
  "expectedAmountCents",
  "receivedAmountCents",
  "excessCents",
  "action",
  "resolution",
  "approvedCreditRef",
  "permitsVerification",
  "actorId",
  "actorRole",
  "reason",
  "grantedAt",
] as const;

export type OverpaymentExceptionFailureCode =
  | "input_invalid"
  | "actor_invalid"
  | "forbidden"
  | "reason_insufficient"
  | "order_invalid"
  | "not_overpaid"
  | "action_invalid"
  | "credit_not_approved"
  | "timestamp_invalid";

export type OverpaymentExceptionResult = CommerceResult<
  EarlyAccessOverpaymentException,
  OverpaymentExceptionFailureCode
>;

const RECORD_REQUIRED_KEYS = ["orderId", "reconciliation", "actor", "reason", "grantedAt"] as const;

const RECORD_OPTIONAL_KEYS = ["action", "approvedCreditRef"] as const;

const ACTOR_KEYS = ["id", "role"] as const;

export function paymentExceptionIdFor(orderId: string): string {
  return `early-access-payment-exception:${orderId}`;
}

/**
 * Record an overpayment and the action taken about it.
 *
 * The reconciliation is passed in whole rather than as loose numbers, so the record can
 * only ever describe a comparison the reconciliation module already made. Authorization
 * is checked before the amounts are read, so an unauthorized caller learns nothing about
 * the order's money from the refusal code.
 */
export function recordOverpaymentException(input: unknown): OverpaymentExceptionResult {
  const record = readPlainRecord(input, RECORD_REQUIRED_KEYS, RECORD_OPTIONAL_KEYS);
  if (!record) return refused("input_invalid");

  const actor = readPlainRecord(record.actor, ACTOR_KEYS);
  if (!actor || !isSafeIdentifier(actor.id)) return refused("actor_invalid");
  if (!isOneOf(actor.role, EARLY_ACCESS_VERIFIER_ROLES)) return refused("forbidden");

  if (!isBoundedText(record.reason, MAX_REASON_LENGTH)) return refused("reason_insufficient");
  if (record.reason.trim().length < MIN_REASON_LENGTH) return refused("reason_insufficient");

  if (!isSafeIdentifier(record.orderId)) return refused("order_invalid");
  if (!isCanonicalTimestamp(record.grantedAt)) return refused("timestamp_invalid");

  const reconciliation = record.reconciliation;
  if (reconciliation === null || typeof reconciliation !== "object") {
    return refused("input_invalid");
  }
  const view = reconciliation as EarlyAccessPaymentReconciliation;
  // Only an overpayment has an excess to decide about. An underpayment is refused by the
  // verification itself and has no path through here.
  if (view.classification !== "OVERPAYMENT") return refused("not_overpaid");
  if (
    typeof view.payableTotalCents !== "number" ||
    typeof view.observedAmountCents !== "number" ||
    typeof view.varianceCents !== "number" ||
    view.varianceCents !== view.observedAmountCents - view.payableTotalCents ||
    view.varianceCents <= 0
  ) {
    return refused("input_invalid");
  }

  const action =
    record.action === undefined || record.action === null
      ? EARLY_ACCESS_DEFAULT_OVERPAYMENT_ACTION
      : record.action;
  if (!isOneOf(action, EARLY_ACCESS_OVERPAYMENT_ACTIONS)) return refused("action_invalid");

  const approvedCreditRefValue =
    record.approvedCreditRef === undefined || record.approvedCreditRef === null
      ? null
      : record.approvedCreditRef;
  if (action === "record_overpayment_and_apply_approved_credit") {
    // Credit is not something this lane may grant itself. Without a reference to a
    // credit somebody else approved, the action is refused rather than downgraded.
    if (!isSafeIdentifier(approvedCreditRefValue)) return refused("credit_not_approved");
  } else if (approvedCreditRefValue !== null) {
    // A credit reference on any other action would be a claim nobody acted on.
    return refused("credit_not_approved");
  }

  return accepted(
    Object.freeze({
      exceptionId: paymentExceptionIdFor(record.orderId),
      orderId: record.orderId,
      classification: "OVERPAYMENT" as const,
      expectedAmountCents: view.payableTotalCents,
      receivedAmountCents: view.observedAmountCents,
      excessCents: view.varianceCents,
      action,
      resolution: overpaymentResolutionFor(action),
      approvedCreditRef: approvedCreditRefValue as string | null,
      permitsVerification: overpaymentActionPermitsVerification(action),
      actorId: actor.id,
      actorRole: actor.role,
      reason: record.reason,
      grantedAt: record.grantedAt,
    }),
  );
}

/** Validate a stored overpayment exception. Fails closed on any deviation. */
export function readOverpaymentException(value: unknown): EarlyAccessOverpaymentException | null {
  const record = readPlainRecord(value, EARLY_ACCESS_OVERPAYMENT_EXCEPTION_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (record.exceptionId !== paymentExceptionIdFor(record.orderId)) return null;
  if (record.classification !== "OVERPAYMENT") return null;
  if (
    typeof record.expectedAmountCents !== "number" ||
    !Number.isSafeInteger(record.expectedAmountCents) ||
    record.expectedAmountCents <= 0
  ) {
    return null;
  }
  if (
    typeof record.receivedAmountCents !== "number" ||
    !Number.isSafeInteger(record.receivedAmountCents) ||
    record.receivedAmountCents <= 0
  ) {
    return null;
  }
  // The stated excess must be the arithmetic, and it must be an excess.
  if (
    typeof record.excessCents !== "number" ||
    record.excessCents !== record.receivedAmountCents - record.expectedAmountCents ||
    record.excessCents <= 0
  ) {
    return null;
  }
  if (!isOneOf(record.action, EARLY_ACCESS_OVERPAYMENT_ACTIONS)) return null;
  // The resolution and the permission are functions of the action, so a stored row that
  // states a different pair is refused rather than believed.
  if (record.resolution !== overpaymentResolutionFor(record.action)) return null;
  if (record.permitsVerification !== overpaymentActionPermitsVerification(record.action)) {
    return null;
  }
  if (record.action === "record_overpayment_and_apply_approved_credit") {
    if (!isSafeIdentifier(record.approvedCreditRef)) return null;
  } else if (record.approvedCreditRef !== null) {
    return null;
  }
  if (!isSafeIdentifier(record.actorId)) return null;
  if (!isOneOf(record.actorRole, EARLY_ACCESS_VERIFIER_ROLES)) return null;
  if (!isBoundedText(record.reason, MAX_REASON_LENGTH)) return null;
  if (record.reason.trim().length < MIN_REASON_LENGTH) return null;
  if (!isCanonicalTimestamp(record.grantedAt)) return null;

  return Object.freeze({
    exceptionId: record.exceptionId,
    orderId: record.orderId,
    classification: "OVERPAYMENT" as const,
    expectedAmountCents: record.expectedAmountCents,
    receivedAmountCents: record.receivedAmountCents,
    excessCents: record.excessCents,
    action: record.action,
    resolution: record.resolution as EarlyAccessOverpaymentResolution,
    approvedCreditRef:
      record.approvedCreditRef === null ? null : (record.approvedCreditRef as string),
    permitsVerification: record.permitsVerification as boolean,
    actorId: record.actorId,
    actorRole: record.actorRole,
    reason: record.reason,
    grantedAt: record.grantedAt,
  });
}

/**
 * Whether a stored exception authorizes treating this exact payment as verified.
 *
 * Bound to the order, the amount owed, and the amount received, and to an action that
 * actually resolves the excess. An exception recorded for a 40 dollar overpayment does
 * not authorize a 400 dollar one, and one that merely held the order authorizes nothing.
 */
export function exceptionAuthorizes(
  exception: EarlyAccessOverpaymentException,
  orderId: string,
  payableTotalCents: PayableTotalCents,
  receivedAmountCents: number,
): boolean {
  return (
    exception.permitsVerification &&
    exception.orderId === orderId &&
    exception.expectedAmountCents === payableTotalCents &&
    exception.receivedAmountCents === receivedAmountCents
  );
}

/**
 * Whether a refund above the payable total is authorized by this exception.
 *
 * The refund ceiling is the verified amount, so an overpayment can legitimately require
 * refunding more than the order was ever worth. That is only allowed through this path,
 * and only up to the excess that was actually received.
 */
export function exceptionAuthorizesExcessRefund(
  exception: EarlyAccessOverpaymentException,
  orderId: string,
  refundedTotalCents: number,
  payableTotalCents: number,
): boolean {
  if (exception.orderId !== orderId) return false;
  if (exception.resolution !== "refund_required") return false;
  return refundedTotalCents <= payableTotalCents + exception.excessCents;
}
