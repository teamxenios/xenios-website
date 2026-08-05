/**
 * xenios research: the canonical private peptide catalog data layer.
 *
 * This module is deliberately DEPENDENCY FREE (zero imports) so any lane can read
 * it without pulling in commerce, admin, or server types.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 *
 * It is the typed record of every peptide product xenios has data for: the
 * fifteen the founder workbook authorises, the compounds a market reference
 * harvest shows we could add, and the three the regulatory picture says we must
 * not touch without a decision. It records what each source says, plus every
 * price on record for the same item, plus the confirmation state of the
 * documents that would be needed to sell it.
 *
 * It is NOT an approval, NOT a price decision, and NOT a claim of quality. No
 * record in this file may be treated as approved to sell.
 *
 * ---------------------------------------------------------------------------
 * THE THREE TIERS
 * ---------------------------------------------------------------------------
 *
 * `workbook` (15 products)
 *   The founder workbook's fifteen SKUs. These are the only products with an
 *   authoritative wholesale cost and an approved matrix price. Their PRIMARY
 *   variant is the workbook's exact presentation. Additional market sizes for
 *   the same compound are appended as extra variants with no cost basis.
 *
 * `expansion` (27 products)
 *   Compounds we do not carry yet: the standalone components we currently only
 *   sell inside a blend, plus the net-new compounds from the market reference
 *   harvest. No cost basis exists for any of them, so none can be bought.
 *   `marketReferencePriceCents` records what the market lists, as an INTERNAL
 *   number for the founder to price against. It never reaches a customer.
 *
 * `regulatory_hold` (3 products)
 *   The GLP class. Recorded as data so the decision is visible and the compounds
 *   are not silently forgotten, held UNAVAILABLE with a required `holdReason`.
 *   They are excluded from the customer projection entirely, in code.
 *
 * ---------------------------------------------------------------------------
 * PRODUCTS AND VARIANTS
 * ---------------------------------------------------------------------------
 *
 * A product is the canonical compound or combination. A variant is one supplied
 * presentation of it: a vial at a given strength, or a capsule bottle at a given
 * strength and count. A product holds MANY variants, because the same peptide is
 * offered in several vial sizes.
 *
 * Every variant carries its own price basis, availability, and readiness,
 * because those are properties of a presentation, not of a molecule. Anything
 * that is true of the compound regardless of size (name, class, regulatory
 * status, COA state, protocol pairings) stays at product level.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS THIS FILE REFUSES TO DO
 * ---------------------------------------------------------------------------
 *
 * 1. It does not invent products. The founder's message referred to eighteen
 *    workbook peptides. The authoritative sheet contains exactly fifteen rows.
 *    Fifteen are recorded. Three were not invented to close the gap. It also
 *    does not create a second record for a compound we already carry under
 *    another name: see the de-duplication notes in
 *    docs/research-commerce/PEPTIDE_CATALOG_BUILD_NOTES.md.
 *
 * 2. It does not pick a price. Two founder-approved pricing rules disagree about
 *    the fifteen workbook items, and two further prices for the same items
 *    already exist elsewhere in this repository. All of them are recorded side by
 *    side on the variant and every variant's price status is
 *    "draft_pending_formula_confirmation". Nothing here is active or approved.
 *
 * 3. It does not assert quality. No certificate of analysis file exists in this
 *    repository for any of these items (verified against
 *    docs/research-commerce/SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md, which
 *    records 65 referenced attachments and 0 files found). Every record therefore
 *    carries coaStatus PENDING_LAB_DOCUMENTATION. Purity, sterility, endotoxin,
 *    lot numbers, and expiry dates appear nowhere in this file.
 *
 * ---------------------------------------------------------------------------
 * THE THREE GATES, ALL FAIL CLOSED, ALL IN ONE FUNCTION
 * ---------------------------------------------------------------------------
 *
 * `resolveVariantAvailability` is the single authority. In order:
 *
 *   tier is regulatory_hold -> UNAVAILABLE, unconditionally. Nothing overrides it.
 *   no sourced cost basis    -> REQUEST_ACCESS_ONLY. Never a purchase mode.
 *   no verified COA file     -> never DIRECT_PRIVATE_PURCHASE. Category 1 items
 *                               land on APPROVAL_REQUIRED_PURCHASE, items in
 *                               PCAC review on REQUEST_ACCESS_ONLY.
 *
 * To open the COA gate, a real COA file must be attached and its coaStatus moved
 * to VERIFIED_FILE_PRESENT. A founder decision on its own cannot open it, by
 * design: the gate is keyed to the presence of a document, not to an opinion.
 *
 * ---------------------------------------------------------------------------
 * FIELD AUDIENCE
 * ---------------------------------------------------------------------------
 *
 * Customer facing: displayName, canonicalName, category, variant.label,
 * variant.strength, variant.size. `toCustomerProductProjection` is the only
 * sanctioned way to hand this data to a browser, and it carries NO money at all.
 * A price reaches a customer through the approved pricing core
 * (shared/research/pricing.ts), never from this catalog.
 *
 * Operator only, never rendered to a member: tier, holdReason, regulatoryNote,
 * supplierSource, every cost and price on a variant including
 * marketReferencePriceCents, priceApprovalNote,
 * disputedBySignedSupplierMasterStrength, coaStatus, readinessStatus.
 *
 * regulatoryNote is the only field permitted to carry the phrase "FDA-approved",
 * and only because the workbook states it as a factual regulatory status of the
 * molecule. It is never marketing copy. A test pins this.
 */

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/** Which of the three catalog tiers a product belongs to. */
export type PeptideTier = "workbook" | "expansion" | "regulatory_hold";

export const PEPTIDE_TIERS: readonly PeptideTier[] = [
  "workbook",
  "expansion",
  "regulatory_hold",
] as const;

/**
 * The catalog grouping for a product. This is a merchandising bucket, not a
 * chemical classification. `canonicalName` carries the chemistry.
 *
 * The `*_cofactor` and `hormone_analogue` members exist for one reason: several
 * items in this catalog are not peptides. NAD+ is a dinucleotide coenzyme,
 * L-Carnitine is a quaternary ammonium compound, HCG is a glycoprotein hormone.
 * Filing them under a *_peptide member would put a false chemical statement in
 * the data layer, and this catalog does not make false statements to fit a
 * schema.
 */
export type PeptideProductClass =
  | "repair_peptide"
  | "blend"
  | "metabolic_peptide"
  | "metabolic_cofactor"
  | "mitochondrial_peptide"
  | "mitochondrial_cofactor"
  | "neuro_peptide"
  | "gh_secretagogue"
  | "sexual_health_peptide"
  | "melanocortin_peptide"
  | "immune_peptide"
  | "longevity_peptide"
  | "hormone_analogue"
  | "oral_capsule";

export const PEPTIDE_PRODUCT_CLASSES: readonly PeptideProductClass[] = [
  "repair_peptide",
  "blend",
  "metabolic_peptide",
  "metabolic_cofactor",
  "mitochondrial_peptide",
  "mitochondrial_cofactor",
  "neuro_peptide",
  "gh_secretagogue",
  "sexual_health_peptide",
  "melanocortin_peptide",
  "immune_peptide",
  "longevity_peptide",
  "hormone_analogue",
  "oral_capsule",
] as const;

/**
 * How a product class is assigned, so the assignment is reviewable:
 * a combination whose components share one mechanism class takes that class,
 * a combination spanning mechanism classes is `blend`, and an item supplied as
 * an oral capsule is `oral_capsule` regardless of the molecule's mechanism.
 */
export const PRODUCT_CLASS_ASSIGNMENT_RULE =
  "Single mechanism class takes that class. A combination spanning mechanism classes is blend. " +
  "An item supplied as an oral capsule is oral_capsule. The class is a catalog grouping, never a chemical claim.";

export type PeptideFormat = "vial" | "capsule_bottle";

export const PEPTIDE_FORMATS: readonly PeptideFormat[] = ["vial", "capsule_bottle"] as const;

/**
 * Where a variant came from.
 *
 * `founder_workbook` is the authoritative presentation with a real wholesale
 * cost. `market_reference_harvest` is a size gathered from public market
 * reference work: a real presentation, but with no cost basis of our own.
 */
export type PeptideVariantOrigin = "founder_workbook" | "market_reference_harvest";

export const PEPTIDE_VARIANT_ORIGINS: readonly PeptideVariantOrigin[] = [
  "founder_workbook",
  "market_reference_harvest",
] as const;

/**
 * The state of the certificate of analysis for a product.
 *
 * PENDING_LAB_DOCUMENTATION is the only honest value while no file exists.
 * VERIFIED_FILE_PRESENT requires an actual file on disk, bound to the SKU.
 */
export type PeptideCoaStatus =
  | "VERIFIED_FILE_PRESENT"
  | "AVAILABLE_ON_REQUEST"
  | "INTERNAL_PENDING_UPLOAD"
  | "PENDING_LAB_DOCUMENTATION";

export const PEPTIDE_COA_STATUSES: readonly PeptideCoaStatus[] = [
  "VERIFIED_FILE_PRESENT",
  "AVAILABLE_ON_REQUEST",
  "INTERNAL_PENDING_UPLOAD",
  "PENDING_LAB_DOCUMENTATION",
] as const;

export type PeptideReadinessStatus =
  | "READY_FOR_PRIVATE_SALE"
  | "READY_FOR_DISPLAY_ONLY"
  | "NEEDS_COA_ATTACHMENT"
  | "NEEDS_INTERNAL_DOCS"
  | "NEEDS_FINAL_APPROVAL"
  | "NEEDS_MEDIA";

export const PEPTIDE_READINESS_STATUSES: readonly PeptideReadinessStatus[] = [
  "READY_FOR_PRIVATE_SALE",
  "READY_FOR_DISPLAY_ONLY",
  "NEEDS_COA_ATTACHMENT",
  "NEEDS_INTERNAL_DOCS",
  "NEEDS_FINAL_APPROVAL",
  "NEEDS_MEDIA",
] as const;

export type PeptideAvailability =
  | "DIRECT_PRIVATE_PURCHASE"
  | "APPROVAL_REQUIRED_PURCHASE"
  | "REQUEST_ACCESS_ONLY"
  | "DISPLAY_ONLY"
  | "UNAVAILABLE";

export const PEPTIDE_AVAILABILITIES: readonly PeptideAvailability[] = [
  "DIRECT_PRIVATE_PURCHASE",
  "APPROVAL_REQUIRED_PURCHASE",
  "REQUEST_ACCESS_ONLY",
  "DISPLAY_ONLY",
  "UNAVAILABLE",
] as const;

/** The availability states that let money change hands. Everything else is a conversation. */
const PURCHASE_MODES: ReadonlySet<PeptideAvailability> = new Set<PeptideAvailability>([
  "DIRECT_PRIVATE_PURCHASE",
  "APPROVAL_REQUIRED_PURCHASE",
]);

export function isPurchaseMode(availability: PeptideAvailability): boolean {
  return PURCHASE_MODES.has(availability);
}

/** The only audience this catalog serves. The site is private and approval based. */
export type PeptideAudience = "member";

/** The only currency this catalog resolves. */
export type PeptideCurrency = "USD";

/**
 * The only price status this lane may write. No peptide price is active or
 * approved until the pricing formula conflict is settled by the founder.
 */
export type PeptidePriceStatus = "draft_pending_formula_confirmation";

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/**
 * The single authority on whether a peptide may be bought directly, with no
 * per-order approval step.
 *
 * It is keyed to the presence of a verified COA file and nothing else, so no
 * approval, flag, or urgency can route around a missing lab document.
 */
export function coaGateAllowsDirectPurchase(coaStatus: PeptideCoaStatus): boolean {
  return coaStatus === "VERIFIED_FILE_PRESENT";
}

/**
 * The availability a variant may hold while the COA gate is closed and a cost
 * basis exists, derived from the workbook's regulatory status. Items still in
 * review are held one step further back than items recorded as Category 1.
 */
export function closedGateAvailability(regulatoryNote: string): PeptideAvailability {
  return /pcac/i.test(regulatoryNote) ? "REQUEST_ACCESS_ONLY" : "APPROVAL_REQUIRED_PURCHASE";
}

/**
 * The single authority on one variant's availability. Three gates, all fail
 * closed, evaluated in order of severity.
 *
 * A regulatory hold is absolute: no cost basis, no COA, no flag, and no founder
 * field on the record can move a held compound out of UNAVAILABLE. Moving it
 * requires changing its tier, which is a reviewed edit.
 */
export function resolveVariantAvailability(input: {
  tier: PeptideTier;
  coaStatus: PeptideCoaStatus;
  regulatoryNote: string;
  hasCostBasis: boolean;
}): PeptideAvailability {
  if (input.tier === "regulatory_hold") return "UNAVAILABLE";
  if (!input.hasCostBasis) return "REQUEST_ACCESS_ONLY";
  if (!coaGateAllowsDirectPurchase(input.coaStatus)) {
    return closedGateAvailability(input.regulatoryNote);
  }
  return "DIRECT_PRIVATE_PURCHASE";
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** The founder-approved multiplier under review: customer price = wholesale x 1.80. */
export const CUSTOMER_PRICE_MULTIPLIER_NUMERATOR = 18;
export const CUSTOMER_PRICE_MULTIPLIER_DENOMINATOR = 10;

/** The previously approved founder matrix: max($99, 2.5x wholesale), rounded up to $5. */
export const MATRIX_PRICE_FLOOR_CENTS = 9900;
export const MATRIX_PRICE_MULTIPLIER_NUMERATOR = 25;
export const MATRIX_PRICE_MULTIPLIER_DENOMINATOR = 10;
export const MATRIX_PRICE_ROUNDING_STEP_CENTS = 500;

function assertWholeCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer number of cents`);
  }
}

/**
 * Customer price under the 1.80x rule, in integer cents.
 *
 * Rounding is half up and is applied only if the product does not divide evenly.
 * For all fifteen workbook variants it divides evenly, so no rounding is applied
 * to any real value. A test pins that.
 */
export function computeCustomerAmountCents(wholesaleSourceCostCents: number): number {
  assertWholeCents(wholesaleSourceCostCents, "wholesaleSourceCostCents");
  const numerator = wholesaleSourceCostCents * CUSTOMER_PRICE_MULTIPLIER_NUMERATOR;
  return Math.round(numerator / CUSTOMER_PRICE_MULTIPLIER_DENOMINATOR);
}

/**
 * Customer price under the previously approved founder matrix, in integer cents:
 * take the greater of the $99 floor and 2.5x wholesale, then round up to the
 * next whole $5.
 */
export function computeMatrixAmountCents(wholesaleSourceCostCents: number): number {
  assertWholeCents(wholesaleSourceCostCents, "wholesaleSourceCostCents");
  const multiplied = Math.round(
    (wholesaleSourceCostCents * MATRIX_PRICE_MULTIPLIER_NUMERATOR) /
      MATRIX_PRICE_MULTIPLIER_DENOMINATOR,
  );
  const floored = Math.max(MATRIX_PRICE_FLOOR_CENTS, multiplied);
  return Math.ceil(floored / MATRIX_PRICE_ROUNDING_STEP_CENTS) * MATRIX_PRICE_ROUNDING_STEP_CENTS;
}

// ---------------------------------------------------------------------------
// SKU convention
// ---------------------------------------------------------------------------

/**
 * The SKU convention, in one place: R360-<PEPTIDE>-<PRESENTATION>-<FORMAT>.
 *
 * PEPTIDE      each component name uppercased with every non-alphanumeric
 *              character removed, components joined by "_", in source order.
 * PRESENTATION each strength uppercased, "." replaced by "P" so a decimal
 *              strength stays legible and distinct, everything else
 *              non-alphanumeric removed, components joined by "_". A capsule
 *              bottle appends "X<count>" so two bottles of the same per-capsule
 *              strength but different counts never collide.
 * FORMAT       VIAL or CAP.
 *
 * The hyphen is reserved as the field separator, which is why component hyphens
 * are stripped rather than kept. Because the presentation token carries the
 * strength and, for capsules, the count, every variant of a product produces a
 * distinct SKU. A test pins uniqueness across ALL variants of ALL products.
 */
export const SKU_CONVENTION =
  "R360-<PEPTIDE>-<PRESENTATION>-<FORMAT>, where PRESENTATION carries the strength and, for a capsule bottle, X<count>.";

export const SKU_PATTERN =
  /^R360-[A-Z0-9]+(?:_[A-Z0-9]+)*-[A-Z0-9]+(?:_[A-Z0-9]+)*-(?:VIAL|CAP)$/;

/** The presentation token for a vial: strengths joined by "_". */
export function vialPresentationToken(strength: string): string {
  return strength
    .split("/")
    .map((part) =>
      part.trim().toUpperCase().replace(/\./g, "P").replace(/[^A-Z0-9]/g, ""),
    )
    .join("_");
}

/** The presentation token for a capsule bottle: per-capsule strength, then X<count>. */
export function capsulePresentationToken(strength: string, capsuleCount: number): string {
  if (!Number.isSafeInteger(capsuleCount) || capsuleCount <= 0) {
    throw new RangeError("capsuleCount must be a positive safe integer");
  }
  return `${vialPresentationToken(strength)}X${capsuleCount}`;
}

function presentationToken(
  strength: string,
  format: PeptideFormat,
  capsuleCount: number | null,
): string {
  return format === "capsule_bottle"
    ? capsulePresentationToken(strength, capsuleCount ?? 0)
    : vialPresentationToken(strength);
}

/** Build a SKU from its parts, so no caller hand-writes one. */
export function buildSku(input: {
  peptideToken: string;
  presentationToken: string;
  format: PeptideFormat;
}): string {
  const sku = `R360-${input.peptideToken}-${input.presentationToken}-${
    input.format === "vial" ? "VIAL" : "CAP"
  }`;
  if (!SKU_PATTERN.test(sku)) {
    throw new RangeError(`built sku does not match the convention: ${sku}`);
  }
  return sku;
}

// ---------------------------------------------------------------------------
// Record shapes
// ---------------------------------------------------------------------------

/**
 * One supplied presentation of a product: a vial at a strength, or a capsule
 * bottle at a strength and count.
 *
 * Everything size specific and price specific lives here, because a second vial
 * size is a different cost, a different price, and potentially a different
 * availability. Nothing about the molecule lives here.
 */
export interface PeptideVariant {
  /** Customer facing. The polished one-line configuration label. */
  label: string;
  /** Customer facing. The strength exactly as its source records it. */
  strength: string;
  /** Customer facing. The pack size exactly as its source records it. */
  size: string;
  format: PeptideFormat;
  /** Capsule count, for a capsule bottle. Null for a vial. */
  capsuleCount: number | null;
  /** Internal SKU. See SKU_CONVENTION. Unique across every variant in the catalog. */
  sku: string;
  /**
   * Whether this variant is scoped to the member audience. This is audience
   * scoping, not a purchase gate. The purchase gate is `availability`.
   */
  memberEligible: boolean;
  origin: PeptideVariantOrigin;
  /**
   * True for the one variant that is the product's authoritative presentation.
   * A workbook product has exactly one. An expansion or held product has none,
   * because no presentation of it is authoritative yet.
   */
  isPrimary: boolean;

  // --- price basis (OPERATOR ONLY, never projected to a customer) ----------
  /**
   * Wholesale cost per the founder workbook, integer cents. NULL when no cost
   * basis has been sourced for this presentation, which is the normal state for
   * every harvested size and every expansion product. A null here forces
   * REQUEST_ACCESS_ONLY.
   */
  wholesaleSourceCostCents: number | null;
  /** The 1.80x rule applied to wholesale. Null whenever the cost basis is null. */
  computedCustomerAmountCents: number | null;
  /**
   * The previously approved founder matrix value. Null whenever the cost basis
   * is null, and also null for any presentation the matrix never priced: the
   * matrix only covered the workbook's exact fifteen presentations.
   */
  priorApprovedMatrixAmountCents: number | null;
  /**
   * The price the live legacy catalog (server/research/products-data.ts) has
   * published for this presentation. Recorded because it is a third value for
   * the same item and the conflict must be visible, not discovered later.
   */
  legacyPublishedAmountCents: number | null;
  /**
   * The member price stated in the signed supplier master, where this
   * repository states it publicly. Most rows are held in the private operations
   * repository and are therefore null here rather than guessed. See
   * docs/research-commerce/SUPPLIER_FACT_RECONCILIATION_FINAL.md.
   */
  signedSupplierMasterMemberAmountCents: number | null;
  /**
   * INTERNAL. What the public market reference lists this presentation at.
   *
   * It is a competitor's shelf price, not our price and not a cost. It exists so
   * the founder can set cost-based pricing against a real reference point. It is
   * excluded from the customer projection in code, and a test asserts that.
   */
  marketReferencePriceCents: number | null;
  /**
   * Operator only. Set where the signed supplier master states a strength that
   * differs from this variant's recorded strength. Recorded, never resolved:
   * choosing between them is a founder and counsel decision.
   */
  disputedBySignedSupplierMasterStrength: string | null;

  priceStatus: PeptidePriceStatus;
  currency: PeptideCurrency;
  audience: PeptideAudience;
  /** Null until a price is confirmed. Never a placeholder date. */
  effectiveDate: string | null;
  priceApprovalNote: string;

  availability: PeptideAvailability;
  readinessStatus: PeptideReadinessStatus;
}

export interface PeptideProduct {
  tier: PeptideTier;
  /** This lane's product code. PEP- workbook, PEX- expansion, PRH- regulatory hold. */
  internalProductCode: string;
  /** The code the existing repository documents already use, where one exists. */
  legacyProductCode: string | null;
  /** Chemically correct name. Customer facing. */
  canonicalName: string;
  /** Polished catalog name. Customer facing. */
  displayName: string;
  slug: string;
  /**
   * The slug the live legacy catalog uses, where it differs. A route alias is
   * required at wiring time so existing links keep working.
   */
  legacyCatalogSlug: string | null;
  /** Alternate spellings and market names that must stay searchable. */
  nameAliases: readonly string[];
  productClass: PeptideProductClass;
  category: string;
  /** Every supplied presentation. Never empty. */
  variants: readonly PeptideVariant[];
  /**
   * Operator only. The actual source of these facts. Neither the workbook nor
   * the market harvest names a supplier company, so none is named here.
   */
  supplierSource: string;
  /** Operator only. The regulatory status on record, in plain text. */
  regulatoryNote: string;
  coaStatus: PeptideCoaStatus;
  /** Protocol groupings taken from the workbook's Pairing Map sheet. */
  protocolTags: readonly string[];
  /** Supplement names paired with this peptide on the Pairing Map sheet. */
  pairedSupplementNames: readonly string[];
  /**
   * Required and non-empty for a `regulatory_hold` product, null otherwise.
   * Plain factual statement of why the compound is held and what unlocks it.
   */
  holdReason: string | null;
}

// ---------------------------------------------------------------------------
// The customer projection
// ---------------------------------------------------------------------------

/**
 * The only shape this catalog may hand to a browser.
 *
 * It carries NO money of any kind, on purpose. Every number on a variant is
 * either a supplier cost, a draft computation, a superseded published price, or
 * a competitor's shelf price. None of those is a price a customer may be shown.
 * A displayable price comes from the approved pricing core
 * (shared/research/pricing.ts) and nowhere else.
 */
export interface CustomerVariantProjection {
  sku: string;
  label: string;
  strength: string;
  size: string;
  format: PeptideFormat;
  availability: PeptideAvailability;
  memberEligible: boolean;
}

export interface CustomerProductProjection {
  slug: string;
  displayName: string;
  canonicalName: string;
  category: string;
  variants: readonly CustomerVariantProjection[];
}

export function toCustomerVariantProjection(
  variant: PeptideVariant,
): CustomerVariantProjection {
  // Explicit field picks, never a spread, so a new internal field cannot leak by
  // being added to the variant shape.
  return {
    sku: variant.sku,
    label: variant.label,
    strength: variant.strength,
    size: variant.size,
    format: variant.format,
    availability: variant.availability,
    memberEligible: variant.memberEligible,
  };
}

/**
 * The customer projection of a product, or null when the product may not be
 * shown at all. A regulatory hold is excluded here in code, so no surface can
 * render a held compound by forgetting to filter.
 */
export function toCustomerProductProjection(
  product: PeptideProduct,
): CustomerProductProjection | null {
  if (product.tier === "regulatory_hold") return null;
  return {
    slug: product.slug,
    displayName: product.displayName,
    canonicalName: product.canonicalName,
    category: product.category,
    variants: product.variants.map(toCustomerVariantProjection),
  };
}

/** The whole catalog as a customer may see it. Held compounds are absent. */
export function customerCatalogProjection(
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): readonly CustomerProductProjection[] {
  return catalog
    .map(toCustomerProductProjection)
    .filter((entry): entry is CustomerProductProjection => entry !== null);
}

// ---------------------------------------------------------------------------
// Shared values and builders
// ---------------------------------------------------------------------------

const WORKBOOK_SUPPLIER_SOURCE =
  'Founder workbook, sheet "Peptides - Top 15 SKUs" (Top 15 Recommended Peptide SKUs, Regulatory and Market Priority). No supplier company is named in that sheet.';

const MARKET_SUPPLIER_SOURCE =
  "Public market reference size matrix, harvested 2026-07-29. Sizes, formats, and listed market prices only. " +
  "No supplier relationship exists for this item and no supplier company is named.";

const PRICE_APPROVAL_NOTE =
  "Draft only. Two founder-approved pricing rules disagree for this item (1.80x wholesale versus the prior approved matrix), and two further prices exist elsewhere in the repository. " +
  "No peptide price may be activated until the founder confirms one formula. Effective date stays null until then.";

const NO_COST_BASIS_NOTE =
  "Draft only. No wholesale cost has been sourced for this presentation, so it carries no computed price and no matrix price. " +
  "It stays request access only until a real cost basis exists and the founder confirms one pricing formula.";

const REGULATORY_HOLD_PRICE_NOTE =
  "No price. This compound is held pending a founder decision and counsel review, so no pricing work has been done on it.";

const EXPANSION_REGULATORY_NOTE =
  "Not assessed. No regulatory status has been recorded for this compound in the founder workbook or any internal review.";

interface WorkbookVariantInput {
  label: string;
  strength: string;
  size: string;
  format: PeptideFormat;
  capsuleCount?: number;
  peptideToken: string;
  regulatoryNote: string;
  wholesaleSourceCostCents: number;
  legacyPublishedAmountCents: number | null;
  signedSupplierMasterMemberAmountCents?: number | null;
  marketReferencePriceCents?: number | null;
  disputedBySignedSupplierMasterStrength?: string | null;
}

/** The workbook's exact presentation. The one variant with an authoritative cost. */
function workbookVariant(input: WorkbookVariantInput): PeptideVariant {
  const capsuleCount = input.capsuleCount ?? null;
  return {
    label: input.label,
    strength: input.strength,
    size: input.size,
    format: input.format,
    capsuleCount,
    sku: buildSku({
      peptideToken: input.peptideToken,
      presentationToken: presentationToken(input.strength, input.format, capsuleCount),
      format: input.format,
    }),
    memberEligible: true,
    origin: "founder_workbook",
    isPrimary: true,
    wholesaleSourceCostCents: input.wholesaleSourceCostCents,
    computedCustomerAmountCents: computeCustomerAmountCents(input.wholesaleSourceCostCents),
    priorApprovedMatrixAmountCents: computeMatrixAmountCents(input.wholesaleSourceCostCents),
    legacyPublishedAmountCents: input.legacyPublishedAmountCents,
    signedSupplierMasterMemberAmountCents:
      input.signedSupplierMasterMemberAmountCents ?? null,
    marketReferencePriceCents: input.marketReferencePriceCents ?? null,
    disputedBySignedSupplierMasterStrength:
      input.disputedBySignedSupplierMasterStrength ?? null,
    priceStatus: "draft_pending_formula_confirmation",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    priceApprovalNote: PRICE_APPROVAL_NOTE,
    availability: resolveVariantAvailability({
      tier: "workbook",
      coaStatus: "PENDING_LAB_DOCUMENTATION",
      regulatoryNote: input.regulatoryNote,
      hasCostBasis: true,
    }),
    readinessStatus: "NEEDS_COA_ATTACHMENT",
  };
}

interface MarketSizeVariantInput {
  tier: PeptideTier;
  label: string;
  strength: string;
  size: string;
  format: PeptideFormat;
  capsuleCount?: number;
  peptideToken: string;
  regulatoryNote: string;
  marketReferencePriceCents: number;
  readinessStatus: PeptideReadinessStatus;
  priceApprovalNote: string;
}

/**
 * A presentation known only from the market reference harvest. It has no cost
 * basis of ours, therefore no price of any kind and no purchase mode.
 */
function marketSizeVariant(input: MarketSizeVariantInput): PeptideVariant {
  const capsuleCount = input.capsuleCount ?? null;
  return {
    label: input.label,
    strength: input.strength,
    size: input.size,
    format: input.format,
    capsuleCount,
    sku: buildSku({
      peptideToken: input.peptideToken,
      presentationToken: presentationToken(input.strength, input.format, capsuleCount),
      format: input.format,
    }),
    memberEligible: true,
    origin: "market_reference_harvest",
    isPrimary: false,
    wholesaleSourceCostCents: null,
    computedCustomerAmountCents: null,
    priorApprovedMatrixAmountCents: null,
    legacyPublishedAmountCents: null,
    signedSupplierMasterMemberAmountCents: null,
    marketReferencePriceCents: input.marketReferencePriceCents,
    disputedBySignedSupplierMasterStrength: null,
    priceStatus: "draft_pending_formula_confirmation",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    priceApprovalNote: input.priceApprovalNote,
    availability: resolveVariantAvailability({
      tier: input.tier,
      coaStatus: "PENDING_LAB_DOCUMENTATION",
      regulatoryNote: input.regulatoryNote,
      hasCostBasis: false,
    }),
    readinessStatus: input.readinessStatus,
  };
}

/** One market size row: a strength and what the market lists it at. */
interface MarketSize {
  strength: string;
  marketReferencePriceCents: number;
}

interface CatalogedProductInput {
  internalProductCode: string;
  canonicalName: string;
  displayName: string;
  slug: string;
  nameAliases?: readonly string[];
  productClass: PeptideProductClass;
  category: string;
  peptideToken: string;
  sizes: readonly MarketSize[];
  protocolTags?: readonly string[];
  pairedSupplementNames?: readonly string[];
}

/** A compound we do not carry yet. No cost basis, so nothing is purchasable. */
function expansionProduct(input: CatalogedProductInput): PeptideProduct {
  return {
    tier: "expansion",
    internalProductCode: input.internalProductCode,
    legacyProductCode: null,
    canonicalName: input.canonicalName,
    displayName: input.displayName,
    slug: input.slug,
    legacyCatalogSlug: null,
    nameAliases: input.nameAliases ?? [],
    productClass: input.productClass,
    category: input.category,
    variants: input.sizes.map((size) =>
      marketSizeVariant({
        tier: "expansion",
        label: `Single vial, ${size.strength}`,
        strength: size.strength,
        size: size.strength,
        format: "vial",
        peptideToken: input.peptideToken,
        regulatoryNote: EXPANSION_REGULATORY_NOTE,
        marketReferencePriceCents: size.marketReferencePriceCents,
        readinessStatus: "NEEDS_INTERNAL_DOCS",
        priceApprovalNote: NO_COST_BASIS_NOTE,
      }),
    ),
    supplierSource: MARKET_SUPPLIER_SOURCE,
    regulatoryNote: EXPANSION_REGULATORY_NOTE,
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: input.protocolTags ?? [],
    pairedSupplementNames: input.pairedSupplementNames ?? [],
    holdReason: null,
  };
}

/** A compound held pending a founder decision and counsel review. Never purchasable. */
function regulatoryHoldProduct(
  input: CatalogedProductInput & { holdReason: string; regulatoryNote: string },
): PeptideProduct {
  return {
    tier: "regulatory_hold",
    internalProductCode: input.internalProductCode,
    legacyProductCode: null,
    canonicalName: input.canonicalName,
    displayName: input.displayName,
    slug: input.slug,
    legacyCatalogSlug: null,
    nameAliases: input.nameAliases ?? [],
    productClass: input.productClass,
    category: input.category,
    variants: input.sizes.map((size) =>
      marketSizeVariant({
        tier: "regulatory_hold",
        label: `Single vial, ${size.strength}`,
        strength: size.strength,
        size: size.strength,
        format: "vial",
        peptideToken: input.peptideToken,
        regulatoryNote: input.regulatoryNote,
        marketReferencePriceCents: size.marketReferencePriceCents,
        readinessStatus: "NEEDS_FINAL_APPROVAL",
        priceApprovalNote: REGULATORY_HOLD_PRICE_NOTE,
      }),
    ),
    supplierSource: MARKET_SUPPLIER_SOURCE,
    regulatoryNote: input.regulatoryNote,
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: [],
    pairedSupplementNames: [],
    holdReason: input.holdReason,
  };
}

// ---------------------------------------------------------------------------
// THE EXTENSION POINT for further harvest data
// ---------------------------------------------------------------------------

/**
 * The input a later harvest supplies for one additional size. It carries no
 * cost at all, on purpose: a harvested size is a real presentation with no cost
 * basis of our own, and this shape gives the lane no way to introduce one.
 *
 * A cost is added later, deliberately, by a separate edit that a human reviews.
 */
export interface AdditionalVariantInput {
  /** The product this size belongs to, by internal product code. */
  internalProductCode: string;
  label: string;
  strength: string;
  size: string;
  format: PeptideFormat;
  capsuleCount?: number;
  /** The peptide token for the SKU. Must match the product's other variants. */
  peptideToken: string;
  /** INTERNAL. The market's listed price for this size, if the harvest has one. */
  marketReferencePriceCents?: number | null;
  memberEligible?: boolean;
}

/**
 * Build one additional variant. No cost basis, therefore no computed price, no
 * matrix price, and no purchase mode. There is no argument that changes those
 * three facts.
 */
export function buildAdditionalVariant(
  input: AdditionalVariantInput,
  product: PeptideProduct,
): PeptideVariant {
  const capsuleCount = input.capsuleCount ?? null;
  return {
    label: input.label,
    strength: input.strength,
    size: input.size,
    format: input.format,
    capsuleCount,
    sku: buildSku({
      peptideToken: input.peptideToken,
      presentationToken: presentationToken(input.strength, input.format, capsuleCount),
      format: input.format,
    }),
    memberEligible: input.memberEligible ?? true,
    origin: "market_reference_harvest",
    isPrimary: false,
    wholesaleSourceCostCents: null,
    computedCustomerAmountCents: null,
    priorApprovedMatrixAmountCents: null,
    legacyPublishedAmountCents: null,
    signedSupplierMasterMemberAmountCents: null,
    marketReferencePriceCents: input.marketReferencePriceCents ?? null,
    disputedBySignedSupplierMasterStrength: null,
    priceStatus: "draft_pending_formula_confirmation",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    priceApprovalNote:
      product.tier === "regulatory_hold" ? REGULATORY_HOLD_PRICE_NOTE : NO_COST_BASIS_NOTE,
    availability: resolveVariantAvailability({
      tier: product.tier,
      coaStatus: product.coaStatus,
      regulatoryNote: product.regulatoryNote,
      hasCostBasis: false,
    }),
    readinessStatus:
      product.tier === "workbook"
        ? "NEEDS_COA_ATTACHMENT"
        : product.tier === "expansion"
          ? "NEEDS_INTERNAL_DOCS"
          : "NEEDS_FINAL_APPROVAL",
  };
}

/**
 * Append harvested sizes to the catalog, returning a NEW catalog. The base
 * catalog is never mutated, so the workbook record stays intact.
 *
 * Throws rather than dropping data on an unknown product code or a SKU
 * collision, because both mean the harvest and the catalog disagree and a human
 * needs to look.
 */
export function mergeAdditionalVariants(
  base: readonly PeptideProduct[],
  additions: readonly AdditionalVariantInput[],
): readonly PeptideProduct[] {
  const byCode = new Map(base.map((product) => [product.internalProductCode, product]));
  const built = new Map<string, PeptideVariant[]>();
  const seenSkus = new Set(base.flatMap((p) => p.variants.map((v) => v.sku)));

  for (const addition of additions) {
    const product = byCode.get(addition.internalProductCode);
    if (!product) {
      throw new RangeError(
        `unknown internalProductCode in additional variant: ${addition.internalProductCode}`,
      );
    }
    const variant = buildAdditionalVariant(addition, product);
    if (seenSkus.has(variant.sku)) {
      throw new RangeError(`duplicate sku in additional variant: ${variant.sku}`);
    }
    seenSkus.add(variant.sku);
    const list = built.get(product.internalProductCode) ?? [];
    list.push(variant);
    built.set(product.internalProductCode, list);
  }

  return base.map((product) => {
    const extra = built.get(product.internalProductCode);
    if (!extra || extra.length === 0) return product;
    return { ...product, variants: [...product.variants, ...extra] };
  });
}

// ===========================================================================
// TIER 1: THE WORKBOOK (15 products)
// ===========================================================================
//
// Additional market sizes are appended only where the harvest lists a strength
// that is unambiguously a DIFFERENT presentation of the same compound in the
// same format. A single-size market listing whose total simply restates our
// presentation (GLOW 70 mg is our 10/10/50, KLOW 80 mg is the signed master's
// own total) is recorded as a name alias, not duplicated as a second SKU for
// the same physical vial. Every skipped case is listed in the build notes.

export const WORKBOOK_TIER: readonly PeptideProduct[] = [
  {
    tier: "workbook",
    internalProductCode: "PEP-001",
    legacyProductCode: "P001",
    canonicalName: "BPC-157 (pentadecapeptide BPC-157) and TB-500 (thymosin beta-4 fragment)",
    displayName: "BPC-157 + TB-500 Research Blend",
    slug: "bpc-157-tb-500-15-15",
    legacyCatalogSlug: "bpc-157-tb-500-15-15",
    nameAliases: ["BPC157", "TB500", "Thymosin beta-4 fragment"],
    productClass: "repair_peptide",
    category: "Blend",
    variants: [
      workbookVariant({
        label: "Single vial, 15 mg / 15 mg",
        strength: "15 mg / 15 mg",
        size: "15 mg / 15 mg",
        format: "vial",
        peptideToken: "BPC157_TB500",
        regulatoryNote: "Category 1 (both components)",
        wholesaleSourceCostCents: 13400,
        legacyPublishedAmountCents: 33999,
        signedSupplierMasterMemberAmountCents: 8999,
        disputedBySignedSupplierMasterStrength: "5 mg BPC-157 / 5 mg TB-500 (10 mg total)",
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "Category 1 (both components)",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["injury_recovery_oa_djd", "autoimmune_inflammation", "performance_athletic"],
    pairedSupplementNames: [
      "Chondro Jointaide",
      "Collagen Renew",
      "PRM Resolve",
      "Inflam-Eze",
      "GI Defend",
      "UltraBiotic Prebiotic",
      "Hydrate",
      "Core Aminos (BCAA)",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-002",
    legacyProductCode: "P002",
    canonicalName:
      "BPC-157, TB-500 (thymosin beta-4 fragment), and GHK-Cu (copper tripeptide-1)",
    displayName: "BPC-157 + TB-500 + GHK-Cu Research Blend",
    slug: "bpc-tb-ghk-cu",
    legacyCatalogSlug: "bpc-tb-ghk-cu",
    // "GLOW" is the market's name for this exact 70 mg composition. Recorded as
    // an alias rather than duplicated as a second product.
    nameAliases: ["GLOW", "GHK-Cu", "Copper tripeptide-1", "BPC157 TB500 GHKCU"],
    productClass: "blend",
    category: "Blend",
    variants: [
      workbookVariant({
        label: "Single vial, 10 mg / 10 mg / 50 mg",
        strength: "10 mg / 10 mg / 50 mg",
        size: "10 mg / 10 mg / 50 mg",
        format: "vial",
        peptideToken: "BPC157_TB500_GHKCU",
        regulatoryNote: "All components Category 1",
        wholesaleSourceCostCents: 13900,
        legacyPublishedAmountCents: 34999,
        marketReferencePriceCents: 13499,
        disputedBySignedSupplierMasterStrength:
          "GHK-Cu 50 mg / BPC-157 10 mg / TB-500 10 mg (70 mg total)",
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "All components Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: [
      "injury_recovery_oa_djd",
      "perimenopause_hormonal",
      "beauty_hair_skin_nails",
    ],
    pairedSupplementNames: [
      "Chondro Jointaide",
      "Collagen Renew",
      "PRM Resolve",
      "Stress Essentials Balance",
      "PeriMenopause Support",
      "Beauty Essentials Rejuvenate+",
      "Annatto Pro 125",
      "Omega Pure EPA-DHA 2400",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-003",
    legacyProductCode: "P003",
    canonicalName:
      "TB-500 (thymosin beta-4 fragment), BPC-157, GHK-Cu (copper tripeptide-1), and KPV (lysine-proline-valine)",
    displayName: "KLOW Research Blend",
    slug: "klow-research-blend",
    legacyCatalogSlug: "klow-research-blend",
    nameAliases: ["KLOW", "KLOW Peptide Stack", "KPV"],
    productClass: "blend",
    category: "Blend",
    variants: [
      workbookVariant({
        label: "Single vial, 5 mg / 5 mg / 10 mg / 5 mg",
        strength: "5 mg / 5 mg / 10 mg / 5 mg",
        size: "5 mg / 5 mg / 10 mg / 5 mg",
        format: "vial",
        peptideToken: "TB500_BPC157_GHKCU_KPV",
        regulatoryNote: "All components Category 1",
        wholesaleSourceCostCents: 13400,
        legacyPublishedAmountCents: 33999,
        signedSupplierMasterMemberAmountCents: 14999,
        disputedBySignedSupplierMasterStrength:
          "GHK-Cu 50 mg / BPC-157 10 mg / TB-500 10 mg / KPV 10 mg (80 mg total)",
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "All components Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["injury_recovery_oa_djd", "autoimmune_inflammation"],
    pairedSupplementNames: [
      "Chondro Jointaide",
      "Collagen Renew",
      "PRM Resolve",
      "Inflam-Eze",
      "GI Defend",
      "UltraBiotic Prebiotic",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-004",
    legacyProductCode: "P004",
    canonicalName:
      "Thymosin alpha-1, KPV (lysine-proline-valine), and LL-37 (cathelicidin fragment)",
    displayName: "Thymosin Alpha-1 + KPV + LL-37 Research Blend",
    slug: "ta1-kpv-ll37",
    legacyCatalogSlug: "ta1-kpv-ll37",
    nameAliases: ["TA1", "Thymalfasin", "LL37"],
    productClass: "blend",
    category: "Blend",
    // No market equivalent exists. LL-37 appears nowhere in the reference
    // catalog, so this formulation is unique to xenios.
    variants: [
      workbookVariant({
        label: "Single vial, 5 mg / 5 mg / 5 mg",
        strength: "5 mg / 5 mg / 5 mg",
        size: "5 mg / 5 mg / 5 mg",
        format: "vial",
        peptideToken: "THYMOSINALPHA1_KPV_LL37",
        regulatoryNote: "All components Category 1",
        wholesaleSourceCostCents: 15900,
        legacyPublishedAmountCents: 38999,
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "All components Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["autoimmune_inflammation"],
    pairedSupplementNames: [
      "Inflam-Eze",
      "PRM Resolve",
      "GI Defend",
      "UltraBiotic Prebiotic",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-005",
    legacyProductCode: "P005",
    canonicalName: "CJC-1295 and ipamorelin",
    displayName: "CJC-1295 + Ipamorelin Research Blend",
    slug: "cjc-1295-ipamorelin",
    legacyCatalogSlug: "cjc-1295-ipamorelin",
    nameAliases: ["CJC1295", "Ipamorelin"],
    productClass: "gh_secretagogue",
    category: "Blend",
    variants: [
      workbookVariant({
        label: "Single vial, 5 mg / 5 mg",
        strength: "5 mg / 5 mg",
        size: "5 mg / 5 mg",
        format: "vial",
        peptideToken: "CJC1295_IPAMORELIN",
        regulatoryNote: "Category 1",
        wholesaleSourceCostCents: 5500,
        legacyPublishedAmountCents: 15999,
        marketReferencePriceCents: 9999,
      }),
      marketSizeVariant({
        tier: "workbook",
        label: "Single vial, 20 mg total",
        strength: "20 mg",
        size: "20 mg total",
        format: "vial",
        peptideToken: "CJC1295_IPAMORELIN",
        regulatoryNote: "Category 1",
        marketReferencePriceCents: 15999,
        readinessStatus: "NEEDS_COA_ATTACHMENT",
        priceApprovalNote: NO_COST_BASIS_NOTE,
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["gh_axis_anti_aging", "performance_athletic"],
    pairedSupplementNames: [
      "Stress Essentials Calm",
      "Collagen Renew",
      "Longevity Essentials NAD+",
      "Hydrate",
      "Core Aminos (BCAA)",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-006",
    legacyProductCode: "P006",
    canonicalName: "PT-141 (bremelanotide)",
    displayName: "PT-141 Research Material",
    slug: "pt-141-bremelanotide",
    legacyCatalogSlug: "pt-141-bremelanotide",
    nameAliases: ["Bremelanotide", "PT141"],
    productClass: "sexual_health_peptide",
    category: "Peptide",
    variants: [
      workbookVariant({
        label: "Single vial, 10 mg",
        strength: "10 mg",
        size: "10 mg",
        format: "vial",
        peptideToken: "PT141",
        regulatoryNote: "Category 1",
        wholesaleSourceCostCents: 3800,
        legacyPublishedAmountCents: 11999,
        marketReferencePriceCents: 8999,
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["sexual_health"],
    pairedSupplementNames: ["Omega Pure EPA-DHA 2400", "Uplift+"],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-007",
    legacyProductCode: "P007",
    canonicalName: "Tesamorelin",
    displayName: "Tesamorelin Research Material",
    slug: "tesamorelin-10mg",
    legacyCatalogSlug: "tesamorelin-10mg",
    nameAliases: ["Tesamorelin acetate"],
    productClass: "gh_secretagogue",
    category: "Peptide",
    variants: [
      workbookVariant({
        label: "Single vial, 10 mg",
        strength: "10 mg",
        size: "10 mg",
        format: "vial",
        peptideToken: "TESAMORELIN",
        regulatoryNote: "Category 1 (FDA-approved molecule)",
        wholesaleSourceCostCents: 7900,
        legacyPublishedAmountCents: 20999,
        signedSupplierMasterMemberAmountCents: 14999,
        marketReferencePriceCents: 7999,
        disputedBySignedSupplierMasterStrength: "5 mg",
      }),
      marketSizeVariant({
        tier: "workbook",
        label: "Single vial, 20 mg",
        strength: "20 mg",
        size: "20 mg",
        format: "vial",
        peptideToken: "TESAMORELIN",
        regulatoryNote: "Category 1 (FDA-approved molecule)",
        marketReferencePriceCents: 12499,
        readinessStatus: "NEEDS_COA_ATTACHMENT",
        priceApprovalNote: NO_COST_BASIS_NOTE,
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    // The workbook records the molecule's regulatory pedigree here as a factual
    // status. This is the only field in the catalog permitted to carry it, and it
    // is never marketing copy.
    regulatoryNote: "Category 1 (FDA-approved molecule)",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["gh_axis_anti_aging", "perimenopause_hormonal"],
    pairedSupplementNames: [
      "Stress Essentials Calm",
      "Collagen Renew",
      "Longevity Essentials NAD+",
      "Stress Essentials Balance",
      "PeriMenopause Support",
      "Beauty Essentials Rejuvenate+",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-008",
    legacyProductCode: "P008",
    canonicalName: "Gonadorelin (gonadotropin-releasing hormone)",
    displayName: "Gonadorelin Research Material",
    slug: "gonadorelin-5mg",
    legacyCatalogSlug: "gonadorelin-5mg",
    nameAliases: ["GnRH", "Gonadorelin acetate"],
    productClass: "sexual_health_peptide",
    category: "Peptide",
    // No market equivalent exists. Gonadorelin is absent from the reference
    // catalog entirely.
    variants: [
      workbookVariant({
        label: "Single vial, 5 mg",
        strength: "5 mg",
        size: "5 mg",
        format: "vial",
        peptideToken: "GONADORELIN",
        regulatoryNote: "Category 1",
        wholesaleSourceCostCents: 4300,
        legacyPublishedAmountCents: 12999,
        disputedBySignedSupplierMasterStrength: "2 mg",
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["sexual_health", "perimenopause_hormonal"],
    pairedSupplementNames: [
      "Omega Pure EPA-DHA 2400",
      "Uplift+",
      "Stress Essentials Balance",
      "PeriMenopause Support",
      "Beauty Essentials Rejuvenate+",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-009",
    legacyProductCode: "P009",
    canonicalName: "NAD+ (nicotinamide adenine dinucleotide)",
    displayName: "NAD+ Research Material",
    slug: "nad-plus-500mg",
    legacyCatalogSlug: "nad-plus-500mg",
    nameAliases: ["NAD", "Nicotinamide adenine dinucleotide"],
    // Not a peptide. See PeptideProductClass for why this class exists.
    productClass: "mitochondrial_cofactor",
    category: "Peptide",
    variants: [
      workbookVariant({
        label: "Single vial, 500 mg",
        strength: "500 mg",
        size: "500 mg",
        format: "vial",
        peptideToken: "NAD",
        regulatoryNote: "Category 1",
        wholesaleSourceCostCents: 5500,
        legacyPublishedAmountCents: 15999,
        marketReferencePriceCents: 8999,
        disputedBySignedSupplierMasterStrength: "100 mg",
      }),
      marketSizeVariant({
        tier: "workbook",
        label: "Single vial, 1000 mg",
        strength: "1000 mg",
        size: "1000 mg",
        format: "vial",
        peptideToken: "NAD",
        regulatoryNote: "Category 1",
        marketReferencePriceCents: 12999,
        readinessStatus: "NEEDS_COA_ATTACHMENT",
        priceApprovalNote: NO_COST_BASIS_NOTE,
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: [
      "mitochondrial_longevity",
      "neurological_cognitive",
      "oral_weight_loss",
    ],
    pairedSupplementNames: [
      "Longevity Essentials NAD+",
      "Mito Recharge",
      "Fruits & Greens",
      "Magtein (Magnesium L-Threonate)",
      "Uplift+",
      "Brain Restore",
      "UltraBiotic Akkermansia Plus",
      "UltraBiotic Prebiotic",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-010",
    legacyProductCode: "P010",
    canonicalName: "MOTS-c (mitochondrial open reading frame of the 12S rRNA type-c)",
    displayName: "MOTS-C Research Material",
    slug: "mots-c-10mg",
    legacyCatalogSlug: "mots-c-10mg",
    nameAliases: ["MOTSC", "MOTS-C"],
    productClass: "mitochondrial_peptide",
    category: "Peptide",
    variants: [
      workbookVariant({
        label: "Single vial, 10 mg",
        strength: "10 mg",
        size: "10 mg",
        format: "vial",
        peptideToken: "MOTSC",
        regulatoryNote: "PCAC review, likely Category 1",
        wholesaleSourceCostCents: 4700,
        legacyPublishedAmountCents: 13999,
        marketReferencePriceCents: 8499,
        disputedBySignedSupplierMasterStrength: "5 mg",
      }),
      marketSizeVariant({
        tier: "workbook",
        label: "Single vial, 40 mg",
        strength: "40 mg",
        size: "40 mg",
        format: "vial",
        peptideToken: "MOTSC",
        regulatoryNote: "PCAC review, likely Category 1",
        marketReferencePriceCents: 12999,
        readinessStatus: "NEEDS_COA_ATTACHMENT",
        priceApprovalNote: NO_COST_BASIS_NOTE,
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "PCAC review, likely Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["mitochondrial_longevity", "oral_weight_loss"],
    pairedSupplementNames: [
      "Longevity Essentials NAD+",
      "Mito Recharge",
      "Fruits & Greens",
      "UltraBiotic Akkermansia Plus",
      "UltraBiotic Prebiotic",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-011",
    legacyProductCode: "P011",
    canonicalName: "Epithalon (Ala-Glu-Asp-Gly tetrapeptide)",
    displayName: "Epithalon Research Material",
    // Canonical spelling per docs/research-commerce/SUPPLIER_FACT_RECONCILIATION_FINAL.md.
    // The live catalog still routes on the legacy spelling, so an alias is required.
    slug: "epithalon-10mg",
    legacyCatalogSlug: "epitalon-10mg",
    nameAliases: ["Epitalon", "AEDG", "Ala-Glu-Asp-Gly"],
    productClass: "longevity_peptide",
    category: "Peptide",
    variants: [
      workbookVariant({
        label: "Single vial, 10 mg",
        strength: "10 mg",
        size: "10 mg",
        format: "vial",
        peptideToken: "EPITHALON",
        regulatoryNote: "PCAC review, likely Category 1",
        wholesaleSourceCostCents: 4500,
        legacyPublishedAmountCents: 12999,
        disputedBySignedSupplierMasterStrength: "5 mg",
      }),
      marketSizeVariant({
        tier: "workbook",
        label: "Single vial, 100 mg",
        strength: "100 mg",
        size: "100 mg",
        format: "vial",
        peptideToken: "EPITHALON",
        regulatoryNote: "PCAC review, likely Category 1",
        marketReferencePriceCents: 8799,
        readinessStatus: "NEEDS_COA_ATTACHMENT",
        priceApprovalNote: NO_COST_BASIS_NOTE,
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "PCAC review, likely Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["mitochondrial_longevity"],
    pairedSupplementNames: [
      "Longevity Essentials NAD+",
      "Mito Recharge",
      "Fruits & Greens",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-012",
    legacyProductCode: "P012",
    canonicalName: "SS-31 (elamipretide)",
    displayName: "SS-31 Research Material",
    slug: "ss-31-elamipretide",
    legacyCatalogSlug: "ss-31-elamipretide",
    nameAliases: ["Elamipretide", "SS31", "MTP-131"],
    productClass: "mitochondrial_peptide",
    category: "Peptide",
    variants: [
      workbookVariant({
        label: "Single vial, 10 mg",
        strength: "10 mg",
        size: "10 mg",
        format: "vial",
        peptideToken: "SS31",
        regulatoryNote: "Category 1",
        wholesaleSourceCostCents: 8900,
        legacyPublishedAmountCents: 22999,
        marketReferencePriceCents: 5999,
        disputedBySignedSupplierMasterStrength: "5 mg",
      }),
      marketSizeVariant({
        tier: "workbook",
        label: "Single vial, 50 mg",
        strength: "50 mg",
        size: "50 mg",
        format: "vial",
        peptideToken: "SS31",
        regulatoryNote: "Category 1",
        marketReferencePriceCents: 15999,
        readinessStatus: "NEEDS_COA_ATTACHMENT",
        priceApprovalNote: NO_COST_BASIS_NOTE,
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["mitochondrial_longevity", "neurological_cognitive"],
    pairedSupplementNames: [
      "Longevity Essentials NAD+",
      "Mito Recharge",
      "Fruits & Greens",
      "Magtein (Magnesium L-Threonate)",
      "Uplift+",
      "Brain Restore",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-013",
    legacyProductCode: "P013",
    canonicalName: "SLU-PP-332",
    displayName: "SLU-PP-332 Research Capsules",
    slug: "slu-pp-332-capsules",
    legacyCatalogSlug: "slu-pp-332-capsules",
    nameAliases: ["SLUPP332", "SLU PP 332"],
    productClass: "oral_capsule",
    category: "Capsule",
    // The market carries SLU-PP-332 only as a 10 mg vial. That is a different
    // format from our capsule bottle, so it is not appended as a size here.
    variants: [
      workbookVariant({
        label: "Capsule bottle, 100 count, 250 mcg per capsule",
        strength: "250 mcg",
        size: "100 Count",
        format: "capsule_bottle",
        capsuleCount: 100,
        peptideToken: "SLUPP332",
        regulatoryNote: "Category 1",
        wholesaleSourceCostCents: 9900,
        legacyPublishedAmountCents: 25999,
        disputedBySignedSupplierMasterStrength: "1500 mcg per capsule, 60 capsules",
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["oral_weight_loss"],
    pairedSupplementNames: [
      "Fruits & Greens",
      "UltraBiotic Akkermansia Plus",
      "UltraBiotic Prebiotic",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-014",
    legacyProductCode: "P014",
    canonicalName: "Dihexa (N-hexanoic-tyrosyl-isoleucyl-(6)-aminohexanoic amide)",
    displayName: "Dihexa Research Capsules",
    slug: "dihexa-capsules",
    legacyCatalogSlug: "dihexa-capsules",
    nameAliases: ["N-hexanoic-Tyr-Ile-(6) aminohexanoic amide", "PNB-0408"],
    productClass: "oral_capsule",
    category: "Capsule",
    // The market carries Dihexa only as a 10 mg vial. That is a different format
    // from our capsule bottle, so it is not appended as a size here.
    variants: [
      workbookVariant({
        label: "Capsule bottle, 60 count, 10 mg per capsule",
        strength: "10 mg",
        size: "60 Count",
        format: "capsule_bottle",
        capsuleCount: 60,
        peptideToken: "DIHEXA",
        regulatoryNote: "Category 1",
        wholesaleSourceCostCents: 11900,
        legacyPublishedAmountCents: 29999,
        disputedBySignedSupplierMasterStrength: "10 mg per capsule, 30 capsules",
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["neurological_cognitive"],
    pairedSupplementNames: [
      "Magtein (Magnesium L-Threonate)",
      "Uplift+",
      "Brain Restore",
    ],
    holdReason: null,
  },
  {
    tier: "workbook",
    internalProductCode: "PEP-015",
    legacyProductCode: "P015",
    canonicalName: "Semax, Selank, and DSIP (delta sleep-inducing peptide)",
    displayName: "Semax + Selank + DSIP Research Blend",
    slug: "semax-selank-dsip",
    legacyCatalogSlug: "semax-selank-dsip",
    nameAliases: ["DSIP", "Delta sleep-inducing peptide"],
    productClass: "neuro_peptide",
    category: "Blend",
    // No market equivalent exists. The market blend is Semax and Selank only,
    // with no DSIP, so it is a different formulation and is carried in the
    // expansion tier as its own product.
    variants: [
      workbookVariant({
        label: "Single vial, 10 mg / 10 mg / 2 mg",
        strength: "10 mg / 10 mg / 2 mg",
        size: "10 mg / 10 mg / 2 mg",
        format: "vial",
        peptideToken: "SEMAX_SELANK_DSIP",
        regulatoryNote: "PCAC review, expected Category 1",
        wholesaleSourceCostCents: 9900,
        legacyPublishedAmountCents: 25999,
        disputedBySignedSupplierMasterStrength:
          "Semax 5 mg / Selank 5 mg / DSIP 5 mg (15 mg total)",
      }),
    ],
    supplierSource: WORKBOOK_SUPPLIER_SOURCE,
    regulatoryNote: "PCAC review, expected Category 1",
    coaStatus: "PENDING_LAB_DOCUMENTATION",
    protocolTags: ["neurological_cognitive"],
    pairedSupplementNames: [
      "Magtein (Magnesium L-Threonate)",
      "Uplift+",
      "Brain Restore",
    ],
    holdReason: null,
  },
];

// ===========================================================================
// TIER 2: EXPANSION (27 products)
// ===========================================================================
//
// Compounds we do not carry yet. Two groups: the standalone components we sell
// only inside a blend today, and the net-new compounds from the harvest.
// Bacteriostatic Water and anything tagged lab_supply are excluded from this
// catalog entirely. The GLP class is Tier 3, not here.
//
// Nothing here has a cost basis, so nothing here is purchasable.

export const EXPANSION_TIER: readonly PeptideProduct[] = [
  // --- standalone components of blends we already sell ---------------------
  expansionProduct({
    internalProductCode: "PEX-001",
    canonicalName: "BPC-157 (pentadecapeptide BPC-157)",
    displayName: "BPC-157 Research Material",
    slug: "bpc-157",
    nameAliases: ["BPC157", "Body protection compound-157"],
    productClass: "repair_peptide",
    category: "Peptide",
    peptideToken: "BPC157",
    sizes: [
      { strength: "5 mg", marketReferencePriceCents: 1340 },
      { strength: "10 mg", marketReferencePriceCents: 8799 },
      { strength: "20 mg", marketReferencePriceCents: 10499 },
    ],
  }),
  expansionProduct({
    internalProductCode: "PEX-002",
    canonicalName: "TB-500 (thymosin beta-4 fragment)",
    displayName: "TB-500 Research Material",
    slug: "tb-500",
    nameAliases: ["TB500", "Thymosin beta-4 fragment"],
    productClass: "repair_peptide",
    category: "Peptide",
    peptideToken: "TB500",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 9999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-003",
    canonicalName: "GHK-Cu (copper tripeptide-1)",
    displayName: "GHK-Cu Research Material",
    slug: "ghk-cu",
    nameAliases: ["GHKCU", "Copper tripeptide-1"],
    productClass: "repair_peptide",
    category: "Peptide",
    peptideToken: "GHKCU",
    sizes: [
      { strength: "50 mg", marketReferencePriceCents: 900 },
      { strength: "100 mg", marketReferencePriceCents: 9999 },
    ],
  }),
  expansionProduct({
    internalProductCode: "PEX-004",
    canonicalName: "KPV (lysine-proline-valine)",
    displayName: "KPV Research Material",
    slug: "kpv",
    nameAliases: ["Lys-Pro-Val"],
    productClass: "immune_peptide",
    category: "Peptide",
    peptideToken: "KPV",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 7499 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-005",
    canonicalName: "Semax",
    displayName: "Semax Research Material",
    slug: "semax",
    productClass: "neuro_peptide",
    category: "Peptide",
    peptideToken: "SEMAX",
    sizes: [
      { strength: "10 mg", marketReferencePriceCents: 8999 },
      { strength: "30 mg", marketReferencePriceCents: 11999 },
    ],
  }),
  expansionProduct({
    internalProductCode: "PEX-006",
    canonicalName: "Selank",
    displayName: "Selank Research Material",
    slug: "selank",
    productClass: "neuro_peptide",
    category: "Peptide",
    peptideToken: "SELANK",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 8999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-007",
    canonicalName: "DSIP (delta sleep-inducing peptide)",
    displayName: "DSIP Research Material",
    slug: "dsip",
    nameAliases: ["Delta sleep-inducing peptide"],
    productClass: "neuro_peptide",
    category: "Peptide",
    peptideToken: "DSIP",
    sizes: [
      { strength: "10 mg", marketReferencePriceCents: 2800 },
      { strength: "15 mg", marketReferencePriceCents: 7999 },
    ],
  }),
  expansionProduct({
    internalProductCode: "PEX-008",
    canonicalName: "Thymosin alpha-1",
    displayName: "Thymosin Alpha-1 Research Material",
    slug: "thymosin-alpha-1",
    nameAliases: ["TA1", "Thymalfasin"],
    productClass: "immune_peptide",
    category: "Peptide",
    peptideToken: "THYMOSINALPHA1",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 9999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-009",
    canonicalName: "Ipamorelin",
    displayName: "Ipamorelin Research Material",
    slug: "ipamorelin",
    productClass: "gh_secretagogue",
    category: "Peptide",
    peptideToken: "IPAMORELIN",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 7499 }],
  }),

  // --- net-new compounds ---------------------------------------------------
  expansionProduct({
    internalProductCode: "PEX-010",
    canonicalName: "5-Amino-1MQ (5-amino-1-methylquinolinium)",
    displayName: "5-Amino-1MQ Research Material",
    slug: "5-amino-1mq",
    nameAliases: ["5 Amino 1MQ"],
    productClass: "metabolic_cofactor",
    category: "Peptide",
    peptideToken: "5AMINO1MQ",
    sizes: [
      { strength: "5 mg", marketReferencePriceCents: 8999 },
      { strength: "50 mg", marketReferencePriceCents: 19999 },
    ],
    // The only expansion compound the founder workbook already references: the
    // NutriDyn sheet pairs Mito Recharge with it.
    protocolTags: ["mitochondrial_longevity"],
    pairedSupplementNames: ["Mito Recharge"],
  }),
  expansionProduct({
    internalProductCode: "PEX-011",
    canonicalName: "Adamax",
    displayName: "Adamax Research Material",
    slug: "adamax",
    productClass: "neuro_peptide",
    category: "Peptide",
    peptideToken: "ADAMAX",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 6999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-012",
    canonicalName: "AOD-9604 (human growth hormone fragment 176-191)",
    displayName: "AOD-9604 Research Material",
    slug: "aod-9604",
    nameAliases: ["AOD9604", "hGH fragment 176-191"],
    productClass: "metabolic_peptide",
    category: "Peptide",
    peptideToken: "AOD9604",
    sizes: [
      { strength: "5 mg", marketReferencePriceCents: 7999 },
      { strength: "10 mg", marketReferencePriceCents: 10999 },
    ],
  }),
  expansionProduct({
    internalProductCode: "PEX-013",
    canonicalName: "CJC-1295 with DAC (drug affinity complex)",
    displayName: "CJC-1295 with DAC Research Material",
    slug: "cjc-1295-with-dac",
    nameAliases: ["CJC1295 DAC", "Drug affinity complex"],
    productClass: "gh_secretagogue",
    category: "Peptide",
    peptideToken: "CJC1295DAC",
    sizes: [{ strength: "5 mg", marketReferencePriceCents: 9999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-014",
    canonicalName: "Follistatin",
    displayName: "Follistatin Research Material",
    slug: "follistatin",
    productClass: "metabolic_peptide",
    category: "Peptide",
    peptideToken: "FOLLISTATIN",
    sizes: [{ strength: "1 mg", marketReferencePriceCents: 13899 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-015",
    canonicalName: "Glutathione (gamma-L-glutamyl-L-cysteinylglycine)",
    displayName: "Glutathione Research Material",
    slug: "glutathione",
    nameAliases: ["GSH"],
    productClass: "mitochondrial_cofactor",
    category: "Peptide",
    peptideToken: "GLUTATHIONE",
    sizes: [
      { strength: "500 mg", marketReferencePriceCents: 1790 },
      { strength: "600 mg", marketReferencePriceCents: 7999 },
      { strength: "1500 mg", marketReferencePriceCents: 10999 },
    ],
  }),
  expansionProduct({
    internalProductCode: "PEX-016",
    canonicalName: "HCG (human chorionic gonadotropin)",
    displayName: "HCG Research Material",
    slug: "hcg-5000",
    nameAliases: ["Human chorionic gonadotropin", "HCG 5000"],
    productClass: "hormone_analogue",
    category: "Peptide",
    peptideToken: "HCG",
    sizes: [{ strength: "5000 IU", marketReferencePriceCents: 8799 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-017",
    canonicalName: "IGF-1 LR3 (long arginine 3 insulin-like growth factor-1)",
    displayName: "IGF-1 LR3 Research Material",
    slug: "igf-1-lr3",
    nameAliases: ["IGF1 LR3", "Long R3 IGF-1"],
    productClass: "metabolic_peptide",
    category: "Peptide",
    peptideToken: "IGF1LR3",
    sizes: [
      { strength: "0.1 mg", marketReferencePriceCents: 3499 },
      { strength: "1 mg", marketReferencePriceCents: 9999 },
    ],
  }),
  expansionProduct({
    internalProductCode: "PEX-018",
    canonicalName: "Kisspeptin-10",
    displayName: "Kisspeptin-10 Research Material",
    slug: "kisspeptin-10",
    nameAliases: ["Metastin 45-54"],
    productClass: "hormone_analogue",
    category: "Peptide",
    peptideToken: "KISSPEPTIN10",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 9999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-019",
    canonicalName: "L-Carnitine (levocarnitine)",
    displayName: "L-Carnitine Research Material",
    slug: "l-carnitine",
    nameAliases: ["Levocarnitine"],
    productClass: "metabolic_cofactor",
    category: "Peptide",
    peptideToken: "LCARNITINE",
    sizes: [{ strength: "600 mg", marketReferencePriceCents: 5999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-020",
    canonicalName: "LIPO-C (lipotropic compound)",
    displayName: "LIPO-C Research Material",
    slug: "lipo-c",
    nameAliases: ["LIPOC", "Lipotropic compound"],
    productClass: "metabolic_cofactor",
    category: "Peptide",
    peptideToken: "LIPOC",
    sizes: [{ strength: "100 mg", marketReferencePriceCents: 7999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-021",
    canonicalName: "Melanotan I (afamelanotide)",
    displayName: "Melanotan I Research Material",
    slug: "melanotan-1",
    nameAliases: ["Afamelanotide", "Melanotan-1", "MT-1"],
    productClass: "melanocortin_peptide",
    category: "Peptide",
    peptideToken: "MELANOTAN1",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 6999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-022",
    canonicalName: "Melanotan II",
    displayName: "Melanotan II Research Material",
    slug: "melanotan-2",
    nameAliases: ["MT-2", "Melanotan-2"],
    productClass: "melanocortin_peptide",
    category: "Peptide",
    peptideToken: "MELANOTAN2",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 6999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-023",
    canonicalName: "Sermorelin (growth hormone releasing hormone 1-29)",
    displayName: "Sermorelin Research Material",
    slug: "sermorelin",
    nameAliases: ["GHRH 1-29"],
    productClass: "gh_secretagogue",
    category: "Peptide",
    peptideToken: "SERMORELIN",
    sizes: [
      { strength: "5 mg", marketReferencePriceCents: 2020 },
      { strength: "10 mg", marketReferencePriceCents: 9999 },
    ],
  }),
  expansionProduct({
    internalProductCode: "PEX-024",
    canonicalName: "Thymalin (thymus polypeptide fraction)",
    displayName: "Thymalin Research Material",
    slug: "thymalin",
    productClass: "immune_peptide",
    category: "Peptide",
    peptideToken: "THYMALIN",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 6999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-025",
    canonicalName: "VIP (vasoactive intestinal peptide)",
    displayName: "VIP Research Material",
    slug: "vip",
    nameAliases: ["Vasoactive intestinal peptide"],
    productClass: "immune_peptide",
    category: "Peptide",
    peptideToken: "VIP",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 8499 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-026",
    canonicalName: "Semax and Selank",
    displayName: "Semax + Selank Research Blend",
    slug: "semax-selank-blend",
    // Deliberately distinct from PEP-015, which also carries DSIP.
    nameAliases: ["Semax Selank"],
    productClass: "blend",
    category: "Blend",
    peptideToken: "SEMAX_SELANK",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 9999 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-027",
    canonicalName: "Tesamorelin and ipamorelin",
    displayName: "Tesamorelin + Ipamorelin Research Blend",
    slug: "tesamorelin-ipamorelin-blend",
    productClass: "blend",
    category: "Blend",
    peptideToken: "TESAMORELIN_IPAMORELIN",
    sizes: [{ strength: "15 mg", marketReferencePriceCents: 10999 }],
  }),
  // The three first-release identities the founder named on 2026-08-05. They
  // complete the 22-row Early Access list; without them the seed reported
  // eight unresolved rows rather than inventing an identity to fit a price.
  //
  // The founder supplied internal codes in the form XEA-CAG-010MG-VIAL. This
  // tier enforces PEX-### for internalProductCode (peptide-catalog.test.ts),
  // so these continue the existing sequence instead. Nothing customer-facing
  // changed: the SKU is DERIVED from the peptide token, which is why these
  // project as R360-CAGRILINTIDE-10MG-VIAL and so on, exactly as every other
  // catalogued unit does. Name, strength, presentation and price are the
  // founder's, verbatim.
  expansionProduct({
    internalProductCode: "PEX-028",
    canonicalName: "Cagrilintide Research Material",
    displayName: "Cagrilintide",
    slug: "cagrilintide",
    nameAliases: ["Cagrilintide", "Cagrilintide Research Material"],
    productClass: "metabolic_peptide",
    category: "Peptide",
    peptideToken: "CAGRILINTIDE",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 5600 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-029",
    canonicalName: "Hexarelin Research Material",
    displayName: "Hexarelin",
    slug: "hexarelin",
    nameAliases: ["Hexarelin", "Hexarelin Research Material"],
    productClass: "gh_secretagogue",
    category: "Peptide",
    peptideToken: "HEXARELIN",
    sizes: [{ strength: "10 mg", marketReferencePriceCents: 3360 }],
  }),
  expansionProduct({
    internalProductCode: "PEX-030",
    canonicalName: "Oxytocin Research Material",
    displayName: "Oxytocin",
    slug: "oxytocin",
    nameAliases: ["Oxytocin", "Oxytocin Research Material"],
    productClass: "hormone_analogue",
    category: "Peptide",
    peptideToken: "OXYTOCIN",
    sizes: [{ strength: "5 mg", marketReferencePriceCents: 1790 }],
  }),
];

// ===========================================================================
// TIER 3: REGULATORY HOLD (3 products)
// ===========================================================================
//
// Recorded as data so the decision is explicit and the compounds are not quietly
// forgotten. Held UNAVAILABLE in code, excluded from the customer projection in
// code, and given no customer-facing copy anywhere in this lane.

const GLP_HOLD_TAIL =
  "Selling it through a research channel carries elevated regulatory exposure and elevated payment-processor exposure. " +
  "It requires an explicit founder decision plus counsel review before any customer surface displays it.";

export const REGULATORY_HOLD_TIER: readonly PeptideProduct[] = [
  regulatoryHoldProduct({
    internalProductCode: "PRH-001",
    canonicalName: "Semaglutide",
    displayName: "Semaglutide",
    slug: "semaglutide",
    nameAliases: ["Sema GLP-1"],
    productClass: "metabolic_peptide",
    category: "Peptide",
    peptideToken: "SEMAGLUTIDE",
    regulatoryNote:
      "Approved drug molecule. Not assessed for research-channel sale. Held pending a founder decision and counsel review.",
    holdReason: `Semaglutide is an approved drug molecule. ${GLP_HOLD_TAIL}`,
    sizes: [
      { strength: "10 mg", marketReferencePriceCents: 4499 },
      { strength: "15 mg", marketReferencePriceCents: 5499 },
      { strength: "20 mg", marketReferencePriceCents: 6499 },
      { strength: "30 mg", marketReferencePriceCents: 8499 },
      { strength: "50 mg", marketReferencePriceCents: 11900 },
    ],
  }),
  regulatoryHoldProduct({
    internalProductCode: "PRH-002",
    canonicalName: "Tirzepatide",
    displayName: "Tirzepatide",
    slug: "tirzepatide",
    nameAliases: ["Tirz GLP-2"],
    productClass: "metabolic_peptide",
    category: "Peptide",
    peptideToken: "TIRZEPATIDE",
    regulatoryNote:
      "Approved drug molecule. Not assessed for research-channel sale. Held pending a founder decision and counsel review.",
    holdReason: `Tirzepatide is an approved drug molecule. ${GLP_HOLD_TAIL}`,
    sizes: [
      { strength: "10 mg", marketReferencePriceCents: 6999 },
      { strength: "20 mg", marketReferencePriceCents: 11999 },
      { strength: "30 mg", marketReferencePriceCents: 17499 },
      { strength: "60 mg", marketReferencePriceCents: 29999 },
      { strength: "100 mg", marketReferencePriceCents: 39999 },
      { strength: "120 mg", marketReferencePriceCents: 43999 },
    ],
  }),
  regulatoryHoldProduct({
    internalProductCode: "PRH-003",
    canonicalName: "Retatrutide",
    displayName: "Retatrutide",
    slug: "retatrutide",
    nameAliases: ["Reta GLP-3"],
    productClass: "metabolic_peptide",
    category: "Peptide",
    peptideToken: "RETATRUTIDE",
    regulatoryNote:
      "In active clinical development. Not assessed for research-channel sale. Held pending a founder decision and counsel review.",
    holdReason: `Retatrutide is a molecule in active clinical development and is not an approved medicine. ${GLP_HOLD_TAIL}`,
    sizes: [
      { strength: "10 mg", marketReferencePriceCents: 7999 },
      { strength: "15 mg", marketReferencePriceCents: 9999 },
      { strength: "20 mg", marketReferencePriceCents: 12999 },
      { strength: "30 mg", marketReferencePriceCents: 18999 },
      { strength: "50 mg", marketReferencePriceCents: 29999 },
    ],
  }),
];

// ===========================================================================
// The catalog
// ===========================================================================

export const PEPTIDE_CATALOG: readonly PeptideProduct[] = [
  ...WORKBOOK_TIER,
  ...EXPANSION_TIER,
  ...REGULATORY_HOLD_TIER,
];

/** The number of peptide products the authoritative workbook sheet contains. */
export const PEPTIDE_CATALOG_SIZE = 15;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function productsInTier(
  tier: PeptideTier,
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): readonly PeptideProduct[] {
  return catalog.filter((product) => product.tier === tier);
}

/** Every variant in the catalog, flattened, in catalog order. */
export function allVariants(
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): readonly PeptideVariant[] {
  return catalog.flatMap((product) => product.variants);
}

/** Every variant paired with the product it belongs to. */
export function allVariantsWithProduct(
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): ReadonlyArray<{ product: PeptideProduct; variant: PeptideVariant }> {
  return catalog.flatMap((product) =>
    product.variants.map((variant) => ({ product, variant })),
  );
}

/**
 * The authoritative presentation of a workbook product. Throws if the invariant
 * is broken, and returns null for a tier with no authoritative presentation.
 */
export function primaryVariant(product: PeptideProduct): PeptideVariant | null {
  const primaries = product.variants.filter((variant) => variant.isPrimary);
  if (product.tier !== "workbook") {
    if (primaries.length > 0) {
      throw new RangeError(
        `${product.internalProductCode} is tier ${product.tier} and must have no primary variant`,
      );
    }
    return null;
  }
  if (primaries.length !== 1) {
    throw new RangeError(
      `${product.internalProductCode} must have exactly one primary variant, found ${primaries.length}`,
    );
  }
  return primaries[0];
}

export function findVariantBySku(
  sku: string,
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): { product: PeptideProduct; variant: PeptideVariant } | null {
  return allVariantsWithProduct(catalog).find((entry) => entry.variant.sku === sku) ?? null;
}

export function findPeptideBySku(
  sku: string,
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): PeptideProduct | null {
  return findVariantBySku(sku, catalog)?.product ?? null;
}

export function findPeptideBySlug(
  slug: string,
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): PeptideProduct | null {
  const normalized = slug.trim().toLowerCase();
  return (
    catalog.find(
      (product) =>
        product.slug === normalized || product.legacyCatalogSlug === normalized,
    ) ?? null
  );
}

export function findPeptideByCode(
  internalProductCode: string,
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): PeptideProduct | null {
  return (
    catalog.find((product) => product.internalProductCode === internalProductCode) ?? null
  );
}

/** Every protocol tag in the catalog, sorted, deduplicated. */
export function allProtocolTags(
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): readonly string[] {
  const tags = new Set<string>();
  for (const product of catalog) {
    for (const tag of product.protocolTags) tags.add(tag);
  }
  // Array.from rather than a spread: this repository's tsconfig has no target,
  // so iterating a Set with spread syntax fails the typecheck.
  return Array.from(tags).sort();
}

/** Products carrying a given protocol tag, in catalog order. */
export function peptidesForProtocol(
  tag: string,
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): readonly PeptideProduct[] {
  return catalog.filter((product) => product.protocolTags.includes(tag));
}

/**
 * Variants whose recorded strength disagrees with the signed supplier master.
 * The disagreement is surfaced, never resolved here.
 */
export function variantsWithStrengthConflict(
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): ReadonlyArray<{ product: PeptideProduct; variant: PeptideVariant }> {
  return allVariantsWithProduct(catalog).filter(
    (entry) => entry.variant.disputedBySignedSupplierMasterStrength !== null,
  );
}

/** Variants with no sourced wholesale cost. None of them may be a purchase mode. */
export function variantsWithoutCostBasis(
  catalog: readonly PeptideProduct[] = PEPTIDE_CATALOG,
): readonly PeptideVariant[] {
  return allVariants(catalog).filter(
    (variant) => variant.wholesaleSourceCostCents === null,
  );
}
