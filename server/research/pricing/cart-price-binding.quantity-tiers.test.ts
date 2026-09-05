import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AdminProductDetail, AdminProductPrice } from "@shared/research/product-admin";
import type { PriceQuantityTier } from "@shared/research/price-quantity-tiers";
import { authorizeAudienceFromServerIdentity, createAuthoritativePriceResolver } from "./authoritative-price-resolver";
import { bindCartPrice, revalidateCartPriceSnapshot } from "./cart-price-binding";
import { recomputeCheckout } from "./checkout-recompute";
import { snapshotOrderLinesFromQuote } from "./order-price-snapshot";

const AT = "2026-09-05T12:00:00.000Z";
const AUTH = authorizeAudienceFromServerIdentity({ audience: "retail", sourceVersion: "synthetic-session", evaluatedAt: AT })!;
const SKU = "SYNTHETIC-QUANTITY-UNIT";
const TIERS: readonly PriceQuantityTier[] = [
  { minimumQuantity: 1, amountCents: 12900 },
  { minimumQuantity: 5, amountCents: 12300 },
  { minimumQuantity: 10, amountCents: 11700 },
];

function setup(tiers = TIERS) {
  // Synthetic approved records only. Source targets are not approved by a test.
  const product: AdminProductDetail = {
    id: "product-test", productCode: "TEST", slug: "test", displayName: "Synthetic unit", canonicalName: "Synthetic unit",
    aliases: [], lane: "research_material", category: "Research", classification: "Research material", status: "published",
    active: true, visibility: "public", availability: "in_stock", commerceApproval: "approved", qualityDocumentState: "approved",
    variantCount: 1, approvedVariantCount: 1, missingInputCount: 0, updatedAt: AT, publishedAt: AT,
    content: { shortDescription: null, longDescription: null, overview: null, specifications: null, researchInformation: null,
      storageInformation: null, handlingInformation: null, shippingInformation: null, returnInformation: null,
      disclaimers: null, citations: [], reviewDate: null },
    variants: [{ id: "variant-test", productId: "product-test", sku: SKU, catalogNumber: null, label: "Single vial",
      strength: "1 mg", size: "1 mg", format: "vial", presentation: "Single vial", shippingClass: "standard", memberEligible: true,
      status: "approved", active: true, sortOrder: 0, createdAt: AT, updatedAt: AT }],
    prices: [{ id: "price-test", productId: "product-test", variantId: "variant-test", audience: "retail",
      amountCents: tiers[0].amountCents, quantityTiers: tiers, currency: "USD", effectiveAt: "2026-09-01T00:00:00Z",
      expiresAt: null, status: "active", approvalNote: "INTERNAL_REVIEW_SENTINEL", version: 2,
      createdBy: "INTERNAL_ACTOR_SENTINEL", approvedBy: "synthetic-reviewer", createdAt: AT, updatedAt: AT }],
    media: [], history: [],
  };
  const priceResolver = createAuthoritativePriceResolver({ readProductForPricing: async () => product });
  const deps = { priceResolver, variants: { findVariantBySku: async (sku: string) => sku === SKU
    ? { productId: product.id, variantId: product.variants[0].id, sku: SKU, displayName: product.displayName } : null } };
  const input = { sku: SKU, currency: "USD", at: AT, authenticatedAudience: AUTH };
  return { product, deps, input };
}

describe("canonical quantity prices through cart and checkout", () => {
  it("reproduces all 117 available target cents through real authority, binding and checkout", async () => {
    const source = JSON.parse(readFileSync("config/research/revenue-launch/seth-source-reconciliation-20260905.json", "utf8")) as {
      phaseA: Array<{ tiers: PriceQuantityTier[] }>;
    };
    expect(source.phaseA).toHaveLength(39);
    let assertions = 0;
    for (const row of source.phaseA) {
      const { deps, input } = setup(row.tiers);
      for (const tier of row.tiers) {
        const quantity = tier.minimumQuantity;
        const bound = await bindCartPrice({ ...input, quantity }, deps);
        expect(bound.state).toBe("bound");
        if (bound.state !== "bound") throw new Error("Synthetic canonical fixture was refused");
        expect(bound.snapshot.unitAmountCents).toBe(tier.amountCents);
        expect(bound.snapshot.lineTotalCents).toBe(tier.amountCents * quantity);
        const checkout = await recomputeCheckout({ ...input, serverLines: [{ sku: SKU, quantity }],
          presented: { currency: "USD", subtotalCents: tier.amountCents * quantity,
            lines: [{ sku: SKU, quantity, unitAmountCents: tier.amountCents,
              lineTotalCents: tier.amountCents * quantity, priceVersion: 2 }] } }, deps);
        expect(checkout.state).toBe("quoted");
        if (checkout.state !== "quoted") throw new Error("Synthetic checkout failed");
        expect(checkout.quote.lines[0]).toEqual(bound.snapshot);
        const order = snapshotOrderLinesFromQuote(checkout.quote);
        expect(order.state).toBe("complete");
        if (order.state !== "complete") throw new Error("Order snapshot refused accepted quote");
        expect(order.lines[0].unitAmountCents).toBe(tier.amountCents);
        expect(order.lines[0].lineTotalCents).toBe(tier.amountCents * quantity);
        expect(Object.isFrozen(order.lines[0])).toBe(true);
        expect(JSON.stringify(checkout)).not.toContain("INTERNAL_");
        assertions++;
      }
    }
    expect(assertions).toBe(117);
  });

  it("reprices a changed quantity and refuses a client-chosen lower tier", async () => {
    const { deps, input } = setup();
    const bound = await bindCartPrice({ ...input, quantity: 5 }, deps);
    if (bound.state !== "bound") throw new Error("Expected bound fixture");
    const altered = { ...bound.snapshot, quantity: 4, lineTotalCents: 12300 * 4 };
    const result = await revalidateCartPriceSnapshot({ ...input, snapshot: altered }, deps);
    expect(result.state).toBe("reprice_required");
    if (result.state === "reprice_required") expect(result.refreshed.unitAmountCents).toBe(12900);
    const checkout = await recomputeCheckout({ ...input, serverLines: [{ sku: SKU, quantity: 1 }],
      presented: { currency: "USD", subtotalCents: 11700,
        lines: [{ sku: SKU, quantity: 1, unitAmountCents: 11700, lineTotalCents: 11700, priceVersion: 2 }] } }, deps);
    expect(checkout.state).toBe("rejected");
  });

  it.each(["draft", "approved", "expired", "superseded"] as const)("does not use a %s version at quantity ten", async status => {
    const { product, deps, input } = setup();
    product.prices[0].status = status;
    expect((await bindCartPrice({ ...input, quantity: 10 }, deps)).state).toBe("rejected");
  });

  it("keeps audience, malformed-tier, future and expiry gates authoritative", async () => {
    for (const change of [
      { audience: "wholesale" }, { effectiveAt: "2027-01-01T00:00:00Z" }, { expiresAt: AT },
      { approvedBy: null }, { quantityTiers: null },
      { quantityTiers: [TIERS[0], { minimumQuantity: 5, amountCents: 13000 }] },
    ]) {
      const { product, deps, input } = setup();
      Object.assign(product.prices[0], change as Partial<AdminProductPrice>);
      expect((await bindCartPrice({ ...input, quantity: 10 }, deps)).state).toBe("rejected");
    }
  });
});
