import type { EarlyAccessCartStatus } from "@shared/research/early-access-cart";
import {
  EARLY_ACCESS_ORDER_STAGES,
  earlyAccessIsOverdue,
  type EarlyAccessOrderStage,
  type EarlyAccessSubmissionCustomerView,
} from "@shared/research/early-access-hardening";

/**
 * WHERE THIS ORDER ACTUALLY IS, DECIDED ONLY FROM WHAT THE SERVER SAID.
 *
 * The stage vocabulary is NOT defined here. It comes from the frozen hardening
 * contract, so the customer screen, the admin queue and the database are using
 * one set of words. This module only decides which of those words the server's
 * current answer maps to.
 *
 * The distinction the whole lane exists to protect:
 *
 *   CHECKOUT RESERVED
 *     A cart checkout exists. An invoice and a payment reference were issued.
 *     Nothing has been sent to us and no operator has been asked to look at
 *     anything. The customer still owes an action.
 *
 *   PAYMENT REVIEW REQUIRED
 *     A complete submission is on file and a named human must review it. The
 *     customer's action is done and ours has started.
 *
 * Neither means the money arrived. Only `paymentConfirmed` does, and that is
 * the server's own `payment.paid`, never anything inferred here.
 *
 * Two stages the contract names are deliberately NOT reachable from the cart
 * status alone, and are not guessed:
 *
 *  - `payment_instructions_shown` requires the server to have actually
 *    published instructions for this checkout, which is a separate projection.
 *    It is passed in, not assumed from the customer having opened a screen.
 *  - `customer_submission_pending` is the proof lane's submission view. Absent
 *    that view there is no honest way to know a submission is in flight, so the
 *    order stays reserved rather than being flattered forward.
 *
 * `payment_rejected` is NOT a stage. The contract keeps it in
 * `EarlyAccessCartPaymentState` so the two vocabularies do not fork, so it is
 * carried here as its own flag and the screen surfaces it on top of the stage.
 */

const ORDER: readonly EarlyAccessOrderStage[] = EARLY_ACCESS_ORDER_STAGES;

function rank(stage: EarlyAccessOrderStage): number {
  return ORDER.indexOf(stage);
}

export type EarlyAccessOrderProjection = Readonly<{
  stage: EarlyAccessOrderStage;
  /** Short customer-facing name of the stage. Never internal vocabulary. */
  label: string;
  /** One plain-language sentence saying what is true right now. */
  detail: string;
  /** What the customer should do next, or null when the wait is entirely ours. */
  customerAction: string | null;
  /**
   * True only when the SERVER says the payment is confirmed. Not derived from
   * the stage, not derived from a proof upload, not derived from a screenshot.
   */
  paymentConfirmed: boolean;
  /**
   * A named operator could not verify a payment. Carried beside the stage
   * rather than as one, so it can be true while the order is still reserved.
   */
  paymentRejected: boolean;
  /**
   * True once a complete submission is on file and a human owes a review. This
   * is the reserved / submitted boundary, and it is the server's answer to it.
   * A submission still in flight is deliberately NOT submitted.
   */
  submittedForReview: boolean;
  /** Server commitment, ISO 8601 UTC, or null when there is not one yet. */
  shipByAt: string | null;
  /** Derived from `shipByAt` against the clock. Never a stage. */
  overdue: boolean;
  /** How many of this checkout's product lines have shipped, and out of how many. */
  shippedCount: number;
  childCount: number;
}>;

const COPY: Readonly<
  Record<EarlyAccessOrderStage, Readonly<{ label: string; detail: string; customerAction: string | null }>>
> = Object.freeze({
  checkout_reserved: {
    label: "Checkout reserved",
    detail:
      "Your checkout is reserved and your invoice is issued. You have not been charged, and nothing has been sent to our team to review yet.",
    customerAction:
      "Send the payment using the reference on your invoice, then submit your payment proof so a named operator can look for it.",
  },
  payment_instructions_shown: {
    label: "Awaiting your payment",
    detail:
      "Your checkout is reserved and your payment details are confirmed. You have not been charged, and nothing has been sent to our team to review yet.",
    customerAction:
      "Send the payment using the reference shown, then submit your payment proof so a named operator can look for it.",
  },
  customer_submission_pending: {
    label: "Finishing your submission",
    detail:
      "Your payment proof has not finished sending, so no operator has been asked to review it yet. Your payment is not confirmed.",
    customerAction: "Send your payment proof again to finish submitting this order for review.",
  },
  payment_review_required: {
    label: "Payment awaiting verification",
    detail:
      "Your order is submitted for payment review. A named Xenios operator has to confirm the transfer arrived. Your payment is not confirmed yet, and submitting proof did not confirm it.",
    customerAction: null,
  },
  payment_verified: {
    label: "Payment verified",
    detail:
      "A named Xenios operator confirmed your payment arrived. Your order is being prepared for release to the supplier.",
    customerAction: null,
  },
  processing: {
    label: "Processing",
    detail:
      "Your payment is confirmed and your order has been released to the supplier. It has not shipped yet.",
    customerAction: null,
  },
  partially_shipped: {
    label: "Partially shipped",
    detail:
      "Some of your products have shipped and the rest are still being prepared. Tracking appears against each product below as it is issued.",
    customerAction: null,
  },
  shipped: {
    label: "Shipped",
    detail: "Every product on this order has shipped. Tracking is shown against each product below.",
    customerAction: null,
  },
});

/** The one extra sentence a refused payment adds, on top of the stage. */
export const PAYMENT_REJECTED_DETAIL =
  "A named Xenios operator could not verify a payment against this order. Nothing has been charged and nothing has been released. Contact Xenios support with your payment reference before sending anything further.";

export type EarlyAccessOrderInputs = Readonly<{
  /**
   * True when the SERVER resolved payment instructions for this checkout. Not
   * "the customer visited the payment screen": being shown where to pay is a
   * fact about what we published, not about what they scrolled past.
   */
  instructionsResolved?: boolean;
  /** The proof lane's customer-safe submission view, when one exists. */
  submission?: EarlyAccessSubmissionCustomerView | null;
  /** Server commitment, computed by the database. Never computed here. */
  shipByAt?: string | null;
  /** Clock for the overdue derivation. Supplied so tests are deterministic. */
  nowIso?: string | null;
}>;

function countShipped(status: EarlyAccessCartStatus): number {
  return status.fulfilment.childOrders.filter((release) => release.shippedAt !== null).length;
}

/**
 * The stage decision.
 *
 * Fulfilment outranks payment vocabulary because a released or shipped order
 * has visibly moved past the payment conversation.
 */
function decideStage(
  status: EarlyAccessCartStatus,
  inputs: EarlyAccessOrderInputs,
): EarlyAccessOrderStage {
  const childCount = status.checkout.children.length;
  const shippedCount = countShipped(status);

  if (childCount > 0 && shippedCount >= childCount) return "shipped";
  if (shippedCount > 0) return "partially_shipped";
  if (status.fulfilment.released) return "processing";
  if (status.payment.state === "payment_verified") return "payment_verified";

  // THE RESERVED / SUBMITTED BOUNDARY.
  //
  // `under_review` is the server saying an operator has the order. A recorded
  // external proof is the server saying someone asked for one. Either is a real
  // submission; a file sitting in a browser is not, which is why there is no
  // condition here for anything the client believes it did.
  if (status.payment.state === "under_review" || status.payment.externalProofCount > 0) {
    return "payment_review_required";
  }
  if (inputs.submission?.state === "accepted_for_review") return "payment_review_required";
  // Started but not finished. Explicitly short of submitted.
  if (inputs.submission?.state === "in_progress" || inputs.submission?.state === "needs_retry") {
    return "customer_submission_pending";
  }
  if (inputs.instructionsResolved === true) return "payment_instructions_shown";
  return "checkout_reserved";
}

export function projectEarlyAccessOrder(
  status: EarlyAccessCartStatus,
  inputs: EarlyAccessOrderInputs = {},
): EarlyAccessOrderProjection {
  const stage = decideStage(status, inputs);
  const copy = COPY[stage];
  const shipByAt = inputs.shipByAt ?? null;
  const nowIso = inputs.nowIso ?? null;
  return Object.freeze({
    stage,
    label: copy.label,
    detail: copy.detail,
    customerAction: copy.customerAction,
    // The server's own boolean, carried through untouched. Deriving this from
    // the stage would let a fulfilment signal imply a payment fact.
    paymentConfirmed: status.payment.paid === true,
    paymentRejected: status.payment.state === "payment_rejected",
    submittedForReview: rank(stage) >= rank("payment_review_required"),
    shipByAt,
    // The contract owns this arithmetic, so the customer screen and the
    // operator queue cannot disagree about who is late.
    overdue:
      shipByAt !== null && nowIso !== null
        ? earlyAccessIsOverdue({ stage, shipByAt, nowIso })
        : false,
    shippedCount: countShipped(status),
    childCount: status.checkout.children.length,
  });
}

/**
 * The projection for a checkout whose status has not been read back yet.
 *
 * A freshly confirmed checkout is RESERVED and nothing else. This exists so the
 * payment screen can state that plainly without waiting on a round trip, and so
 * that no screen has to invent a friendlier interim word for it.
 */
export function reservedEarlyAccessOrder(): EarlyAccessOrderProjection {
  const copy = COPY.checkout_reserved;
  return Object.freeze({
    stage: "checkout_reserved" as const,
    label: copy.label,
    detail: copy.detail,
    customerAction: copy.customerAction,
    paymentConfirmed: false,
    paymentRejected: false,
    submittedForReview: false,
    shipByAt: null,
    overdue: false,
    shippedCount: 0,
    childCount: 0,
  });
}
