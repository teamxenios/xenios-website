import { describe, expect, it } from "vitest";
import {
  autocompleteV3Catalog,
  compareV3Catalog,
  getV3CatalogDetail,
  searchV3Catalog,
} from "./v3-catalog-search";

const AT = "2026-07-29T02:00:00.000Z";

describe("sanitized V3 catalog search", () => {
  it("returns all 49 member-only routes with truthful pending state", () => {
    const results = searchV3Catalog();
    expect(results).toHaveLength(49);
    expect(
      results.every(
        (item) =>
          item.route === `/research/member/products/${item.slug}` &&
          item.access === "member" &&
          item.pricingState === "public_price_pending" &&
          item.approvedPrice === null,
      ),
    ).toBe(true);
  });

  it("searches aliases and supports exact kind/category filtering and sorting", () => {
    expect(searchV3Catalog({ query: "Elamipretide" }).map((item) => item.slug)).toEqual([
      "ss-31",
    ]);
    expect(searchV3Catalog({ kind: "pathway" })).toHaveLength(3);
    expect(searchV3Catalog({ category: "Supplements" })).toHaveLength(15);
    const ascending = searchV3Catalog({ sort: "name_ascending" });
    const descending = searchV3Catalog({ sort: "name_descending" });
    expect(descending.map((item) => item.slug)).toEqual(
      ascending.map((item) => item.slug).reverse(),
    );
  });

  it("fails closed for short or invalid autocomplete limits", () => {
    expect(autocompleteV3Catalog("n")).toEqual([]);
    expect(autocompleteV3Catalog("research", 0)).toEqual([]);
    expect(autocompleteV3Catalog("research", 21)).toEqual([]);
    expect(autocompleteV3Catalog("research", 4)).toHaveLength(4);
  });

  it("compares known unique records and returns only exact detail slugs", () => {
    expect(
      compareV3Catalog(["nad-plus", "nad-plus", "omega-3", "unknown"]).map(
        (item) => item.slug,
      ),
    ).toEqual(["nad-plus", "omega-3"]);
    expect(getV3CatalogDetail("nad-plus", AT)?.displayName).toBe(
      "NAD+ Research Material",
    );
    expect(getV3CatalogDetail("NAD-PLUS", AT)).toBeNull();
    expect(getV3CatalogDetail("unknown", AT)).toBeNull();
  });
});
