// xenios research: the four brand catalogs, 911 rows, transcribed from Samuel's
// master catalog workbook.
//
// SERVER SIDE ONLY. This module carries internal fields (source references, missing
// input inventories, offer evidence), so it must not be imported by anything under
// `client/`. Surfaces read `toMemberBrandCard`, which strips every internal field
// by explicit pick. A test in this directory asserts no client file imports it.
//
// ---------------------------------------------------------------------------
// Where the data comes from
// ---------------------------------------------------------------------------
//
// One workbook, verified 2026-07-29, sheet "Master Catalog": 911 data rows, the
// authoritative union of the four per brand sheets (Momentous 76, Pure
// Encapsulations 413, Life Extension 384, Superpower 38). Its nine columns are
// Company, Product / Offering, Catalog Type, Classification, Variant / Size, Public
// Price, Coverage Status, Source URL, Verified Date, plus a Notes column.
//
// Every field below is one of those columns. Nothing here was inferred from a
// product name, and no brand site, product description, or marketing claim was read
// into this file. The workbook records WHAT EXISTS in each brand's public catalog.
// It does not record what any of it contains or does, so this module does not either.
//
// ---------------------------------------------------------------------------
// Dash normalisation, recorded so it can be checked
// ---------------------------------------------------------------------------
//
// House style forbids em and en dashes in this directory, and the workbook uses en
// dashes in three product names, in the catalog type "Official A-Z Entry" (797 rows),
// and in the coverage status "Exact official A-Z catalog snapshot" (797 rows). Those
// characters, and only those characters, are normalised to a plain hyphen here.
// `DASH_NORMALISED_SLUGS` names the three affected product rows so the edit is on
// the record rather than silent. Every other character is verbatim, including the
// registered trademark, trademark, bullet, and accented characters several brands
// use inside their own product names. Renaming those would invent a product name
// that does not exist.
//
// ---------------------------------------------------------------------------
// Why nothing here is purchasable, structurally
// ---------------------------------------------------------------------------
//
// The workbook states NO wholesale source cost for any of the 911 rows, no supplier
// item code, and no founder approved member amount. Three rows carry a public price
// text, all three from Superpower, and a brand's own public price is not an approved
// member amount: it is a fact about someone else's storefront.
//
// So every row presents the offer resolver with no approved amount and no named
// item identity, and `resolvePrivateLaneOfferMode` returns DISPLAY_ONLY for all 911.
// That is derived, never declared. `buildProduct` additionally throws if a record
// ever resolves to a purchase mode, so a future data edit that tried to make one of
// these sellable would fail at module load rather than reach a member.
//
// ---------------------------------------------------------------------------
// Superpower is a service, not a product
// ---------------------------------------------------------------------------
//
// The 38 Superpower rows are blood testing panels, a membership, phlebotomy
// collection, and marketplace categories. Several are unambiguously clinical:
// prostate screening, a cancer screen, celiac and autoimmune panels, fertility
// planning. They are recorded under their own classification,
// `blood_testing_health_service`, and they are never modelled as purchasable goods.
//
// Routing a blood testing service through a research materials storefront is a Care
// and clinical rail question, not a catalog question. Nothing in this module decides
// it. These rows are held at DISPLAY_ONLY with readiness NOT_OFFERED until that
// decision is made by a named human, and a test asserts no Superpower record can
// reach any purchase mode.

import {
  resolvePrivateLaneOfferMode,
  unresolved,
  type CoaEvidenceState,
  type OfferAvailabilityMode,
  type OfferReadinessState,
  type UnresolvedField,
} from "./offer-readiness";

// ---------------------------------------------------------------------------
// The closed unions
// ---------------------------------------------------------------------------

/** The four brands in the workbook. A record may not carry anything outside this list. */
export const BRANDS = [
  "momentous",
  "pure_encapsulations",
  "life_extension",
  "superpower",
] as const;

export type Brand = (typeof BRANDS)[number];

/** The company name exactly as the workbook writes it. */
export const BRAND_COMPANY_NAMES: Readonly<Record<Brand, string>> = {
  momentous: "Momentous",
  pure_encapsulations: "Pure Encapsulations",
  life_extension: "Life Extension",
  superpower: "Superpower",
};

/**
 * The slug prefix per brand. Slugs are prefixed so the 911 rows share one namespace
 * without collision, and so a slug always says which brand it belongs to.
 */
export const BRAND_SLUG_PREFIXES: Readonly<Record<Brand, string>> = {
  momentous: "mom",
  pure_encapsulations: "pe",
  life_extension: "le",
  superpower: "sp",
};

/**
 * The six classifications the workbook observes. These are kept apart on purpose.
 * A pet mix, a coffee, a toothpaste, a topical lotion, and a blood panel are not
 * human supplements, and folding them into one list would misstate the catalog.
 */
export const BRAND_CLASSIFICATIONS = [
  "human_supplement",
  "food_beverage",
  "personal_care",
  "pet_supplement",
  "topical_non_supplement",
  "blood_testing_health_service",
] as const;

export type BrandClassification = (typeof BRAND_CLASSIFICATIONS)[number];

/** The classification that is a service rather than a good. */
export const SERVICE_CLASSIFICATION: BrandClassification = "blood_testing_health_service";

/** Classifications that are not for human consumption as a supplement. */
export const NON_HUMAN_SUPPLEMENT_CLASSIFICATIONS: readonly BrandClassification[] = [
  "food_beverage",
  "personal_care",
  "pet_supplement",
  "topical_non_supplement",
  "blood_testing_health_service",
];

/** The seventeen catalog types the workbook observes, transcribed exactly. */
export const BRAND_CATALOG_TYPES = [
  "individual_supplement",
  "travel_variant",
  "stack_bundle",
  "sports_nutrition",
  "flavor_variant",
  "packet_variant",
  "size_bundle_variant",
  "topical",
  "official_a_to_z_entry",
  "core_testing_panel",
  "add_on_testing_panel",
  "regional_testing_panel",
  "membership",
  "collection_service",
  "gift_product",
  "partner_add_on",
  "marketplace_category",
] as const;

export type BrandCatalogType = (typeof BRAND_CATALOG_TYPES)[number];

/** How the row was verified. The workbook's own Coverage Status column. */
export const BRAND_COVERAGE_STATUSES = [
  "current_official_product_page",
  "official_help_catalog",
  "official_a_to_z_snapshot",
  "current_public_offering",
] as const;

export type BrandCoverageStatus = (typeof BRAND_COVERAGE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/**
 * The workbook's Verified Date column holds the Excel serial 46232 on every row.
 * Converted once here, and stored as an ISO date. The serial itself is never
 * rendered anywhere.
 */
export const BRAND_CATALOG_VERIFIED_DATE = "2026-07-29";

export const BRAND_CATALOG_SOURCE_REFERENCE =
  'Master catalog workbook, sheet "Master Catalog" (911 rows), verified 2026-07-29. Per brand sheets Momentous, Pure Encapsulations, Life Extension, and Superpower carry the same rows.';

/** The A-Z snapshot rows carry the brand's whole catalog index rather than a product page. */
const A_TO_Z_SOURCE_URLS: Readonly<Record<"pure_encapsulations" | "life_extension", string>> = {
  pure_encapsulations:
    "https://www.pureencapsulationspro.com/our-products/shop-by/products-a-z.html",
  life_extension: "https://www.lifeextension.com/vitamins-supplements/products-a-to-z",
};

/**
 * The three product names where the workbook uses an en dash. Normalised to a plain
 * hyphen for house style, and named here so the edit is a recorded fact.
 */
export const DASH_NORMALISED_SLUGS: readonly string[] = [
  "sp-marketplace-access-supplements",
  "sp-marketplace-access-peptides",
  "sp-marketplace-access-prescriptions",
];

// ---------------------------------------------------------------------------
// Missing inputs
// ---------------------------------------------------------------------------

/**
 * What the workbook supplies for no row at all, so every one of the 911 is waiting
 * on it. This list is the honest reason nothing here is sellable.
 */
const UNIVERSAL_MISSING_INPUTS: readonly string[] = [
  "Wholesale source cost: the master catalog states no supplier cost for any row",
  "Founder approved member amount: no pricing decision row exists for this record",
  "Supplier item code identifying the exact item to be resold",
  "Written reseller authorization from the brand",
  "Supplier specification sheet: form factor, serving size, servings per container",
  "Supplier ingredient and allergen panel",
];

const SERVICE_MISSING_INPUTS: readonly string[] = [
  "Clinical governance decision: a blood testing or health service is a Care rail question, not a research catalog listing",
  "Named clinician accountable for ordering, interpreting, and following up any panel",
];

const NON_SUPPLEMENT_MISSING_INPUT =
  "Category decision: the workbook classifies this row as something other than a human supplement, so it does not belong in a human supplement listing without its own review";

const QUALITATIVE_PRICE_MISSING_INPUT =
  "A stated amount: the workbook gives a qualitative public price for this row, not a number";

const FORM_FACTOR_MISSING_INPUTS: readonly string[] = [
  "Supplier specification sheet stating the presentation (for example capsule, powder, softgel)",
];

const WHOLESALE_MISSING_INPUTS: readonly string[] = [
  "Supplier price list or invoice stating the wholesale source cost for this exact item",
];

const APPROVED_AMOUNT_MISSING_INPUTS: readonly string[] = [
  "A founder approved customer amount for this exact item, recorded in the pricing decision matrix",
];

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export interface BrandProduct {
  /** The workbook's product name, with en dashes normalised. Never otherwise edited. */
  canonicalName: string;
  /**
   * The member facing name. Equal to the canonical name: no member facing rename has
   * been approved, and inventing one would put a product name on a card that no
   * document supports.
   */
  displayName: string;
  /** Deterministic and brand prefixed, so the four catalogs share one namespace. */
  slug: string;
  brand: Brand;
  catalogType: BrandCatalogType;
  classification: BrandClassification;
  /** The workbook's Variant / Size column. Null where the sheet leaves it blank. */
  variantOrSize: string | null;
  /**
   * The workbook's Public Price column, verbatim. Non null on three rows only, and
   * all three are Superpower. This is the BRAND's own public price, a fact about
   * someone else's storefront. It is never an approved member amount and it never
   * reaches the offer resolver.
   */
  publicPriceText: string | null;
  /**
   * The same price as an integer amount, only where the workbook states an
   * unambiguous one. Null everywhere else, including the two rows whose price text
   * is qualitative ("Additional fee", "Included / varies").
   */
  publicPriceCents: number | null;
  /** What the public amount is per, when the workbook says. Prevents rendering a yearly fee as a one time amount. */
  publicPriceBasis: string | null;
  coverageStatus: BrandCoverageStatus;
  /** The brand's own public page the row was read from. */
  sourceUrl: string;
  /** ISO date. The workbook's Excel serial, converted once. */
  verifiedDate: string;
  /** The workbook's Notes column. Internal reference text. Null where blank. */
  sheetNote: string | null;
  availability: OfferAvailabilityMode;
  readiness: OfferReadinessState;
  coaEvidence: CoaEvidenceState;
  /**
   * Written reseller authorization from the brand.
   *
   * The literal is `not_evidenced` rather than the supplement lane's
   * `not_authorized`, and the difference is deliberate. `not_authorized` is the
   * state of a supplier we are in conversation with who has not authorized us yet.
   * For these four brands there is no agreement, no application, and no
   * correspondence anywhere in the workspace: the honest statement is that nothing is
   * evidenced, which is a weaker claim than a declined authorization and must not be
   * read as one. It is its own literal type, not the shared
   * `ResellerAuthorizationState`, so it cannot be mistaken for a step in that
   * lane's negotiation.
   */
  resellerAuthorization: "not_evidenced";
  /** INTERNAL. Null on every row: the workbook states no supplier cost anywhere. */
  wholesaleSourceCostCents: UnresolvedField;
  /** INTERNAL. Null on every row: no pricing decision exists for any of these. */
  approvedMemberAmountCents: UnresolvedField;
  /** Presentation. Null on every row: the workbook states no form factor. */
  formFactor: UnresolvedField;
  sourceReference: string;
  /** Everything an authoritative document must still supply for this row. */
  missingInputs: readonly string[];
}

// ---------------------------------------------------------------------------
// The seeds
// ---------------------------------------------------------------------------

/**
 * A workbook row: name, catalog type, classification, variant, public price text,
 * coverage status, source url, note.
 */
type BrandSeed = readonly [
  canonicalName: string,
  catalogType: BrandCatalogType,
  classification: BrandClassification,
  variantOrSize: string | null,
  publicPriceText: string | null,
  coverageStatus: BrandCoverageStatus,
  sourceUrl: string,
  sheetNote: string | null,
];

/** Momentous, 76 rows. Every row has its own product page, so every row is spelled out. */
const MOMENTOUS_SEEDS: readonly BrandSeed[] = [
  ["Creatine - 60 Servings", "individual_supplement", "human_supplement", "60 servings; flavored", null, "current_official_product_page", "https://www.livemomentous.com/products/creatine-monohydrate-60-servings-flavors", null],
  ["Creatine - 90 Servings", "individual_supplement", "human_supplement", "90 servings; unflavored", null, "current_official_product_page", "https://www.livemomentous.com/products/creatine-monohydrate", null],
  ["Creatine 15-Travel Packs", "travel_variant", "human_supplement", "15 single-serve packets", null, "current_official_product_page", "https://www.livemomentous.com/products/creatine-15-travel-packs", null],
  ["Creatine Chews 150-Count", "individual_supplement", "human_supplement", "150 chewable tablets", null, "current_official_product_page", "https://www.livemomentous.com/products/creatine-monohydrate-chews", null],
  ["Creatine Chews Flavor Stack", "stack_bundle", "human_supplement", "Multiple chew flavors", null, "current_official_product_page", "https://www.livemomentous.com/products/creatine-monohydrate-chews-flavor-stack", null],
  ["Whey Protein Isolate", "sports_nutrition", "human_supplement", "Core jar; multiple flavors", null, "current_official_product_page", "https://www.livemomentous.com/products/essential-whey-protein", null],
  ["Whey Protein Isolate - Flavor Series", "flavor_variant", "human_supplement", "12-serving limited flavors", null, "current_official_product_page", "https://www.livemomentous.com/products/whey-protein-isolate-flavor-series", null],
  ["Whey Protein Isolate 10-Travel Packs", "travel_variant", "human_supplement", "10 single-serve packets", null, "current_official_product_page", "https://www.livemomentous.com/products/grass-fed-whey-protein-10-travel-packs", null],
  ["100% Plant Protein Powder", "sports_nutrition", "human_supplement", "22-serving jar", null, "current_official_product_page", "https://www.livemomentous.com/products/100-plant-protein-powder", "Current name for the help-center's Plant-Based Protein line."],
  ["100% Plant Protein - Flavor Series", "flavor_variant", "human_supplement", "12-serving limited flavors", null, "current_official_product_page", "https://www.livemomentous.com/products/100-plant-protein-powder-flavor-series", null],
  ["100% Plant Protein 10-Travel Packs", "travel_variant", "human_supplement", "10 single-serve packets", null, "current_official_product_page", "https://www.livemomentous.com/products/100-plant-protein-powder-10-travel-packs", null],
  ["Omega-3", "individual_supplement", "human_supplement", "Softgels", null, "current_official_product_page", "https://www.livemomentous.com/products/omega-3", null],
  ["Omega-3 Travel Packs", "travel_variant", "human_supplement", "5 single-serve servings", null, "current_official_product_page", "https://www.livemomentous.com/products/omega-3-travel-packs", null],
  ["Vegan Omega-3", "individual_supplement", "human_supplement", "Vegan omega-3", null, "official_help_catalog", "https://help.livemomentous.com/hc/en-us/categories/19119778677011-Products", "Live help-center catalog entry; direct storefront URL was not independently exposed in the public non-JavaScript listing."],
  ["Fiber+", "individual_supplement", "human_supplement", "Powder", null, "current_official_product_page", "https://www.livemomentous.com/products/fiber-plus", null],
  ["Fiber+ Travel Packs", "travel_variant", "human_supplement", "Single-serve packets", null, "current_official_product_page", "https://www.livemomentous.com/products/fiber-plus-travel-packs", null],
  ["Multivitamin", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/essential-multivitamin", "Formerly listed as Essential Multi in the help center."],
  ["Iron+", "individual_supplement", "human_supplement", "60 servings", null, "current_official_product_page", "https://www.livemomentous.com/products/iron-b-complex-supplement", "Newer live storefront item with vitamin C and B complex."],
  ["Calcium", "individual_supplement", "human_supplement", "Dicalcium malate capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/calcium-supplement", "Newer live storefront item included in The Women's Three."],
  ["Vitamin D3 2,000 IU", "individual_supplement", "human_supplement", "2,000 IU", null, "current_official_product_page", "https://www.livemomentous.com/products/vitamin-d3-2000-iu", null],
  ["Vitamin D3 5,000 IU", "individual_supplement", "human_supplement", "5,000 IU", null, "current_official_product_page", "https://www.livemomentous.com/products/vitamin-d3-5000-iu", null],
  ["Zinc / Zinc Picolinate", "individual_supplement", "human_supplement", "15 mg", null, "current_official_product_page", "https://www.livemomentous.com/products/zinc-picolinate", null],
  ["Magnesium Malate", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/magnesium-malate", null],
  ["Magnesium L-Threonate", "individual_supplement", "human_supplement", "Magtein® capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/magnesium-threonate", "Listed as Magnesium Threonate in the help center."],
  ["Collagen Peptides", "sports_nutrition", "human_supplement", "Powder", null, "current_official_product_page", "https://www.livemomentous.com/products/collagen-peptides", null],
  ["Collagen Peptides 10-Travel Packs", "travel_variant", "human_supplement", "10 single-serve packets", null, "current_official_product_page", "https://www.livemomentous.com/products/collagen-10-single-serving-bundle", null],
  ["Collagen Shot 15-Packs", "sports_nutrition", "human_supplement", "15 liquid shots", null, "current_official_product_page", "https://www.livemomentous.com/products/collagen-shot-15-packs", null],
  ["Recovery", "sports_nutrition", "human_supplement", "Post-workout powder", null, "current_official_product_page", "https://www.livemomentous.com/products/recovery-grass-fed-whey-isolate", "Formerly listed as Recovery Protein in the help center."],
  ["Fuel", "sports_nutrition", "human_supplement", "Carbohydrate + electrolyte powder", null, "current_official_product_page", "https://www.livemomentous.com/products/momentous-fuel", null],
  ["Fuel 10-Travel Packs", "travel_variant", "human_supplement", "10 single-serve packets", null, "current_official_product_page", "https://www.livemomentous.com/products/fuel-10-travel-packs", null],
  ["Vital Aminos", "sports_nutrition", "human_supplement", "Essential amino acid powder", null, "current_official_product_page", "https://www.livemomentous.com/products/vital-amino", null],
  ["L-Glutamine", "individual_supplement", "human_supplement", "Powder", null, "official_help_catalog", "https://help.livemomentous.com/hc/en-us/categories/19119778677011-Products", "Direct product page was not independently exposed in the public non-JavaScript listing."],
  ["Alpha GPC", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/alpha-gpc", null],
  ["Acetyl L-Carnitine", "individual_supplement", "human_supplement", "500 mg capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/acetyl-l-carnitine", null],
  ["Apigenin", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/apigenin", null],
  ["Ashwagandha", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/ashwagandha", null],
  ["Berberine", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/berberine", null],
  ["Brain Drive", "individual_supplement", "human_supplement", "Cognitive formula", null, "current_official_product_page", "https://www.livemomentous.com/products/brain-drive", null],
  ["Elite Sleep", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/elite-sleep", null],
  ["Nightly Sleep 5-Pack", "travel_variant", "human_supplement", "5 packets", null, "current_official_product_page", "https://www.livemomentous.com/products/sleep-5-pack", null],
  ["Nightly Sleep 30-Pack / Sleep Pack", "packet_variant", "human_supplement", "30 packets", null, "current_official_product_page", "https://www.livemomentous.com/products/sleep-pack", null],
  ["Inositol", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/inositol", null],
  ["L-Theanine", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/l-theanine", null],
  ["L-Tyrosine / Tyrosine", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/tyrosine", null],
  ["Longevity", "individual_supplement", "human_supplement", "Multi-ingredient longevity formula", null, "current_official_product_page", "https://www.livemomentous.com/products/longevity", null],
  ["Resveratrol", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/resveratrol-30-serving-jar", null],
  ["Rhodiola Rosea", "individual_supplement", "human_supplement", "100 mg capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/rhodiola-rosea-extract", null],
  ["Tongkat Ali", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/tongkat", null],
  ["Tongkat 60 Day Supply", "size_bundle_variant", "human_supplement", "60-day supply", null, "current_official_product_page", "https://www.livemomentous.com/products/2x-tongkat-jars-1x-fadogia-jar", null],
  ["Turmeric", "individual_supplement", "human_supplement", "Capsules", null, "current_official_product_page", "https://www.livemomentous.com/products/turmeric-ultra", null],
  ["Ubiquinol", "individual_supplement", "human_supplement", "Softgels", null, "current_official_product_page", "https://www.livemomentous.com/products/ubiquinol", null],
  ["The Women's Three", "stack_bundle", "human_supplement", "Iron+, Calcium, Vitamin D3", null, "current_official_product_page", "https://www.livemomentous.com/products/the-womens-three", null],
  ["PR Lotion", "topical", "topical_non_supplement", "Topical sodium-bicarbonate lotion", null, "current_official_product_page", "https://www.livemomentous.com/products/pr-lotion", null],
  ["The Momentous Three", "stack_bundle", "human_supplement", "Protein, creatine, omega-3", null, "current_official_product_page", "https://www.livemomentous.com/products/the-momentous-three", null],
  ["The Momentous Three - Vegan", "stack_bundle", "human_supplement", "Plant protein, creatine, vegan omega-3", null, "current_official_product_page", "https://www.livemomentous.com/products/the-momentous-three-vegan", null],
  ["Male Hormone Support Stack", "stack_bundle", "human_supplement", "Tongkat Ali + zinc", null, "current_official_product_page", "https://www.livemomentous.com/products/hormone-support-stack", null],
  ["Anti-Inflammatory Stack for Women", "stack_bundle", "human_supplement", "Creatine, turmeric, vitamin D3", null, "current_official_product_page", "https://www.livemomentous.com/products/anti-inflammatory-stack", null],
  ["Athletic Resilience Stack", "stack_bundle", "human_supplement", null, null, "official_help_catalog", "https://help.livemomentous.com/hc/en-us/categories/19119778677011-Products", "Official help-center catalog entry; bundle composition and availability can change."],
  ["Athletic Stack", "stack_bundle", "human_supplement", "Multivitamin, omega-3, magnesium malate", null, "current_official_product_page", "https://www.livemomentous.com/products/athletic-stack", null],
  ["The Complete Expert Stack", "stack_bundle", "human_supplement", null, null, "official_help_catalog", "https://help.livemomentous.com/hc/en-us/categories/19119778677011-Products", "Official help-center catalog entry; bundle composition and availability can change."],
  ["Complete Sleep Stack", "stack_bundle", "human_supplement", "Magnesium L-threonate, apigenin, inositol, L-theanine", null, "current_official_product_page", "https://www.livemomentous.com/products/complete-sleep-stack", null],
  ["Female Athlete Stack", "stack_bundle", "human_supplement", "Whey protein, collagen, creatine", null, "current_official_product_page", "https://www.livemomentous.com/products/female-athlete-stack", null],
  ["Focus & Cognition Stack", "stack_bundle", "human_supplement", "Tyrosine, omega-3, Alpha GPC", null, "current_official_product_page", "https://www.livemomentous.com/products/focus-cognition-stack", null],
  ["Follicular Phase Support Stack", "stack_bundle", "human_supplement", null, null, "official_help_catalog", "https://help.livemomentous.com/hc/en-us/categories/19119778677011-Products", "Official help-center catalog entry; bundle composition and availability can change."],
  ["Nightly Sleep Stack", "stack_bundle", "human_supplement", "Magnesium L-threonate, apigenin, L-theanine", null, "current_official_product_page", "https://www.livemomentous.com/products/nightly-sleep-stack", null],
  ["Peri & Post Menopause Support Stack", "stack_bundle", "human_supplement", null, null, "official_help_catalog", "https://help.livemomentous.com/hc/en-us/categories/19119778677011-Products", "Official help-center catalog entry; bundle composition and availability can change."],
  ["Women's GI Support Stack", "stack_bundle", "human_supplement", null, null, "official_help_catalog", "https://help.livemomentous.com/hc/en-us/categories/19119778677011-Products", "Official help-center catalog entry; bundle composition and availability can change."],
  ["Adaptogen Stack", "stack_bundle", "human_supplement", null, null, "current_official_product_page", "https://www.livemomentous.com/products/adaptogen-stack", null],
  ["Brain Drive + Elite Sleep Stack", "stack_bundle", "human_supplement", "Brain Drive + Elite Sleep", null, "current_official_product_page", "https://www.livemomentous.com/products/brain-drive-elite-sleep", null],
  ["Cognitive Power Stack", "stack_bundle", "human_supplement", "Alpha GPC, tyrosine, acetyl L-carnitine", null, "current_official_product_page", "https://www.livemomentous.com/products/cognitive-power-stack", null],
  ["Omega-3 & Multi Stack", "stack_bundle", "human_supplement", "Omega-3 + multivitamin", null, "current_official_product_page", "https://www.livemomentous.com/products/omega-3-and-multi-stack", null],
  ["Collagen + Creatine Stack", "stack_bundle", "human_supplement", "Collagen peptides + creatine", null, "current_official_product_page", "https://www.livemomentous.com/products/collagen-creatine", null],
  ["Tim Ferriss Performance Stack", "stack_bundle", "human_supplement", "Whey protein, creatine, magnesium L-threonate", null, "current_official_product_page", "https://www.livemomentous.com/products/tims-performance-stack", null],
  ["Arnold's Ultimate Stack", "stack_bundle", "human_supplement", "Protein, Fiber+, creatine, vitamin D3", null, "current_official_product_page", "https://www.livemomentous.com/products/arnold-schwarzeneggers-ultimate-stack", null],
  ["Arnold Schwarzenegger's Stack", "stack_bundle", "human_supplement", "Arnold collaboration stack", null, "current_official_product_page", "https://www.livemomentous.com/products/arnold-schwarzeneggers-stack", "Separate live collaboration product page from Arnold's Ultimate Stack."],
  ["Brain, Body, and Sleep Stack - Modern Wisdom", "stack_bundle", "human_supplement", "Omega-3, magnesium L-threonate, Tongkat Ali", null, "current_official_product_page", "https://www.livemomentous.com/products/brain-body-and-sleep-stack", null],
];

/** Superpower, 38 rows. A service catalog, not a product catalog. */
const SUPERPOWER_SEEDS: readonly BrandSeed[] = [
  ["Baseline blood panel", "core_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", "Public core panel; exact included biomarkers are maintained on Superpower's current biomarker page."],
  ["Advanced blood panel", "core_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", "Public core panel; exact included biomarkers are maintained on Superpower's current biomarker page."],
  ["Women's core hormones", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Organic acids test", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Organ age panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Men's core hormones", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Weight and appetite hormones", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Vitamin levels", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Thyroid antibodies", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Respiratory allergy panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Prostate screening (PSA)", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Cholesterol damage", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Nutrition panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Mycotoxins", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Heavy metals", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Mineral levels", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Methylation panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Lipoprotein (a)", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Insulin and blood sugar", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Fertility planning", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Extended women's health panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Extended metabolic health panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Extended men's health panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Extended heart health panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Autoimmune health panel", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Environmental toxins", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Celiac and gluten sensitivity", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Blood vessel function", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["Autoimmune screening", "add_on_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", null],
  ["New York / New Jersey regional offering", "regional_testing_panel", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/biomarkers", "Region-specific availability, panel design, and pricing may differ."],
  ["Superpower annual membership", "membership", "blood_testing_health_service", null, "$199/year", "current_public_offering", "https://superpower.com/", "Public membership includes an annual 100+ biomarker panel, dashboard/digital twin, personalized protocol, care-team access, AI companion, and marketplace access."],
  ["At-home phlebotomy / lab draw", "collection_service", "blood_testing_health_service", null, "Additional fee", "current_public_offering", "https://superpower.com/", "Available in many major U.S. metro areas; availability and fee vary."],
  ["Gift Superpower / gift membership", "gift_product", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/gift", "Public gift offering."],
  ["GRAIL Galleri cancer screen", "partner_add_on", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/", "Partner/member-access add-on; eligibility and clinical appropriateness should be confirmed directly."],
  ["Marketplace access - supplements", "marketplace_category", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/", "The member marketplace is public as a category, but its SKU-level inventory is login-gated and was not represented as a complete public catalog."],
  ["Marketplace access - peptides", "marketplace_category", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/", "The member marketplace is public as a category, but its SKU-level inventory is login-gated and was not represented as a complete public catalog."],
  ["Marketplace access - prescriptions", "marketplace_category", "blood_testing_health_service", null, null, "current_public_offering", "https://superpower.com/", "The member marketplace is public as a category, but its SKU-level inventory is login-gated and was not represented as a complete public catalog."],
  ["Partner-lab blood draw at 2,000+ locations", "collection_service", "blood_testing_health_service", null, "Included / varies", "current_public_offering", "https://superpower.com/", "Publicly described national partner-lab collection access."],
];

/**
 * Pure Encapsulations, 413 rows, and Life Extension, 384 rows: both are exact
 * snapshots of the brand's official A-Z catalog index. Every row in both shares the
 * same catalog type, coverage status, and source url, and neither states a variant
 * or a price, so only the product name varies and only the product name is stored.
 * Order is the sheet's order.
 */
const PURE_ENCAPSULATIONS_A_TO_Z: readonly string[] = [
  "+CAL+ with Ipriflavone",
  "5-HTP (5-Hydroxytryptophan) 100 mg",
  "5-HTP (5-Hydroxytryptophan) 50 mg",
  "7-KETO® DHEA 100 mg",
  "7-KETO® DHEA 25 mg",
  "7-KETO® DHEA 50 mg",
  "Açai 600 180's",
  "A.C. Formula II 120's",
  "A.I. Enzymes 120's",
  "A.I. Formula® 120's",
  "Acerola/Flavonoid",
  "Acetyl-l-Carnitine 250 mg 60's",
  "Acetyl-l-Carnitine 500 mg 60's",
  "Adenosyl/Hydroxy B12 90's",
  "Adenosyl/Hydroxy B12 liquid 30 ml",
  "AdipoLean II 90's",
  "ADR Formula®",
  "Adrenal 60's",
  "Aller-Essentials - IMPROVED",
  "Alpha Lipoic Acid 100 mg",
  "Alpha Lipoic Acid 200 mg",
  "Alpha Lipoic Acid 400 mg",
  "Alpha Lipoic Acid 600 mg",
  "Amino Replete",
  "Amino-NR 180's",
  "AntiOxidant Formula 120's",
  "Arabinogalactan 90's",
  "Ascorbic Acid Capsules",
  "Ascorbic Acid Powder 227 g",
  "Ascorbyl Palmitate 180's",
  "Ashwagandha",
  "Astaxanthin",
  "Athletic Nutrients",
  "Athletic Pure Pack 30 packets",
  "B-Complex liquid 140 ml",
  "B-Complex Plus",
  "B12 5,000 liquid",
  "B12 Folate 60's",
  "B12 liquid 30 ml",
  "B6 Complex",
  "Bacopa monnieri 180's",
  "Balanced Immune 60's",
  "BCAA Capsules",
  "BCAA Powder 227 g",
  "BenfoMax 90's",
  "Berberine UltraSorb™",
  "Best-Rest Formula",
  "Beta Carotene (with Mixed Carotenoids) 90's",
  "Beta-Sitosterol",
  "Betaine HCl Pepsin",
  "Bilberry 160 mg 120's",
  "Biotin 8 mg.",
  "Biotin Complex Hair & Skin",
  "Black Cohosh 2.5 - 120's",
  "Black Currant Seed Oil",
  "Borage Oil",
  "Boron (glycinate) 60's",
  "Boswellia",
  "Boswellia AKBA",
  "Brain Reset™",
  "Bromelain 2400 500 mg",
  "Buffered Ascorbic Acid Capsules",
  "Buffered Ascorbic Acid powder 227 g",
  "CaffPhenol",
  "Cal/Mag/D liquid 480 ml",
  "Calcium (citrate) 180's",
  "Calcium (MCHA) 180's",
  "Calcium (MCHA) with Magnesium 180's",
  "Calcium K/D 180's",
  "Calcium Magnesium (citrate)",
  "Calcium Magnesium (citrate/malate) 180's",
  "Calcium Magnesium (malate) 2:1",
  "Calcium with Vitamin D3 180's",
  "Calcium-D-Glucarate",
  "Calm Mind",
  "Caprylic Acid",
  "CarbCrave Complex 90's",
  "Cat's Claw",
  "Chaste Tree (Vitex)",
  "CholestePure",
  "CholestePure Plus 120's",
  "Choline (bitartrate)",
  "ChromeMate® GTF 600",
  "Chromium (picolinate) 200 mcg",
  "Chromium (picolinate) 500 mcg",
  "Cinnamon WS 120's",
  "CLA (Conjugated Linoleic Acid) 1,000 mg",
  "CogniMag 120's",
  "CogniPhos",
  "Cognitive Aminos 120's",
  "Collagen JS",
  "Colostrum 40% IgG",
  "Copper (citrate) 60's",
  "Copper (glycinate) 60's",
  "CoQ10 - 250 Mg. 60's",
  "CoQ10 - 30 Mg. 120's",
  "CoQ10 - 500 Mg. 60's",
  "CoQ10 l-Carnitine Fumarate 120's",
  "CoQ10 120 mg.",
  "CoQ10 60 mg.",
  "Coriolus extract",
  "Cortisol Calm",
  "Cranberry NS®",
  "Cranberry/D-Mannose",
  "Creatine",
  "CurcumaSorb 180's",
  "CurcumaSorb Mind 60's",
  "Curcumin",
  "Curcumin 500 with Bioperine®",
  "D-Mannose Powder",
  "Daily Calm",
  "Daily Immune 120's",
  "Daily Stress Formula",
  "DAO Enzyme",
  "Detox Pure Pack 30 packets",
  "DGL Plus®",
  "DHA Ultimate",
  "DHEA 10 mg",
  "DHEA 25 mg",
  "DHEA 5 mg",
  "Digestion GB",
  "Digestive Enzyme chewables",
  "Digestive Enzymes Ultra",
  "Digestive Enzymes Ultra with Betaine HCl",
  "DIM Detox 60's",
  "DIMPRO® 100",
  "Disc-Flex 120's",
  "DL-Phenylalanine",
  "DopaPlus 180's",
  "E.P.O. (evening primrose oil)",
  "EFA Essentials",
  "Electrolyte/Energy formula",
  "Emotional Wellness",
  "EmulsiSorb K2/D3 liquid",
  "Energize Plus Pure Pack 30 packets",
  "Energy Xtra",
  "EPA Ultimate 120's",
  "EPA/DHA essentials",
  "EPA/DHA liquid 200 mL",
  "EPA/DHA with lemon 120's",
  "Epi-Integrity powder",
  "Essential Aminos",
  "Ester-C® & flavonoids",
  "EyeProtect Basics 60's",
  "EyeProtect Basics without zinc 60's",
  "FemiVive",
  "Folate 1000 90's",
  "Folate 400 90's",
  "Folate 5,000 60's",
  "Folate 5,000 Plus 60's",
  "Folic Acid 60's",
  "G.I. Fortify (capsules) 120's",
  "G.I. Fortify 400 g",
  "G.I. Integrity",
  "GABA",
  "Garlic Complex 120's",
  "Ginger Extract 120's",
  "Ginkgo 50 - 160 mg. 120's",
  "GlucoFunction",
  "Glucosamine Chondroitin with Manganese",
  "Glucosamine Chondroitin with MSM",
  "Glucosamine Complex 180's",
  "Glucosamine HCl Chondroitin 120's",
  "Glucosamine Sulfate 1,000 mg",
  "Glucosamine/MSM with joint comfort herbs",
  "Glucose Support Formula",
  "Gluten/Dairy Digest",
  "Glycine 180's",
  "Grape Pip 500 Mg. 120's",
  "Grapefruit Seed Extract",
  "Green Tea Extract (decaffeinated)",
  "Growth Hormone Support 90's",
  "Hair/Skin/Nails Ultra 60's",
  "Hawthorn Extract 120's",
  "Heartburn Essentials",
  "Hemp CBD VESIsorb®",
  "Hist Reset",
  "HM Complex - IMPROVED",
  "Homocysteine Factors",
  "Hyaluronic Acid",
  "Indole-3-Carbinol 400 mg",
  "Innate Immune Support 60's",
  "Inositol (powder) 250 g",
  "Inositol Complex",
  "Iodine (potassium iodide) 120's",
  "Iodine and Tyrosine 120's",
  "IP6 (inositol hexaphosphate) 180's",
  "Iron liquid 120 ml",
  "Iron-C",
  "Joint Complex (single dose)",
  "Junior Nutrients 120's",
  "Krill-plex",
  "l-Arginine",
  "l-Carnitine",
  "l-Carnitine fumarate 120's",
  "l-Carnosine",
  "l-Glutamine 500 Mg.",
  "l-Glutamine 850 mg",
  "l-Glutamine powder",
  "l-Lysine",
  "l-Methionine 60's",
  "l-Theanine",
  "l-Tryptophan",
  "l-Tyrosine 90's",
  "Ligament Restore",
  "Lipid Support Complex",
  "Liposomal Glutathione",
  "Liposomal Glutathione liquid",
  "Liposomal Vitamin C",
  "Liposomal Vitamin C liquid",
  "Lipotropic Detox 120's",
  "LiquiNutrients 230 ml",
  "Lithium (orotate) 1 mg",
  "Lithium (orotate) 5 mg",
  "Liver-G.I. Detox",
  "Longevity Nutrients",
  "Lutein 20 mg.",
  "Lutein/Zeaxanthin",
  "LVR Formula",
  "Lycopene 20 mg",
  "M/R/S Mushroom Formula 120's",
  "Maca-3",
  "Macular Support Formula",
  "Magnesium (citrate)",
  "Magnesium (citrate/malate)",
  "Magnesium (powder)",
  "Magnesium Glycinate",
  "Magnesium Glycinate liquid 480 ml",
  "Magnesium Gummy",
  "Magnesium liquid 240 ml",
  "Manganese (aspartate/citrate) 60's",
  "Melatonin 0.5 Mg",
  "Melatonin 20 mg",
  "Melatonin 3 Mg",
  "Melatonin Liquid 30 ml",
  "Melatonin-SR",
  "Memory Pro",
  "Men's Nutrients",
  "Men's Pure Pack",
  "MenoVive 60's",
  "Metabolic Xtra",
  "MethylAssist 90's",
  "Methylcobalamin 1,000 mcg",
  "MicroDefense w/ Oregano",
  "Mineral 650 - 180's",
  "Mineral 650 w/o Cu &Fe 180's",
  "Mitochondria-ATP",
  "MotilPro 180's",
  "MSM Capsules",
  "MSM Powder",
  "Multi t/d",
  "Muscle Cramp/Tension Formula",
  "Muscle Repair+",
  "NAC (n-acetyl-l-cysteine) 600 mg",
  "NAC (n-acetyl-l-cysteine) 900 mg",
  "NAC + Glycine Powder",
  "NeuroMood Pure Pack",
  "NeuroPure 120's",
  "Niacinamide 90's",
  "Niacitol® (no-flush niacin) 500 mg 120's",
  "Niacitol® (no-flush niacin) 650 mg 180's",
  "Nitric Oxide Support 162 g",
  "Nitric Oxide Ultra (capsules) 120's",
  "NR Longevity™",
  "Nrf2 Detox",
  "NSK-SD® (Nattokinase) 100 mg",
  "Nutrient 950®",
  "Nutrient 950® A without copper & iron 180's",
  "Nutrient 950® with NAC 240's",
  "Nutrient 950® with Vitamin K 180's",
  "Nutrient 950® without Copper & Iron",
  "Nutrient 950® without Copper, Iron & Iodine 180's",
  "Nutrient 950® without Iron",
  "O.N.E.™ Multivitamin",
  "O.N.E.™ Omega",
  "Olive Leaf extract",
  "OptiFerin-C 60's",
  "OsteoBalance",
  "P5P 50 (activated vitamin B6)",
  "Panax Ginseng 120's",
  "Pancreatic Enzyme Formula",
  "Pancreatic VegEnzymes 180's",
  "Pantethine",
  "Pantothenic Acid 120's",
  "Peptic-Care (Zinc-L-Carnosine) 60's",
  "Perilla extract",
  "Phosphatidylcholine",
  "Phyto UltraComfort 120's",
  "Phyto-4 60's",
  "Phyto-ADR",
  "PhytoBalance II 120's",
  "PMS Essentials",
  "Policosanol 20 mg. 120's",
  "Poly-Prebiotic",
  "Poly-Prebiotic powder",
  "Polyphenol Nutrients",
  "Pomegranate Plus",
  "Potassium (aspartate) 90's",
  "Potassium (citrate)",
  "Potassium Magnesium (aspartate)",
  "Potassium Magnesium (citrate) 180's",
  "Pregnenolone 10 mg",
  "Pregnenolone 30 mg",
  "PreNatal Nutrients",
  "Pro-Resolve Omega",
  "ProbioMood (capsules) [Shelf-Stable]",
  "Probiotic 123",
  "Probiotic 50B 60's",
  "Probiotic G.I.",
  "Probiotic IMM 60's",
  "Probiotic-5 60's",
  "ProstaFlo 180's",
  "PS 100 (phosphatidylserine)",
  "PS Plus 60's",
  "Pure Sleep",
  "Pure Tranquility liquid 116 ml",
  "PureBi•Ome™ G.I. 60's",
  "PureBi•Ome™ Intensive 30's",
  "PureCell 120's",
  "PureDefense Collagen w/ Bone Broth powder",
  "PureDefense w/NAC 120's",
  "PureDefense w/NAC travel pack",
  "PureGenomics® B-Complex 120's",
  "PureGenomics® Multivitamin 60's",
  "PureGenomics® UltraMultivitamin",
  "PureGG 25B",
  "PureHeart® K2D",
  "PureLean® Fiber",
  "PureLean® Nutrients",
  "PureLean® Protein",
  "PureLean® Pure Pack 30 packets",
  "PureLean® Satiety",
  "PureMelt B12 Folate 90's",
  "PureProbiotic™ 60's",
  "PureResponse® Multivitamin",
  "Pycnogenol® 100 mg",
  "Pycnogenol® 50 mg",
  "Q-Gel® (Hydrosoluble™ CoQ10) 100 mg 60's",
  "Quercetin",
  "Quercetin UltraSorb",
  "R-Lipoic Acid (stabilized)",
  "Rapid Calm",
  "Rapid Mental Energy",
  "Reduced Glutathione",
  "Relora®",
  "RENUAL",
  "ResCu-SR® 60's",
  "Resveratrol",
  "Resveratrol EXTRA",
  "Resveratrol VESIsorb® 90's",
  "RevitalAge™ Nerve 120's",
  "RevitalAge™ Ultra 90's",
  "Rhodiola Rosea",
  "Ribose Powder 250 g.",
  "Saccharomyces Boulardii 60's",
  "SAMe (S-Adenosylmethionine) 60's",
  "Saw Palmetto 320",
  "Saw Palmetto Plus",
  "Selenium (citrate)",
  "Selenium (selenomethionine)",
  "Sereniten Plus 45's",
  "SeroPlus",
  "Silymarin",
  "SP Ultimate",
  "SR-CoQ10 with PQQ 60's",
  "Strontium (citrate)",
  "SunButyrate™-TG liquid",
  "Synergy K",
  "Systemic Enzyme Complex 180's",
  "Taurine 1,000 mg 120's",
  "Taurine 500 mg 60's",
  "Teavigo 120's",
  "Th1 Support 120's",
  "Th2 Modulator",
  "Thyroid Support Complex",
  "Trace Minerals 60's",
  "Tribulus Formula 90's",
  "Ubiquinol VESIsorb® 60's",
  "Ubiquinol-QH 100 mg 60's",
  "Ubiquinol-QH 200 mg 60's",
  "Ubiquinol-QH 50 mg 60's",
  "Ultra B-Complex w/ PQQ",
  "Ultra Pure Pack 30 packets",
  "UltraDetox 10-Day Pure Pack",
  "UltraMag Magnesium",
  "UltraNutrient®",
  "UltraZin Zinc 90's",
  "Uric Acid Formula 120's",
  "Vascular Relax 120's",
  "Vinpocetine 20 mg. 120's",
  "VisionPro EPA/DHA/GLA",
  "VisionPro Nutrients 90's",
  "Vitamin A + Carotenoids 90's",
  "Vitamin A 3,000 mcg (10,000 IU)",
  "Vitamin C chewables",
  "Vitamin D3 & K2",
  "Vitamin D3 (vegan)",
  "Vitamin D3 (Vegan) liquid 10 ml",
  "Vitamin D3 10 mcg (400 IU) 120's",
  "Vitamin D3 125 mcg (5,000 IU)",
  "Vitamin D3 25 mcg (1,000 IU)",
  "Vitamin D3 250 mcg (10,000 IU)",
  "Vitamin D3 liquid 22.5 ml",
  "Vitamin D3 VESIsorb® 60's",
  "Vitamin E (with mixed tocopherols)",
  "Women's Pure Pack 30 packets",
  "Women's Nutrients",
  "Women’s Nutrients 40+",
  "Zinc (citrate)",
  "Zinc 15",
  "Zinc 30",
  "Zinc chewables",
  "Zinc liquid 15 mg 120 ml",
];

const LIFE_EXTENSION_A_TO_Z: readonly string[] = [
  "7-Keto® DHEA Metabolite, 100 mg, 60 vegetarian capsules",
  "Acetyl-L-Carnitine, 500 mg, 100 vegetarian capsules",
  "Acetyl-L-Carnitine Arginate, 90 capsules",
  "Active Vitality & Strength, 30 vegetarian capsules",
  "Adrenal Energy Formula, 120 vegetarian capsules",
  "Adrenal Energy Formula, 60 vegetarian capsules",
  "Advanced Curcumin Elite™ Turmeric Extract, Ginger & Turmerones, 30 softgels",
  "Advanced Lipid Control, 60 vegetarian capsules",
  "Advanced Male Sexual Support, 60 vegetarian capsules",
  "Advanced Milk Thistle, 120 softgels",
  "Advanced Milk Thistle, 60 softgels",
  "Advanced Olive Leaf Vascular Support, 60 vegetarian capsules",
  "Aged Black Garlic, 30 vegetarian capsules",
  "Alpha-Lipoic Acid with Biotin, 60 capsules",
  "AMPK Metabolic Activator*, 30 vegetarian tablets",
  "AmpliQ CoQ10™, 100 mg, 60 vegetarian capsules",
  "AmpliQ CoQ10™, 50 mg, 60 vegetarian capsules",
  "Anti-Alcohol Complex, 60 capsules",
  "Arginine Ornithine Powder, 150 grams",
  "Arterial Protect, 30 vegetarian capsules",
  "ArthroMax® Advanced with NT2 Collagen™ & AprèsFlex®, 60 capsules",
  "Ascorbyl Palmitate, 500 mg, 100 vegetarian capsules",
  "Ashwagandha Plus Calm & Focus, 60 vegetarian capsules",
  "Astaxanthin with Phospholipids, 4 mg, 30 softgels",
  "B12 Elite, 60 vegetarian lozenges",
  "Bee Immune Propolis Capsules, 60 vegetarian capsules",
  "Bee Immune Propolis Spray, 15 ml",
  "Benfotiamine with Thiamine, 100 mg, 120 vegetarian capsules",
  "Bifido GI Balance, 60 vegetarian capsules",
  "BioActive Complete B-Complex, 60 vegetarian capsules",
  "BioActive Folate & Vitamin B12, 90 vegetarian capsules",
  "Bioactive Milk Peptides, 30 vegetarian capsules",
  "Bio-Fisetin, 30 vegetarian capsules",
  "Biological Aging Defense, 100 mg, 30 vegetarian capsules",
  "Bio-Luteolin™, 100 mg, 30 vegetarian capsules",
  "Bio-Quercetin, 30 vegetarian capsules",
  "Biotin, 600 mcg, 100 capsules",
  "Black Cumin Seed Oil, 60 softgels",
  "Black Cumin Seed Oil and Curcumin Elite™ , 60 softgels",
  "Bloat Relief, 60 softgels",
  "Blueberry Extract and Pomegranate, 60 vegetarian capsules",
  "Blueberry Extract Capsules, 60 vegetarian capsules",
  "Body Trim and Appetite Control, 30 vegetarian capsules",
  "Bone Restore, 120 capsules",
  "Bone Restore Chewable Tablets (Chocolate), 60 chewable tablets",
  "Bone Restore Elite with Super Potent K2, 120 capsules",
  "Bone Restore with Vitamin K2, 120 capsules",
  "Bone Strength Collagen Formula, 120 capsules",
  "Boron, 3 mg, 100 vegetarian capsules",
  "Boswellia, 100 mg, 60 vegetarian capsules",
  "Brain Fog Relief, 30 softgels",
  "Branched Chain Amino Acids, 90 capsules",
  "Breast Health Formula, 60 capsules",
  "Buffered Vitamin C Powder, 454 grams",
  "Calcium Citrate with Vitamin D, 200 capsules",
  "Calcium D-Glucarate, 200 mg, 60 vegetarian capsules",
  "California Estate Extra Virgin Olive Oil, 500 ml",
  "Calm-Mag, 30 vegetarian capsules",
  "Cardio Peak™, 30 vegetarian capsules",
  "Carnosine, 500 mg, 60 vegetarian capsules",
  "Cat Mix, 100 grams",
  "Children's Formula Life Extension Mix™, 120 chewable tablets",
  "Chlorophyllin, 100 mg, 100 vegetarian capsules",
  "CHOL-Support™, 60 liquid vegetarian capsules",
  "CinSulin® with InSea2® and Crominex® 3+, 90 vegetarian capsules",
  "Citicoline (CDP-Choline), 60 vegetarian capsules",
  "CoffeeGenic® Green Coffee Extract, 400 mg, 90 vegetarian capsules",
  "Cognitex® Alpha GPC, 30 softgels",
  "Cognitex® Elite, 60 vegetarian tablets",
  "Cognitex® Elite Pregnenolone, 60 vegetarian tablets",
  "Collagen Peptides for Skin & Joints, 343 grams",
  "ComfortMAX™, 60 AM/PM vegetarian tablets",
  "Comprehensive Nutrient Packs ADVANCED, 30 packets",
  "CoQ10 (Ubiquinone) with d-Limonene, 50 mg, 60 softgels",
  "CoQ10 (Ubiquinone) with d-Limonene, 100 mg, 60 softgels",
  "Cortisol-Stress Balance, 30 vegetarian capsules",
  "Cran-Max® , 500 mg, 60 vegetarian capsules",
  "Creatine & Acetyl-L-Carnitine Energy Plus, 0.51 lb",
  "Creatine Capsules, 120 capsules",
  "Creatine Powder, 300 grams",
  "Cruciferous Vegetable Extract Blend, 60 vegetarian capsules",
  "Cruciferous Vegetable Extract Blend and Resveratrol, 60 vegetarian capsules",
  "Curcumin Elite™ Turmeric Extract, 60 vegetarian capsules",
  "Curcumin Elite™ Turmeric Extract, 30 vegetarian capsules",
  "Cytokine Suppress® with EGCG, 30 vegetarian capsules",
  "D, L-Phenylalanine Capsules, 500 mg, 100 vegetarian capsules",
  "Daily PMS Relief, 60 vegetarian capsules",
  "Daily Skin Defense, 30 vegetarian capsules",
  "Decaffeinated Mega Green Tea Extract, 100 vegetarian capsules",
  "DHEA, 25 mg, 100 dissolve-in-mouth tablets",
  "DHEA, 50 mg, 60 capsules",
  "DHEA, 25 mg, 100 capsules",
  "DHEA, 15 mg, 100 capsules",
  "DHEA, 100 mg, 60 vegetarian capsules",
  "DHEA Complete, 60 vegetarian capsules",
  "Discomfort Relief (Berry), 60 vegetarian chewable tablets",
  "DMAE Bitartrate , 150 mg, 200 vegetarian capsules",
  "Dog Mix, 100 grams",
  "Dopa-Mind™, 60 vegetarian tablets",
  "Dopamine Advantage, 30 vegetarian capsules",
  "Dr. Strum's Intensive Bone Formula, 300 capsules",
  "D-Ribose Powder, 150 grams",
  "D-Ribose Tablets, 100 vegetarian tablets",
  "Easy Fiber (Orange), 0.37 lb",
  "Echinacea Elite, 60 vegetarian capsules",
  "Effervescent Vitamin C Magnesium Crystals, 180 grams",
  "EnergyGain™, 200 mg, 30 vegetarian capsules",
  "Enhanced Sleep without Melatonin, 30 vegetarian capsules",
  "Enhanced Stress Relief, 30 vegetarian capsules",
  "Enhanced Super Digestive Enzymes, 60 vegetarian capsules",
  "Enhanced Super Digestive Enzymes and Probiotics, 60 vegetarian capsules",
  "Enhanced Zinc Lozenges (Peppermint), 30 vegetarian lozenges",
  "EsophaCool™ (Berry), 60 vegetarian chewable tablets",
  "Esophageal Guardian (Berry), 60 vegetarian chewable tablets",
  "Essential Youth L-Ergothioneine, 5 mg, 30 vegetarian capsules",
  "Estrogen Balance Elite, 60 vegetarian tablets",
  "Estrogen For Women, 30 vegetarian tablets",
  "Extend-Release Magnesium, 60 vegetarian capsules",
  "Extraordinary Enzymes, 60 capsules",
  "Eye Pressure Support with Mirtogenol®, 30 vegetarian capsules",
  "Fast Acting Relief, 60 softgels",
  "Fast-Acting Joint Formula, 30 capsules",
  "Fast-Acting Liquid Melatonin (Citrus-Vanilla) , 2 fl oz",
  "Fast-C® and Bio-Quercetin®, 60 vegetarian tablets",
  "FLORASSIST® Daily Bowel Regularity, 30 vegetarian capsules",
  "FLORASSIST® Prebiotic and Probiotic Liver Restore™, 60 vegetarian capsules",
  "FLORASSIST® Prebiotic Chewable (Strawberry), 60 vegetarian chewable tablets",
  "FLORASSIST® PROBIOTIC Balance, 30 vegetarian capsules",
  "FLORASSIST® Probiotic GI with Phage Technology, 30 liquid vegetarian capsules",
  "FLORASSIST® Probiotic Heart Health, 60 vegetarian capsules",
  "FLORASSIST® Probiotic Immune & Nasal Defense, 30 vegetarian capsules",
  "FLORASSIST® Probiotic Mood Improve, 30 vegetarian capsules",
  "FLORASSIST® Probiotic Oral Hygiene, 30 vegetarian lozenges",
  "FLORASSIST® Probiotic Women's Health, 30 vegetarian capsules",
  "FLORASSIST® Probiotic Youthful Gut, 30 vegetarian capsules",
  "Food Sensitivity Relief with Diamine Oxidase (DAO), 60 delayed release capsule",
  "Forskolin, 10 mg, 60 vegetarian capsules",
  "GABA, 60 vegetarian capsules",
  "Gamma E Mixed Tocopherols, 60 softgels",
  "Gamma E Mixed Tocopherols & Tocotrienols, 60 softgels",
  "Gastro-Ease™, 60 vegetarian capsules",
  "GEROPROTECT® Ageless Cell™, 30 softgels",
  "GEROPROTECT® Autophagy Renew, 30 vegetarian capsules",
  "GEROPROTECT® Stem Cell, 60 vegetarian capsules",
  "Ginkgo Biloba Certified Extract™, 120 mg, 365 vegetarian capsules",
  "Ginseng Energy Boost, 30 vegetarian capsules",
  "Glucosamine Sulfate, 60 capsules",
  "Glucosamine/Chondroitin Capsules, 90 capsules",
  "Glutathione, 60 vegetarian capsules",
  "Glutathione, Cysteine & C, 100 capsules",
  "Glycemic Guard™, 30 vegetarian capsules",
  "Glycine, 1000 mg, 100 vegetarian capsules",
  "Grapeseed Extract, 60 vegetarian capsules",
  "Gummy Science™ Mediterranean Weight Management (Berry), 60 gummies",
  "Gummy Science™ Neuro-Mag® Magnesium L-Threonate (Orange), 60 gummies",
  "Hair Growth for Men, 30 softgels",
  "Hair Growth for Women, 30 softgels",
  "Hair, Skin & Nails Collagen Plus Formula, 120 tablets",
  "Healthy Aging Powder, 0.46 lb",
  "Healthy Lungs, 30 vegetarian capsules",
  "HepatoPro , 900 mg, 60 softgels",
  "Herbal Sleep PM, 30 capsules",
  "High Potency Optimized Folate, 8500 mcg DFE, 30 vegetarian tablets",
  "Homocysteine Resist, 60 vegetarian capsules",
  "Huperzine A, 200 mcg, 60 vegetarian capsules",
  "Immune Packs with Vitamin C & D, Zinc and Probiotic, 30 packets",
  "Immune Senescence Protection Formula™, 60 vegetarian tablets",
  "Inositol Caps, 1000 mg, 360 vegetarian capsules",
  "Iron Protein Plus, 300 mg, 100 vegetarian capsules",
  "Joint Mobility, 60 vegetarian capsules",
  "Krill Healthy Joint Formula, 30 softgels",
  "Lactoferrin Caps, 60 vegetarian capsules",
  "L-Arginine Caps, 700 mg, 200 capsules",
  "L-Carnitine, 500 mg, 30 vegetarian capsules",
  "Lecithin, 454 grams",
  "L-Glutamine, 500 mg, 100 vegetarian capsules",
  "L-Glutamine Powder, 100 grams",
  "Life Extension Mix™ Capsules, 360 capsules",
  "Life Extension Mix™ Capsules without Copper, 360 capsules",
  "Life Extension Mix™ Powder, 12.70 oz",
  "Life Extension Mix™ Tablets, 240 tablets",
  "Life Extension Mix™ Tablets with Extra Niacin, 240 tablets",
  "Life Extension Mix™ Tablets without Copper, 240 tablets",
  "Life Extension Toothpaste (Mint), 4 oz",
  "Lightly Caffeinated Mega Green Tea Extract, 100 vegetarian capsules",
  "Liquid Vitamin D3, 50 mcg (2000 IU), 29.57 ml",
  "Liquid Vitamin D3 (Mint), 50 mcg (2000 IU), 29.57 ml",
  "Lithium, 1000 mcg, 100 capsules",
  "Liver Efficiency Formula, 30 vegetarian capsules",
  "L-Lysine, 620 mg, 100 vegetarian capsules",
  "Low Dose Vitamin K2, 45 mcg, 90 softgels",
  "Lower Back Relief, 60 vegetarian capsules",
  "L-Theanine, 60 vegetarian capsules",
  "L-Tryptophan, 500 mg, 90 vegetarian capsules",
  "MacuGuard® Ocular Support with Saffron, 60 softgels",
  "MacuGuard® Ocular Support with Saffron & Astaxanthin, 60 softgels",
  "Magnesium (Citrate), 100 mg, 100 vegetarian capsules",
  "Magnesium Caps, 500 mg, 100 vegetarian capsules",
  "Magnesium Glycinate, 90 vegetarian capsules",
  "Male Vascular Sexual Support, 30 vegetarian capsules",
  "Mega Benfotiamine, 250 mg, 120 vegetarian capsules",
  "Mega EPA/DHA, 120 softgels",
  "Mega GLA Sesame Lignans, 30 softgels",
  "Mega L-Ergothioneine, 30 vegetarian capsules",
  "Mega Lycopene, 15 mg, 90 softgels",
  "Mega Vitamin K2, 45000 mcg (45 mg), 30 capsules",
  "Melatonin, 3 mg, 60 vegetarian lozenges",
  "Melatonin, 500 mcg, 200 vegetarian capsules",
  "Melatonin, 3 mg, 60 vegetarian capsules",
  "Melatonin, 300 mcg, 100 vegetarian capsules",
  "Melatonin, 1 mg, 60 capsules",
  "Melatonin, 10 mg, 60 vegetarian capsules",
  "Melatonin 6 Hour Timed Release, 3 mg, 60 vegetarian tablets",
  "Melatonin 6 Hour Timed Release, 750 mcg, 60 vegetarian tablets",
  "Melatonin 6 Hour Timed Release, 300 mcg, 100 vegetarian tablets",
  "Melatonin IR/XR, 60 capsules",
  "Memory Protect, 12 Colostrinin-Lithium (C-Li) Capsules | 24 Lithium (Li) Capsules",
  "Menopause Relief, 30 enteric-coated vegetarian tablets",
  "Men's Bladder Support, 30 vegetarian capsules",
  "Men's Vitality Packs, 30 packets",
  "Migra-Eeze™, 60 softgels",
  "Migra-Health™ by Minded, 60 vegetarian capsules",
  "Milk Thistle , 60 vegetarian capsules",
  "Mitochondrial Basics with PQQ, 30 vegetarian capsules",
  "Mitochondrial Energy Optimizer with PQQ, 120 vegetarian capsules",
  "MSM, 1000 mg, 100 capsules",
  "Mushroom Immune with Beta Glucans, 30 vegetarian capsules",
  "N-Acetyl-L-Cysteine (NAC), 600 mg, 60 capsules",
  "NAD+ Cell Regenerator™, 100 mg, 30 vegetarian capsules",
  "NAD+ Cell Regenerator™ and Resveratrol Elite™, 30 vegetarian capsules",
  "NAD+ Cell Regenerator™*, 300 mg, 30 vegetarian capsules",
  "Neuro-Mag® Magnesium L-Threonate, 90 vegetarian capsules",
  "Neuro-Mag® Magnesium L-Threonate (Tropical Punch), 93.35 grams",
  "NitroVasc™ Boost (Berry) , 78.60 grams",
  "NK Cell Activator™, 30 vegetarian tablets",
  "NMN Nicotinamide Mononucleotide, 300 mg, 30 vegetarian capsules",
  "NMN Nicotinamide Mononucleotide, 300 mg, 90 vegetarian capsules",
  "NMN Nicotinamide Mononucleotide with Resveratrol Elite™, 90 vegetarian capsules",
  "NMN Nicotinamide Mononucleotide with Resveratrol Elite™, 30 vegetarian capsules",
  "No Flush Niacin, 640 mg, 100 capsules",
  "NT2 Collagen™, 40 mg, 60 small capsules",
  "Omega-3 Fish Oil Gummy Bites (Tropical Fruit), 36 gummies",
  "Once-Daily Health Booster, 30 softgels",
  "Once-Daily Health Booster, 60 softgels",
  "One-Per-Day Multivitamin, 60 tablets",
  "Only Trace Minerals, 90 vegetarian capsules",
  "Optimized Ashwagandha, 60 vegetarian capsules",
  "Optimized Broccoli with Myrosinase, 30 vegetarian capsules",
  "Optimized Carnitine, 60 capsules",
  "Optimized Chromium with Crominex® 3+, 500 mcg, 60 vegetarian capsules",
  "Optimized Cran-Max®, 60 vegetarian capsules",
  "Optimized Folate, 1700 mcg DFE, 100 vegetarian tablets",
  "Optimized Fucoidan with Maritech® 926, 60 vegetarian capsules",
  "Optimized Garlic, 200 vegetarian capsules",
  "Optimized Quercetin, 250 mg, 60 vegetarian capsules",
  "Optimized Resveratrol Elite™, 60 vegetarian capsules",
  "Optimized Saffron, 60 vegetarian capsules",
  "Optimized Tryptophan Plus, 90 vegetarian capsules",
  "PalmettoGuard® Saw Palmetto and Beta-Sitosterol, 30 softgels",
  "PalmettoGuard® Saw Palmetto, Nettle Root and Beta-Sitosterol, 60 softgels",
  "Pantothenic Acid, 500 mg, 100 vegetarian capsules",
  "Peony Immune, 60 vegetarian capsules",
  "Pomegranate Complete, 30 softgels",
  "Pomegranate Fruit Extract, 30 vegetarian capsules",
  "Potassium Iodide Tablets , 130 mg, 14 vegetarian tablets",
  "Potassium with Extend-Release Magnesium, 60 vegetarian capsules",
  "PQQ , 20 mg, 30 vegetarian capsules",
  "PQQ, 10 mg, 60 vegetarian capsules",
  "Pregnenolone, 100 mg, 100 capsules",
  "Pregnenolone, 50 mg, 100 capsules",
  "Prelox® Enhanced Sex, 60 tablets",
  "Prenatal Advantage, 120 easy-to-swallow softgels",
  "Pro-Resolving Mediators, 30 softgels",
  "Provinal® Purified Omega-7, 30 softgels",
  "PS Caps, 100 mg, 100 vegetarian capsules",
  "Pycnogenol®, 100 mg, 60 vegetarian capsules",
  "Pyridoxal 5'-Phosphate Caps, 100 mg, 60 vegetarian capsules",
  "Quick Brain Nootropic®, 30 vegetarian capsules",
  "Quiet Sleep Melatonin, 5 mg, 60 vegetarian capsules",
  "Rainforest Blend Decaf Ground Coffee, 12 oz",
  "Rainforest Blend Ground Coffee, 12 oz",
  "Rainforest Blend Whole Bean Coffee, 12 oz",
  "Reishi Extract Mushroom Complex, 60 vegetarian capsules",
  "Rest & Renew, 30 vegetarian capsules",
  "Resveratrol Elite™, 30 vegetarian capsules",
  "Rhodiola Extract , 250 mg, 60 vegetarian capsules",
  "SAMe, 400 mg, 30 enteric-coated vegetarian tablets",
  "SAMe, 400 mg, 60 enteric-coated vegetarian tablets",
  "SAMe, 200 mg, 30 enteric-coated vegetarian tablets",
  "Sea-Iodine™, 1000 mcg, 60 vegetarian capsules",
  "Se-Methyl L-Selenocysteine, 200 mcg, 90 vegetarian capsules",
  "Senolytic Activator®*, 36 vegetarian capsules",
  "Serene Sleep, 30 softgels",
  "Sexual Health for Her, 60 vegetarian capsules",
  "Shade Factor™, 120 vegetarian capsules",
  "Silymarin, 100 mg, 90 vegetarian capsules",
  "Skin Care Collection Anti-Aging Serum, 1.75 fl oz",
  "Skin Care Collection Day Cream, 1.65 oz",
  "Skin Care Collection Night Cream, 1.65 oz",
  "Skin Restoring Ceramides*, 30 liquid vegetarian capsules",
  "SOD Booster, 30 vegetarian capsules",
  "Soy Isoflavones, 30 vegetarian capsules",
  "Specially-Coated Bromelain, 500 mg, 60 enteric-coated vegetarian tablets",
  "Standardized Cistanche, 30 vegetarian capsules",
  "Standardized European Bilberry Extract, 100 mg, 90 vegetarian capsules",
  "Strontium Caps, 750 mg, 90 vegetarian capsules",
  "Super Absorbable Tocotrienols, 60 softgels",
  "Super Bio-Curcumin® Turmeric Extract, 60 vegetarian capsules",
  "Super Carnosine, 500 mg, 60 vegetarian capsules",
  "Super K , 90 softgels",
  "Super Miraforte with Standardized Lignans, 120 vegetarian capsules",
  "Super Omega-3 EPA/DHA Fish Oil, Sesame Lignans & Olive Extract, 120 softgels",
  "Super Omega-3 EPA/DHA Fish Oil, Sesame Lignans & Olive Extract, 240 easy-to-swallow softgels",
  "Super Omega-3 EPA/DHA Fish Oil, Sesame Lignans & Olive Extract, 60 softgels",
  "Super Omega-3 EPA/DHA Fish Oil, Sesame Lignans & Olive Extract (Enteric Coated), 60 enteric-coated softgels",
  "Super Omega-3 EPA/DHA Fish Oil, Sesame Lignans & Olive Extract (Enteric Coated), 120 enteric-coated softgels",
  "Super Omega-3 Plus EPA/DHA Fish Oil, Sesame Lignans, Olive Extract, Krill & Astaxanthin, 120 softgels",
  "Super R-Lipoic Acid, 240 mg, 60 vegetarian capsules",
  "Super Selenium Complex, 200 mcg, 100 vegetarian capsules",
  "Super Ubiquinol CoQ10, 100 mg, 60 softgels",
  "Super Ubiquinol CoQ10 with Enhanced Mitochondrial Support™, 100 mg, 30 softgels",
  "Super Ubiquinol CoQ10 with Enhanced Mitochondrial Support™, 50 mg, 100 softgels",
  "Super Ubiquinol CoQ10 with Enhanced Mitochondrial Support™, 50 mg, 30 softgels",
  "Super Ubiquinol CoQ10 with Enhanced Mitochondrial Support™, 100 mg, 60 softgels",
  "Super Ubiquinol CoQ10 with Enhanced Mitochondrial Support™, 200 mg, 30 softgels",
  "Super Ubiquinol CoQ10 with PQQ, 100 mg, 30 softgels",
  "Super Vitamin E, 268 mg (400 IU), 90 softgels",
  "Tart Cherry with CherryPURE®, 60 vegetarian capsules",
  "Taurine, 1000 mg, 90 vegetarian capsules",
  "Taurine Powder, 300 grams",
  "Tear Support with MaquiBright®, 60 mg, 30 vegetarian capsules",
  "Testosterone Elite, 30 vegetarian capsules",
  "Theaflavin Standardized Extract, 30 vegetarian capsules",
  "Theanine XR™ Stress Relief, 30 vegetarian tablets",
  "Thermo Weight Control, 60 vegetarian capsules",
  "Thyroid Support Complex, 60 capsules",
  "TMG, 500 mg, 60 liquid vegetarian capsules",
  "TMG Powder, 50 grams",
  "Tri Sugar Shield®, 60 vegetarian capsules",
  "Triple Action Blood Pressure, 60 vegetarian tablets",
  "Triple Strength ProstaPollen™, 30 softgels",
  "Two-Per-Day Multivitamin, 120 tablets",
  "Two-Per-Day Multivitamin, 60 tablets",
  "Two-Per-Day Multivitamin, 60 capsules",
  "Two-Per-Day Multivitamin, 120 capsules",
  "Ultra Memory & Recall™, 30 vegetarian capsules",
  "Ultra Prostate Formula, 60 softgels",
  "Uric Acid Control, 60 vegetarian capsules",
  "Vanadyl Sulfate, 7.5 mg, 100 vegetarian tablets",
  "Vegan Pro Collagen (Orange), 0.42 lb",
  "Vegan Vitamin D3, 125 mcg (5000 IU), 60 vegan capsules",
  "Vegetarian DHA, 30 vegetarian softgels",
  "VenoFlow™, 30 vegetarian capsules",
  "Venotone, 60 capsules",
  "Vinpocetine, 10 mg, 100 vegetarian tablets",
  "Vitamin B12 Methylcobalamin, 5 mg, 60 vegetarian lozenges",
  "Vitamin B12 Methylcobalamin, 500 mcg, 100 vegetarian lozenges",
  "Vitamin B12 Methylcobalamin, 1 mg, 60 vegetarian lozenges",
  "Vitamin B3 Niacin, 500 mg, 100 capsules",
  "Vitamin B6, 100 mg, 90 vegetarian capsules",
  "Vitamin C 24-Hour Liposomal Hydrogel™ Formula, 60 vegetarian tablets",
  "Vitamin C and Bio-Quercetin®, 60 vegetarian tablets",
  "Vitamin C and Bio-Quercetin®, 250 vegetarian tablets",
  "Vitamin D3, 25 mcg (1000 IU), 250 softgels",
  "Vitamin D3, 125 mcg (5000 IU), 60 softgels",
  "Vitamin D3, 175 mcg (7000 IU), 60 softgels",
  "Vitamin D3, 25 mcg (1000 IU), 90 softgels",
  "Vitamin D3 with Sea-Iodine™, 125 mcg (5000 IU), 60 capsules",
  "Vitamins D and K with Sea-Iodine™, 60 capsules",
  "Waistline Control™, 60 vegetarian capsules",
  "Water-Soluble Pumpkin Seed Extract, 60 vegetarian capsules",
  "Wellness Code® Advanced Whey Protein Isolate (Vanilla), 454 grams",
  "Wellness Code® Muscle Strength & Restore Formula, 3.32 oz",
  "Wellness Code® Plant Protein Complete & Amino Acid Complex (Vanilla), 450 grams",
  "Wellness Code® Whey Protein Concentrate (Chocolate), 640 grams",
  "Wellness Code® Whey Protein Concentrate (Vanilla), 500 grams",
  "Wellness Code® Whey Protein Isolate (Chocolate), 437 grams",
  "Wellness Code® Whey Protein Isolate (Vanilla), 403 grams",
  "Whole Food Multivitamin, 90 vegetarian capsules",
  "Women's Bladder Support, 60 vegetarian capsules",
  "X-R Shield, 90 vegetarian capsules",
  "Youthful Legs, 60 softgels",
  "Zinc Caps, 50 mg, 90 vegetarian capsules",
  "Zinc Lozenges (Citrus-Orange Flavor), 60 vegetarian lozenges",
];

/**
 * The ten Life Extension A-Z rows the workbook flags as not a standard human
 * dietary supplement: two pet mixes, four foods and beverages, four personal care
 * items. They keep their real classification rather than being folded into the
 * supplement count, and `humanSupplementListing` excludes them.
 */
const LIFE_EXTENSION_CLASSIFICATION_OVERRIDES: Readonly<Record<string, BrandClassification>> = {
  "California Estate Extra Virgin Olive Oil, 500 ml": "food_beverage",
  "Cat Mix, 100 grams": "pet_supplement",
  "Dog Mix, 100 grams": "pet_supplement",
  "Life Extension Toothpaste (Mint), 4 oz": "personal_care",
  "Rainforest Blend Decaf Ground Coffee, 12 oz": "food_beverage",
  "Rainforest Blend Ground Coffee, 12 oz": "food_beverage",
  "Rainforest Blend Whole Bean Coffee, 12 oz": "food_beverage",
  "Skin Care Collection Anti-Aging Serum, 1.75 fl oz": "personal_care",
  "Skin Care Collection Day Cream, 1.65 oz": "personal_care",
  "Skin Care Collection Night Cream, 1.65 oz": "personal_care",
};

/** The note the workbook attaches to each of those ten rows, verbatim. */
const LIFE_EXTENSION_OVERRIDE_NOTE =
  "Flagged because this official catalog entry is not a standard human dietary supplement.";

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/**
 * The slug rule, in one place so it is reproducible: lower case, ampersand to "and",
 * plus to "plus", percent to "percent", every other non alphanumeric run to a single
 * hyphen, then trimmed. Prefixed by brand. A test re-derives all 911 independently
 * and asserts they are unique.
 */
export function brandSlug(brand: Brand, canonicalName: string): string {
  const body = canonicalName
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll("+", " plus ")
    .replaceAll("%", " percent ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${BRAND_SLUG_PREFIXES[brand]}-${body}`;
}

// ---------------------------------------------------------------------------
// Public price parsing
// ---------------------------------------------------------------------------

/**
 * The only public price the workbook states as a number. Parsed once, explicitly,
 * rather than by a regex over free text, so a new price string cannot silently
 * become an amount.
 */
const PUBLIC_PRICE_AMOUNTS: Readonly<Record<string, { cents: number; basis: string }>> = {
  "$199/year": { cents: 19900, basis: "per year" },
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** The two modes that let a member buy. No record in this module may hold one. */
const PURCHASE_MODES: ReadonlySet<OfferAvailabilityMode> = new Set<OfferAvailabilityMode>([
  "DIRECT_PRIVATE_PURCHASE",
  "APPROVAL_REQUIRED_PURCHASE",
]);

export function isPurchaseMode(mode: OfferAvailabilityMode): boolean {
  return PURCHASE_MODES.has(mode);
}

function buildProduct(brand: Brand, seed: BrandSeed): BrandProduct {
  const [
    canonicalName,
    catalogType,
    classification,
    variantOrSize,
    publicPriceText,
    coverageStatus,
    sourceUrl,
    sheetNote,
  ] = seed;

  const parsedPrice = publicPriceText === null ? undefined : PUBLIC_PRICE_AMOUNTS[publicPriceText];

  // A finished consumer good is gated by supplier authorization and label
  // documentation rather than by a lot certificate of analysis, and a lab service
  // has no lot at all. Either way this is not a route to a stronger mode: with no
  // approved amount and no supplier item code, the resolver cannot climb.
  const coaEvidence: CoaEvidenceState = "NOT_APPLICABLE";

  const availability = resolvePrivateLaneOfferMode({
    // The resale lane. Chosen deliberately: it is the strictest lane in the
    // resolver, because identity there requires the SUPPLIER's own item code, which
    // no row in this workbook has. The lane union has no service member, and adding
    // one to make a blood panel offerable is exactly the change this file refuses.
    lane: "supplement",
    // No pricing decision exists for any of these rows. The brand's own public price
    // is not an approved member amount and is deliberately not passed here.
    approvedMemberAmountCents: null,
    supplierSkuCode: null,
    internalVariantSku: null,
    coaEvidence,
    unavailable: false,
  });

  // Belt and braces. The resolver already cannot return a purchase mode from the
  // evidence above, and this makes a future data edit that changed that fail at
  // module load rather than quietly put a blood panel or an unauthorized brand
  // product in front of a member.
  if (isPurchaseMode(availability)) {
    throw new Error(
      `Brand catalog row resolved to a purchase mode with no wholesale cost, no supplier item code, and no approved amount: ${canonicalName}`,
    );
  }

  const isService = classification === SERVICE_CLASSIFICATION;

  const missingInputs = [
    ...UNIVERSAL_MISSING_INPUTS,
    ...(isService ? SERVICE_MISSING_INPUTS : []),
    ...(classification !== "human_supplement" && !isService ? [NON_SUPPLEMENT_MISSING_INPUT] : []),
    ...(publicPriceText !== null && parsedPrice === undefined
      ? [QUALITATIVE_PRICE_MISSING_INPUT]
      : []),
  ];

  return {
    canonicalName,
    displayName: canonicalName,
    slug: brandSlug(brand, canonicalName),
    brand,
    catalogType,
    classification,
    variantOrSize,
    publicPriceText,
    publicPriceCents: parsedPrice?.cents ?? null,
    publicPriceBasis: parsedPrice?.basis ?? null,
    coverageStatus,
    sourceUrl,
    verifiedDate: BRAND_CATALOG_VERIFIED_DATE,
    sheetNote,
    availability,
    // A service is not waiting on supplier paperwork, it is waiting on a decision
    // about whether it belongs here at all. That is NOT_OFFERED, not "nearly ready".
    readiness: isService ? "NOT_OFFERED" : "NEEDS_SUPPLIER_DOCUMENTATION",
    coaEvidence,
    resellerAuthorization: "not_evidenced",
    wholesaleSourceCostCents: unresolved(...WHOLESALE_MISSING_INPUTS),
    approvedMemberAmountCents: unresolved(...APPROVED_AMOUNT_MISSING_INPUTS),
    formFactor: unresolved(...FORM_FACTOR_MISSING_INPUTS),
    sourceReference: BRAND_CATALOG_SOURCE_REFERENCE,
    missingInputs,
  };
}

function buildAToZ(
  brand: "pure_encapsulations" | "life_extension",
  names: readonly string[],
  overrides: Readonly<Record<string, BrandClassification>>,
  overrideNote: string | null,
): readonly BrandProduct[] {
  return names.map((name) => {
    const override = overrides[name];
    return buildProduct(brand, [
      name,
      "official_a_to_z_entry",
      override ?? "human_supplement",
      null,
      null,
      "official_a_to_z_snapshot",
      A_TO_Z_SOURCE_URLS[brand],
      override ? overrideNote : null,
    ]);
  });
}

/** All 911 rows, in the workbook's own order: Momentous, Pure Encapsulations, Life Extension, Superpower. */
export const BRAND_CATALOG: readonly BrandProduct[] = [
  ...MOMENTOUS_SEEDS.map((seed) => buildProduct("momentous", seed)),
  ...buildAToZ("pure_encapsulations", PURE_ENCAPSULATIONS_A_TO_Z, {}, null),
  ...buildAToZ(
    "life_extension",
    LIFE_EXTENSION_A_TO_Z,
    LIFE_EXTENSION_CLASSIFICATION_OVERRIDES,
    LIFE_EXTENSION_OVERRIDE_NOTE,
  ),
  ...SUPERPOWER_SEEDS.map((seed) => buildProduct("superpower", seed)),
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const BY_SLUG: ReadonlyMap<string, BrandProduct> = new Map(
  BRAND_CATALOG.map((product) => [product.slug, product]),
);

export function findBrandProductBySlug(slug: string): BrandProduct | undefined {
  return BY_SLUG.get(slug);
}

export function brandProducts(brand: Brand): readonly BrandProduct[] {
  return BRAND_CATALOG.filter((product) => product.brand === brand);
}

export function brandProductsInClassification(
  classification: BrandClassification,
): readonly BrandProduct[] {
  return BRAND_CATALOG.filter((product) => product.classification === classification);
}

/**
 * The human supplement listing.
 *
 * Only rows the workbook classifies as a human supplement. Pet mixes, foods,
 * personal care, the topical lotion, and every blood testing service are excluded,
 * because a listing that mixed them would tell a member something untrue about what
 * they are looking at.
 */
export function humanSupplementListing(): readonly BrandProduct[] {
  return BRAND_CATALOG.filter((product) => product.classification === "human_supplement");
}

/** The Superpower service rows, held apart from every product listing. */
export function serviceRecords(): readonly BrandProduct[] {
  return BRAND_CATALOG.filter((product) => product.classification === SERVICE_CLASSIFICATION);
}

/** Should always be empty. A test asserts it, and `buildProduct` throws before it could fill. */
export function purchasableBrandProducts(): readonly BrandProduct[] {
  return BRAND_CATALOG.filter((product) => isPurchaseMode(product.availability));
}

export function countsByBrand(): Readonly<Record<Brand, number>> {
  const counts = Object.fromEntries(BRANDS.map((brand) => [brand, 0])) as Record<Brand, number>;
  for (const product of BRAND_CATALOG) {
    counts[product.brand] += 1;
  }
  return counts;
}

export function countsByClassification(): Readonly<Record<BrandClassification, number>> {
  const counts = Object.fromEntries(
    BRAND_CLASSIFICATIONS.map((classification) => [classification, 0]),
  ) as Record<BrandClassification, number>;
  for (const product of BRAND_CATALOG) {
    counts[product.classification] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// The member safe projection
// ---------------------------------------------------------------------------

/**
 * The only brand catalog fields that may reach a browser.
 *
 * Built by explicit pick, never by spreading the record, so a field added to
 * `BrandProduct` cannot leak here by default. Source reference, missing inputs,
 * reseller state, the sheet note, and both unresolved money fields stay internal.
 *
 * `amountCents` is typed as the literal `null`, not `number | null`. That makes a
 * priced brand card a COMPILE error rather than a runtime rule, which is the correct
 * strength for a catalog where no amount has been approved for anything.
 */
export interface MemberBrandCard {
  slug: string;
  displayName: string;
  brand: Brand;
  classification: BrandClassification;
  catalogType: BrandCatalogType;
  availability: OfferAvailabilityMode;
  amountCents: null;
}

export function toMemberBrandCard(product: BrandProduct): MemberBrandCard {
  return {
    slug: product.slug,
    displayName: product.displayName,
    brand: product.brand,
    classification: product.classification,
    catalogType: product.catalogType,
    availability: product.availability,
    amountCents: null,
  };
}
