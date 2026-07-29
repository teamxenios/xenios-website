import type { CatalogProduct, ProductLane } from "@shared/research/catalog";
import {
  MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY,
  MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION,
  MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY,
  MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CATEGORY,
  MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CLASSIFICATION,
  type MemberCatalog,
  type MemberCatalogCard,
  type MemberProductDetail,
} from "@shared/research/member-catalog";

export const V3_PREVIEW_PROFILE_COUNT = 49;

export type V3PreviewProfileKind =
  | "research_material"
  | "research_blend"
  | "supplement"
  | "quantum"
  | "pathway"
  | "program";

export type V3PreviewProfile = {
  previewId: string;
  slug: string;
  displayName: string;
  aliases: readonly string[];
  kind: V3PreviewProfileKind;
  lane: ProductLane;
  category: string;
  classification: string;
  summary: string;
  pricingState: "public_price_pending";
  approvedPrice: null;
  approvedVariantCount: 0;
  purchasingEnabled: false;
  documentationState: "pending";
  availabilityState: "coming_soon" | "request_sourcing" | "catalog_only";
};

type Identity = {
  slug: string;
  displayName: string;
  aliases?: readonly string[];
};

const RESEARCH_BLEND_IDENTITIES: readonly Identity[] = [
  { slug: "bpc-157-tb-500", displayName: "BPC-157 + TB-500 Research Blend" },
  {
    slug: "bpc-157-tb-500-ghk-cu",
    displayName: "BPC-157 + TB-500 + GHK-Cu Research Blend",
  },
  { slug: "cjc-1295-ipamorelin", displayName: "CJC-1295 + Ipamorelin Research Blend" },
  { slug: "klow", displayName: "KLOW Research Blend" },
  { slug: "semax-selank-dsip", displayName: "Semax + Selank + DSIP Research Blend" },
  {
    slug: "thymosin-alpha-1-kpv-ll-37",
    displayName: "Thymosin Alpha-1 + KPV + LL-37 Research Blend",
  },
] as const;

const RESEARCH_MATERIAL_IDENTITIES: readonly Identity[] = [
  { slug: "bpc-157", displayName: "BPC-157 Research Material" },
  { slug: "cjc-1295", displayName: "CJC-1295 Research Material" },
  { slug: "dihexa", displayName: "Dihexa Research Material" },
  { slug: "dsip", displayName: "DSIP Research Material" },
  {
    slug: "epithalon",
    displayName: "Epithalon Research Material",
    aliases: ["Epitalon"],
  },
  { slug: "ghk-cu", displayName: "GHK-Cu Research Material" },
  { slug: "gonadorelin", displayName: "Gonadorelin Research Material" },
  { slug: "ipamorelin", displayName: "Ipamorelin Research Material" },
  { slug: "kpv", displayName: "KPV Research Material" },
  { slug: "ll-37", displayName: "LL-37 Research Material" },
  { slug: "mots-c", displayName: "MOTS-C Research Material" },
  { slug: "nad-plus", displayName: "NAD+ Research Material", aliases: ["NAD"] },
  { slug: "pt-141", displayName: "PT-141 Research Material", aliases: ["Bremelanotide"] },
  { slug: "selank", displayName: "Selank Research Material" },
  { slug: "semax", displayName: "Semax Research Material" },
  { slug: "slu-pp-332", displayName: "SLU-PP-332 Research Material" },
  { slug: "ss-31", displayName: "SS-31 Research Material", aliases: ["Elamipretide"] },
  { slug: "tb-500", displayName: "TB-500 Research Material" },
  { slug: "tesamorelin", displayName: "Tesamorelin Research Material" },
  { slug: "thymosin-alpha-1", displayName: "Thymosin Alpha-1 Research Material" },
] as const;

const SUPPLEMENT_IDENTITIES: readonly Identity[] = [
  { slug: "foundational-protein", displayName: "Foundational Protein" },
  { slug: "creatine-monohydrate", displayName: "Creatine Monohydrate" },
  { slug: "omega-3", displayName: "Omega-3" },
  { slug: "magnesium-complex", displayName: "Magnesium Complex" },
  { slug: "daily-multi", displayName: "Daily Multi" },
  { slug: "electrolyte-complex", displayName: "Electrolyte Complex" },
  { slug: "creatine-chews", displayName: "Creatine Chews" },
  { slug: "fiber-powder", displayName: "Fiber Powder" },
  { slug: "whey-protein-isolate", displayName: "Whey Protein Isolate" },
  { slug: "plant-protein", displayName: "Plant Protein" },
  { slug: "collagen-peptides", displayName: "Collagen Peptides" },
  { slug: "magnesium-l-threonate", displayName: "Magnesium L-Threonate" },
  { slug: "magnesium-malate", displayName: "Magnesium Malate" },
  { slug: "ubiquinol", displayName: "Ubiquinol" },
  { slug: "vitamin-d3", displayName: "Vitamin D3" },
] as const;

const PROGRAM_IDENTITIES: readonly Identity[] = [
  { slug: "foundational-performance-program", displayName: "Foundational Performance Program" },
  { slug: "recovery-routine-program", displayName: "Recovery Routine Program" },
  { slug: "body-composition-program", displayName: "Body Composition Program" },
  { slug: "precision-routine-program", displayName: "Precision Routine Program" },
] as const;

const PATHWAY_IDENTITIES: readonly Identity[] = [
  { slug: "glp-1-pathway", displayName: "GLP-1 Pathway" },
  { slug: "glp-2-pathway", displayName: "GLP-2 Pathway" },
  {
    slug: "next-generation-multi-agonist-pathway",
    displayName: "Next-Generation Multi-Agonist Pathway",
  },
] as const;

function profile(
  identity: Identity,
  kind: V3PreviewProfileKind,
): V3PreviewProfile {
  const lane: ProductLane =
    kind === "supplement"
      ? "supplement"
      : kind === "quantum"
        ? "quantum"
        : kind === "pathway"
          ? "future_clinical"
          : kind === "program"
            ? "non_product_program"
            : "research_material";
  const category =
    kind === "research_blend"
      ? "Research blends"
      : kind === "research_material"
        ? "Research materials"
        : kind === "supplement"
          ? "Supplements"
          : kind === "quantum"
            ? "Quantum Research"
            : kind === "pathway"
              ? MEMBER_CATALOG_FUTURE_CLINICAL_CATEGORY
              : MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CATEGORY;
  const classification =
    kind === "research_blend"
      ? "Nonclinical Research blend"
      : kind === "research_material"
        ? "Nonclinical Research material"
        : kind === "supplement"
          ? "Supplement candidate"
          : kind === "quantum"
            ? "Research category under review"
            : kind === "pathway"
              ? MEMBER_CATALOG_FUTURE_CLINICAL_CLASSIFICATION
              : MEMBER_CATALOG_NON_PRODUCT_PROGRAM_CLASSIFICATION;
  const summary =
    kind === "pathway"
      ? MEMBER_CATALOG_NONTRANSACTIONAL_SUMMARY
      : kind === "program"
        ? "Program information is being prepared. This catalog state is separate from Research product commerce."
        : "A discovery profile is available while exact variants, customer pricing, documentation, and availability remain unapproved.";

  return {
    previewId: `preview:${identity.slug}`,
    slug: identity.slug,
    displayName: identity.displayName,
    aliases: identity.aliases ?? [],
    kind,
    lane,
    category,
    classification,
    summary,
    pricingState: "public_price_pending",
    approvedPrice: null,
    approvedVariantCount: 0,
    purchasingEnabled: false,
    documentationState: "pending",
    availabilityState:
      kind === "pathway" || kind === "program"
        ? "catalog_only"
        : kind === "supplement"
          ? "coming_soon"
          : "request_sourcing",
  };
}

export const v3PreviewProducts: readonly V3PreviewProfile[] = [
  ...RESEARCH_BLEND_IDENTITIES.map((item) => profile(item, "research_blend")),
  ...RESEARCH_MATERIAL_IDENTITIES.map((item) => profile(item, "research_material")),
  profile(
    { slug: "quantum-foundational-platform", displayName: "Quantum Foundational Research Platform" },
    "quantum",
  ),
  ...SUPPLEMENT_IDENTITIES.map((item) => profile(item, "supplement")),
  ...PROGRAM_IDENTITIES.map((item) => profile(item, "program")),
  ...PATHWAY_IDENTITIES.map((item) => profile(item, "pathway")),
] as const;

if (v3PreviewProducts.length !== V3_PREVIEW_PROFILE_COUNT) {
  throw new Error(`Expected ${V3_PREVIEW_PROFILE_COUNT} public-safe preview profiles.`);
}

/**
 * Compatibility remains intentionally empty. A discovery identity is not a
 * Product Control product, variant, or SKU and cannot authorize commerce.
 */
export const v3PreviewCatalogProducts: CatalogProduct[] = [];

function displayState(profile: V3PreviewProfile): MemberCatalogCard["displayState"] {
  if (profile.availabilityState === "catalog_only") return "catalog_only";
  return profile.documentationState === "pending"
    ? "documentation_pending"
    : "pricing_pending";
}

export function toV3MemberCatalogCard(
  profile: V3PreviewProfile,
  evaluatedAt: string,
): MemberCatalogCard {
  return {
    id: profile.previewId,
    slug: profile.slug,
    displayName: profile.displayName,
    aliases: [...profile.aliases],
    lane: profile.lane,
    category: profile.category,
    classification: profile.classification,
    summary: profile.summary,
    displayState: displayState(profile),
    media: null,
    price: null,
    readiness: null,
    selection: null,
    variantCount: 0,
    updatedAt: evaluatedAt,
  };
}

export function createV3MemberCatalog(evaluatedAt: string): MemberCatalog {
  const items = v3PreviewProducts.map((item) =>
    toV3MemberCatalogCard(item, evaluatedAt),
  );
  return {
    audience: "member",
    currency: "USD",
    evaluatedAt,
    items,
    categories: Array.from(
      new Set(items.map((item) => item.category)),
    ).sort(),
    lanes: Array.from(new Set(items.map((item) => item.lane))),
  };
}

export function createV3MemberProductDetail(
  slug: string,
  evaluatedAt: string,
): MemberProductDetail | null {
  const profile = v3PreviewProducts.find((item) => item.slug === slug);
  if (!profile) return null;
  return {
    ...toV3MemberCatalogCard(profile, evaluatedAt),
    audience: "member",
    currency: "USD",
    evaluatedAt,
    canonicalName: profile.displayName,
    overview: profile.summary,
    specifications: null,
    researchInformation:
      profile.lane === "research_material"
        ? "This profile is limited to nonclinical Research discovery information."
        : null,
    storageInformation: null,
    shippingInformation: null,
    returnInformation: null,
    disclaimers:
      profile.lane === "research_material" || profile.lane === "future_clinical"
        ? "Not prescribing, dosing guidance, treatment, or a statement of clinical suitability."
        : null,
    reviewDate: null,
    variants: [],
    relatedProducts: [],
    researchOnlyBoundary:
      profile.lane === "research_material" || profile.lane === "future_clinical",
  };
}
