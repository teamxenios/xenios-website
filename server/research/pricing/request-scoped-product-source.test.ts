/**
 * The correctness proof for the request-scoped pricing source.
 *
 * Speed is the easy half. The half that matters is that every answer is byte for
 * byte the answer the unwrapped source gives, including the answers that refuse.
 * These tests hold the wrapper to the unwrapped source rather than to a
 * hand-written expectation, so a future change to the uniqueness rule cannot
 * drift the two apart silently.
 */

import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductSummary,
} from "@shared/research/product-admin";
import {
  authorizeAudienceFromServerIdentity,
  CatalogPricingProductSource,
  createAuthoritativePriceResolver,
  type PricingProductSource,
} from "./authoritative-price-resolver";
import {
  createRequestScopedPricingProductSource,
  isBulkPricingProductSource,
} from "./request-scoped-product-source";

const AT = "2026-07-26T22:00:00+00:00";

function summary(
  overrides: Partial<AdminProductSummary> = {},
): AdminProductSummary {
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
  };
}

function detail(
  overrides: Partial<AdminProductDetail> = {},
): AdminProductDetail {
  return {
    ...summary(),
    content: {
      shortDescription: "Reviewed summary.",
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
    variants: [],
    prices: [],
    media: [],
    history: [],
    ...overrides,
  };
}

/** A catalog reader whose reads are counted, standing in for Product Control. */
function countingReader(catalog: readonly AdminProductDetail[]) {
  const readCatalog = vi.fn(async () => catalog.map((product) => product));
  return { readCatalog };
}

describe("request-scoped pricing product source", () => {
  it("reads the catalog once for many product ids", async () => {
    const reader = countingReader([
      detail({ id: "product-a" }),
      detail({ id: "product-b", slug: "product-b" }),
      detail({ id: "product-c", slug: "product-c" }),
    ]);
    const scoped = createRequestScopedPricingProductSource(
      new CatalogPricingProductSource(reader),
    );

    const results = await Promise.all([
      scoped.readProductForPricing("product-a"),
      scoped.readProductForPricing("product-b"),
      scoped.readProductForPricing("product-c"),
      scoped.readProductForPricing("product-a"),
    ]);

    expect(reader.readCatalog).toHaveBeenCalledTimes(1);
    expect(results.map((product) => product?.id ?? null)).toEqual([
      "product-a",
      "product-b",
      "product-c",
      "product-a",
    ]);
  });

  it("answers exactly what the unwrapped source answers, including refusals", async () => {
    // Present once, present twice (ambiguous), and absent.
    const catalog = [
      detail({ id: "product-a" }),
      detail({ id: "product-dupe", slug: "dupe-one" }),
      detail({ id: "product-dupe", slug: "dupe-two" }),
    ];
    const direct = new CatalogPricingProductSource(countingReader(catalog));
    const scoped = createRequestScopedPricingProductSource(
      new CatalogPricingProductSource(countingReader(catalog)),
    );

    for (const productId of ["product-a", "product-dupe", "product-missing", ""]) {
      const expected = await direct.readProductForPricing(productId);
      const actual = await scoped.readProductForPricing(productId);
      expect(actual).toEqual(expected);
    }

    // Spelled out, because these two are the fail-closed cases that matter.
    expect(await scoped.readProductForPricing("product-dupe")).toBeNull();
    expect(await scoped.readProductForPricing("product-missing")).toBeNull();
  });

  it("fails closed when the catalog read throws, and never swallows the failure", async () => {
    const reader = {
      readCatalog: vi.fn(async () => {
        throw new Error("product control unavailable");
      }),
    };
    const scoped = createRequestScopedPricingProductSource(
      new CatalogPricingProductSource(reader),
    );

    // The rejection still reaches the caller, which is what lets the price
    // authority catch it and answer "Price on request" rather than a price.
    await expect(scoped.readProductForPricing("product-a")).rejects.toThrow(
      "product control unavailable",
    );
    await expect(scoped.readProductForPricing("product-b")).rejects.toThrow(
      "product control unavailable",
    );
    expect(reader.readCatalog).toHaveBeenCalledTimes(1);
  });

  it("memoizes per product id when the source cannot hand over a catalog", async () => {
    const single: PricingProductSource = {
      readProductForPricing: vi.fn(async (productId: string) =>
        productId === "product-a" ? detail({ id: "product-a" }) : null,
      ),
    };
    expect(isBulkPricingProductSource(single)).toBe(false);

    const scoped = createRequestScopedPricingProductSource(single);
    await scoped.readProductForPricing("product-a");
    await scoped.readProductForPricing("product-a");
    const missing = await scoped.readProductForPricing("product-z");

    expect(single.readProductForPricing).toHaveBeenCalledTimes(2);
    expect(missing).toBeNull();
  });

  it("recognizes the shipped adapter as able to hand over a catalog", () => {
    expect(
      isBulkPricingProductSource(
        new CatalogPricingProductSource(countingReader([])),
      ),
    ).toBe(true);
  });

  it("keeps every resolver refusal intact behind the cache", async () => {
    const approvedVariant = {
      id: "variant-a",
      productId: "product-a",
      sku: "SKU-A",
      catalogNumber: null,
      label: "10 mg",
      strength: null,
      size: null,
      format: null,
      presentation: null,
      shippingClass: null,
      memberEligible: true,
      status: "approved" as const,
      active: true,
      sortOrder: 1,
      createdAt: AT,
      updatedAt: AT,
    };
    const basePrice = {
      id: "price-a",
      productId: "product-a",
      variantId: "variant-a",
      audience: "member" as const,
      currency: "USD",
      effectiveAt: "2026-01-01T00:00:00+00:00",
      expiresAt: null,
      status: "active" as const,
      approvalNote: null,
      version: 1,
      createdBy: "seed",
      approvedBy: "approver",
      createdAt: AT,
      updatedAt: AT,
    };

    const catalog = [
      detail({
        id: "product-a",
        variants: [approvedVariant],
        prices: [{ ...basePrice, amountCents: 9900 }],
      }),
      // Zero amount: indistinguishable from no price, never a "$0.00".
      detail({
        id: "product-zero",
        slug: "product-zero",
        variants: [{ ...approvedVariant, id: "variant-zero", productId: "product-zero" }],
        prices: [
          {
            ...basePrice,
            id: "price-zero",
            productId: "product-zero",
            variantId: "variant-zero",
            amountCents: 0,
          },
        ],
      }),
      // Not member eligible.
      detail({
        id: "product-admin",
        slug: "product-admin",
        variants: [
          {
            ...approvedVariant,
            id: "variant-admin",
            productId: "product-admin",
            memberEligible: false,
          },
        ],
        prices: [
          {
            ...basePrice,
            id: "price-admin",
            productId: "product-admin",
            variantId: "variant-admin",
            amountCents: 9900,
          },
        ],
      }),
    ];

    const reader = countingReader(catalog);
    const resolver = createAuthoritativePriceResolver(
      createRequestScopedPricingProductSource(
        new CatalogPricingProductSource(reader),
      ),
    );
    const authenticatedAudience = authorizeAudienceFromServerIdentity({
      audience: "member",
      sourceVersion: "member-v1",
      evaluatedAt: AT,
    });
    if (authenticatedAudience === null) throw new Error("audience not authorized");

    const ask = (productId: string, variantId: string) =>
      resolver.resolveApprovedResearchPrice({
        productId,
        variantId,
        authenticatedAudience,
        currency: "USD",
        at: AT,
      });

    const good = await ask("product-a", "variant-a");
    expect(good.state).toBe("available");
    if (good.state === "available") {
      expect(good.price.amountCents).toBe(9900);
      expect(good.price.productId).toBe("product-a");
      expect(good.price.variantId).toBe("variant-a");
      // The customer boundary carries no approval detail.
      expect(Object.keys(good.price)).not.toContain("approvalNote");
      expect(Object.keys(good.price)).not.toContain("approvedBy");
    }

    expect(await ask("product-zero", "variant-zero")).toEqual({
      state: "unavailable",
      reason: "price_missing",
    });
    expect(await ask("product-admin", "variant-admin")).toEqual({
      state: "unavailable",
      reason: "member_ineligible",
    });
    expect(await ask("product-a", "variant-elsewhere")).toEqual({
      state: "unavailable",
      reason: "variant_inactive",
    });
    expect(await ask("product-missing", "variant-a")).toEqual({
      state: "unavailable",
      reason: "product_inactive",
    });

    // Five questions, one catalog read.
    expect(reader.readCatalog).toHaveBeenCalledTimes(1);
  });
});
