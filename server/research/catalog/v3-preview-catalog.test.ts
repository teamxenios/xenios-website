import { describe, expect, it } from "vitest";
import {
  v3CatalogProfiles,
  v3PreviewCatalogProducts,
  v3PreviewMemberCatalog,
  v3PreviewMemberDetail,
  v3PreviewProducts,
} from "./v3-preview-catalog";

describe("V3 supplier-independent catalog", () => {
  it("loads exactly 49 unique canonical profiles", () => {
    expect(v3CatalogProfiles).toHaveLength(49);
    expect(new Set(v3CatalogProfiles.map((item) => item.product_key)).size).toBe(
      49,
    );
    expect(new Set(v3CatalogProfiles.map((item) => item.slug)).size).toBe(49);
  });

  it("publishes truthful coming-soon discovery records without price", () => {
    expect(v3PreviewProducts).toHaveLength(49);
    for (const product of v3PreviewProducts) {
      expect(product.status).toBe("coming-soon");
      expect(product.priceCents).toBeNull();
      expect(product.summary).toMatch(/Not for human or veterinary use\.$/);
      expect(product.sourceUrl).toBeUndefined();
    }
  });

  it("does not manufacture a variant or SKU compatibility projection", () => {
    const catalog = v3PreviewMemberCatalog("2026-07-28T00:00:00.000Z");
    expect(v3PreviewCatalogProducts).toEqual([]);
    expect(catalog.items).toHaveLength(49);
    expect(catalog.items.every((item) => item.variantCount === 0)).toBe(true);
    expect(catalog.items.every((item) => item.price === null)).toBe(true);
    expect(catalog.items.every((item) => item.selection === null)).toBe(true);

    for (const profile of v3CatalogProfiles) {
      const detail = v3PreviewMemberDetail(
        profile.slug,
        "2026-07-28T00:00:00.000Z",
      );
      expect(detail?.variants).toEqual([]);
      expect(detail?.selection).toBeNull();
    }

    const serialized = JSON.stringify({
      v3PreviewProducts,
      catalog,
      details: v3CatalogProfiles.map((profile) =>
        v3PreviewMemberDetail(profile.slug, "2026-07-28T00:00:00.000Z"),
      ),
    });
    expect(serialized).not.toMatch(/"sku"\s*:/i);
    expect(serialized).not.toMatch(/\bXN-[A-Z0-9-]+\b/);
  });

  it("does not expose competitive references, private source metadata, or internal prices", () => {
    const serialized = JSON.stringify({
      v3PreviewProducts,
      catalog: v3PreviewMemberCatalog("2026-07-28T00:00:00.000Z"),
    });
    expect(serialized).not.toMatch(/renew 360|northline/i);
    expect(serialized).not.toMatch(
      /source_reference|reference_sizes|official source url|supplier \/ reseller state|private reference|internal source/i,
    );
    expect(serialized).not.toMatch(/\b10mg;\s*15mg\b/);
    expect(serialized).not.toContain("reference price");
    expect(serialized).not.toMatch(/amountCents|priceVersion/);
  });
});
