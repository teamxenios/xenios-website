/**
 * The invoice for a placed Private Early Access order. Server only, injectable,
 * no network, no clock.
 *
 * `early-access-invoice.ts` already decides what an Early Access invoice may and
 * may not say, and that decision is not reopened here: the invoice number, the
 * instructions text, and the rule that a receiving detail never appears on an
 * invoice all come from that module unchanged. This one adds the two things a
 * released order needs and the base invoice cannot express, because the shape it
 * validates is a single amount derived from unit price times quantity:
 *
 *   1. The line breakdown a customer reads before paying by hand.
 *   2. The bundle discount, stated as its own number, so the amount owed can be
 *      checked by arithmetic rather than trusted.
 *
 * The base invoice is still built, and its amount is asserted to equal the
 * subtotal. That is the cross check worth having: it proves the embedded domain
 * order, the stored subtotal, and the invoice all describe the same sale, and a
 * disagreement refuses instead of printing a number a human would have to catch.
 *
 * Determinism is a storage property, not a formatting one. Two calls for one
 * order return one invoice with one issued timestamp, because the second call
 * returns what the first stored rather than reissuing at the new `now`.
 */

import {
  EARLY_ACCESS_INVOICE_INSTRUCTIONS,
  buildInvoice,
  earlyAccessInvoiceNumberFor,
} from "./early-access-invoice";
import { readEarlyAccessOrder, type EarlyAccessCurrency } from "./early-access-order";
import {
  accepted,
  isCanonicalTimestamp,
  isNotBefore,
  refused,
  type CommerceResult,
} from "./input-guards";
import type { EarlyAccessReleaseOrder } from "./order-service";

/**
 * The neutral description on a line.
 *
 * It names the portal and nothing else. The SKU carries the identity, and any
 * further wording would be a product claim this module has no standing to make
 * about a unit Product Control has not finished documenting.
 */
export const EARLY_ACCESS_LINE_DESCRIPTION = "Private Early Access unit";

/** Prefix for the reference a customer quotes when they send payment by hand. */
export const EARLY_ACCESS_PAYMENT_REFERENCE_PREFIX = "XEAPAY-";

/**
 * The payment reference for an order, derived rather than generated.
 *
 * Deriving it keeps the module free of randomness and guarantees one reference
 * per order for the life of the order, which is the property a human matching
 * payments by hand actually depends on. Order ids may carry characters the
 * reference format forbids, so they are folded to hyphens and the result is
 * bounded to stay inside that format.
 */
export function earlyAccessPaymentReferenceFor(orderId: string): string {
  const sanitized = orderId.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 56);
  return `${EARLY_ACCESS_PAYMENT_REFERENCE_PREFIX}${sanitized}`;
}

export type EarlyAccessInvoiceLine = Readonly<{
  description: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}>;

export type EarlyAccessReleaseInvoice = Readonly<{
  invoiceNumber: string;
  orderId: string;
  customerRef: string;
  lines: readonly EarlyAccessInvoiceLine[];
  subtotalCents: number;
  discountCents: number;
  /** The tier that produced the discount, or null when there was none. */
  discountLabel: string | null;
  /** The amount owed. Always `subtotalCents - discountCents`. */
  totalCents: number;
  currency: EarlyAccessCurrency;
  paymentReference: string;
  instructions: string;
  status: "awaiting_payment";
  issuedAt: string;
}>;

export type EarlyAccessInvoiceServiceCode =
  | "order_invalid"
  | "order_not_payable"
  | "payment_reference_invalid"
  | "timestamp_invalid"
  | "issued_before_order"
  | "totals_disagree"
  | "invoice_conflict";

export type EarlyAccessInvoiceIssue = Readonly<{
  invoice: EarlyAccessReleaseInvoice;
  /** True when this call returned an invoice a previous call already issued. */
  replayed: boolean;
}>;

export type EarlyAccessInvoiceServiceResult = CommerceResult<
  EarlyAccessInvoiceIssue,
  EarlyAccessInvoiceServiceCode
>;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export type EarlyAccessInvoiceInsert =
  | Readonly<{ inserted: true; invoice: EarlyAccessReleaseInvoice }>
  | Readonly<{ inserted: false; invoice: EarlyAccessReleaseInvoice }>;

export interface EarlyAccessInvoiceRepository {
  findByOrderId(orderId: string): Promise<EarlyAccessReleaseInvoice | null>;
  /** Insert only, keyed by order. An order that has been invoiced keeps its invoice. */
  insert(invoice: EarlyAccessReleaseInvoice): Promise<EarlyAccessInvoiceInsert>;
}

export class InMemoryEarlyAccessInvoiceRepository implements EarlyAccessInvoiceRepository {
  private readonly byOrderId = new Map<string, EarlyAccessReleaseInvoice>();

  async findByOrderId(orderId: string): Promise<EarlyAccessReleaseInvoice | null> {
    return this.byOrderId.get(orderId) ?? null;
  }

  async insert(invoice: EarlyAccessReleaseInvoice): Promise<EarlyAccessInvoiceInsert> {
    const existing = this.byOrderId.get(invoice.orderId);
    if (existing) return Object.freeze({ inserted: false as const, invoice: existing });
    this.byOrderId.set(invoice.orderId, invoice);
    return Object.freeze({ inserted: true as const, invoice });
  }
}

// ---------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------

export interface EarlyAccessInvoiceServiceInput {
  readonly order: EarlyAccessReleaseOrder;
  /** Canonical UTC timestamp. Supplied by the caller: this module reads no clock. */
  readonly now: string;
  readonly invoices: EarlyAccessInvoiceRepository;
}

/**
 * Issue the invoice for a placed order, or return the one already issued.
 *
 * An order carries exactly one invoice for its whole life. Reissuing at a later
 * timestamp would hand a customer a second document for one debt, and the human
 * matching payments would have two references to reconcile.
 */
export async function createEarlyAccessInvoice(
  input: EarlyAccessInvoiceServiceInput,
): Promise<EarlyAccessInvoiceServiceResult> {
  const record = input.order;
  if (record === null || typeof record !== "object") return refused("order_invalid");
  if (!isCanonicalTimestamp(input.now)) return refused("timestamp_invalid");
  // Revalidated rather than trusted, because the record may have come back from
  // storage since it was placed. This also settles the order id before it is used
  // as a lookup key and as the payment reference.
  const order = readEarlyAccessOrder(record.order);
  if (!order) return refused("order_invalid");
  if (typeof record.tier?.label !== "string") return refused("order_invalid");

  const existing = await input.invoices.findByOrderId(order.orderId);
  if (existing) return accepted(Object.freeze({ invoice: existing, replayed: true }));

  const paymentReference = earlyAccessPaymentReferenceFor(order.orderId);
  // The base build is the second gate: it refuses an order that has moved past
  // awaiting payment and enforces the reference format, so neither rule is
  // restated here where it could drift from the module that owns it.
  const base = buildInvoice(order, paymentReference);
  // Every code that build can raise exists in this module's vocabulary, so it is
  // passed through rather than remapped. A remap is where a refusal reason gets
  // quietly relabelled as the wrong problem.
  if (!base.ok) return refused(base.code);

  // An invoice issued before the order it bills would be a document nobody could
  // explain, and it is the shape a replayed or reordered write produces.
  if (!isNotBefore(input.now, order.createdAt)) return refused("issued_before_order");

  // Three statements of the same amount must agree: the base invoice derived from
  // the line, the subtotal stored with the order, and the discount arithmetic.
  if (base.value.amountDueCents !== record.subtotalCents) return refused("totals_disagree");
  if (order.line.lineTotalCents !== record.subtotalCents) return refused("totals_disagree");
  if (record.subtotalCents - record.discountCents !== record.totalCents) {
    return refused("totals_disagree");
  }
  if (record.discountCents < 0 || record.totalCents <= 0) return refused("totals_disagree");
  if (record.currency !== base.value.currency) return refused("totals_disagree");

  const line: EarlyAccessInvoiceLine = Object.freeze({
    description: EARLY_ACCESS_LINE_DESCRIPTION,
    sku: order.line.sku,
    quantity: order.line.quantity,
    unitPriceCents: order.line.unitPriceCents,
    lineTotalCents: order.line.lineTotalCents,
  });

  const invoice: EarlyAccessReleaseInvoice = Object.freeze({
    invoiceNumber: earlyAccessInvoiceNumberFor(order.orderId),
    orderId: order.orderId,
    customerRef: order.customerRef,
    lines: Object.freeze([line]),
    subtotalCents: record.subtotalCents,
    discountCents: record.discountCents,
    discountLabel: record.discountCents > 0 ? record.tier.label : null,
    totalCents: record.totalCents,
    currency: record.currency,
    paymentReference,
    instructions: EARLY_ACCESS_INVOICE_INSTRUCTIONS,
    status: "awaiting_payment" as const,
    issuedAt: input.now,
  });

  const written = await input.invoices.insert(invoice);
  if (written.inserted) {
    return accepted(Object.freeze({ invoice: written.invoice, replayed: false }));
  }
  // Another writer won the race. Its invoice is the one that exists, and it must
  // still be an invoice for this order.
  if (written.invoice.orderId !== invoice.orderId) return refused("invoice_conflict");
  return accepted(Object.freeze({ invoice: written.invoice, replayed: true }));
}
