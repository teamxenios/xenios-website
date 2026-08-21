import type {
  EarlyAccessAvailabilityState,
  EarlyAccessCardProduct,
} from "./EarlyAccessProductCard";
import { isEarlyAccessQuantity } from "@shared/research/early-access-quantity";

/**
 * Reads the availability the SERVER decided for one catalogue row.
 *
 * This replaces the temporary client-side derivation that used to live here.
 * The server now projects the canonical AVAILABLE /
 * AVAILABILITY_CONFIRMATION_REQUIRED / TEMPORARILY_HELD model directly, and it
 * is the only side that can decide it: the founder release ledger, the
 * unit-hold registry and the supplier confirmations all live there. A browser
 * that re-derived the state from raw fields would be a second authority able to
 * disagree with the first, and the disagreement would be invisible.
 *
 * IT STILL FAILS SAFE IN ONE DIRECTION ONLY. A missing, malformed or
 * unrecognised state resolves to TEMPORARILY_HELD, and a row the server did not
 * mark purchasable is never rendered sellable whatever its state says. A row is
 * never promoted toward AVAILABLE by the absence of information. The cost of
 * being wrong is asymmetric: showing a held product as orderable can sell
 * something that must not be sold, while showing an orderable product as held is
 * a delay someone notices and reports.
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
  quantityLimit?: unknown;
  featured?: unknown;
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const KNOWN_AVAILABILITY: readonly EarlyAccessAvailabilityState[] = [
  "AVAILABLE",
  "AVAILABILITY_CONFIRMATION_REQUIRED",
  "TEMPORARILY_HELD",
];

export function availabilityStateOf(row: EarlyAccessCatalogRowView): EarlyAccessAvailabilityState {
  const declared = KNOWN_AVAILABILITY.find((state) => state === row.availability);
  if (declared === undefined) return "TEMPORARILY_HELD";
  // Defence in depth. Two independent server fields must agree before anything
  // renders as sellable, so a single wrong field cannot open a purchase path.
  if (declared !== "TEMPORARILY_HELD" && row.purchasable !== true) return "TEMPORARILY_HELD";
  return declared;
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
  const availability = availabilityStateOf(row);
  const quantityLimit = isEarlyAccessQuantity(row.quantityLimit)
    ? row.quantityLimit
    : null;

  // A sellable row without an exact server-projected ceiling is not a complete
  // offer. Dropping it is fail-closed: the browser must not replace missing
  // release authority with the global candidate maximum.
  if (availability !== "TEMPORARILY_HELD" && quantityLimit === null) return null;

  // A held row carries NO price on purpose: the server sends priceCents null so
  // no amount sits beside a unit nobody may buy. Dropping it would hide the row
  // entirely, and a founder-held product that vanishes from the catalogue is
  // worse than one shown as unavailable, because the customer cannot tell
  // whether it exists.
  //
  // Every other row must carry an exact positive integer number of cents. A
  // string, a float, a zero or a negative is not a price, and rendering one
  // would show a customer a figure the server never approved.
  const priceIsExact = Number.isSafeInteger(row.priceCents) && (row.priceCents as number) > 0;
  if (!priceIsExact && availability !== "TEMPORARILY_HELD") return null;
  // A held row that somehow carries a malformed price shows no price at all
  // rather than a wrong one.
  const unitPriceCents = priceIsExact ? (row.priceCents as number) : null;

  return {
    productId: row.productId,
    variantId: row.variantId,
    name: row.displayName,
    strength: row.strength,
    unitPriceCents,
    currency: isNonEmptyString(row.currency) ? row.currency : "USD",
    description: isNonEmptyString(row.description) ? row.description : "",
    availability,
    quantityLimit,
    // Merchandising, and it fails closed to false: an older server that does
    // not send the field yields an All-Products-only catalogue rather than a
    // page where every row claims to be Featured.
    featured: row.featured === true,
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
