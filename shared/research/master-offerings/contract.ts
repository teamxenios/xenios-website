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
 * The browser receives an already resolved action. It never receives the private
 * binding that connected a planning variant to Product Control.
 */
export type MasterOfferingAction =
  | {
      kind: "add_to_cart";
      label: "Add to Cart";
      productId: string;
      variantId: string;
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
 * One selectable strength, size, or format, with its truthful state and its
 * approved price. A summary carries no action, so it is safe on a list card.
 */
export interface MasterOfferingVariantSummary {
  id: string;
  label: string;
  displayState: MasterOfferingDisplayState;
  displayLabel: string;
  price: MasterOfferingPriceView;
}

export interface MasterOfferingVariantView
  extends MasterOfferingVariantSummary {
  action: MasterOfferingAction;
}

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
   * The strengths and formats a buyer can see while browsing, each with its own
   * state and approved price. Deliberately action free: a card states facts,
   * and only the detail surface resolves a purchase action for one exact
   * variant.
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
  page?: number;
  pageSize?: number;
}

export interface MasterOfferingCatalogPage {
  ok: true;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  products: readonly MasterOfferingCardView[];
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

export function isMasterOfferingDisplayState(
  value: unknown,
): value is MasterOfferingDisplayState {
  return (
    typeof value === "string" &&
    (MASTER_OFFERING_DISPLAY_STATES as readonly string[]).includes(value)
  );
}
