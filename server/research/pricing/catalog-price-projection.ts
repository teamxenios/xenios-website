/**
 * Catalog card price projection. Server only.
 *
 * Turns a PriceResolution into exactly what a catalog card may render:
 * either the customer-safe CustomerPrice fields, or an explicit
 * not_currently_available state.
 *
 * The invariant this module exists to enforce: it is impossible to derive a
 * "$0" display from its output. There is no defaulting, no fallback amount,
 * and no numeric zero on any path. A missing, ambiguous, unapproved, stale,
 * or malformed price maps only to not_currently_available.
 */

import {
  isCustomerPrice,
  isCustomerSafeAmountCents,
  type CatalogPriceProjection,
  type CustomerPrice,
  type PriceResolution,
} from "@shared/research/pricing";

const NOT_AVAILABLE: CatalogPriceProjection = {
  state: "not_currently_available",
};

/**
 * Project a resolution onto the catalog card contract. Anything other than a
 * structurally valid available price with a positive safe integer amount
 * becomes not_currently_available. The price is rebuilt by explicit field
 * picks so no extra key a caller may have attached can ride through.
 */
export function projectCatalogPrice(
  resolution: PriceResolution,
): CatalogPriceProjection {
  if (resolution.state !== "available") return NOT_AVAILABLE;
  const price = resolution.price;
  if (!isCustomerPrice(price) || !isCustomerSafeAmountCents(price.amountCents)) {
    return NOT_AVAILABLE;
  }
  const projected: CustomerPrice = {
    priceId: price.priceId,
    productId: price.productId,
    variantId: price.variantId,
    audience: price.audience,
    amountCents: price.amountCents,
    currency: price.currency,
    effectiveAt: price.effectiveAt,
    expiresAt: price.expiresAt,
    version: price.version,
  };
  return { state: "priced", price: projected };
}

/**
 * Convenience for card renderers: the displayable amount in cents, or null
 * when there is nothing to display. Never returns 0 or a negative number,
 * so a renderer cannot format this into "$0.00".
 */
export function projectedAmountCents(
  projection: CatalogPriceProjection,
): number | null {
  if (projection.state !== "priced") return null;
  return isCustomerSafeAmountCents(projection.price.amountCents)
    ? projection.price.amountCents
    : null;
}
