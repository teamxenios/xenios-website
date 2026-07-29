// xenios research: the NutriDyn supplement catalog, 20 SKUs.
//
// SERVER SIDE ONLY. This module carries internal fields (wholesale source cost,
// approval notes, source references), so it must not be imported by anything under
// `client/`. Surfaces read `toMemberSupplementCard`, which strips every internal
// field by explicit pick. A test in this directory asserts no client file imports
// this module.
//
// ---------------------------------------------------------------------------
// Where the data comes from
// ---------------------------------------------------------------------------
//
// One workbook, two sheets, and one founder decision matrix:
//
//   - `Top peptides nutridyn (3).xlsx`, sheet "NutriDyn - Top 15 SKUs" (the sheet
//     title uses an en dash, transcribed here with a hyphen). Despite the title it
//     holds TWENTY rows. Each row supplies the product name, the supplier's own
//     item code, the wholesale source cost, the protocol tags, the paired peptide
//     names, and the clinical role sentence.
//   - The same workbook's "Pairing Map" sheet, ten protocol bundles, which supplies
//     `collections` and the pairing text the copy module writes from.
//   - `XENIOS_RESEARCH_FOUNDER_PRICING_DECISION_MATRIX`, rows NUT-001 to NUT-020,
//     which supplies the approved member amount for every row.
//
// Nothing else. No brand site was read, and no field here was inferred from a
// product name.
//
// ---------------------------------------------------------------------------
// The pricing reading, recorded so it can be checked
// ---------------------------------------------------------------------------
//
// The founder approved all 35 proposed matrix rows on 2026-07-29, including the two
// that were added after the decision JSON snapshot was generated (NUT-019
// PeriMenopause Support and NUT-020 Stress Essentials Calm).
//
// The amounts here are the APPROVED MATRIX AMOUNTS, taken row by row, not a
// multiple recomputed in code. The founder's 1.80x instruction was stated for the
// PEPTIDE lane specifically. The supplement rows were modeled at approximately 2.0x
// the wholesale source cost, rounded to a customer amount ending in .99, and it is
// those exact amounts that were approved. A test in this directory pins every row
// to that shape (a ratio between 1.95x and 2.10x, and an amount ending in 99), so a
// transcription slip fails the build rather than reaching a member.
//
// ---------------------------------------------------------------------------
// Why nothing here is directly purchasable
// ---------------------------------------------------------------------------
//
// Global commerce is flag off in production. Enabling direct checkout is a separate
// founder and release step, not a data edit in a catalog file. So this lane resolves
// through `resolvePrivateLaneOfferMode`, which pins the global switch to false and
// makes `DIRECT_PRIVATE_PURCHASE` structurally unreachable here.
//
// Seventeen rows carry a supplier item code and an approved amount, so they resolve
// to APPROVAL_REQUIRED_PURCHASE: a member may ask, and a human approves each order.
// Three rows (NUT-001, NUT-004, NUT-018) show an em dash placeholder in the SKU
// column of the workbook, so the exact supplier item is not identified. Those resolve
// to REQUEST_ACCESS_ONLY and carry the missing input by name. That downgrade is the
// point of the model: an approved price does not identify an item.
//
// ---------------------------------------------------------------------------
// What is deliberately absent
// ---------------------------------------------------------------------------
//
// The workbook states no form factor, no serving size, no servings per container,
// no ingredient panel, and no allergen data for any of the twenty rows. Those fields
// are therefore null with a named missing input, never a plausible guess. Reseller
// authorization from the brand is also not established, and is recorded the same
// way: an approved request still cannot be fulfilled until that authorization exists
// in writing (see `supplementSellable` in `shared/research/catalog.ts`, which stays
// the authority for open sale).

import {
  resolvePrivateLaneOfferMode,
  type CoaEvidenceState,
  type OfferAvailabilityMode,
  type OfferReadinessState,
  type UnresolvedField,
} from "./offer-readiness";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** The closed category set. A record may not carry anything outside this list. */
export const SUPPLEMENT_CATEGORIES = [
  "foundational_health",
  "performance",
  "recovery",
  "sleep",
  "focus",
  "longevity",
  "hormone_metabolic",
  "gut_immune",
  "mens_health",
  "womens_health",
  "mitochondrial",
  "stress_adaptation",
  "protein_nutrition",
  "daily_essentials",
  "beauty",
] as const;

export type SupplementCategory = (typeof SUPPLEMENT_CATEGORIES)[number];

/**
 * Categories any record may take when the workbook describes it as broad or
 * foundational coverage rather than a protocol specialty. This is the only route
 * to a category that the protocol tags do not imply, and it is checked in tests.
 */
export const FOUNDATIONAL_CATEGORIES: readonly SupplementCategory[] = [
  "foundational_health",
  "daily_essentials",
] as const;

/**
 * Which categories each workbook protocol tag can support.
 *
 * The tags are transcribed exactly as the sheet splits them, including the
 * compound label on the beauty row. "IC" appears in the workbook without an
 * expansion, so it supports nothing: an abbreviation we cannot read is recorded,
 * never guessed at.
 */
export const PROTOCOL_TAG_CATEGORY_HINTS: Readonly<
  Record<string, readonly SupplementCategory[]>
> = {
  Mito: ["mitochondrial", "longevity"],
  "GH Axis": ["hormone_metabolic", "longevity"],
  Autoimmune: ["gut_immune"],
  Neuro: ["focus"],
  "Sexual Health": ["hormone_metabolic", "mens_health", "womens_health"],
  Beauty: ["beauty"],
  IC: [],
  "OA/DJD": ["recovery"],
  Performance: ["performance", "recovery"],
  "Weight Loss": ["hormone_metabolic", "gut_immune"],
  Gut: ["gut_immune"],
  Perimenopause: ["womens_health", "hormone_metabolic", "stress_adaptation"],
  "Injury/Recovery": ["recovery"],
  "Beauty / Hair": ["beauty"],
  Skin: ["beauty"],
  Nails: ["beauty"],
  Peri: ["womens_health"],
  "Anti-Aging": ["longevity"],
};

/**
 * The evidence behind a category assignment.
 *
 * Every record must name one, so a category is always traceable to the workbook:
 * either a protocol tag the row carries, or a phrase from the row's own clinical
 * role sentence. There is no third kind, and no unattributed assignment.
 */
export type CategoryBasis =
  | { kind: "protocol_tag"; tag: string }
  | { kind: "clinical_role"; evidence: string };

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export const SUPPLEMENT_SOURCE_REFERENCE =
  'Founder workbook "Top peptides nutridyn (3).xlsx", sheet "NutriDyn - Top 15 SKUs" (20 rows), with member amounts from XENIOS_RESEARCH_FOUNDER_PRICING_DECISION_MATRIX rows NUT-001 to NUT-020.';

export const SUPPLEMENT_APPROVAL_NOTE =
  "Founder-approved 2026-07-29: all 35 matrix rows incl. NUT-019 and NUT-020";

export interface SupplementProduct {
  /** The workbook's exact product name. Never edited, never tidied. */
  canonicalName: string;
  /**
   * The member facing name. Equal to the canonical name today: no member facing
   * rename has been approved, and inventing one would put words on a card that no
   * document supports.
   */
  displayName: string;
  slug: string;
  brand: "NutriDyn";
  /** The row id in the founder pricing decision matrix. */
  matrixDecisionId: string;
  /**
   * Our internal item code. Systematic convention, three digits, lane letter
   * prefix, matching the peptide lane's P001 to P015: N for the supplement lane,
   * Q for Quantum.
   */
  internalSku: string;
  /** The supplier's own code. Null where the workbook shows a placeholder. */
  supplierSkuCode: string | null;
  /** INTERNAL. Wholesale source cost in integer cents. Never leaves the server. */
  wholesaleSourceCostCents: number;
  /** The founder approved member amount in integer cents. */
  approvedMemberAmountCents: number;
  currency: "USD";
  audience: "member";
  category: SupplementCategory;
  categoryBasis: CategoryBasis;
  /** Protocol bundle slugs from the workbook Pairing Map sheet. */
  collections: readonly string[];
  /** Protocol tags exactly as the workbook lists them. */
  protocolTags: readonly string[];
  /** Paired peptide names exactly as the workbook lists them. */
  pairedPeptideNames: readonly string[];
  /** The workbook's clinical role sentence. Internal reference text. */
  clinicalRole: string;
  /**
   * Presentation. Null for every row: the workbook states no form factor, and a
   * form factor is not derivable from a product name.
   */
  formFactor: UnresolvedField;
  availability: OfferAvailabilityMode;
  readiness: OfferReadinessState;
  coaEvidence: CoaEvidenceState;
  /** Written reseller authorization from the brand. Not established for any row. */
  resellerAuthorization: "not_authorized";
  sourceReference: string;
  effectiveDate: null;
  approvalNote: string;
  /** Everything an authoritative document must still supply for this row. */
  missingInputs: readonly string[];
}

// ---------------------------------------------------------------------------
// Protocol bundles (the Pairing Map sheet)
// ---------------------------------------------------------------------------

export interface ProtocolBundle {
  slug: string;
  /** The workbook's own bundle name. */
  workbookName: string;
  /**
   * The member facing label. Plain language, and deliberately not a condition
   * name: a bundle label is navigation, never a statement about a person.
   */
  memberLabel: string;
  peptideNames: readonly string[];
  supplementNames: readonly string[];
  /** The workbook's pairing logic sentence. Internal reference text. */
  pairingLogic: string;
}

export const PROTOCOL_BUNDLES: readonly ProtocolBundle[] = [
  {
    slug: "injury-recovery-oa-djd",
    workbookName: "Injury / Recovery (OA/DJD)",
    memberLabel: "Recovery and joint support",
    peptideNames: [
      "BPC-157 + TB-500 Blend (15mg/15mg)",
      "KLOW Blend",
      "BPC-157+TB-500+GHK-CU Blend",
    ],
    supplementNames: ["Chondro Jointaide", "Collagen Renew", "PRM Resolve"],
    pairingLogic:
      "Peptides drive cellular repair; supps provide structural substrate (glucosamine, collagen) + active inflammation resolution via SPMs",
  },
  {
    slug: "mitochondrial-longevity",
    workbookName: "Mitochondrial / Longevity",
    memberLabel: "Mitochondrial and longevity",
    peptideNames: ["MOTS-C 10mg", "NAD+ 500mg", "Epithalon 10mg", "SS-31 10mg"],
    supplementNames: ["Longevity Essentials NAD+", "Mito Recharge", "Fruits & Greens"],
    pairingLogic:
      "Peptides activate AMPK + mito biogenesis; supps provide NR, CoQ10, cofactors + phytonutrient antioxidant coverage",
  },
  {
    slug: "gh-axis-anti-aging",
    workbookName: "GH Axis / Anti-Aging",
    memberLabel: "Aging well",
    peptideNames: ["CJC-1295 + Ipamorelin Blend", "Tesamorelin 10mg"],
    supplementNames: [
      "Stress Essentials Calm",
      "Collagen Renew",
      "Longevity Essentials NAD+",
    ],
    pairingLogic:
      "GH secretagogues drive IGF-1; calm adaptogenic support reduces cortisol interference with GH pulsatility; collagen supports tissue gains",
  },
  {
    slug: "neurological-cognitive",
    workbookName: "Neurological / Cognitive",
    memberLabel: "Focus and cognition",
    peptideNames: [
      "SS-31 10mg",
      "Dihexa capsules",
      "Semax+Selank+DSIP Blend",
      "NAD+ 500mg",
    ],
    supplementNames: ["Magtein (Mg L-Threonate)", "Uplift+", "Brain Restore"],
    pairingLogic:
      "SS-31 repairs mito membranes; Dihexa drives synaptogenesis; Magtein elevates brain Mg; Uplift+ supports mood + neurological tone",
  },
  {
    slug: "autoimmune-inflammation",
    workbookName: "Autoimmune / Inflammation",
    memberLabel: "Immune balance and gut",
    peptideNames: [
      "Thymosin A1 + KPV + LL-37 Blend",
      "BPC-157+TB-500 Blend (15mg)",
    ],
    supplementNames: ["Inflam-Eze", "PRM Resolve", "GI Defend", "UltraBiotic Prebiotic"],
    pairingLogic:
      "Peptides modulate immune signaling; supps resolve inflammation and restore gut-immune barrier",
  },
  {
    slug: "oral-weight-loss",
    workbookName: "Oral Weight Loss (No Injections)",
    memberLabel: "Oral weight support",
    peptideNames: ["SLU-PP-332 capsules", "NAD+ 500mg"],
    supplementNames: [
      "Fruits & Greens",
      "UltraBiotic Akkermansia Plus",
      "UltraBiotic Prebiotic",
    ],
    pairingLogic:
      "SLUPP modulates appetite/neuropeptide signaling; Akkermansia Plus supports gut-metabolic axis; F&G covers micronutrient gaps",
  },
  {
    slug: "sexual-health-wellness",
    workbookName: "Sexual Health / Wellness",
    memberLabel: "Intimacy and vitality",
    peptideNames: ["PT-141 10mg", "Gonadorelin 5mg"],
    supplementNames: ["Omega Pure EPA-DHA 2400", "Uplift+"],
    pairingLogic:
      "PT-141 addresses central arousal; Gonadorelin restores HPG axis; Omega-3 supports vascular + hormonal health; Uplift+ enhances mood + libido tone",
  },
  {
    slug: "perimenopause-hormonal",
    workbookName: "Perimenopause / Hormonal",
    memberLabel: "Hormonal support for women",
    peptideNames: [
      "Gonadorelin 5mg",
      "Tesamorelin 10mg",
      "BPC-157+TB-500+GHK-CU Blend",
    ],
    supplementNames: [
      "Stress Essentials Balance",
      "PeriMenopause Support",
      "Beauty Essentials Rejuvenate+",
    ],
    pairingLogic:
      "HPO axis restoration peptides + GH support; Peri Support addresses hormonal balance; Rejuvenate+ supports skin + hair changes in perimenopause",
  },
  {
    slug: "performance-athletic",
    workbookName: "Performance / Athletic",
    memberLabel: "Performance and training",
    peptideNames: ["CJC+Ipamorelin Blend", "BPC-157+TB-500 Blend (15mg)"],
    supplementNames: ["Hydrate", "Core Aminos (BCAA)", "Collagen Renew"],
    pairingLogic:
      "GH secretagogues drive recovery + lean mass; Hydrate replenishes electrolytes; Core Aminos preserves lean mass and drives MPS",
  },
  {
    slug: "beauty-hair-skin-nails",
    workbookName: "Beauty / Hair, Skin, Nails",
    memberLabel: "Hair, skin, and nails",
    peptideNames: ["BPC-157+TB-500+GHK-CU Blend"],
    supplementNames: [
      "Beauty Essentials Rejuvenate+",
      "Annatto Pro 125",
      "Omega Pure EPA-DHA 2400",
    ],
    pairingLogic:
      "GHK-Cu stimulates collagen + angiogenesis; Rejuvenate+ amplifies beauty outcomes; Annatto tocotrienols + Omega-3 protect skin cell integrity",
  },
];

/**
 * Bundle members named in the Pairing Map that have no row in the SKU sheet and no
 * approved amount, so they cannot be listed.
 *
 * "Core Aminos (BCAA)" is named in the performance bundle only. It is recorded here
 * rather than dropped, because a silently shortened bundle would misstate the
 * workbook. Adding it needs its own SKU row and its own approved amount.
 */
export const PAIRING_MAP_MEMBERS_NOT_IN_CATALOG: readonly string[] = [
  "Core Aminos (BCAA)",
];

/**
 * The Pairing Map lists "Beauty Essentials Rejuvenate+" where the SKU sheet lists
 * "Rejuvenate+" and "Magtein (Mg L-Threonate)" where the SKU sheet lists
 * "Magtein (Magnesium L-Threonate)". These are the same rows under two spellings,
 * so the mapping is recorded rather than assumed.
 */
export const PAIRING_MAP_NAME_ALIASES: Readonly<Record<string, string>> = {
  "Beauty Essentials Rejuvenate+": "Rejuvenate+",
  "Magtein (Mg L-Threonate)": "Magtein (Magnesium L-Threonate)",
  "Inflam-Eze": "Inflam-Eze (30-serving)",
  "Collagen Renew": "Collagen Renew (Dynamic Multi)",
};

// ---------------------------------------------------------------------------
// Shared missing inputs
// ---------------------------------------------------------------------------

/** What no row in the workbook supplies, so every row is waiting on it. */
const UNIVERSAL_MISSING_INPUTS: readonly string[] = [
  "Supplier specification sheet: form factor, serving size, servings per container",
  "Supplier ingredient and allergen panel",
  "Written reseller authorization from the brand",
  "Current supplier price confirmation and minimum advertised price policy",
];

const FORM_FACTOR_MISSING_INPUTS: readonly string[] = [
  "Supplier specification sheet stating the presentation (for example capsule, powder, softgel)",
];

const MISSING_SUPPLIER_CODE_INPUT =
  "Supplier item code: the workbook SKU column shows a placeholder for this row";

// ---------------------------------------------------------------------------
// The twenty rows
// ---------------------------------------------------------------------------

interface SupplementSeed {
  matrixDecisionId: string;
  canonicalName: string;
  slug: string;
  supplierSkuCode: string | null;
  wholesaleSourceCostCents: number;
  approvedMemberAmountCents: number;
  category: SupplementCategory;
  categoryBasis: CategoryBasis;
  collections: readonly string[];
  protocolTags: readonly string[];
  pairedPeptideNames: readonly string[];
  clinicalRole: string;
}

const SEEDS: readonly SupplementSeed[] = [
  {
    matrixDecisionId: "NUT-001",
    canonicalName: "Longevity Essentials NAD+",
    slug: "longevity-essentials-nad-plus",
    supplierSkuCode: null,
    wholesaleSourceCostCents: 2620,
    approvedMemberAmountCents: 5299,
    category: "longevity",
    categoryBasis: { kind: "protocol_tag", tag: "Mito" },
    collections: ["mitochondrial-longevity", "gh-axis-anti-aging"],
    protocolTags: ["Mito", "GH Axis", "Autoimmune"],
    pairedPeptideNames: ["NAD+ 500mg", "MOTS-C", "Tesamorelin", "SS-31"],
    clinicalRole: "NAD+ restoration, mitochondrial energy, sirtuin activation",
  },
  {
    matrixDecisionId: "NUT-002",
    canonicalName: "Magtein (Magnesium L-Threonate)",
    slug: "magtein-magnesium-l-threonate",
    supplierSkuCode: "R227",
    wholesaleSourceCostCents: 3550,
    approvedMemberAmountCents: 7099,
    category: "focus",
    categoryBasis: { kind: "protocol_tag", tag: "Neuro" },
    collections: ["neurological-cognitive"],
    protocolTags: ["Neuro", "Mito"],
    pairedPeptideNames: ["Dihexa capsules", "SS-31", "Semax+Selank+DSIP"],
    clinicalRole: "BBB-crossing Mg2+; synaptic density, memory, neuroprotection",
  },
  {
    matrixDecisionId: "NUT-003",
    canonicalName: "Mito Recharge",
    slug: "mito-recharge",
    supplierSkuCode: "R167",
    wholesaleSourceCostCents: 3450,
    approvedMemberAmountCents: 6899,
    category: "mitochondrial",
    categoryBasis: { kind: "protocol_tag", tag: "Mito" },
    collections: ["mitochondrial-longevity"],
    protocolTags: ["Mito"],
    pairedPeptideNames: ["MOTS-C", "SS-31", "5-Amino-1MQ"],
    clinicalRole: "CoQ10, PQQ, acetyl-carnitine - mitochondrial substrate support",
  },
  {
    matrixDecisionId: "NUT-004",
    canonicalName: "Uplift+",
    slug: "uplift-plus",
    supplierSkuCode: null,
    wholesaleSourceCostCents: 3650,
    approvedMemberAmountCents: 7299,
    category: "focus",
    categoryBasis: { kind: "protocol_tag", tag: "Neuro" },
    collections: ["neurological-cognitive", "sexual-health-wellness"],
    protocolTags: ["Neuro", "Sexual Health"],
    pairedPeptideNames: [
      "Dihexa",
      "Semax+Selank+DSIP",
      "PT-141",
      "Gonadorelin",
    ],
    clinicalRole: "Mood elevation, neurological tone, libido + energy support",
  },
  {
    matrixDecisionId: "NUT-005",
    canonicalName: "Omega Pure EPA-DHA 2400",
    slug: "omega-pure-epa-dha-2400",
    supplierSkuCode: "R817E",
    wholesaleSourceCostCents: 2875,
    approvedMemberAmountCents: 5799,
    category: "foundational_health",
    categoryBasis: { kind: "clinical_role", evidence: "vascular + hormonal health" },
    collections: ["sexual-health-wellness", "beauty-hair-skin-nails"],
    protocolTags: ["Sexual Health", "Beauty", "IC"],
    pairedPeptideNames: ["PT-141", "Gonadorelin", "BPC-157+TB-500+GHK-CU"],
    clinicalRole: "Vascular + hormonal health, neuronal membrane integrity",
  },
  {
    matrixDecisionId: "NUT-006",
    canonicalName: "Chondro Jointaide",
    slug: "chondro-jointaide",
    supplierSkuCode: "R149C",
    wholesaleSourceCostCents: 5975,
    approvedMemberAmountCents: 11999,
    category: "recovery",
    categoryBasis: { kind: "protocol_tag", tag: "OA/DJD" },
    collections: ["injury-recovery-oa-djd"],
    protocolTags: ["OA/DJD"],
    pairedPeptideNames: ["KLOW Blend", "BPC-157+TB-500+GHK-CU Blend"],
    clinicalRole:
      "Glucosamine, chondroitin, MSM - cartilage structure + joint repair",
  },
  {
    matrixDecisionId: "NUT-007",
    canonicalName: "Collagen Renew (Dynamic Multi)",
    slug: "collagen-renew-dynamic-multi",
    supplierSkuCode: "R190",
    wholesaleSourceCostCents: 4695,
    approvedMemberAmountCents: 9399,
    category: "recovery",
    categoryBasis: { kind: "protocol_tag", tag: "OA/DJD" },
    collections: [
      "injury-recovery-oa-djd",
      "gh-axis-anti-aging",
      "performance-athletic",
    ],
    protocolTags: ["OA/DJD", "Performance", "Beauty"],
    pairedPeptideNames: ["BPC-157+TB-500+GHK-CU", "CJC+Ipa Blend"],
    clinicalRole:
      "Collagen peptides, vitamin C, hyaluronic acid - connective tissue",
  },
  {
    matrixDecisionId: "NUT-008",
    canonicalName: "Inflam-Eze (30-serving)",
    slug: "inflam-eze",
    supplierSkuCode: "R266L",
    wholesaleSourceCostCents: 6550,
    approvedMemberAmountCents: 13099,
    category: "gut_immune",
    categoryBasis: { kind: "protocol_tag", tag: "Autoimmune" },
    collections: ["autoimmune-inflammation"],
    protocolTags: ["Autoimmune"],
    pairedPeptideNames: [
      "TA1+KPV+LL-37 Blend",
      "KLOW",
      "BPC-157+TB-500",
    ],
    clinicalRole:
      "Curcumin, boswellia, bromelain - systemic inflammation resolution",
  },
  {
    matrixDecisionId: "NUT-009",
    canonicalName: "UltraBiotic Prebiotic",
    slug: "ultrabiotic-prebiotic",
    supplierSkuCode: "R222",
    wholesaleSourceCostCents: 4295,
    approvedMemberAmountCents: 8599,
    category: "gut_immune",
    categoryBasis: { kind: "protocol_tag", tag: "Autoimmune" },
    collections: ["autoimmune-inflammation", "oral-weight-loss"],
    protocolTags: ["Autoimmune", "Weight Loss"],
    pairedPeptideNames: ["BPC-157+TB-500 Blend", "TA1+KPV+LL-37"],
    clinicalRole:
      "Microbiome balance, gut barrier integrity, immune modulation",
  },
  {
    matrixDecisionId: "NUT-010",
    canonicalName: "GI Defend",
    slug: "gi-defend",
    supplierSkuCode: "R191",
    wholesaleSourceCostCents: 4325,
    approvedMemberAmountCents: 8699,
    category: "gut_immune",
    categoryBasis: { kind: "protocol_tag", tag: "Gut" },
    collections: ["autoimmune-inflammation"],
    protocolTags: ["Autoimmune", "Gut"],
    pairedPeptideNames: ["BPC-157+TB-500 Blend", "TA1+KPV+LL-37 Blend"],
    clinicalRole: "Glutamine, zinc carnosine, DGL - gut mucosal repair",
  },
  {
    matrixDecisionId: "NUT-011",
    canonicalName: "Hydrate",
    slug: "hydrate",
    supplierSkuCode: "R982",
    wholesaleSourceCostCents: 1575,
    approvedMemberAmountCents: 3199,
    category: "performance",
    categoryBasis: { kind: "protocol_tag", tag: "Performance" },
    collections: ["performance-athletic"],
    protocolTags: ["Performance"],
    pairedPeptideNames: ["CJC+Ipamorelin Blend", "BPC-157+TB-500 Blend"],
    clinicalRole: "Comprehensive electrolyte balance, cellular hydration",
  },
  {
    matrixDecisionId: "NUT-012",
    canonicalName: "Stress Essentials Balance",
    slug: "stress-essentials-balance",
    supplierSkuCode: "R123L",
    wholesaleSourceCostCents: 3495,
    approvedMemberAmountCents: 6999,
    category: "stress_adaptation",
    categoryBasis: { kind: "protocol_tag", tag: "Perimenopause" },
    collections: ["perimenopause-hormonal"],
    protocolTags: ["Perimenopause"],
    pairedPeptideNames: [
      "Gonadorelin",
      "Tesamorelin",
      "BPC-157+TB-500+GHK-CU",
    ],
    clinicalRole:
      "Adaptogenic stress resilience, HPA axis + cortisol balance",
  },
  {
    matrixDecisionId: "NUT-013",
    canonicalName: "PRM Resolve",
    slug: "prm-resolve",
    supplierSkuCode: "R848",
    wholesaleSourceCostCents: 4095,
    approvedMemberAmountCents: 8199,
    category: "recovery",
    categoryBasis: { kind: "protocol_tag", tag: "Injury/Recovery" },
    collections: ["injury-recovery-oa-djd", "autoimmune-inflammation"],
    protocolTags: ["Autoimmune", "Injury/Recovery"],
    pairedPeptideNames: [
      "TA1+KPV+LL-37 Blend",
      "BPC-157+TB-500 Blends",
      "KLOW",
    ],
    clinicalRole:
      "Specialized pro-resolving mediators (SPMs) - active immune + injury resolution",
  },
  {
    matrixDecisionId: "NUT-014",
    canonicalName: "Fruits & Greens",
    slug: "fruits-and-greens",
    supplierSkuCode: "R305-GFSK",
    wholesaleSourceCostCents: 2720,
    approvedMemberAmountCents: 5499,
    category: "daily_essentials",
    categoryBasis: {
      kind: "clinical_role",
      evidence: "micronutrient/antioxidant insurance",
    },
    collections: ["mitochondrial-longevity", "oral-weight-loss"],
    protocolTags: ["Mito", "Weight Loss"],
    pairedPeptideNames: [
      "SLU-PP-332 capsules",
      "MOTS-C",
      "NAD+",
      "Epithalon",
    ],
    clinicalRole:
      "20+ servings of phytonutrients; micronutrient/antioxidant insurance",
  },
  {
    matrixDecisionId: "NUT-015",
    canonicalName: "Brain Restore",
    slug: "brain-restore",
    supplierSkuCode: "R152",
    wholesaleSourceCostCents: 6750,
    approvedMemberAmountCents: 13499,
    category: "focus",
    categoryBasis: { kind: "protocol_tag", tag: "Neuro" },
    collections: ["neurological-cognitive"],
    protocolTags: ["Neuro"],
    pairedPeptideNames: ["Dihexa capsules", "SS-31", "Semax+Selank+DSIP"],
    clinicalRole: "ALCAR, Alpha-GPC, B-vitamins - neurotransmitter precursors",
  },
  {
    matrixDecisionId: "NUT-016",
    canonicalName: "UltraBiotic Akkermansia Plus",
    slug: "ultrabiotic-akkermansia-plus",
    supplierSkuCode: "R196",
    wholesaleSourceCostCents: 3150,
    approvedMemberAmountCents: 6299,
    category: "gut_immune",
    categoryBasis: { kind: "protocol_tag", tag: "Weight Loss" },
    collections: ["oral-weight-loss"],
    protocolTags: ["Weight Loss"],
    pairedPeptideNames: ["SLU-PP-332 capsules", "MOTS-C"],
    clinicalRole:
      "Akkermansia muciniphila - gut-metabolic axis, GLP-1 signaling support",
  },
  {
    matrixDecisionId: "NUT-017",
    canonicalName: "Annatto Pro 125",
    slug: "annatto-pro-125",
    supplierSkuCode: "R271L",
    wholesaleSourceCostCents: 2988,
    approvedMemberAmountCents: 5999,
    category: "beauty",
    categoryBasis: { kind: "protocol_tag", tag: "Beauty" },
    collections: ["beauty-hair-skin-nails"],
    protocolTags: ["Beauty", "Neuro"],
    pairedPeptideNames: [
      "BPC-157+TB-500+GHK-CU Blend",
      "SS-31",
      "Dihexa",
    ],
    clinicalRole:
      "DeltaGold tocotrienols - 50x antioxidant potency vs tocopherols",
  },
  {
    matrixDecisionId: "NUT-018",
    canonicalName: "Rejuvenate+",
    slug: "rejuvenate-plus",
    supplierSkuCode: null,
    wholesaleSourceCostCents: 3795,
    approvedMemberAmountCents: 7599,
    category: "beauty",
    categoryBasis: { kind: "protocol_tag", tag: "Beauty / Hair" },
    collections: ["perimenopause-hormonal", "beauty-hair-skin-nails"],
    protocolTags: ["Beauty / Hair", "Skin", "Nails", "Peri"],
    pairedPeptideNames: [
      "GHK-CU (in blends)",
      "BPC-157+TB-500+GHK-CU",
    ],
    clinicalRole:
      "Collagen precursors, biotin, keratin, antioxidants - skin/hair/nails",
  },
  {
    matrixDecisionId: "NUT-019",
    canonicalName: "PeriMenopause Support",
    slug: "perimenopause-support",
    supplierSkuCode: "R199",
    wholesaleSourceCostCents: 1725,
    approvedMemberAmountCents: 3499,
    category: "womens_health",
    categoryBasis: { kind: "protocol_tag", tag: "Perimenopause" },
    collections: ["perimenopause-hormonal"],
    protocolTags: ["Perimenopause"],
    pairedPeptideNames: [
      "Gonadorelin",
      "Tesamorelin",
      "BPC-157+TB-500+GHK-CU",
    ],
    clinicalRole: "Hormonal balance, phytoestrogens, cycle regulation",
  },
  {
    matrixDecisionId: "NUT-020",
    canonicalName: "Stress Essentials Calm",
    slug: "stress-essentials-calm",
    supplierSkuCode: "R123C",
    wholesaleSourceCostCents: 3495,
    approvedMemberAmountCents: 6999,
    category: "stress_adaptation",
    categoryBasis: { kind: "clinical_role", evidence: "calming adaptogens" },
    collections: ["gh-axis-anti-aging"],
    protocolTags: ["GH Axis", "Anti-Aging"],
    pairedPeptideNames: ["CJC+Ipamorelin Blend", "Tesamorelin"],
    clinicalRole:
      "Calming adaptogens - reduces cortisol interference with GH pulsatility",
  },
];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** The internal sku for a supplement row: N plus the matrix row number. */
function internalSkuFor(matrixDecisionId: string): string {
  return `N${matrixDecisionId.slice(-3)}`;
}

function buildProduct(seed: SupplementSeed): SupplementProduct {
  const missingInputs = [
    ...UNIVERSAL_MISSING_INPUTS,
    ...(seed.supplierSkuCode === null ? [MISSING_SUPPLIER_CODE_INPUT] : []),
  ];

  // A finished consumer good is gated by supplier authorization and label
  // documentation, not by a lot certificate of analysis, so lab evidence is not
  // applicable rather than missing. It is never a route to a stronger mode: the
  // lane pins the global commerce switch off regardless.
  const coaEvidence: CoaEvidenceState = "NOT_APPLICABLE";

  const availability = resolvePrivateLaneOfferMode({
    lane: "supplement",
    approvedMemberAmountCents: seed.approvedMemberAmountCents,
    supplierSkuCode: seed.supplierSkuCode,
    internalVariantSku: null,
    coaEvidence,
    unavailable: false,
  });

  const readiness: OfferReadinessState =
    availability === "APPROVAL_REQUIRED_PURCHASE"
      ? "APPROVED_FOR_PRIVATE_OFFER"
      : "NEEDS_SUPPLIER_DOCUMENTATION";

  return {
    canonicalName: seed.canonicalName,
    displayName: seed.canonicalName,
    slug: seed.slug,
    brand: "NutriDyn",
    matrixDecisionId: seed.matrixDecisionId,
    internalSku: internalSkuFor(seed.matrixDecisionId),
    supplierSkuCode: seed.supplierSkuCode,
    wholesaleSourceCostCents: seed.wholesaleSourceCostCents,
    approvedMemberAmountCents: seed.approvedMemberAmountCents,
    currency: "USD",
    audience: "member",
    category: seed.category,
    categoryBasis: seed.categoryBasis,
    collections: seed.collections,
    protocolTags: seed.protocolTags,
    pairedPeptideNames: seed.pairedPeptideNames,
    clinicalRole: seed.clinicalRole,
    formFactor: { value: null, missingInputs: FORM_FACTOR_MISSING_INPUTS },
    availability,
    readiness,
    coaEvidence,
    resellerAuthorization: "not_authorized",
    sourceReference: SUPPLEMENT_SOURCE_REFERENCE,
    effectiveDate: null,
    approvalNote: SUPPLEMENT_APPROVAL_NOTE,
    missingInputs,
  };
}

export const SUPPLEMENT_CATALOG: readonly SupplementProduct[] = SEEDS.map(buildProduct);

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function findSupplementBySlug(slug: string): SupplementProduct | undefined {
  return SUPPLEMENT_CATALOG.find((product) => product.slug === slug);
}

export function findSupplementByCanonicalName(name: string): SupplementProduct | undefined {
  const resolved = PAIRING_MAP_NAME_ALIASES[name] ?? name;
  return SUPPLEMENT_CATALOG.find((product) => product.canonicalName === resolved);
}

export function supplementsInCollection(slug: string): readonly SupplementProduct[] {
  return SUPPLEMENT_CATALOG.filter((product) => product.collections.includes(slug));
}

export function supplementsInCategory(
  category: SupplementCategory,
): readonly SupplementProduct[] {
  return SUPPLEMENT_CATALOG.filter((product) => product.category === category);
}

// ---------------------------------------------------------------------------
// The member safe projection
// ---------------------------------------------------------------------------

/**
 * The only supplement fields that may reach a browser.
 *
 * Built by explicit pick, never by spreading the record, so a field added to
 * `SupplementProduct` cannot leak here by default. Wholesale cost, approval note,
 * source reference, reseller state, and the missing input list all stay internal.
 */
export interface MemberSupplementCard {
  slug: string;
  displayName: string;
  brand: string;
  category: SupplementCategory;
  collections: readonly string[];
  availability: OfferAvailabilityMode;
  /** Present only where the mode permits an amount. Never zero, never a default. */
  amountCents: number | null;
  currency: "USD";
}

export function toMemberSupplementCard(product: SupplementProduct): MemberSupplementCard {
  const showAmount =
    product.availability === "APPROVAL_REQUIRED_PURCHASE" ||
    product.availability === "DIRECT_PRIVATE_PURCHASE";
  return {
    slug: product.slug,
    displayName: product.displayName,
    brand: product.brand,
    category: product.category,
    collections: product.collections,
    availability: product.availability,
    amountCents: showAmount ? product.approvedMemberAmountCents : null,
    currency: product.currency,
  };
}
