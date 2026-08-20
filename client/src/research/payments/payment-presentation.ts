// Presentation vocabulary for the assisted-order payment lane. One place turns
// the frozen payment contract into human copy, so the customer panel and the
// admin panel never drift into describing the same state differently.
//
// Two rules the copy itself has to carry:
//
// - A CLAIM IS NEVER RENDERED AS A PAYMENT. `proof_submitted` reads "Payment
//   details received", not "Paid" and not "Payment confirmed". The customer
//   told us something; we have not verified it. Copy that overstates it is a
//   real harm — a customer who believes they are paid stops chasing a transfer
//   that never arrived.
// - INTERNAL REASONS NEVER APPEAR. `exception` reads as one calm sentence that
//   routes the customer to a human. The stored exceptionReason is operator
//   text (amounts, suspicions, bank detail) and has no customer rendering here
//   at all — the customer projection does not carry it, and neither does this
//   module.

import type {
  AssistedOrderPaymentNextAction,
  AssistedOrderPaymentState,
} from "@shared/research/assisted-order/payment-contract";
import type { BadgeTone } from "../ui/kit";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Integer cents to money. A payment that reaches a customer surface always has
 * a positive amount — the domain refuses to open one otherwise — so there is no
 * zero rendering here and no blank.
 */
export function formatPaymentCents(cents: number): string {
  return USD.format(cents / 100);
}

/** The customer's label for a state. Deliberately understated. */
export const PAYMENT_STATE_LABELS: Readonly<
  Record<AssistedOrderPaymentState, string>
> = Object.freeze({
  payment_required: "Awaiting payment details",
  instructions_presented: "Payment due",
  proof_submitted: "Payment details received",
  under_review: "Confirming your payment",
  paid: "Payment confirmed",
  rejected: "Payment not confirmed",
  exception: "Needs our attention",
  refunded: "Refunded",
});

export const PAYMENT_STATE_TONES: Readonly<
  Record<AssistedOrderPaymentState, BadgeTone>
> = Object.freeze({
  payment_required: "pending",
  instructions_presented: "info",
  proof_submitted: "pending",
  under_review: "pending",
  paid: "success",
  rejected: "warning",
  exception: "danger",
  refunded: "neutral",
});

/** One sentence telling the customer what happens next. Never a machine code. */
export const PAYMENT_NEXT_ACTION_COPY: Readonly<
  Record<AssistedOrderPaymentNextAction, string>
> = Object.freeze({
  await_instructions:
    "Your quote is accepted. We are preparing your payment details and will send them shortly.",
  follow_instructions:
    "Follow the payment details below, then let us know once you have sent it.",
  await_review:
    "Thank you. We are confirming your payment against our records and will update you as soon as it clears.",
  none_paid:
    "Your payment is confirmed. We will move your order into fulfillment.",
  retry_payment:
    "We could not match a payment to this order. New payment details are below, or contact us and we will help.",
  contact_xenios:
    "Something about this payment needs a person. Please contact us and we will resolve it with you.",
  none_refunded: "This payment has been refunded.",
});

/**
 * The admin's label. Blunter than the customer's, because an operator needs the
 * distinction between "a customer says so" and "we verified it" in one glance.
 */
export const PAYMENT_ADMIN_STATE_LABELS: Readonly<
  Record<AssistedOrderPaymentState, string>
> = Object.freeze({
  payment_required: "Opened, no instructions sent",
  instructions_presented: "Instructions sent",
  proof_submitted: "Customer claim filed (unverified)",
  under_review: "In review",
  paid: "Verified paid",
  rejected: "Rejected",
  exception: "Exception",
  refunded: "Refunded",
});
