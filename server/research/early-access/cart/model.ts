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
  EARLY_ACCESS_CART_MAX_SUBMITTED_LINES,
} from "@shared/research/early-access-cart";
import { isEarlyAccessQuantity } from "@shared/research/early-access-quantity";

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

/**
 * Reduce a submitted cart to its canonical form: one line per exact
 * product/variant, quantities summed, everything else proven consistent.
 *
 * WHY DUPLICATES MERGE RATHER THAN REFUSE
 * ---------------------------------------
 * This function used to refuse the whole cart the moment one identity appeared
 * twice. That was safe but wrong about intent: a browser that adds the same
 * variant from two places, or retries an add, has not asked for anything
 * illegal, it has asked for the sum. So the same variant at twenty-five units
 * twice is one canonical line of fifty, and the same variant at twenty-five and
 * again at twenty-six is refused, because fifty-one is past the cap. The cap is
 * applied to the AGGREGATE, which is the only reading under which duplicate
 * lines cannot be used to walk past it.
 *
 * WHY THE PRICE ECHO MUST AGREE ACROSS DUPLICATES
 * -----------------------------------------------
 * Merging two lines means merging two price echoes into one, and there is no
 * honest way to choose between them when they differ. A cart that calls one
 * variant 1000 cents on one line and 100 cents on the next is not a cart to
 * reconcile, it is a probe, so it is refused whole. The server still never
 * trusts the surviving echo: the quote re-resolves the price and answers
 * PRICE_CHANGED if it is stale.
 *
 * The result is sorted by identity, so two submissions differing only in line
 * order canonicalize to the same list, hash to the same intent, and produce the
 * same child orders in the same sequence.
 */
export function normalizeCartItems(
  input: readonly EarlyAccessCartItemInput[],
): readonly EarlyAccessCartItemInput[] | null {
  if (input.length < 1 || input.length > EARLY_ACCESS_CART_MAX_SUBMITTED_LINES) return null;
  const merged = new Map<string, EarlyAccessCartItemInput>();
  for (const item of input) {
    if (!SAFE_ID.test(item.productId) || !SAFE_ID.test(item.variantId)) return null;
    // Each SUBMITTED line must itself be a legal quantity, so a single line of
    // 51 is refused here and never reaches the aggregate check. "One huge line"
    // and "many small lines" are then governed by the same rule rather than by
    // two that could drift apart.
    if (!isEarlyAccessQuantity(item.quantity)) return null;
    if (!Number.isSafeInteger(item.expectedUnitPriceCents) || item.expectedUnitPriceCents <= 0) {
      return null;
    }
    if (item.expectedCurrency !== "USD") return null;
    // The source contains the escape sequence rather than a raw NUL byte. At
    // runtime this is an unambiguous delimiter because safe identifiers cannot
    // contain it; in source it remains grep- and diff-visible.
    const key = `${item.productId}\u0000${item.variantId}`;
    const prior = merged.get(key);
    if (prior === undefined) {
      merged.set(key, Object.freeze({ ...item }));
      continue;
    }
    if (
      prior.expectedUnitPriceCents !== item.expectedUnitPriceCents ||
      prior.expectedCurrency !== item.expectedCurrency
    ) {
      return null;
    }
    // The aggregate, not the addend, is what the cap governs.
    const aggregate = prior.quantity + item.quantity;
    if (!isEarlyAccessQuantity(aggregate)) return null;
    merged.set(key, Object.freeze({ ...prior, quantity: aggregate }));
  }

  // Applied to the CANONICAL count. Duplicates of one variant are one item, so
  // a cart is measured by how many distinct things it actually holds.
  if (merged.size > EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS) return null;

  const output = Array.from(merged.values());
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
