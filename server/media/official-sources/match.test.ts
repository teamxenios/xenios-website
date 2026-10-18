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
