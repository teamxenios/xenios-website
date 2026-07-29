import { describe, expect, it } from "vitest";
import {
  getV3ProductSeo,
  v3ProductSeoRecords,
  v3ProductSitemapPaths,
} from "./v3-product-seo";

describe("V3 product SEO", () => {
  it("builds 49 unique member-only noindex records", () => {
    expect(v3ProductSeoRecords).toHaveLength(49);
    expect(new Set(v3ProductSeoRecords.map((record) => record.title)).size).toBe(
      49,
    );
    expect(
      new Set(v3ProductSeoRecords.map((record) => record.canonicalUrl)).size,
    ).toBe(49);
    expect(v3ProductSitemapPaths()).toEqual([]);
    for (const record of v3ProductSeoRecords) {
      expect(record.title).toMatch(/\| Xenios$/);
      expect(record.access).toBe("member");
      expect(record.indexable).toBe(false);
      expect(record.robots).toBe("noindex,nofollow");
      expect(record.canonicalUrl).toBe(
        `https://xeniostechnology.com/research/member/products/${record.slug}`,
      );
      expect(record.description).not.toMatch(
        /renew 360|northline|wholesale|\$\d|purity|rating|review count|source_reference|reference_sizes|official source url|supplier \/ reseller state|private reference/i,
      );
    }
  });

  it("returns exact non-indexable member metadata and a real not-found state", () => {
    expect(getV3ProductSeo("nad-plus")).toMatchObject({
      slug: "nad-plus",
      access: "member",
      indexable: false,
      robots: "noindex,nofollow",
    });
    expect(getV3ProductSeo(" NAD-PLUS ")?.slug).toBe("nad-plus");
    expect(getV3ProductSeo("unknown")).toBeNull();
  });
});
