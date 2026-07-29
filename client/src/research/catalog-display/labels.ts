// The words the catalog display surface may use, in one place.
//
// The offer mode label is NOT written here. It comes from describeOfferMode in
// shared/research/catalog/offer-readiness.ts, which is the single authority on
// what may truthfully be said about buying a record. That module is a pure
// state machine with no product data in it, so importing it into the browser
// bundle carries no catalog, and deriving the label here rather than trusting a
// server supplied string means the words on screen cannot drift from the model
// that decided them.
//
// Everything else here is the honest copy for the states a catalog surface has
// besides its products: loading, empty, and failed.

import {
  describeOfferMode,
  isSelfServePurchase,
  type OfferAvailabilityMode,
} from "@shared/research/catalog/offer-readiness";

/**
 * The truthful availability sentence for a record.
 *
 * Anything off the closed enum falls back to the weakest statement rather than
 * to a blank or to an optimistic default, so a malformed response reads as
 * "Not currently available" and never as an offer.
 */
export function offerModeLabel(mode: unknown): string {
  const label = describeOfferMode(mode as OfferAvailabilityMode);
  return typeof label === "string" && label.length > 0
    ? label
    : describeOfferMode("UNAVAILABLE");
}

/**
 * Whether a record's mode means a member could start a checkout unattended.
 * Used only to decide whether a surface says "with a human in the loop"; it
 * never enables an action here, because this surface has no purchase control.
 */
export function isUnattendedPurchase(mode: unknown): boolean {
  return isSelfServePurchase(mode as OfferAvailabilityMode);
}

/** Copy for the states a catalog has when it has no products to show. */
export const CATALOG_LOADING_COPY = "Loading the catalog";
export const CATALOG_EMPTY_COPY =
  "No products are listed for your account yet. Nothing is hidden by error: the catalog lists a record only once its documentation and approval are on file.";
export const CATALOG_ERROR_COPY =
  "The catalog could not be loaded just now. Nothing was changed. Please try again in a moment.";
export const PRODUCT_NOT_FOUND_COPY =
  "That product is not available to view on this account.";

/**
 * The standing line every catalog surface renders beside availability, so a
 * mode label is never read as a settled commercial offer.
 */
export const CATALOG_DISPLAY_NOTE =
  "Availability is what this record's documentation supports today. It is not an order confirmation.";

/** The visible explanation of why a record shows no amount. */
export const AMOUNT_WITHHELD_COPY = "Not currently available";

/**
 * The line the peptide lane shows in place of a price.
 *
 * It is a fact about the catalog, not a tease: four recorded numbers disagree
 * for these items and no pricing formula is confirmed, so publishing any of
 * them would publish a number no one approved.
 */
export const PEPTIDE_PRICE_PENDING_COPY =
  "Pricing for this range is not confirmed yet, so no amount is shown.";
