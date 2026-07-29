import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import {
  authorizeAudienceFromServerIdentity,
  CatalogPricingProductSource,
  createAuthoritativePriceResolver,
  type PricingProductSource,
  type ServerAuthorizedAudience,
} from "./authoritative-price-resolver";

const AT = "2026-07-28T12:00:00+00:00";

function variant(
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
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
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function price(overrides: Partial<AdminProductPrice> = {}): AdminProductPrice {
  return {
    id: "price-a",
    productId: "product-a",
    variantId: "variant-a",
    audience: "retail",
    amountCents: 14900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00+00:00",
    expiresAt: null,
    status: "active",
    approvalNote: "Approved by pricing review",
    version: 2,
    createdBy: "admin",
    approvedBy: "reviewer",
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
    prices: [price()],
    media: [],
    history: [],
    ...overrides,
  };
}

function source(product: AdminProductDetail | null): PricingProductSource {
  return { readProductForPricing: vi.fn(async () => product) };
}

function retailAudience(): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "retail",
    sourceVersion: "session-v1",
    evaluatedAt: AT,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

function memberAudience(): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "member",
    sourceVersion: "member-tier-v1",
    evaluatedAt: AT,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    productId: "product-a",
    variantId: "variant-a",
    authenticatedAudience: retailAudience(),
    currency: "USD",
    at: AT,
    ...overrides,
  };
}

describe("server audience authorization", () => {
  it("brands only well formed server facts", () => {
    expect(retailAudience().audience).toBe("retail");
    expect(
      authorizeAudienceFromServerIdentity({
        audience: "compare_at" as never,
        sourceVersion: "session-v1",
        evaluatedAt: AT,
      }),
    ).toBeNull();
    expect(
      authorizeAudienceFromServerIdentity({
        audience: "retail",
        sourceVersion: "  ",
        evaluatedAt: AT,
      }),
    ).toBeNull();
    expect(
      authorizeAudienceFromServerIdentity({
        audience: "retail",
        sourceVersion: "session-v1",
        evaluatedAt: "not-a-timestamp",
      }),
    ).toBeNull();
  });
});

describe("authoritative price resolution", () => {
  it("resolves exactly one approved active in-window price to a customer-safe shape", async () => {
    const resolver = createAuthoritativePriceResolver(source(detail()));
    const result = await resolver.resolveApprovedResearchPrice(baseInput());
    expect(result).toEqual({
      state: "available",
      price: {
        priceId: "price-a",
        productId: "product-a",
        variantId: "variant-a",
        audience: "retail",
        amountCents: 14900,
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00+00:00",
        expiresAt: null,
        version: 2,
      },
    });
  });

  it("never leaks internal price fields on the available path", async () => {
    const resolver = createAuthoritativePriceResolver(source(detail()));
    const result = await resolver.resolveApprovedResearchPrice(baseInput());
    expect(result.state).toBe("available");
    if (result.state !== "available") return;
    expect(Object.keys(result.price).sort()).toEqual(
      [
        "amountCents",
        "audience",
        "currency",
        "effectiveAt",
        "expiresAt",
        "priceId",
        "productId",
        "variantId",
        "version",
      ].sort(),
    );
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "approvalNote",
      "approvedBy",
      "createdBy",
      "supplier",
      "wholesaleCost",
      "margin",
      "sourceUrl",
      "reviewer",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("normalizes currency casing and fails closed off the allowlist", async () => {
    const resolver = createAuthoritativePriceResolver(source(detail()));
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput({ currency: " usd " })),
    ).resolves.toMatchObject({ state: "available" });
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput({ currency: "EUR" })),
    ).resolves.toEqual({ state: "unavailable", reason: "wrong_currency" });
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput({ currency: "" })),
    ).resolves.toEqual({ state: "unavailable", reason: "wrong_currency" });
  });

  it("fails closed on malformed identity or timestamp inputs", async () => {
    const resolver = createAuthoritativePriceResolver(source(detail()));
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput({ at: "yesterday" })),
    ).resolves.toEqual({ state: "unavailable", reason: "price_missing" });
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput({ productId: "  " })),
    ).resolves.toEqual({ state: "unavailable", reason: "price_missing" });
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput({ variantId: "" })),
    ).resolves.toEqual({ state: "unavailable", reason: "price_missing" });
  });

  it("rejects an authorization evaluated at a different instant", async () => {
    const staleAuthorization = authorizeAudienceFromServerIdentity({
      audience: "retail",
      sourceVersion: "session-v1",
      evaluatedAt: "2026-07-28T11:00:00+00:00",
    });
    expect(staleAuthorization).not.toBeNull();
    const resolver = createAuthoritativePriceResolver(source(detail()));
    await expect(
      resolver.resolveApprovedResearchPrice(
        baseInput({ authenticatedAudience: staleAuthorization }),
      ),
    ).resolves.toEqual({ state: "unavailable", reason: "wrong_audience" });
  });

  it("rejects a forged non purchase audience even when cast past the types", async () => {
    const forged = {
      audience: "compare_at",
      sourceVersion: "session-v1",
      evaluatedAt: AT,
    } as unknown as ServerAuthorizedAudience;
    const resolver = createAuthoritativePriceResolver(
      source(detail({ prices: [price({ audience: "compare_at" })] })),
    );
    await expect(
      resolver.resolveApprovedResearchPrice(
        baseInput({ authenticatedAudience: forged }),
      ),
    ).resolves.toEqual({ state: "unavailable", reason: "wrong_audience" });
  });

  it("fails closed as product_inactive for missing, unpublished, hidden, or inactive products", async () => {
    for (const product of [
      null,
      detail({ status: "draft" }),
      detail({ visibility: "hidden" }),
      detail({ visibility: "members_only" }),
      detail({ active: false }),
      detail({ id: "product-b" }),
    ]) {
      const resolver = createAuthoritativePriceResolver(source(product));
      await expect(
        resolver.resolveApprovedResearchPrice(baseInput()),
      ).resolves.toEqual({ state: "unavailable", reason: "product_inactive" });
    }
  });

  it("fails closed for missing, unapproved, or inactive variants", async () => {
    const missing = createAuthoritativePriceResolver(
      source(detail({ variants: [] })),
    );
    await expect(
      missing.resolveApprovedResearchPrice(baseInput()),
    ).resolves.toEqual({ state: "unavailable", reason: "variant_inactive" });

    const unapproved = createAuthoritativePriceResolver(
      source(detail({ variants: [variant({ status: "draft" })] })),
    );
    await expect(
      unapproved.resolveApprovedResearchPrice(baseInput()),
    ).resolves.toEqual({ state: "unavailable", reason: "variant_unapproved" });

    const inactive = createAuthoritativePriceResolver(
      source(detail({ variants: [variant({ active: false })] })),
    );
    await expect(
      inactive.resolveApprovedResearchPrice(baseInput()),
    ).resolves.toEqual({ state: "unavailable", reason: "variant_inactive" });

    const wrongProduct = createAuthoritativePriceResolver(
      source(detail({ variants: [variant({ productId: "product-b" })] })),
    );
    await expect(
      wrongProduct.resolveApprovedResearchPrice(baseInput()),
    ).resolves.toEqual({ state: "unavailable", reason: "variant_inactive" });
  });

  it("returns ambiguous for duplicate variant identity", async () => {
    const resolver = createAuthoritativePriceResolver(
      source(detail({ variants: [variant(), variant()] })),
    );
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput()),
    ).resolves.toEqual({ state: "ambiguous", reason: "price_ambiguous" });
  });

  it("blocks member pricing on a member ineligible variant", async () => {
    const resolver = createAuthoritativePriceResolver(
      source(
        detail({
          variants: [variant({ memberEligible: false })],
          prices: [price({ audience: "member" })],
        }),
      ),
    );
    await expect(
      resolver.resolveApprovedResearchPrice(
        baseInput({ authenticatedAudience: memberAudience() }),
      ),
    ).resolves.toEqual({ state: "unavailable", reason: "member_ineligible" });
  });

  it("labels the whole price failure taxonomy", async () => {
    const cases: Array<{
      prices: AdminProductPrice[];
      reason: string;
      state?: string;
    }> = [
      { prices: [], reason: "price_missing" },
      {
        prices: [price({ variantId: "variant-b" })],
        reason: "price_missing",
      },
      {
        prices: [price({ audience: "member" })],
        reason: "wrong_audience",
      },
      {
        prices: [price({ currency: "EUR" })],
        reason: "wrong_currency",
      },
      {
        prices: [price({ status: "approved" })],
        reason: "price_unapproved",
      },
      {
        prices: [price({ status: "draft" })],
        reason: "price_unapproved",
      },
      {
        prices: [price({ status: "expired" })],
        reason: "price_inactive",
      },
      {
        prices: [price({ status: "superseded" })],
        reason: "price_inactive",
      },
      {
        prices: [price({ approvedBy: null })],
        reason: "price_unapproved",
      },
      {
        prices: [price({ effectiveAt: "2026-08-01T00:00:00+00:00" })],
        reason: "price_future",
      },
      {
        prices: [
          price({
            effectiveAt: "2026-06-01T00:00:00+00:00",
            expiresAt: "2026-07-01T00:00:00+00:00",
          }),
        ],
        reason: "price_expired",
      },
      {
        prices: [price(), price({ id: "price-b" })],
        reason: "price_ambiguous",
        state: "ambiguous",
      },
    ];
    for (const testCase of cases) {
      const resolver = createAuthoritativePriceResolver(
        source(detail({ prices: testCase.prices })),
      );
      await expect(
        resolver.resolveApprovedResearchPrice(baseInput()),
      ).resolves.toEqual({
        state: testCase.state ?? "unavailable",
        reason: testCase.reason,
      });
    }
  });

  it("never returns a zero amount as available", async () => {
    const resolver = createAuthoritativePriceResolver(
      source(detail({ prices: [price({ amountCents: 0 })] })),
    );
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput()),
    ).resolves.toEqual({ state: "unavailable", reason: "price_missing" });
  });

  it("lets the authority win when the classifier would disagree", async () => {
    // A blank sku passes this facade's variant checks but the underlying
    // authority rejects it. The classifier then sees one seemingly valid
    // price row. The result must still fail closed, never become available.
    const resolver = createAuthoritativePriceResolver(
      source(detail({ variants: [variant({ sku: "  " })] })),
    );
    await expect(
      resolver.resolveApprovedResearchPrice(baseInput()),
    ).resolves.toEqual({ state: "unavailable", reason: "price_missing" });
  });

  it("resolves member prices for member eligible variants", async () => {
    const resolver = createAuthoritativePriceResolver(
      source(detail({ prices: [price({ audience: "member" })] })),
    );
    await expect(
      resolver.resolveApprovedResearchPrice(
        baseInput({ authenticatedAudience: memberAudience() }),
      ),
    ).resolves.toMatchObject({
      state: "available",
      price: { audience: "member", amountCents: 14900 },
    });
  });
});

describe("catalog pricing product source", () => {
  it("returns exactly one catalog match and fails closed otherwise", async () => {
    const single = new CatalogPricingProductSource({
      readCatalog: vi.fn(async () => [detail()]),
    });
    await expect(single.readProductForPricing("product-a")).resolves.toEqual(
      detail(),
    );
    await expect(single.readProductForPricing("product-b")).resolves.toBeNull();

    const duplicated = new CatalogPricingProductSource({
      readCatalog: vi.fn(async () => [detail(), detail()]),
    });
    await expect(
      duplicated.readProductForPricing("product-a"),
    ).resolves.toBeNull();
  });
});
