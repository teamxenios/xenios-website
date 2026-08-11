/**
 * Xenios Research Early Access multi-product cart contract.
 *
 * BROWSER AUTHORITY
 * -----------------
 * The browser may select product/variant identifiers and quantities and may
 * echo the unit price it was shown. It never decides availability, supplier
 * routing, discounts, shipping, tax, aggregate totals, settlement, receipts,
 * or supplier release. Every monetary value below is an integer-cents server
 * answer.
 */

/**
 * The cart's quantity band IS the round's quantity band. These two names are
 * kept because every existing importer uses them, but they are no longer
 * independent numbers: both resolve to the single policy in
 * `early-access-quantity.ts`, so the cart and the single-order lane cannot
 * drift apart.
 */
export {
  EARLY_ACCESS_MAX_QUANTITY as EARLY_ACCESS_CART_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY as EARLY_ACCESS_CART_MIN_QUANTITY,
} from "./early-access-quantity";
import { EARLY_ACCESS_MAX_QUANTITY } from "./early-access-quantity";

export const EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS = 25 as const;

/**
 * The largest number of RAW lines a browser may submit before canonicalization.
 *
 * Not a business rule, a work bound. Duplicate lines for one variant are merged
 * rather than refused, so the raw list can legitimately be longer than the
 * distinct-item cap. The largest submission that could still canonicalize to a
 * legal cart is every distinct item arriving as single-unit lines, which is
 * `25 x 20`. Anything past that cannot become a valid cart no matter how it
 * merges, so it is refused before any work is done on it.
 */
export const EARLY_ACCESS_CART_MAX_SUBMITTED_LINES =
  EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS * EARLY_ACCESS_MAX_QUANTITY;
export const EARLY_ACCESS_CART_CURRENCY = "USD" as const;

export type EarlyAccessCartCurrency = typeof EARLY_ACCESS_CART_CURRENCY;

export type EarlyAccessCartItemInput = Readonly<{
  productId: string;
  variantId: string;
  quantity: number;
  /** Echo only. The server refuses a stale price and never trusts this as authority. */
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

/** Public quote. Customer identity, contact and shipping stay in the private quote record. */
export type EarlyAccessCartQuote = Readonly<{
  quoteId: string;
  currency: EarlyAccessCartCurrency;
  lines: readonly EarlyAccessCartLineQuote[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  payableTotalCents: number;
  /** Binds customer, every line, contact and destination without echoing them. */
  intentHash: string;
  quotedAt: string;
  expiresAt: string;
}>;

export type EarlyAccessCartQuoteResult =
  | Readonly<{ ok: true; quote: EarlyAccessCartQuote }>
  | Readonly<{
      ok: false;
      code: "CART_INVALID" | "AGREEMENT_REQUIRED" | "LINE_REFUSED" | "UNAVAILABLE";
      lines?: readonly EarlyAccessCartLineRefusal[];
    }>;

export type EarlyAccessCartCheckoutRequest = Readonly<{
  quoteId: string;
  idempotencyKey: string;
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

export type EarlyAccessCartPaymentState =
  | "awaiting_payment"
  | "under_review"
  | "payment_verified"
  | "payment_rejected";

/**
 * Why a checkout is no longer active. Only one value today, and the type is a
 * union so a future disposition has to be named rather than smuggled in as a
 * bare string.
 */
export type EarlyAccessCartDisposition = "duplicate_superseded";

/**
 * Customer-visible checkout. No customerRef, idempotency key or private
 * attribution.
 *
 * NOTE ON SUPPLIER IDENTITY. `children` still carries the full child order here,
 * supplier fields included, and that is deliberate: this type is the shape the
 * SERVER holds. The wire projection a customer actually receives is
 * `EarlyAccessCustomerCheckout` in server/research/early-access/cart/
 * customer-status.ts, which is this type with `supplierId` and `supplierSku`
 * omitted, and every customer route returns that. The leak was fixed by making
 * the projection a distinct type rather than by hoping each call site remembers
 * to delete two fields.
 */
export type EarlyAccessCartCheckout = Readonly<{
  cartCheckoutNumber: string;
  contact: EarlyAccessCartContact;
  shipTo: EarlyAccessCartShipping;
  children: readonly EarlyAccessCartChildOrder[];
  invoice: EarlyAccessCartInvoice;
  paymentState: EarlyAccessCartPaymentState;
  placedAt: string;
}>;

/** Server-only durable record. Never serialize this object directly to a customer. */
export type EarlyAccessCartCheckoutRecord = Readonly<{
  cartCheckoutNumber: string;
  customerRef: string;
  contact: EarlyAccessCartContact;
  shipTo: EarlyAccessCartShipping;
  idempotencyKey: string;
  intentHash: string;
  quoteId: string;
  children: readonly EarlyAccessCartChildOrder[];
  invoice: EarlyAccessCartInvoice;
  paymentState: EarlyAccessCartPaymentState;
  placedAt: string;
  /**
   * NULL or absent means active. A superseded checkout keeps its whole row and
   * stays readable, and every money and release path refuses it (migration 61,
   * enforced by trigger rather than by each caller remembering to check).
   */
  disposition?: EarlyAccessCartDisposition | null;
  /** The checkout that superseded this one. Set together with `disposition`. */
  supersededBy?: string | null;
  attribution: null | Readonly<{
    affiliateId: string;
    codeId: string | null;
    campaignId: string | null;
    method: "explicit_code" | "referral_session" | "assisted";
    attributedAt: string;
    expiresAt: string;
    scheduleId: string | null;
    scheduleVersion: number | null;
  }>;
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

/** Metadata for proof received outside the Xenios website. No file-storage claim. */
export type EarlyAccessCartExternalProof = Readonly<{
  evidenceRef: string;
  cartCheckoutNumber: string;
  sha256: string;
  filename: string;
  contentType: string;
  byteSize: number;
  provenanceNote: string;
  recordedAt: string;
  recordedBy: string;
  storedOnPlatform: false;
}>;

export type EarlyAccessCartReceipt = Readonly<{
  receiptId: string;
  cartCheckoutNumber: string;
  invoiceNumber: string;
  paymentReference: string;
  verifiedAmountCents: number;
  currency: EarlyAccessCartCurrency;
  issuedAt: string;
}>;

export type EarlyAccessCartChildRelease = Readonly<{
  releaseId: string;
  cartCheckoutNumber: string;
  orderNumber: string;
  supplierId: string;
  supplierSku: string;
  quantity: number;
  releasedAt: string;
  shippedAt: string | null;
  tracking: readonly string[];
}>;

export type EarlyAccessCartSettlement = Readonly<{
  cartCheckoutNumber: string;
  externalTransactionId: string;
  reviewedEvidenceRef: string;
  verifiedAmountCents: number;
  verifiedCurrency: EarlyAccessCartCurrency;
  settledAt: string;
  settledBy: string;
  receipt: EarlyAccessCartReceipt;
  childReleases: readonly EarlyAccessCartChildRelease[];
}>;

export type EarlyAccessCartStatus = Readonly<{
  checkout: EarlyAccessCartCheckout;
  payment: Readonly<{
    state: EarlyAccessCartPaymentState;
    paid: boolean;
    externalProofCount: number;
  }>;
  receipt: EarlyAccessCartReceipt | null;
  fulfilment: Readonly<{
    released: boolean;
    childOrders: readonly EarlyAccessCartChildRelease[];
  }>;
}>;

export type EarlyAccessCartCapability = Readonly<{
  enabled: true;
  maxDistinctItems: typeof EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS;
  maxQuantityPerItem: typeof EARLY_ACCESS_MAX_QUANTITY;
  paymentMode: "manual_concierge";
}>;
