/**
 * xenios research: the founder-authored peptide pricing model, joined to the
 * implemented catalog by variant SKU.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------
 *
 * It is the transcription of one workbook:
 *
 *   XENIOS_PEPTIDE_MASTER_PRICING_MODEL_2026-07-29.xlsx
 *   sha256 f11742ae7801bcf465a5cf1a68af5ebdfab5dee9b6fba60aa9468e880161d519
 *
 * That workbook is the answer to the pricing question this lane has been unable
 * to settle: two founder-approved multiplier rules disagreed, and a third and
 * fourth price for the same items existed elsewhere in the repository, so
 * peptide-catalog.ts recorded every candidate side by side and refused to
 * choose. The workbook chooses. It prices to comparable market evidence rather
 * than to a multiple of supplier cost, and it states a recommended member price
 * for each of the current fifteen plus a draft target for every expansion
 * variant.
 *
 * The workbook was itself generated from this repository's extraction work: its
 * Source Notes sheet cites XENIOS_MITCH_CODE_EXTRACTED_CATALOG.json and
 * XENIOS_MITCH_CODE_EXTRACTION_AUDIT.md. That is why the join is exact rather
 * than fuzzy: its "All 70 Draft Targets" sheet keys on the same variant SKUs
 * peptide-catalog.ts already builds. All 70 sheet rows matched a catalog variant
 * and all 70 catalog variants matched a sheet row, with product code, tier,
 * strength, size, format, availability, and market reference price agreeing on
 * every row. `joinToCatalog` recomputes that at runtime and a test pins it.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT
 * ---------------------------------------------------------------------------
 *
 * It is not an activation. Not one price in this file may be charged to anyone.
 *
 * The workbook says so itself. Its Compliance Gates sheet records twelve gates
 * that are "Required before price activation" and none of them is met: exact
 * product identity FAILs with 11 material strength or pack conflicts, 0 of 65
 * referenced COA attachments have arrived, purity and sterility and endotoxin
 * are UNKNOWN, there is no lot or expiry record, and no signed supplier unit
 * cost exists. Those gates live in peptide-pricing-gates.ts, and this module
 * cannot produce a chargeable number without a verdict from them: see
 * `resolvePriceStatus` and `memberPriceCentsForDisplay`, both of which return a
 * draft status or null while any gate blocks.
 *
 * So every price here imports as FOUNDER_APPROVED_DRAFT_TARGET, `effectiveDate`
 * is typed as the literal `null` so no date can be written without a reviewed
 * edit, and ACTIVE_MEMBER_PRICE is structurally unreachable today.
 *
 * ---------------------------------------------------------------------------
 * THE MOST IMPORTANT CAVEAT ON THESE FIFTEEN PRICES
 * ---------------------------------------------------------------------------
 *
 * The workbook priced the supplier's attested presentation. The catalog SKU
 * records the presentation this repository implemented. For 11 of the 15 those
 * are not the same item.
 *
 * R360-BPC157_TB500-15MG_15MG-VIAL is a 15 mg / 15 mg SKU, and the $109 target
 * is a price for a 5 mg / 5 mg vial. R360-SLUPP332-250MCGX100-CAP is a
 * 250 mcg x 100 SKU, and the $129 target is a price for 1500 mcg x 60.
 *
 * Those prices are recorded against the SKU because the workbook keys them
 * there, but `pricedPresentation` states what was actually priced and
 * `priceAppliesToRecordedPresentation` returns false for every one of the 11.
 * This is the whole reason the identity gate is CRITICAL: resolving the
 * presentation is not paperwork, it decides which number is even the right one.
 * A price is never inherited across a strength or a pack count in this file.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS THIS FILE REFUSES TO DO
 * ---------------------------------------------------------------------------
 *
 * 1. It never invents a price. A blank source cell is null, never 0. The three
 *    regulatory-hold compounds (semaglutide, tirzepatide, retatrutide, 16
 *    variants) hold no price at all, exactly as the sheet leaves them, and they
 *    carry NO_PRICE_REGULATORY_HOLD rather than a number.
 *
 * 2. It never restates a supplier cost. The workbook's cost columns hold the
 *    legacy, disputed cost that peptide-catalog.ts already records as
 *    `wholesaleSourceCostCents`, and its "New Mitch unit cost" column is empty
 *    on all 70 rows. A second copy of a disputed cost would be a second thing to
 *    get wrong, so cost is not duplicated here. See the import notes for what
 *    the workbook's own margin arithmetic says about it.
 *
 * 3. It never asserts quality. There is no purity, sterility, endotoxin, lot, or
 *    expiry field in this file, because no such evidence exists for any of these
 *    items.
 *
 * ---------------------------------------------------------------------------
 * MONEY, AND ONE ROUNDING
 * ---------------------------------------------------------------------------
 *
 * Every amount is integer US cents. Every price target in the workbook is a
 * whole dollar, so no price is rounded here.
 *
 * The market statistics are different: a median of two listings can land on half
 * a cent ($99.995), and seven of the 45 market statistics do. Those are stored
 * rounded to the nearest cent, half away from zero, and every one of the seven is
 * listed in SUB_CENT_ROUNDING_LEDGER with its exact sheet value. Nothing else in
 * this file is transformed.
 *
 * House style: the workbook was scanned for em dashes and en dashes before
 * transcription and contains none, so no normalisation was needed. See
 * SOURCE_DASH_SCAN. A test still pins the absence in this directory.
 */

import { allVariantsWithProduct, PEPTIDE_CATALOG, type PeptideTier } from "./peptide-catalog";
import {
  canActivatePricing,
  type PricingActivationVerdict,
} from "./peptide-pricing-gates";

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface PricingWorkbookSource {
  fileName: string;
  sha256: string;
  workbookDate: string;
  sheets: readonly string[];
  /** The internal files the workbook's Source Notes sheet says it was built from. */
  upstreamSources: readonly string[];
}

export const PEPTIDE_PRICING_WORKBOOK: PricingWorkbookSource = {
  fileName: "XENIOS_PEPTIDE_MASTER_PRICING_MODEL_2026-07-29.xlsx",
  sha256: "f11742ae7801bcf465a5cf1a68af5ebdfab5dee9b6fba60aa9468e880161d519",
  workbookDate: "2026-07-29",
  sheets: [
    "Dashboard",
    "Assumptions",
    "Current 15 Pricing",
    "All 70 Draft Targets",
    "Market Benchmarks",
    "Competitor Observations",
    "Site Positioning",
    "Volume Scenarios",
    "Discounts and Offers",
    "Compliance Gates",
    "Source Notes",
  ],
  upstreamSources: [
    "XENIOS_MITCH_CODE_EXTRACTED_CATALOG.json",
    "XENIOS_MITCH_CODE_EXTRACTION_AUDIT.md",
    "XENIOS_MITCH_RETURN_IMPORT_SCHEMA.json",
    "XENIOS_MITCH_CODE_EXTRACTED_SOURCING_PACKAGE.xlsx",
  ],
} as const;

/**
 * What the market evidence behind these targets actually is: point-in-time web
 * listings, gathered once, on one day. The workbook states plainly that they are
 * observations and not an endorsement of anyone's quality, and that they should
 * be refreshed before a final approval.
 */
export const MARKET_EVIDENCE_SUMMARY = {
  sitesReviewed: 50,
  priceObservations: 97,
  accessedDate: "2026-07-29",
  caveat:
    "Point-in-time web listings, not legal or quality endorsements. Refresh before final approval.",
} as const;

/**
 * The result of scanning the source workbook for the two characters house style
 * forbids. Both counts are zero, verified across every sheet and every shared
 * string in the file, so no source text was altered in transcription.
 */
export const SOURCE_DASH_SCAN = {
  emDashOccurrences: 0,
  enDashOccurrences: 0,
  fieldsNormalised: [] as readonly string[],
  note: "The workbook already used plain hyphens throughout. Nothing required normalisation.",
} as const;

// ---------------------------------------------------------------------------
// The founder's pricing doctrine, in the workbook's words
// ---------------------------------------------------------------------------

/** The Dashboard sheet's eight numbered doctrine lines, verbatim and in order. */
export const PRICING_DOCTRINE: readonly string[] = [
  "Price to the 70th-85th percentile of comparable evidence-backed vendors, not to Mitch's cost.",
  "Display one clean private member price. Do not use a fake struck-through MSRP.",
  "Use exact lot-level COAs, mass, purity, and required safety panels as the premium proof.",
  "Cap ordinary quantity discounts at 10%; avoid BOGO and permanent 20% sales.",
  "Use free shipping at $250 and premium packaging instead of deep product discounts.",
  "Keep rare or unresolved products request-access only until cost, identity, COA, and release are verified.",
  "Do not activate semaglutide, tirzepatide, or retatrutide in the research lane.",
  "Re-price only when the exact presentation changes; never compare mismatched mg or pack counts.",
] as const;

/** The Dashboard sheet's five immediate founder inputs, verbatim and in order. */
export const IMMEDIATE_FOUNDER_INPUTS: readonly string[] = [
  "Obtain Mitch's exact new unit cost for every confirmed presentation.",
  "Resolve the 11 material strength/pack conflicts before labels or prices are approved.",
  "Receive and verify the actual COA/lot files; current package has 0 of 65.",
  "Confirm payment-processor written approval for the exact category.",
  "Approve the pricing doctrine and current 15 target member prices in this workbook.",
] as const;

/**
 * The pricing-policy inputs from the Assumptions sheet that bound a price.
 *
 * The sheet marks these EDITABLE, meaning the founder may change them. They are
 * recorded here because the expansion targets were computed from them and
 * `expansionTargetFromMarketReference` reproduces all 39 of those targets
 * exactly, so the method is captured and not just its output.
 */
export const FOUNDER_PRICING_POLICY = {
  /** Never price a research item below this. Avoids commodity positioning. */
  minimumMemberPriceCents: 4900,
  /** The institutional whole-dollar ladder. No .99 endings. */
  roundingStepCents: 500,
  /** Applied over a single market reference for an expansion item. 15%. */
  fallbackUpliftBasisPoints: 1500,
  /** Free shipping starts here. Protects contribution on small orders. */
  freeShippingThresholdCents: 25000,
} as const;

// ---------------------------------------------------------------------------
// Closed vocabularies
// ---------------------------------------------------------------------------

/**
 * How much comparable evidence sits behind a target.
 *
 * "Single reference" is the weakest and the most common: 55 of the 70 rows rest
 * on exactly one observed market listing. It is recorded as its own value rather
 * than folded into "Low" so a single data point can never be read as a range.
 */
export type PeptidePricingConfidence = "High" | "Medium" | "Low" | "Single reference";

export const PEPTIDE_PRICING_CONFIDENCES: readonly PeptidePricingConfidence[] = [
  "High",
  "Medium",
  "Low",
  "Single reference",
] as const;

/**
 * How the priced presentation differs from the presentation the catalog SKU
 * records.
 *
 * "COMPONENT ORDER ONLY" is not a material difference: the same components at
 * the same strengths, listed in a different order. The other three are material,
 * and the workbook counts 11 of them.
 */
export type PeptideIdentityConflict =
  | "NONE"
  | "COMPONENT ORDER ONLY"
  | "STRENGTH"
  | "PACK COUNT"
  | "STRENGTH + PACK COUNT";

export const PEPTIDE_IDENTITY_CONFLICTS: readonly PeptideIdentityConflict[] = [
  "NONE",
  "COMPONENT ORDER ONLY",
  "STRENGTH",
  "PACK COUNT",
  "STRENGTH + PACK COUNT",
] as const;

/** The conflicts that mean the price was set for a materially different item. */
export const MATERIAL_IDENTITY_CONFLICTS: readonly PeptideIdentityConflict[] = [
  "STRENGTH",
  "PACK COUNT",
  "STRENGTH + PACK COUNT",
] as const;

/** The workbook's own activation column. Neither value permits a sale. */
export type WorkbookActivationStatus = "DRAFT / REQUEST ACCESS" | "UNAVAILABLE";

/**
 * What a price target actually is right now.
 *
 * FOUNDER_APPROVED_DRAFT_TARGET is the strongest state anything in this file
 * reaches: the founder authored and recommended the number, and it may be shown
 * to the founder, quoted in an internal report, and reviewed. It may not be
 * charged.
 *
 * ACTIVE_MEMBER_PRICE exists so the block is expressible rather than implicit.
 * `resolvePriceStatus` can only return it when every compliance gate is cleared,
 * and today none is, so no row in this file can hold it. A test proves that.
 */
export type PeptidePriceTargetStatus =
  | "FOUNDER_APPROVED_DRAFT_TARGET"
  | "NO_PRICE_REGULATORY_HOLD"
  | "NO_PRICE_ON_RECORD"
  | "ACTIVE_MEMBER_PRICE";

export const PEPTIDE_PRICE_TARGET_STATUSES: readonly PeptidePriceTargetStatus[] = [
  "FOUNDER_APPROVED_DRAFT_TARGET",
  "NO_PRICE_REGULATORY_HOLD",
  "NO_PRICE_ON_RECORD",
  "ACTIVE_MEMBER_PRICE",
] as const;

// ---------------------------------------------------------------------------
// The three notes the sheet repeats, stated once each
// ---------------------------------------------------------------------------

export const NOTE_CURRENT_SUPPLIER_PRESENTATION =
  "Current Mitch presentation; exact identity and COA must be resolved before activation.";

export const NOTE_SINGLE_REFERENCE_TARGET =
  "Single-reference premium target only; requires real supplier cost, product identity, COA, and founder approval.";

export const NOTE_REGULATORY_HOLD =
  "Regulatory hold. No price recommendation and no customer display.";

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export interface PeptidePriceTarget {
  /** Joins to PeptideVariant.sku in peptide-catalog.ts. Exact, never fuzzy. */
  variantSku: string;
  /** The workbook's product code. Equals PeptideProduct.internalProductCode. */
  workbookProductCode: string;
  /** Equals PeptideProduct.tier. Recorded so a tier change shows up as a mismatch. */
  tier: PeptideTier;

  // --- the prices --------------------------------------------------------
  /**
   * What one comparable vendor lists this exact presentation at, in cents. This
   * is a competitor's shelf price, never ours and never a cost. Null where the
   * harvest found no listing for the presentation.
   */
  marketReferenceCents: number | null;
  /**
   * The founder's own recommended member price, in cents. Present on the 15
   * current SKUs and null everywhere else. This is the number that answers the
   * pricing question, and it is a draft target, not an active price.
   */
  overrideTargetCents: number | null;
  /**
   * The target this row carries: the override where one exists, otherwise the
   * value of the market-reference formula. Null for the 16 regulatory-hold
   * variants, which have no price and must not be given one.
   */
  draftTargetCents: number | null;

  // --- the comparable market evidence, for the 15 only -------------------
  /** Lowest comparable observation, in cents. Null where no benchmark set exists. */
  marketLowCents: number | null;
  /** Median comparable observation, in cents. May be a rounded half cent: see the ledger. */
  marketMedianCents: number | null;
  /** 75th percentile comparable observation, in cents. May be a rounded half cent. */
  marketP75Cents: number | null;
  /** The target's premium over the median, as a decimal fraction. 0.09 is 9% above. */
  targetVsMedian: number | null;
  /** How many comparable listings the median rests on. Null where none. */
  observationCount: number | null;
  confidence: PeptidePricingConfidence;
  /** What was treated as comparable, in the workbook's words. */
  comparableBasis: string | null;
  /** How the comparable set was chosen, including what was excluded. */
  method: string | null;

  // --- what was actually priced -----------------------------------------
  identityConflict: PeptideIdentityConflict;
  /**
   * The supplier-attested presentation the price was set for, verbatim. Where
   * this differs materially from the catalog SKU's strength or pack count, the
   * price is for a different item and must not be applied until the identity
   * gate clears.
   */
  pricedPresentation: string | null;
  /** The founder's stated reason for the number. Never a claim about the product. */
  pricingRationale: string | null;

  // --- status -----------------------------------------------------------
  priceStatus: PeptidePriceTargetStatus;
  currency: "USD";
  audience: "member";
  /**
   * Typed as the literal null, not `string | null`. No effective date can be
   * written on a draft target without editing this interface, which is a
   * reviewed change. There is no placeholder date anywhere in this file.
   */
  effectiveDate: null;
  workbookActivationStatus: WorkbookActivationStatus;
  note: string;
}

/**
 * All 70 variant price targets, in the workbook's sheet order.
 *
 * 54 carry a draft target. 16 carry none, and every one of those 16 is a
 * regulatory-hold variant.
 */
export const PEPTIDE_PRICE_TARGETS: readonly PeptidePriceTarget[] = [
  {
    variantSku: "R360-BPC157_TB500-15MG_15MG-VIAL",
    workbookProductCode: "PEP-001",
    tier: "workbook",
    marketReferenceCents: null,
    overrideTargetCents: 10900,
    draftTargetCents: 10900,
    marketLowCents: 4400,
    marketMedianCents: 10000,
    marketP75Cents: 10375,
    targetVsMedian: 0.090055,
    observationCount: 6,
    confidence: "High",
    comparableBasis: "BPC/TB 5mg/5mg",
    method: "Exact 5mg/5mg or 10mg-total blend comps",
    identityConflict: "STRENGTH",
    pricedPresentation: "5 mg BPC-157 / 5 mg TB-500 (10 mg total per vial); Lyophilised sterile powder; 3 mL borosilicate glass vial with rubber stopper and flip-off seal",
    pricingRationale: "At the high end of exact 5/5mg blend comps; premium evidence-led price without crossing into extreme blend pricing.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL",
    workbookProductCode: "PEP-002",
    tier: "workbook",
    marketReferenceCents: 13499,
    overrideTargetCents: 14900,
    draftTargetCents: 14900,
    marketLowCents: 9900,
    marketMedianCents: 13000,
    marketP75Cents: 18750,
    targetVsMedian: 0.146198,
    observationCount: 8,
    confidence: "High",
    comparableBasis: "GLOW 70mg",
    method: "Exact 50/10/10, 70mg blend comps; upper tail contains premium outliers",
    identityConflict: "COMPONENT ORDER ONLY",
    pricedPresentation: "GHK-Cu 50 mg; BPC-157 10 mg; TB-500 10 mg (70 mg total per vial); Lyophilised sterile powder; 5 mL glass vial",
    pricingRationale: "Above the market median but below the $300 upper-premium outliers; strong flagship price.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL",
    workbookProductCode: "PEP-003",
    tier: "workbook",
    marketReferenceCents: null,
    overrideTargetCents: 19900,
    draftTargetCents: 19900,
    marketLowCents: 10500,
    marketMedianCents: 15100,
    marketP75Cents: 16974,
    targetVsMedian: 0.317924,
    observationCount: 14,
    confidence: "High",
    comparableBasis: "KLOW 80mg",
    method: "Exact 50/10/10/10, 80mg blend comps",
    identityConflict: "STRENGTH",
    pricedPresentation: "GHK-Cu 50 mg; BPC-157 10 mg; TB-500 10 mg; KPV 10 mg (80 mg total); Lyophilised powder; 5 mL glass vial",
    pricingRationale: "Matches the strongest premium analogue (American Peptides $200) while remaining below $300-$315 outliers.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL",
    workbookProductCode: "PEP-004",
    tier: "workbook",
    marketReferenceCents: null,
    overrideTargetCents: 18900,
    draftTargetCents: 18900,
    marketLowCents: 15000,
    marketMedianCents: 18500,
    marketP75Cents: 20000,
    targetVsMedian: 0.021622,
    observationCount: 4,
    confidence: "Low",
    comparableBasis: "TA1 + KPV + LL-37 5/5/5",
    method: "Component-sum and adjacent immune-blend estimates; exact comp set is sparse",
    identityConflict: "NONE",
    pricedPresentation: "Talpha1 5 mg; KPV 5 mg; LL-37 5 mg (15 mg total); Lyophilised powder; 3 mL glass vial",
    pricingRationale: "Rare complex immune blend; priced near component-sum median with low benchmark confidence.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL",
    workbookProductCode: "PEP-005",
    tier: "workbook",
    marketReferenceCents: 9999,
    overrideTargetCents: 10900,
    draftTargetCents: 10900,
    marketLowCents: 3999,
    marketMedianCents: 8000,
    marketP75Cents: 10000,
    targetVsMedian: 0.362500,
    observationCount: 7,
    confidence: "High",
    comparableBasis: "CJC-1295 + Ipamorelin 5/5mg",
    method: "Exact 5mg/5mg blend comps",
    identityConflict: "NONE",
    pricedPresentation: "CJC-1295 5 mg; IpaMorelin 5 mg (10 mg total); Lyophilised powder; 3 mL glass vial",
    pricingRationale: "Premium over a $80 median and near $100 upper cluster; $109 keeps institutional positioning.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-CJC1295_IPAMORELIN-20MG-VIAL",
    workbookProductCode: "PEP-005",
    tier: "workbook",
    marketReferenceCents: 15999,
    overrideTargetCents: null,
    draftTargetCents: 18500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-PT141-10MG-VIAL",
    workbookProductCode: "PEP-006",
    tier: "workbook",
    marketReferenceCents: 8999,
    overrideTargetCents: 6900,
    draftTargetCents: 6900,
    marketLowCents: 3000,
    marketMedianCents: 4500,
    marketP75Cents: 5500,
    targetVsMedian: 0.533333,
    observationCount: 9,
    confidence: "High",
    comparableBasis: "PT-141 10mg",
    method: "Exact 10mg vial comps",
    identityConflict: "NONE",
    pricedPresentation: "10 mg per vial; Lyophilised powder; 3 mL glass vial",
    pricingRationale: "Premium to a $45 median while staying below the $100 extreme outlier.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-TESAMORELIN-10MG-VIAL",
    workbookProductCode: "PEP-007",
    tier: "workbook",
    marketReferenceCents: 7999,
    overrideTargetCents: 7900,
    draftTargetCents: 7900,
    marketLowCents: 3800,
    marketMedianCents: 5500,
    marketP75Cents: 6500,
    targetVsMedian: 0.436364,
    observationCount: 5,
    confidence: "Medium",
    comparableBasis: "Tesamorelin 5mg",
    method: "Exact and adjacent 5mg comps; many premium vendors emphasize 10mg",
    identityConflict: "STRENGTH",
    pricedPresentation: "5 mg per vial; Lyophilised powder; 3 mL glass vial",
    pricingRationale: "For Mitch's 5mg presentation, $79 is premium but still within the adjacent market ceiling.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-TESAMORELIN-20MG-VIAL",
    workbookProductCode: "PEP-007",
    tier: "workbook",
    marketReferenceCents: 12499,
    overrideTargetCents: null,
    draftTargetCents: 14500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-GONADORELIN-5MG-VIAL",
    workbookProductCode: "PEP-008",
    tier: "workbook",
    marketReferenceCents: null,
    overrideTargetCents: 4900,
    draftTargetCents: 4900,
    marketLowCents: 2888,
    marketMedianCents: 3750,
    marketP75Cents: 4000,
    targetVsMedian: 0.306667,
    observationCount: 4,
    confidence: "High",
    comparableBasis: "Gonadorelin 2mg",
    method: "Exact 2mg vial comps",
    identityConflict: "STRENGTH",
    pricedPresentation: "2 mg per vial; Lyophilised powder; 3 mL glass vial",
    pricingRationale: "Premium $49 entry point over a $37.50 median; preserves accessible institutional ladder.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-NAD-500MG-VIAL",
    workbookProductCode: "PEP-009",
    tier: "workbook",
    marketReferenceCents: 8999,
    overrideTargetCents: 5900,
    draftTargetCents: 5900,
    marketLowCents: 1999,
    marketMedianCents: 4500,
    marketP75Cents: 4800,
    targetVsMedian: 0.311111,
    observationCount: 7,
    confidence: "High",
    comparableBasis: "NAD+ 100mg",
    method: "Exact 100mg vial comps",
    identityConflict: "STRENGTH",
    pricedPresentation: "100 mg per vial; Lyophilised powder; 3 mL glass vial",
    pricingRationale: "Premium $59 over a $45 median; one clean price without sale framing.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-NAD-1000MG-VIAL",
    workbookProductCode: "PEP-009",
    tier: "workbook",
    marketReferenceCents: 12999,
    overrideTargetCents: null,
    draftTargetCents: 15000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-MOTSC-10MG-VIAL",
    workbookProductCode: "PEP-010",
    tier: "workbook",
    marketReferenceCents: 8499,
    overrideTargetCents: 6900,
    draftTargetCents: 6900,
    marketLowCents: 4900,
    marketMedianCents: 5500,
    marketP75Cents: 5874,
    targetVsMedian: 0.254660,
    observationCount: 6,
    confidence: "Medium",
    comparableBasis: "MOTS-C 5mg",
    method: "Exact or clearly stated 5mg vial comps",
    identityConflict: "STRENGTH",
    pricedPresentation: "5 mg per vial; Lyophilised powder; 3 mL glass vial",
    pricingRationale: "Premium $69 for 5mg over a ~$55 median; avoids commodity pricing.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-MOTSC-40MG-VIAL",
    workbookProductCode: "PEP-010",
    tier: "workbook",
    marketReferenceCents: 12999,
    overrideTargetCents: null,
    draftTargetCents: 15000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-EPITHALON-10MG-VIAL",
    workbookProductCode: "PEP-011",
    tier: "workbook",
    marketReferenceCents: null,
    overrideTargetCents: 5900,
    draftTargetCents: 5900,
    marketLowCents: 2500,
    marketMedianCents: 4500,
    marketP75Cents: 5500,
    targetVsMedian: 0.311111,
    observationCount: 5,
    confidence: "Medium",
    comparableBasis: "Epithalon 5mg",
    method: "Exact and adjacent 5mg comps; wholesale-only quotes excluded",
    identityConflict: "STRENGTH",
    pricedPresentation: "5 mg per vial; Lyophilised powder; 3 mL glass vial",
    pricingRationale: "Premium $59 for 5mg near the top of observed retail comps.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-EPITHALON-100MG-VIAL",
    workbookProductCode: "PEP-011",
    tier: "workbook",
    marketReferenceCents: 8799,
    overrideTargetCents: null,
    draftTargetCents: 10500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-SS31-10MG-VIAL",
    workbookProductCode: "PEP-012",
    tier: "workbook",
    marketReferenceCents: 5999,
    overrideTargetCents: 10900,
    draftTargetCents: 10900,
    marketLowCents: 7500,
    marketMedianCents: 9950,
    marketP75Cents: 11300,
    targetVsMedian: 0.095477,
    observationCount: 4,
    confidence: "Low",
    comparableBasis: "SS-31 5mg",
    method: "Sparse exact and adjacent comps",
    identityConflict: "STRENGTH",
    pricedPresentation: "5 mg per vial; Lyophilised powder; 3 mL glass vial",
    pricingRationale: "Specialty mitochondrial research item; $109 balances sparse comps and premium positioning.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-SS31-50MG-VIAL",
    workbookProductCode: "PEP-012",
    tier: "workbook",
    marketReferenceCents: 15999,
    overrideTargetCents: null,
    draftTargetCents: 18500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-SLUPP332-250MCGX100-CAP",
    workbookProductCode: "PEP-013",
    tier: "workbook",
    marketReferenceCents: null,
    overrideTargetCents: 12900,
    draftTargetCents: 12900,
    marketLowCents: 10099,
    marketMedianCents: 12200,
    marketP75Cents: 13425,
    targetVsMedian: 0.057377,
    observationCount: 4,
    confidence: "Low",
    comparableBasis: "SLU-PP-332 1.5mg x60",
    method: "Sparse exact and adjacent format comps",
    identityConflict: "STRENGTH + PACK COUNT",
    pricedPresentation: "1500 mcg per capsule; 60 capsules per HDPE bottle with induction seal",
    pricingRationale: "$129 is a premium target for Mitch's 1.5mg x60 presentation; exact format confirmation is mandatory.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-DIHEXA-10MGX60-CAP",
    workbookProductCode: "PEP-014",
    tier: "workbook",
    marketReferenceCents: null,
    overrideTargetCents: 14900,
    draftTargetCents: 14900,
    marketLowCents: 3900,
    marketMedianCents: 14000,
    marketP75Cents: 14400,
    targetVsMedian: 0.064286,
    observationCount: 7,
    confidence: "Medium",
    comparableBasis: "Dihexa 10mg x30 capsules",
    method: "Exact 10mg material plus exact 10mg x30 capsule comps",
    identityConflict: "PACK COUNT",
    pricedPresentation: "10 mg per capsule; 30 capsules per HDPE bottle",
    pricingRationale: "$149 aligns to exact 10mg x30 capsule premium comps.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL",
    workbookProductCode: "PEP-015",
    tier: "workbook",
    marketReferenceCents: null,
    overrideTargetCents: 14900,
    draftTargetCents: 14900,
    marketLowCents: 11000,
    marketMedianCents: 13950,
    marketP75Cents: 15550,
    targetVsMedian: 0.068100,
    observationCount: 4,
    confidence: "Low",
    comparableBasis: "Semax + Selank + DSIP 5/5/5mg",
    method: "Component-sum and adjacent neuro-blend comps; exact comp set is sparse",
    identityConflict: "STRENGTH",
    pricedPresentation: "Semax 5 mg; Selank 5 mg; DSIP 5 mg (15 mg total); Lyophilised powder; 3 mL glass vial",
    pricingRationale: "$149 reflects a rare three-component neuro blend; exact comparison set is sparse.",
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_CURRENT_SUPPLIER_PRESENTATION,
  },
  {
    variantSku: "R360-BPC157-10MG-VIAL",
    workbookProductCode: "PEX-001",
    tier: "expansion",
    marketReferenceCents: 8799,
    overrideTargetCents: null,
    draftTargetCents: 10500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-BPC157-20MG-VIAL",
    workbookProductCode: "PEX-001",
    tier: "expansion",
    marketReferenceCents: 10499,
    overrideTargetCents: null,
    draftTargetCents: 12500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-TB500-10MG-VIAL",
    workbookProductCode: "PEX-002",
    tier: "expansion",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: 11500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-GHKCU-100MG-VIAL",
    workbookProductCode: "PEX-003",
    tier: "expansion",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: 11500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-KPV-10MG-VIAL",
    workbookProductCode: "PEX-004",
    tier: "expansion",
    marketReferenceCents: 7499,
    overrideTargetCents: null,
    draftTargetCents: 9000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-SEMAX-10MG-VIAL",
    workbookProductCode: "PEX-005",
    tier: "expansion",
    marketReferenceCents: 8999,
    overrideTargetCents: null,
    draftTargetCents: 10500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-SEMAX-30MG-VIAL",
    workbookProductCode: "PEX-005",
    tier: "expansion",
    marketReferenceCents: 11999,
    overrideTargetCents: null,
    draftTargetCents: 14000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-SELANK-10MG-VIAL",
    workbookProductCode: "PEX-006",
    tier: "expansion",
    marketReferenceCents: 8999,
    overrideTargetCents: null,
    draftTargetCents: 10500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-DSIP-15MG-VIAL",
    workbookProductCode: "PEX-007",
    tier: "expansion",
    marketReferenceCents: 7999,
    overrideTargetCents: null,
    draftTargetCents: 9500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-THYMOSINALPHA1-10MG-VIAL",
    workbookProductCode: "PEX-008",
    tier: "expansion",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: 11500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-IPAMORELIN-10MG-VIAL",
    workbookProductCode: "PEX-009",
    tier: "expansion",
    marketReferenceCents: 7499,
    overrideTargetCents: null,
    draftTargetCents: 9000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-5AMINO1MQ-5MG-VIAL",
    workbookProductCode: "PEX-010",
    tier: "expansion",
    marketReferenceCents: 8999,
    overrideTargetCents: null,
    draftTargetCents: 10500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-5AMINO1MQ-50MG-VIAL",
    workbookProductCode: "PEX-010",
    tier: "expansion",
    marketReferenceCents: 19999,
    overrideTargetCents: null,
    draftTargetCents: 23000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-ADAMAX-10MG-VIAL",
    workbookProductCode: "PEX-011",
    tier: "expansion",
    marketReferenceCents: 6999,
    overrideTargetCents: null,
    draftTargetCents: 8500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-AOD9604-5MG-VIAL",
    workbookProductCode: "PEX-012",
    tier: "expansion",
    marketReferenceCents: 7999,
    overrideTargetCents: null,
    draftTargetCents: 9500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-AOD9604-10MG-VIAL",
    workbookProductCode: "PEX-012",
    tier: "expansion",
    marketReferenceCents: 10999,
    overrideTargetCents: null,
    draftTargetCents: 13000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-CJC1295DAC-5MG-VIAL",
    workbookProductCode: "PEX-013",
    tier: "expansion",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: 11500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-FOLLISTATIN-1MG-VIAL",
    workbookProductCode: "PEX-014",
    tier: "expansion",
    marketReferenceCents: 13899,
    overrideTargetCents: null,
    draftTargetCents: 16000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-GLUTATHIONE-600MG-VIAL",
    workbookProductCode: "PEX-015",
    tier: "expansion",
    marketReferenceCents: 7999,
    overrideTargetCents: null,
    draftTargetCents: 9500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-GLUTATHIONE-1500MG-VIAL",
    workbookProductCode: "PEX-015",
    tier: "expansion",
    marketReferenceCents: 10999,
    overrideTargetCents: null,
    draftTargetCents: 13000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-HCG-5000IU-VIAL",
    workbookProductCode: "PEX-016",
    tier: "expansion",
    marketReferenceCents: 8799,
    overrideTargetCents: null,
    draftTargetCents: 10500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-IGF1LR3-0P1MG-VIAL",
    workbookProductCode: "PEX-017",
    tier: "expansion",
    marketReferenceCents: 3499,
    overrideTargetCents: null,
    draftTargetCents: 5000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-IGF1LR3-1MG-VIAL",
    workbookProductCode: "PEX-017",
    tier: "expansion",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: 11500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-KISSPEPTIN10-10MG-VIAL",
    workbookProductCode: "PEX-018",
    tier: "expansion",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: 11500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-LCARNITINE-600MG-VIAL",
    workbookProductCode: "PEX-019",
    tier: "expansion",
    marketReferenceCents: 5999,
    overrideTargetCents: null,
    draftTargetCents: 7000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-LIPOC-100MG-VIAL",
    workbookProductCode: "PEX-020",
    tier: "expansion",
    marketReferenceCents: 7999,
    overrideTargetCents: null,
    draftTargetCents: 9500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-MELANOTAN1-10MG-VIAL",
    workbookProductCode: "PEX-021",
    tier: "expansion",
    marketReferenceCents: 6999,
    overrideTargetCents: null,
    draftTargetCents: 8500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-MELANOTAN2-10MG-VIAL",
    workbookProductCode: "PEX-022",
    tier: "expansion",
    marketReferenceCents: 6999,
    overrideTargetCents: null,
    draftTargetCents: 8500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-SERMORELIN-10MG-VIAL",
    workbookProductCode: "PEX-023",
    tier: "expansion",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: 11500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-THYMALIN-10MG-VIAL",
    workbookProductCode: "PEX-024",
    tier: "expansion",
    marketReferenceCents: 6999,
    overrideTargetCents: null,
    draftTargetCents: 8500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-VIP-10MG-VIAL",
    workbookProductCode: "PEX-025",
    tier: "expansion",
    marketReferenceCents: 8499,
    overrideTargetCents: null,
    draftTargetCents: 10000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-SEMAX_SELANK-10MG-VIAL",
    workbookProductCode: "PEX-026",
    tier: "expansion",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: 11500,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-TESAMORELIN_IPAMORELIN-15MG-VIAL",
    workbookProductCode: "PEX-027",
    tier: "expansion",
    marketReferenceCents: 10999,
    overrideTargetCents: null,
    draftTargetCents: 13000,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "FOUNDER_APPROVED_DRAFT_TARGET",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "DRAFT / REQUEST ACCESS",
    note: NOTE_SINGLE_REFERENCE_TARGET,
  },
  {
    variantSku: "R360-SEMAGLUTIDE-10MG-VIAL",
    workbookProductCode: "PRH-001",
    tier: "regulatory_hold",
    marketReferenceCents: 4499,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-SEMAGLUTIDE-15MG-VIAL",
    workbookProductCode: "PRH-001",
    tier: "regulatory_hold",
    marketReferenceCents: 5499,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-SEMAGLUTIDE-20MG-VIAL",
    workbookProductCode: "PRH-001",
    tier: "regulatory_hold",
    marketReferenceCents: 6499,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-SEMAGLUTIDE-30MG-VIAL",
    workbookProductCode: "PRH-001",
    tier: "regulatory_hold",
    marketReferenceCents: 8499,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-SEMAGLUTIDE-50MG-VIAL",
    workbookProductCode: "PRH-001",
    tier: "regulatory_hold",
    marketReferenceCents: 11900,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-TIRZEPATIDE-10MG-VIAL",
    workbookProductCode: "PRH-002",
    tier: "regulatory_hold",
    marketReferenceCents: 6999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-TIRZEPATIDE-20MG-VIAL",
    workbookProductCode: "PRH-002",
    tier: "regulatory_hold",
    marketReferenceCents: 11999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-TIRZEPATIDE-30MG-VIAL",
    workbookProductCode: "PRH-002",
    tier: "regulatory_hold",
    marketReferenceCents: 17499,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-TIRZEPATIDE-60MG-VIAL",
    workbookProductCode: "PRH-002",
    tier: "regulatory_hold",
    marketReferenceCents: 29999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-TIRZEPATIDE-100MG-VIAL",
    workbookProductCode: "PRH-002",
    tier: "regulatory_hold",
    marketReferenceCents: 39999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-TIRZEPATIDE-120MG-VIAL",
    workbookProductCode: "PRH-002",
    tier: "regulatory_hold",
    marketReferenceCents: 43999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-RETATRUTIDE-10MG-VIAL",
    workbookProductCode: "PRH-003",
    tier: "regulatory_hold",
    marketReferenceCents: 7999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-RETATRUTIDE-15MG-VIAL",
    workbookProductCode: "PRH-003",
    tier: "regulatory_hold",
    marketReferenceCents: 9999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-RETATRUTIDE-20MG-VIAL",
    workbookProductCode: "PRH-003",
    tier: "regulatory_hold",
    marketReferenceCents: 12999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-RETATRUTIDE-30MG-VIAL",
    workbookProductCode: "PRH-003",
    tier: "regulatory_hold",
    marketReferenceCents: 18999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
  {
    variantSku: "R360-RETATRUTIDE-50MG-VIAL",
    workbookProductCode: "PRH-003",
    tier: "regulatory_hold",
    marketReferenceCents: 29999,
    overrideTargetCents: null,
    draftTargetCents: null,
    marketLowCents: null,
    marketMedianCents: null,
    marketP75Cents: null,
    targetVsMedian: null,
    observationCount: null,
    confidence: "Single reference",
    comparableBasis: null,
    method: null,
    identityConflict: "NONE",
    pricedPresentation: null,
    pricingRationale: null,
    priceStatus: "NO_PRICE_REGULATORY_HOLD",
    currency: "USD",
    audience: "member",
    effectiveDate: null,
    workbookActivationStatus: "UNAVAILABLE",
    note: NOTE_REGULATORY_HOLD,
  },
];

// ---------------------------------------------------------------------------
// Pinned counts. A silent deletion or addition fails a test.
// ---------------------------------------------------------------------------

/** Every variant in the catalog is priced or explicitly unpriced. None is absent. */
export const PEPTIDE_PRICE_TARGET_COUNT = 70;
/** Variants carrying a draft target. */
export const PRICED_VARIANT_COUNT = 54;
/** Variants carrying no price at all, all 16 of them regulatory hold. */
export const UNPRICED_VARIANT_COUNT = 16;
/** The current SKUs the founder priced by hand. */
export const OVERRIDE_TARGET_COUNT = 15;
/** How many of those 15 were priced for a materially different presentation. */
export const MATERIAL_IDENTITY_CONFLICT_COUNT = 11;

// ---------------------------------------------------------------------------
// The one transformation applied to the source
// ---------------------------------------------------------------------------

export interface SubCentRounding {
  workbookProductCode: string;
  field: "marketLowCents" | "marketMedianCents" | "marketP75Cents";
  /** The exact value the sheet holds, as a string so no precision is lost restating it. */
  sheetValueUsd: string;
  storedCents: number;
}

/**
 * Every market statistic that did not land on a whole cent, with its exact sheet
 * value. Seven of the 45 statistics, all of them medians or 75th percentiles of
 * an even number of listings. Stored rounded half away from zero.
 *
 * No price target appears here, because every price target in the workbook is a
 * whole dollar.
 */
export const SUB_CENT_ROUNDING_LEDGER: readonly SubCentRounding[] = [
  { workbookProductCode: "P001", field: "marketMedianCents", sheetValueUsd: "99.995", storedCents: 10000 },
  { workbookProductCode: "P002", field: "marketMedianCents", sheetValueUsd: "129.995", storedCents: 13000 },
  { workbookProductCode: "P003", field: "marketMedianCents", sheetValueUsd: "150.995", storedCents: 15100 },
  { workbookProductCode: "P003", field: "marketP75Cents", sheetValueUsd: "169.7425", storedCents: 16974 },
  { workbookProductCode: "P005", field: "marketP75Cents", sheetValueUsd: "99.995", storedCents: 10000 },
  { workbookProductCode: "P010", field: "marketMedianCents", sheetValueUsd: "54.995000000000005", storedCents: 5500 },
  { workbookProductCode: "P010", field: "marketP75Cents", sheetValueUsd: "58.7425", storedCents: 5874 },
];

// ---------------------------------------------------------------------------
// The workbook's own formula
// ---------------------------------------------------------------------------

/**
 * The expansion pricing rule from the Assumptions sheet: take the single market
 * reference, add the 15% premium uplift, hold it at or above the minimum member
 * price, then round up to the whole-dollar ladder.
 *
 * This reproduces all 39 formula-derived targets in the workbook exactly, which
 * is why it is here: the method is recorded, not just its results, so a new
 * expansion item can be priced the same way rather than by hand.
 *
 * It is NOT how the 15 current prices were set. Those are founder overrides that
 * weigh the comparable market distribution and the product's positioning, and
 * they all end in a 9 rather than sitting on the $5 ladder.
 */
export function expansionTargetFromMarketReference(marketReferenceCents: number): number {
  if (!Number.isSafeInteger(marketReferenceCents) || marketReferenceCents <= 0) {
    throw new RangeError("marketReferenceCents must be a positive safe integer number of cents");
  }
  const uplifted = Math.ceil(
    (marketReferenceCents * (10000 + FOUNDER_PRICING_POLICY.fallbackUpliftBasisPoints)) / 10000,
  );
  const floored = Math.max(uplifted, FOUNDER_PRICING_POLICY.minimumMemberPriceCents);
  const step = FOUNDER_PRICING_POLICY.roundingStepCents;
  return Math.ceil(floored / step) * step;
}

// ---------------------------------------------------------------------------
// Status, and the block
// ---------------------------------------------------------------------------

/**
 * The single authority on what state one price target is in.
 *
 * It fails closed in this order:
 *
 *   regulatory hold  -> NO_PRICE_REGULATORY_HOLD, unconditionally. A cleared gate
 *                       set does not price a held compound, because the hold is
 *                       about lawfulness, not about evidence quality.
 *   no draft target  -> NO_PRICE_ON_RECORD. An absent price is never a zero.
 *   any gate blocking -> FOUNDER_APPROVED_DRAFT_TARGET. The founder's number,
 *                       reviewable, not chargeable.
 *   every gate clear -> ACTIVE_MEMBER_PRICE.
 *
 * The activation verdict defaults to the real recorded gates, so a caller who
 * forgets to pass one still gets the block rather than an accidental activation.
 */
export function resolvePriceStatus(input: {
  tier: PeptideTier;
  draftTargetCents: number | null;
  activation?: PricingActivationVerdict;
}): PeptidePriceTargetStatus {
  if (input.tier === "regulatory_hold") return "NO_PRICE_REGULATORY_HOLD";
  if (input.draftTargetCents === null) return "NO_PRICE_ON_RECORD";
  const activation = input.activation ?? canActivatePricing();
  if (!activation.allowed) return "FOUNDER_APPROVED_DRAFT_TARGET";
  return "ACTIVE_MEMBER_PRICE";
}

/**
 * The only sanctioned way to ask this module for a number that could be charged
 * or displayed as a member price.
 *
 * It returns null unless every compliance gate is cleared, so today it returns
 * null for all 70 rows. A surface that wants a price and gets null must say
 * something truthful about availability instead of falling back to a zero or to a
 * draft target.
 */
export function memberPriceCentsForDisplay(
  target: PeptidePriceTarget,
  activation: PricingActivationVerdict = canActivatePricing(),
): number | null {
  const status = resolvePriceStatus({
    tier: target.tier,
    draftTargetCents: target.draftTargetCents,
    activation,
  });
  if (status !== "ACTIVE_MEMBER_PRICE") return null;
  return target.draftTargetCents;
}

/**
 * Whether the recorded price was set for the presentation this SKU actually
 * describes. False for the 11 material identity conflicts, where the price
 * belongs to a different strength or pack count and applying it would be
 * inheriting a price across presentations.
 */
export function priceAppliesToRecordedPresentation(target: PeptidePriceTarget): boolean {
  return !(MATERIAL_IDENTITY_CONFLICTS as readonly string[]).includes(target.identityConflict);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function findPriceTarget(variantSku: string): PeptidePriceTarget | null {
  return PEPTIDE_PRICE_TARGETS.find((target) => target.variantSku === variantSku) ?? null;
}

export function priceTargetsForTier(tier: PeptideTier): readonly PeptidePriceTarget[] {
  return PEPTIDE_PRICE_TARGETS.filter((target) => target.tier === tier);
}

/** The 54 variants that carry a draft target. */
export function pricedTargets(): readonly PeptidePriceTarget[] {
  return PEPTIDE_PRICE_TARGETS.filter((target) => target.draftTargetCents !== null);
}

/** The 16 variants that carry no price. Every one is on regulatory hold. */
export function unpricedTargets(): readonly PeptidePriceTarget[] {
  return PEPTIDE_PRICE_TARGETS.filter((target) => target.draftTargetCents === null);
}

/** The 15 current SKUs the founder priced by hand, with their market evidence. */
export function recommendedMemberPriceTargets(): readonly PeptidePriceTarget[] {
  return PEPTIDE_PRICE_TARGETS.filter((target) => target.overrideTargetCents !== null);
}

/** The 11 rows whose price belongs to a materially different presentation. */
export function targetsWithMaterialIdentityConflict(): readonly PeptidePriceTarget[] {
  return PEPTIDE_PRICE_TARGETS.filter((target) => !priceAppliesToRecordedPresentation(target));
}

// ---------------------------------------------------------------------------
// The join, checked at runtime
// ---------------------------------------------------------------------------

export interface CatalogJoinResult {
  matchedSkus: readonly string[];
  /** Priced SKUs with no matching catalog variant. Must always be empty. */
  skusMissingFromCatalog: readonly string[];
  /** Catalog variants with no price row. Must always be empty. */
  skusMissingFromModel: readonly string[];
  /** Rows where a shared field disagrees with the catalog. Must always be empty. */
  fieldMismatches: readonly string[];
}

/**
 * Recompute the join against the live catalog.
 *
 * This is the drift detector. The workbook and the catalog are separate
 * artifacts that happen to agree today, and the day someone renames a SKU,
 * retiers a product, or adds a variant, this stops returning empty lists. A test
 * asserts all three lists are empty, so the drift surfaces as a failing test
 * rather than as a silently unpriced product.
 */
export function joinToCatalog(): CatalogJoinResult {
  const catalogRows = allVariantsWithProduct(PEPTIDE_CATALOG);
  const catalogBySku = new Map(catalogRows.map((row) => [row.variant.sku, row]));

  const matchedSkus: string[] = [];
  const skusMissingFromCatalog: string[] = [];
  const fieldMismatches: string[] = [];

  for (const target of PEPTIDE_PRICE_TARGETS) {
    const row = catalogBySku.get(target.variantSku);
    if (!row) {
      skusMissingFromCatalog.push(target.variantSku);
      continue;
    }
    matchedSkus.push(target.variantSku);
    if (row.product.internalProductCode !== target.workbookProductCode) {
      fieldMismatches.push(
        `${target.variantSku}: product code ${target.workbookProductCode} vs catalog ${row.product.internalProductCode}`,
      );
    }
    if (row.product.tier !== target.tier) {
      fieldMismatches.push(
        `${target.variantSku}: tier ${target.tier} vs catalog ${row.product.tier}`,
      );
    }
  }

  const pricedSkus = new Set(PEPTIDE_PRICE_TARGETS.map((target) => target.variantSku));
  const skusMissingFromModel = catalogRows
    .map((row) => row.variant.sku)
    .filter((sku) => !pricedSkus.has(sku));

  return { matchedSkus, skusMissingFromCatalog, skusMissingFromModel, fieldMismatches };
}
