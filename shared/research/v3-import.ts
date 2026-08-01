/**
 * The V3 master import contract.
 *
 * The V3 workbook (XENIOS_RESEARCH_COMPLETE_MASTER_2026-08-01_V3.xlsx) is the
 * commercial planning record. It is not the production catalog and it is not a
 * price authority. This module states, in types, the one distinction the whole
 * lane rests on:
 *
 *   A SOURCE record is what a workbook row says.
 *   An APPROVED production price is what Product Control has decided.
 *
 * Import produces the first and can never produce the second. There is no field
 * on a source record that an approval could be written into, and the customer
 * projection reads its amount from an approval argument that import does not
 * supply. So "the importer accidentally published a price" is not a bug that can
 * be introduced by editing this file; it would require adding an argument to a
 * function signature, which a reviewer sees.
 *
 * CUSTOMER-SAFE BOUNDARY. Wholesale cost, cost status, supplier name, margin,
 * gross profit, and the workbook's planning sell price are internal analysis.
 * None of them appear on the customer projection type, so a leak is a type
 * error before it is a test failure. Tests pin it at runtime as well.
 *
 * This module is dependency free by design so both the server importer and any
 * future client surface can consume it without dragging in admin types.
 *
 * All money is integer cents. No floats, no defaulting, and no zero prices: a
 * missing price renders "Not currently available", never "$0".
 */

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/**
 * The complete readiness vocabulary. This list is closed. It is the set given
 * in the operating superprompt section 7.1 and nothing may be added to it here:
 * a new state would be a new promise to a customer, which is a founder decision
 * rather than a code change.
 */
export const V3_READINESS_STATES = [
  "active_public",
  "member_only",
  "qualified_research",
  "request_access",
  "care_only",
  "clinical_provider_pathway",
  "pending_supplier",
  "pending_price",
  "pending_documentation",
  "pending_image",
  "held",
  "unavailable",
  "archived",
] as const;

export type V3ReadinessState = (typeof V3_READINESS_STATES)[number];

/**
 * The states in which an approved customer price may be displayed and an offer
 * may be transacted. Every other state is a surface that shows no price.
 * A contested variant presentation can never reach any of these.
 */
export const V3_PURCHASABLE_READINESS_STATES = [
  "active_public",
  "member_only",
  "qualified_research",
] as const;

export type V3PurchasableReadinessState =
  (typeof V3_PURCHASABLE_READINESS_STATES)[number];

export function isPurchasableReadinessState(
  state: V3ReadinessState,
): state is V3PurchasableReadinessState {
  return (V3_PURCHASABLE_READINESS_STATES as readonly string[]).includes(state);
}

/**
 * Why an offer is not further along. A record can carry several of these at
 * once; the resolved state is the most blocking one, and the rest are still
 * reported so an operator sees the whole gap and not only the first wall.
 */
export const V3_BLOCKING_REASONS = [
  "archived",
  "marked_unavailable",
  "marked_held",
  "variant_strength_disputed",
  "variant_identity_unstated",
  "variant_label_contested",
  "under_review",
  "access_state_unrecognized",
  "care_pathway_only",
  "clinical_provider_pathway_only",
  "access_request_required",
  "wholesale_cost_pending",
  "customer_price_not_approved",
  "coa_missing",
  "lot_documentation_missing",
  "product_image_missing",
] as const;

export type V3BlockingReason = (typeof V3_BLOCKING_REASONS)[number];

// ---------------------------------------------------------------------------
// Source record vocabulary
// ---------------------------------------------------------------------------

/** The workbook's own top-level categories, verbatim. */
export const V3_CATEGORIES = [
  "Peptides & Research",
  "Supplements",
  "Bloodwork & Testing",
  "Care & Telemedicine",
  "Quantum & Regenerative",
  "Programs & Services",
  "Membership & Programs",
  "Provider & Performance Network",
  "AI & Tracking",
  "Education & Video",
  "White Label & Partners",
  "Shipping & Fulfillment",
] as const;

export type V3Category = (typeof V3_CATEGORIES)[number];

export function isV3Category(value: unknown): value is V3Category {
  return (V3_CATEGORIES as readonly unknown[]).includes(value);
}

/**
 * Who an offer is for once every block clears. This is the audience the
 * readiness machine uses to choose a terminal state; it is not an entitlement
 * check and it grants nobody anything.
 */
export type V3Audience =
  | "public"
  | "member"
  | "qualified_research"
  | "care"
  | "clinical_provider"
  | "partner";

/**
 * What the workbook's access column means, normalized. `planning` is the
 * non-committal case: the row carries a planning note rather than a decision,
 * so it falls through to the evidence chain instead of short circuiting.
 */
export type V3AccessIntent =
  | "planning"
  | "approval_required"
  | "access_request_required"
  | "care_only"
  | "clinical_provider_pathway"
  | "under_review"
  | "held"
  | "unavailable"
  | "unrecognized";

/** Whether a wholesale cost is sourced or still owed by a supplier. */
export type V3CostState = "known" | "pending";

/** Evidence states. Missing evidence stays missing; nothing is ever inferred. */
export type V3EvidenceState = "attached" | "missing";

/** Whether a rights-cleared, variant-matched product image exists. */
export type V3ImageState = "approved" | "pending";

/**
 * Internal commercial analysis for one row. ADMIN ONLY.
 *
 * This shape is deliberately not reachable from the customer projection type.
 * `wholesaleAmountCents` is null whenever the workbook marks the cost pending;
 * it is never estimated, never back-solved from a sell price, and never
 * defaulted to zero.
 */
export interface V3AdminCostRecord {
  readonly state: V3CostState;
  readonly wholesaleAmountCents: number | null;
  /** The workbook's own wording, kept so an operator can audit the claim. */
  readonly statusText: string;
  readonly supplierName: string | null;
}

/**
 * The workbook's proposed sell price. ADMIN ONLY, and a proposal only.
 *
 * This is the number the workbook itself calls a planning value. It is not a
 * price, it is not authority, and no customer surface may render it. It exists
 * on the source record so Product Control can see what was proposed when it
 * makes the separate approval decision.
 */
export interface V3PlanningPriceRecord {
  readonly proposedAmountCents: number | null;
  readonly basisText: string | null;
}

/** Documentation the offer would need before an active state is honest. */
export interface V3DocumentationRecord {
  readonly coaState: V3EvidenceState;
  readonly lotState: V3EvidenceState;
}

/**
 * How a variant label was established. Ambiguity is rejected, never guessed,
 * and `unstated` is recorded honestly rather than filled in: 803 supplement
 * rows of the delivered workbook state no presentation in either sheet, and a
 * brand catalog entry with no size or count is a product we cannot yet name
 * exactly.
 */
export type V3VariantLabelOrigin = "offer_index" | "price_book" | "unstated";

/**
 * Whether this record names one exact unit.
 *
 * `unstated`  neither sheet states a presentation.
 * `contested` the offer index and the price book state different labels for the
 *             one commercial row. 65 service rows of the delivered workbook do
 *             this, using the same column for a format on one sheet and a scope
 *             description on the other. The row is kept and the disagreement is
 *             recorded, because choosing one wording over the other is an
 *             editorial decision a human makes, not one an importer makes.
 *
 * Neither can reach a purchasable state.
 */
export type V3VariantIdentity = "exact" | "unstated" | "contested";

/**
 * One workbook row, normalized. A source record asserts only what the workbook
 * says, tagged with where it came from. It carries no approval, no publication
 * decision, and no effective date, because the workbook records none.
 */
export interface V3SourceRecord {
  /** Stable within one import and across repeated imports of the same input. */
  readonly recordId: string;
  readonly sourceSheet: string;
  /** 1-based spreadsheet row number, so an operator can open the cell. */
  readonly sourceRowNumber: number;
  readonly category: V3Category;
  /** The workbook's subcategory or brand rail, verbatim. */
  readonly rail: string | null;
  readonly offerId: string;
  readonly productName: string;
  /** The presentation verbatim, or null when the workbook states none. */
  readonly variantLabel: string | null;
  readonly variantLabelOrigin: V3VariantLabelOrigin;
  readonly variantIdentity: V3VariantIdentity;
  /** The exact variant SKU where the peptide master supplies one, else null. */
  readonly variantSku: string | null;
  readonly audience: V3Audience;
  readonly accessIntent: V3AccessIntent;
  /** The access column verbatim, so an unrecognized value stays auditable. */
  readonly accessStatusText: string | null;
  readonly cost: V3AdminCostRecord;
  readonly planningPrice: V3PlanningPriceRecord;
  readonly documentation: V3DocumentationRecord;
  readonly imageState: V3ImageState;
  /** True when the merged strength guard contests this exact variant. */
  readonly strengthDisputed: boolean;
  /**
   * Always null on import. The workbook records no effective date, and an
   * effective date is a property of an approval rather than of a source row.
   */
  readonly effectiveDate: null;
}

// ---------------------------------------------------------------------------
// Approval: the separate, explicit act
// ---------------------------------------------------------------------------

/**
 * A price Product Control has approved for customers. Import never constructs
 * one of these. It arrives from the approved production record, and the fact
 * that the customer projection takes it as a separate argument is what makes
 * "an import published a price" impossible without a signature change.
 */
export interface V3ApprovedCustomerPrice {
  readonly amountCents: number;
  readonly currency: "USD";
  /** The named human who approved it. Never "the system". */
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly effectiveDate: string;
}

/**
 * How a caller supplies approvals. Returning null is the default and the safe
 * answer: nothing is approved until a human approves it.
 */
export type V3ApprovedPriceLookup = (
  record: V3SourceRecord,
) => V3ApprovedCustomerPrice | null;

/** The lookup an import uses. It approves nothing, because import approves nothing. */
export const noApprovedPrices: V3ApprovedPriceLookup = () => null;

/** True only for a positive safe integer amount of cents. */
export function isV3SafeAmountCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isV3ApprovedCustomerPrice(
  value: unknown,
): value is V3ApprovedCustomerPrice {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isV3SafeAmountCents(candidate.amountCents) &&
    candidate.currency === "USD" &&
    typeof candidate.approvedBy === "string" &&
    candidate.approvedBy.trim().length > 0 &&
    typeof candidate.approvedAt === "string" &&
    candidate.approvedAt.trim().length > 0 &&
    typeof candidate.effectiveDate === "string" &&
    candidate.effectiveDate.trim().length > 0
  );
}

// ---------------------------------------------------------------------------
// The readiness state machine
// ---------------------------------------------------------------------------

/**
 * Everything the machine is allowed to consider. It is a plain value object so
 * the machine stays pure and testable, and so the server can inject the real
 * strength guard rather than this module reaching for it.
 */
export interface V3ReadinessInput {
  readonly archived: boolean;
  readonly accessIntent: V3AccessIntent;
  readonly strengthDisputed: boolean;
  readonly variantIdentity: V3VariantIdentity;
  readonly costState: V3CostState;
  /** True only when an approved customer price exists for this exact record. */
  readonly hasApprovedPrice: boolean;
  readonly documentation: V3DocumentationRecord;
  readonly imageState: V3ImageState;
  readonly audience: V3Audience;
}

export interface V3ReadinessDecision {
  readonly state: V3ReadinessState;
  /** Every unmet condition, in evaluation order, not only the deciding one. */
  readonly blockingReasons: readonly V3BlockingReason[];
}

/**
 * Resolve readiness. Fails closed at every step: the most blocking condition
 * wins, an unrecognized access value is held rather than assumed benign, and a
 * contested variant presentation is held before any pathway state can be
 * chosen. The order below is the whole policy, read top to bottom.
 */
export function resolveV3Readiness(
  input: V3ReadinessInput,
): V3ReadinessDecision {
  const reasons: V3BlockingReason[] = [];

  if (input.archived) reasons.push("archived");
  if (input.accessIntent === "unavailable") reasons.push("marked_unavailable");
  if (input.accessIntent === "held") reasons.push("marked_held");
  if (input.strengthDisputed) reasons.push("variant_strength_disputed");
  if (input.variantIdentity === "unstated") {
    reasons.push("variant_identity_unstated");
  }
  if (input.variantIdentity === "contested") {
    reasons.push("variant_label_contested");
  }
  if (input.accessIntent === "under_review") reasons.push("under_review");
  if (input.accessIntent === "unrecognized") {
    reasons.push("access_state_unrecognized");
  }
  if (input.accessIntent === "care_only") reasons.push("care_pathway_only");
  if (input.accessIntent === "clinical_provider_pathway") {
    reasons.push("clinical_provider_pathway_only");
  }
  if (input.accessIntent === "access_request_required") {
    reasons.push("access_request_required");
  }
  if (input.costState === "pending") reasons.push("wholesale_cost_pending");
  if (!input.hasApprovedPrice) reasons.push("customer_price_not_approved");
  if (input.documentation.coaState === "missing") reasons.push("coa_missing");
  if (input.documentation.lotState === "missing") {
    reasons.push("lot_documentation_missing");
  }
  if (input.imageState === "pending") reasons.push("product_image_missing");

  const state = decideState(input);
  return { state, blockingReasons: Object.freeze(reasons) };
}

function decideState(input: V3ReadinessInput): V3ReadinessState {
  // Hard stops. Nothing below can override one of these.
  if (input.archived) return "archived";
  if (input.accessIntent === "unavailable") return "unavailable";
  if (input.accessIntent === "held") return "held";

  // A contested presentation is an identity question a human must settle.
  // It is checked before every pathway state so no pathway can carry it.
  if (input.strengthDisputed) return "held";

  // A row still under review, or whose access wording we do not recognize, is
  // held rather than read charitably. Guessing here would publish something.
  if (input.accessIntent === "under_review") return "held";
  if (input.accessIntent === "unrecognized") return "held";

  // Declared pathways. These are honest live surfaces that carry no price, so
  // they resolve before the cost and price chain.
  if (input.accessIntent === "care_only") return "care_only";
  if (input.accessIntent === "clinical_provider_pathway") {
    return "clinical_provider_pathway";
  }
  if (input.accessIntent === "access_request_required") return "request_access";

  // The evidence chain, in the order the evidence has to arrive.
  if (input.costState === "pending") return "pending_supplier";
  if (!input.hasApprovedPrice) return "pending_price";
  // An exact presentation is part of what documents a unit. A product we
  // cannot name exactly, because no sheet states it or because two sheets
  // disagree, is documentation-pending. That keeps it out of every purchasable
  // state without pretending an operator has held it.
  if (
    input.documentation.coaState === "missing" ||
    input.documentation.lotState === "missing" ||
    input.variantIdentity !== "exact"
  ) {
    return "pending_documentation";
  }
  if (input.imageState === "pending") return "pending_image";

  // Everything is in place. The audience decides which surface it lands on.
  switch (input.audience) {
    case "public":
      return "active_public";
    case "member":
      return "member_only";
    case "qualified_research":
      return "qualified_research";
    case "care":
      return "care_only";
    case "clinical_provider":
      return "clinical_provider_pathway";
    case "partner":
      // A partner offer is never a public catalog surface. It is reached by
      // request and contract, so its cleared state is still request_access.
      return "request_access";
  }
}

// ---------------------------------------------------------------------------
// The customer projection
// ---------------------------------------------------------------------------

/** The one wording a customer sees where there is no approved price. */
export const V3_PRICE_UNAVAILABLE_MESSAGE = "Not currently available";

/**
 * What a customer surface may render for price. There is no third shape and no
 * default, so a missing or unapproved price cannot render as $0.
 */
export type V3CustomerPriceProjection =
  | { readonly state: "priced"; readonly amountCents: number; readonly currency: "USD" }
  | { readonly state: "not_available"; readonly message: typeof V3_PRICE_UNAVAILABLE_MESSAGE };

/**
 * The complete customer-facing view of one offer. Every field here is safe to
 * send to a browser. There is deliberately no cost, cost status, supplier,
 * margin, gross profit, planning price, approver, or workbook note field, so a
 * leak cannot be introduced by populating an existing property.
 */
export interface V3CustomerOfferProjection {
  readonly offerId: string;
  readonly productName: string;
  readonly variantLabel: string | null;
  readonly variantSku: string | null;
  readonly category: V3Category;
  readonly readiness: V3ReadinessState;
  readonly price: V3CustomerPriceProjection;
}

const PRICE_NOT_AVAILABLE: V3CustomerPriceProjection = Object.freeze({
  state: "not_available",
  message: V3_PRICE_UNAVAILABLE_MESSAGE,
});

/**
 * Project one source record for a customer.
 *
 * The approval is a separate argument on purpose. This function never reads
 * `record.cost` or `record.planningPrice`, so no workbook planning number and
 * no multiple of a wholesale cost can become a displayed price through this
 * path. A price appears only when all three hold: an approval was passed in,
 * it is well formed, and the readiness state is one where a price may be shown.
 */
export function projectV3CustomerOffer(
  record: V3SourceRecord,
  readiness: V3ReadinessDecision,
  approvedPrice: V3ApprovedCustomerPrice | null,
): V3CustomerOfferProjection {
  const priced =
    approvedPrice !== null &&
    isV3ApprovedCustomerPrice(approvedPrice) &&
    isPurchasableReadinessState(readiness.state);

  return Object.freeze({
    offerId: record.offerId,
    productName: record.productName,
    variantLabel: record.variantLabel,
    variantSku: record.variantSku,
    category: record.category,
    readiness: readiness.state,
    price: priced
      ? Object.freeze({
          state: "priced" as const,
          amountCents: approvedPrice.amountCents,
          currency: approvedPrice.currency,
        })
      : PRICE_NOT_AVAILABLE,
  });
}
