import { describe, expect, it } from "vitest";
import {
  buildV3ProductSeoRecord,
  buildV3ProductSeoRecords,
  v3ProductSitemapPaths,
} from "./v3-product-seo";
import { v3PreviewProfiles } from "./v3-preview-catalog";

describe("V3 member-only product SEO", () => {
  it("marks all 49 member records noindex,nofollow", () => {
    const records = buildV3ProductSeoRecords();
    expect(records).toHaveLength(49);
    expect(
      records.every(
        (record) =>
          record.memberOnly &&
          record.robots === "noindex,nofollow" &&
          record.sitemapEligible === false,
      ),
    ).toBe(true);
  });

  it("uses member-only canonical paths and neutral Xenios titles", () => {
    const record = buildV3ProductSeoRecord(v3PreviewProfiles[0]);
    expect(record.canonicalPath).toBe(
      `/research/member/products/${v3PreviewProfiles[0].slug}`,
    );
    expect(record.title).toContain("Xenios Research");
    expect(record.title).not.toMatch(/catalog partner|wholesale/i);
  });

  it("excludes every preview from sitemap output", () => {
    expect(v3ProductSitemapPaths()).toEqual([]);
  });

  it("does not offer a public route fallback", () => {
    for (const record of buildV3ProductSeoRecords()) {
      expect(record.canonicalPath.startsWith("/research/member/")).toBe(true);
      expect(record.canonicalPath.startsWith("/products/")).toBe(false);
    }
  });
});
