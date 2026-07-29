import { describe, expect, it } from "vitest";
import {
  getV3ProductSeo,
  v3ProductSeoRecords,
  v3ProductSitemapPaths,
} from "./v3-product-seo";

describe("sanitized V3 product SEO", () => {
  it("creates one member-only noindex record for every preview", () => {
    expect(v3ProductSeoRecords).toHaveLength(49);
    expect(
      v3ProductSeoRecords.every(
        (record) =>
          record.access === "member" &&
          record.indexable === false &&
          record.robots === "noindex,nofollow",
      ),
    ).toBe(true);
  });

  it("uses exact member routes and canonical paths", () => {
    expect(
      v3ProductSeoRecords.every(
        (record) =>
          record.route === `/research/member/products/${record.slug}` &&
          record.canonicalPath === record.route,
      ),
    ).toBe(true);
  });

  it("excludes every private preview from the sitemap", () => {
    expect(v3ProductSitemapPaths).toEqual([]);
  });

  it("returns exact metadata and fails closed for unknown slugs", () => {
    expect(getV3ProductSeo("omega-3")).toMatchObject({
      title: "Omega-3 | Xenios Research",
      robots: "noindex,nofollow",
      indexable: false,
    });
    expect(getV3ProductSeo("unknown")).toBeNull();
  });
});
