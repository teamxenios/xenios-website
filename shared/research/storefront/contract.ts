/**
 * The public storefront contract: what a SIGNED-OUT visitor may see.
 *
 * This is a projection, never an authority. Every field here is copied from
 * the canonical master-offerings catalog answer the server already resolved
 * for a viewer with no pricing grant, reduced to the customer-safe subset a
 * public browser may hold. The projection can only restate or narrow what the
 * catalog said: it carries no SKU, no Product Control identity, no price
 * provenance, no capability, and no href the server resolved for a member
 * surface.
 *
 * Prices are the server's to supply. A variant either carries the exact
 * customer-safe price view the pricing authority resolved, or it carries the
 * on-request state. There is no zero, no placeholder, and no client-side
 * fallback amount anywhere in this contract.
 *
 * Actions are the closed six-word launch vocabulary
 * (shared/research/launch/customer-action.ts). The public surface renders one
 * of those six words per variant and decides nothing: a translation may only
 * restate or downgrade the catalog's own resolved action.
 */

import type {
  MasterOfferingDisplayState,
  MasterOfferingFamily,
  MasterOfferingSort,
} from "../master-offerings/contract";
import type { SupportedPriceCurrency } from "../pricing";
import {
  CUSTOMER_ACTIONS,
  isCustomerAction,
  type CustomerAction,
} from "../launch/customer-action";

export const PUBLIC_STOREFRONT_BASE_PATH = "/api/research/storefront";
export const PUBLIC_STOREFRONT_CATALOG_ROUTE =
  `${PUBLIC_STOREFRONT_BASE_PATH}/catalog`;
export const PUBLIC_STOREFRONT_DETAIL_ROUTE =
  `${PUBLIC_STOREFRONT_BASE_PATH}/products/:family/:slug`;

/**
 * The customer-safe price view a public card may carry. Deliberately smaller
 * than the member price view: the amount, the currency, and the display
 * string survive; the price id, version, and effective window are member
 * surface facts and stay behind authentication.
 */
export type PublicStorefrontPriceView =
  | {
      state: "priced";
      /** Positive safe integer, validated by the projection. Never 0. */
      amountCents: number;
      currency: SupportedPriceCurrency;
      display: string;
    }
  | { state: "on_request" };

export interface PublicStorefrontVariant {
  /** The catalog's own variant id: opaque, and the key the sign-in return
   * flow carries so the member detail page can preselect the same variant. */
  id: string;
  /** The strength / format label, e.g. "10mg vial". */
  label: string;
  /** The availability state in words, e.g. "Available now". */
  displayLabel: string;
  displayState: MasterOfferingDisplayState;
  action: CustomerAction;
  price: PublicStorefrontPriceView;
}

export interface PublicStorefrontCard {
  slug: string;
  family: MasterOfferingFamily;
  familyLabel: string;
  displayName: string;
  category: string;
  subcategory: string | null;
  displayState: MasterOfferingDisplayState;
  /** The availability state in words. */
  displayLabel: string;
  /** The one-sentence explanation of the state, customer copy. */
  stateExplanation: string;
  variantCount: number;
  variants: readonly PublicStorefrontVariant[];
  /** Always renderable price roll-up text, including the on-request wording. */
  priceSummary: string;
  /**
   * The card-level CTA: the strongest action any variant resolved, in the
   * closed six-word vocabulary. Computed by the server projection with a
   * closed ranking; the browser never widens it.
   */
  action: CustomerAction;
}

export interface PublicStorefrontDetail extends PublicStorefrontCard {
  overview: string | null;
  disclosures: readonly string[];
}

export interface PublicStorefrontFacetBucket<TValue extends string = string> {
  value: TValue;
  label: string;
  count: number;
}

export interface PublicStorefrontFacets {
  families: readonly PublicStorefrontFacetBucket<MasterOfferingFamily>[];
  categories: readonly PublicStorefrontFacetBucket[];
}

export const EMPTY_PUBLIC_STOREFRONT_FACETS: PublicStorefrontFacets = {
  families: [],
  categories: [],
};

export interface PublicStorefrontPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: MasterOfferingSort;
  products: readonly PublicStorefrontCard[];
  facets: PublicStorefrontFacets;
}

export interface PublicStorefrontCatalogResponse {
  ok: true;
  catalog: PublicStorefrontPage;
}

export interface PublicStorefrontDetailResponse {
  ok: true;
  product: PublicStorefrontDetail;
}

export const PUBLIC_STOREFRONT_ERROR_CODES = [
  "storefront_closed",
  "storefront_invalid_request",
  "storefront_not_found",
  "storefront_unavailable",
] as const;

export type PublicStorefrontErrorCode =
  (typeof PUBLIC_STOREFRONT_ERROR_CODES)[number];

export interface PublicStorefrontErrorResponse {
  ok: false;
  code: PublicStorefrontErrorCode;
}

export function isPublicStorefrontErrorCode(
  value: unknown,
): value is PublicStorefrontErrorCode {
  return (
    typeof value === "string" &&
    (PUBLIC_STOREFRONT_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * The customer words the PUBLIC surface uses for each action. Simple retail
 * vocabulary by founder directive; the signed-in surfaces keep their own
 * labels from CUSTOMER_ACTION_LABELS. BUY_NOW reads "Order" here because a
 * signed-out visitor cannot buy in place: the button starts the sign-in
 * continuation, and the member surface re-resolves the real Buy Now.
 */
export const PUBLIC_STOREFRONT_ACTION_LABELS: Readonly<
  Record<CustomerAction, string>
> = {
  BUY_NOW: "Order",
  ASSISTED_ORDER: "Request Order",
  REQUEST_QUOTE: "Request Quote",
  CARE: "Continue through Care",
  TEMPORARILY_HELD: "Temporarily unavailable",
  NOT_AVAILABLE: "Not available",
};

/**
 * Which actions invite the visitor to continue (sign in, request, Care), and
 * which are truthful end states rendered as words rather than buttons.
 */
export function isActionablePublicAction(action: CustomerAction): boolean {
  return (
    action === "BUY_NOW" ||
    action === "ASSISTED_ORDER" ||
    action === "REQUEST_QUOTE" ||
    action === "CARE"
  );
}

/**
 * The closed ranking behind the card-level CTA: the card states the strongest
 * thing a buyer can genuinely do on the detail page. Order is the vocabulary's
 * own commercial strength; NOT_AVAILABLE only when nothing else exists.
 */
const CARD_ACTION_RANK: Readonly<Record<CustomerAction, number>> = {
  BUY_NOW: 0,
  ASSISTED_ORDER: 1,
  REQUEST_QUOTE: 2,
  CARE: 3,
  TEMPORARILY_HELD: 4,
  NOT_AVAILABLE: 5,
};

export function strongestPublicAction(
  actions: readonly CustomerAction[],
): CustomerAction {
  let strongest: CustomerAction = "NOT_AVAILABLE";
  for (const action of actions) {
    if (!isCustomerAction(action)) continue;
    if (CARD_ACTION_RANK[action] < CARD_ACTION_RANK[strongest]) {
      strongest = action;
    }
  }
  return strongest;
}

/** Exported for tests that must sweep the whole vocabulary. */
export const PUBLIC_STOREFRONT_ACTIONS = CUSTOMER_ACTIONS;
