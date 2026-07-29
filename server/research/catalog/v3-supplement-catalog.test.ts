import { describe, expect, it } from "vitest";
import {
  buildV3SupplementCatalog,
  relatedV3SupplementPreviews,
  searchV3SupplementCatalog,
} from "./v3-supplement-catalog";

describe("V3 supplement previews", () => {
  it("projects 15 public-safe categories with no variant, flavor, form, or price facts", () => {
    const items = buildV3SupplementCatalog();
    expect(items).toHaveLength(15);
    for (const item of items) {
      expect(item.approvedPrice).toBeNull();
      expect(item.approvedVariantCount).toBe(0);
      expect(item.purchasingEnabled).toBe(false);
      expect(item.form).toBeNull();
      expect(item.flavor).toBeNull();
    }
  });

  it("searches and sorts without manufacturing unavailable options", () => {
    expect(searchV3SupplementCatalog({ query: "omega" })).toHaveLength(1);
    const sorted = searchV3SupplementCatalog({ sort: "name_ascending" });
    expect(sorted[0].displayName.localeCompare(sorted[1].displayName)).toBe(-1);
    expect(JSON.stringify(sorted)).not.toMatch(/subscription|add to cart/i);
  });

  it("builds related-category navigation without a recommendation claim", () => {
    const related = relatedV3SupplementPreviews("omega-3");
    expect(related).toHaveLength(3);
    expect(related.every((item) => item.slug !== "omega-3")).toBe(true);
  });

  it("returns no related records for an unknown identity", () => {
    expect(relatedV3SupplementPreviews("unknown")).toEqual([]);
  });
});
