/**
 * The Early Access quantity policy. One place, one normal-order band.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before this module the round's quantity ceiling was stated twice, as
 * `EARLY_ACCESS_MAX_QUANTITY` in the single-order commerce module and as
 * `EARLY_ACCESS_CART_MAX_QUANTITY` in the cart contract. Both happened to say 3.
 * Two constants that must agree, in two folders, is a disagreement waiting to
 * happen: widening one and not the other would let a cart quote a quantity the
 * order module then refuses, or worse, the reverse. Both names still exist and
 * both still resolve here, so there is exactly one number to change and no call
 * site had to move.
 *
 * THE SERVER IS AUTHORITATIVE
 * ---------------------------
 * `min` and `max` are also rendered in the browser, on the stepper, but nothing
 * in this file trusts that. An HTML `max` attribute is a courtesy to a person
 * using a pointer; it is not a check. Every quantity that reaches a quote, an
 * order, an invoice or a supplier release is re-read through `readQuantity`
 * below, on the server, from the raw request.
 *
 * WHAT "READ" MEANS HERE
 * ----------------------
 * `readQuantity` accepts a `number` that is already a whole number in range and
 * refuses everything else. It does NOT coerce. A decimal is not floored, a
 * numeric string is not parsed, `true` is not 1, and an empty string is not 0.
 * That is the point: coercion is how "21" arrives as 21 through one door and as
 * NaN through another, and how a `1e21` becomes a quantity no downstream
 * integer arithmetic can hold. Anything that is not already exactly an integer
 * inside the band is refused, so every accepted quantity is safe to multiply.
 */

/** The fewest units a purchasable Early Access line may carry. */
export const EARLY_ACCESS_MIN_QUANTITY = 1;

/**
 * The founder's per-variant ceiling: 100 units of one exact variant, by
 * default, wherever a customer expresses a quantity (2026-08-20 decision).
 *
 * PER EXACT VARIANT, not per cart. Two different variants may each carry the
 * maximum. The same variant may not reach past it by arriving on more than one
 * cart line, which is what `canonicalizeQuantities` in the cart model exists to
 * prevent. A real, explicitly authorized lower limit on a product still wins:
 * this is the default ceiling, not an override of a product's own rule.
 */
export const EARLY_ACCESS_POLICY_MAX_QUANTITY = 100;

/**
 * What the CART lane may accept today, which is deliberately not yet the policy
 * maximum.
 *
 * READ THE LEDGER BEFORE TRUSTING THIS NUMBER. As of 2026-08-20 the production
 * database is still at the ORIGINAL 1..3 band: supabase/MIGRATIONS.md records
 * both M65 (1..3 -> 1..20) and M66 (1..20 -> 1..50) as PENDING, applied only to
 * disposable rehearsal databases. So this constant already outruns the durable
 * band by a wide margin, which is precisely why the cart lane is not enabled in
 * production and why enabling it without its migration chain would let a
 * customer fill a cart and lose it at insert — the one failure a checkout must
 * not have.
 *
 * Reaching the policy maximum on this lane therefore needs the whole chain, in
 * order: M65, then M66, then the successor candidate
 * (supabase/candidates/20260820_research_early_access_cart_quantity_band_100.sql),
 * each applied and verified. When that chain is applied, this becomes
 * EARLY_ACCESS_POLICY_MAX_QUANTITY and this comment goes away.
 *
 * The assisted-order lane is NOT held back by this. Its durable check reads the
 * min/max band stored on each line from the catalog authority, so it carries the
 * policy maximum today with no migration at all.
 */
export const EARLY_ACCESS_CART_DURABLE_MAX_QUANTITY = 50;

export const EARLY_ACCESS_MAX_QUANTITY = EARLY_ACCESS_CART_DURABLE_MAX_QUANTITY;

/**
 * Compatibility name retained for consumers that used the former request band.
 * The founder decision superseded that split: this is the same normal-order
 * ceiling, not a second manual-review domain.
 */
export const DIRECT_EARLY_ACCESS_MAX_QUANTITY = EARLY_ACCESS_MAX_QUANTITY;
export const REQUEST_MAX_QUANTITY = EARLY_ACCESS_MAX_QUANTITY;

/**
 * A whole number inside the band, with no coercion of any kind.
 *
 * `Number.isSafeInteger` is doing more work here than it looks. It rejects
 * `NaN`, both infinities, every decimal, and every magnitude past 2^53-1, so a
 * value that passes is one that integer arithmetic downstream can hold exactly.
 * The band check then rejects 0, negatives, and anything past the maximum.
 */
export function isDirectEarlyAccessQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= EARLY_ACCESS_MIN_QUANTITY &&
    value <= DIRECT_EARLY_ACCESS_MAX_QUANTITY
  );
}

/** Existing callers are all direct-cart/order callers. */
export const isEarlyAccessQuantity = isDirectEarlyAccessQuantity;

/** Compatibility guard for the former request band; now the normal-order band. */
export function isEarlyAccessRequestQuantity(value: unknown): value is number {
  return isDirectEarlyAccessQuantity(value);
}

export type EarlyAccessQuantityRoute =
  | Readonly<{ kind: "direct_cart"; quantity: number }>
  | Readonly<{ kind: "order_request"; quantity: number; directLimit: number | null }>;

/**
 * Route an expressed buyer quantity without coercion.
 *
 * `effectiveDirectLimit` is the already server-projected intersection of the
 * global direct band, Product Control, and founder release authority. An
 * invalid limit opens nothing. A valid normal-order quantity beyond that
 * explicit authority may use the existing order-request path, but it is never
 * classified for review merely because it exceeds a quantity threshold.
 */
export function routeEarlyAccessQuantity(
  value: unknown,
  effectiveDirectLimit: unknown = DIRECT_EARLY_ACCESS_MAX_QUANTITY,
): EarlyAccessQuantityRoute | null {
  if (!isEarlyAccessRequestQuantity(value)) return null;
  if (
    isDirectEarlyAccessQuantity(effectiveDirectLimit) &&
    value <= effectiveDirectLimit
  ) {
    return Object.freeze({ kind: "direct_cart" as const, quantity: value });
  }
  return Object.freeze({
    kind: "order_request" as const,
    quantity: value,
    directLimit: isDirectEarlyAccessQuantity(effectiveDirectLimit)
      ? effectiveDirectLimit
      : null,
  });
}

/**
 * The server-side read. Returns the quantity, or null if the caller may not
 * have one.
 *
 * Deliberately not `number | undefined` and deliberately not a throw: every
 * caller in this domain answers a refusal code rather than an exception, and a
 * null that must be handled is harder to ignore than an undefined that spreads.
 */
export function readEarlyAccessQuantity(value: unknown): number | null {
  return isDirectEarlyAccessQuantity(value) ? value : null;
}

/**
 * Whether an aggregate across several lines of the SAME variant is allowed.
 *
 * Separate from `isEarlyAccessQuantity` because the inputs are already known
 * good and it is their sum that is in question: twenty-five plus twenty-five is
 * a legal pair of lines and a legal total, while twenty-five plus twenty-six is
 * a legal pair of lines and an illegal aggregate total.
 */
export function isEarlyAccessAggregateQuantity(total: number): boolean {
  return isDirectEarlyAccessQuantity(total);
}
