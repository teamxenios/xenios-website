import { describe, expect, it } from "vitest";
import type { OfficialSourceProduct, SupplementManifestRow } from "./contracts";
import { scoreOfficialSourceMatch } from "./match";

const row: SupplementManifestRow = {
  sourceRowId: "222",
  canonicalProductId: "MOM-0001",
  canonicalVariantId: "MOM-0001",
  exactSku: "CREATINE-60-WM",
  supplierProductCode: "CREATINE-60-WM",
  upc: null,
  brand: "Momentous",
  productName: "Creatine - 60 Servings",
  variantOrFormat: "Watermelon",
  packageCount: "60 servings",
  flavor: "Watermelon",
  form: "Powder",
  sizeOrWeight: "396 g",
  recommendedPrice: 49.95,
  currentOfferState: "HELD_PENDING_GATES",
  officialProductUrl: "https://www.livemomentous.com/products/creatine",
};

const candidate: OfficialSourceProduct = {
  officialProductUrl: row.officialProductUrl!,
  officialImageUrl: "https://www.livemomentous.com/image.jpg",
  brand: "Momentous",
  officialProductId: "1",
  officialVariantId: "2",
  officialSku: "CREATINE-60-WM",
  upc: null,
  productName: "Creatine - 60 Servings",
  variantName: "Watermelon",
  packageCount: "60 servings",
  form: "Powder",
  flavor: "Watermelon",
  sizeOrWeight: "396 g",
  width: 1600,
  height: 1600,
  format: "image/jpeg",
  altText: "Momentous Creatine",
  retrievedAt: "2026-08-02T00:00:00.000Z",
  sourceAdapter: "test",
  sourceHash: "hash",
};

describe("scoreOfficialSourceMatch", () => {
  it("classifies an exact stable-identifier and variant match", () => {
    expect(scoreOfficialSourceMatch(row, candidate)).toMatchObject({
      state: "EXACT_MATCH",
      score: 115,
      differences: [],
    });
  });

  it("fails closed when SKU and product match but strength/format conflicts", () => {
    const result = scoreOfficialSourceMatch(
      { ...row, variantOrFormat: "500 mg", flavor: null, sizeOrWeight: null },
      { ...candidate, variantName: "250 mg", flavor: null, sizeOrWeight: null },
    );
    expect(result.state).toBe("CONFLICT");
    expect(result.differences).toContainEqual(
      expect.objectContaining({
        field: "variantOrFormat",
        expected: "500 mg",
        actual: "250 mg",
        severity: "conflict",
      }),
    );
  });

  it.each(["500 µg", "500 μg"])(
    "fails closed when %s is contradicted by a gram-strength source",
    (manifestStrength) => {
      const result = scoreOfficialSourceMatch(
        { ...row, variantOrFormat: manifestStrength },
        { ...candidate, variantName: "500 g" },
      );
      expect(result.state).toBe("CONFLICT");
      expect(result.differences).toContainEqual(
        expect.objectContaining({ field: "variantOrFormat", severity: "conflict" }),
      );
    },
  );

  it("treats micro-sign spellings and mcg as the same strength", () => {
    expect(scoreOfficialSourceMatch(
      { ...row, variantOrFormat: "500 µg" },
      { ...candidate, variantName: "500 mcg" },
    )).toMatchObject({ state: "EXACT_MATCH", differences: [] });
  });

  it("fails closed on cross-unit size contradictions while accepting equal magnitudes", () => {
    const conflict = scoreOfficialSourceMatch(
      { ...row, sizeOrWeight: "500 mg" },
      { ...candidate, sizeOrWeight: "0.25 g" },
    );
    expect(conflict.state).toBe("CONFLICT");
    expect(conflict.differences).toContainEqual(
      expect.objectContaining({ field: "sizeOrWeight", severity: "conflict" }),
    );

    const equalMagnitude = scoreOfficialSourceMatch(
      { ...row, sizeOrWeight: "500 mg" },
      { ...candidate, sizeOrWeight: "0.5 g" },
    );
    expect(equalMagnitude.state).toBe("EXACT_MATCH");
    expect(equalMagnitude.differences).toContainEqual(
      expect.objectContaining({ field: "sizeOrWeight", severity: "info" }),
    );
  });

  it("fails closed on strength and dosage-form contradictions in product names", () => {
    const strengthConflict = scoreOfficialSourceMatch(
      { ...row, productName: "Creatine 500 mg" },
      { ...candidate, productName: "Creatine 250 mg" },
    );
    expect(strengthConflict.state).toBe("CONFLICT");
    expect(strengthConflict.differences).toContainEqual(
      expect.objectContaining({ field: "productName", severity: "conflict" }),
    );

    const formConflict = scoreOfficialSourceMatch(
      { ...row, productName: "Creatine Capsules" },
      { ...candidate, productName: "Creatine Powder" },
    );
    expect(formConflict.state).toBe("CONFLICT");
    expect(formConflict.differences).toContainEqual(
      expect.objectContaining({ field: "productName", severity: "conflict" }),
    );

    const equalStrength = scoreOfficialSourceMatch(
      { ...row, productName: "Creatine 500 mg Capsules" },
      { ...candidate, productName: "Creatine 0.5 g caps" },
    );
    expect(equalStrength.state).toBe("EXACT_MATCH");
    expect(equalStrength.differences).toContainEqual(
      expect.objectContaining({ field: "productName", severity: "info" }),
    );
  });

  it.each([
    ["60 ct", "120 ct"],
    ["60 caps", "120 caps"],
    ["60 tabs", "120 tabs"],
    ["60 sg", "120 sg"],
  ])("fails closed on abbreviated package-count contradictions: %s vs %s", (expected, actual) => {
    const result = scoreOfficialSourceMatch(
      { ...row, packageCount: expected },
      { ...candidate, packageCount: actual },
    );
    expect(result.state).toBe("CONFLICT");
    expect(result.differences).toContainEqual(
      expect.objectContaining({ field: "packageCount", severity: "conflict" }),
    );
  });

  it("accepts equivalent count abbreviations without inventing a contradiction", () => {
    const result = scoreOfficialSourceMatch(
      { ...row, packageCount: "60 ct" },
      { ...candidate, packageCount: "60 caps" },
    );
    expect(result.state).toBe("EXACT_MATCH");
    expect(result.differences).toContainEqual(
      expect.objectContaining({ field: "packageCount", severity: "info" }),
    );
  });

  it("does not exact-match when the required variant identity is absent", () => {
    const result = scoreOfficialSourceMatch(row, { ...candidate, variantName: null });
    expect(result.state).not.toBe("EXACT_MATCH");
    expect(result.differences).toContainEqual(
      expect.objectContaining({ field: "variantOrFormat", severity: "info" }),
    );
  });

  it("fails closed on a package-count conflict", () => {
    const result = scoreOfficialSourceMatch(row, {
      ...candidate,
      packageCount: "30 servings",
    });
    expect(result.state).toBe("CONFLICT");
    expect(result.differences).toContainEqual(
      expect.objectContaining({ field: "packageCount", severity: "conflict" }),
    );
  });

  it("requires an exact brand", () => {
    expect(
      scoreOfficialSourceMatch(row, { ...candidate, brand: "Life Extension" }),
    ).toMatchObject({ state: "CONFLICT", score: 0 });
  });
});
