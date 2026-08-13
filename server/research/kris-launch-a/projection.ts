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
  type KrisPriceView,
} from "@shared/research/kris-launch-a/contract";
import { KRIS_CATALOG_DISCLOSURES, krisAccessPolicy } from "./access-policy";
import { krisModePermitsCart, krisPurchaseMode } from "./purchase-mode";
import type { KrisProductRecord } from "./dataset-reader";

export function projectKrisItem(
  product: KrisProductRecord,
  price: KrisPriceView,
): KrisCatalogItemView {
  const mode = krisPurchaseMode({ channel: product.channel, price });
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
    canAddToCart: krisModePermitsCart(mode),
    suppliedNote: product.suppliedNote,
  };
}

export function projectKrisDetail(
  product: KrisProductRecord,
  price: KrisPriceView,
): KrisCatalogDetailView {
  return {
    ...projectKrisItem(product, price),
    // Read on every detail view: signing in reaches a catalog, not a permission
    // to buy, and the copy says so rather than leaving it to be inferred.
    disclosures: KRIS_CATALOG_DISCLOSURES,
  };
}
