import type {
  EarlyAccessAvailabilityState,
  EarlyAccessCardProduct,
} from "./EarlyAccessProductCard";

/**
 * Maps one server catalogue row to the card's availability state.
 *
 * THIS IS A TEMPORARY SEAM. The canonical AVAILABLE /
 * AVAILABILITY_CONFIRMATION_REQUIRED / TEMPORARILY_HELD model is being added
 * server-side by the integration lane. When it lands, the body of
 * `availabilityStateOf` is replaced by reading that field and this derivation is
 * deleted. It lives in exactly one function so that swap is a single edit and
 * cannot be half-done across a dozen call sites.
 *
 * IT FAILS SAFE IN ONE DIRECTION ONLY. Anything unknown, missing, malformed or
 * unrecognised resolves to TEMPORARILY_HELD. A row is never promoted to
 * AVAILABLE by the absence of information. The cost of being wrong is
 * asymmetric: showing a held product as orderable can sell something that must
 * not be sold, while showing an orderable product as held is a delay someone
 * notices and reports.
 */

/** The subset of the server row this view depends on. */
export type EarlyAccessCatalogRowView = Readonly<{
  productId?: unknown;
  variantId?: unknown;
  displayName?: unknown;
  strength?: unknown;
  priceCents?: unknown;
  currency?: unknown;
  description?: unknown;
  availability?: unknown;
  purchasable?: unknown;
  blockers?: unknown;
  supplierReady?: unknown;
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function availabilityStateOf(row: EarlyAccessCatalogRowView): EarlyAccessAvailabilityState {
  // A blocker of any kind holds the row. This is the path a regulatory or other
  // nonwaivable hold recorded after founder release must travel down, so it is
  // deliberately the first and broadest check rather than a special case.
  const blockers = Array.isArray(row.blockers) ? row.blockers : null;
  if (blockers === null) return "TEMPORARILY_HELD";
  if (blockers.length > 0) return "TEMPORARILY_HELD";

  // `purchasable` must be exactly true. Undefined, null or a truthy non-boolean
  // is treated as not purchasable.
  if (row.purchasable !== true) return "TEMPORARILY_HELD";

  // Past this point the row is sellable in principle. What remains is whether
  // supply is confirmed for it right now.
  const supplyConfirmed = row.supplierReady === true && row.availability === "available";
  return supplyConfirmed ? "AVAILABLE" : "AVAILABILITY_CONFIRMATION_REQUIRED";
}

/**
 * Projects a server row into the card's product shape, or null when the row
 * cannot be rendered truthfully.
 *
 * A row missing an identity, a name, a strength or a price is DROPPED rather
 * than rendered with a placeholder. A card that says "unknown strength" on a
 * research product is worse than one fewer card.
 */
export function toCardProduct(row: EarlyAccessCatalogRowView): EarlyAccessCardProduct | null {
  if (!isNonEmptyString(row.productId)) return null;
  if (!isNonEmptyString(row.variantId)) return null;
  if (!isNonEmptyString(row.displayName)) return null;
  if (!isNonEmptyString(row.strength)) return null;
  // Money must be an exact integer number of cents. A string, a float or a
  // negative is not a price, and rendering one would show a customer a figure
  // the server never approved.
  if (!Number.isSafeInteger(row.priceCents) || (row.priceCents as number) <= 0) return null;

  return {
    productId: row.productId,
    variantId: row.variantId,
    name: row.displayName,
    strength: row.strength,
    unitPriceCents: row.priceCents as number,
    currency: isNonEmptyString(row.currency) ? row.currency : "USD",
    description: isNonEmptyString(row.description) ? row.description : "",
    availability: availabilityStateOf(row),
  };
}

/**
 * Projects a whole catalogue response.
 *
 * Rows that cannot be rendered truthfully are dropped, and the count of dropped
 * rows is returned rather than swallowed. A silently shorter catalogue is how 22
 * products become 19 and nobody notices, so the caller is given the number and
 * can surface it.
 */
export function toCardProducts(rows: readonly EarlyAccessCatalogRowView[]): {
  products: EarlyAccessCardProduct[];
  dropped: number;
} {
  const products: EarlyAccessCardProduct[] = [];
  let dropped = 0;
  for (const row of rows) {
    const product = toCardProduct(row);
    if (product === null) {
      dropped += 1;
      continue;
    }
    products.push(product);
  }
  return { products, dropped };
}
