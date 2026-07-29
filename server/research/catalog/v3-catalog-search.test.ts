import { describe, expect, it } from "vitest";
import {
  autocompleteV3Catalog,
  compareV3Catalog,
  getV3CatalogDetail,
  searchV3Catalog,
  v3PublicCatalogItems,
} from "./v3-catalog-search";

describe("V3 public catalog search", () => {
  it("projects exactly 49 public-safe supplier-independent profiles", () => {
    expect(v3PublicCatalogItems).toHaveLength(49);
    expect(new Set(v3PublicCatalogItems.map((item) => item.productKey)).size).toBe(
      49,
    );
    expect(new Set(v3PublicCatalogItems.map((item) => item.slug)).size).toBe(49);
    const serialized = JSON.stringify(v3PublicCatalogItems);
    expect(serialized).not.toMatch(
      /renew 360|northline|source_reference|reference_sizes|official source url|supplier \/ reseller state|private reference|wholesale|inventory quantity|lot code|coa file/i,
    );
    for (const item of v3PublicCatalogItems) {
      expect(item.route).toBe(`/research/member/products/${item.slug}`);
      expect(item.access).toBe("member");
      expect(item.purchaseState).toBe("disabled_pending_readiness");
      expect(item.priceState).toBe("public_price_pending");
      expect(item.formatState).toBe("pending_confirmation");
      expect(item.presentationState).toBe("pending_confirmation");
      expect(item.subscriptionEligibility).toBe("disabled");
    }
  });

  it("supports search and the complete truthful preview facet contract", () => {
    expect(searchV3Catalog().total).toBe(49);
    expect(searchV3Catalog({ query: "quantum" }).items).toHaveLength(1);
    expect(searchV3Catalog({ productType: "laboratory_supply" }).items).toHaveLength(
      1,
    );
    expect(searchV3Catalog({ composition: "blend" }).items.length).toBeGreaterThan(
      0,
    );
    expect(
      searchV3Catalog({
        format: "pending_confirmation",
        presentation: "pending_confirmation",
        documentation: "pending",
        availability: "coming_soon",
        supplierReadiness: "pending",
        subscriptionEligibility: "disabled",
        access: "member",
      }).total,
    ).toBe(49);
    const facets = searchV3Catalog().facets;
    expect(
      facets.productClasses.reduce((sum, item) => sum + item.count, 0),
    ).toBe(49);
    expect(facets.categories.reduce((sum, item) => sum + item.count, 0)).toBe(
      49,
    );
  });

  it("sorts deterministically without inventing price or availability priority", () => {
    const editorial = searchV3Catalog({ sort: "editorial" }).items;
    const alphabetical = searchV3Catalog({ sort: "alphabetical" }).items;
    const price = searchV3Catalog({ sort: "approved_price" }).items;
    expect(editorial[0]?.editorialOrder).toBe(1);
    expect(alphabetical.map((item) => item.displayName)).toEqual(
      alphabetical
        .map((item) => item.displayName)
        .slice()
        .sort((left, right) => left.localeCompare(right)),
    );
    expect(price.map((item) => item.productKey)).toEqual(
      editorial.map((item) => item.productKey),
    );
  });

  it("returns bounded autocomplete matches and rejects invalid limits", () => {
    expect(autocompleteV3Catalog("nad")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "nad-plus", displayName: "NAD+" }),
      ]),
    );
    expect(autocompleteV3Catalog("research", 4)).toHaveLength(4);
    expect(autocompleteV3Catalog("", 8)).toEqual([]);
    expect(autocompleteV3Catalog("nad", 0)).toEqual([]);
    expect(autocompleteV3Catalog("nad", 21)).toEqual([]);
  });

  it("compares two or three exact unique profiles in requested order", () => {
    const compared = compareV3Catalog(["nad-plus", "aod-9604"]);
    expect(compared.map((item) => item.slug)).toEqual([
      "nad-plus",
      "aod-9604",
    ]);
    expect(compareV3Catalog(["nad-plus"])).toEqual([]);
    expect(compareV3Catalog(["nad-plus", "nad-plus"])).toEqual([]);
    expect(compareV3Catalog(["nad-plus", "not-real"])).toEqual([]);
  });

  it("returns a safe detail for every route and a real null for unknown slugs", () => {
    for (const item of v3PublicCatalogItems) {
      const detail = getV3CatalogDetail(item.slug);
      expect(detail?.slug).toBe(item.slug);
      expect(detail?.presentationSummary).toBe("Options being confirmed");
      expect(detail?.documentation).toHaveLength(4);
      expect(JSON.stringify(detail)).not.toMatch(
        /renew 360|northline|reference_sizes|source_reference|official source url|supplier \/ reseller state|private reference|dose|dosage|treatment recommendation/i,
      );
    }
    expect(getV3CatalogDetail("not-a-real-profile")).toBeNull();
  });
});
