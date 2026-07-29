/**
 * xenios research: the catalog DISPLAY wire contract.
 *
 * This is the only shape the catalog display API may put on the wire, and the
 * only shape the browser components read. It is deliberately a TYPE contract
 * plus closed vocabularies and nothing else: this module imports no catalog
 * data, so a client file may import it without pulling a single product record
 * into the browser bundle. The security model in server/research/index.ts
 * depends on that (a Vite SPA ships everything it imports), and the catalog
 * suite pins it with its own "not imported by any client file" test.
 *
 * Two rules shape every field below.
 *
 * 1. DISPLAY IS NOT PURCHASE. Every card and detail view carries the offer
 *    mode enum, and the browser turns it into words through describeOfferMode
 *    in shared/research/catalog/offer-readiness.ts. Nothing here promises a
 *    member may buy anything. The purchase decision stays with the offer
 *    readiness state machine on the server.
 *
 * 2. A PRICE APPEARS ONLY WHERE A FOUNDER APPROVED AN AMOUNT. The supplement
 *    and Quantum lanes hold founder approved member amounts, so those records
 *    may carry `price`. The peptide lane holds four disagreeing draft numbers
 *    and no confirmed formula, so a peptide record's `price` is ALWAYS null and
 *    the surface shows the offer mode label instead. That is a structural rule,
 *    not a per record decision: see the peptide catalog's own
 *    CustomerProductProjection, which carries no money field at all.
 *
 * The only money key permitted anywhere in this contract is `amountCents`
 * inside `MemberAmount`. Wholesale costs, computed drafts, prior matrix values,
 * legacy published prices, market reference prices, supplier identity, operator
 * notes, readiness states, and hold reasons are internal and never appear here.
 * A test asserts the serialized wire against a denylist of those exact keys.
 */

import type { OfferAvailabilityMode } from "../catalog/offer-readiness";

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/** The three implemented catalogs, as a member sees them grouped. */
export const CATALOG_DISPLAY_LANES = ["peptide", "supplement", "quantum"] as const;

export type CatalogDisplayLane = (typeof CATALOG_DISPLAY_LANES)[number];

/**
 * How much of the displayable catalog a viewer is shown.
 *
 * `standard` is the default breadth for every member: the records that carry a
 * founder approved amount and a named item, which is what a member can actually
 * act on. `full` adds the rest of the displayable range (records that are
 * request access only or display only today).
 *
 * Breadth changes WHAT IS LISTED and nothing else. It never changes a record's
 * offer mode, never reveals an internal field, and never unlocks a purchase the
 * offer model denies.
 */
export const CATALOG_VISIBILITY_BREADTHS = ["standard", "full"] as const;

export type CatalogVisibilityBreadth = (typeof CATALOG_VISIBILITY_BREADTHS)[number];

/** Who is looking. Derived server side from the authenticated request only. */
export const CATALOG_DISPLAY_AUDIENCES = ["member", "admin"] as const;

export type CatalogDisplayAudience = (typeof CATALOG_DISPLAY_AUDIENCES)[number];

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * A founder approved member amount, in positive integer cents.
 *
 * There is no zero in this type's domain: the projection refuses a non positive
 * amount and emits null instead, and the browser formatter refuses it a second
 * time. A "$0.00" render is impossible on both sides.
 */
export interface MemberAmount {
  amountCents: number;
  currency: "USD";
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * One selectable presentation. Carries the customer facing configuration facts
 * and its own offer mode, because a second vial size can be a different
 * availability from the first.
 */
export interface DisplayVariant {
  /**
   * Stable identifier for selection.
   *
   * It is the customer safe identifier the lane's own projection publishes
   * (the peptide lane publishes a sku), or, where a lane publishes none, a key
   * derived from the product slug. It is never an internal code a projection
   * deliberately withheld.
   */
  id: string;
  /** The polished one line configuration label. */
  label: string;
  /** Recorded exactly as its source states it. Null where no source states one. */
  strength: string | null;
  size: string | null;
  /** Null where the lane's projection publishes no presentation form. */
  format: string | null;
  availability: OfferAvailabilityMode;
  /** Audience scoping, not a purchase gate. The purchase gate is `availability`. */
  memberEligible: boolean;
}

/** The card shape. Everything a grid needs and nothing more. */
export interface DisplayProductCard {
  lane: CatalogDisplayLane;
  slug: string;
  displayName: string;
  canonicalName: string;
  category: string;
  /** The brand for a resold good. Null for a first party record. */
  brand: string | null;
  /** Protocol groupings, for navigation only. Never a statement about a person. */
  collections: readonly string[];
  /** The strongest truthful mode across this product's displayable variants. */
  availability: OfferAvailabilityMode;
  /** Null unless a founder approved an amount AND the mode permits showing one. */
  price: MemberAmount | null;
  variantCount: number;
  /** One line of approved catalog copy. Null where no copy record exists. */
  positioning: string | null;
}

/** The detail shape. The card plus the longer approved copy and the variants. */
export interface DisplayProductDetail extends DisplayProductCard {
  overview: string | null;
  /**
   * Published research areas for a research material. Never a benefit list, and
   * a surface that renders it must render RESEARCH_CONTEXT_DISCLOSURE beside it.
   * The `disclosures` array below carries the exact lines to render.
   */
  researchContext: readonly string[];
  /** Handling framing only. States no condition no document establishes. */
  storageAndHandling: string | null;
  /** Why the source workbook groups this record where it does. */
  whyItPairs: string | null;
  /** The standing lines this record's copy must be rendered alongside. */
  disclosures: readonly string[];
  variants: readonly DisplayVariant[];
}

/**
 * A regulatory hold record, for the ADMIN view only.
 *
 * These three products are excluded from every customer projection in code
 * (peptide-catalog.ts toCustomerProductProjection returns null for the
 * regulatory_hold tier), which is why they cannot be expressed as a
 * DisplayProductCard at all. They exist here so an operator can see that the
 * catalog knows about them and why they are held. They carry no price, no
 * variants, and no purchase affordance of any kind.
 */
export interface HeldProductNotice {
  lane: "peptide";
  slug: string;
  displayName: string;
  /** Always the words that mark it held. Never an availability a member could act on. */
  status: "regulatory_hold";
  /** The plain factual statement of why it is held and what would unlock it. */
  holdReason: string;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface CatalogDisplayCounts {
  /** Products listed in this response. */
  listed: number;
  /** Products the catalog can display in total, at full breadth. */
  displayable: number;
  /** Products excluded from every customer view because they are held. */
  excludedRegulatoryHold: number;
}

export interface CatalogDisplayListResponse {
  ok: true;
  audience: CatalogDisplayAudience;
  breadth: CatalogVisibilityBreadth;
  counts: CatalogDisplayCounts;
  products: readonly DisplayProductCard[];
  /** Present for the admin audience only. Absent, not empty, for a member. */
  held?: readonly HeldProductNotice[];
}

export interface CatalogDisplayDetailResponse {
  ok: true;
  audience: CatalogDisplayAudience;
  breadth: CatalogVisibilityBreadth;
  product: DisplayProductDetail;
}

// ---------------------------------------------------------------------------
// Closed error codes
// ---------------------------------------------------------------------------

export const CATALOG_DISPLAY_ERROR_CODES = [
  "catalog_display_disabled",
  "catalog_display_auth_required",
  "catalog_display_invalid_request",
  "catalog_display_not_found",
  "catalog_display_unavailable",
] as const;

export type CatalogDisplayErrorCode = (typeof CATALOG_DISPLAY_ERROR_CODES)[number];

export interface CatalogDisplayErrorResponse {
  ok: false;
  code: CatalogDisplayErrorCode;
  message?: string;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

export function isCatalogDisplayLane(value: unknown): value is CatalogDisplayLane {
  return (
    typeof value === "string" &&
    (CATALOG_DISPLAY_LANES as readonly string[]).includes(value)
  );
}

export function isCatalogVisibilityBreadth(
  value: unknown,
): value is CatalogVisibilityBreadth {
  return (
    typeof value === "string" &&
    (CATALOG_VISIBILITY_BREADTHS as readonly string[]).includes(value)
  );
}

/**
 * The one place an amount is judged displayable on either side of the wire.
 * Positive safe integer cents in the one supported currency, or nothing.
 */
export function isDisplayableAmount(value: MemberAmount | null): value is MemberAmount {
  return (
    value !== null &&
    typeof value === "object" &&
    value.currency === "USD" &&
    typeof value.amountCents === "number" &&
    Number.isSafeInteger(value.amountCents) &&
    value.amountCents > 0
  );
}
