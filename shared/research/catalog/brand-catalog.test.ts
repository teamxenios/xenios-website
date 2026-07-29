import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePrivateLaneOfferMode } from "./offer-readiness";
import {
  BRAND_CATALOG,
  BRAND_CATALOG_TYPES,
  BRAND_CATALOG_VERIFIED_DATE,
  BRAND_CLASSIFICATIONS,
  BRAND_COMPANY_NAMES,
  BRAND_COVERAGE_STATUSES,
  BRAND_SLUG_PREFIXES,
  BRANDS,
  brandProducts,
  brandProductsInClassification,
  brandSlug,
  countsByBrand,
  countsByClassification,
  DASH_NORMALISED_SLUGS,
  findBrandProductBySlug,
  humanSupplementListing,
  isPurchaseMode,
  purchasableBrandProducts,
  serviceRecords,
  toMemberBrandCard,
  type Brand,
  type BrandClassification,
  type BrandProduct,
} from "./brand-catalog";

/**
 * How this test checks the transcription.
 *
 * The source workbook is not in the repository, so a test that read it would pass on
 * one machine and fail everywhere else. Instead the check is a pinned digest: the
 * SHA-256 below were computed in a SEPARATE pass over the workbook's "Master Catalog"
 * sheet, not over the emitted module, so any later hand edit to a name, a catalog
 * type, a classification, a variant, a price, a coverage status, or a url changes the
 * digest and fails the build. That is the same protection a 911 row literal table
 * would give, without a second 80 kilobyte copy of the data drifting beside the first.
 *
 * On top of the digests, the rows that carry real decisions are transcribed in full
 * below: all 38 Superpower service rows, all 11 rows that are not human supplements,
 * every row with a price, and the first and last name of every brand block.
 */
/**
 * Written as escapes on purpose. This directory forbids both characters in every
 * file, so a test that asserted against a literal one would be the violation it was
 * written to catch.
 */
const EN_DASH = "\u2013";
const EM_DASH = "\u2014";

const NAME_DIGESTS: Readonly<Record<Brand, string>> = {
  momentous: "5aa53335bc851e21536a3e922073a2698efe9ebb19026864ac3dcaeb72df6ad5",
  pure_encapsulations: "4042cf0aa4e6084553d24933d740ebf37fcc9c63babc815bd4a3a4652dedca30",
  life_extension: "da9cd6b1c094d7a38f728ff5d322db2f0ddf18a86dfd8a35f3ef8066fa7740e2",
  superpower: "ade20a736e252da4e913515aceba9fd441fe5ea9100a4d5c25abfcdf20ee26dd",
};

const ROW_DIGESTS: Readonly<Record<Brand, string>> = {
  momentous: "40c7b7400948137545408554b0597da33ebd1833deb495a75a753c8b365c30a4",
  pure_encapsulations: "00068dce35f70b85d38906ac4942dc8a2be21b041a254f6af45372d87d0468ce",
  life_extension: "2ddc950badc7c3ad31029b16db61163a144073945496b48032c698d6fdac6002",
  superpower: "ca55fb0d3f691439cc400e4e19da70a54a97c9f22f7b6679a543a0de464b42c0",
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** The exact field order the pinned row digests were computed over. */
function rowFingerprint(product: BrandProduct): string {
  return [
    product.slug,
    product.canonicalName,
    product.catalogType,
    product.classification,
    product.variantOrSize ?? "",
    product.publicPriceText ?? "",
    product.coverageStatus,
    product.sourceUrl,
  ].join("|");
}

/** Every Superpower row, transcribed from the sheet: name, catalog type, price text. */
const SUPERPOWER_ROWS: ReadonlyArray<[string, string, string | null]> = [
  ["Baseline blood panel", "core_testing_panel", null],
  ["Advanced blood panel", "core_testing_panel", null],
  ["Women's core hormones", "add_on_testing_panel", null],
  ["Organic acids test", "add_on_testing_panel", null],
  ["Organ age panel", "add_on_testing_panel", null],
  ["Men's core hormones", "add_on_testing_panel", null],
  ["Weight and appetite hormones", "add_on_testing_panel", null],
  ["Vitamin levels", "add_on_testing_panel", null],
  ["Thyroid antibodies", "add_on_testing_panel", null],
  ["Respiratory allergy panel", "add_on_testing_panel", null],
  ["Prostate screening (PSA)", "add_on_testing_panel", null],
  ["Cholesterol damage", "add_on_testing_panel", null],
  ["Nutrition panel", "add_on_testing_panel", null],
  ["Mycotoxins", "add_on_testing_panel", null],
  ["Heavy metals", "add_on_testing_panel", null],
  ["Mineral levels", "add_on_testing_panel", null],
  ["Methylation panel", "add_on_testing_panel", null],
  ["Lipoprotein (a)", "add_on_testing_panel", null],
  ["Insulin and blood sugar", "add_on_testing_panel", null],
  ["Fertility planning", "add_on_testing_panel", null],
  ["Extended women's health panel", "add_on_testing_panel", null],
  ["Extended metabolic health panel", "add_on_testing_panel", null],
  ["Extended men's health panel", "add_on_testing_panel", null],
  ["Extended heart health panel", "add_on_testing_panel", null],
  ["Autoimmune health panel", "add_on_testing_panel", null],
  ["Environmental toxins", "add_on_testing_panel", null],
  ["Celiac and gluten sensitivity", "add_on_testing_panel", null],
  ["Blood vessel function", "add_on_testing_panel", null],
  ["Autoimmune screening", "add_on_testing_panel", null],
  ["New York / New Jersey regional offering", "regional_testing_panel", null],
  ["Superpower annual membership", "membership", "$199/year"],
  ["At-home phlebotomy / lab draw", "collection_service", "Additional fee"],
  ["Gift Superpower / gift membership", "gift_product", null],
  ["GRAIL Galleri cancer screen", "partner_add_on", null],
  ["Marketplace access - supplements", "marketplace_category", null],
  ["Marketplace access - peptides", "marketplace_category", null],
  ["Marketplace access - prescriptions", "marketplace_category", null],
  ["Partner-lab blood draw at 2,000+ locations", "collection_service", "Included / varies"],
];

/**
 * Every row the workbook classifies as something other than a human supplement, apart
 * from the Superpower service rows above. Eleven in total.
 */
const NON_HUMAN_SUPPLEMENT_ROWS: ReadonlyArray<[Brand, string, BrandClassification]> = [
  ["momentous", "PR Lotion", "topical_non_supplement"],
  ["life_extension", "California Estate Extra Virgin Olive Oil, 500 ml", "food_beverage"],
  ["life_extension", "Cat Mix, 100 grams", "pet_supplement"],
  ["life_extension", "Dog Mix, 100 grams", "pet_supplement"],
  ["life_extension", "Life Extension Toothpaste (Mint), 4 oz", "personal_care"],
  ["life_extension", "Rainforest Blend Decaf Ground Coffee, 12 oz", "food_beverage"],
  ["life_extension", "Rainforest Blend Ground Coffee, 12 oz", "food_beverage"],
  ["life_extension", "Rainforest Blend Whole Bean Coffee, 12 oz", "food_beverage"],
  ["life_extension", "Skin Care Collection Anti-Aging Serum, 1.75 fl oz", "personal_care"],
  ["life_extension", "Skin Care Collection Day Cream, 1.65 oz", "personal_care"],
  ["life_extension", "Skin Care Collection Night Cream, 1.65 oz", "personal_care"],
];

/** The first and last product name of each brand block, so row order is pinned too. */
const BRAND_BLOCK_ANCHORS: Readonly<Record<Brand, [string, string]>> = {
  momentous: ["Creatine - 60 Servings", "Brain, Body, and Sleep Stack - Modern Wisdom"],
  pure_encapsulations: ["+CAL+ with Ipriflavone", "Zinc liquid 15 mg 120 ml"],
  life_extension: [
    "7-Keto® DHEA Metabolite, 100 mg, 60 vegetarian capsules",
    "Zinc Lozenges (Citrus-Orange Flavor), 60 vegetarian lozenges",
  ],
  superpower: ["Baseline blood panel", "Partner-lab blood draw at 2,000+ locations"],
};

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");

// ---------------------------------------------------------------------------

describe("the 911 rows match the workbook", () => {
  it("holds exactly 911 records", () => {
    expect(BRAND_CATALOG).toHaveLength(911);
  });

  it("counts every brand exactly as the workbook does", () => {
    expect(countsByBrand()).toEqual({
      momentous: 76,
      pure_encapsulations: 413,
      life_extension: 384,
      superpower: 38,
    });
  });

  it("counts every classification exactly as the workbook does", () => {
    expect(countsByClassification()).toEqual({
      human_supplement: 862,
      food_beverage: 4,
      personal_care: 4,
      pet_supplement: 2,
      topical_non_supplement: 1,
      blood_testing_health_service: 38,
    });
  });

  it("splits classification by brand the way the sheet does", () => {
    const pairs = BRAND_CATALOG.reduce<Record<string, number>>((acc, product) => {
      const key = `${product.brand}/${product.classification}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    expect(pairs).toEqual({
      "momentous/human_supplement": 75,
      "momentous/topical_non_supplement": 1,
      "pure_encapsulations/human_supplement": 413,
      "life_extension/human_supplement": 374,
      "life_extension/food_beverage": 4,
      "life_extension/pet_supplement": 2,
      "life_extension/personal_care": 4,
      "superpower/blood_testing_health_service": 38,
    });
  });

  it("counts every catalog type exactly as the workbook does", () => {
    const counts = BRAND_CATALOG.reduce<Record<string, number>>((acc, product) => {
      acc[product.catalogType] = (acc[product.catalogType] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      individual_supplement: 31,
      travel_variant: 8,
      stack_bundle: 25,
      sports_nutrition: 7,
      flavor_variant: 2,
      packet_variant: 1,
      size_bundle_variant: 1,
      topical: 1,
      official_a_to_z_entry: 797,
      core_testing_panel: 2,
      add_on_testing_panel: 27,
      regional_testing_panel: 1,
      membership: 1,
      collection_service: 2,
      gift_product: 1,
      partner_add_on: 1,
      marketplace_category: 3,
    });
  });

  it("counts every coverage status exactly as the workbook does", () => {
    const counts = BRAND_CATALOG.reduce<Record<string, number>>((acc, product) => {
      acc[product.coverageStatus] = (acc[product.coverageStatus] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      current_official_product_page: 69,
      official_help_catalog: 7,
      official_a_to_z_snapshot: 797,
      current_public_offering: 38,
    });
  });

  it("matches the name digest computed from the source sheet, per brand", () => {
    for (const brand of BRANDS) {
      const names = brandProducts(brand).map((product) => product.canonicalName);
      expect(sha256(names.join("\n")), `${brand} names`).toBe(NAME_DIGESTS[brand]);
    }
  });

  it("matches the full row digest computed from the source sheet, per brand", () => {
    for (const brand of BRANDS) {
      const fingerprints = brandProducts(brand).map(rowFingerprint);
      expect(sha256(fingerprints.join("\n")), `${brand} rows`).toBe(ROW_DIGESTS[brand]);
    }
  });

  it("keeps the workbook's row order, anchored at both ends of each brand block", () => {
    for (const brand of BRANDS) {
      const rows = brandProducts(brand);
      const [first, last] = BRAND_BLOCK_ANCHORS[brand];
      expect(rows[0].canonicalName, `${brand} first row`).toBe(first);
      expect(rows[rows.length - 1].canonicalName, `${brand} last row`).toBe(last);
    }
  });

  it("carries every Superpower row with its exact catalog type and price text", () => {
    const rows = brandProducts("superpower");
    expect(rows).toHaveLength(SUPERPOWER_ROWS.length);
    SUPERPOWER_ROWS.forEach(([name, catalogType, priceText], index) => {
      const product = rows[index];
      expect(product.canonicalName).toBe(name);
      expect(product.catalogType).toBe(catalogType);
      expect(product.publicPriceText).toBe(priceText);
      expect(product.classification).toBe("blood_testing_health_service");
      expect(product.coverageStatus).toBe("current_public_offering");
    });
  });

  it("stamps the same verified date, as an ISO date and never as an Excel serial", () => {
    expect(BRAND_CATALOG_VERIFIED_DATE).toBe("2026-07-29");
    for (const product of BRAND_CATALOG) {
      expect(product.verifiedDate).toBe("2026-07-29");
      expect(product.verifiedDate).not.toContain("46232");
    }
  });

  it("points every row at its own brand's site over https", () => {
    const hosts: Readonly<Record<Brand, string>> = {
      momentous: "livemomentous.com",
      pure_encapsulations: "pureencapsulationspro.com",
      life_extension: "lifeextension.com",
      superpower: "superpower.com",
    };
    for (const product of BRAND_CATALOG) {
      expect(product.sourceUrl.startsWith("https://"), product.slug).toBe(true);
      expect(product.sourceUrl, product.slug).toContain(hosts[product.brand]);
    }
  });

  it("names every company exactly as the workbook writes it", () => {
    expect(Object.values(BRAND_COMPANY_NAMES)).toEqual([
      "Momentous",
      "Pure Encapsulations",
      "Life Extension",
      "Superpower",
    ]);
  });
});

describe("slugs", () => {
  it("gives all 911 rows a distinct slug", () => {
    const slugs = BRAND_CATALOG.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(911);
  });

  it("re-derives every slug from the canonical name, independently", () => {
    for (const product of BRAND_CATALOG) {
      const body = product.canonicalName
        .toLowerCase()
        .split("&")
        .join(" and ")
        .split("+")
        .join(" plus ")
        .split("%")
        .join(" percent ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      expect(product.slug, product.canonicalName).toBe(
        `${BRAND_SLUG_PREFIXES[product.brand]}-${body}`,
      );
    }
  });

  it("prefixes by brand, so a slug always says which catalog it came from", () => {
    for (const product of BRAND_CATALOG) {
      expect(
        product.slug.startsWith(`${BRAND_SLUG_PREFIXES[product.brand]}-`),
        product.slug,
      ).toBe(true);
    }
  });

  it("holds no empty, uppercase, or double hyphenated slug", () => {
    for (const product of BRAND_CATALOG) {
      expect(product.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("looks a row up by slug and returns nothing for an unknown one", () => {
    expect(findBrandProductBySlug("mom-pr-lotion")?.canonicalName).toBe("PR Lotion");
    expect(findBrandProductBySlug("not-a-slug")).toBeUndefined();
  });

  it("exposes the slug rule so a caller cannot invent a second one", () => {
    expect(brandSlug("life_extension", "Cat Mix, 100 grams")).toBe("le-cat-mix-100-grams");
    expect(brandSlug("momentous", "Fiber+")).toBe("mom-fiber-plus");
  });
});

describe("nothing here is purchasable, and that is structural", () => {
  it("resolves every one of the 911 rows to DISPLAY_ONLY", () => {
    for (const product of BRAND_CATALOG) {
      expect(product.availability, product.slug).toBe("DISPLAY_ONLY");
    }
  });

  it("holds zero purchasable rows", () => {
    expect(purchasableBrandProducts()).toEqual([]);
  });

  it("matches what the shared resolver derives from each row's own evidence", () => {
    for (const product of BRAND_CATALOG) {
      const derived = resolvePrivateLaneOfferMode({
        lane: "supplement",
        approvedMemberAmountCents: product.approvedMemberAmountCents.value,
        supplierSkuCode: null,
        internalVariantSku: null,
        coaEvidence: product.coaEvidence,
        unavailable: false,
      });
      expect(product.availability, product.slug).toBe(derived);
    }
  });

  it("holds no wholesale cost and no approved amount anywhere, with named missing inputs", () => {
    for (const product of BRAND_CATALOG) {
      expect(product.wholesaleSourceCostCents.value).toBeNull();
      expect(product.approvedMemberAmountCents.value).toBeNull();
      expect(product.wholesaleSourceCostCents.missingInputs.join(" ")).toContain(
        "wholesale source cost",
      );
      expect(product.approvedMemberAmountCents.missingInputs.join(" ")).toContain(
        "founder approved customer amount",
      );
    }
  });

  it("records no reseller authorization for any row", () => {
    for (const product of BRAND_CATALOG) {
      expect(product.resellerAuthorization).toBe("not_evidenced");
      expect(product.missingInputs.join(" | ")).toContain("reseller authorization");
    }
  });

  it("lists what every row is still waiting on", () => {
    for (const product of BRAND_CATALOG) {
      const joined = product.missingInputs.join(" | ");
      expect(joined, product.slug).toContain("Wholesale source cost");
      expect(joined, product.slug).toContain("Supplier item code");
      expect(joined, product.slug).toContain("serving size");
      expect(joined, product.slug).toContain("allergen");
    }
  });

  it("leaves the form factor null with a named missing input on every row", () => {
    for (const product of BRAND_CATALOG) {
      expect(product.formFactor.value).toBeNull();
      expect(product.formFactor.missingInputs.join(" ")).toContain("specification sheet");
    }
  });

  it("agrees with the purchase mode helper", () => {
    expect(isPurchaseMode("DIRECT_PRIVATE_PURCHASE")).toBe(true);
    expect(isPurchaseMode("APPROVAL_REQUIRED_PURCHASE")).toBe(true);
    expect(isPurchaseMode("REQUEST_ACCESS_ONLY")).toBe(false);
    expect(isPurchaseMode("DISPLAY_ONLY")).toBe(false);
    expect(isPurchaseMode("UNAVAILABLE")).toBe(false);
  });
});

describe("Superpower is a service and can never be purchased here", () => {
  it("holds all 38 rows under the service classification and nothing else", () => {
    const service = serviceRecords();
    expect(service).toHaveLength(38);
    expect(new Set(service.map((product) => product.brand))).toEqual(new Set(["superpower"]));
    expect(brandProductsInClassification("blood_testing_health_service")).toEqual(service);
  });

  it("never lets a Superpower row reach any purchase mode", () => {
    for (const product of serviceRecords()) {
      expect(isPurchaseMode(product.availability), product.slug).toBe(false);
      expect(product.availability, product.slug).toBe("DISPLAY_ONLY");
    }
  });

  it("cannot be talked into a purchase mode by its own evidence", () => {
    // The strongest mode the resolver will give a service row, handed the most
    // favourable evidence the workbook could ever supply for it: the public price
    // read as if it were approved, and lab evidence on file. It is still not a
    // purchase, because no supplier item code identifies what would be delivered.
    for (const product of serviceRecords()) {
      const derived = resolvePrivateLaneOfferMode({
        lane: "supplement",
        approvedMemberAmountCents: product.publicPriceCents,
        supplierSkuCode: null,
        internalVariantSku: "would-be-internal-id",
        coaEvidence: "ON_FILE",
        unavailable: false,
      });
      expect(isPurchaseMode(derived), product.slug).toBe(false);
    }
  });

  it("holds every service row at NOT_OFFERED, not at nearly ready", () => {
    for (const product of serviceRecords()) {
      expect(product.readiness).toBe("NOT_OFFERED");
    }
  });

  it("names the clinical decision as the missing input on every service row", () => {
    for (const product of serviceRecords()) {
      const joined = product.missingInputs.join(" | ");
      expect(joined, product.slug).toContain("Care rail question");
      expect(joined, product.slug).toContain("Named clinician");
    }
  });

  it("keeps the clinical rows in the record, named, rather than quietly dropped", () => {
    const names = serviceRecords().map((product) => product.canonicalName);
    expect(names).toContain("Prostate screening (PSA)");
    expect(names).toContain("GRAIL Galleri cancer screen");
    expect(names).toContain("Marketplace access - prescriptions");
    expect(names).toContain("Fertility planning");
  });

  it("ties readiness to supplier documentation for every non service row", () => {
    for (const product of BRAND_CATALOG) {
      if (product.classification === "blood_testing_health_service") continue;
      expect(product.readiness, product.slug).toBe("NEEDS_SUPPLIER_DOCUMENTATION");
    }
  });
});

describe("classifications are kept apart, not folded together", () => {
  it("transcribes every non human supplement row from the sheet", () => {
    const rows = BRAND_CATALOG.filter(
      (product) =>
        product.classification !== "human_supplement" &&
        product.classification !== "blood_testing_health_service",
    );
    expect(rows).toHaveLength(NON_HUMAN_SUPPLEMENT_ROWS.length);
    const actual = rows
      .map((product) => `${product.brand}|${product.canonicalName}|${product.classification}`)
      .sort();
    const expected = NON_HUMAN_SUPPLEMENT_ROWS.map(
      ([brand, name, classification]) => `${brand}|${name}|${classification}`,
    ).sort();
    expect(actual).toEqual(expected);
    for (const [brand, name, classification] of NON_HUMAN_SUPPLEMENT_ROWS) {
      const product = findBrandProductBySlug(brandSlug(brand, name));
      expect(product?.classification, name).toBe(classification);
    }
  });

  it("excludes pet products from the human supplement listing", () => {
    const listing = humanSupplementListing();
    const petSlugs = brandProductsInClassification("pet_supplement").map((p) => p.slug);
    expect(petSlugs).toEqual(["le-cat-mix-100-grams", "le-dog-mix-100-grams"]);
    for (const slug of petSlugs) {
      expect(listing.some((product) => product.slug === slug), slug).toBe(false);
    }
    for (const name of ["Cat Mix", "Dog Mix"]) {
      expect(listing.some((product) => product.canonicalName.includes(name)), name).toBe(false);
    }
  });

  it("excludes food, personal care, the topical, and every service from that listing", () => {
    const listing = humanSupplementListing();
    expect(listing).toHaveLength(862);
    for (const product of listing) {
      expect(product.classification, product.slug).toBe("human_supplement");
    }
    const excluded = 911 - listing.length;
    expect(excluded).toBe(4 + 4 + 2 + 1 + 38);
  });

  it("flags every non supplement row with its own category missing input", () => {
    for (const [brand, name] of NON_HUMAN_SUPPLEMENT_ROWS) {
      const product = findBrandProductBySlug(brandSlug(brand, name));
      expect(product?.missingInputs.join(" | "), name).toContain("Category decision");
    }
    for (const product of humanSupplementListing()) {
      expect(product.missingInputs.join(" | "), product.slug).not.toContain("Category decision");
    }
  });

  it("keeps the closed unions closed", () => {
    const classifications = new Set(BRAND_CATALOG.map((product) => product.classification));
    const types = new Set(BRAND_CATALOG.map((product) => product.catalogType));
    const coverage = new Set(BRAND_CATALOG.map((product) => product.coverageStatus));
    for (const value of classifications) expect(BRAND_CLASSIFICATIONS).toContain(value);
    for (const value of types) expect(BRAND_CATALOG_TYPES).toContain(value);
    for (const value of coverage) expect(BRAND_COVERAGE_STATUSES).toContain(value);
    expect(classifications.size).toBe(BRAND_CLASSIFICATIONS.length);
    expect(coverage.size).toBe(BRAND_COVERAGE_STATUSES.length);
    expect(types.size).toBe(BRAND_CATALOG_TYPES.length);
  });
});

describe("prices are the brand's, not ours", () => {
  it("carries a price text on exactly three rows, all Superpower", () => {
    const priced = BRAND_CATALOG.filter((product) => product.publicPriceText !== null);
    expect(priced.map((product) => [product.slug, product.publicPriceText])).toEqual([
      ["sp-superpower-annual-membership", "$199/year"],
      ["sp-at-home-phlebotomy-lab-draw", "Additional fee"],
      ["sp-partner-lab-blood-draw-at-2-000-plus-locations", "Included / varies"],
    ]);
  });

  it("parses an amount only where the sheet states an unambiguous one", () => {
    const withAmount = BRAND_CATALOG.filter((product) => product.publicPriceCents !== null);
    expect(withAmount).toHaveLength(1);
    expect(withAmount[0].slug).toBe("sp-superpower-annual-membership");
    expect(withAmount[0].publicPriceCents).toBe(19900);
    expect(withAmount[0].publicPriceBasis).toBe("per year");
  });

  it("leaves a qualitative price unparsed and says why", () => {
    for (const slug of [
      "sp-at-home-phlebotomy-lab-draw",
      "sp-partner-lab-blood-draw-at-2-000-plus-locations",
    ]) {
      const product = findBrandProductBySlug(slug);
      expect(product?.publicPriceCents).toBeNull();
      expect(product?.publicPriceBasis).toBeNull();
      expect(product?.missingInputs.join(" | "), slug).toContain("A stated amount");
    }
  });

  it("never turns a public price into an approved member amount", () => {
    for (const product of BRAND_CATALOG) {
      expect(product.approvedMemberAmountCents.value).toBeNull();
    }
    const membership = findBrandProductBySlug("sp-superpower-annual-membership");
    expect(membership?.publicPriceCents).toBe(19900);
    expect(membership?.approvedMemberAmountCents.value).toBeNull();
    expect(membership?.availability).toBe("DISPLAY_ONLY");
  });

  it("holds no price of zero anywhere", () => {
    for (const product of BRAND_CATALOG) {
      expect(product.publicPriceCents).not.toBe(0);
    }
  });
});

describe("the member projection keeps internal fields internal", () => {
  it("carries only the allowed keys", () => {
    for (const product of BRAND_CATALOG) {
      const card = toMemberBrandCard(product);
      expect(Object.keys(card).sort()).toEqual([
        "amountCents",
        "availability",
        "brand",
        "catalogType",
        "classification",
        "displayName",
        "slug",
      ]);
    }
  });

  it("can never carry an amount, a source reference, or the reseller state", () => {
    for (const product of BRAND_CATALOG) {
      const serialized = JSON.stringify(toMemberBrandCard(product));
      expect(serialized).not.toContain("not_evidenced");
      expect(serialized).not.toContain("Master catalog workbook");
      expect(serialized).not.toContain("19900");
      expect(serialized).not.toContain("199");
      expect(toMemberBrandCard(product).amountCents).toBeNull();
    }
  });

  it("shows the classification, so a member is never told a pet mix is a supplement", () => {
    const cat = findBrandProductBySlug("le-cat-mix-100-grams");
    expect(cat).toBeDefined();
    expect(toMemberBrandCard(cat!).classification).toBe("pet_supplement");
    const panel = findBrandProductBySlug("sp-baseline-blood-panel");
    expect(toMemberBrandCard(panel!).classification).toBe("blood_testing_health_service");
  });
});

describe("house style and boundaries", () => {
  it("normalises the sheet's en dashes and records which rows were affected", () => {
    expect(DASH_NORMALISED_SLUGS).toEqual([
      "sp-marketplace-access-supplements",
      "sp-marketplace-access-peptides",
      "sp-marketplace-access-prescriptions",
    ]);
    for (const slug of DASH_NORMALISED_SLUGS) {
      const product = findBrandProductBySlug(slug);
      expect(product?.canonicalName, slug).toContain("Marketplace access - ");
    }
  });

  it("stores no em or en dash in any field of any record", () => {
    const everyString = JSON.stringify(BRAND_CATALOG);
    expect(everyString).not.toContain(EM_DASH);
    expect(everyString).not.toContain(EN_DASH);
  });

  it("keeps house style: no em or en dashes anywhere in this directory", () => {
    for (const entry of readdirSync(HERE)) {
      if (!entry.endsWith(".ts")) continue;
      const source = readFileSync(path.join(HERE, entry), "utf8");
      expect(source.includes(EM_DASH), `${entry} contains an em dash`).toBe(false);
      expect(source.includes(EN_DASH), `${entry} contains an en dash`).toBe(false);
    }
  });

  it("is not imported by any client file", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules") continue;
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx)$/.test(entry)) continue;
        if (readFileSync(full, "utf8").includes("catalog/brand-catalog")) {
          offenders.push(full);
        }
      }
    };
    walk(path.join(REPO_ROOT, "client"));
    expect(offenders).toEqual([]);
  });

  it("cites the same source reference on every row", () => {
    for (const product of BRAND_CATALOG) {
      expect(product.sourceReference).toContain("Master Catalog");
      expect(product.sourceReference).toContain("911 rows");
      expect(product.sourceReference).toContain("2026-07-29");
    }
  });
});
