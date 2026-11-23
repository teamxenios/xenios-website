import { describe, expect, it } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { createCatalogContentPreview, type CatalogPreviewReaders } from "./catalog-content-preview";

const productId = "11111111-1111-4111-8111-111111111111";
const variantId = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const product = { id: productId, variants: [{ id: variantId, productId }] } as AdminProductDetail;
  let reads = 0;
  const readers: CatalogPreviewReaders = {
    bindings: () => { reads++; return { index: new Map(), problem: null }; },
    catalog: () => { throw new Error("No catalog read for an unmapped variant"); },
    project: () => { throw new Error("No public projection for an unmapped variant"); },
  };
  return { product, readers, reads: () => reads, preview: createCatalogContentPreview(readers) };
}
describe("operator exact-variant catalog preview", () => {
  it("requires explicit variant selection even for a one-variant product", () => {
    const f = fixture(); expect(f.preview(f.product, undefined).state).toBe("select_variant"); expect(f.reads()).toBe(0);
  });
  it("refuses forged query shapes before any mapping read", () => {
    const f = fixture(); expect(f.preview(f.product, [variantId]).state).toBe("invalid_selection"); expect(f.reads()).toBe(0);
  });
  it("does not accept a variant from another product", () => {
    const f = fixture(); f.product.variants[0].productId = variantId;
    expect(f.preview(f.product, variantId).state).toBe("variant_not_in_product"); expect(f.reads()).toBe(0);
  });
  it("refuses missing mappings without product-wide content/media fallback", () => {
    const f = fixture(); const result = f.preview(f.product, variantId);
    expect(result.state).toBe("binding_missing"); expect(result.content).toBeNull(); expect(result.media).toBeNull();
  });
  it("refuses duplicate commercial targets instead of selecting the first", () => {
    const f = fixture(); f.readers.bindings = () => ({ index: new Map([
      ["mo_a|mov_b", { offeringVariantId: "mov_b", productId, variantId }],
      ["mo_c|mov_d", { offeringVariantId: "mov_d", productId, variantId }],
    ]), problem: null });
    expect(f.preview(f.product, variantId).state).toBe("binding_ambiguous");
  });
  it("sanitizes binding-loader failure without returning draft or private diagnostics", () => {
    const f = fixture(); f.readers.bindings = () => { throw new Error("PRIVATE_SOURCE_SENTINEL"); };
    const result = f.preview(f.product, variantId); expect(result.state).toBe("catalog_unavailable");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SOURCE_SENTINEL");
  });
});
