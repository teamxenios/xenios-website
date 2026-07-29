/**
 * XCA-W8 cross-lane assembly, Task 5: the reprice flow over REAL classes.
 *
 * A member adds to cart, then the founder publishes a new price version for
 * the same variant and audience. This suite proves, through the REAL
 * AuthoritativePriceResolver and the REAL binding/revalidation/recompute
 * modules, that the stale snapshot surfaces as a typed reprice_required, the
 * re-bind carries the new version, and recomputeCheckout rejects the stale
 * presented numbers rather than silently charging either amount.
 *
 * The only fake is the PricingProductSource fixture (the external boundary),
 * whose product record is mutated between hops exactly as the database would
 * change under the protected approval flow (old row superseded, new active
 * row with version + 1).
 */

import { describe, expect, it } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
} from "@shared/research/product-admin";
import {
  authorizeAudienceFromServerIdentity,
  createAuthoritativePriceResolver,
  type PricingProductSource,
  type ServerAuthorizedAudience,
} from "./authoritative-price-resolver";
import {
  bindCartPrice,
  revalidateCartPriceSnapshot,
  type CartPriceBindingDeps,
  type VariantLookupBySku,
} from "./cart-price-binding";
import { recomputeCheckout } from "./checkout-recompute";

const AT = "2026-07-29T12:00:00+00:00";
const LATER = "2026-07-29T15:00:00+00:00";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRICE_V1_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const PRICE_V2_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const SKU = "XCA-REPRICE-SKU-A";
const AMOUNT_V1 = 12900;
const AMOUNT_V2 = 13900;

function priceRow(
  id: string,
  amountCents: number,
  version: number,
  overrides: Partial<AdminProductPrice> = {},
): AdminProductPrice {
  return {
    id,
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "retail",
    amountCents,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00+00:00",
    expiresAt: null,
    status: "active",
    approvalNote: "Approved",
    version,
    createdBy: "admin",
    approvedBy: "reviewer",
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function detailFixture(): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "XCA-REPRICE-A",
    slug: "xca-reprice-a",
    displayName: "Reprice Research",
    canonicalName: "Reprice",
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
      shortDescription: "Reprice fixture.",
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
        strength: null,
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
    prices: [priceRow(PRICE_V1_ID, AMOUNT_V1, 1)],
    media: [],
    history: [],
  };
}

/** The one allowed fake: a mutable stand-in for the price authority's store. */
function mutableSource(product: AdminProductDetail): PricingProductSource {
  return {
    async readProductForPricing(productId) {
      return productId === product.id ? product : null;
    },
  };
}

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

function audience(evaluatedAt: string): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "retail",
    sourceVersion: "session-v1",
    evaluatedAt,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

/** The database change the protected approval flow performs: supersede v1, activate v2. */
function publishVersionTwo(product: AdminProductDetail): void {
  product.prices = [
    priceRow(PRICE_V1_ID, AMOUNT_V1, 1, { status: "superseded" }),
    priceRow(PRICE_V2_ID, AMOUNT_V2, 2, {
      effectiveAt: "2026-07-29T13:00:00+00:00",
    }),
  ];
}

describe("reprice flow over the real resolver", () => {
  it("surfaces reprice_required, re-binds at the new version, and rejects the stale claim at checkout", async () => {
    const product = detailFixture();
    const resolver = createAuthoritativePriceResolver(mutableSource(product));
    const deps: CartPriceBindingDeps = {
      variants: lookupFrom(product),
      priceResolver: resolver,
    };

    // Hop 1: bind at AT against version 1.
    const bound = await bindCartPrice(
      { sku: SKU, quantity: 2, authenticatedAudience: audience(AT), currency: "USD", at: AT },
      deps,
    );
    expect(bound.state).toBe("bound");
    if (bound.state !== "bound") return;
    expect(bound.snapshot.priceId).toBe(PRICE_V1_ID);
    expect(bound.snapshot.priceVersion).toBe(1);
    expect(bound.snapshot.unitAmountCents).toBe(AMOUNT_V1);

    // Hop 2: the founder publishes version 2 in the underlying source.
    publishVersionTwo(product);

    // Hop 3: revalidation of the stored snapshot reports the drift, typed.
    const revalidation = await revalidateCartPriceSnapshot(
      {
        snapshot: bound.snapshot,
        authenticatedAudience: audience(LATER),
        currency: "USD",
        at: LATER,
      },
      deps,
    );
    expect(revalidation.state).toBe("reprice_required");
    if (revalidation.state !== "reprice_required") return;
    expect(revalidation.staleVersion).toBe(1);
    expect(revalidation.currentVersion).toBe(2);
    expect(revalidation.refreshed.priceId).toBe(PRICE_V2_ID);
    expect(revalidation.refreshed.priceVersion).toBe(2);
    expect(revalidation.refreshed.unitAmountCents).toBe(AMOUNT_V2);
    expect(revalidation.refreshed.lineTotalCents).toBe(AMOUNT_V2 * 2);

    // Hop 4: an explicit re-bind carries the new version through the same
    // real resolver instance.
    const rebound = await bindCartPrice(
      { sku: SKU, quantity: 2, authenticatedAudience: audience(LATER), currency: "USD", at: LATER },
      deps,
    );
    expect(rebound.state).toBe("bound");
    if (rebound.state !== "bound") return;
    expect(rebound.snapshot.priceId).toBe(PRICE_V2_ID);
    expect(rebound.snapshot.priceVersion).toBe(2);
    expect(rebound.snapshot.unitAmountCents).toBe(AMOUNT_V2);

    // Hop 5: checkout with the STALE presented numbers is rejected, typed,
    // never silently recharged at either the old or the new amount.
    const staleRecompute = await recomputeCheckout(
      {
        serverLines: [{ sku: SKU, quantity: 2 }],
        presented: {
          lines: [
            {
              sku: SKU,
              quantity: 2,
              unitAmountCents: bound.snapshot.unitAmountCents,
              lineTotalCents: bound.snapshot.lineTotalCents,
              priceVersion: bound.snapshot.priceVersion,
            },
          ],
          subtotalCents: bound.snapshot.lineTotalCents,
          currency: "USD",
        },
        authenticatedAudience: audience(LATER),
        currency: "USD",
        at: LATER,
      },
      deps,
    );
    expect(staleRecompute.state).toBe("rejected");
    if (staleRecompute.state !== "rejected") return;
    expect(staleRecompute.rejections).toContainEqual({
      sku: SKU,
      reason: "stale_version",
      detail: "current_version:2",
    });
    expect(staleRecompute.rejections).toContainEqual({
      sku: SKU,
      reason: "amount_mismatch",
      detail: null,
    });

    // Hop 6: presenting the refreshed numbers quotes cleanly at version 2.
    const freshRecompute = await recomputeCheckout(
      {
        serverLines: [{ sku: SKU, quantity: 2 }],
        presented: {
          lines: [
            {
              sku: SKU,
              quantity: 2,
              unitAmountCents: revalidation.refreshed.unitAmountCents,
              lineTotalCents: revalidation.refreshed.lineTotalCents,
              priceVersion: revalidation.refreshed.priceVersion,
            },
          ],
          subtotalCents: revalidation.refreshed.lineTotalCents,
          currency: "USD",
        },
        authenticatedAudience: audience(LATER),
        currency: "USD",
        at: LATER,
      },
      deps,
    );
    expect(freshRecompute.state).toBe("quoted");
    if (freshRecompute.state !== "quoted") return;
    expect(freshRecompute.quote.lines[0].priceId).toBe(PRICE_V2_ID);
    expect(freshRecompute.quote.lines[0].priceVersion).toBe(2);
    expect(freshRecompute.quote.lines[0].unitAmountCents).toBe(AMOUNT_V2);
    expect(freshRecompute.quote.subtotalCents).toBe(AMOUNT_V2 * 2);
  });

  it("reports valid, not reprice_required, when nothing moved", async () => {
    const product = detailFixture();
    const resolver = createAuthoritativePriceResolver(mutableSource(product));
    const deps: CartPriceBindingDeps = {
      variants: lookupFrom(product),
      priceResolver: resolver,
    };
    const bound = await bindCartPrice(
      { sku: SKU, quantity: 1, authenticatedAudience: audience(AT), currency: "USD", at: AT },
      deps,
    );
    expect(bound.state).toBe("bound");
    if (bound.state !== "bound") return;
    const revalidation = await revalidateCartPriceSnapshot(
      {
        snapshot: bound.snapshot,
        authenticatedAudience: audience(LATER),
        currency: "USD",
        at: LATER,
      },
      deps,
    );
    expect(revalidation.state).toBe("valid");
  });
});
