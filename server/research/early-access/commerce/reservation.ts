/**
 * Availability reservation, held BEFORE the customer is shown how to pay.
 *
 * The sequence this exists to enforce is: exact product and release validated,
 * supplier confirmation validated, quantity validated, RESERVATION CREATED,
 * immutable order created, invoice created, and only then payment instructions
 * displayed. A customer must never send money and discover afterwards that the
 * supplier cannot fulfil.
 *
 * Everything here is pure. Expiry is DERIVED from a supplied clock rather than
 * stored as a status, because a stored "expired" flag is only as true as the
 * last process that ran to set it, and the one moment this matters is the moment
 * nothing has run.
 */

import type { CommerceResult } from "./input-guards";

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export const EARLY_ACCESS_RESERVATION_STATUSES = [
  /** Held, unexpired, and the order may proceed to invoice and payment. */
  "active",
  /** The order was paid and released against this reservation. Terminal. */
  "consumed",
  /** Released deliberately before expiry. Terminal. */
  "released",
  /**
   * The window elapsed. NOT a decision: it means supply must be confirmed
   * again before anything else happens.
   */
  "expired",
] as const;

export type EarlyAccessReservationStatus = (typeof EARLY_ACCESS_RESERVATION_STATUSES)[number];

/**
 * What an expired reservation requires, which depends entirely on whether the
 * customer has already sent money.
 */
export const EARLY_ACCESS_EXPIRY_OUTCOMES = [
  /** Nothing was paid. Re-confirm supply, notify, and let the customer retry. */
  "confirmation_required",
  /**
   * MONEY IS IN HAND AND SUPPLY IS UNCONFIRMED. No automated action is safe, so
   * this raises an exception for a named human and stops.
   */
  "admin_exception_required",
] as const;

export type EarlyAccessExpiryOutcome = (typeof EARLY_ACCESS_EXPIRY_OUTCOMES)[number];

// ---------------------------------------------------------------------------
// The reservation
// ---------------------------------------------------------------------------

export type EarlyAccessReservation = Readonly<{
  reservationId: string;
  customerId: string;
  orderDraftId: string;
  productId: string;
  variantId: string;
  quantity: number;
  /** The supplier's own confirmation that this quantity can be supplied. */
  supplierConfirmationId: string;
  createdAt: string;
  expiresAt: string;
  status: EarlyAccessReservationStatus;
  createdByActorId: string;
  createdByActorRole: string;
  /** The audit event id written when this reservation came into existence. */
  auditEventId: string;
}>;

/**
 * Raised when a reservation lapses while the customer's money is already in
 * hand. It carries no decision, only the facts a human needs to make one.
 *
 * There is deliberately no field that could resolve it automatically. Fulfilling
 * risks shipping what cannot be supplied; refunding silently reverses a customer
 * decision nobody reviewed. Both are worse than stopping.
 */
export type EarlyAccessReservationExpiryException = Readonly<{
  exceptionId: string;
  reservationId: string;
  orderDraftId: string;
  customerId: string;
  productId: string;
  variantId: string;
  quantity: number;
  supplierConfirmationId: string;
  /** When supply stopped being confirmed. */
  reservationExpiredAt: string;
  /** Proof the customer says they sent the money. */
  paymentProofRef: string;
  /** What the order owed, from the immutable money snapshot. */
  payableTotalCents: number;
  currency: string;
  raisedAt: string;
  /** Always true. Stated as a field so a reader cannot miss it. */
  requiresHumanDecision: true;
  /** Both parties are told; neither is told an outcome, because there is none yet. */
  notifyAdmin: true;
  notifyCustomer: true;
}>;

export type ReservationFailureCode =
  | "reservation_invalid"
  | "quantity_invalid"
  | "supplier_confirmation_missing"
  | "window_invalid";

export type ReservationResult = CommerceResult<EarlyAccessReservation, ReservationFailureCode>;

function refused(code: ReservationFailureCode): ReservationResult {
  return Object.freeze({ ok: false as const, code });
}

function isSafeText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export type CreateReservationInput = Readonly<{
  reservationId: string;
  customerId: string;
  orderDraftId: string;
  productId: string;
  variantId: string;
  quantity: number;
  supplierConfirmationId: string;
  createdAt: string;
  expiresAt: string;
  createdByActorId: string;
  createdByActorRole: string;
  auditEventId: string;
}>;

/**
 * Create a held reservation.
 *
 * The supplier confirmation is REQUIRED rather than optional. A reservation
 * without one is a promise nobody made, and it is exactly the state that lets a
 * customer pay for something no supplier ever agreed to ship.
 */
export function createEarlyAccessReservation(input: CreateReservationInput): ReservationResult {
  for (const value of [
    input.reservationId,
    input.customerId,
    input.orderDraftId,
    input.productId,
    input.variantId,
    input.createdByActorId,
    input.createdByActorRole,
    input.auditEventId,
  ]) {
    if (!isSafeText(value)) return refused("reservation_invalid");
  }
  if (!isSafeText(input.supplierConfirmationId)) return refused("supplier_confirmation_missing");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    return refused("quantity_invalid");
  }
  if (!isTimestamp(input.createdAt) || !isTimestamp(input.expiresAt)) {
    return refused("window_invalid");
  }
  // A window that has already closed is not a reservation. Accepting one would
  // let a caller manufacture an already-expired hold and proceed past it.
  if (Date.parse(input.expiresAt) <= Date.parse(input.createdAt)) {
    return refused("window_invalid");
  }

  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      reservationId: input.reservationId,
      customerId: input.customerId,
      orderDraftId: input.orderDraftId,
      productId: input.productId,
      variantId: input.variantId,
      quantity: input.quantity,
      supplierConfirmationId: input.supplierConfirmationId,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      status: "active" as const,
      createdByActorId: input.createdByActorId,
      createdByActorRole: input.createdByActorRole,
      auditEventId: input.auditEventId,
    }),
  });
}

/**
 * Whether the hold still stands at a given moment.
 *
 * Derived, never read from the status field, so a reservation that lapsed while
 * no process was running is still expired the instant anyone asks.
 */
export function reservationHoldsAt(reservation: EarlyAccessReservation, now: string): boolean {
  if (reservation.status !== "active") return false;
  if (!isTimestamp(now)) return false;
  return Date.parse(now) < Date.parse(reservation.expiresAt);
}

/**
 * Whether payment instructions may be displayed.
 *
 * This is the gate the whole module exists for: a customer may only be told how
 * to pay while supply is actually held for them.
 */
export function mayDisplayPaymentInstructions(
  reservation: EarlyAccessReservation,
  now: string,
): boolean {
  return reservationHoldsAt(reservation, now);
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

export type ExpiredReservationInput = Readonly<{
  reservation: EarlyAccessReservation;
  now: string;
  /** The customer's payment proof, or null when no money has been claimed. */
  paymentProofRef: string | null;
  /** From the order's immutable money snapshot. */
  payableTotalCents: number;
  currency: string;
  exceptionId: string;
}>;

export type ExpiredReservationOutcome = Readonly<{
  outcome: EarlyAccessExpiryOutcome;
  /** Always set. The hold is gone either way. */
  reservation: EarlyAccessReservation;
  /** Present only when money was already sent. */
  exception: EarlyAccessReservationExpiryException | null;
  /** Never true here, under any input. Stated so the absence is visible. */
  autoFulfilled: false;
  autoCancelled: false;
}>;

/**
 * Resolve a reservation that has lapsed.
 *
 * Four rules, and the fourth is the one that matters:
 *
 *   1. Mark that supply must be confirmed again.
 *   2. Never silently fulfil.
 *   3. Never silently cancel a payment the customer already submitted.
 *   4. When money has already been sent, RAISE AN ADMIN EXCEPTION.
 *
 * Rule four is the only state in this flow where a real person's money is in
 * hand, the supply is unconfirmed, and no automated action is safe. Fulfilling
 * could ship what cannot be supplied. Refunding reverses a decision the customer
 * made and nobody reviewed. So it stops, tells both parties, and waits for a
 * named human.
 */
export function resolveExpiredReservation(input: ExpiredReservationInput): ExpiredReservationOutcome {
  const expired: EarlyAccessReservation = Object.freeze({
    ...input.reservation,
    status: "expired" as const,
  });

  const moneyIsInHand = typeof input.paymentProofRef === "string" && input.paymentProofRef.length > 0;

  if (!moneyIsInHand) {
    // Nothing was paid, so nothing is at risk. Supply is re-confirmed and the
    // customer may start again. Still not a cancellation: the order draft is
    // untouched.
    return Object.freeze({
      outcome: "confirmation_required" as const,
      reservation: expired,
      exception: null,
      autoFulfilled: false as const,
      autoCancelled: false as const,
    });
  }

  return Object.freeze({
    outcome: "admin_exception_required" as const,
    reservation: expired,
    exception: Object.freeze({
      exceptionId: input.exceptionId,
      reservationId: input.reservation.reservationId,
      orderDraftId: input.reservation.orderDraftId,
      customerId: input.reservation.customerId,
      productId: input.reservation.productId,
      variantId: input.reservation.variantId,
      quantity: input.reservation.quantity,
      supplierConfirmationId: input.reservation.supplierConfirmationId,
      reservationExpiredAt: input.reservation.expiresAt,
      paymentProofRef: input.paymentProofRef as string,
      payableTotalCents: input.payableTotalCents,
      currency: input.currency,
      raisedAt: input.now,
      requiresHumanDecision: true as const,
      notifyAdmin: true as const,
      notifyCustomer: true as const,
    }),
    autoFulfilled: false as const,
    autoCancelled: false as const,
  });
}
