import { describe, expect, it } from "vitest";
import {
  getV3ProductSeo,
  v3ProductSeoRecords,
  v3ProductSitemapPaths,
} from "./v3-product-seo";

describe("V3 product SEO", () => {
  it("builds 49 unique public canonical records", () => {
    expect(v3ProductSeoRecords).toHaveLength(49);
    expect(new Set(v3ProductSeoRecords.map((record) => record.title)).size).toBe(
      49,
    );
    expect(
      new Set(v3ProductSeoRecords.map((record) => record.canonicalUrl)).size,
    ).toBe(49);
    expect(v3ProductSitemapPaths()).toHaveLength(49);
    for (const record of v3ProductSeoRecords) {
      expect(record.title).toMatch(/\| Xenios$/);
      expect(record.canonicalUrl).toBe(
        `https://xeniostechnology.com/research/products/${record.slug}`,
      );
      expect(record.description).not.toMatch(
        /northline|wholesale|\$\d|purity|rating|review count|source_reference/i,
      );
    }
  });

  it("returns exact records and a real not-found state", () => {
    expect(getV3ProductSeo("nad-plus")?.slug).toBe("nad-plus");
    expect(getV3ProductSeo(" NAD-PLUS ")?.slug).toBe("nad-plus");
    expect(getV3ProductSeo("unknown")).toBeNull();
  });
});
