/**
 * Xenios Research full master offerings browser contract.
 *
 * This contract is intentionally display and action only. It carries no supplier
 * identity, source cost, planning sell price, margin, internal note, release gate,
 * or unpublished provider identity. A customer surface may import this file. It
 * may not import the server ingestion model.
 *
 * Commerce rule: an offering or variant can be visible without being purchasable.
 * The only action that represents purchase is `add_to_cart`, and the server may
 * emit it only after an exact Product Control CartProductSelection has resolved.
 */

import type {
  MasterOfferingPriceSummary,
  MasterOfferingPriceView,
} from "./pricing-contract";

export const MASTER_OFFERING_FAMILIES = [
  "research_vials",
  "blends",
  "supplements",
  "laboratory_supplies",
  "diagnostics",
  "clinician_guided_care",
  "quantum",
  "programs",
  "education_and_tracking",
  "provider_network",
  "white_label_and_partners",
  "shipping_and_fulfillment",
  // The master-catalog workbook families, using the exact slugs the Kris
  // Launch A artifact already carries, so one taxonomy names one thing on
  // every surface that displays it.
  "clinical_formulations_503a",
  "research_capsules",
  "research_peptides_materials",
  "research_supplies",
  "topicals_regenerative",
] as const;

export type MasterOfferingFamily =
  (typeof MASTER_OFFERING_FAMILIES)[number];

export const MASTER_OFFERING_FAMILY_LABELS: Readonly<
  Record<MasterOfferingFamily, string>
> = {
  research_vials: "Research Vials",
  blends: "Blends and Stacks",
  supplements: "Supplements",
  laboratory_supplies: "Research Supplies",
  diagnostics: "Bloodwork and Testing",
  clinician_guided_care: "Care Pathways",
  quantum: "Quantum and Regenerative",
  programs: "Memberships and Programs",
  education_and_tracking: "Education and Tracking",
  provider_network: "Provider and Performance Network",
  white_label_and_partners: "White Label and Partners",
  shipping_and_fulfillment: "Shipping and Fulfillment",
  clinical_formulations_503a: "503A Clinical Formulations",
  research_capsules: "Research Capsules",
  research_peptides_materials: "Research Peptides and Materials",
  research_supplies: "Research Supplies",
  topicals_regenerative: "Topicals and Regenerative",
};

/**
 * Truthful catalog visibility states. These states describe what the catalog may
 * say. They do not grant commerce.
 */
export const MASTER_OFFERING_DISPLAY_STATES = [
  "available_now",
  "available_this_week",
  "request_access",
  "approval_required",
  "temporarily_unavailable",
  "coming_soon",
  "care_pathway",
  "planned",
  "unavailable",
] as const;

export type MasterOfferingDisplayState =
  (typeof MASTER_OFFERING_DISPLAY_STATES)[number];

export const MASTER_OFFERING_DISPLAY_LABELS: Readonly<
  Record<MasterOfferingDisplayState, string>
> = {
  available_now: "Available Now",
  available_this_week: "Available This Week",
  request_access: "Request Access",
  approval_required: "Approval Required",
  temporarily_unavailable: "Temporarily Unavailable",
  coming_soon: "Coming Soon",
  care_pathway: "Care Pathway",
  planned: "Planned",
  unavailable: "Unavailable",
};

export const MASTER_OFFERING_COPY_STATES = [
  "approved",
  "draft",
  "needs_review",
  "missing",
] as const;

export type MasterOfferingCopyState =
  (typeof MASTER_OFFERING_COPY_STATES)[number];

/**
 * The closed sort vocabulary.
 *
 * Deliberately a closed set of intents, not a column name. A free-text sort key
 * would let a caller name a field the surface never meant to order by, and it
 * would tie the wire contract to the shape of the server model. These four are
 * intents the catalog can honor truthfully today.
 *
 * `newest` is deliberately absent. Nothing in the member-safe dataset carries a
 * per offering timestamp, and the source sheet row is a banned key in the
 * generated file, so there is no honest recency signal to sort by. Adding the
 * member before the data exists would ship a control that silently returns some
 * other order.
 */
export const MASTER_OFFERING_SORTS = [
  "relevance",
  "name_asc",
  "name_desc",
  "availability",
] as const;

export type MasterOfferingSort = (typeof MASTER_OFFERING_SORTS)[number];

export const MASTER_OFFERING_SORT_LABELS: Readonly<
  Record<MasterOfferingSort, string>
> = {
  relevance: "Best match",
  name_asc: "Name A to Z",
  name_desc: "Name Z to A",
  availability: "Availability",
};

/**
 * The default.
 *
 * `relevance` ranks by the search scorer when there is a query. When there is
 * no query every score is equal, so it collapses exactly onto the tie breaker,
 * which is the ordering the catalog already shipped. That is the reason it is
 * the default: introducing a sort control must not silently reorder the catalog
 * for every caller that never asked for one.
 */
export const DEFAULT_MASTER_OFFERING_SORT: MasterOfferingSort = "relevance";

/**
 * A category filter token.
 *
 * The wire value is a slug derived from the workbook category, not the raw
 * category string. Two reasons, both from the real data. A real category is
 * "AI, Tracking & Education", which contains the comma the list parser splits
 * on, so the raw string cannot survive the existing multi value encoding. And
 * the raw strings are workbook labels rather than approved member facing copy
 * ("Competitor Expansion Candidate" is one of them), so freezing them into this
 * customer importable contract would enshrine copy nobody approved.
 *
 * The guard is a shape guard rather than a membership guard, and that is the
 * deliberate difference from `isMasterOfferingFamily`. Families are a contract
 * owned vocabulary. Categories are data owned: they come from a workbook that
 * changes without a contract release. A hardcoded list would make the server
 * reject a filter chip the server itself had just rendered. Instead the shape
 * is closed and bounded, and the list response carries the authoritative
 * vocabulary, so a caller never has to guess.
 */
export const MASTER_OFFERING_CATEGORY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The most category tokens one request may carry. */
export const MASTER_OFFERING_MAX_CATEGORY_FILTERS = 24;

export function isMasterOfferingCategorySlug(value: unknown): boolean {
  return (
    typeof value === "string" &&
    MASTER_OFFERING_CATEGORY_SLUG_PATTERN.test(value)
  );
}

/**
 * The browser receives an already resolved action. It never receives the private
 * binding that connected a planning variant to Product Control.
 */
export type MasterOfferingAction =
  | {
      kind: "add_to_cart";
      label: "Add to Cart";
      productId: string;
      variantId: string;
      /**
       * The exact Product Control SKU the resolved selection named. The
       * existing member cart is keyed by SKU, so the handoff needs it to add
       * the line the server already authorized; the browser still supplies no
       * identity of its own, it only echoes this one back.
       */
      sku: string;
      amount: { amountCents: number; currency: string };
      evaluatedAt: string;
    }
  | {
      kind: "request_access";
      label: "Request Access";
      href: string;
    }
  | {
      /**
       * Manual Early Access purchase. The buyer-facing path for a member-safe
       * variant that has no direct purchase authority: the buyer asks for the
       * purchase and a named human completes it. It creates no cart, no order,
       * no payment, and no quantity commitment.
       */
      kind: "request_early_access_purchase";
      label: "Request Early Access Purchase";
      href: string;
    }
  | {
      kind: "apply";
      label: "Apply";
      href: string;
    }
  | {
      kind: "notify_me";
      label: "Notify Me";
      href: string;
    }
  | {
      kind: "join_waitlist";
      label: "Join Waitlist";
      href: string;
    }
  | {
      kind: "explore_care";
      label: "Explore Care";
      href: string;
    }
  | {
      kind: "get_updates";
      label: "Get Updates";
      href: string;
    }
  | {
      kind: "none";
      label: null;
      href: null;
    };

/**
 * One selectable strength, size, or format, with its truthful state, its
 * approved price, and the one action the server resolved for it. The action is
 * on the summary so a list card can state it truthfully; it is still entirely
 * server resolved, and a card that renders it gains no authority the detail
 * surface did not already have.
 */
export interface MasterOfferingVariantSummary {
  id: string;
  label: string;
  displayState: MasterOfferingDisplayState;
  displayLabel: string;
  price: MasterOfferingPriceView;
  action: MasterOfferingAction;
}

/**
 * The detail row is the same shape. The name survives because the detail
 * surface reads it, and because keeping both names makes the contract state
 * explicitly that card and detail may never diverge again.
 */
export type MasterOfferingVariantView = MasterOfferingVariantSummary;

export interface MasterOfferingCardView {
  id: string;
  slug: string;
  displayName: string;
  canonicalName: string;
  family: MasterOfferingFamily;
  familyLabel: string;
  category: string;
  subcategory: string | null;
  brand: string | null;
  displayState: MasterOfferingDisplayState;
  displayLabel: string;
  stateExplanation: string;
  copyState: MasterOfferingCopyState;
  variantCount: number;
  /**
   * The strengths and formats a buyer can see while browsing, each with its
   * own state, approved price, and server-resolved action. The card renders
   * the action; it never resolves one. The exact purchase, with its quantity
   * band, still happens only on the detail surface.
   */
  variants: readonly MasterOfferingVariantSummary[];
  priceSummary: MasterOfferingPriceSummary;
}

export interface MasterOfferingDetailView extends MasterOfferingCardView {
  overview: string | null;
  variants: readonly MasterOfferingVariantView[];
  disclosures: readonly string[];
}

export interface MasterOfferingCatalogQuery {
  q?: string;
  families?: readonly MasterOfferingFamily[];
  states?: readonly MasterOfferingDisplayState[];
  /**
   * Category slugs, as published by the category facet. An unrecognized but
   * well formed slug matches nothing rather than failing the request, because
   * the vocabulary is data owned and can legitimately change under a client.
   */
  categories?: readonly string[];
  /** Omitted means `DEFAULT_MASTER_OFFERING_SORT`. */
  sort?: MasterOfferingSort;
  page?: number;
  pageSize?: number;
}

/**
 * One filter value and how many offerings the current query would leave if that
 * value were selected. Standard facet semantics: a facet's counts ignore that
 * facet's own selection, so selecting one family still shows what the others
 * hold. Every other active filter is applied.
 */
export interface MasterOfferingFacetBucket<TValue extends string = string> {
  value: TValue;
  label: string;
  count: number;
}

/**
 * Counts for the current query, one group per filter.
 *
 * The closed vocabularies list every member, including the zero counts, so a
 * filter row does not reshuffle as a member types. The category group lists
 * every category present in the member safe catalog, which also makes the
 * response the authoritative source of the category vocabulary.
 *
 * Nothing outside the member safe catalog is ever counted. An admin held
 * offering is not in the dataset, and the counter filters on visibility again
 * regardless, so a hold can never be inferred from a total.
 */
export interface MasterOfferingCatalogFacets {
  families: readonly MasterOfferingFacetBucket<MasterOfferingFamily>[];
  states: readonly MasterOfferingFacetBucket<MasterOfferingDisplayState>[];
  categories: readonly MasterOfferingFacetBucket[];
}

/** For a caller that must construct an empty page, such as a loading state. */
export const EMPTY_MASTER_OFFERING_FACETS: MasterOfferingCatalogFacets = {
  families: [],
  states: [],
  categories: [],
};

export interface MasterOfferingCatalogPage {
  ok: true;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** The sort actually applied, echoed so a caller never has to assume it. */
  sort: MasterOfferingSort;
  products: readonly MasterOfferingCardView[];
  facets: MasterOfferingCatalogFacets;
}

export type MasterOfferingCatalogAudience = "member" | "admin";

export type MasterOfferingCatalogLaunchScope =
  | "founder_admin"
  | "all_members";

export interface MasterOfferingCatalogListResponse {
  ok: true;
  audience: MasterOfferingCatalogAudience;
  launchScope: MasterOfferingCatalogLaunchScope;
  catalog: MasterOfferingCatalogPage;
}

export interface MasterOfferingCatalogDetailResponse {
  ok: true;
  audience: MasterOfferingCatalogAudience;
  launchScope: MasterOfferingCatalogLaunchScope;
  product: MasterOfferingDetailView;
}

export const MASTER_OFFERING_CATALOG_ERROR_CODES = [
  "master_offerings_disabled",
  "master_offerings_auth_required",
  "master_offerings_launch_restricted",
  "master_offerings_invalid_request",
  "master_offerings_not_found",
  "master_offerings_unavailable",
  "master_offerings_export_too_large",
] as const;

export type MasterOfferingCatalogErrorCode =
  (typeof MASTER_OFFERING_CATALOG_ERROR_CODES)[number];

export interface MasterOfferingCatalogErrorResponse {
  ok: false;
  code: MasterOfferingCatalogErrorCode;
}

export function isMasterOfferingFamily(
  value: unknown,
): value is MasterOfferingFamily {
  return (
    typeof value === "string" &&
    (MASTER_OFFERING_FAMILIES as readonly string[]).includes(value)
  );
}

export function isMasterOfferingSort(
  value: unknown,
): value is MasterOfferingSort {
  return (
    typeof value === "string" &&
    (MASTER_OFFERING_SORTS as readonly string[]).includes(value)
  );
}

export function isMasterOfferingDisplayState(
  value: unknown,
): value is MasterOfferingDisplayState {
  return (
    typeof value === "string" &&
    (MASTER_OFFERING_DISPLAY_STATES as readonly string[]).includes(value)
  );
}
