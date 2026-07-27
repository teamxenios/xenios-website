import { describe, expect, it } from "vitest";
import {
  v3CatalogProfiles,
  v3PreviewCatalogProducts,
  v3PreviewProducts,
} from "./v3-preview-catalog";
import { createCatalogService } from "./catalog-service";

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

  it("cannot become purchasable through the compatibility commerce projection", () => {
    const service = createCatalogService({
      products: v3PreviewCatalogProducts,
      commerceEnabled: true,
      quantumCommerceEnabled: true,
    });
    expect(service.listProducts()).toHaveLength(49);
    expect(service.listProducts().filter((item) => item.purchasable)).toEqual([]);
    expect(service.listProducts().every((item) => item.priceCents === null)).toBe(
      true,
    );
  });

  it("does not expose competitive-reference URLs or internal prices", () => {
    const serialized = JSON.stringify({
      v3PreviewProducts,
      v3PreviewCatalogProducts,
    });
    expect(serialized).not.toContain("northlinelabs");
    expect(serialized).not.toContain("reference price");
    expect(serialized).not.toMatch(/amountCents|priceVersion/);
  });
});
