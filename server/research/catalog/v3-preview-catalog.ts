import type { CatalogProduct, ProductLane } from "@shared/research/catalog";

export const V3_PREVIEW_PRICING_STATE = "public_price_pending" as const;

export type V3PreviewKind =
  | "research_profile"
  | "quantum_profile"
  | "supplement_profile"
  | "program_profile"
  | "pathway_profile"
  | "diagnostic_profile";

export type V3PreviewAvailability =
  | "request_sourcing"
  | "coming_soon"
  | "information_only";

export type V3PreviewProfile = {
  id: string;
  slug: string;
  displayName: string;
  aliases: readonly string[];
  lane: ProductLane;
  kind: V3PreviewKind;
  category: string;
  summary: string;
  keywords: readonly string[];
  availability: V3PreviewAvailability;
  pricingState: typeof V3_PREVIEW_PRICING_STATE;
  approvedPrice: null;
  approvedVariantCount: 0;
  purchasingEnabled: false;
  documentationState: "pending";
  evidenceState: "review_required";
  qualityState: "review_required";
  coaState: "not_published";
  storageState: "review_required";
  memberOnly: true;
  sortOrder: number;
};

type PreviewDefinition = Omit<
  V3PreviewProfile,
  | "id"
  | "pricingState"
  | "approvedPrice"
  | "approvedVariantCount"
  | "purchasingEnabled"
  | "documentationState"
  | "evidenceState"
  | "qualityState"
  | "coaState"
  | "storageState"
  | "memberOnly"
  | "sortOrder"
>;

function profile(
  definition: PreviewDefinition,
  sortOrder: number,
): V3PreviewProfile {
  return Object.freeze({
    ...definition,
    id: `preview-${definition.slug}`,
    pricingState: V3_PREVIEW_PRICING_STATE,
    approvedPrice: null,
    approvedVariantCount: 0,
    purchasingEnabled: false,
    documentationState: "pending",
    evidenceState: "review_required",
    qualityState: "review_required",
    coaState: "not_published",
    storageState: "review_required",
    memberOnly: true,
    sortOrder,
  });
}

const RESEARCH_SUMMARY =
  "A non-clinical Research profile. Exact variants, documentation, and availability remain unavailable until approved Product Control records exist.";
const SUPPLEMENT_SUMMARY =
  "A supplement category under review. Formula, documentation, price, and availability remain unavailable until approved records exist.";
const PROGRAM_SUMMARY =
  "A Research program profile under review. Enrollment and commercial details are not currently available.";
const PATHWAY_SUMMARY =
  "A non-clinical Research pathway profile. It does not provide prescribing, dosing, treatment, or clinical availability.";
const DIAGNOSTIC_SUMMARY =
  "A diagnostics information profile under review. Test contents, provider availability, pricing, and report access are not currently available.";

const definitions: readonly PreviewDefinition[] = [
  {
    slug: "bpc-157-tb-500-research-blend",
    displayName: "BPC-157 + TB-500 Research Blend",
    aliases: ["BPC-157 and TB-500"],
    lane: "research_material",
    kind: "research_profile",
    category: "Research blends",
    summary: RESEARCH_SUMMARY,
    keywords: ["blend", "research material"],
    availability: "request_sourcing",
  },
  {
    slug: "bpc-157-tb-500-ghk-cu-research-blend",
    displayName: "BPC-157 + TB-500 + GHK-Cu Research Blend",
    aliases: ["BPC-157, TB-500 and GHK-Cu"],
    lane: "research_material",
    kind: "research_profile",
    category: "Research blends",
    summary: RESEARCH_SUMMARY,
    keywords: ["blend", "research material"],
    availability: "request_sourcing",
  },
  {
    slug: "klow-research-blend",
    displayName: "KLOW Research Blend",
    aliases: [],
    lane: "research_material",
    kind: "research_profile",
    category: "Research blends",
    summary: RESEARCH_SUMMARY,
    keywords: ["blend", "research material"],
    availability: "request_sourcing",
  },
  {
    slug: "thymosin-alpha-1-kpv-ll-37-research-blend",
    displayName: "Thymosin Alpha-1 + KPV + LL-37 Research Blend",
    aliases: ["TA-1 + KPV + LL-37"],
    lane: "research_material",
    kind: "research_profile",
    category: "Research blends",
    summary: RESEARCH_SUMMARY,
    keywords: ["blend", "research material"],
    availability: "request_sourcing",
  },
  {
    slug: "cjc-1295-ipamorelin-research-blend",
    displayName: "CJC-1295 + Ipamorelin Research Blend",
    aliases: [],
    lane: "research_material",
    kind: "research_profile",
    category: "Research blends",
    summary: RESEARCH_SUMMARY,
    keywords: ["blend", "research material"],
    availability: "request_sourcing",
  },
  {
    slug: "pt-141-research-material",
    displayName: "PT-141 Research Material",
    aliases: ["Bremelanotide Research Material"],
    lane: "research_material",
    kind: "research_profile",
    category: "Research materials",
    summary: RESEARCH_SUMMARY,
    keywords: ["research material"],
    availability: "request_sourcing",
  },
  {
    slug: "tesamorelin-research-material",
    displayName: "Tesamorelin Research Material",
    aliases: [],
    lane: "research_material",
    kind: "research_profile",
    category: "Research materials",
    summary: RESEARCH_SUMMARY,
    keywords: ["research material"],
    availability: "request_sourcing",
  },
  {
    slug: "gonadorelin-research-material",
    displayName: "Gonadorelin Research Material",
    aliases: [],
    lane: "research_material",
    kind: "research_profile",
    category: "Research materials",
    summary: RESEARCH_SUMMARY,
    keywords: ["research material"],
    availability: "request_sourcing",
  },
  {
    slug: "nad-plus-research-material",
    displayName: "NAD+ Research Material",
    aliases: ["NAD Research Material"],
    lane: "research_material",
    kind: "research_profile",
    category: "Research materials",
    summary: RESEARCH_SUMMARY,
    keywords: ["research material"],
    availability: "request_sourcing",
  },
  {
    slug: "mots-c-research-material",
    displayName: "MOTS-C Research Material",
    aliases: [],
    lane: "research_material",
    kind: "research_profile",
    category: "Research materials",
    summary: RESEARCH_SUMMARY,
    keywords: ["research material"],
    availability: "request_sourcing",
  },
  {
    slug: "epitalon-research-material",
    displayName: "Epitalon Research Material",
    aliases: ["Epithalon Research Material"],
    lane: "research_material",
    kind: "research_profile",
    category: "Research materials",
    summary: RESEARCH_SUMMARY,
    keywords: ["research material"],
    availability: "request_sourcing",
  },
  {
    slug: "ss-31-research-material",
    displayName: "SS-31 Research Material",
    aliases: ["Elamipretide Research Material"],
    lane: "research_material",
    kind: "research_profile",
    category: "Research materials",
    summary: RESEARCH_SUMMARY,
    keywords: ["research material"],
    availability: "request_sourcing",
  },
  {
    slug: "slu-pp-332-research-profile",
    displayName: "SLU-PP-332 Research Profile",
    aliases: [],
    lane: "research_material",
    kind: "research_profile",
    category: "Research profiles",
    summary: RESEARCH_SUMMARY,
    keywords: ["research profile"],
    availability: "request_sourcing",
  },
  {
    slug: "dihexa-research-profile",
    displayName: "Dihexa Research Profile",
    aliases: [],
    lane: "research_material",
    kind: "research_profile",
    category: "Research profiles",
    summary: RESEARCH_SUMMARY,
    keywords: ["research profile"],
    availability: "request_sourcing",
  },
  {
    slug: "semax-selank-dsip-research-blend",
    displayName: "Semax + Selank + DSIP Research Blend",
    aliases: [],
    lane: "research_material",
    kind: "research_profile",
    category: "Research blends",
    summary: RESEARCH_SUMMARY,
    keywords: ["blend", "research material"],
    availability: "request_sourcing",
  },
  {
    slug: "quantum-category",
    displayName: "Quantum category",
    aliases: [],
    lane: "quantum",
    kind: "quantum_profile",
    category: "Quantum",
    summary:
      "A Quantum Research profile under review. Exact identity, presentation, documentation, price, and availability are not currently approved.",
    keywords: ["quantum", "research"],
    availability: "coming_soon",
  },
  ...[
    ["foundational-protein", "Foundational Protein"],
    ["creatine-monohydrate", "Creatine Monohydrate"],
    ["omega-3", "Omega-3"],
    ["magnesium-complex", "Magnesium Complex"],
    ["daily-multi", "Daily Multi"],
    ["electrolyte-complex", "Electrolyte Complex"],
    ["fiber-foundation", "Fiber Foundation"],
    ["probiotic-foundation", "Probiotic Foundation"],
    ["vitamin-d-k-foundation", "Vitamin D + K Foundation"],
    ["collagen-foundation", "Collagen Foundation"],
    ["sleep-support-foundation", "Sleep Support Foundation"],
    ["antioxidant-foundation", "Antioxidant Foundation"],
    ["joint-support-foundation", "Joint Support Foundation"],
    ["healthy-aging-foundation", "Healthy Aging Foundation"],
    ["daily-greens-foundation", "Daily Greens Foundation"],
  ].map(
    ([slug, displayName]): PreviewDefinition => ({
      slug,
      displayName,
      aliases: [],
      lane: "supplement",
      kind: "supplement_profile",
      category: "Supplements",
      summary: SUPPLEMENT_SUMMARY,
      keywords: ["supplement", "daily foundation"],
      availability: "coming_soon",
    }),
  ),
  ...[
    ["foundational-performance-program", "Foundational Performance Program"],
    ["recovery-routine-program", "Recovery Routine Program"],
    ["body-composition-program", "Body Composition Program"],
    ["precision-routine-program", "Precision Routine Program"],
  ].map(
    ([slug, displayName]): PreviewDefinition => ({
      slug,
      displayName,
      aliases: [],
      lane: "non_product_program",
      kind: "program_profile",
      category: "Research programs",
      summary: PROGRAM_SUMMARY,
      keywords: ["program", "research"],
      availability: "coming_soon",
    }),
  ),
  ...[
    ["glp-1-research-pathway", "GLP-1 Research Pathway"],
    ["glp-2-research-pathway", "GLP-2 Research Pathway"],
    [
      "next-generation-multi-agonist-research-pathway",
      "Next-Generation Multi-Agonist Research Pathway",
    ],
  ].map(
    ([slug, displayName]): PreviewDefinition => ({
      slug,
      displayName,
      aliases: [],
      lane: "future_clinical",
      kind: "pathway_profile",
      category: "Research pathways",
      summary: PATHWAY_SUMMARY,
      keywords: ["pathway", "research"],
      availability: "information_only",
    }),
  ),
  {
    slug: "superpower-diagnostics",
    displayName: "Superpower Diagnostics",
    aliases: ["Superpower"],
    lane: "non_product_program",
    kind: "diagnostic_profile",
    category: "Diagnostics",
    summary: DIAGNOSTIC_SUMMARY,
    keywords: ["diagnostics", "partner"],
    availability: "coming_soon",
  },
  {
    slug: "biomarker-center",
    displayName: "Biomarker Center",
    aliases: [],
    lane: "non_product_program",
    kind: "diagnostic_profile",
    category: "Diagnostics",
    summary: DIAGNOSTIC_SUMMARY,
    keywords: ["biomarkers", "reports"],
    availability: "coming_soon",
  },
  ...[
    ["comprehensive-biomarker-panel", "Comprehensive Biomarker Panel"],
    ["metabolic-marker-panel", "Metabolic Marker Panel"],
    ["cardiovascular-marker-panel", "Cardiovascular Marker Panel"],
    ["hormone-marker-panel", "Hormone Marker Panel"],
    ["nutrient-status-panel", "Nutrient Status Panel"],
    ["thyroid-marker-panel", "Thyroid Marker Panel"],
    ["recovery-marker-panel", "Recovery Marker Panel"],
    ["inflammation-marker-panel", "Inflammation Marker Panel"],
    ["sleep-circadian-marker-panel", "Sleep and Circadian Marker Panel"],
  ].map(
    ([slug, displayName]): PreviewDefinition => ({
      slug,
      displayName,
      aliases: [],
      lane: "non_product_program",
      kind: "diagnostic_profile",
      category: "Diagnostics",
      summary: DIAGNOSTIC_SUMMARY,
      keywords: ["diagnostics", "information"],
      availability: "coming_soon",
    }),
  ),
];

export const v3PreviewProfiles: readonly V3PreviewProfile[] = Object.freeze(
  definitions.map(profile),
);

/**
 * Preview records are discovery content only. They intentionally project no
 * CatalogProduct rows because CatalogProduct.sku is transactional authority.
 * Product Control remains the sole place an approved product/variant/SKU may
 * enter commerce.
 */
export const v3PreviewCatalogProducts: readonly CatalogProduct[] =
  Object.freeze([]);

export function getV3PreviewProfile(
  slug: string,
): V3PreviewProfile | null {
  const normalized = slug.trim().toLowerCase();
  return (
    v3PreviewProfiles.find((item) => item.slug === normalized) ?? null
  );
}
