import type { MasterOfferingDisplayState, MasterOfferingFamily } from "./contract";
import { directPurchaseRefusal } from "./pathway-authority";

/**
 * The one quote cart of the quote-only release, as the catalog lanes see it.
 *
 * A listing is added to the quote cart by opening the quote request form with
 * that exact variant named. The link is a navigation hint only: the form
 * re-reads the catalog and resolves the variant itself, and a link never adds
 * a line, approves a clinical item, states a price or places an order.
 */
export const QUOTE_CART_PATH = "/research/early-access/order-request";
export const QUOTE_CART_ACTION_LABEL = "Add to quote cart" as const;
export const QUOTE_CART_PRICE_LIST_LABEL = "Request a quote";

/** The shapes the quote request form accepts in a link. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,191}$/;
const SAFE_VARIANT_ID = /^[A-Za-z0-9._-]{1,80}$/;

/**
 * The quote request form with one exact variant named, quantity one.
 *
 * A slug or variant id the form would refuse yields the bare form address, so
 * the customer still reaches the quote cart and chooses the row there.
 */
export function quoteCartHref(input: Readonly<{
  family: MasterOfferingFamily; slug: string; variantId: string;
}>): string {
  if (!SAFE_SLUG.test(input.slug) || !SAFE_VARIANT_ID.test(input.variantId)) return QUOTE_CART_PATH;
  const params = new URLSearchParams({
    family: input.family, slug: input.slug, variant: input.variantId, qty: "1", intent: "request_quote",
  });
  return `${QUOTE_CART_PATH}?${params}`;
}

/**
 * Why a listing's request line needs the wider request store, if it does.
 *
 * A coming-soon or planned listing, and a supply or service listing, can be
 * stored in a request only once the request store accepts those lines. Until
 * then such a row is listed but cannot be added. One rule, read by the quote
 * request catalog and by the member catalog, so the two cannot disagree about
 * which rows the quote cart takes.
 */
export function requestStoreWidening(subject: Readonly<{
  family: MasterOfferingFamily;
  displayState: MasterOfferingDisplayState;
  variantDisplayState: MasterOfferingDisplayState;
  specification?: string | null;
  reviewedHolds?: ReadonlySet<string> | null;
}>): Readonly<{ comingSoon: boolean; nonMerchandise: boolean }> {
  return {
    comingSoon: [subject.displayState, subject.variantDisplayState]
      .some((state) => state === "coming_soon" || state === "planned"),
    nonMerchandise: directPurchaseRefusal(subject) === "non_merchandise_family",
  };
}
