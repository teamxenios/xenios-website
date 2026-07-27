import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductSummary,
} from "@shared/research/product-admin";
import {
  LiveProductControlReader,
  ProductControlCurrentPriceResolver,
} from "./product-control-reader";

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
    ...overrides,
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

describe("live Product Control member readers", () => {
  it("reads exact published/public/active details and defensively rejects drift", async () => {
    const publicProduct = summary();
    const drifted = summary({
      id: "product-b",
      slug: "product-b",
      status: "draft",
    });
    const repository = {
      list: vi.fn(async () => [publicProduct, drifted]),
      get: vi.fn(async (id: string) =>
        id === publicProduct.id
          ? detail()
          : detail({ ...drifted, id: drifted.id }),
      ),
    };
    const reader = new LiveProductControlReader(repository);

    await expect(reader.readCatalog()).resolves.toEqual([detail()]);
    expect(repository.list).toHaveBeenCalledWith({
      status: "published",
      visibility: "public",
    });
    expect(repository.get).toHaveBeenCalledTimes(2);
  });

  it("resolves one exact public slug and fails closed for absent or ambiguous identity", async () => {
    const product = summary();
    const repository = {
      list: vi.fn(async ({ query }: { query?: string }) =>
        query === "product-a" ? [product] : [],
      ),
      get: vi.fn(async () => detail()),
    };
    const reader = new LiveProductControlReader(repository);

    await expect(reader.readDetail(" Product-A ")).resolves.toEqual(detail());
    await expect(reader.readDetail("missing")).resolves.toBeNull();

    repository.list.mockResolvedValueOnce([
      product,
      { ...product, id: "duplicate" },
    ]);
    await expect(reader.readDetail("product-a")).resolves.toBeNull();
  });

  it("omits duplicate product IDs or slugs from catalog reads", async () => {
    const first = summary();
    const duplicate = summary({ id: "product-b" });
    const repository = {
      list: vi.fn(async () => [first, duplicate]),
      get: vi.fn(async () => detail()),
    };
    const reader = new LiveProductControlReader(repository);
    await expect(reader.readCatalog()).resolves.toEqual([]);
    expect(repository.get).not.toHaveBeenCalled();
  });

  it("binds summary and detail identity to one exact Product Control snapshot", async () => {
    const productA = summary();
    const substitutedB = detail({
      id: "product-b",
      productCode: "PRODUCT-B",
      slug: "product-b",
      displayName: "Product B",
      canonicalName: "Product B",
    });
    const substitutionRepository = {
      list: vi.fn(async () => [productA]),
      get: vi.fn(async () => substitutedB),
    };
    const substitutionReader = new LiveProductControlReader(
      substitutionRepository,
    );
    await expect(substitutionReader.readCatalog()).resolves.toEqual([]);
    await expect(substitutionReader.readDetail("product-a")).resolves.toBeNull();

    const changedSlugRepository = {
      list: vi.fn(async () => [productA]),
      get: vi.fn(async () =>
        detail({ slug: "product-a-renamed", updatedAt: AT }),
      ),
    };
    const changedSlugReader = new LiveProductControlReader(
      changedSlugRepository,
    );
    await expect(changedSlugReader.readCatalog()).resolves.toEqual([]);
    await expect(changedSlugReader.readDetail("product-a")).resolves.toBeNull();

    const changedVersionRepository = {
      list: vi.fn(async () => [productA]),
      get: vi.fn(async () =>
        detail({ updatedAt: "2026-07-26T22:00:01+00:00" }),
      ),
    };
    const changedVersionReader = new LiveProductControlReader(
      changedVersionRepository,
    );
    await expect(changedVersionReader.readCatalog()).resolves.toEqual([]);
    await expect(
      changedVersionReader.readDetail("product-a"),
    ).resolves.toBeNull();
  });

  it("rechecks exact parent and child snapshots without losing microseconds", async () => {
    const subMillisecondSummary = summary({
      updatedAt: "2026-07-27T00:00:00.123001Z",
    });
    const subMillisecondRepository = {
      list: vi.fn(async () => [subMillisecondSummary]),
      get: vi.fn(async () =>
        detail({ updatedAt: "2026-07-27T00:00:00.123999Z" }),
      ),
    };
    const subMillisecondReader = new LiveProductControlReader(
      subMillisecondRepository,
    );
    await expect(subMillisecondReader.readCatalog()).resolves.toEqual([]);

    const baseDetail = detail({
      prices: [
        {
          id: "price-a",
          productId: "product-a",
          variantId: "variant-a",
          audience: "member",
          amountCents: 14900,
          currency: "USD",
          effectiveAt: AT,
          expiresAt: null,
          status: "active",
          approvalNote: "Approved",
          version: 1,
          createdBy: "admin",
          approvedBy: "reviewer",
          createdAt: AT,
          updatedAt: AT,
        },
      ],
    });
    const changedPrice = detail({
      prices: [
        {
          ...baseDetail.prices[0],
          amountCents: 19900,
          version: 2,
        },
      ],
    });
    const priceMutationRepository = {
      list: vi.fn(async () => [summary()]),
      get: vi
        .fn()
        .mockResolvedValueOnce(baseDetail)
        .mockResolvedValueOnce(changedPrice),
    };
    const priceMutationReader = new LiveProductControlReader(
      priceMutationRepository,
    );
    await expect(priceMutationReader.readCatalog()).resolves.toEqual([]);
    const detailPriceMutationRepository = {
      list: vi.fn(async () => [summary()]),
      get: vi
        .fn()
        .mockResolvedValueOnce(baseDetail)
        .mockResolvedValueOnce(changedPrice),
    };
    await expect(
      new LiveProductControlReader(
        detailPriceMutationRepository,
      ).readDetail("product-a"),
    ).resolves.toBeNull();

    for (const changed of [
      detail({
        variants: [
          {
            id: "variant-a",
            productId: "product-a",
            sku: "CHANGED-SKU",
            catalogNumber: null,
            label: "Changed",
            strength: null,
            size: null,
            format: null,
            presentation: null,
            shippingClass: null,
            memberEligible: true,
            status: "approved",
            active: true,
            sortOrder: 0,
            createdAt: AT,
            updatedAt: AT,
          },
        ],
      }),
      detail({
        media: [
          {
            id: "media-a",
            productId: "product-a",
            kind: "primary_image",
            state: "approved",
            storageKey: "product-a/media-a/product-a.webp",
            filename: "product-a.webp",
            contentType: "image/webp",
            sizeBytes: 100,
            altText: "Changed media",
            sortOrder: 0,
            approvedBy: "reviewer",
            createdAt: AT,
            updatedAt: AT,
          },
        ],
      }),
      detail({
        content: {
          ...detail().content,
          overview: "Changed content",
        },
      }),
    ]) {
      const repository = {
        list: vi.fn(async () => [summary()]),
        get: vi
          .fn()
          .mockResolvedValueOnce(detail())
          .mockResolvedValueOnce(changed),
      };
      await expect(
        new LiveProductControlReader(repository).readCatalog(),
      ).resolves.toEqual([]);
    }
  });
});

describe("Product Control current price resolver", () => {
  const variant = {
    id: "variant-a",
    productId: "product-a",
    sku: "SKU-A",
    catalogNumber: null,
    label: "Variant A",
    strength: null,
    size: null,
    format: null,
    presentation: null,
    shippingClass: "standard",
    memberEligible: true,
    status: "approved" as const,
    active: true,
    sortOrder: 0,
    createdAt: AT,
    updatedAt: AT,
  };
  const price = {
    id: "price-a",
    productId: "product-a",
    variantId: "variant-a",
    audience: "member" as const,
    amountCents: 14900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.123456+00:00",
    expiresAt: null,
    status: "active" as const,
    approvalNote: "Approved",
    version: 2,
    createdBy: "admin",
    approvedBy: "reviewer",
    createdAt: AT,
    updatedAt: AT,
  };

  it("returns one approved effective price for the exact variant and audience", () => {
    const resolver = new ProductControlCurrentPriceResolver();
    expect(
      resolver.resolve({
        productId: "product-a",
        variant,
        prices: [price],
        audienceEligibility: {
          audience: "member",
          state: "authorized",
          sourceVersion: "member-v1",
          evaluatedAt: AT,
        },
        currency: "USD",
        evaluatedAt: AT,
      }),
    ).toEqual(price);
  });

  it("fails closed for unreviewed variants, stale prices, and ambiguity", () => {
    const resolver = new ProductControlCurrentPriceResolver();
    const input = {
      productId: "product-a",
      variant,
      prices: [price],
      audienceEligibility: {
        audience: "member" as const,
        state: "authorized" as const,
        sourceVersion: "member-v1",
        evaluatedAt: AT,
      },
      currency: "USD",
      evaluatedAt: AT,
    };
    expect(
      resolver.resolve({
        ...input,
        variant: { ...variant, status: "draft" },
      }),
    ).toBeNull();
    expect(
      resolver.resolve({
        ...input,
        prices: [{ ...price, effectiveAt: "2026-08-01T00:00:00+00:00" }],
      }),
    ).toBeNull();
    expect(
      resolver.resolve({
        ...input,
        prices: [price, { ...price, id: "price-b" }],
      }),
    ).toBeNull();
    expect(
      resolver.resolve({
        ...input,
        audienceEligibility: {
          ...input.audienceEligibility,
          audience: "compare_at" as never,
        },
        prices: [{ ...price, audience: "compare_at" }],
      }),
    ).toBeNull();
    expect(
      resolver.resolve({
        ...input,
        audienceEligibility: {
          ...input.audienceEligibility,
          state: "unauthorized",
        },
      }),
    ).toBeNull();
  });
});
