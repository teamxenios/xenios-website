import { describe, expect, it, vi } from "vitest";
import type { SupplementManifestRow } from "./contracts";
import { assertOfficialUrl } from "./http";
import { OfficialPageAdapter } from "./official-page";
import { ShopifyOfficialProductAdapter } from "./shopify";

const row: SupplementManifestRow = {
  sourceRowId: "222",
  canonicalProductId: "MOM-0001",
  canonicalVariantId: "MOM-0001",
  exactSku: "CREATINE-WM-60",
  supplierProductCode: "CREATINE-WM-60",
  upc: null,
  brand: "Momentous",
  productName: "Creatine - 60 Servings",
  variantOrFormat: "Watermelon",
  packageCount: "60 servings",
  flavor: "Watermelon",
  form: "Powder",
  sizeOrWeight: null,
  recommendedPrice: 49.95,
  currentOfferState: "HELD_PENDING_GATES",
  officialProductUrl: "https://www.livemomentous.com/products/creatine",
};

describe("official source adapters", () => {
  it("refuses unofficial and non-HTTPS sources", () => {
    expect(() => assertOfficialUrl("Momentous", "https://amazon.com/item")).toThrow(
      /not approved/,
    );
    expect(() => assertOfficialUrl("Momentous", "http://www.livemomentous.com/item")).toThrow(
      /HTTPS/,
    );
  });

  it("extracts a Product JSON-LD candidate without evaluating page scripts", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        `<html><head><script type="application/ld+json">${JSON.stringify({
          "@type": "Product",
          name: "Creatine - 60 Servings",
          brand: { name: "Momentous" },
          sku: "CREATINE-WM-60",
          image: { url: "https://www.livemomentous.com/image.jpg", width: 1600, height: 1600 },
        })}</script></head></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    const result = await new OfficialPageAdapter(fetcher, () => new Date("2026-08-02T00:00:00Z")).lookup(row);
    expect(result.candidates[0]).toMatchObject({
      brand: "Momentous",
      officialSku: "CREATINE-WM-60",
      width: 1600,
      sourceAdapter: "official-page-jsonld-v1",
    });
  });

  it("expands Shopify variants and retains their exact SKU", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 10,
          title: "Creatine - 60 Servings",
          vendor: "Momentous",
          variants: [
            {
              id: 11,
              title: "Watermelon / 60 Servings",
              sku: "CREATINE-WM-60",
              featured_image: { src: "//cdn.shopify.com/s/files/wm.png", width: 1800, height: 1800 },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await new ShopifyOfficialProductAdapter(fetcher).lookup(row);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      officialVariantId: "11",
      officialSku: "CREATINE-WM-60",
      packageCount: "60 Servings",
      officialImageUrl: "https://cdn.shopify.com/s/files/wm.png",
    });
  });
});
