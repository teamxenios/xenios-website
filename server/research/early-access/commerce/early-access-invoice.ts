/**
 * Early Access manual-payment invoice. Server only, pure, side effect free.
 *
 * An invoice here is a statement of what is owed and the reference that will let a
 * human match an incoming manual payment to this order. It deliberately carries NO
 * receiving details: no account number, no routing number, no handle, no cashtag,
 * no wallet address, no link, and no QR payload. Those are supplied to the customer
 * out of band by a named human, so a leaked, cached, or replayed invoice can never
 * be a payment destination, and a compromised template cannot redirect money.
 *
 * The instructions text is method agnostic for the same reason. Choosing and naming
 * a payment method is a separate, separately reviewed decision.
 */

import {
  accepted,
  isCanonicalTimestamp,
  isPositiveCents,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import {
  EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS,
  readEarlyAccessOrder,
  type EarlyAccessCurrency,
} from "./early-access-order";
import { payableTotalFromComponents, type PayableTotalCents } from "./order-money";

/**
 * The neutral placeholder an administrator fills in out of band. Reviewed as data:
 * it contains no digits, no "@", and no destination vocabulary at all, and a test
 * asserts that it stays that way.
 */
export const EARLY_ACCESS_INVOICE_INSTRUCTIONS =
  "Payment instructions for this order are provided to you directly by the Xenios " +
  "team. Include the payment reference shown on this invoice exactly as written so " +
  "your payment can be matched to your order. A member of the team confirms every " +
  "payment by hand after it arrives. Never send payment using details that did not " +
  "come to you directly from the Xenios team.";

/** Deterministic, one invoice number per order, so an order cannot carry two. */
export const EARLY_ACCESS_INVOICE_PREFIX = "XEA-INV-";

const PAYMENT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;

export type EarlyAccessInvoiceFailureCode =
  | "order_invalid"
  | "order_not_payable"
  | "payment_reference_invalid";

/**
 * The invoice states three amounts, and the one a customer pays is the payable total.
 *
 * `amountDueCents` used to be the order's `orderTotalCents`, which is the PRE-DISCOUNT
 * merchandise subtotal, so a three unit bundle was invoiced for money the customer did
 * not owe. It is now the payable total, and it is branded, so a later edit that reaches
 * for the subtotal again does not compile. The subtotal and the discount are stated as
 * their own fields so the arithmetic on the document can be checked rather than trusted.
 */
export type EarlyAccessInvoice = Readonly<{
  invoiceNumber: string;
  orderId: string;
  amountDueCents: PayableTotalCents;
  subtotalCents: number;
  discountCents: number;
  currency: EarlyAccessCurrency;
  paymentReference: string;
  instructions: string;
  status: "awaiting_payment";
  issuedAt: string;
}>;

export type EarlyAccessInvoiceResult = CommerceResult<
  EarlyAccessInvoice,
  EarlyAccessInvoiceFailureCode
>;

/** The exact public shape. A field added later must be added here on purpose. */
export const EARLY_ACCESS_INVOICE_KEYS = [
  "invoiceNumber",
  "orderId",
  "amountDueCents",
  "subtotalCents",
  "discountCents",
  "currency",
  "paymentReference",
  "instructions",
  "status",
  "issuedAt",
] as const;

export function earlyAccessInvoiceNumberFor(orderId: string): string {
  return `${EARLY_ACCESS_INVOICE_PREFIX}${orderId}`;
}

/**
 * Build the invoice for an order that is still awaiting payment.
 *
 * `paymentReference` is injected because it must be unique per order and this module
 * generates nothing. `issuedAt` is the order's own creation timestamp, so no clock is
 * read and re-running the call produces a byte identical invoice.
 */
export function buildInvoice(order: unknown, paymentReference: unknown): EarlyAccessInvoiceResult {
  const snapshot = readEarlyAccessOrder(order);
  if (!snapshot) return refused("order_invalid");
  // An order that already moved on cannot be re-invoiced. A verified payment in
  // particular must never be handed a fresh reference to pay against again.
  if (snapshot.status !== "awaiting_payment") return refused("order_not_payable");
  if (typeof paymentReference !== "string" || !PAYMENT_REFERENCE.test(paymentReference)) {
    return refused("payment_reference_invalid");
  }

  return accepted(
    Object.freeze({
      invoiceNumber: earlyAccessInvoiceNumberFor(snapshot.orderId),
      orderId: snapshot.orderId,
      amountDueCents: snapshot.money.payableTotalCents,
      subtotalCents: snapshot.money.subtotalCents,
      discountCents: snapshot.money.discountCents,
      currency: snapshot.currency,
      paymentReference,
      instructions: EARLY_ACCESS_INVOICE_INSTRUCTIONS,
      status: "awaiting_payment" as const,
      issuedAt: snapshot.createdAt,
    }),
  );
}

/** Validate an invoice snapshot that arrived from storage. Fails closed. */
export function readEarlyAccessInvoice(value: unknown): EarlyAccessInvoice | null {
  const record = readPlainRecord(value, EARLY_ACCESS_INVOICE_KEYS);
  if (!record) return null;
  if (!isSafeIdentifier(record.orderId)) return null;
  if (
    typeof record.invoiceNumber !== "string" ||
    record.invoiceNumber !== earlyAccessInvoiceNumberFor(record.orderId)
  ) {
    return null;
  }
  if (!isPositiveCents(record.amountDueCents, EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS)) return null;
  if (record.currency !== "USD") return null;
  if (!isPositiveCents(record.subtotalCents, EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS)) return null;
  // The same invariant that governs an order governs a stored invoice: the amount due is
  // the merchandise subtotal less the discount. This lane charges no shipping and no tax,
  // and both are stated as zero rather than omitted so the check covers them already.
  const amountDueCents = payableTotalFromComponents({
    subtotalCents: record.subtotalCents,
    discountCents: record.discountCents,
    shippingCents: 0,
    taxCents: 0,
    statedPayableTotalCents: record.amountDueCents,
  });
  if (amountDueCents === null) return null;
  const discountCents = record.discountCents as number;
  if (typeof record.paymentReference !== "string" || !PAYMENT_REFERENCE.test(record.paymentReference)) {
    return null;
  }
  // A stored invoice may not carry substituted instructions.
  if (record.instructions !== EARLY_ACCESS_INVOICE_INSTRUCTIONS) return null;
  if (record.status !== "awaiting_payment") return null;
  if (!isCanonicalTimestamp(record.issuedAt)) return null;

  return Object.freeze({
    invoiceNumber: record.invoiceNumber,
    orderId: record.orderId,
    amountDueCents,
    subtotalCents: record.subtotalCents,
    discountCents,
    currency: "USD" as const,
    paymentReference: record.paymentReference,
    instructions: EARLY_ACCESS_INVOICE_INSTRUCTIONS,
    status: "awaiting_payment" as const,
    issuedAt: record.issuedAt,
  });
}
