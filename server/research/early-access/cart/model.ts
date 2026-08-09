import { createHash, randomBytes } from "node:crypto";
import type {
  EarlyAccessCartCheckout,
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartContact,
  EarlyAccessCartItemInput,
  EarlyAccessCartQuote,
  EarlyAccessCartShipping,
} from "@shared/research/early-access-cart";
import {
  EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS,
  EARLY_ACCESS_CART_MAX_QUANTITY,
  EARLY_ACCESS_CART_MIN_QUANTITY,
} from "@shared/research/early-access-cart";

const SAFE_ID = /^[A-Za-z0-9:_./-]{2,200}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IDEMPOTENCY = /^xeac_[A-Za-z0-9_-]{16,120}$/;
const QUOTE_ID = /^xeaq_[A-Za-z0-9_-]{16,120}$/;
const CART_NUMBER = /^XEC-[A-Z0-9]{16,40}$/;
const ORDER_NUMBER = /^XEA-CART-[A-Z0-9-]{8,80}$/;
const EVIDENCE_REF = /^eaext\.[A-Za-z0-9_-]{16,120}$/;

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCartContact(input: EarlyAccessCartContact): EarlyAccessCartContact | null {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.replace(/[^0-9+]/g, "");
  const digits = phone.replace(/\D/g, "");
  if (!EMAIL.test(email) || digits.length < 7 || digits.length > 15) return null;
  return Object.freeze({ email, phone });
}

export function normalizeCartShipping(input: EarlyAccessCartShipping): EarlyAccessCartShipping | null {
  const value: EarlyAccessCartShipping = {
    recipientName: normalizedText(input.recipientName),
    line1: normalizedText(input.line1),
    line2: input.line2 === null || input.line2.trim() === "" ? null : normalizedText(input.line2),
    city: normalizedText(input.city),
    region: normalizedText(input.region).toUpperCase(),
    postalCode: normalizedText(input.postalCode).toUpperCase(),
    country: input.country,
  };
  if (
    value.recipientName.length < 2 ||
    value.line1.length < 3 ||
    value.city.length < 2 ||
    value.region.length < 2 ||
    value.postalCode.length < 3 ||
    value.country !== "US"
  ) return null;
  return Object.freeze(value);
}

export function normalizeCartItems(
  input: readonly EarlyAccessCartItemInput[],
): readonly EarlyAccessCartItemInput[] | null {
  if (input.length < 1 || input.length > EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS) return null;
  const seen = new Set<string>();
  const output: EarlyAccessCartItemInput[] = [];
  for (const item of input) {
    if (!SAFE_ID.test(item.productId) || !SAFE_ID.test(item.variantId)) return null;
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < EARLY_ACCESS_CART_MIN_QUANTITY ||
      item.quantity > EARLY_ACCESS_CART_MAX_QUANTITY
    ) return null;
    if (!Number.isSafeInteger(item.expectedUnitPriceCents) || item.expectedUnitPriceCents <= 0) {
      return null;
    }
    if (item.expectedCurrency !== "USD") return null;
    // The source contains the escape sequence rather than a raw NUL byte. At
    // runtime this is an unambiguous delimiter because safe identifiers cannot
    // contain it; in source it remains grep- and diff-visible.
    const key = `${item.productId}\u0000${item.variantId}`;
    if (seen.has(key)) return null;
    seen.add(key);
    output.push(Object.freeze({ ...item }));
  }
  output.sort((a, b) => `${a.productId}:${a.variantId}`.localeCompare(`${b.productId}:${b.variantId}`));
  return Object.freeze(output);
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("cart canonicalization accepts integer numbers only");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("unsupported cart canonical value");
}

export function earlyAccessCartIntentHash(input: Readonly<{
  customerRef: string;
  items: readonly EarlyAccessCartItemInput[];
  contact: EarlyAccessCartContact;
  shipTo: EarlyAccessCartShipping;
}>): string {
  return createHash("sha256")
    .update("xenios:early-access:cart-intent:v1|", "utf8")
    .update(canonical(input), "utf8")
    .digest("hex");
}

export function quoteHash(quote: EarlyAccessCartQuote): string {
  return createHash("sha256")
    .update("xenios:early-access:cart-quote:v1|", "utf8")
    .update(
      canonical({
        quoteId: quote.quoteId,
        currency: quote.currency,
        lines: quote.lines,
        subtotalCents: quote.subtotalCents,
        discountCents: quote.discountCents,
        shippingCents: quote.shippingCents,
        taxCents: quote.taxCents,
        payableTotalCents: quote.payableTotalCents,
        intentHash: quote.intentHash,
        quotedAt: quote.quotedAt,
        expiresAt: quote.expiresAt,
      }),
      "utf8",
    )
    .digest("hex");
}

export function checkoutView(record: EarlyAccessCartCheckoutRecord): EarlyAccessCartCheckout {
  return Object.freeze({
    cartCheckoutNumber: record.cartCheckoutNumber,
    contact: Object.freeze({ ...record.contact }),
    shipTo: Object.freeze({ ...record.shipTo }),
    // NOT the customer projection. This strips the OWNERSHIP fields
    // (customerRef, idempotencyKey, intentHash, quoteId) and keeps the child
    // orders whole, supplier identity included, because callers inside the
    // server legitimately need them.
    //
    // The wire shape a customer receives is `customerCheckoutView` in
    // customer-status.ts, which omits supplierId and supplierSku as a distinct
    // TYPE. That is the single mechanism for the customer boundary; duplicating
    // it here would mean two places to keep in agreement and one to forget.
    children: Object.freeze(record.children.map((child) => Object.freeze({ ...child }))),
    invoice: Object.freeze({
      ...record.invoice,
      lines: Object.freeze(record.invoice.lines.map((line) => Object.freeze({ ...line }))),
    }),
    paymentState: record.paymentState,
    placedAt: record.placedAt,
  });
}

export function newCartQuoteId(): string {
  return `xeaq_${randomBytes(18).toString("base64url")}`;
}

export function newCartCheckoutNumber(): string {
  return `XEC-${randomBytes(12).toString("hex").toUpperCase()}`;
}

export function newCartChildOrderNumber(index: number): string {
  return `XEA-CART-${randomBytes(8).toString("hex").toUpperCase()}-${String(index + 1).padStart(2, "0")}`;
}

export function cartInvoiceNumber(checkoutNumber: string): string {
  return `XEI-${checkoutNumber.replace(/^XEC-/, "")}`;
}

export function cartPaymentReference(checkoutNumber: string): string {
  return `XEACART-${checkoutNumber.replace(/^XEC-/, "")}`;
}

export function newCartEvidenceRef(): string {
  return `eaext.${randomBytes(18).toString("base64url")}`;
}

export function cartReceiptId(checkoutNumber: string): string {
  return `xea-cart-receipt:${checkoutNumber}`;
}

export function cartChildReleaseId(orderNumber: string): string {
  return `xea-cart-release:${orderNumber}`;
}

export function isCartIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY.test(value);
}
export function isCartQuoteId(value: unknown): value is string {
  return typeof value === "string" && QUOTE_ID.test(value);
}
export function isCartCheckoutNumber(value: unknown): value is string {
  return typeof value === "string" && CART_NUMBER.test(value);
}
export function isChildOrderNumber(value: unknown): value is string {
  return typeof value === "string" && ORDER_NUMBER.test(value);
}
export function isExternalEvidenceRef(value: unknown): value is string {
  return typeof value === "string" && EVIDENCE_REF.test(value);
}
