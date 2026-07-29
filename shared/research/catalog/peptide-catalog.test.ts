import { describe, expect, it } from "vitest";
import {
  allProtocolTags,
  allVariants,
  allVariantsWithProduct,
  buildSku,
  capsulePresentationToken,
  closedGateAvailability,
  coaGateAllowsDirectPurchase,
  computeCustomerAmountCents,
  computeMatrixAmountCents,
  customerCatalogProjection,
  EXPANSION_TIER,
  findPeptideByCode,
  findPeptideBySku,
  findPeptideBySlug,
  findVariantBySku,
  isPurchaseMode,
  mergeAdditionalVariants,
  PEPTIDE_AVAILABILITIES,
  PEPTIDE_CATALOG,
  PEPTIDE_CATALOG_SIZE,
  PEPTIDE_COA_STATUSES,
  PEPTIDE_FORMATS,
  PEPTIDE_PRODUCT_CLASSES,
  PEPTIDE_READINESS_STATUSES,
  PEPTIDE_TIERS,
  PEPTIDE_VARIANT_ORIGINS,
  peptidesForProtocol,
  primaryVariant,
  productsInTier,
  REGULATORY_HOLD_TIER,
  resolveVariantAvailability,
  SKU_PATTERN,
  toCustomerProductProjection,
  variantsWithoutCostBasis,
  variantsWithStrengthConflict,
  vialPresentationToken,
  WORKBOOK_TIER,
  type AdditionalVariantInput,
  type PeptideProduct,
} from "./peptide-catalog";

/**
 * The workbook's wholesale column, transcribed once, in sheet order. Every
 * assertion about money in this file resolves back to this table, so a silent
 * edit to the catalog cannot pass by changing both the value and its test.
 */
const WORKBOOK_WHOLESALE_CENTS: ReadonlyArray<[string, number]> = [
  ["PEP-001", 13400],
  ["PEP-002", 13900],
  ["PEP-003", 13400],
  ["PEP-004", 15900],
  ["PEP-005", 5500],
  ["PEP-006", 3800],
  ["PEP-007", 7900],
  ["PEP-008", 4300],
  ["PEP-009", 5500],
  ["PEP-010", 4700],
  ["PEP-011", 4500],
  ["PEP-012", 8900],
  ["PEP-013", 9900],
  ["PEP-014", 11900],
  ["PEP-015", 9900],
];

/** The 1.80x rule, computed independently of the module's helper. */
const EXPECTED_1_80X_CENTS: Readonly<Record<string, number>> = {
  "PEP-001": 24120,
  "PEP-002": 25020,
  "PEP-003": 24120,
  "PEP-004": 28620,
  "PEP-005": 9900,
  "PEP-006": 6840,
  "PEP-007": 14220,
  "PEP-008": 7740,
  "PEP-009": 9900,
  "PEP-010": 8460,
  "PEP-011": 8100,
  "PEP-012": 16020,
  "PEP-013": 17820,
  "PEP-014": 21420,
  "PEP-015": 17820,
};

/** The prior approved founder matrix: max($99, 2.5x), rounded up to $5. */
const EXPECTED_MATRIX_CENTS: Readonly<Record<string, number>> = {
  "PEP-001": 33500,
  "PEP-002": 35000,
  "PEP-003": 33500,
  "PEP-004": 40000,
  "PEP-005": 14000,
  "PEP-006": 10000,
  "PEP-007": 20000,
  "PEP-008": 11000,
  "PEP-009": 14000,
  "PEP-010": 12000,
  "PEP-011": 11500,
  "PEP-012": 22500,
  "PEP-013": 25000,
  "PEP-014": 30000,
  "PEP-015": 25000,
};

/**
 * Words and phrases that may never appear in a string a member could read.
 *
 * Word boundaries matter: "cure" must not match "secure", and "treat" must
 * match "treatment". This list is intentionally stricter than the brief in two
 * places, banning bare "prevent" as well as "prevent disease", and banning the
 * quality words (purity, sterility, endotoxin) outright, because no document
 * establishing any of them exists for these items.
 *
 * The same list is duplicated in peptide-copy.test.ts on purpose. Two
 * independent checks are worth more than one shared constant that could be
 * weakened in a single edit.
 */
const FORBIDDEN_CLAIM_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["cure", /\bcure\w*/i],
  ["treat", /\btreat\w*/i],
  ["diagnose", /\bdiagnos\w*/i],
  ["prevent", /\bprevent\w*/i],
  ["prescription", /\bprescri\w*/i],
  ["dosage", /\bdosag\w*/i],
  ["dose", /\bdos(e|es|ing)\b/i],
  ["mg/kg", /mg\s*\/\s*kg/i],
  ["fda approved", /fda[\s-]?approv/i],
  ["purity", /\bpurit(y|ies)\b/i],
  ["sterile", /\bsteril\w*/i],
  ["endotoxin", /\bendotoxin\w*/i],
  ["guarantee", /\bguarantee\w*/i],
  ["proven", /\bproven\b/i],
];

/** Every catalog string a member could read. Operator-only fields are excluded. */
function customerFacingCatalogStrings(): string[] {
  const strings: string[] = [];
  for (const product of PEPTIDE_CATALOG) {
    strings.push(product.displayName, product.canonicalName, product.category);
    for (const variant of product.variants) {
      strings.push(variant.label, variant.strength, variant.size);
    }
  }
  return strings;
}

/** The primary variant of a workbook product, asserted non-null for brevity. */
function primaryOf(code: string) {
  const product = findPeptideByCode(code);
  expect(product, code).not.toBeNull();
  const variant = primaryVariant(product as PeptideProduct);
  expect(variant, code).not.toBeNull();
  return variant!;
}

/** A harvested additional size, the shape a later harvest will supply. */
const HARVESTED_5MG_PT141: AdditionalVariantInput = {
  internalProductCode: "PEP-006",
  label: "Single vial, 5 mg",
  strength: "5 mg",
  size: "5 mg",
  format: "vial",
  peptideToken: "PT141",
};

describe("catalog tiers", () => {
  it("holds three tiers: 15 workbook, 27 expansion, 3 regulatory hold", () => {
    expect(productsInTier("workbook")).toHaveLength(15);
    expect(productsInTier("expansion")).toHaveLength(27);
    expect(productsInTier("regulatory_hold")).toHaveLength(3);
    expect(PEPTIDE_CATALOG).toHaveLength(45);
    expect(PEPTIDE_CATALOG_SIZE).toBe(15);
    expect(WORKBOOK_TIER).toHaveLength(15);
    expect(EXPANSION_TIER).toHaveLength(27);
    expect(REGULATORY_HOLD_TIER).toHaveLength(3);
  });

  it("holds seventy variants: 21 workbook, 33 expansion, 16 regulatory hold", () => {
    expect(allVariants(productsInTier("workbook"))).toHaveLength(21);
    expect(allVariants(productsInTier("expansion"))).toHaveLength(33);
    expect(allVariants(productsInTier("regulatory_hold"))).toHaveLength(16);
    expect(allVariants()).toHaveLength(70);
  });

  it("gives every product a tier from the closed vocabulary and a non-empty variant list", () => {
    for (const product of PEPTIDE_CATALOG) {
      expect(PEPTIDE_TIERS).toContain(product.tier);
      expect(product.variants.length, product.internalProductCode).toBeGreaterThan(0);
    }
  });

  it("uses a distinct product code prefix per tier", () => {
    for (const product of productsInTier("workbook")) {
      expect(product.internalProductCode).toMatch(/^PEP-\d{3}$/);
    }
    for (const product of productsInTier("expansion")) {
      expect(product.internalProductCode).toMatch(/^PEX-\d{3}$/);
    }
    for (const product of productsInTier("regulatory_hold")) {
      expect(product.internalProductCode).toMatch(/^PRH-\d{3}$/);
    }
  });

  it("excludes bacteriostatic water and every lab supply from the peptide catalog", () => {
    const everyString = JSON.stringify(PEPTIDE_CATALOG).toLowerCase();
    expect(everyString).not.toContain("bacteriostatic");
    expect(everyString).not.toContain("lab_supply");
  });

  it("creates no duplicate record for a compound we already carry under another name", () => {
    // GLOW is the market's name for PEP-002's exact 70 mg composition, and the
    // market's Epitalon is PEP-011 under the legacy spelling. Both are aliases
    // or extra sizes on the existing product, never a second product record.
    const slugs = PEPTIDE_CATALOG.map((p) => p.slug);
    expect(slugs).not.toContain("glow");
    expect(slugs).not.toContain("epitalon");
    expect(findPeptideByCode("PEP-002")?.nameAliases).toContain("GLOW");
    expect(findPeptideBySlug("epitalon-10mg")?.internalProductCode).toBe("PEP-011");
  });
});

describe("peptide catalog shape", () => {
  it("keeps the workbook tier at exactly fifteen, matching the authoritative sheet", () => {
    expect(productsInTier("workbook")).toHaveLength(15);
  });

  it("does not invent the three products the founder message referred to", () => {
    // The founder's message said eighteen. The sheet has fifteen. The gap is a
    // recorded discrepancy, never filled by invention.
    expect(productsInTier("workbook").length).not.toBe(18);
    const codes = PEPTIDE_CATALOG.map((p) => p.internalProductCode);
    expect(codes).not.toContain("PEP-016");
    expect(codes).not.toContain("PEP-017");
    expect(codes).not.toContain("PEP-018");
  });

  it("gives every workbook product exactly one primary variant, and other tiers none", () => {
    for (const product of PEPTIDE_CATALOG) {
      const primary = primaryVariant(product);
      if (product.tier === "workbook") {
        expect(primary, product.internalProductCode).not.toBeNull();
        expect(primary!.origin).toBe("founder_workbook");
      } else {
        expect(primary, product.internalProductCode).toBeNull();
      }
    }
  });

  it("uses a unique internal product code and slug across the whole catalog", () => {
    const codes = PEPTIDE_CATALOG.map((p) => p.internalProductCode);
    const slugs = PEPTIDE_CATALOG.map((p) => p.slug);
    expect(new Set(codes).size).toBe(45);
    expect(new Set(slugs).size).toBe(45);
    const legacyCodes = PEPTIDE_CATALOG.map((p) => p.legacyProductCode).filter(
      (code): code is string => code !== null,
    );
    expect(new Set(legacyCodes).size).toBe(15);
  });

  it("assigns every product and variant a value from each closed vocabulary", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      expect(PEPTIDE_PRODUCT_CLASSES).toContain(product.productClass);
      expect(PEPTIDE_COA_STATUSES).toContain(product.coaStatus);
      expect(PEPTIDE_READINESS_STATUSES).toContain(variant.readinessStatus);
      expect(PEPTIDE_AVAILABILITIES).toContain(variant.availability);
      expect(PEPTIDE_FORMATS).toContain(variant.format);
      expect(PEPTIDE_VARIANT_ORIGINS).toContain(variant.origin);
    }
  });

  it("names no supplier company, for any tier", () => {
    for (const product of PEPTIDE_CATALOG) {
      expect(product.supplierSource, product.internalProductCode).toMatch(
        /no supplier company is named/i,
      );
    }
  });

  it("uses no em dash or en dash anywhere in the module data", () => {
    // The dashes are written as escapes so this file does not itself contain the
    // characters. A sibling suite scans every file in this directory for them.
    const everyString = JSON.stringify(PEPTIDE_CATALOG);
    expect(everyString).not.toContain("\u2014");
    expect(everyString).not.toContain("\u2013");
  });
});

describe("sku convention", () => {
  it("gives every variant of every product a unique sku", () => {
    const skus = allVariants().map((v) => v.sku);
    expect(skus).toHaveLength(70);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("matches R360-<PEPTIDE>-<PRESENTATION>-<FORMAT> for every variant", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      expect(variant.sku, product.internalProductCode).toMatch(SKU_PATTERN);
      expect(variant.sku.split("-"), product.internalProductCode).toHaveLength(4);
    }
  });

  it("derives the presentation token from the recorded strength, and the count for a capsule", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      const token = variant.sku.split("-")[2];
      const expected =
        variant.format === "capsule_bottle"
          ? capsulePresentationToken(variant.strength, variant.capsuleCount ?? 0)
          : vialPresentationToken(variant.strength);
      expect(token, `${product.internalProductCode} ${variant.sku}`).toBe(expected);
    }
  });

  it("encodes the capsule count so two bottles of the same strength never collide", () => {
    expect(capsulePresentationToken("10 mg", 60)).toBe("10MGX60");
    expect(capsulePresentationToken("10 mg", 30)).toBe("10MGX30");
    expect(findVariantBySku("R360-DIHEXA-10MGX60-CAP")?.product.internalProductCode).toBe(
      "PEP-014",
    );
    expect(
      findVariantBySku("R360-SLUPP332-250MCGX100-CAP")?.product.internalProductCode,
    ).toBe("PEP-013");
  });

  it("keeps a decimal strength legible and distinct", () => {
    expect(vialPresentationToken("0.1 mg")).toBe("0P1MG");
    expect(findVariantBySku("R360-IGF1LR3-0P1MG-VIAL")?.product.internalProductCode).toBe(
      "PEX-017",
    );
    expect(findVariantBySku("R360-IGF1LR3-1MG-VIAL")?.product.internalProductCode).toBe(
      "PEX-017",
    );
  });

  it("keeps a standalone component distinct from the blend that contains it", () => {
    expect(findVariantBySku("R360-BPC157-10MG-VIAL")?.product.internalProductCode).toBe(
      "PEX-001",
    );
    expect(
      findVariantBySku("R360-BPC157_TB500-15MG_15MG-VIAL")?.product.internalProductCode,
    ).toBe("PEP-001");
    expect(
      findVariantBySku("R360-SEMAX_SELANK-10MG-VIAL")?.product.internalProductCode,
    ).toBe("PEX-026");
    expect(
      findVariantBySku("R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL")?.product
        .internalProductCode,
    ).toBe("PEP-015");
  });

  it("derives the format token from the recorded format", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      const token = variant.sku.split("-")[3];
      expect(token, product.internalProductCode).toBe(
        variant.format === "vial" ? "VIAL" : "CAP",
      );
    }
  });

  it("refuses to build a sku that breaks the convention", () => {
    expect(() =>
      buildSku({ peptideToken: "bad token", presentationToken: "10MG", format: "vial" }),
    ).toThrow(RangeError);
    expect(() => capsulePresentationToken("10 mg", 0)).toThrow(RangeError);
  });

  it("resolves a product from its sku, slug, legacy slug, and code", () => {
    for (const product of PEPTIDE_CATALOG) {
      expect(findPeptideBySlug(product.slug)).toBe(product);
      expect(findPeptideByCode(product.internalProductCode)).toBe(product);
      for (const variant of product.variants) {
        expect(findPeptideBySku(variant.sku)).toBe(product);
      }
      if (product.legacyCatalogSlug) {
        expect(findPeptideBySlug(product.legacyCatalogSlug)).toBe(product);
      }
    }
    expect(findPeptideBySku("R360-NOTAPRODUCT-10MG-VIAL")).toBeNull();
    expect(findPeptideBySlug("not-a-product")).toBeNull();
    expect(findPeptideByCode("PEP-018")).toBeNull();
  });

  it("keeps the legacy epitalon slug resolvable under the canonical epithalon spelling", () => {
    const product = findPeptideBySlug("epitalon-10mg");
    expect(product?.internalProductCode).toBe("PEP-011");
    expect(product?.slug).toBe("epithalon-10mg");
    expect(product?.nameAliases).toContain("Epitalon");
  });
});

describe("pricing", () => {
  it("records the workbook wholesale cost exactly, on all fifteen primary variants", () => {
    expect(WORKBOOK_WHOLESALE_CENTS).toHaveLength(15);
    for (const [code, cents] of WORKBOOK_WHOLESALE_CENTS) {
      expect(primaryOf(code).wholesaleSourceCostCents, code).toBe(cents);
    }
  });

  it("computes the 1.80x customer amount exactly, in integer cents, for all fifteen", () => {
    for (const product of productsInTier("workbook")) {
      const code = product.internalProductCode;
      const variant = primaryOf(code);
      const expected = EXPECTED_1_80X_CENTS[code];
      expect(expected, code).toBeDefined();
      expect(variant.computedCustomerAmountCents, code).toBe(expected);
      expect(Number.isSafeInteger(variant.computedCustomerAmountCents!)).toBe(true);
      // The helper and the independently computed table must agree.
      expect(computeCustomerAmountCents(variant.wholesaleSourceCostCents!), code).toBe(
        expected,
      );
    }
  });

  it("applies no rounding at all under the 1.80x rule, because every value divides evenly", () => {
    for (const product of productsInTier("workbook")) {
      const variant = primaryOf(product.internalProductCode);
      const numerator = variant.wholesaleSourceCostCents! * 18;
      expect(numerator % 10, product.internalProductCode).toBe(0);
      expect(variant.computedCustomerAmountCents).toBe(numerator / 10);
    }
  });

  it("computes the prior approved matrix amount, including the $99 floor case", () => {
    for (const product of productsInTier("workbook")) {
      const code = product.internalProductCode;
      const variant = primaryOf(code);
      expect(variant.priorApprovedMatrixAmountCents, code).toBe(EXPECTED_MATRIX_CENTS[code]);
      expect(computeMatrixAmountCents(variant.wholesaleSourceCostCents!), code).toBe(
        EXPECTED_MATRIX_CENTS[code],
      );
      expect(variant.priorApprovedMatrixAmountCents! % 500, code).toBe(0);
    }
    // PEP-006 is the only SKU where 2.5x falls under the $99 floor: 3800 -> 9500.
    const pt141 = primaryOf("PEP-006");
    expect(pt141.wholesaleSourceCostCents).toBe(3800);
    expect(pt141.priorApprovedMatrixAmountCents).toBe(10000);
  });

  it("pins the founder's worked example: PEP-001 is $241.20 under 1.80x and $335.00 under the matrix", () => {
    const variant = primaryOf("PEP-001");
    expect(variant.wholesaleSourceCostCents).toBe(13400);
    expect(variant.computedCustomerAmountCents).toBe(24120);
    expect(variant.priorApprovedMatrixAmountCents).toBe(33500);
  });

  it("holds the two founder rules apart on every workbook SKU, rather than resolving them", () => {
    for (const product of productsInTier("workbook")) {
      const variant = primaryOf(product.internalProductCode);
      expect(variant.computedCustomerAmountCents, product.internalProductCode).not.toBe(
        variant.priorApprovedMatrixAmountCents,
      );
    }
  });

  it("marks every price record draft, with no effective date and an approval note", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      const code = product.internalProductCode;
      expect(variant.priceStatus, code).toBe("draft_pending_formula_confirmation");
      expect(variant.effectiveDate, code).toBeNull();
      expect(variant.currency, code).toBe("USD");
      expect(variant.audience, code).toBe("member");
      expect(variant.priceApprovalNote.length, code).toBeGreaterThan(0);
    }
  });

  it("rejects a non-integer or non-positive wholesale input rather than guessing", () => {
    expect(() => computeCustomerAmountCents(0)).toThrow(RangeError);
    expect(() => computeCustomerAmountCents(-100)).toThrow(RangeError);
    expect(() => computeCustomerAmountCents(13400.5)).toThrow(RangeError);
    expect(() => computeMatrixAmountCents(0)).toThrow(RangeError);
  });
});

describe("the COA gate (the truthfulness invariant)", () => {
  it("records PENDING_LAB_DOCUMENTATION for every product, because no COA file exists", () => {
    for (const product of PEPTIDE_CATALOG) {
      expect(product.coaStatus, product.internalProductCode).toBe(
        "PENDING_LAB_DOCUMENTATION",
      );
    }
  });

  it("never marks a variant DIRECT_PRIVATE_PURCHASE while its COA is pending", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      if (product.coaStatus === "PENDING_LAB_DOCUMENTATION") {
        expect(variant.availability, `${product.internalProductCode} ${variant.sku}`).not.toBe(
          "DIRECT_PRIVATE_PURCHASE",
        );
      }
    }
  });

  it("keeps the gate closed for every status short of a verified file", () => {
    expect(coaGateAllowsDirectPurchase("VERIFIED_FILE_PRESENT")).toBe(true);
    expect(coaGateAllowsDirectPurchase("AVAILABLE_ON_REQUEST")).toBe(false);
    expect(coaGateAllowsDirectPurchase("INTERNAL_PENDING_UPLOAD")).toBe(false);
    expect(coaGateAllowsDirectPurchase("PENDING_LAB_DOCUMENTATION")).toBe(false);
  });

  it("sets the readiness each tier requires", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      const expected =
        product.tier === "workbook"
          ? "NEEDS_COA_ATTACHMENT"
          : product.tier === "expansion"
            ? "NEEDS_INTERNAL_DOCS"
            : "NEEDS_FINAL_APPROVAL";
      expect(variant.readinessStatus, product.internalProductCode).toBe(expected);
    }
  });

  it("derives every recorded availability from the one authority", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      expect(variant.availability, `${product.internalProductCode} ${variant.sku}`).toBe(
        resolveVariantAvailability({
          tier: product.tier,
          coaStatus: product.coaStatus,
          regulatoryNote: product.regulatoryNote,
          hasCostBasis: variant.wholesaleSourceCostCents !== null,
        }),
      );
    }
    expect(closedGateAvailability("Category 1")).toBe("APPROVAL_REQUIRED_PURCHASE");
    expect(closedGateAvailability("PCAC review, likely Category 1")).toBe(
      "REQUEST_ACCESS_ONLY",
    );
  });

  it("holds PCAC-review workbook items one step further back than Category 1 items", () => {
    const approvalRequired = allVariantsWithProduct(productsInTier("workbook"))
      .filter((entry) => entry.variant.availability === "APPROVAL_REQUIRED_PURCHASE")
      .map((entry) => entry.product.internalProductCode);
    // Only the twelve Category 1 primaries. The three PCAC items and every
    // harvested size without a cost basis are held further back.
    expect(approvalRequired).toEqual([
      "PEP-001",
      "PEP-002",
      "PEP-003",
      "PEP-004",
      "PEP-005",
      "PEP-006",
      "PEP-007",
      "PEP-008",
      "PEP-009",
      "PEP-012",
      "PEP-013",
      "PEP-014",
    ]);
  });
});

describe("the cost basis rule", () => {
  it("gives a cost basis only to the fifteen workbook presentations", () => {
    const withCost = allVariantsWithProduct().filter(
      (entry) => entry.variant.wholesaleSourceCostCents !== null,
    );
    expect(withCost).toHaveLength(15);
    expect(withCost.every((entry) => entry.variant.isPrimary)).toBe(true);
    expect(variantsWithoutCostBasis()).toHaveLength(55);
  });

  it("never lets a variant without a cost basis reach a purchase mode", () => {
    for (const { product, variant } of allVariantsWithProduct()) {
      if (variant.wholesaleSourceCostCents === null) {
        expect(
          isPurchaseMode(variant.availability),
          `${product.internalProductCode} ${variant.sku}`,
        ).toBe(false);
        expect(variant.computedCustomerAmountCents).toBeNull();
        expect(variant.priorApprovedMatrixAmountCents).toBeNull();
      }
    }
    for (const coaStatus of PEPTIDE_COA_STATUSES) {
      for (const regulatoryNote of ["Category 1", "PCAC review, likely Category 1"]) {
        expect(
          resolveVariantAvailability({
            tier: "workbook",
            coaStatus,
            regulatoryNote,
            hasCostBasis: false,
          }),
          `${coaStatus} ${regulatoryNote}`,
        ).toBe("REQUEST_ACCESS_ONLY");
      }
    }
  });

  it("opens direct purchase only when a verified COA and a cost basis are both present", () => {
    expect(
      resolveVariantAvailability({
        tier: "workbook",
        coaStatus: "VERIFIED_FILE_PRESENT",
        regulatoryNote: "Category 1",
        hasCostBasis: true,
      }),
    ).toBe("DIRECT_PRIVATE_PURCHASE");
    expect(
      resolveVariantAvailability({
        tier: "workbook",
        coaStatus: "VERIFIED_FILE_PRESENT",
        regulatoryNote: "Category 1",
        hasCostBasis: false,
      }),
    ).toBe("REQUEST_ACCESS_ONLY");
  });
});

describe("tier 3 regulatory hold", () => {
  it("holds every GLP variant UNAVAILABLE with a plain-language hold reason", () => {
    const held = productsInTier("regulatory_hold");
    expect(held.map((p) => p.displayName)).toEqual([
      "Semaglutide",
      "Tirzepatide",
      "Retatrutide",
    ]);
    for (const product of held) {
      expect(product.holdReason, product.internalProductCode).toBeTruthy();
      expect(product.holdReason!.length).toBeGreaterThan(80);
      expect(product.holdReason).toMatch(/founder decision/i);
      expect(product.holdReason).toMatch(/counsel review/i);
      for (const variant of product.variants) {
        expect(variant.availability, variant.sku).toBe("UNAVAILABLE");
        expect(variant.readinessStatus).toBe("NEEDS_FINAL_APPROVAL");
      }
    }
  });

  it("never resolves a held compound to a purchasable mode, whatever the other fields say", () => {
    for (const coaStatus of PEPTIDE_COA_STATUSES) {
      for (const hasCostBasis of [true, false]) {
        for (const regulatoryNote of ["Category 1", "PCAC review", ""]) {
          const availability = resolveVariantAvailability({
            tier: "regulatory_hold",
            coaStatus,
            regulatoryNote,
            hasCostBasis,
          });
          expect(availability, `${coaStatus} ${hasCostBasis}`).toBe("UNAVAILABLE");
          expect(isPurchaseMode(availability)).toBe(false);
        }
      }
    }
  });

  it("sets holdReason only on the held tier", () => {
    for (const product of PEPTIDE_CATALOG) {
      if (product.tier === "regulatory_hold") {
        expect(product.holdReason, product.internalProductCode).not.toBeNull();
      } else {
        expect(product.holdReason, product.internalProductCode).toBeNull();
      }
    }
  });
});

describe("the customer projection", () => {
  it("excludes every held compound in code, not by convention", () => {
    for (const product of productsInTier("regulatory_hold")) {
      expect(toCustomerProductProjection(product), product.internalProductCode).toBeNull();
    }
    expect(customerCatalogProjection()).toHaveLength(42);
    const slugs = customerCatalogProjection().map((entry) => entry.slug);
    expect(slugs).not.toContain("semaglutide");
    expect(slugs).not.toContain("tirzepatide");
    expect(slugs).not.toContain("retatrutide");
  });

  it("carries no internal market reference price, and no money at all", () => {
    const serialized = JSON.stringify(customerCatalogProjection());
    expect(serialized).not.toContain("marketReferencePriceCents");
    expect(serialized).not.toContain("wholesaleSourceCostCents");
    expect(serialized).not.toContain("computedCustomerAmountCents");
    expect(serialized).not.toContain("priorApprovedMatrixAmountCents");
    expect(serialized).not.toContain("legacyPublishedAmountCents");
    expect(serialized).not.toContain("signedSupplierMasterMemberAmountCents");
    // Belt and braces: no field whose name ends in Cents survives the projection.
    expect(serialized).not.toMatch(/Cents"/);
  });

  it("carries no operator-only field of any kind", () => {
    const serialized = JSON.stringify(customerCatalogProjection());
    for (const field of [
      "tier",
      "holdReason",
      "regulatoryNote",
      "supplierSource",
      "coaStatus",
      "readinessStatus",
      "priceApprovalNote",
      "disputedBySignedSupplierMasterStrength",
      "origin",
      "isPrimary",
      "internalProductCode",
    ]) {
      expect(serialized, field).not.toContain(`"${field}"`);
    }
  });

  it("still carries everything a member needs to choose a size", () => {
    const projection = customerCatalogProjection();
    const pep009 = projection.find((entry) => entry.slug === "nad-plus-500mg");
    expect(pep009?.variants.map((v) => v.strength)).toEqual(["500 mg", "1000 mg"]);
    expect(pep009?.variants.map((v) => v.availability)).toEqual([
      "APPROVAL_REQUIRED_PURCHASE",
      "REQUEST_ACCESS_ONLY",
    ]);
  });
});

describe("the harvest lane extension point", () => {
  it("appends an additional size with no price and no purchase mode", () => {
    const merged = mergeAdditionalVariants(PEPTIDE_CATALOG, [HARVESTED_5MG_PT141]);
    const product = findPeptideByCode("PEP-006", merged)!;
    expect(product.variants).toHaveLength(2);

    const added = product.variants[1];
    expect(added.sku).toBe("R360-PT141-5MG-VIAL");
    expect(added.origin).toBe("market_reference_harvest");
    expect(added.isPrimary).toBe(false);
    expect(added.wholesaleSourceCostCents).toBeNull();
    expect(added.computedCustomerAmountCents).toBeNull();
    expect(added.priorApprovedMatrixAmountCents).toBeNull();
    expect(added.availability).toBe("REQUEST_ACCESS_ONLY");
    expect(isPurchaseMode(added.availability)).toBe(false);
    expect(added.priceStatus).toBe("draft_pending_formula_confirmation");
    expect(added.effectiveDate).toBeNull();
  });

  it("keeps a merged variant of a held compound UNAVAILABLE", () => {
    const merged = mergeAdditionalVariants(PEPTIDE_CATALOG, [
      {
        internalProductCode: "PRH-001",
        label: "Single vial, 5 mg",
        strength: "5 mg",
        size: "5 mg",
        format: "vial",
        peptideToken: "SEMAGLUTIDE",
      },
    ]);
    const added = findPeptideByCode("PRH-001", merged)!.variants.at(-1)!;
    expect(added.availability).toBe("UNAVAILABLE");
    expect(added.readinessStatus).toBe("NEEDS_FINAL_APPROVAL");
  });

  it("keeps skus unique across every variant of every product after a merge", () => {
    const merged = mergeAdditionalVariants(PEPTIDE_CATALOG, [
      HARVESTED_5MG_PT141,
      {
        internalProductCode: "PEP-014",
        label: "Capsule bottle, 30 count, 10 mg per capsule",
        strength: "10 mg",
        size: "30 Count",
        format: "capsule_bottle",
        capsuleCount: 30,
        peptideToken: "DIHEXA",
      },
    ]);
    const skus = allVariants(merged).map((v) => v.sku);
    expect(skus).toHaveLength(72);
    expect(new Set(skus).size).toBe(72);
    expect(skus).toContain("R360-DIHEXA-10MGX30-CAP");
    expect(skus).toContain("R360-DIHEXA-10MGX60-CAP");
  });

  it("does not mutate the base catalog", () => {
    const before = allVariants().length;
    mergeAdditionalVariants(PEPTIDE_CATALOG, [HARVESTED_5MG_PT141]);
    expect(allVariants().length).toBe(before);
    expect(findPeptideByCode("PEP-006")!.variants).toHaveLength(1);
  });

  it("throws rather than dropping data on an unknown product or a duplicate sku", () => {
    expect(() =>
      mergeAdditionalVariants(PEPTIDE_CATALOG, [
        { ...HARVESTED_5MG_PT141, internalProductCode: "PEP-999" },
      ]),
    ).toThrow(RangeError);

    // The same size twice, and a size that collides with the workbook variant.
    expect(() =>
      mergeAdditionalVariants(PEPTIDE_CATALOG, [HARVESTED_5MG_PT141, HARVESTED_5MG_PT141]),
    ).toThrow(RangeError);
    expect(() =>
      mergeAdditionalVariants(PEPTIDE_CATALOG, [
        {
          internalProductCode: "PEP-006",
          label: "Single vial, 10 mg",
          strength: "10 mg",
          size: "10 mg",
          format: "vial",
          peptideToken: "PT141",
        },
      ]),
    ).toThrow(RangeError);
  });
});

describe("claim safety", () => {
  it("puts no forbidden claim word in any customer-facing catalog string", () => {
    for (const value of customerFacingCatalogStrings()) {
      for (const [label, pattern] of FORBIDDEN_CLAIM_PATTERNS) {
        expect(pattern.test(value), `"${label}" found in: ${value}`).toBe(false);
      }
    }
  });

  it("allows the FDA regulatory phrase in exactly one operator-only field", () => {
    const withFda = PEPTIDE_CATALOG.filter((p) => /fda/i.test(p.regulatoryNote));
    expect(withFda.map((p) => p.internalProductCode)).toEqual(["PEP-007"]);
    expect(withFda[0].regulatoryNote).toBe("Category 1 (FDA-approved molecule)");
    // And nowhere else in the record, including the customer-facing fields.
    for (const { product, variant } of allVariantsWithProduct()) {
      expect(/fda/i.test(product.displayName), product.internalProductCode).toBe(false);
      expect(/fda/i.test(product.canonicalName), product.internalProductCode).toBe(false);
      expect(/fda/i.test(variant.label), product.internalProductCode).toBe(false);
    }
  });

  it("states no lot number, expiry date, purity, sterility, or endotoxin value anywhere", () => {
    const everyString = JSON.stringify(PEPTIDE_CATALOG);
    expect(/\blot\s*(number|no\.?|#)/i.test(everyString)).toBe(false);
    expect(/\bexpir(y|es|ation)\b/i.test(everyString)).toBe(false);
    expect(/\bendotoxin/i.test(everyString)).toBe(false);
    expect(/\bsteril/i.test(everyString)).toBe(false);
    expect(/\bpurit(y|ies)\b/i.test(everyString)).toBe(false);
  });
});

describe("merchandising data from the Pairing Map", () => {
  it("gives every workbook product at least one protocol tag and one paired supplement", () => {
    for (const product of productsInTier("workbook")) {
      expect(product.protocolTags.length, product.internalProductCode).toBeGreaterThan(0);
      expect(
        product.pairedSupplementNames.length,
        product.internalProductCode,
      ).toBeGreaterThan(0);
    }
  });

  it("leaves expansion and held products untagged, because the Pairing Map has no row for them", () => {
    for (const product of productsInTier("regulatory_hold")) {
      expect(product.protocolTags, product.internalProductCode).toHaveLength(0);
      expect(product.pairedSupplementNames).toHaveLength(0);
    }
    // 5-Amino-1MQ is the single exception: the workbook's NutriDyn sheet names it.
    const tagged = productsInTier("expansion").filter((p) => p.protocolTags.length > 0);
    expect(tagged.map((p) => p.internalProductCode)).toEqual(["PEX-010"]);
    expect(tagged[0].pairedSupplementNames).toEqual(["Mito Recharge"]);
  });

  it("carries the ten protocols the Pairing Map defines", () => {
    expect(allProtocolTags()).toEqual([
      "autoimmune_inflammation",
      "beauty_hair_skin_nails",
      "gh_axis_anti_aging",
      "injury_recovery_oa_djd",
      "mitochondrial_longevity",
      "neurological_cognitive",
      "oral_weight_loss",
      "performance_athletic",
      "perimenopause_hormonal",
      "sexual_health",
    ]);
  });

  it("resolves the mitochondrial protocol to the peptides the map lists", () => {
    expect(peptidesForProtocol("mitochondrial_longevity").map((p) => p.displayName)).toEqual([
      "NAD+ Research Material",
      "MOTS-C Research Material",
      "Epithalon Research Material",
      "SS-31 Research Material",
      "5-Amino-1MQ Research Material",
    ]);
  });

  it("lists no duplicate supplement name within a product", () => {
    for (const product of PEPTIDE_CATALOG) {
      expect(
        new Set(product.pairedSupplementNames).size,
        product.internalProductCode,
      ).toBe(product.pairedSupplementNames.length);
    }
  });
});

describe("recorded conflicts", () => {
  it("surfaces every strength that the signed supplier master disputes, without resolving it", () => {
    const disputed = variantsWithStrengthConflict().map(
      (entry) => entry.product.internalProductCode,
    );
    expect(disputed).toEqual([
      "PEP-001",
      "PEP-002",
      "PEP-003",
      "PEP-007",
      "PEP-008",
      "PEP-009",
      "PEP-010",
      "PEP-011",
      "PEP-012",
      "PEP-013",
      "PEP-014",
      "PEP-015",
    ]);
    for (const { variant } of variantsWithStrengthConflict()) {
      // The workbook value stays on the variant. The signed value is recorded
      // beside it. Neither overwrites the other.
      expect(variant.strength.length).toBeGreaterThan(0);
      expect(variant.disputedBySignedSupplierMasterStrength).not.toBe(variant.strength);
    }
  });

  it("records the legacy published price on every primary variant, so the third value is visible", () => {
    for (const product of productsInTier("workbook")) {
      expect(
        primaryOf(product.internalProductCode).legacyPublishedAmountCents,
        product.internalProductCode,
      ).not.toBeNull();
    }
    expect(primaryOf("PEP-001").legacyPublishedAmountCents).toBe(33999);
  });

  it("records a signed supplier member price only where this repository states one", () => {
    const stated = productsInTier("workbook")
      .filter(
        (p) => primaryOf(p.internalProductCode).signedSupplierMasterMemberAmountCents !== null,
      )
      .map((p) => p.internalProductCode);
    // Only three are public here. The rest live in the private operations repo
    // and are held null rather than guessed.
    expect(stated).toEqual(["PEP-001", "PEP-003", "PEP-007"]);
    expect(primaryOf("PEP-001").signedSupplierMasterMemberAmountCents).toBe(8999);
  });

  it("records the market reference price as an internal fourth data point", () => {
    // Every expansion and held variant has one, because that is the only data
    // the harvest gave us. Workbook primaries have one only where the market
    // lists the same presentation.
    for (const { product, variant } of allVariantsWithProduct()) {
      if (product.tier !== "workbook") {
        expect(variant.marketReferencePriceCents, variant.sku).not.toBeNull();
      }
    }
    expect(primaryOf("PEP-006").marketReferencePriceCents).toBe(8999);
    expect(primaryOf("PEP-001").marketReferencePriceCents).toBeNull();
  });
});
