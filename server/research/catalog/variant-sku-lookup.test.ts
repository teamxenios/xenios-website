import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductVariant,
} from "@shared/research/product-admin";
import { createCatalogVariantLookupBySku } from "./variant-sku-lookup";
import type { ProductCatalogReader } from "./product-control-reader";

const AT = "2026-07-28T12:00:00+00:00";

function variant(
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
    id: "variant-a",
    productId: "product-a",
    sku: "SKU-A",
    catalogNumber: null,
    label: "10 mg",
    strength: null,
    size: null,
    format: null,
    presentation: null,
    shippingClass: "standard",
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function detail(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    id: "product-a",
    productCode: "PRODUCT-A",
    slug: "product-a",
    displayName: "Product A",
    canonicalName: "Product A",
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    content: {
      shortDescription: null,
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
    variants: [variant()],
    prices: [],
    media: [],
    history: [],
    ...overrides,
  };
}

function reader(catalog: AdminProductDetail[]): ProductCatalogReader {
  return { readCatalog: vi.fn(async () => catalog) };
}

describe("SKU to Product Control variant identity", () => {
  it("resolves exactly one identity and qualifies the name with the variant label", async () => {
    const lookup = createCatalogVariantLookupBySku(reader([detail()]));
    await expect(lookup.findVariantBySku("SKU-A")).resolves.toEqual({
      productId: "product-a",
      variantId: "variant-a",
      sku: "SKU-A",
      displayName: "Product A 10 mg",
    });
  });

  it("does not repeat a label the product name already carries", async () => {
    const lookup = createCatalogVariantLookupBySku(
      reader([
        detail({
          displayName: "Product A 10 mg",
          variants: [variant({ label: "10 mg" })],
        }),
      ]),
    );
    const found = await lookup.findVariantBySku("SKU-A");
    expect(found?.displayName).toBe("Product A 10 mg");
  });

  it("trims the requested SKU but never case folds it", async () => {
    const lookup = createCatalogVariantLookupBySku(reader([detail()]));
    await expect(lookup.findVariantBySku("  SKU-A  ")).resolves.not.toBeNull();
    // research_product_variants.sku is UNIQUE on the stored value, so folding
    // here would invent a collision the database does not have.
    await expect(lookup.findVariantBySku("sku-a")).resolves.toBeNull();
  });

  it("refuses a SKU carried by two variants rather than picking the first", async () => {
    const lookup = createCatalogVariantLookupBySku(
      reader([
        detail({
          variants: [variant(), variant({ id: "variant-b" })],
          variantCount: 2,
        }),
      ]),
    );
    await expect(lookup.findVariantBySku("SKU-A")).resolves.toBeNull();
  });

  it("refuses a SKU carried by two different products", async () => {
    const lookup = createCatalogVariantLookupBySku(
      reader([
        detail(),
        detail({
          id: "product-b",
          slug: "product-b",
          displayName: "Product B",
          variants: [variant({ id: "variant-b", productId: "product-b" })],
        }),
      ]),
    );
    await expect(lookup.findVariantBySku("SKU-A")).resolves.toBeNull();
  });

  it("refuses a variant whose parent disagrees with the product it was read under", async () => {
    const lookup = createCatalogVariantLookupBySku(
      reader([detail({ variants: [variant({ productId: "product-z" })] })]),
    );
    await expect(lookup.findVariantBySku("SKU-A")).resolves.toBeNull();
  });

  it("refuses a blank SKU, an unknown SKU, and an empty catalog without reading twice", async () => {
    const catalogReader = reader([detail()]);
    const lookup = createCatalogVariantLookupBySku(catalogReader);
    await expect(lookup.findVariantBySku("   ")).resolves.toBeNull();
    // A blank SKU is refused before the reader is consulted at all.
    expect(catalogReader.readCatalog).not.toHaveBeenCalled();
    await expect(lookup.findVariantBySku("SKU-MISSING")).resolves.toBeNull();
    await expect(
      createCatalogVariantLookupBySku(reader([])).findVariantBySku("SKU-A"),
    ).resolves.toBeNull();
  });

  it("refuses when identity or naming is incomplete, rather than inventing a name", async () => {
    await expect(
      createCatalogVariantLookupBySku(
        reader([detail({ variants: [variant({ id: "  " })] })]),
      ).findVariantBySku("SKU-A"),
    ).resolves.toBeNull();
    await expect(
      createCatalogVariantLookupBySku(
        reader([
          detail({ displayName: "   ", variants: [variant({ label: "  " })] }),
        ]),
      ).findVariantBySku("SKU-A"),
    ).resolves.toBeNull();
  });

  it("carries no price, cost, or admin field into the identity it returns", async () => {
    const lookup = createCatalogVariantLookupBySku(reader([detail()]));
    const found = await lookup.findVariantBySku("SKU-A");
    expect(found).not.toBeNull();
    expect(Object.keys(found ?? {}).sort()).toEqual([
      "displayName",
      "productId",
      "sku",
      "variantId",
    ]);
  });
});
