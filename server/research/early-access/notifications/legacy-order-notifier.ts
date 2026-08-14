/**
 * Order-lifecycle notifications for the LEGACY single-order Early Access
 * flow: the door Roman Health actually buys through.
 *
 * The cart lane already meets the email lane in ONE adapter
 * (cart/outbox-notifier.ts); this is the same meeting for the legacy door,
 * over the same durable outbox, the same event family, the same payload
 * reducers, and the same discipline:
 *
 *   - MAIL NEVER BLOCKS MONEY. Every method here is fire-and-forget: it
 *     kicks the enqueue and swallows its failure into a log line. The order,
 *     the proof, and the settlement are the durable facts; a notification
 *     that could refuse them would have its priorities inverted. The outbox
 *     row (once inserted) is the durable retry surface for the send itself.
 *   - IDENTITIES ARE DURABLE. Order mail is keyed by the order number,
 *     submission mail by the proof id, confirmation mail by the settlement's
 *     verification identity. Replays and retries collapse onto the unique
 *     event_key in the database.
 *   - NO DESTINATION MATERIAL. The placed email carries the amount, the
 *     payment reference, and the authenticated status link. Where to send
 *     money stays behind the login; `safeEarlyAccessPayload` and the
 *     renderer both refuse receiving material independently.
 *   - The recipient is the SERVER-DERIVED order contact, never a
 *     body-supplied address.
 */

import type { EarlyAccessPlacement } from "../routes/store";
import type { EarlyAccessSettlement } from "../routes/store";
import {
  projectEarlyAccessCheckoutCreated,
  projectEarlyAccessPaymentRejected,
  projectEarlyAccessPaymentVerified,
  projectEarlyAccessSubmittedForReview,
} from "./outbox-adapter";

/** The three projections this notifier drives, injectable for tests. */
export interface LegacyOrderProjections {
  readonly placed: typeof projectEarlyAccessCheckoutCreated;
  readonly submitted: typeof projectEarlyAccessSubmittedForReview;
  readonly verified: typeof projectEarlyAccessPaymentVerified;
  readonly rejected: typeof projectEarlyAccessPaymentRejected;
}

export interface EarlyAccessLegacyOrderNotifier {
  /** After the placement AND its invoice are durably committed. */
  orderPlaced(placement: EarlyAccessPlacement): void;
  /** After a payment-proof submission is durably recorded. */
  proofSubmitted(placement: EarlyAccessPlacement, proofId: string): void;
  /** After a settlement is durably committed by a named admin. */
  paymentVerified(placement: EarlyAccessPlacement, settlement: EarlyAccessSettlement): void;
  /** After a rejection decision is durably recorded by a named admin. */
  paymentRejected(placement: EarlyAccessPlacement, reviewedProofId: string): void;
}

/** The default: no notifier configured, no behaviour at all. */
export const NO_LEGACY_ORDER_NOTIFIER: EarlyAccessLegacyOrderNotifier = Object.freeze({
  orderPlaced: () => {},
  proofSubmitted: () => {},
  paymentVerified: () => {},
  paymentRejected: () => {},
});

/** "$24.64 USD" from integer cents; never invents a price of its own. */
function displayCents(cents: number, currency: string): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return "";
  const dollars = (cents / 100).toFixed(2);
  return currency === "USD" ? `$${dollars} USD` : `${dollars} ${currency}`;
}

function contactEmail(placement: EarlyAccessPlacement): string | null {
  const email = placement.contact?.email;
  return typeof email === "string" && email.includes("@") ? email : null;
}

export function createOutboxLegacyOrderNotifier(options: {
  readonly siteUrl?: string;
  readonly projections?: LegacyOrderProjections;
  readonly warn?: (message: string) => void;
} = {}): EarlyAccessLegacyOrderNotifier {
  const warn = options.warn ?? ((message: string) => {
    // eslint-disable-next-line no-console
    console.warn(`[legacy-order-mail] ${message}`);
  });
  const projections: LegacyOrderProjections = options.projections ?? {
    placed: projectEarlyAccessCheckoutCreated,
    submitted: projectEarlyAccessSubmittedForReview,
    verified: projectEarlyAccessPaymentVerified,
    rejected: projectEarlyAccessPaymentRejected,
  };
  const statusUrl = options.siteUrl
    ? `${options.siteUrl.replace(/\/+$/, "")}/research/early-access`
    : undefined;

  // Fire-and-forget with the failure named: mail is best-effort, and the log
  // line is the only place a lost enqueue is visible, so it says which one.
  const settle = (label: string, work: Promise<boolean>): void => {
    void work
      .then((enqueued) => {
        if (!enqueued) warn(`${label}: outbox unavailable, notification not queued`);
      })
      .catch((error: unknown) => {
        warn(`${label}: ${error instanceof Error ? error.message : "enqueue failed"}`);
      });
  };

  return {
    orderPlaced(placement) {
      const email = contactEmail(placement);
      if (email === null) return;
      const order = placement.order.order;
      settle(`order-placed ${placement.orderNumber}`, projections.placed({
        cartCheckoutNumber: placement.orderNumber,
        recipientEmail: email,
        customerName: "",
        invoiceNumber: placement.invoice.invoiceNumber,
        lines: [{ name: order.line.sku, quantity: order.line.quantity }],
        payment: {
          amountDueDisplay: displayCents(order.money.payableTotalCents, order.currency),
          paymentReference: placement.invoice.paymentReference,
          // Deliberately empty: the legacy door's method registry lives behind
          // the authenticated payment-instructions page, and the renderer's
          // sign-in line already points there. An empty list adds nothing to
          // an inbox and can leak nothing.
          methodLabels: [],
        },
        ...(statusUrl === undefined ? {} : { statusUrl }),
      }));
    },

    proofSubmitted(placement, proofId) {
      const email = contactEmail(placement);
      if (email === null) return;
      settle(`proof-submitted ${placement.orderNumber}`, projections.submitted({
        proofId,
        orderNumber: placement.orderNumber,
        recipientEmail: email,
        invoiceNumber: placement.invoice.invoiceNumber,
        paymentReference: placement.invoice.paymentReference,
        ...(statusUrl === undefined ? {} : { statusUrl }),
      }));
    },

    paymentVerified(placement, settlement) {
      const email = contactEmail(placement);
      if (email === null) return;
      const verification = settlement.verification;
      settle(`payment-verified ${placement.orderNumber}`, projections.verified({
        // A legacy order settles at most once (the admin door refuses a second
        // settlement), so the order number IS the at-most-once mail identity.
        settlementIdentity: placement.orderNumber,
        cartCheckoutNumber: placement.orderNumber,
        recipientEmail: email,
        customerName: "",
        invoiceNumber: placement.invoice.invoiceNumber,
        verifiedAmountDisplay: displayCents(
          verification.amountVerifiedCents,
          placement.order.order.currency,
        ),
        receiptNumber: settlement.receipt.receiptId,
        ...(statusUrl === undefined ? {} : { statusUrl }),
      }));
    },

    paymentRejected(placement, reviewedProofId) {
      const email = contactEmail(placement);
      if (email === null) return;
      settle(`payment-rejected ${placement.orderNumber}`, projections.rejected({
        reviewedProofId,
        orderNumber: placement.orderNumber,
        recipientEmail: email,
        invoiceNumber: placement.invoice.invoiceNumber,
        paymentReference: placement.invoice.paymentReference,
        ...(statusUrl === undefined ? {} : { statusUrl }),
      }));
    },
  };
}
