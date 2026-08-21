// Whether one exact variant may enter the EIGHT-STEP PAYMENT JOURNEY.
//
// WHY THIS EXISTS SEPARATELY FROM THE PATHWAY RESOLVER
//
// `shared/research/early-access/customer-pathway.ts` answers "what should this
// row's button say". That is a SHELF decision, and it is right. This module
// answers a different question — "may this exact variant take a customer's
// money" — and it is the last thing consulted before the payment journey opens.
//
// The two must agree, and they do — but NOT by this file importing that one.
// `shared/research/early-access/customer-pathway.ts` is not committed on any
// pushed commit yet (it is live only as uncommitted work in the lead's
// worktree), so importing it would make this module unbuildable for everyone
// else. Instead the approved-family list is an INJECTED policy input: the
// composition root passes `DIRECT_PURCHASE_FAMILIES` from that file the moment
// it lands. There is no default and no local copy, so the list still lives in
// exactly one place and a caller cannot accidentally invent a second one.
//
// What this module adds beyond the shelf resolver is the facts it does not
// currently receive, and a refusal that is recorded rather than implied.
//
// The reason for a second gate is measured, not theoretical. Early Access was
// scoped to the founder-released opening set (22 visible, 18 purchasable), so
// the release ledger was doing the containment. Generalizing the journey to the
// canonical peptide set removes that containment. When a filter that was
// holding a line is taken away, the rules it was silently enforcing have to be
// written down somewhere, or they stop being enforced. This is that somewhere.
//
// THE SEQUENCING HAZARD THIS CLOSES
//
// Measured against the canonical runtime dataset on 2026-08-21: six workbook
// peptide rows have no runtime variant, and one of them is
//
//     GRP-0422  CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)  $99
//
// It is family `research_peptides_materials`, channel `RUO Research`, and
// priced — so it satisfies every condition the shelf resolver checks, and the
// ONLY reason it is not purchasable today is that the variant does not exist
// yet. The moment the reconciliation lane generates the missing variants, it
// becomes buyable, and Xenios would be selling a combination whose component
// split it cannot state. The block has to exist BEFORE the generation runs, not
// after, which is why this lands now rather than alongside that lane.
//
// COMPOSITION IS A CANONICAL FACT, NOT A DENYLIST
//
// `compositionResolved` is an input, so the row becomes purchasable by itself
// on the day someone records the split. A SKU denylist would have to be
// remembered and removed by hand, and the failure mode of forgetting is a
// permanently unsellable product nobody can explain.

// ---------------------------------------------------------------------------
// Refusals. Every one names a canonical fact, never a product.
// ---------------------------------------------------------------------------

export const paymentEligibilityRefusalCodes = [
  /** Not an approved direct-purchase family (capsules, 503A, supplements...). */
  "FAMILY_NOT_DIRECT",
  /** Intended-use classification is not CONFIRMED research use only. */
  "CLASSIFICATION_NOT_CONFIRMED",
  /** No approved retail price. A missing price is never a zero. */
  "NO_APPROVED_PRICE",
  /** The composition/split is not stated, so the product cannot be described. */
  "COMPOSITION_UNRESOLVED",
  /** Product Control, a dispute, or a founder hold is holding this unit. */
  "UNIT_HELD",
  /** Availability is under review; visible, deliberately not purchasable. */
  "AVAILABILITY_UNDER_REVIEW",
] as const;

export type PaymentEligibilityRefusalCode =
  (typeof paymentEligibilityRefusalCodes)[number];

/**
 * The commercial policy this gate is evaluated against. Injected, never
 * defaulted: `directPurchaseFamilies` is the SAME array
 * `DIRECT_PURCHASE_FAMILIES` that the pathway resolver exports, handed in by
 * the composition root. Requiring it means adding a family stays one reviewed
 * line in one file, and a caller that has not thought about the list cannot
 * silently get an empty or invented one.
 */
export type PaymentEligibilityPolicy = Readonly<{
  directPurchaseFamilies: readonly string[];
}>;

export type PaymentEligibility =
  | Readonly<{ eligible: true }>
  | Readonly<{
      eligible: false;
      code: PaymentEligibilityRefusalCode;
      /** Operator-facing. Never rendered to a customer as-is. */
      reason: string;
    }>;

// ---------------------------------------------------------------------------
// Facts.
// ---------------------------------------------------------------------------

/**
 * Everything that decides whether money may change hands for one exact variant.
 *
 * Note what is NOT here: no price AMOUNT, no SKU, no product name, no display
 * copy. This gate decides permission, never money, so it cannot be the place a
 * wrong number enters. The amount stays with the canonical price authority.
 */
export type CanonicalPaymentFacts = Readonly<{
  /** Canonical family key, e.g. "research_peptides_materials". */
  family: string;
  /**
   * TRUE only when the intended-use classification is CONFIRMED research use
   * only. A row still awaiting classification is not RUO yet, and nothing may
   * relabel it to make it purchasable.
   */
  researchUseOnlyConfirmed: boolean;
  /** Whether the canonical price authority resolves an approved retail price. */
  hasApprovedRetailPrice: boolean;
  /**
   * Whether this variant's composition is fully stated. False for a combination
   * whose component split is pending. Sourced from the catalog authority; see
   * `compositionResolvedFromSpecification` for the interim reading.
   */
  compositionResolved: boolean;
  /** Product Control blocker, strength dispute, or founder hold. */
  held: boolean;
  /** Availability is under review for this exact unit. */
  availabilityUnderReview: boolean;
}>;

// ---------------------------------------------------------------------------
// The gate.
// ---------------------------------------------------------------------------

/**
 * Order matters and is the whole point, exactly as in the pathway resolver: the
 * disqualifying facts are consulted BEFORE price, so an approved price can
 * never promote a row out of the state it belongs to. Price is necessary for a
 * direct purchase and never sufficient for one.
 */
export function canonicalPaymentEligibility(
  facts: CanonicalPaymentFacts,
  policy: PaymentEligibilityPolicy,
): PaymentEligibility {
  if (!policy.directPurchaseFamilies.includes(facts.family)) {
    return refuse(
      "FAMILY_NOT_DIRECT",
      `Family ${facts.family} is not approved for direct purchase.`,
    );
  }
  if (facts.availabilityUnderReview) {
    return refuse(
      "AVAILABILITY_UNDER_REVIEW",
      "Availability for this unit is under review.",
    );
  }
  if (facts.held) {
    return refuse("UNIT_HELD", "This unit is held and cannot be sold.");
  }
  if (!facts.researchUseOnlyConfirmed) {
    return refuse(
      "CLASSIFICATION_NOT_CONFIRMED",
      "Intended-use classification is not confirmed research use only.",
    );
  }
  // Before price, deliberately. A product we cannot describe is not made
  // sellable by knowing what to charge for it.
  if (!facts.compositionResolved) {
    return refuse(
      "COMPOSITION_UNRESOLVED",
      "The component split for this combination is not stated.",
    );
  }
  if (!facts.hasApprovedRetailPrice) {
    return refuse(
      "NO_APPROVED_PRICE",
      "No approved retail price for this exact variant.",
    );
  }
  return Object.freeze({ eligible: true as const });
}

/** True when the variant may enter the eight-step payment journey. */
export function mayEnterPaymentJourney(
  facts: CanonicalPaymentFacts,
  policy: PaymentEligibilityPolicy,
): boolean {
  return canonicalPaymentEligibility(facts, policy).eligible;
}

function refuse(
  code: PaymentEligibilityRefusalCode,
  reason: string,
): PaymentEligibility {
  return Object.freeze({ eligible: false as const, code, reason });
}

// ---------------------------------------------------------------------------
// Reading composition from a specification, until the catalog carries the flag.
// ---------------------------------------------------------------------------

/**
 * The interim reading of `compositionResolved`, for callers whose catalog row
 * does not yet carry the canonical flag.
 *
 * This is a STOPGAP and is written to be one: it lives beside the real input
 * rather than inside `canonicalPaymentEligibility`, so the gate itself never
 * depends on parsing display text, and deleting this function later cannot
 * change the gate's behaviour for any caller that supplies the real fact.
 *
 * FIXED 2026-08-21. It previously decided composition from the text ALONE, and
 * that was wrong for the one row it exists to catch:
 *
 *   "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)" -> unresolved
 *   "CJC-1295 WITH DAC + IPAMORELIN 5 mg total"                 -> RESOLVED
 *
 * The second string is the CANONICAL specification, and the reviewed
 * reconciliation strips the marker on purpose, because a customer should not
 * read our internal uncertainty in a product name. So the moment the
 * reconciled artifact lands, the held combination passes the gate.
 *
 * That is the third instance of one defect, after a marker-based hold in
 * master-offerings and a marker-based assertion in the acceptance matrix. The
 * general rule: NOTHING THAT DECIDES COMMERCE MAY READ DISPLAY TEXT. Copy is
 * written for customers and gets cleaned up; facts belong in the reviewed
 * record.
 *
 * The reading is now FACT FIRST, text second, and fails closed in both
 * directions: the canonical specification is matched against the reviewed
 * commerce holds, and the marker pattern is kept as a fallback so an
 * un-reconciled workbook row still refuses.
 */
const COMPOSITION_UNRESOLVED_PATTERN =
  /split pending|pending split|\btbd\b|unresolved/i;

/**
 * Canonical specifications the founder has placed on commerce hold for an
 * unresolved formulation, mirrored from `commerceHolds[].specification` in
 * config/research/master-catalog-reconciliation-*.json.
 *
 * Mirrored rather than imported: no server module in this repository imports
 * JSON, and `resolveJsonModule` is not enabled, so reaching for the config here
 * would change build configuration for one constant. The copy is pinned instead
 * — `canonical-payment-eligibility.holds.test.ts` reads the reviewed config and
 * fails if these drift apart, which is the same discipline applied to the
 * fulfillment transition table and the supplier adapter's paths.
 */
export const REVIEWED_COMPOSITION_HELD_SPECIFICATIONS: readonly string[] = Object.freeze([
  "CJC-1295 WITH DAC + IPAMORELIN 5 mg total",
]);

export function compositionResolvedFromSpecification(
  specification: string | null | undefined,
  heldSpecifications: readonly string[] = REVIEWED_COMPOSITION_HELD_SPECIFICATIONS,
): boolean {
  if (typeof specification !== "string" || specification.trim() === "") {
    // No specification is not evidence of an unresolved split. A single-molecule
    // vial has nothing to split, and refusing every unspecified row would hold
    // most of the catalogue on a rule about combinations.
    return true;
  }
  // FACT FIRST. Compared exactly against the reviewed canonical specification,
  // with no fuzzy or normalized matching: a near-miss here would fail OPEN,
  // which is the direction that sells a held product. Surrounding whitespace is
  // trimmed off the INPUT only, which can only ever make more rows match a hold
  // and therefore only ever refuses more.
  const candidate = specification.trim();
  if (heldSpecifications.some((held) => held === candidate)) return false;

  // TEXT SECOND. An un-reconciled workbook row still carries its marker, and
  // must still refuse.
  return !COMPOSITION_UNRESOLVED_PATTERN.test(specification);
}
