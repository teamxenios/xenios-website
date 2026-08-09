/**
 * WHERE THE PAYMENT LANE AND THE EMAIL LANE MEET, AND THE ONLY PLACE THEY DO.
 *
 * The payment lane builds a presentation that CONTAINS the destination: a
 * Zelle address, a cashtag, a bank line. The email lane must never see it. So
 * this adapter is deliberately the single point of contact between them, and
 * the reduction happens here, in one expression, where a reviewer can see it:
 *
 *     emailSafePaymentSummary(presentation)
 *
 * That returns a NEW object built from three reads (amount, reference, method
 * labels). It is structural rather than a promise: extra keys are not copied,
 * so `destinationValue` and `copyValue` have no field to travel in even if
 * someone later passes the whole presentation. The outbox renderer then refuses
 * a payload carrying receiving material as a second, independent check.
 *
 * The customer gets an amount, a reference, the NAMES of the methods available,
 * and a link to the authenticated page. Where to actually send money stays
 * behind the login, which is the point: an inbox is not an authenticated
 * surface, and a payment destination in one is a phishing template.
 *
 * IDENTITIES ARE DURABLE, NEVER THE BROWSER'S. Order mail is keyed by the cart
 * checkout number and settlement mail by the settlement identity, both of which
 * the database issued. The browser's idempotency key is per-attempt: keying on
 * it would have sent one email per attempt, which is the same defect in a
 * different costume.
 */

import {
  emailSafePaymentSummary,
} from "../notifications/communications";
import {
  projectEarlyAccessCheckoutCreated,
  projectEarlyAccessPaymentVerified,
  projectEarlyAccessReleased,
} from "../notifications/outbox-adapter";
import {
  buildEarlyAccessPaymentInstructionsPresentation,
  parseEarlyAccessPaymentInstructionsConfig,
  type EarlyAccessPaymentInstructionsConfigSource,
} from "../commerce/payment-instructions-config";
import { resolveEarlyAccessPaymentOptionsPresentation } from "../../commerce/manual-order-payment-method-adapter";
import type {
  ManualPaymentClockPort,
  ManualPaymentMethodRegistryPort,
} from "../../commerce/manual-order-payments";
import type { EarlyAccessCartNotifier } from "./notifications-port";
import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartSettlement,
} from "@shared/research/early-access-cart";

export interface EarlyAccessOutboxNotifierDeps {
  readonly config: EarlyAccessPaymentInstructionsConfigSource;
  readonly methodRegistry: ManualPaymentMethodRegistryPort;
  readonly clock: ManualPaymentClockPort;
  /** Absolute site origin for the status link. Optional; the adapter defaults. */
  readonly siteUrl?: string;
}

/** The customer's own address, from the order they placed. Never a lookup. */
function recipientOf(checkout: EarlyAccessCartCheckoutRecord): string | null {
  const email = checkout.contact?.email;
  return typeof email === "string" && email.includes("@") ? email : null;
}

function nameOf(checkout: EarlyAccessCartCheckoutRecord): string {
  const name = checkout.shipTo?.recipientName;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : "there";
}

/** SKU and quantity only. No supplier, no supplier SKU, no wholesale price. */
function linesOf(checkout: EarlyAccessCartCheckoutRecord) {
  return checkout.children.map((child) => ({
    name: child.sku,
    quantity: child.quantity,
  }));
}

export function createEarlyAccessOutboxNotifier(
  deps: EarlyAccessOutboxNotifierDeps,
): EarlyAccessCartNotifier {
  /**
   * The same projection the payment route serves, rebuilt server-side.
   *
   * Rebuilt rather than passed in from the request, because the email is
   * produced on the server's own authority: an amount that travelled through a
   * browser is not one to put in a payment instruction.
   */
  function paymentFor(checkout: EarlyAccessCartCheckoutRecord) {
    const parsed = parseEarlyAccessPaymentInstructionsConfig(deps.config.read());
    if (parsed.state !== "accepted") {
      // No configuration yet. The customer still gets their order number,
      // amount-free, with the reference and a link to the page that will show
      // the methods once they are configured. Better than no mail at all, and
      // far better than an invented amount.
      return emailSafePaymentSummary({
        paymentReference: checkout.invoice.paymentReference,
      });
    }
    let enabled: ReturnType<typeof resolveEarlyAccessPaymentOptionsPresentation>;
    try {
      enabled = resolveEarlyAccessPaymentOptionsPresentation({
        methodRegistry: deps.methodRegistry,
        clock: deps.clock,
      });
    } catch {
      return emailSafePaymentSummary({
        paymentReference: checkout.invoice.paymentReference,
      });
    }
    const presentation = buildEarlyAccessPaymentInstructionsPresentation({
      config: parsed.value,
      enabledCodes: enabled.state === "resolved" ? enabled.codes : [],
      amountDueCents: checkout.invoice.payableTotalCents,
      currency: checkout.invoice.currency,
      paymentReference: checkout.invoice.paymentReference,
    });
    if (presentation.state !== "resolved") {
      return emailSafePaymentSummary({
        paymentReference: checkout.invoice.paymentReference,
      });
    }
    // THE REDUCTION. Everything else on `presentation`, destinations included,
    // stops here.
    return emailSafePaymentSummary({
      amountDueDisplay: presentation.amountDueDisplay,
      paymentReference: presentation.paymentReference,
      methodLabels: presentation.methods.map((method) => method.methodName),
    });
  }

  const notifier: EarlyAccessCartNotifier = {
    async checkoutCreated({ checkout, replayed }): Promise<void> {
      if (replayed) return;
      const recipient = recipientOf(checkout);
      if (recipient === null) return;
      await projectEarlyAccessCheckoutCreated({
        cartCheckoutNumber: checkout.cartCheckoutNumber,
        recipientEmail: recipient,
        customerName: nameOf(checkout),
        invoiceNumber: checkout.invoice.invoiceNumber,
        lines: linesOf(checkout),
        payment: paymentFor(checkout),
        statusUrl: deps.siteUrl,
      });
    },

    async settled({ settlement, checkout }): Promise<void> {
      const recipient = recipientOf(checkout);
      if (recipient === null) return;

      // The settlement identity, not the checkout: a settlement retry is the
      // same business fact and must not produce a second confirmation.
      const settlementIdentity = `${settlement.cartCheckoutNumber}:${settlement.externalTransactionId}`;

      await projectEarlyAccessPaymentVerified({
        settlementIdentity,
        cartCheckoutNumber: settlement.cartCheckoutNumber,
        recipientEmail: recipient,
        customerName: nameOf(checkout),
        invoiceNumber: checkout.invoice.invoiceNumber,
        // The amount the operator actually VERIFIED, in the settlement's own
        // words, rather than what was once due.
        verifiedAmountDisplay: `${(settlement.verifiedAmountCents / 100).toFixed(2)} ${settlement.verifiedCurrency}`,
        receiptNumber: settlement.receipt?.receiptId,
        statusUrl: deps.siteUrl,
      });

      // ONE release email for the whole cart. The customer-visible event is
      // "my order is being processed", which happens once no matter how many
      // products the cart holds, so the identity is the settlement and the
      // lines are listed inside. Keying per child release would send five
      // emails for a five-product cart.
      if (settlement.childReleases.length > 0) {
        await projectEarlyAccessReleased({
          releaseId: settlementIdentity,
          cartCheckoutNumber: settlement.cartCheckoutNumber,
          recipientEmail: recipient,
          customerName: nameOf(checkout),
          lines: linesOf(checkout),
          statusUrl: deps.siteUrl,
        });
      }
    },
  };
  return Object.freeze(notifier);
}
