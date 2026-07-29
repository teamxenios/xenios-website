/**
 * Authoritative pricing contracts shared by the resolver, catalog projection,
 * cart binding, checkout recompute, and order snapshot lanes.
 *
 * This module is deliberately dependency free (zero imports) so any lane can
 * consume it without dragging in admin or commerce types. The customer-safe
 * boundary rule: nothing in this file may carry supplier cost, margin, source
 * URL, approval note, approver identity, or any other internal field.
 *
 * All money is integer cents. No floats, no defaulting, no zero prices.
 */

/**
 * The audiences a customer price may resolve for. This intentionally excludes
 * the admin-only "compare_at" audience, which is never a purchasable price.
 * The list mirrors CART_PURCHASE_AUDIENCES in cart-product-selection.ts; the
 * duplication is deliberate to keep this module import free, and a test
 * asserts the two lists stay identical.
 */
export const CUSTOMER_PRICE_AUDIENCES = [
  "retail",
  "member",
  "professional",
  "wholesale",
] as const;

export type CustomerPriceAudience = (typeof CUSTOMER_PRICE_AUDIENCES)[number];

/** The only currencies the pricing core will resolve. Everything else fails closed. */
export const SUPPORTED_PRICE_CURRENCIES = ["USD"] as const;

export type SupportedPriceCurrency =
  (typeof SUPPORTED_PRICE_CURRENCIES)[number];

/**
 * Normalize a caller-supplied currency to the supported allowlist.
 * Returns null for anything not on the allowlist. Never guesses.
 */
export function normalizePriceCurrency(
  input: string,
): SupportedPriceCurrency | null {
  const normalized = input.trim().toUpperCase();
  return (SUPPORTED_PRICE_CURRENCIES as readonly string[]).includes(normalized)
    ? (normalized as SupportedPriceCurrency)
    : null;
}

/**
 * The complete customer-safe view of one resolved price. These are the only
 * price fields that may ever reach a browser. Amounts are always positive
 * safe integers; a zero or negative amount is never a CustomerPrice.
 */
export interface CustomerPrice {
  priceId: string;
  productId: string;
  variantId: string;
  audience: CustomerPriceAudience;
  /** Positive safe integer. Never 0, never negative, never fractional. */
  amountCents: number;
  currency: SupportedPriceCurrency;
  effectiveAt: string;
  expiresAt: string | null;
  version: number;
}

/**
 * The closed failure taxonomy for price resolution. Every reason is a
 * fail-closed outcome: the customer sees no price, never a guessed one.
 */
export const PRICE_RESOLUTION_FAILURE_REASONS = [
  "price_missing",
  "price_ambiguous",
  "price_inactive",
  "price_unapproved",
  "price_future",
  "price_expired",
  "wrong_audience",
  "wrong_currency",
  "product_inactive",
  "variant_inactive",
  "variant_unapproved",
  "member_ineligible",
] as const;

export type PriceResolutionFailureReason =
  (typeof PRICE_RESOLUTION_FAILURE_REASONS)[number];

/** Reasons that describe an unavailable price (everything except ambiguity). */
export type PriceUnavailableReason = Exclude<
  PriceResolutionFailureReason,
  "price_ambiguous"
>;

/**
 * The typed result of one authoritative price resolution.
 * available: exactly one approved, active, in-window price exists.
 * unavailable: no displayable price; the reason says why, fail closed.
 * ambiguous: more than one candidate matched; nothing is displayable.
 */
export type PriceResolution =
  | { state: "available"; price: CustomerPrice }
  | { state: "unavailable"; reason: PriceUnavailableReason }
  | { state: "ambiguous"; reason: "price_ambiguous" };

/**
 * What a catalog card may render. Either the customer-safe price fields, or
 * an explicit not-currently-available state. There is no third shape and no
 * default, so a missing price can never render as $0.
 */
export type CatalogPriceProjection =
  | { state: "priced"; price: CustomerPrice }
  | { state: "not_currently_available" };

/** True only for a positive safe integer amount of cents. */
export function isCustomerSafeAmountCents(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  );
}

/** True only for a positive safe integer quantity. */
export function isSafeQuantity(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  );
}

/** Structural runtime guard for a CustomerPrice crossing a trust boundary. */
export function isCustomerPrice(value: unknown): value is CustomerPrice {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.priceId === "string" &&
    candidate.priceId.trim().length > 0 &&
    typeof candidate.productId === "string" &&
    candidate.productId.trim().length > 0 &&
    typeof candidate.variantId === "string" &&
    candidate.variantId.trim().length > 0 &&
    (CUSTOMER_PRICE_AUDIENCES as readonly string[]).includes(
      candidate.audience as string,
    ) &&
    isCustomerSafeAmountCents(candidate.amountCents) &&
    (SUPPORTED_PRICE_CURRENCIES as readonly string[]).includes(
      candidate.currency as string,
    ) &&
    typeof candidate.effectiveAt === "string" &&
    candidate.effectiveAt.trim().length > 0 &&
    (candidate.expiresAt === null || typeof candidate.expiresAt === "string") &&
    typeof candidate.version === "number" &&
    Number.isInteger(candidate.version) &&
    candidate.version > 0
  );
}

/**
 * Fields shared by the cart snapshot and the order line snapshot. A snapshot
 * pins the exact price identity and version a customer saw, so checkout can
 * recompute against the authority and an order records exactly what was agreed.
 */
interface PriceSnapshotBase {
  productId: string;
  variantId: string;
  sku: string;
  displayName: string;
  priceId: string;
  priceVersion: number;
  audience: CustomerPriceAudience;
  currency: SupportedPriceCurrency;
  /** Positive safe integer cents for one unit. */
  unitAmountCents: number;
  /** Positive safe integer. */
  quantity: number;
  /** Exactly unitAmountCents * quantity, always a safe integer. */
  lineTotalCents: number;
  effectiveAt: string;
  expiresAt: string | null;
}

/** The price a cart line was priced at, and when. */
export interface CartPriceSnapshot extends PriceSnapshotBase {
  /** When this cart line was priced against the authority. */
  pricedAt: string;
}

/** The price an order line was agreed at, and when. Immutable once written. */
export interface OrderLinePriceSnapshot extends PriceSnapshotBase {
  /** When the customer agreed to this exact price. */
  agreedAt: string;
}

/**
 * Integer-only line total. Throws RangeError on any input that is not a
 * positive safe integer, or when the product would overflow safe integers.
 * There is no rounding and no float path.
 */
export function computeLineTotalCents(
  unitAmountCents: number,
  quantity: number,
): number {
  if (!isCustomerSafeAmountCents(unitAmountCents)) {
    throw new RangeError(
      "unitAmountCents must be a positive safe integer number of cents",
    );
  }
  if (!isSafeQuantity(quantity)) {
    throw new RangeError("quantity must be a positive safe integer");
  }
  const total = unitAmountCents * quantity;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("line total exceeds the safe integer range");
  }
  return total;
}

function isValidSnapshotBase(candidate: Record<string, unknown>): boolean {
  return (
    typeof candidate.productId === "string" &&
    candidate.productId.trim().length > 0 &&
    typeof candidate.variantId === "string" &&
    candidate.variantId.trim().length > 0 &&
    typeof candidate.sku === "string" &&
    candidate.sku.trim().length > 0 &&
    typeof candidate.displayName === "string" &&
    candidate.displayName.trim().length > 0 &&
    typeof candidate.priceId === "string" &&
    candidate.priceId.trim().length > 0 &&
    typeof candidate.priceVersion === "number" &&
    Number.isInteger(candidate.priceVersion) &&
    candidate.priceVersion > 0 &&
    (CUSTOMER_PRICE_AUDIENCES as readonly string[]).includes(
      candidate.audience as string,
    ) &&
    (SUPPORTED_PRICE_CURRENCIES as readonly string[]).includes(
      candidate.currency as string,
    ) &&
    isCustomerSafeAmountCents(candidate.unitAmountCents) &&
    isSafeQuantity(candidate.quantity) &&
    typeof candidate.lineTotalCents === "number" &&
    Number.isSafeInteger(candidate.lineTotalCents) &&
    candidate.lineTotalCents ===
      (candidate.unitAmountCents as number) * (candidate.quantity as number) &&
    typeof candidate.effectiveAt === "string" &&
    candidate.effectiveAt.trim().length > 0 &&
    (candidate.expiresAt === null || typeof candidate.expiresAt === "string")
  );
}

/** True only when every field is present, typed, and internally consistent. */
export function isValidCartPriceSnapshot(
  value: unknown,
): value is CartPriceSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isValidSnapshotBase(candidate) &&
    typeof candidate.pricedAt === "string" &&
    candidate.pricedAt.trim().length > 0
  );
}

/** True only when every field is present, typed, and internally consistent. */
export function isValidOrderLinePriceSnapshot(
  value: unknown,
): value is OrderLinePriceSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isValidSnapshotBase(candidate) &&
    typeof candidate.agreedAt === "string" &&
    candidate.agreedAt.trim().length > 0
  );
}
