/**
 * Early Access -> shared research notification outbox.
 *
 * There is ONE mail queue in this repository and this is not a second one: the
 * adapter writes into `research_notification_outbox` through the same
 * `enqueueNotification`, so Early Access inherits the unique `event_key`,
 * the durable attempt counter, the backoff schedule, the admin surface and the
 * Resend idempotency key that the founding-membership lane already proved.
 *
 * WHY THE PROJECTOR NEVER SENDS.
 *
 * Enqueue is a row insert. It is not a Resend call. A checkout must not be
 * able to fail because a mail provider is having a bad afternoon, so nothing
 * here awaits a provider: the worker (server/index.ts) picks the row up later
 * and retries it on its own schedule. Commerce and delivery are decoupled by
 * construction, not by a try/catch someone has to remember to write.
 */
import { enqueueNotification } from "../../outbox";
import {
  earlyAccessEventKey,
  earlyAccessTemplateKey,
  emailSafePaymentSummary,
  safeEarlyAccessPayload,
  type EarlyAccessEmailSafePayment,
} from "./communications";

/** One catalogue line as the customer sees it. Server figures only. */
export type EarlyAccessEmailLine = Readonly<{ name: string; quantity: number }>;

/**
 * The authenticated Early Access page. There is no public per-order lookup,
 * and this deliberately carries no token, customer reference or email: the
 * customer signs in, and the server decides what they may see.
 */
export const EARLY_ACCESS_STATUS_PATH = "/research/early-access";

export function earlyAccessStatusUrl(siteUrl?: string): string {
  const fallback = "https://xeniostechnology.com";
  let base = fallback;
  try {
    const configured = new URL((siteUrl ?? process.env.SITE_URL ?? "").trim() || fallback);
    if (configured.protocol === "https:") base = configured.origin;
  } catch {
    // A malformed deployment override cannot put an untrusted link in email.
  }
  return new URL(EARLY_ACCESS_STATUS_PATH, `${base}/`).toString();
}

/**
 * ORDER CREATED. At most one per cart checkout, keyed by the checkout number.
 *
 * `payment` is the REDUCED summary, not MIDDLE's presentation object: the
 * caller passes amount, reference and method labels, and destinations have no
 * field to travel in.
 */
export async function projectEarlyAccessCheckoutCreated(input: {
  cartCheckoutNumber: string;
  recipientEmail: string;
  customerName: string;
  invoiceNumber?: string;
  lines: readonly EarlyAccessEmailLine[];
  payment: EarlyAccessEmailSafePayment;
  statusUrl?: string;
}): Promise<boolean> {
  const payment = emailSafePaymentSummary(input.payment);
  return enqueueNotification({
    eventKey: earlyAccessEventKey.checkoutCreated(input.cartCheckoutNumber),
    eventType: "ea_checkout_created",
    templateKey: earlyAccessTemplateKey("ea_checkout_created"),
    recipient: input.recipientEmail,
    payload: safeEarlyAccessPayload("ea_checkout_created", {
      customerName: input.customerName,
      cartCheckoutNumber: input.cartCheckoutNumber,
      invoiceNumber: input.invoiceNumber,
      lines: input.lines.map((line) => ({ name: line.name, quantity: line.quantity })),
      amountDueDisplay: payment.amountDueDisplay,
      paymentReference: payment.paymentReference,
      methodLabels: [...payment.methodLabels],
      statusUrl: input.statusUrl ?? earlyAccessStatusUrl(),
    }),
  });
}

/**
 * PAYMENT VERIFIED. At most one per settlement identity.
 *
 * Keyed by the settlement identity rather than the checkout, so the named-admin
 * settlement retry path (which is itself idempotent) cannot produce a second
 * confirmation.
 */
export async function projectEarlyAccessPaymentVerified(input: {
  settlementIdentity: string;
  cartCheckoutNumber: string;
  recipientEmail: string;
  customerName: string;
  invoiceNumber?: string;
  verifiedAmountDisplay: string;
  receiptNumber?: string;
  statusUrl?: string;
}): Promise<boolean> {
  return enqueueNotification({
    eventKey: earlyAccessEventKey.paymentVerified(input.settlementIdentity),
    eventType: "ea_payment_verified",
    templateKey: earlyAccessTemplateKey("ea_payment_verified"),
    recipient: input.recipientEmail,
    payload: safeEarlyAccessPayload("ea_payment_verified", {
      customerName: input.customerName,
      cartCheckoutNumber: input.cartCheckoutNumber,
      invoiceNumber: input.invoiceNumber,
      verifiedAmountDisplay: input.verifiedAmountDisplay,
      receiptNumber: input.receiptNumber,
      statusUrl: input.statusUrl ?? earlyAccessStatusUrl(),
    }),
  });
}

/**
 * RELEASED / PROCESSING. At most one per durable child-release identity.
 *
 * Customer-facing only: the supplier that fulfils the line is deliberately not
 * a parameter, so no supplier identifier can reach a customer inbox.
 */
export async function projectEarlyAccessReleased(input: {
  releaseId: string;
  cartCheckoutNumber: string;
  recipientEmail: string;
  customerName: string;
  releaseReference?: string;
  lines?: readonly EarlyAccessEmailLine[];
  statusUrl?: string;
}): Promise<boolean> {
  return enqueueNotification({
    eventKey: earlyAccessEventKey.released(input.releaseId),
    eventType: "ea_order_released",
    templateKey: earlyAccessTemplateKey("ea_order_released"),
    recipient: input.recipientEmail,
    payload: safeEarlyAccessPayload("ea_order_released", {
      customerName: input.customerName,
      cartCheckoutNumber: input.cartCheckoutNumber,
      releaseReference: input.releaseReference,
      lines: (input.lines ?? []).map((line) => ({ name: line.name, quantity: line.quantity })),
      statusUrl: input.statusUrl ?? earlyAccessStatusUrl(),
    }),
  });
}

/**
 * SUBMITTED FOR PAYMENT REVIEW. At most one per durable proof identity, so a
 * resubmission (a new proof) confirms again while a retried upload of the
 * same proof cannot double-mail. No proof metadata rides along: the template
 * confirms that a submission arrived, it is not a receipt for the file.
 */
export async function projectEarlyAccessSubmittedForReview(input: {
  proofId: string;
  orderNumber: string;
  recipientEmail: string;
  customerName?: string;
  invoiceNumber?: string;
  paymentReference?: string;
  statusUrl?: string;
}): Promise<boolean> {
  return enqueueNotification({
    eventKey: earlyAccessEventKey.submittedForReview(input.proofId),
    eventType: "ea_submitted_for_review",
    templateKey: earlyAccessTemplateKey("ea_submitted_for_review"),
    recipient: input.recipientEmail,
    payload: safeEarlyAccessPayload("ea_submitted_for_review", {
      customerName: input.customerName,
      // The template's field name predates the legacy wiring; the value is
      // whichever durable commerce number the customer knows the order by.
      cartCheckoutNumber: input.orderNumber,
      invoiceNumber: input.invoiceNumber,
      paymentReference: input.paymentReference,
      statusUrl: input.statusUrl ?? earlyAccessStatusUrl(),
    }),
  });
}

/**
 * PAYMENT REJECTED / NEEDS ATTENTION. At most one per reviewed proof, so a
 * rejection of a NEWER submission mails again while a replayed rejection of
 * the same proof cannot. Deliberately carries no reason text and no operator
 * identity: those are internal records, and the actionable detail lives on
 * the authenticated page.
 */
export async function projectEarlyAccessPaymentRejected(input: {
  reviewedProofId: string;
  orderNumber: string;
  recipientEmail: string;
  customerName?: string;
  invoiceNumber?: string;
  paymentReference?: string;
  statusUrl?: string;
}): Promise<boolean> {
  return enqueueNotification({
    eventKey: earlyAccessEventKey.paymentRejected(input.reviewedProofId),
    eventType: "ea_payment_rejected",
    templateKey: earlyAccessTemplateKey("ea_payment_rejected"),
    recipient: input.recipientEmail,
    payload: safeEarlyAccessPayload("ea_payment_rejected", {
      customerName: input.customerName,
      cartCheckoutNumber: input.orderNumber,
      invoiceNumber: input.invoiceNumber,
      paymentReference: input.paymentReference,
      statusUrl: input.statusUrl ?? earlyAccessStatusUrl(),
    }),
  });
}

/**
 * TRACKING. At most one per durable tracking-event identity.
 *
 * SEAM, NOT YET CONNECTED. Early Access has no durable customer-facing
 * tracking event today (migration 60 records external proofs, receipts, child
 * releases and a supplier outbox, and none of them carries a carrier or a
 * tracking reference). Rather than invent a state, this stays a function
 * waiting for a real identity: when TOP persists tracking, it passes that
 * row's id as `trackingEventId` and the idempotency holds automatically.
 */
export async function projectEarlyAccessTracking(input: {
  trackingEventId: string;
  cartCheckoutNumber: string;
  recipientEmail: string;
  customerName: string;
  carrierLabel?: string;
  trackingReference?: string;
  statusUrl?: string;
}): Promise<boolean> {
  return enqueueNotification({
    eventKey: earlyAccessEventKey.tracking(input.trackingEventId),
    eventType: "ea_tracking_posted",
    templateKey: earlyAccessTemplateKey("ea_tracking_posted"),
    recipient: input.recipientEmail,
    payload: safeEarlyAccessPayload("ea_tracking_posted", {
      customerName: input.customerName,
      cartCheckoutNumber: input.cartCheckoutNumber,
      carrierLabel: input.carrierLabel,
      trackingReference: input.trackingReference,
      statusUrl: input.statusUrl ?? earlyAccessStatusUrl(),
    }),
  });
}
