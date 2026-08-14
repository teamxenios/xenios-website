/**
 * Early Access customer transactional email: events, template keys, the
 * email-safe payload projection, and the renderers.
 *
 * WHY THE PAYMENT DESTINATION IS NOT HERE.
 *
 * `assertEmailPayloadSafe` (membership-activation/emails.ts) refuses any
 * payload key that smells like receiving material: instruction, receiving,
 * destination, handle, cashtag, account, routing, iban, deep link. That policy
 * predates Early Access and it is deliberate: receiving instructions never
 * travel in email, because email is an unauthenticated channel that forwards,
 * archives and leaks.
 *
 * So the customer email carries what identifies the order and what the
 * customer must quote (the payment reference), plus the METHOD LABELS so they
 * know which rails are available, plus a link back to the authenticated Early
 * Access page where the real destinations live. The destinations stay behind
 * the access wall.
 *
 * `emailSafePaymentSummary` enforces that STRUCTURALLY rather than by promise:
 * it builds a fresh object from three named fields, so a caller that hands it
 * a full payment presentation carrying `destinationValue` or `copyValue`
 * cannot leak it, whatever the caller intended. `assertEmailPayloadSafe` then
 * runs again at render time as the second, independent boundary.
 */
import { assertEmailPayloadSafe } from "../../membership-activation/emails";

export const EARLY_ACCESS_EMAIL_EVENTS = [
  /**
   * Checkout RESERVED. Units are held and an invoice exists. Nothing has been
   * paid and nothing has been submitted. The customer still has to pay and then
   * upload their confirmation.
   */
  "ea_checkout_created",
  /**
   * Order SUBMITTED FOR PAYMENT REVIEW. The customer's payment confirmation
   * reached us and a named operator now has to verify the transfer arrived.
   * This is not payment verification and it never implies one.
   */
  "ea_submitted_for_review",
  "ea_payment_verified",
  "ea_order_released",
  "ea_tracking_posted",
  /**
   * THE ONE INTERNAL EVENT IN THIS FAMILY, and it is deliberately last.
   *
   * Every event above is addressed to a customer. This one is addressed to the
   * named operators: a settled order has passed its 72-hour shipping
   * commitment and nobody has recorded a shipment. It exists because an SLA a
   * human never hears about is not an SLA.
   *
   * It carries THREE fields and no more (the checkout number and the two
   * instants) because it goes to an inbox, and the customer's name, address,
   * amount, reference, proof and supplier are all things an operations alert
   * does not need in order to say "this one is late, go and look".
   */
  "ea_shipping_overdue_internal",
] as const;

export type EarlyAccessEmailEvent = (typeof EARLY_ACCESS_EMAIL_EVENTS)[number];

/** Template keys are the event names, prefixed so the dispatch switch cannot collide. */
export function earlyAccessTemplateKey(event: EarlyAccessEmailEvent): string {
  return event;
}

// ---------------------------------------------------------------------------
// Durable event identities
// ---------------------------------------------------------------------------

/**
 * Event keys are built from DURABLE COMMERCE FACTS, never from a browser
 * idempotency key, a session id or any UI state. A retried projection of the
 * same business fact produces the same key, and the unique index on
 * `event_key` turns that into "at most one email" as a database guarantee.
 */
export const earlyAccessEventKey = Object.freeze({
  checkoutCreated: (cartCheckoutNumber: string) => `ea:checkout-created:${cartCheckoutNumber}`,
  paymentVerified: (settlementIdentity: string) => `ea:payment-verified:${settlementIdentity}`,
  released: (releaseId: string) => `ea:release:${releaseId}`,
  tracking: (trackingEventId: string) => `ea:tracking:${trackingEventId}`,
  /**
   * Keyed by the durable proof identity, not the order: a resubmission after
   * a rejection is a NEW submission and deserves its own confirmation, while
   * a retried upload of the SAME proof stays one email.
   */
  submittedForReview: (proofId: string) => `ea:submitted-for-review:${proofId}`,
});

// ---------------------------------------------------------------------------
// The email-safe payment projection
// ---------------------------------------------------------------------------

/**
 * The ONLY payment shape an Early Access email may carry.
 *
 * MIDDLE's payment presentation is richer and belongs on the authenticated
 * page. This is the reduced projection the email lane accepts.
 */
export type EarlyAccessEmailSafePayment = Readonly<{
  amountDueDisplay: string;
  paymentReference: string;
  methodLabels: readonly string[];
}>;

/**
 * Reduce anything payment-shaped to the three email-safe fields.
 *
 * Structural, not advisory: the return value is a NEW object built from three
 * reads. Extra keys on the input are not copied, so they cannot reach an
 * email even if a future caller passes the full presentation object.
 */
export function emailSafePaymentSummary(input: {
  amountDueDisplay?: unknown;
  paymentReference?: unknown;
  methodLabels?: unknown;
}): EarlyAccessEmailSafePayment {
  const labels = Array.isArray(input.methodLabels)
    ? input.methodLabels.filter((label): label is string => typeof label === "string" && label.trim().length > 0)
    : [];
  return Object.freeze({
    amountDueDisplay: typeof input.amountDueDisplay === "string" ? input.amountDueDisplay : "",
    paymentReference: typeof input.paymentReference === "string" ? input.paymentReference : "",
    methodLabels: Object.freeze([...labels]),
  });
}

// ---------------------------------------------------------------------------
// Per-event payload allowlists
// ---------------------------------------------------------------------------

const ALLOWED_KEYS: Readonly<Record<EarlyAccessEmailEvent, readonly string[]>> = Object.freeze({
  ea_checkout_created: [
    "customerName",
    "cartCheckoutNumber",
    "invoiceNumber",
    "lines",
    "amountDueDisplay",
    "paymentReference",
    "methodLabels",
    "statusUrl",
  ],
  // No proof metadata here on purpose. Not the filename, not the digest, not
  // the provider message id, not the internal recipient. This email confirms
  // that a submission arrived; it is not a receipt for the file.
  ea_submitted_for_review: [
    "customerName",
    "cartCheckoutNumber",
    "invoiceNumber",
    "paymentReference",
    "statusUrl",
  ],
  ea_payment_verified: [
    "customerName",
    "cartCheckoutNumber",
    "invoiceNumber",
    "verifiedAmountDisplay",
    "receiptNumber",
    "statusUrl",
  ],
  ea_order_released: ["customerName", "cartCheckoutNumber", "releaseReference", "lines", "statusUrl"],
  ea_tracking_posted: [
    "customerName",
    "cartCheckoutNumber",
    "carrierLabel",
    "trackingReference",
    "statusUrl",
  ],
  // No customerName, no statusUrl, no amount, no reference, no supplier. An
  // operations alert names the order and the two instants; everything else is
  // behind the admin login where it belongs.
  ea_shipping_overdue_internal: ["cartCheckoutNumber", "shipByAt", "overdueAt"],
});

/**
 * Keep only the keys this event is allowed to carry, then run the shared
 * forbidden-key screen. Two independent boundaries: an allowlist that drops
 * anything unexpected, and the repository-wide refusal that throws.
 */
export function safeEarlyAccessPayload(
  event: EarlyAccessEmailEvent,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = ALLOWED_KEYS[event] ?? [];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) out[key] = payload[key];
  }
  assertEmailPayloadSafe(out);
  return out;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

const SIGNOFF = "Xenios Research\nresearch@xeniostechnology.com";

/** "2 x BPC-157 5 mg" per line, from the server's own figures. */
function renderLines(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((line) => {
      const item = line as { name?: unknown; quantity?: unknown };
      const name = typeof item?.name === "string" ? item.name : "";
      const quantity = typeof item?.quantity === "number" ? item.quantity : null;
      if (!name) return "";
      return quantity === null ? `- ${name}` : `- ${quantity} x ${name}`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

/**
 * Render one Early Access template, or null when the key is not ours so the
 * dispatch switch falls through to its other branches unchanged.
 */
export function renderEarlyAccessOutboxEmail(
  templateKey: string,
  payload: Record<string, unknown>,
): { subject: string; text: string } | null {
  if (!(EARLY_ACCESS_EMAIL_EVENTS as readonly string[]).includes(templateKey)) return null;
  // The second, independent boundary. A row inserted by hand with a
  // destination in it is refused here rather than sent.
  assertEmailPayloadSafe(payload);

  const name = str(payload, "customerName") || "there";
  const checkout = str(payload, "cartCheckoutNumber");
  const statusUrl = str(payload, "statusUrl");
  const signIn = statusUrl
    ? `Sign in to your Xenios Research order page to view the available payment methods and payment details:\n${statusUrl}`
    : "Sign in to your Xenios Research order page to view the available payment methods and payment details.";

  switch (templateKey as EarlyAccessEmailEvent) {
    // RESERVED IS NOT SUBMITTED, AND THIS EMAIL USED TO SAY OTHERWISE.
    //
    // It read "We have your Early Access order" and was subjected "Your Early
    // Access order", and it fires at checkout confirm, when no payment has been
    // made and no proof has been sent. The customer was being told their order
    // was with us before they had done the two things that actually submit it.
    // Once proof submission became the real operational submission, that email
    // contradicted the journey in the customer's own inbox.
    //
    // The event key and the template key are DELIBERATELY unchanged, so the
    // existing founder checkout keeps its notification identity and needs no
    // reissuing. Only the words the customer reads have moved.
    case "ea_checkout_created": {
      const labels = Array.isArray(payload.methodLabels)
        ? (payload.methodLabels as unknown[]).filter((l): l is string => typeof l === "string")
        : [];
      const lines = renderLines(payload.lines);
      const text = [
        `Hello ${name},`,
        `Your Early Access checkout ${checkout} is reserved. It is not submitted yet, and nothing has been charged.`,
        lines ? `What you reserved:\n${lines}` : "",
        str(payload, "invoiceNumber") ? `Invoice: ${str(payload, "invoiceNumber")}` : "",
        str(payload, "amountDueDisplay") ? `Amount due: ${str(payload, "amountDueDisplay")}` : "",
        str(payload, "paymentReference") ? `Payment reference: ${str(payload, "paymentReference")}` : "",
        labels.length > 0 ? `Available payment methods: ${labels.join(", ")}` : "",
        "Use your payment reference when completing payment.",
        "Two steps remain. Complete the payment yourself using one of the methods above, then upload your payment confirmation on your order page. Your order is submitted for review only once that upload succeeds, and we will email you when it does.",
        signIn,
        SIGNOFF,
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");
      return { subject: `Your Early Access checkout ${checkout} is reserved`, text };
    }
    // The acknowledgement that the customer's proof actually arrived. This is
    // the email the old one was pretending to be.
    //
    // It says accepted for review and nothing stronger. A named operator still
    // has to confirm the transfer arrived, and the upload did not confirm it.
    case "ea_submitted_for_review": {
      const text = [
        `Hello ${name},`,
        `Your Early Access order ${checkout} is submitted for payment review.`,
        "We have your payment confirmation and the order is with a named member of the Xenios team.",
        str(payload, "invoiceNumber") ? `Invoice: ${str(payload, "invoiceNumber")}` : "",
        str(payload, "paymentReference") ? `Payment reference: ${str(payload, "paymentReference")}` : "",
        "Your payment is not verified yet. Uploading the confirmation does not verify it, and no supplier has been released. We will email you again when a named operator has confirmed the transfer arrived.",
        signIn,
        SIGNOFF,
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");
      return { subject: `Early Access order ${checkout} submitted for review`, text };
    }
    case "ea_payment_verified": {
      const text = [
        `Hello ${name},`,
        `Your payment for Early Access order ${checkout} has been verified by a named member of the Xenios team.`,
        str(payload, "verifiedAmountDisplay") ? `Amount verified: ${str(payload, "verifiedAmountDisplay")}` : "",
        str(payload, "invoiceNumber") ? `Invoice: ${str(payload, "invoiceNumber")}` : "",
        str(payload, "receiptNumber") ? `Receipt: ${str(payload, "receiptNumber")}` : "",
        "Expected to ship within 72 hours after payment verification.",
        statusUrl ? `Your order page:\n${statusUrl}` : "",
        SIGNOFF,
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");
      return { subject: `Payment received for ${checkout}`, text };
    }
    case "ea_order_released": {
      const lines = renderLines(payload.lines);
      const text = [
        `Hello ${name},`,
        `Your Early Access order ${checkout} is being prepared.`,
        "Expected to ship within 72 hours after payment verification.",
        lines ? `Items:\n${lines}` : "",
        str(payload, "releaseReference") ? `Reference: ${str(payload, "releaseReference")}` : "",
        statusUrl ? `Your order page:\n${statusUrl}` : "",
        SIGNOFF,
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");
      return { subject: `Your order ${checkout} is being prepared`, text };
    }
    case "ea_tracking_posted": {
      const text = [
        `Hello ${name},`,
        `Your Early Access order ${checkout} is on its way.`,
        str(payload, "carrierLabel") ? `Carrier: ${str(payload, "carrierLabel")}` : "",
        str(payload, "trackingReference") ? `Tracking: ${str(payload, "trackingReference")}` : "",
        statusUrl ? `Your order page:\n${statusUrl}` : "",
        SIGNOFF,
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");
      return { subject: `Your order ${checkout} has shipped`, text };
    }
    // INTERNAL. Addressed to the named operators, never to a customer.
    //
    // It deliberately does not greet anybody, does not link the customer's
    // order page, and states what it is: a durable deadline has passed with no
    // shipment recorded. It asserts nothing about why, because the sweep that
    // raised it read two timestamps and a stage and knows nothing else.
    case "ea_shipping_overdue_internal": {
      const shipBy = str(payload, "shipByAt");
      const overdueAt = str(payload, "overdueAt");
      const text = [
        `Early Access order ${checkout} has passed its 72-hour shipping commitment with no shipment recorded.`,
        shipBy ? `Ship-by (UTC): ${shipBy}` : "",
        overdueAt ? `Detected overdue at (UTC): ${overdueAt}` : "",
        "This is an operations alert. Nothing has been settled, refunded, shipped or sent to the customer by it. Open the order in Early Access admin to see the current state and decide what to do.",
        SIGNOFF,
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");
      return { subject: `OVERDUE: Early Access order ${checkout} is past its ship-by`, text };
    }
  }
}
