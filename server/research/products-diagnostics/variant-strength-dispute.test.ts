import { describe, expect, it } from "vitest";
import {
  PEPTIDE_CATALOG,
  variantsWithStrengthConflict,
} from "@shared/research/catalog/peptide-catalog";
import {
  catalogSkuCollisions,
  findVariantStrengthDispute,
  normalizePresentationKey,
  normalizeSkuKey,
  recordedVariantStrengthDisputes,
} from "./variant-strength-dispute";

const DISPUTED = recordedVariantStrengthDisputes();

function undisputedCatalogVariant() {
  const disputed = new Set(DISPUTED.map((dispute) => dispute.sku));
  for (const product of PEPTIDE_CATALOG) {
    for (const variant of product.variants) {
      if (!disputed.has(variant.sku)) return { product, variant };
    }
  }
  throw new Error("the catalog has no undisputed variant to test with");
}

describe("the recorded dispute registry", () => {
  it("is derived from the catalog rather than hardcoded", () => {
    const fromCatalog = variantsWithStrengthConflict()
      .map((entry) => entry.variant.sku)
      .sort((left, right) => left.localeCompare(right));
    expect(DISPUTED.map((dispute) => dispute.sku)).toEqual(fromCatalog);
    expect(DISPUTED.length).toBe(fromCatalog.length);
    expect(DISPUTED.length).toBeGreaterThan(0);
  });

  it("preserves both presentations verbatim, with provenance for each", () => {
    for (const dispute of DISPUTED) {
      const source = variantsWithStrengthConflict().find(
        (entry) => entry.variant.sku === dispute.sku,
      );
      expect(source).toBeDefined();
      expect(dispute.founderLocked.presentation).toBe(source!.variant.strength);
      expect(dispute.contested.presentation).toBe(
        source!.variant.disputedBySignedSupplierMasterStrength,
      );
      expect(dispute.founderLocked.presentation).not.toBe(
        dispute.contested.presentation,
      );
      expect(dispute.founderLocked.provenance.trim().length).toBeGreaterThan(0);
      expect(dispute.contested.provenance.trim().length).toBeGreaterThan(0);
      expect(dispute.productCode).toBe(source!.product.internalProductCode);
      expect(dispute.source).toBe("signed_supplier_master");
    }
  });

  it("carries no cost, multiplier, margin, or amount of any kind", () => {
    const serialized = JSON.stringify(DISPUTED);
    for (const forbidden of [
      "cost",
      "cents",
      "amount",
      "margin",
      "multiplier",
      "wholesale",
      "marketReference",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    for (const dispute of DISPUTED) {
      expect(Object.keys(dispute).sort()).toEqual([
        "contested",
        "founderLocked",
        "legacyProductCode",
        "productCode",
        "sku",
        "source",
      ]);
    }
  });

  it("keeps the catalog SKU join unambiguous", () => {
    expect(catalogSkuCollisions()).toEqual([]);
  });

  it("hands out frozen records, so one caller cannot rewrite the registry", () => {
    for (const dispute of DISPUTED) {
      expect(Object.isFrozen(dispute)).toBe(true);
      expect(Object.isFrozen(dispute.founderLocked)).toBe(true);
      expect(Object.isFrozen(dispute.contested)).toBe(true);
    }
  });
});

describe("finding the dispute for one variant", () => {
  it("matches a disputed SKU through sku or catalogNumber, case and spacing insensitive", () => {
    const target = DISPUTED[0];
    for (const identity of [
      { sku: target.sku },
      { sku: target.sku.toLowerCase() },
      { sku: `  ${target.sku}  ` },
      { sku: "", catalogNumber: target.sku },
      { sku: "SOMETHING-ELSE", catalogNumber: target.sku.toLowerCase() },
    ]) {
      expect(findVariantStrengthDispute(identity)).toEqual(target);
    }
  });

  it("leaves an undisputed catalog variant alone", () => {
    const { variant } = undisputedCatalogVariant();
    expect(
      findVariantStrengthDispute({
        sku: variant.sku,
        catalogNumber: null,
        strength: variant.strength,
      }),
    ).toBeNull();
  });

  it("leaves a variant that is not in the peptide catalog alone", () => {
    expect(
      findVariantStrengthDispute({
        sku: "SKU-NOT-IN-CATALOG",
        catalogNumber: null,
        strength: "10 mg",
      }),
    ).toBeNull();
  });

  it("flags a Product Control record that drifts from the founder-locked strength", () => {
    const { product, variant } = undisputedCatalogVariant();
    const dispute = findVariantStrengthDispute({
      sku: variant.sku,
      catalogNumber: null,
      strength: "999 mg",
    });
    expect(dispute).not.toBeNull();
    expect(dispute!.source).toBe("product_control_drift");
    expect(dispute!.sku).toBe(variant.sku);
    expect(dispute!.productCode).toBe(product.internalProductCode);
    expect(dispute!.founderLocked.presentation).toBe(variant.strength);
    expect(dispute!.contested.presentation).toBe("999 mg");
  });

  it("does not call a cosmetic difference a drift", () => {
    const { variant } = undisputedCatalogVariant();
    for (const cosmetic of [
      variant.strength.toUpperCase(),
      `  ${variant.strength}  `,
      variant.strength.replace(/\s*\/\s*/g, "/"),
      variant.strength.replace(/ /g, "  "),
      variant.strength.replace(/\s+/g, ""),
    ]) {
      expect(
        findVariantStrengthDispute({ sku: variant.sku, strength: cosmetic }),
      ).toBeNull();
    }
  });

  it("does not invent a drift from a Product Control record with no strength", () => {
    const { variant } = undisputedCatalogVariant();
    for (const strength of [null, undefined, "   "]) {
      expect(
        findVariantStrengthDispute({ sku: variant.sku, strength }),
      ).toBeNull();
    }
  });

  it("prefers the recorded supplier-master dispute over a drift reading", () => {
    const target = DISPUTED[0];
    const dispute = findVariantStrengthDispute({
      sku: target.sku,
      strength: "1 mg",
    });
    expect(dispute).toEqual(target);
    expect(dispute!.source).toBe("signed_supplier_master");
  });
});

describe("the normalizers", () => {
  it("collapses only case and spacing in a SKU key", () => {
    expect(normalizeSkuKey(" r360-nad-500mg-vial ")).toBe("R360-NAD-500MG-VIAL");
    expect(normalizeSkuKey(null)).toBe("");
    expect(normalizeSkuKey(undefined)).toBe("");
  });

  it("never lets two different presentations compare equal", () => {
    expect(normalizePresentationKey("10 MG")).toBe(
      normalizePresentationKey(" 10  mg "),
    );
    expect(normalizePresentationKey("15 mg / 15 mg")).toBe(
      normalizePresentationKey("15mg/15mg"),
    );
    expect(normalizePresentationKey("60 Count")).toBe(
      normalizePresentationKey("60count"),
    );
    expect(normalizePresentationKey("10 mg")).not.toBe(
      normalizePresentationKey("5 mg"),
    );
    expect(normalizePresentationKey("500 mg")).not.toBe(
      normalizePresentationKey("100 mg"),
    );
    expect(normalizePresentationKey("250 mcg")).not.toBe(
      normalizePresentationKey("1500 mcg per capsule, 60 capsules"),
    );
  });
});
