/**
 * The Early Access quantity policy. One place, one pair of numbers.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Before this module the round's quantity ceiling was stated twice, as
 * `EARLY_ACCESS_MAX_QUANTITY` in the single-order commerce module and as
 * `EARLY_ACCESS_CART_MAX_QUANTITY` in the cart contract. Two constants that
 * must agree, in two folders, is a disagreement waiting to happen. Both names
 * still exist and both still resolve here, so there is exactly one number to
 * change and no call site had to move.
 *
 * FOUNDER DECISION F-013: NORMAL ORDER QUANTITY IS 1 THROUGH 50
 * -------------------------------------------------------------
 * This file previously encoded F-012: direct commerce 1..20, with 21..50
 * routed to a manual review desk. F-013 supersedes that in full. Quantity 1
 * through 50 is ordinary ordering. There is NO quantity-based review threshold
 * anywhere inside the band, so 21 is exactly as ordinary as 20.
 *
 * The `manual_review` route was DELETED rather than deprecated. Leaving it in
 * place would have let the superseded architecture survive as a reachable code
 * path that still typechecked, and its tests would have gone green while the
 * product was wrong. Deleting the variant turns every stale call site into a
 * compile error, which is the only sweep that cannot be forgotten.
 *
 * WHAT F-013 DOES NOT RELAX
 * -------------------------
 * Nothing except quantity. Membership gating, Product Control commerce
 * authority, release approval state, supplier confirmation windows, legal and
 * proof doors, payment authorization and per-product availability are all
 * untouched. A product may still refuse to sell. It may not refuse BECAUSE the
 * buyer asked for twenty-one of it.
 *
 * A per-product ceiling is one of those surviving non-quantity rules: founder
 * release authority may approve a specific product for fewer than 50 units.
 * That is product authority, not a quantity review, so exceeding it is an
 * ordinary refusal that names the real limit. It never becomes a review state.
 *
 * DEPLOY PRECONDITION, READ THIS BEFORE SHIPPING
 * ----------------------------------------------
 * The durable database band is enforced by CHECK constraints. M65 (applied)
 * pins them at 1..20. M66 (written, design-only, not yet applied) widens them
 * to 1..50. Shipping this file while the database is still at M65 means a 21
 * unit checkout passes every application layer and is then refused by Postgres.
 * That fails CLOSED, so it corrupts nothing, but it is a broken purchase. M66
 * MUST be applied before or with the deploy that carries this file.
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
 * The most units one exact variant may carry through normal ordering.
 *
 * PER EXACT VARIANT, not per cart. Two different variants may each carry the
 * maximum. The same variant may not reach past it by arriving on more than one
 * cart line, which is what `canonicalizeQuantities` in the cart model exists to
 * prevent.
 *
 * 51 and above fail closed. F-013 set the normal band's final cap at 50, and a
 * larger order is not a bigger normal order, it is a different commercial
 * conversation that no code path here is authorized to open.
 */
export const EARLY_ACCESS_MAX_QUANTITY = 50;

/**
 * Compatibility aliases, retained so no call site had to move when F-013
 * collapsed the F-012 split.
 *
 * They are aliases, not independent numbers. Under F-012 these two names held
 * DIFFERENT values (20 and 50) and that difference was the whole bug: a value
 * legal at one door was illegal at the next. Binding both to the single band
 * makes divergence impossible to reintroduce by editing one of them.
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
export function isEarlyAccessQuantity(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= EARLY_ACCESS_MIN_QUANTITY &&
    value <= EARLY_ACCESS_MAX_QUANTITY
  );
}

/**
 * Compatibility aliases. Under F-012 these were three genuinely different
 * predicates over two different bands. There is now one band, so they are one
 * predicate, and a caller cannot pick the "wrong" one by accident.
 */
export const isDirectEarlyAccessQuantity = isEarlyAccessQuantity;
export const isEarlyAccessRequestQuantity = isEarlyAccessQuantity;

/**
 * The outcome of routing an expressed buyer quantity.
 *
 * There is deliberately no `manual_review` member. Under F-013 no quantity in
 * 1..50 may produce a review state, so the variant that expressed that idea was
 * removed rather than left unreachable. `exceeds_product_limit` is NOT its
 * replacement: it reports a real per-product authority ceiling and names it, so
 * a buyer is told "this product allows up to 12" rather than being dropped into
 * a queue.
 */
export type EarlyAccessQuantityRoute =
  | Readonly<{ kind: "direct_cart"; quantity: number }>
  | Readonly<{ kind: "exceeds_product_limit"; quantity: number; limit: number }>;

/**
 * Route an expressed buyer quantity without coercion.
 *
 * `effectiveLimit` is the already server-projected intersection of the global
 * band, Product Control, and founder release authority. It is a NON-quantity
 * restriction that survives F-013 untouched.
 *
 * An absent or invalid limit means no product-specific ceiling has been
 * projected, so the global band governs alone. This is the one place the
 * F-012 logic was not merely narrow but backwards: it treated an invalid limit
 * as a reason to send an otherwise perfectly ordinary quantity to review. A
 * malformed projection is a server bug, and answering it by silently
 * reclassifying a valid order is worse than either honoring the global band or
 * failing outright.
 */
export function routeEarlyAccessQuantity(
  value: unknown,
  effectiveLimit: unknown = EARLY_ACCESS_MAX_QUANTITY,
): EarlyAccessQuantityRoute | null {
  if (!isEarlyAccessQuantity(value)) return null;
  if (isEarlyAccessQuantity(effectiveLimit) && value > effectiveLimit) {
    return Object.freeze({
      kind: "exceeds_product_limit" as const,
      quantity: value,
      limit: effectiveLimit,
    });
  }
  return Object.freeze({ kind: "direct_cart" as const, quantity: value });
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
 * good and it is their sum that is in question: twenty-five plus twenty-five is
 * a legal pair of lines and a legal total, twenty-five plus twenty-six is a
 * legal pair of lines and an illegal total.
 */
export function isEarlyAccessAggregateQuantity(total: number): boolean {
  return isEarlyAccessQuantity(total);
}
