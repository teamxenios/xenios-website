/**
 * XCA-W8 cross-lane assembly, Task 2: detail-to-cart lineage over REAL classes.
 *
 * Every merged pricing test exercises bindCartPrice against a hand-rolled
 * PriceResolverPort fake. This suite closes that composition gap: it
 * instantiates the REAL AuthoritativePriceResolver over a PricingProductSource
 * fixture (the only fake, the true external boundary), resolves a price the
 * way the product detail page would, then passes THE SAME resolver instance
 * as the price port into the REAL bindCartPrice, and proves the bound
 * CartPriceSnapshot pins exactly the price the detail page resolved.
 */

import { describe, expect, it } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import {
  authorizeAudienceFromServerIdentity,
  createAuthoritativePriceResolver,
  type PricingProductSource,
  type ServerAuthorizedAudience,
} from "./authoritative-price-resolver";
import {
  bindCartPrice,
  type CartPriceBindingDeps,
  type VariantLookupBySku,
} from "./cart-price-binding";

const AT = "2026-07-29T12:00:00+00:00";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SKU = "XCA-LINEAGE-SKU-A";
const PRICE_VERSION = 3;
const PRICE_AMOUNT_CENTS = 12900;
const EFFECTIVE_AT = "2026-07-01T00:00:00+00:00";

function detailFixture(): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "XCA-LINEAGE-A",
    slug: "xca-lineage-a",
    displayName: "Lineage Research",
    canonicalName: "Lineage",
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
      shortDescription: "Lineage fixture.",
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
    variants: [
      {
        id: VARIANT_ID,
        productId: PRODUCT_ID,
        sku: SKU,
        catalogNumber: null,
        label: "Standard vial",
        strength: "10 mg",
        size: null,
        format: "Vial",
        presentation: null,
        shippingClass: "standard",
        memberEligible: true,
        status: "approved",
        active: true,
        sortOrder: 0,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    prices: [
      {
        id: PRICE_ID,
        productId: PRODUCT_ID,
        variantId: VARIANT_ID,
        audience: "retail",
        amountCents: PRICE_AMOUNT_CENTS,
        currency: "USD",
        effectiveAt: EFFECTIVE_AT,
        expiresAt: null,
        status: "active",
        approvalNote: "Approved",
        version: PRICE_VERSION,
        createdBy: "admin",
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    media: [],
    history: [],
  };
}

/** The one allowed fake: the true external read boundary. */
function fixtureSource(product: AdminProductDetail): PricingProductSource {
  return {
    async readProductForPricing(productId) {
      return productId === product.id ? product : null;
    },
  };
}

/**
 * SKU lookup derived from the SAME fixture the resolver reads, so both ports
 * observe one source of truth, exactly as the database would provide.
 */
function lookupFrom(product: AdminProductDetail): VariantLookupBySku {
  return {
    async findVariantBySku(sku) {
      const matches = product.variants.filter((variant) => variant.sku === sku);
      if (matches.length !== 1) return null;
      const variant = matches[0];
      return {
        productId: variant.productId,
        variantId: variant.id,
        sku: variant.sku,
        displayName: `${product.displayName} ${variant.label}`,
      };
    },
  };
}

function audience(evaluatedAt: string = AT): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "retail",
    sourceVersion: "session-v1",
    evaluatedAt,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

describe("detail-to-cart lineage over the real resolver", () => {
  it("binds the exact price the detail page resolved, through the same resolver instance", async () => {
    const product = detailFixture();
    const resolver = createAuthoritativePriceResolver(fixtureSource(product));
    const authorized = audience();

    // Step 1: the detail page's resolution.
    const detailResolution = await resolver.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      authenticatedAudience: authorized,
      currency: "USD",
      at: AT,
    });
    expect(detailResolution.state).toBe("available");
    if (detailResolution.state !== "available") return;
    const detailPrice = detailResolution.price;
    expect(detailPrice.priceId).toBe(PRICE_ID);
    expect(detailPrice.version).toBe(PRICE_VERSION);
    expect(detailPrice.amountCents).toBe(PRICE_AMOUNT_CENTS);

    // Step 2: the cart binds through THE SAME resolver instance as its port.
    const deps: CartPriceBindingDeps = {
      variants: lookupFrom(product),
      priceResolver: resolver,
    };
    const bound = await bindCartPrice(
      {
        sku: SKU,
        quantity: 2,
        authenticatedAudience: authorized,
        currency: "USD",
        at: AT,
      },
      deps,
    );
    expect(bound.state).toBe("bound");
    if (bound.state !== "bound") return;
    const snapshot = bound.snapshot;

    // The snapshot pins exactly what the detail page resolved.
    expect(snapshot.priceId).toBe(detailPrice.priceId);
    expect(snapshot.priceVersion).toBe(detailPrice.version);
    expect(snapshot.unitAmountCents).toBe(detailPrice.amountCents);
    expect(snapshot.productId).toBe(detailPrice.productId);
    expect(snapshot.variantId).toBe(detailPrice.variantId);
    expect(snapshot.audience).toBe(detailPrice.audience);
    expect(snapshot.currency).toBe(detailPrice.currency);
    expect(snapshot.effectiveAt).toBe(detailPrice.effectiveAt);
    expect(snapshot.expiresAt).toBe(detailPrice.expiresAt);
    expect(snapshot.sku).toBe(SKU);
    expect(snapshot.quantity).toBe(2);
    expect(snapshot.lineTotalCents).toBe(PRICE_AMOUNT_CENTS * 2);
    expect(snapshot.pricedAt).toBe(AT);
  });

  it("fails closed through the real resolver when the fixture has no price for the audience", async () => {
    const product = detailFixture();
    product.prices = [];
    const resolver = createAuthoritativePriceResolver(fixtureSource(product));
    const bound = await bindCartPrice(
      {
        sku: SKU,
        quantity: 1,
        authenticatedAudience: audience(),
        currency: "USD",
        at: AT,
      },
      { variants: lookupFrom(product), priceResolver: resolver },
    );
    expect(bound).toEqual({ state: "rejected", reason: "price_missing" });
  });

  it("fails closed through the real resolver when the product is not published", async () => {
    const product = detailFixture();
    product.status = "draft";
    const resolver = createAuthoritativePriceResolver(fixtureSource(product));
    const bound = await bindCartPrice(
      {
        sku: SKU,
        quantity: 1,
        authenticatedAudience: audience(),
        currency: "USD",
        at: AT,
      },
      { variants: lookupFrom(product), priceResolver: resolver },
    );
    expect(bound).toEqual({ state: "rejected", reason: "product_inactive" });
  });
});
