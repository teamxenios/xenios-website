/**
 * THE INTERNAL SUBMITTED-ORDER EMAIL.
 *
 * This is the ONE place proof bytes leave the process, and it is a direct
 * provider send rather than an outbox enqueue. That is a deliberate departure
 * from every other email in this repository, and the reason is the founder
 * architecture: the outbox is durable, which means anything handed to it is
 * written down, and proof bytes must never be written down. A durable queue
 * and a transient attachment are incompatible by definition, so the attachment
 * goes straight out and only its metadata is persisted.
 *
 * ONE RECIPIENT, FIXED IN CODE. `research@xeniostechnology.com`. Not
 * configurable, not overridable by a request, not read from an environment
 * variable that a misconfiguration could point elsewhere. The sender refuses
 * any other recipient, so the blast radius of a mistake anywhere upstream is
 * zero.
 *
 * WHAT THE PACKET CONTAINS. Everything an operator needs to act without
 * opening another system: who ordered, what they ordered in real product
 * language, the money, the payment reference, the method the customer selected,
 * the file's fingerprint, and the exact next action. What it deliberately omits
 * is any payment DESTINATION, because a destination in an unauthenticated,
 * forwarding, archiving channel is how manual payment rails get attacked.
 *
 * PRODUCT NAMES ARE REAL NAMES. The accelerator printed the SKU as the product
 * and a variant UUID as the variant, because the child order record carries no
 * display name. An operator reading "a3f1c2de-..." cannot check an order. So
 * the packet is built from an enrichment port, and when enrichment cannot
 * answer, the line says so explicitly instead of presenting an opaque id as if
 * it were a product.
 */

import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartChildOrder,
} from "@shared/research/early-access-cart";
import { EARLY_ACCESS_INTERNAL_RECIPIENT } from "../hardening-contract";
import { assertNoProofBytes } from "./transient-proof";
import type { ProofSubmissionRow } from "./submission-record";

/**
 * The only address this lane may send to.
 *
 * RE-EXPORTED FROM THE FROZEN CONTRACT, not restated. Two copies of a
 * destination drift, and the copy that drifts is the one nobody notices.
 */
export const INTERNAL_ORDER_EMAIL_RECIPIENT = EARLY_ACCESS_INTERNAL_RECIPIENT;

/** Resolves a purchasable unit to the language a human uses for it. */
export interface ProductDisplayPort {
  /** Null when this unit cannot be resolved. Never a guess. */
  describe(input: {
    readonly productId: string;
    readonly variantId: string;
  }): Promise<Readonly<{ displayName: string; strength: string }> | null>;
}

/** One line of the packet, already resolved to human language. */
export type InternalOrderLine = Readonly<{
  orderNumber: string;
  /** The real product name, or an explicit unresolved marker. Never a UUID. */
  product: string;
  strength: string;
  sku: string;
  quantity: number;
  unitPriceDisplay: string;
  payableDisplay: string;
  /** True when the catalogue could not name this unit. */
  displayUnresolved: boolean;
}>;

export type InternalOrderPacket = Readonly<{
  cartCheckoutNumber: string;
  invoiceNumber: string;
  paymentReference: string;
  placedAt: string;
  submittedAt: string;
  submissionId: string;
  customerEmail: string;
  customerPhone: string;
  shipTo: readonly string[];
  lines: readonly InternalOrderLine[];
  subtotalDisplay: string;
  discountDisplay: string;
  shippingDisplay: string;
  taxDisplay: string;
  payableTotalDisplay: string;
  methodLabel: string;
  methodCode: string;
  governanceVersion: string;
  proofFilename: string;
  proofContentType: string;
  proofByteSizeDisplay: string;
  proofSha256: string;
  proofFilenameRewritten: boolean;
}>;

function money(cents: number, currency: string): string {
  if (!Number.isFinite(cents)) return "unavailable";
  const amount = (Math.round(cents) / 100).toFixed(2);
  return `${currency} ${amount}`;
}

function byteSizeDisplay(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Build the packet.
 *
 * Enrichment failures are recorded per line rather than failing the email. An
 * operator with an unresolved product name and a correct SKU can still act; an
 * operator with no email at all cannot.
 */
export async function buildInternalOrderPacket(input: {
  readonly checkout: EarlyAccessCartCheckoutRecord;
  readonly submission: ProofSubmissionRow;
  readonly filenameRewritten: boolean;
  readonly products: ProductDisplayPort;
}): Promise<InternalOrderPacket> {
  const { checkout, submission } = input;
  const currency = checkout.invoice.currency;

  const lines: InternalOrderLine[] = [];
  for (const child of checkout.children as readonly EarlyAccessCartChildOrder[]) {
    let described: Readonly<{ displayName: string; strength: string }> | null = null;
    try {
      described = await input.products.describe({
        productId: child.productId,
        variantId: child.variantId,
      });
    } catch {
      // An enrichment outage must not lose the operational email.
      described = null;
    }
    lines.push(
      Object.freeze({
        orderNumber: child.orderNumber,
        product: described?.displayName ?? "PRODUCT NAME UNRESOLVED (check by SKU)",
        strength: described?.strength ?? "unresolved",
        sku: child.sku,
        quantity: child.quantity,
        unitPriceDisplay: money(child.unitPriceCents, currency),
        payableDisplay: money(child.payableCents, currency),
        displayUnresolved: described === null,
      }),
    );
  }

  const shipTo = Object.freeze(
    [
      checkout.shipTo.recipientName,
      checkout.shipTo.line1,
      checkout.shipTo.line2 ?? "",
      `${checkout.shipTo.city}, ${checkout.shipTo.region} ${checkout.shipTo.postalCode}`,
      checkout.shipTo.country,
    ].filter((part) => part.trim().length > 0),
  );

  return Object.freeze({
    cartCheckoutNumber: checkout.cartCheckoutNumber,
    invoiceNumber: checkout.invoice.invoiceNumber,
    paymentReference: checkout.invoice.paymentReference,
    placedAt: checkout.placedAt,
    submittedAt: submission.createdAt,
    submissionId: submission.submissionId,
    customerEmail: checkout.contact.email,
    customerPhone: checkout.contact.phone,
    shipTo,
    lines: Object.freeze(lines),
    subtotalDisplay: money(checkout.invoice.subtotalCents, currency),
    discountDisplay: money(checkout.invoice.discountCents, currency),
    shippingDisplay: money(checkout.invoice.shippingCents, currency),
    taxDisplay: money(checkout.invoice.taxCents, currency),
    payableTotalDisplay: money(checkout.invoice.payableTotalCents, currency),
    methodLabel: submission.method.methodName,
    methodCode: submission.method.code,
    governanceVersion: submission.method.registryVersion,
    proofFilename: submission.filename,
    proofContentType: submission.contentType,
    proofByteSizeDisplay: byteSizeDisplay(submission.byteSize),
    proofSha256: submission.proofSha256,
    proofFilenameRewritten: input.filenameRewritten,
  });
}

/**
 * Render the packet as plain text.
 *
 * Plain text only. An operational email with an attachment of unknown origin
 * has no business also carrying HTML: HTML is a rendering surface, and this
 * message is read next to a file that a stranger uploaded.
 */
export function renderInternalOrderEmail(packet: InternalOrderPacket): Readonly<{
  subject: string;
  text: string;
}> {
  const subject = `[EA SUBMITTED ORDER] ${packet.cartCheckoutNumber} ${packet.payableTotalDisplay} via ${packet.methodLabel}`;

  const lines = packet.lines
    .map(
      (line) =>
        [
          `  ${line.quantity} x ${line.product} ${line.strength}`,
          `    order:   ${line.orderNumber}`,
          `    sku:     ${line.sku}`,
          `    unit:    ${line.unitPriceDisplay}`,
          `    payable: ${line.payableDisplay}`,
          line.displayUnresolved ? "    note:    catalogue could not resolve this unit's name" : "",
        ]
          .filter((part) => part.length > 0)
          .join("\n"),
    )
    .join("\n\n");

  const text = `EARLY ACCESS SUBMITTED ORDER

A customer has submitted payment proof. This is a CLAIM, not a verified
payment. No supplier has been released and no receipt has been issued.

NEXT ACTION
  A named admin verifies the amount and the reference against the receiving
  account, then confirms the payment through the admin route. Nothing in this
  email or in the customer's upload settles anything.

CHECKOUT
  checkout:  ${packet.cartCheckoutNumber}
  invoice:   ${packet.invoiceNumber}
  reference: ${packet.paymentReference}
  placed:    ${packet.placedAt}
  submitted: ${packet.submittedAt}
  submission:${packet.submissionId}

CUSTOMER
  email: ${packet.customerEmail}
  phone: ${packet.customerPhone}

SHIP TO
${packet.shipTo.map((part) => `  ${part}`).join("\n")}

ITEMS
${lines}

MONEY
  subtotal: ${packet.subtotalDisplay}
  discount: ${packet.discountDisplay}
  shipping: ${packet.shippingDisplay}
  tax:      ${packet.taxDisplay}
  payable:  ${packet.payableTotalDisplay}

PAYMENT METHOD SELECTED BY THE CUSTOMER
  method:     ${packet.methodLabel} (${packet.methodCode})
  governance: ${packet.governanceVersion}
  The customer selected this from the methods the server had enabled at the
  time of submission. It records what they say they used, not a confirmed
  receipt of funds.

ATTACHED PROOF
  filename: ${packet.proofFilename}${packet.proofFilenameRewritten ? "  (renamed from the submitted name for safety)" : ""}
  type:     ${packet.proofContentType}
  size:     ${packet.proofByteSizeDisplay}
  sha256:   ${packet.proofSha256}

  The file is attached to this email and is stored nowhere else. Xenios does
  not retain the bytes. If this email is deleted, the proof is gone, so keep
  it until the payment has been verified.

xenios
`;

  return Object.freeze({ subject, text });
}

export type InternalEmailSendResult =
  | Readonly<{ outcome: "accepted"; providerMessageId: string }>
  /** The provider refused outright. No message exists. */
  | Readonly<{ outcome: "refused" }>
  /**
   * The call did not complete cleanly. A message may or may not exist, and
   * claiming either would be a guess.
   */
  | Readonly<{ outcome: "ambiguous" }>;

/** The direct send seam. One method, one attachment, one recipient. */
export interface InternalOrderEmailSender {
  send(input: {
    readonly subject: string;
    readonly text: string;
    readonly filename: string;
    readonly contentType: string;
    readonly bytes: Uint8Array;
    readonly idempotencyKey: string;
  }): Promise<InternalEmailSendResult>;
}

/** The Resend client surface this lane uses. Injected, never constructed here. */
export interface ResendLikeClient {
  emails: {
    send(
      payload: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<{ data?: { id?: string } | null; error?: unknown }>;
  };
}

/**
 * The production sender.
 *
 * THE RECIPIENT IS NOT A PARAMETER. It is the module constant, applied here,
 * after the payload is built. There is no code path in which a caller chooses
 * where an attachment goes.
 *
 * THE ERROR IS NEVER LOGGED. A provider error object can carry the request it
 * failed on, and that request contains the attachment. So a failure produces a
 * coded outcome and nothing else. The distinction between a clean refusal and
 * an ambiguous one is preserved because the caller's durable state depends on
 * it: a refusal means no email exists, an ambiguity means one might.
 */
export function createResendInternalOrderEmailSender(deps: {
  readonly client: ResendLikeClient;
  readonly fromEmail: string;
}): InternalOrderEmailSender {
  return Object.freeze({
    async send(input: {
      readonly subject: string;
      readonly text: string;
      readonly filename: string;
      readonly contentType: string;
      readonly bytes: Uint8Array;
      readonly idempotencyKey: string;
    }): Promise<InternalEmailSendResult> {
      const payload = {
        from: deps.fromEmail,
        to: INTERNAL_ORDER_EMAIL_RECIPIENT,
        subject: input.subject,
        text: input.text,
        attachments: [
          {
            filename: input.filename,
            content: Buffer.from(input.bytes),
            contentType: input.contentType,
          },
        ],
      };

      let response: { data?: { id?: string } | null; error?: unknown };
      try {
        response = await deps.client.emails.send(payload, {
          idempotencyKey: input.idempotencyKey,
        });
      } catch {
        // A thrown transport error is the ambiguous case: the request may have
        // reached the provider before the connection failed.
        return Object.freeze({ outcome: "ambiguous" as const });
      }

      if (response?.error !== undefined && response?.error !== null) {
        return Object.freeze({ outcome: "refused" as const });
      }
      const id = response?.data?.id;
      if (typeof id !== "string" || id.length === 0) {
        // Accepted with no identifier is not something to record as accepted,
        // because the id is the only handle reconciliation would ever have.
        return Object.freeze({ outcome: "ambiguous" as const });
      }
      return Object.freeze({ outcome: "accepted" as const, providerMessageId: id });
    },
  });
}

/**
 * The guard applied to the RENDERED packet before it is sent.
 *
 * The packet is metadata by construction, but this runs anyway. It is the
 * cheap, independent check that catches the day somebody adds a convenience
 * field to the packet type without reading the file header.
 */
export function assertPacketCarriesNoBytes(packet: InternalOrderPacket): void {
  assertNoProofBytes(packet);
}
