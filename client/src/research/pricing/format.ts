// Authoritative customer price formatting for the research surfaces.
//
// The one rule this module exists to enforce: a customer can never be shown
// $0.00. The authoritative pricing contract publishes a positive integer
// amountCents or the explicit not-available projection; there is no zero
// price in the domain, so a zero on screen is always a bug. Formatting here
// uses integer arithmetic only (no float division), throws on any input that
// is not a positive safe integer in a supported currency, and offers a
// non-throwing variant for render paths that must degrade to the honest
// unavailable state instead of crashing.
//
// Output is deterministic and locale-fixed (en-US style: $1,234.56). We do
// not use Intl.NumberFormat because the display of an authoritative price
// must not vary by runtime or environment locale data.

// ---------------------------------------------------------------------------
// Types mirroring shared/research/pricing.ts
// ---------------------------------------------------------------------------
// This branch's base commit does not contain shared/research/pricing.ts, so
// these are minimal local structural types that mirror the shared contract
// exactly: CustomerPriceDto mirrors CustomerPrice, and CatalogPriceProjection
// mirrors CatalogPriceProjection (the priced branch nests the price fields
// under .price with a state discriminant). A shared value assigns to the
// local type. At integration, delete this section and re-export the shared
// types under these names instead; no other code in this folder changes.

export type CustomerPriceAudience = "retail" | "member" | "professional" | "wholesale";

/** Mirrors shared/research/pricing.ts CustomerPrice. */
export interface CustomerPriceDto {
  priceId: string;
  productId: string;
  variantId: string;
  audience: CustomerPriceAudience;
  /** Positive integer cents. Zero is not a price in this domain. */
  amountCents: number;
  currency: string;
  effectiveAt: string;
  expiresAt: string | null;
  version: number;
}

/** The authoritative not-available state: no price exists, on purpose. */
export interface PriceNotAvailable {
  state: "not_currently_available";
}

/**
 * What a catalog surface may render: the customer-safe price fields nested
 * under the "priced" state, or the explicit not-available state. There is no
 * third shape and no default, so a missing price can never render as $0.
 */
export type CatalogPriceProjection =
  | { state: "priced"; price: CustomerPriceDto }
  | PriceNotAvailable;

export function isPriceUnavailable(value: CatalogPriceProjection): value is PriceNotAvailable {
  return value.state === "not_currently_available";
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * The approved customer copy for a price that does not exist. Never $0.00,
 * never a dash, never blank. (The member commerce pages carry the sibling
 * rule for an unconfirmed price in commerce-presentation.ts.)
 */
export const PRICE_UNAVAILABLE_COPY = "Not currently available";

/**
 * Audience qualifiers for the spoken and visible price phrase. Retail is the
 * unqualified default; every non-retail audience says who the price is for,
 * so member pricing is never mistaken for the public price.
 */
export const AUDIENCE_PHRASES: Record<CustomerPriceAudience, string | null> = {
  retail: null,
  member: "for members",
  professional: "for professionals",
  wholesale: "for wholesale partners",
};

/**
 * The full accessible phrase for a formatted price, e.g.
 * "Price: $1,800.00 per unit for members".
 */
export function priceAriaPhrase(
  formattedAmount: string,
  audience: CustomerPriceAudience,
  unitLabel?: string,
): string {
  const parts = [`Price: ${formattedAmount}`];
  if (unitLabel) parts.push(unitLabel);
  const qualifier = AUDIENCE_PHRASES[audience];
  if (qualifier) parts.push(qualifier);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Currency allowlist
// ---------------------------------------------------------------------------
// USD only today. Adding a currency means adding it here plus a symbol and,
// if it is not a two-decimal currency, teaching the formatter its minor-unit
// count. The allowlist is the seam; nothing else assumes USD.

export const SUPPORTED_CURRENCIES = ["USD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  USD: "$",
};

function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type PriceFormatFailure =
  | "zero_amount"
  | "negative_amount"
  | "non_integer_amount"
  | "unsafe_amount"
  | "unsupported_currency";

export class PriceFormatError extends Error {
  readonly reason: PriceFormatFailure;

  constructor(reason: PriceFormatFailure, detail: string) {
    super(`price format rejected (${reason}): ${detail}`);
    this.name = "PriceFormatError";
    this.reason = reason;
  }
}

function classify(amountCents: number, currency: string): PriceFormatFailure | null {
  if (!isSupportedCurrency(currency)) return "unsupported_currency";
  if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents)) {
    // NaN, Infinity, and beyond-safe magnitudes are "unsafe"; a finite
    // fractional number is specifically "non_integer" so the caller can see
    // a float slipped into a cents field.
    return Number.isFinite(amountCents) && !Number.isInteger(amountCents)
      ? "non_integer_amount"
      : "unsafe_amount";
  }
  if (amountCents === 0) return "zero_amount";
  if (amountCents < 0) return "negative_amount";
  return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Insert en-US thousands separators into a plain digit string. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format positive integer cents as an exact en-US currency string,
 * e.g. 180000 -> "$1,800.00". Throws PriceFormatError for zero, negative,
 * non-integer, or unsafe amounts and for currencies off the allowlist, so a
 * $0.00 output is impossible by construction.
 */
export function formatCustomerAmountCents(amountCents: number, currency: string): string {
  const failure = classify(amountCents, currency);
  if (failure) {
    throw new PriceFormatError(failure, `amountCents=${String(amountCents)} currency=${currency}`);
  }
  // Integer arithmetic only. cents is exact for safe integers, and
  // amountCents - cents is an exact multiple of 100 inside the safe range,
  // so the division below has an exactly representable integer result (no
  // float drift). Math.trunc pins the type for the string conversion.
  const cents = amountCents % 100;
  const dollars = Math.trunc((amountCents - cents) / 100);
  const symbol = CURRENCY_SYMBOLS[currency as SupportedCurrency];
  return `${symbol}${groupThousands(String(dollars))}.${String(cents).padStart(2, "0")}`;
}

export type FormattedPrice =
  | { ok: true; text: string }
  | { ok: false; reason: PriceFormatFailure };

/**
 * The non-throwing variant for render paths: a bad amount comes back as a
 * typed failure so the component can show the honest unavailable state
 * instead of crashing (and instead of ever showing a zero).
 */
export function tryFormatCustomerAmountCents(amountCents: number, currency: string): FormattedPrice {
  const failure = classify(amountCents, currency);
  if (failure) return { ok: false, reason: failure };
  return { ok: true, text: formatCustomerAmountCents(amountCents, currency) };
}
