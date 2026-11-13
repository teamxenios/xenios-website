import { describe, expect, it } from "vitest";

import type { EarlyAccessCatalogProjection, EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import { catalogPriceFields } from "../../../../shared/research/early-access/quote-only";
import { InMemoryEarlyAccessReleaseLedger, earlyAccessReleaseVersion } from "./founder-release";
import { createEarlyAccessCatalogRoute, type EarlyAccessCatalogSource } from "./release-routes";

/**
 * Quote-only on the Early Access catalog route. With `quoteOnly` wired, a
 * released unit is served without its price and marked `pricing: "quote"`;
 * everything else about it is unchanged. Without it, the route is exactly as
 * before. The internal storefront, which the cart prices from, is untouched.
 */

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

function row(): EarlyAccessCatalogRow {
  return {
    productId: "prod-a", slug: "product-a", displayName: "Product A", canonicalName: "product-a",
    variantId: "var-1", sku: "A-1", strength: "10 mg", presentation: "vial",
    priceCents: null, currency: "", audience: "member", availability: "available",
    offerState: "APPROVAL_REQUIRED_PURCHASE", description: "", imageState: "none",
    quantityLimit: 3, supplierReady: false, disputeStatus: { identity: "none", strength: "none" },
    purchasable: false, blockers: ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"],
  } as unknown as EarlyAccessCatalogRow;
}

const source: EarlyAccessCatalogSource = {
  async load(now: Date) {
    return { evaluatedAt: now.toISOString(), rows: [row()], productsWithoutVariants: [] } as unknown as EarlyAccessCatalogProjection;
  },
};

async function released(quoteOnly: boolean | undefined) {
  const target = row();
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  await ledger.append({
    releaseId: "rel-0001", productId: target.productId, variantId: target.variantId,
    productVersion: earlyAccessReleaseVersion(target), status: "approved", approvedPriceCents: 24_900,
    currency: "USD", waivedBlockers: [...target.blockers], approvedQuantityLimit: 3, expiresAt: null,
    reason: "Founder release for the private early access pilot.",
    actor: "Synthetic Founder", recordedAt: "2026-08-04T11:00:00.000Z",
  } as any);
  const state: { status: number; body: any } = { status: 0, body: null };
  const port: any = {
    setHeader: () => {},
    status(code: number) { state.status = code; return this; },
    json(body: unknown) { state.body = body; return this; },
  };
  await createEarlyAccessCatalogRoute({
    resolveSession: async () => ({ authenticated: true, expiresAtEpochMs: NOW + 1_000 }),
    catalog: source, ledger, now: () => NOW,
    ...(quoteOnly === undefined ? {} : { quoteOnly }),
  } as any)({ cookieHeader: "x=1" }, port);
  return state;
}

describe("the Early Access catalog route, quote-only", () => {
  it("serves a released unit with no price, marked quote, when quoteOnly is wired", async () => {
    const state = await released(true);
    expect(state.status).toBe(200);
    expect(catalogPriceFields(state.body)).toEqual([]);
    expect(state.body.units).toHaveLength(1);
    expect(state.body.units[0]).toMatchObject({
      variantId: "var-1", strength: "10 mg", quantityLimit: 3,
      priceCents: null, pricing: "quote", availability: "AVAILABLE", purchasable: true,
    });
    expect(state.body.purchasableCount).toBe(1);
  });

  it("is unchanged when quoteOnly is absent or false", async () => {
    for (const value of [undefined, false]) {
      const state = await released(value);
      expect(state.body.units[0].priceCents).toBe(24_900);
      expect(state.body.units[0].pricing).toBeUndefined();
    }
  });
});
