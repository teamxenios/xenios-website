// xenios research: catalog domain contract.
//
// The central design decision in this file is FACT PROVENANCE.
//
// Supplier facts (composition, strength, price, shelf life, storage, COA, purity,
// sterility) are the highest-risk data in the system. A wrong composition is not a
// cosmetic bug, it is a claim about what is in a vial. The catalog content review
// found that these facts are NOT CONFIRMED for the current 15 records, while the
// legacy catalog module states them as plain strings.
//
// Rather than pick a winner in code, this contract makes confirmation state
// structural: a fact carries its own status and source. Unconfirmed data therefore
// cannot masquerade as confirmed, and a surface can refuse to render it.

// ---------------------------------------------------------------------------
// Lanes, availability, and commerce
// ---------------------------------------------------------------------------

/**
 * The server-enforced product lane. One member interface may present a simple
 * experience, but the lane governs authorization, fulfillment owner, claims
 * rules, and commerce eligibility, and it is never inferred from the client.
 */
export type ProductLane =
  | "supplement"
  | "research_material"
  | "quantum"
  | "future_clinical"
  | "non_product_program";

export const PRODUCT_LANES: readonly ProductLane[] = [
  "supplement",
  "research_material",
  "quantum",
  "future_clinical",
  "non_product_program",
] as const;

/**
 * Whether the lane assignment is a decision or a placeholder.
 *
 * `non_product_program` exists because four legacy records (coaching and routine
 * programs) are not supplements, research materials, Quantum, or clinical care. Forcing
 * one of those four lanes onto them would mis-apply that lane's authorization rules,
 * claims rules, and fulfillment owner, so the lane is held open instead.
 *
 * A record in `needs_samuel_decision` is never purchasable, regardless of any other
 * gate. The placeholder must not become a quiet default that ships.
 */
export type LaneDecisionState = "decided" | "needs_samuel_decision";

/**
 * Lanes that cannot transact through this system at all, whatever the flags say.
 * `future_clinical` is out of scope by canon. `non_product_program` is undecided.
 */
const NON_TRANSACTING_LANES: ReadonlySet<ProductLane> = new Set<ProductLane>([
  "future_clinical",
  "non_product_program",
]);

/** Catalog availability. Distinct from commerce eligibility, deliberately. */
export type ProductAvailability =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "waitlist"
  | "documentation_review"
  | "commerce_review"
  | "temporarily_unavailable"
  | "coming_soon";

export const PRODUCT_AVAILABILITY: readonly ProductAvailability[] = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "waitlist",
  "documentation_review",
  "commerce_review",
  "temporarily_unavailable",
  "coming_soon",
] as const;

/**
 * Availability states that could ever permit a purchase, assuming every other
 * gate also passes. Being in this set is necessary, never sufficient.
 */
const PURCHASABLE_AVAILABILITY: ReadonlySet<ProductAvailability> = new Set<ProductAvailability>([
  "in_stock",
  "low_stock",
]);

/** Whether a product may be VISIBLE to an active member. */
export function isCatalogVisible(availability: ProductAvailability): boolean {
  // Everything is visible to an active member, including out of stock, because
  // the founder decision is that out-of-stock items stay visible with a waitlist
  // rather than disappearing.
  return PRODUCT_AVAILABILITY.includes(availability);
}

// ---------------------------------------------------------------------------
// Fact provenance
// ---------------------------------------------------------------------------

/**
 * How well established a supplier fact is.
 *
 * `supplier_confirmed` requires a written supplier document on file. A value that
 * merely exists in a legacy data file is `unverified_legacy`, not confirmed.
 */
export type FactConfirmation =
  | "confirmed"
  | "supplier_reported"
  | "unverified_legacy"
  | "not_confirmed";

export interface FactSource {
  /** Where the value came from. Never a guess. */
  kind: "supplier_document" | "coa" | "legacy_catalog_file" | "founder_statement" | "none";
  reference?: string;
  recordedAt?: string;
}

/**
 * A supplier fact plus its confirmation state.
 *
 * `value` is null whenever the fact is not known. There is no sentinel string and
 * no empty-string-means-unknown convention, because both invite a surface to
 * render a blank as if it were data.
 */
export interface ProvenancedFact<T> {
  value: T | null;
  confirmation: FactConfirmation;
  source: FactSource;
  /** Set when the fact is disputed between sources. Blocks member display outright. */
  conflictNote?: string;
}

export function notConfirmed<T>(note?: string): ProvenancedFact<T> {
  return {
    value: null,
    confirmation: "not_confirmed",
    source: { kind: "none" },
    conflictNote: note,
  };
}

export function legacyValue<T>(value: T, reference: string, conflictNote?: string): ProvenancedFact<T> {
  return {
    value,
    confirmation: "unverified_legacy",
    source: { kind: "legacy_catalog_file", reference },
    conflictNote,
  };
}

/**
 * A fact may be shown to a member only when it is confirmed and undisputed.
 *
 * This is the load-bearing rule of this module. Supplier-reported and legacy
 * values are visible to Samuel for reconciliation, never to a member as fact.
 */
export function isMemberDisplayable<T>(fact: ProvenancedFact<T>): boolean {
  return fact.value !== null && fact.confirmation === "confirmed" && !fact.conflictNote;
}

/** Facts that must be confirmed before any commerce can be enabled for a product. */
export type CommerceCriticalFactKey =
  | "composition"
  | "strength"
  | "format"
  | "priceCents"
  | "shelfLife"
  | "storage"
  | "coa";

export const COMMERCE_CRITICAL_FACTS: readonly CommerceCriticalFactKey[] = [
  "composition",
  "strength",
  "format",
  "priceCents",
  "shelfLife",
  "storage",
  "coa",
] as const;

// ---------------------------------------------------------------------------
// Product record
// ---------------------------------------------------------------------------

export type GuideState =
  | "guide_published"
  | "guide_updated"
  | "guide_in_review"
  | "guide_in_development"
  | "guide_coming_soon";

export type DocumentState = "approved" | "pending" | "missing" | "expired";

export type CommerceApprovalState =
  | "approved"
  | "blocked_pending_written_approval"
  | "blocked_by_lane"
  | "blocked_by_documentation";

export type FulfillmentOwner = "mitch" | "xenios" | "not_assigned";

export type MemberGoal =
  | "get_leaner"
  | "build_muscle"
  | "recover_faster"
  | "sleep_better"
  | "think_sharper"
  | "feel_more_energized"
  | "age_better"
  | "look_better"
  | "gut_and_immune_health"
  | "intimacy_and_vitality"
  | "everyday_health";

export const MEMBER_GOALS: readonly MemberGoal[] = [
  "get_leaner",
  "build_muscle",
  "recover_faster",
  "sleep_better",
  "think_sharper",
  "feel_more_energized",
  "age_better",
  "look_better",
  "gut_and_immune_health",
  "intimacy_and_vitality",
  "everyday_health",
] as const;

/** Member-facing labels. Plain language, never clinical framing, per the canon. */
export const MEMBER_GOAL_LABELS: Record<MemberGoal, string> = {
  get_leaner: "Get Leaner",
  build_muscle: "Build Muscle",
  recover_faster: "Recover Faster",
  sleep_better: "Sleep Better",
  think_sharper: "Think Sharper",
  feel_more_energized: "Feel More Energized",
  age_better: "Age Better",
  look_better: "Look Better",
  gut_and_immune_health: "Gut and Immune Health",
  intimacy_and_vitality: "Intimacy and Vitality",
  everyday_health: "Everyday Health",
};

export interface CatalogProduct {
  sku: string;
  slug: string;
  displayName: string;
  lane: ProductLane;
  /** Whether `lane` is a decision or a held-open placeholder awaiting Samuel. */
  laneDecision: LaneDecisionState;
  /**
   * Alternate spellings that must remain searchable.
   *
   * Some compounds appear in the literature under more than one transliteration, and
   * picking a canonical scientific label is a review decision rather than an
   * engineering one. Both spellings stay findable until that review happens.
   */
  nameAliases: string[];
  availability: ProductAvailability;
  commerceApproval: CommerceApprovalState;
  fulfillmentOwner: FulfillmentOwner;

  /** Supplier facts. Every one carries its own confirmation state. */
  facts: {
    composition: ProvenancedFact<string>;
    strength: ProvenancedFact<string>;
    format: ProvenancedFact<string>;
    priceCents: ProvenancedFact<number>;
    shelfLife: ProvenancedFact<string>;
    storage: ProvenancedFact<string>;
    coa: ProvenancedFact<string>;
  };

  guideState: GuideState;
  qualityDocumentState: DocumentState;
  storageDataState: DocumentState;
  shippingProfileState: DocumentState;

  /** Navigation aid only. A goal mapping is never a claim of effect. */
  goalMappings: MemberGoal[];
  relatedGuideSlugs: string[];
  prohibitedClaims: string[];

  subscriptionEligible: boolean;
  lastReviewed: string;
  openSupplierQuestions: string[];
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export type PurchaseBlockReason =
  | "commerce_capability_disabled"
  | "lane_commerce_disabled"
  | "lane_decision_pending"
  | "commerce_not_approved"
  | "availability_not_purchasable"
  | "unconfirmed_commerce_critical_facts"
  | "quality_documentation_incomplete"
  | "subscription_not_eligible";

export interface EligibilityDecision {
  purchasable: boolean;
  blockReasons: PurchaseBlockReason[];
  /** Fact keys that are blocking, so admin can see exactly what to chase. */
  unconfirmedFacts: CommerceCriticalFactKey[];
}

export interface EligibilityContext {
  productCommerceEnabled: boolean;
  quantumCommerceEnabled: boolean;
  asSubscription?: boolean;
}

/**
 * The single authority on whether a product may be purchased.
 *
 * It fails CLOSED and accumulates every reason rather than returning on the first,
 * so an operator sees the full blocking set instead of fixing one gate at a time.
 */
export function evaluatePurchaseEligibility(
  product: CatalogProduct,
  ctx: EligibilityContext,
): EligibilityDecision {
  const blockReasons: PurchaseBlockReason[] = [];

  if (!ctx.productCommerceEnabled) {
    blockReasons.push("commerce_capability_disabled");
  }

  // Quantum needs its own approval on top of general commerce. The non-transacting
  // lanes are never purchasable through this system at all.
  if (product.lane === "quantum" && !ctx.quantumCommerceEnabled) {
    blockReasons.push("lane_commerce_disabled");
  }
  if (NON_TRANSACTING_LANES.has(product.lane)) {
    blockReasons.push("lane_commerce_disabled");
  }

  // A held-open lane blocks on its own, so a placeholder cannot ship as a default
  // even if someone later marks the record's other gates as satisfied.
  if (product.laneDecision === "needs_samuel_decision") {
    blockReasons.push("lane_decision_pending");
  }

  if (product.commerceApproval !== "approved") {
    blockReasons.push("commerce_not_approved");
  }

  if (!PURCHASABLE_AVAILABILITY.has(product.availability)) {
    blockReasons.push("availability_not_purchasable");
  }

  const unconfirmedFacts = COMMERCE_CRITICAL_FACTS.filter((key) => {
    const fact = product.facts[key as keyof CatalogProduct["facts"]];
    return !fact || fact.confirmation !== "confirmed" || fact.value === null || Boolean(fact.conflictNote);
  });
  if (unconfirmedFacts.length > 0) {
    blockReasons.push("unconfirmed_commerce_critical_facts");
  }

  if (product.qualityDocumentState !== "approved") {
    blockReasons.push("quality_documentation_incomplete");
  }

  if (ctx.asSubscription && !product.subscriptionEligible) {
    blockReasons.push("subscription_not_eligible");
  }

  return {
    purchasable: blockReasons.length === 0,
    blockReasons,
    unconfirmedFacts,
  };
}

// ---------------------------------------------------------------------------
// Supplement candidates
// ---------------------------------------------------------------------------

export type SupplementCommercialState =
  | "candidate"
  | "authorization_pending"
  | "approved"
  | "rejected"
  | "unavailable";

export type ResellerAuthorizationState = "not_authorized" | "requested" | "authorized_in_writing";

export interface SupplementCandidate {
  brand: string;
  exactName: string;
  officialUrl: string | null;
  category: string;
  format: ProvenancedFact<string>;
  goalMappings: MemberGoal[];
  foundationRole: "core" | "conditional" | "specialty";
  ingredients: ProvenancedFact<string>;
  allergens: ProvenancedFact<string>;
  qualityClaims: ProvenancedFact<string>;
  athleteTestingRelevant: boolean;
  duplicateNutrientFlags: string[];
  interactionReviewFlags: string[];
  resellerAuthorization: ResellerAuthorizationState;
  mapState: ProvenancedFact<string>;
  cogsCents: ProvenancedFact<number>;
  imageContentRights: ResellerAuthorizationState;
  inventoryModel: "not_confirmed" | "stocked" | "drop_ship";
  subscriptionEligible: boolean;
  commercialState: SupplementCommercialState;
  lastVerified: string | null;
}

/**
 * A supplement may only be presented as sellable with written authorization.
 * Fails closed: anything short of `authorized_in_writing` blocks the product.
 */
export function supplementSellable(candidate: SupplementCandidate): boolean {
  return (
    candidate.resellerAuthorization === "authorized_in_writing" &&
    candidate.commercialState === "approved"
  );
}
