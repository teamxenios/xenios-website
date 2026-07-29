/**
 * xenios research: the peptide discount and offer architecture.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS COMES FROM
 * ---------------------------------------------------------------------------
 *
 * Transcribed from the "Discounts and Offers" sheet of
 * XENIOS_PEPTIDE_MASTER_PRICING_MODEL_2026-07-29.xlsx
 * (sha256 f11742ae7801bcf465a5cf1a68af5ebdfab5dee9b6fba60aa9468e880161d519),
 * plus the two rules the Assumptions sheet marks LOCKED.
 *
 * ---------------------------------------------------------------------------
 * THE ONE DISTINCTION THAT MATTERS
 * ---------------------------------------------------------------------------
 *
 * The sheet is explicit about which of its own rows are decided and which are
 * proposals, and this module keeps that line in code rather than in prose.
 *
 * Exactly one row is APPROVED DOCTRINE: a single unit is sold at one clean
 * private member price, with no discount. Everything about volume (3%, 5%, 8%,
 * 10%) is DRAFT. The founding-member benefit is OPTIONAL. Three offers are
 * BLOCKED outright.
 *
 * So `decidedDiscountBasisPoints` returns 0 for every quantity, including 20
 * units, because no volume tier has been decided and the decided position is one
 * clean price. The draft tiers are readable through `draftUnitDiscount`, which
 * hands back the DRAFT status alongside the number so a caller cannot pick up a
 * rate without also picking up the fact that it is not approved.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS BLOCKED, AND WHY IT IS IN THE DATA
 * ---------------------------------------------------------------------------
 *
 * No permanent sale anchor, no BOGO or sitewide 20% sale, no struck-through
 * MSRP, and no automatic peptide subscription at launch. Those are recorded as
 * rows with status BLOCKED rather than simply left out, because a missing row is
 * an absence someone can fill in later, and a BLOCKED row with the founder's
 * reason attached is a decision. `offerIsPermitted` returns false for all three,
 * and the struck-through MSRP block is also an FTC price-comparison exposure,
 * not only a brand preference.
 *
 * This module is deliberately dependency free. It holds no prices: a discount is
 * a rate, and the number it would apply to lives in peptide-pricing-model.ts,
 * where nothing is chargeable yet.
 */

// ---------------------------------------------------------------------------
// The sheet's own framing
// ---------------------------------------------------------------------------

export const DISCOUNT_ARCHITECTURE_DOCTRINE =
  "The goal is price integrity, not discount addiction. No permanent sale anchor, no BOGO, and no automatic peptide subscription at launch.";

/**
 * The two pricing rules the Assumptions sheet marks LOCKED rather than EDITABLE.
 * Locked means the founder has settled them, not that they cannot be revisited
 * with counsel.
 */
export interface LockedPricingRule {
  rule: string;
  value: string;
  rationale: string;
  owner: string;
}

export const LOCKED_PRICING_RULES: readonly LockedPricingRule[] = [
  {
    rule: "Display-price doctrine",
    value: "One clean member price",
    rationale: "No fake MSRP or permanent strike-through price",
    owner: "FTC and brand discipline",
  },
  {
    rule: "Peptide subscription doctrine",
    value: "No automatic peptide renewal at launch",
    rationale: "Avoids cheapening the brand and adds billing/compliance complexity",
    owner: "Founder/counsel review",
  },
] as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/**
 * How settled an offer is.
 *
 * APPROVED_DOCTRINE is the sheet's "APPROVED DOCTRINE" and is the only status
 * that may be treated as decided. DRAFT is a proposal. OPTIONAL requires its own
 * separate approval. BLOCKED must not be offered.
 */
export type OfferStatus = "APPROVED_DOCTRINE" | "DRAFT" | "OPTIONAL" | "BLOCKED";

export const OFFER_STATUSES: readonly OfferStatus[] = [
  "APPROVED_DOCTRINE",
  "DRAFT",
  "OPTIONAL",
  "BLOCKED",
] as const;

/** What an offer's threshold is measured in. Keeps units and items from mixing. */
export type OfferThresholdBasis =
  | "unit_count"
  | "distinct_item_count"
  | "order_value"
  | "account_status"
  | "attribution"
  | "any";

/**
 * An offer's recommended or maximum value.
 *
 * A rate and an order-value threshold are different kinds of number and are not
 * interchangeable, so they are separate members rather than one loose `number`.
 * "NOT RECOMMENDED" is a third kind, not a zero: a zero discount is a real
 * decision (see the single-unit row) while NOT RECOMMENDED means do not offer
 * this at all.
 */
export type OfferValue =
  | { kind: "discount_rate"; basisPoints: number }
  | { kind: "order_value_threshold"; cents: number }
  | { kind: "not_recommended" };

export interface OfferUnitRange {
  minUnits: number;
  /** Null for an open-ended top tier. */
  maxUnits: number | null;
}

export interface PeptideOffer {
  id: string;
  /** The offer name exactly as the sheet states it. */
  offerType: string;
  /** The threshold exactly as the sheet states it. */
  threshold: string;
  thresholdBasis: OfferThresholdBasis;
  /** Parsed unit bounds. Non-null only where thresholdBasis is unit_count. */
  unitRange: OfferUnitRange | null;
  recommended: OfferValue;
  maximum: OfferValue;
  /** How the offer is named to a member, in the founder's words. */
  displayLanguage: string;
  why: string;
  status: OfferStatus;
  /**
   * False where the sheet says the mechanism must never appear to a member. The
   * affiliate commission is the case that matters: it is a cost of acquisition,
   * and the sheet warns it must not become a customer discount.
   */
  customerFacing: boolean;
}

// ---------------------------------------------------------------------------
// The architecture
// ---------------------------------------------------------------------------

/** All twelve offer rows, in sheet order. */
export const PEPTIDE_OFFER_ARCHITECTURE: readonly PeptideOffer[] = [
  {
    id: "single_unit",
    offerType: "Single unit",
    threshold: "1-2 units",
    thresholdBasis: "unit_count",
    unitRange: { minUnits: 1, maxUnits: 2 },
    recommended: { kind: "discount_rate", basisPoints: 0 },
    maximum: { kind: "discount_rate", basisPoints: 0 },
    displayLanguage: "Private member price",
    why: "One clean price is the strongest premium signal",
    status: "APPROVED_DOCTRINE",
    customerFacing: true,
  },
  {
    id: "small_multi_unit_order",
    offerType: "Small multi-unit order",
    threshold: "3-4 units",
    thresholdBasis: "unit_count",
    unitRange: { minUnits: 3, maxUnits: 4 },
    recommended: { kind: "discount_rate", basisPoints: 300 },
    maximum: { kind: "discount_rate", basisPoints: 300 },
    displayLanguage: "Research quantity adjustment",
    why: "Light operational savings without cheapening",
    status: "DRAFT",
    customerFacing: true,
  },
  {
    id: "standard_volume",
    offerType: "Standard volume",
    threshold: "5-9 units",
    thresholdBasis: "unit_count",
    unitRange: { minUnits: 5, maxUnits: 9 },
    recommended: { kind: "discount_rate", basisPoints: 500 },
    maximum: { kind: "discount_rate", basisPoints: 500 },
    displayLanguage: "Laboratory quantity pricing",
    why: "Matches premium-market lower tier",
    status: "DRAFT",
    customerFacing: true,
  },
  {
    id: "large_volume",
    offerType: "Large volume",
    threshold: "10-19 units",
    thresholdBasis: "unit_count",
    unitRange: { minUnits: 10, maxUnits: 19 },
    recommended: { kind: "discount_rate", basisPoints: 800 },
    maximum: { kind: "discount_rate", basisPoints: 800 },
    displayLanguage: "Institutional quantity pricing",
    why: "Still below common 10-20% competitor discounts",
    status: "DRAFT",
    customerFacing: true,
  },
  {
    id: "enterprise_volume",
    offerType: "Enterprise volume",
    threshold: "20+ units",
    thresholdBasis: "unit_count",
    unitRange: { minUnits: 20, maxUnits: null },
    recommended: { kind: "discount_rate", basisPoints: 1000 },
    maximum: { kind: "discount_rate", basisPoints: 1000 },
    displayLanguage: "Contact Research Operations",
    why: "Manual approval only",
    status: "DRAFT",
    customerFacing: true,
  },
  {
    id: "multi_item_research_order",
    offerType: "Multi-item research order",
    threshold: "3+ distinct eligible items",
    thresholdBasis: "distinct_item_count",
    unitRange: null,
    recommended: { kind: "discount_rate", basisPoints: 800 },
    maximum: { kind: "discount_rate", basisPoints: 1000 },
    displayLanguage: "Curated research order savings",
    why: "Avoid calling it a protocol or treatment stack",
    status: "DRAFT",
    customerFacing: true,
  },
  {
    id: "free_shipping",
    offerType: "Free shipping",
    threshold: "Order value",
    thresholdBasis: "order_value",
    unitRange: null,
    recommended: { kind: "order_value_threshold", cents: 25000 },
    maximum: { kind: "order_value_threshold", cents: 25000 },
    displayLanguage: "Complimentary tracked shipping over $250",
    why: "Matches premium market and protects margin",
    status: "DRAFT",
    customerFacing: true,
  },
  {
    id: "founding_member_benefit",
    offerType: "Founding-member benefit",
    threshold: "Account status",
    thresholdBasis: "account_status",
    unitRange: null,
    recommended: { kind: "discount_rate", basisPoints: 500 },
    maximum: { kind: "discount_rate", basisPoints: 500 },
    displayLanguage: "Founding member pricing",
    why: "Use only if separately approved and consistently applied",
    status: "OPTIONAL",
    customerFacing: true,
  },
  {
    id: "affiliate_attribution",
    offerType: "Affiliate attribution",
    threshold: "Completed paid order",
    thresholdBasis: "attribution",
    unitRange: null,
    recommended: { kind: "discount_rate", basisPoints: 1000 },
    maximum: { kind: "discount_rate", basisPoints: 1000 },
    displayLanguage: "Not customer-facing",
    why: "Commission should not create a customer discount",
    status: "DRAFT",
    customerFacing: false,
  },
  {
    id: "auto_renew_peptide_subscription",
    offerType: "Auto-renew peptide subscription",
    threshold: "Any",
    thresholdBasis: "any",
    unitRange: null,
    recommended: { kind: "not_recommended" },
    maximum: { kind: "not_recommended" },
    displayLanguage: "Do not offer at launch",
    why: "Billing, compliance, and premium-brand risk",
    status: "BLOCKED",
    customerFacing: false,
  },
  {
    id: "bogo_or_sitewide_sale",
    offerType: "BOGO or sitewide 20% sale",
    threshold: "Any",
    thresholdBasis: "any",
    unitRange: null,
    recommended: { kind: "not_recommended" },
    maximum: { kind: "not_recommended" },
    displayLanguage: "Do not offer",
    why: "Trains customers to wait and undermines institutional trust",
    status: "BLOCKED",
    customerFacing: false,
  },
  {
    id: "struck_through_msrp",
    offerType: "Struck-through MSRP",
    threshold: "Any",
    thresholdBasis: "any",
    unitRange: null,
    recommended: { kind: "not_recommended" },
    maximum: { kind: "not_recommended" },
    displayLanguage: "Do not display unless bona fide",
    why: "FTC price-comparison risk and cheap retail signal",
    status: "BLOCKED",
    customerFacing: false,
  },
] as const;

/** Pinned so a silent deletion fails a test. */
export const PEPTIDE_OFFER_COUNT = 12;

/**
 * The hard cap on any ordinary discount, from the Assumptions sheet: maximum
 * bundle discount 10%, maximum volume discount 10%. No stacking may exceed it.
 */
export const MAXIMUM_DISCOUNT_BASIS_POINTS = 1000;

// ---------------------------------------------------------------------------
// The decided position
// ---------------------------------------------------------------------------

/** True only for the one status the sheet marks as decided. */
export function isDecidedDoctrine(status: OfferStatus): boolean {
  return status === "APPROVED_DOCTRINE";
}

export function findOffer(id: string): PeptideOffer | null {
  return PEPTIDE_OFFER_ARCHITECTURE.find((offer) => offer.id === id) ?? null;
}

/** The offers that are settled. Today: the single clean member price, and nothing else. */
export function decidedOffers(): readonly PeptideOffer[] {
  return PEPTIDE_OFFER_ARCHITECTURE.filter((offer) => isDecidedDoctrine(offer.status));
}

/** Proposals. Readable, quotable in a report, not applicable to an order. */
export function draftOffers(): readonly PeptideOffer[] {
  return PEPTIDE_OFFER_ARCHITECTURE.filter((offer) => offer.status === "DRAFT");
}

export function blockedOffers(): readonly PeptideOffer[] {
  return PEPTIDE_OFFER_ARCHITECTURE.filter((offer) => offer.status === "BLOCKED");
}

/** False for every BLOCKED offer, whatever else a caller believes about it. */
export function offerIsPermitted(offer: PeptideOffer): boolean {
  return offer.status !== "BLOCKED";
}

function assertUnitCount(units: number): void {
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new RangeError("units must be a positive safe integer");
  }
}

/** The unit tier a quantity falls in, or null if none covers it. */
export function unitTierForQuantity(units: number): PeptideOffer | null {
  assertUnitCount(units);
  return (
    PEPTIDE_OFFER_ARCHITECTURE.find((offer) => {
      if (offer.thresholdBasis !== "unit_count" || offer.unitRange === null) return false;
      if (units < offer.unitRange.minUnits) return false;
      return offer.unitRange.maxUnits === null || units <= offer.unitRange.maxUnits;
    }) ?? null
  );
}

/**
 * The discount that is actually decided for a quantity, in basis points.
 *
 * It is 0 for every quantity today, and that is the point: the only APPROVED
 * DOCTRINE row is the single unit at one clean price, so until the founder
 * approves a volume tier the decided answer at any quantity is no discount. A
 * DRAFT tier is never returned here.
 */
export function decidedDiscountBasisPoints(units: number): number {
  const tier = unitTierForQuantity(units);
  if (tier === null) return 0;
  if (!isDecidedDoctrine(tier.status)) return 0;
  if (tier.recommended.kind !== "discount_rate") return 0;
  return tier.recommended.basisPoints;
}

export interface DraftUnitDiscount {
  offerId: string;
  offerType: string;
  basisPoints: number;
  status: OfferStatus;
  displayLanguage: string;
}

/**
 * The proposed tier for a quantity, with its status attached.
 *
 * This is how a report or a founder review reads the draft ladder. The status
 * travels with the number on purpose: there is no way to take the 8% without
 * also taking the word DRAFT.
 */
export function draftUnitDiscount(units: number): DraftUnitDiscount | null {
  const tier = unitTierForQuantity(units);
  if (tier === null || tier.recommended.kind !== "discount_rate") return null;
  return {
    offerId: tier.id,
    offerType: tier.offerType,
    basisPoints: tier.recommended.basisPoints,
    status: tier.status,
    displayLanguage: tier.displayLanguage,
  };
}

export interface UnitDiscountResolution {
  /** What may actually be applied. Zero while only the single-unit doctrine is approved. */
  appliedBasisPoints: number;
  /** Whether appliedBasisPoints rests on an approved decision. */
  decided: boolean;
  /** The tier that would apply if the volume ladder were approved. */
  draft: DraftUnitDiscount | null;
  /** One plain-English line, safe to show a founder or log. */
  explanation: string;
}

/**
 * The single entry point for "what discount applies to this quantity".
 *
 * Returns the decided answer as the applied number, and the draft tier alongside
 * it as information. A caller that only reads `appliedBasisPoints` is correct by
 * default, which is the property that matters.
 */
export function resolveUnitDiscount(units: number): UnitDiscountResolution {
  const applied = decidedDiscountBasisPoints(units);
  const draft = draftUnitDiscount(units);
  const decided = draft !== null && isDecidedDoctrine(draft.status);
  if (decided) {
    return {
      appliedBasisPoints: applied,
      decided: true,
      draft,
      explanation: `${units} unit(s): ${draft.displayLanguage}, one clean member price with no discount (approved doctrine).`,
    };
  }
  if (draft === null) {
    return {
      appliedBasisPoints: 0,
      decided: false,
      draft: null,
      explanation: `${units} unit(s): no offer tier covers this quantity, so no discount applies.`,
    };
  }
  return {
    appliedBasisPoints: 0,
    decided: false,
    draft,
    explanation: `${units} unit(s): ${draft.offerType} proposes ${draft.basisPoints / 100}% but is ${draft.status}, so no discount applies until the founder approves the volume ladder.`,
  };
}

/** Whether a rate sits inside the founder's 10% cap. */
export function discountWithinCap(basisPoints: number): boolean {
  return (
    Number.isSafeInteger(basisPoints) &&
    basisPoints >= 0 &&
    basisPoints <= MAXIMUM_DISCOUNT_BASIS_POINTS
  );
}
