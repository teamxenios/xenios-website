/**
 * The Early Access quantity policy. One place, one pair of numbers.
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
 * The most units one exact variant may carry on one checkout.
 *
 * PER EXACT VARIANT, not per cart. Two different variants may each carry the
 * maximum. The same variant may not reach past it by arriving on more than one
 * cart line, which is what `canonicalizeQuantities` in the cart model exists to
 * prevent.
 */
export const EARLY_ACCESS_MAX_QUANTITY = 50;

/**
 * A whole number inside the band, with no coercion of any kind.
 *
 * `Number.isSafeInteger` is doing more work here than it looks. It rejects
 * `NaN`, both infinities, every decimal, and every magnitude past 2^53-1, so a
 * value that passes is one that integer arithmetic downstream can hold exactly.
 * The band check then rejects 0, negatives, and anything past the maximum.
 */
export function isEarlyAccessQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= EARLY_ACCESS_MIN_QUANTITY &&
    value <= EARLY_ACCESS_MAX_QUANTITY
  );
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
  return isEarlyAccessQuantity(value) ? value : null;
}

/**
 * Whether an aggregate across several lines of the SAME variant is allowed.
 *
 * Separate from `isEarlyAccessQuantity` because the inputs are already known
 * good and it is their sum that is in question: ten plus ten is a legal pair of
 * lines and a legal total, ten plus eleven is a legal pair of lines and an
 * illegal total.
 */
export function isEarlyAccessAggregateQuantity(total: number): boolean {
  return isEarlyAccessQuantity(total);
}
