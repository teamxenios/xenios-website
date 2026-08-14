/**
 * The member-facing projection: one server record becomes one browser view.
 *
 * Everything is an explicit field pick. There is no spread of a product record
 * anywhere in this file, so a field added to the server shape next month cannot
 * reach a browser by default. It has to be picked up by hand, in a diff.
 *
 * THE LOAD-BEARING LINE IS `access`
 * ---------------------------------
 * `suppliedNote` is the note on the row, shown faithfully and in full. It is
 * NOT the status. For 418 of the 420 rows the note happens to restate what the
 * channel requires, and for the two rows with no price yet it says "Price
 * pending." INSTEAD.
 *
 * So a surface that rendered the note alone would drop "Research use only" from
 * BAM15 500 mcg and "Provider workflow required" from the syringes, on
 * precisely the two rows a reader looks at twice. The access policy is computed
 * from the CHANNEL, in code, for every item without exception, and the note is
 * shown in addition to it. The status a channel carries can never depend on
 * whether a price happened to be ready.
 */

import {
  KRIS_CHANNEL_LABELS,
  KRIS_FAMILY_LABELS,
  type KrisCatalogDetailView,
  type KrisCatalogItemView,
  type KrisLegacyOrderSelection,
  type KrisPriceView,
} from "@shared/research/kris-launch-a/contract";
import { KRIS_CATALOG_DISCLOSURES, krisAccessPolicy } from "./access-policy";
import { krisPathwayView } from "./pathway";
import { krisModePermitsLegacyOrder, krisPurchaseMode } from "./purchase-mode";
import { isCanonicalTimestamp, isSafeIdentifier } from "../early-access/commerce/input-guards";
import type { KrisProductRecord } from "./dataset-reader";

export type KrisLegacyOrderResolver = (
  product: KrisProductRecord,
  price: KrisPriceView,
) => KrisLegacyOrderSelection | null;

function safeLegacyOrder(
  mode: ReturnType<typeof krisPurchaseMode>,
  price: KrisPriceView,
  resolved: KrisLegacyOrderSelection | null,
): KrisLegacyOrderSelection | null {
  if (!krisModePermitsLegacyOrder(mode) || price.state !== "priced" || resolved === null) {
    return null;
  }
  if (
    !isSafeIdentifier(resolved.productId) ||
    !isSafeIdentifier(resolved.variantId) ||
    resolved.unitPriceCents !== price.amountCents ||
    resolved.currency !== price.currency ||
    !Number.isSafeInteger(resolved.quantityLimit) ||
    resolved.quantityLimit < 1 ||
    resolved.quantityLimit > 50 ||
    !isCanonicalTimestamp(resolved.evaluatedAt)
  ) {
    return null;
  }
  return Object.freeze({ ...resolved });
}

export function projectKrisItem(
  product: KrisProductRecord,
  price: KrisPriceView,
  resolveLegacyOrder?: KrisLegacyOrderResolver,
): KrisCatalogItemView {
  const mode = krisPurchaseMode({ channel: product.channel, price });
  const legacyOrder =
    krisModePermitsLegacyOrder(mode) && resolveLegacyOrder !== undefined
      ? safeLegacyOrder(mode, price, resolveLegacyOrder(product, price))
      : null;
  return {
    id: product.id,
    slug: product.slug,
    displayName: product.displayName,
    specification: product.specification,
    family: product.family,
    // Labels come from the contract, never from the artifact, so a stale label
    // in a regenerated file cannot say one thing while the code says another.
    familyLabel: KRIS_FAMILY_LABELS[product.family],
    channel: product.channel,
    channelLabel: KRIS_CHANNEL_LABELS[product.channel],
    format: product.format,
    packBasis: product.packBasis,
    moq: product.moq,
    dosageForm: product.dosageForm,
    price,
    // Every item, unconditionally, including the two with no price.
    access: krisAccessPolicy(product.channel),
    // Decided here and nowhere else. A second derivation on the client would
    // be a second policy, and the two would disagree the first time either
    // changed.
    purchaseMode: mode,
    legacyOrder,
    canBuyNow: legacyOrder !== null,
    // Null exactly when the mode is direct_eligible. Descriptive only: the
    // pathway carries no identity or price and no order code reads it, so it
    // cannot become a second purchase door.
    pathway: krisPathwayView(mode, product.channel, product),
    suppliedNote: product.suppliedNote,
  };
}

export function projectKrisDetail(
  product: KrisProductRecord,
  price: KrisPriceView,
  resolveLegacyOrder?: KrisLegacyOrderResolver,
): KrisCatalogDetailView {
  return {
    ...projectKrisItem(product, price, resolveLegacyOrder),
    // Read on every detail view: signing in reaches a catalog, not a permission
    // to buy, and the copy says so rather than leaving it to be inferred.
    disclosures: KRIS_CATALOG_DISCLOSURES,
  };
}
