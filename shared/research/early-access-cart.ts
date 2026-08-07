/**
 * Xenios Research Early Access multi-product cart contract.
 *
 * The browser may choose product/variant identifiers and quantities. It does not
 * decide prices, discounts, supplier routing, shipping, payment totals, or release
 * state. Every monetary value below is a server answer in integer cents.
 */

export const EARLY_ACCESS_CART_MIN_QUANTITY = 1 as const;
export const EARLY_ACCESS_CART_MAX_QUANTITY = 3 as const;
export const EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS = 25 as const;

export type EarlyAccessCartCurrency = "USD";

export type EarlyAccessCartItemInput = Readonly<{
  productId: string;
  variantId: string;
  quantity: number;
  /** Echo only. The server refuses a stale price; it never trusts this as price authority. */
  expectedUnitPriceCents: number;
  expectedCurrency: EarlyAccessCartCurrency;
}>;

export type EarlyAccessCartContact = Readonly<{
  email: string;
  phone: string;
}>;

export type EarlyAccessCartShipping = Readonly<{
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: "US";
}>;

export type EarlyAccessCartQuoteRequest = Readonly<{
  items: readonly EarlyAccessCartItemInput[];
  contact: EarlyAccessCartContact;
  shipTo: EarlyAccessCartShipping;
}>;

export const EARLY_ACCESS_CART_LINE_FAILURES = [
  "PRODUCT_NOT_FOUND",
  "PRODUCT_HELD",
  "RELEASE_REQUIRED",
  "RELEASE_STALE",
  "RELEASE_REVOKED",
  "PRICE_CHANGED",
  "QUANTITY_INVALID",
  "SUPPLIER_UNAVAILABLE",
  "SHIPPING_UNAVAILABLE",
  "CURRENCY_MISMATCH",
] as const;
export type EarlyAccessCartLineFailure = (typeof EARLY_ACCESS_CART_LINE_FAILURES)[number];

export type EarlyAccessCartLineQuote = Readonly<{
  productId: string;
  variantId: string;
  displayName: string;
  strength: string;
  sku: string;
  quantity: number;
  supplierId: string;
  supplierSku: string;
  currency: EarlyAccessCartCurrency;
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  payableCents: number;
  promotionId: string | null;
  promotionVersion: string | null;
  promotionLabel: string | null;
}>;

export type EarlyAccessCartLineRefusal = Readonly<{
  productId: string;
  variantId: string;
  code: EarlyAccessCartLineFailure;
  currentUnitPriceCents?: number;
  currency?: EarlyAccessCartCurrency;
}>;

export type EarlyAccessCartQuote = Readonly<{
  quoteId: string;
  customerRef: string;
  currency: EarlyAccessCartCurrency;
  lines: readonly EarlyAccessCartLineQuote[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  payableTotalCents: number;
  intentHash: string;
  quotedAt: string;
  expiresAt: string;
}>;

export type EarlyAccessCartQuoteResult =
  | Readonly<{ ok: true; quote: EarlyAccessCartQuote }>
  | Readonly<{ ok: false; code: "CART_INVALID" | "AGREEMENT_REQUIRED" | "LINE_REFUSED"; lines?: readonly EarlyAccessCartLineRefusal[] }>;

export type EarlyAccessCartCheckoutRequest = Readonly<{
  quoteId: string;
  idempotencyKey: string;
  /** Hash of the complete quote/contact/shipping intent returned by the server. */
  expectedIntentHash: string;
}>;

export type EarlyAccessCartChildOrder = Readonly<{
  orderNumber: string;
  productId: string;
  variantId: string;
  sku: string;
  quantity: number;
  supplierId: string;
  supplierSku: string;
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  payableCents: number;
}>;

export type EarlyAccessCartInvoice = Readonly<{
  invoiceNumber: string;
  cartCheckoutNumber: string;
  paymentReference: string;
  currency: EarlyAccessCartCurrency;
  lines: readonly Readonly<{
    orderNumber: string;
    sku: string;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
    discountCents: number;
    payableCents: number;
  }>[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  payableTotalCents: number;
  instructions: string;
  issuedAt: string;
  status: "awaiting_payment";
}>;

export type EarlyAccessCartCheckout = Readonly<{
  cartCheckoutNumber: string;
  customerRef: string;
  contact: EarlyAccessCartContact;
  shipTo: EarlyAccessCartShipping;
  idempotencyKey: string;
  intentHash: string;
  quoteId: string;
  children: readonly EarlyAccessCartChildOrder[];
  invoice: EarlyAccessCartInvoice;
  paymentState: "awaiting_payment" | "under_review" | "payment_verified" | "payment_rejected";
  placedAt: string;
}>;

export type EarlyAccessCartCheckoutResult =
  | Readonly<{ ok: true; replayed: boolean; checkout: EarlyAccessCartCheckout }>
  | Readonly<{
      ok: false;
      code:
        | "QUOTE_NOT_FOUND"
        | "QUOTE_EXPIRED"
        | "QUOTE_CHANGED"
        | "IDEMPOTENCY_CONFLICT"
        | "CART_INVALID"
        | "UNAVAILABLE";
    }>;

export type EarlyAccessCartStatus = Readonly<{
  checkout: EarlyAccessCartCheckout;
  payment: Readonly<{ state: EarlyAccessCartCheckout["paymentState"]; paid: boolean }>;
  receipt: null | Readonly<{ receiptId: string; issuedAt: string }>;
  fulfilment: Readonly<{
    released: boolean;
    childOrders: readonly Readonly<{
      orderNumber: string;
      supplierId: string;
      released: boolean;
      shippedAt: string | null;
      tracking: readonly string[];
    }>[];
  }>;
}>;
