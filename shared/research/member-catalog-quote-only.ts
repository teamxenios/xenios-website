import type { CartProductSelectionFailureCode } from "./cart-product-selection";
import type {
  MemberCatalog,
  MemberCatalogCard,
  MemberCatalogDisplayState,
  MemberCatalogVariant,
  MemberProductDetail,
} from "./member-catalog";

/**
 * Quote-only on the member catalog.
 *
 * An ordinary signed-in member is a customer, not staff. Under the quote-only
 * release the member catalog carries no member price and no cart selection (a
 * selection carries the same price). These helpers build that answer at the
 * route. They never touch the stored price or the server's own pricing.
 *
 * Nulling the price alone would break every client already deployed. The
 * browser adapter refuses a whole catalog when a product is "available"
 * without a price and a selection, and refuses a variant that has neither a
 * selection nor a reason for lacking one. So the projection also moves the
 * product to a state the existing contract already has:
 *
 *   - A product that was "available" becomes "catalog_only". The existing
 *     pages already show that state as catalog information with "Price on
 *     request", which is the truth under quote-only. Every other state is
 *     left alone: a product that was pending or unavailable still is.
 *   - A variant that loses its selection is given the existing reason
 *     "price_missing": this answer carries no price for it.
 *
 * No field is added to the contract and no client file changes.
 */

/** The existing state a purchasable product is shown in when its price is withheld. */
export const MEMBER_QUOTE_ONLY_DISPLAY_STATE: MemberCatalogDisplayState = "catalog_only";

/** The existing reason a variant carries when its selection is withheld with its price. */
export const MEMBER_QUOTE_ONLY_SELECTION_FAILURE: CartProductSelectionFailureCode = "price_missing";

export function quoteOnlyMemberCard<C extends MemberCatalogCard>(card: C): C {
  return {
    ...card,
    price: null,
    selection: null,
    displayState: card.displayState === "available" ? MEMBER_QUOTE_ONLY_DISPLAY_STATE : card.displayState,
  };
}

export function quoteOnlyMemberVariant(variant: MemberCatalogVariant): MemberCatalogVariant {
  return {
    ...variant,
    price: null,
    selection: null,
    selectionFailure: variant.selectionFailure ?? MEMBER_QUOTE_ONLY_SELECTION_FAILURE,
  };
}

export function quoteOnlyMemberCatalog(catalog: MemberCatalog): MemberCatalog {
  return { ...catalog, items: catalog.items.map((item) => quoteOnlyMemberCard(item)) };
}

export function quoteOnlyMemberProductDetail(product: MemberProductDetail): MemberProductDetail {
  return {
    ...quoteOnlyMemberCard(product),
    variants: product.variants.map((variant) => quoteOnlyMemberVariant(variant)),
    relatedProducts: product.relatedProducts.map((related) => quoteOnlyMemberCard(related)),
  };
}
