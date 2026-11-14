import { describe, expect, it, vi } from "vitest";
import type { AdminProductDetail, AdminProductPrice, AdminProductVariant } from "@shared/research/product-admin";
import { createAuthoritativePriceResolver } from "../../../pricing/authoritative-price-resolver";
import { productControlQuoteLineClearance } from "./product-control-clearance";
import type { QuoteLineClearanceScope } from "./production-portal";

const AT = "2026-11-14T06:00:00.000Z";
const NOW = () => Date.parse(AT);
const PRODUCT = "0b6f1f9e-4d55-4c1e-9a43-5d6a0f0d0a01";
const VARIANT = "6c2d7c1a-9f0e-4b8e-8d7f-1c3e5a7b9d02";
const PRICE = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c05";

const scope = (o: Partial<QuoteLineClearanceScope> = {}): QuoteLineClearanceScope => Object.freeze({
  xriId: "4c6f0d8e-1a2b-4c3d-9e8f-7a6b5c4d3e21", seller: "team-xenios", lineId: "ln-abc",
  productId: PRODUCT, variantId: VARIANT, sourceVariantId: "offering-variant-1", catalogVersion: "cat-1", quantity: 3, ...o,
});

function product(o: { product?: Partial<AdminProductDetail>; variant?: Partial<AdminProductVariant>;
  prices?: Partial<AdminProductPrice>[] } = {}): AdminProductDetail {
  const variant: AdminProductVariant = {
    id: VARIANT, productId: PRODUCT, sku: "SKU-1", catalogNumber: null, label: "10 mg", strength: null, size: null,
    format: null, presentation: null, shippingClass: "standard", memberEligible: true, status: "approved", active: true,
    sortOrder: 0, createdAt: AT, updatedAt: AT, ...o.variant,
  };
  const price = (p: Partial<AdminProductPrice>): AdminProductPrice => ({
    id: PRICE, productId: PRODUCT, variantId: VARIANT, audience: "member", amountCents: 12750, currency: "USD",
    effectiveAt: "2026-08-15T00:00:00.000Z", expiresAt: null, status: "active", approvalNote: "INTERNAL_NOTE",
    version: 2, createdBy: "INTERNAL_ACTOR", approvedBy: "pricing-reviewer", createdAt: AT, updatedAt: AT, ...p,
  });
  return {
    id: PRODUCT, productCode: "P-1", slug: "p-1", displayName: "P", canonicalName: "P", aliases: [],
    lane: "research_material", category: "Research", classification: "Research material", status: "published",
    active: true, visibility: "public", availability: "in_stock", commerceApproval: "approved",
    qualityDocumentState: "approved", variantCount: 1, approvedVariantCount: 1, missingInputCount: 0,
    updatedAt: AT, publishedAt: AT,
    content: { shortDescription: null, longDescription: null, overview: null, specifications: null,
      researchInformation: null, storageInformation: null, handlingInformation: null, shippingInformation: null,
      returnInformation: null, disclaimers: null, citations: [], reviewDate: null },
    variants: [variant], prices: (o.prices ?? [{}]).map(price), media: [], history: [], ...o.product,
  } as AdminProductDetail;
}

function reader(detail: AdminProductDetail | null) {
  const read = vi.fn(async (_id: string) => detail);
  return { read, clearance: productControlQuoteLineClearance(createAuthoritativePriceResolver({ readProductForPricing: read }), NOW) };
}

describe("Product Control line clearance (candidate, unwired)", () => {
  it("clears a line at the active approved member price, echoing the exact scope", async () => {
    const { clearance, read } = reader(product());
    const s = scope();
    expect(await clearance.cleared(s)).toEqual({ ...s, approvalEvidenceId: `pc-price:${PRICE}:v2`, unitPriceCents: 12750, currency: "USD" });
    expect(read).toHaveBeenCalledWith(PRODUCT);
  });

  it("passes the portal's own evidence and echo checks", async () => {
    const s = scope();
    const out = (await reader(product()).clearance.cleared(s))!;
    expect(/^[-a-zA-Z0-9_.:]{1,180}$/.test(out.approvalEvidenceId)).toBe(true);
    for (const k of Object.keys(s) as (keyof QuoteLineClearanceScope)[]) expect(out[k]).toBe(s[k]);
  });

  it("prices the line's exact quantity tier", async () => {
    const tiers = [{ minimumQuantity: 1, amountCents: 12750 }, { minimumQuantity: 5, amountCents: 11000 }];
    const { clearance } = reader(product({ prices: [{ quantityTiers: tiers }] }));
    expect((await clearance.cleared(scope({ quantity: 4 })))?.unitPriceCents).toBe(12750);
    expect((await clearance.cleared(scope({ quantity: 5 })))?.unitPriceCents).toBe(11000);
  });

  it("changes the evidence when the price is reauthorized", async () => {
    const a = await reader(product()).clearance.cleared(scope());
    const b = await reader(product({ prices: [{ version: 3 }] })).clearance.cleared(scope());
    const c = await reader(product({ prices: [{ id: "7d1e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f06" }] })).clearance.cleared(scope());
    expect(new Set([a?.approvalEvidenceId, b?.approvalEvidenceId, c?.approvalEvidenceId]).size).toBe(3);
  });

  it("refuses every price the member catalog would refuse", async () => {
    const refused: Parameters<typeof product>[0][] = [
      { prices: [{ audience: "retail" }] },
      { prices: [{ status: "approved" }] },
      { prices: [{ status: "superseded" }] },
      { prices: [{ effectiveAt: "2026-12-01T00:00:00.000Z" }] },
      { prices: [{ expiresAt: "2026-11-14T05:59:59.000Z" }] },
      { prices: [{ approvedBy: null }] },
      { prices: [{ amountCents: 0 }] },
      { prices: [{}, { id: "7d1e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f06", version: 3 }] },
      { prices: [] },
      { variant: { memberEligible: false } },
      { variant: { status: "in_review" } },
      { variant: { active: false } },
      { product: { status: "approved" } },
      { product: { visibility: "members_only" } },
      { product: { active: false } },
    ];
    for (const o of refused) expect(await reader(product(o)).clearance.cleared(scope())).toBeNull();
    expect(await reader(null).clearance.cleared(scope())).toBeNull();
  });

  it("refuses a line whose identity is not this product's, synthetic, or without a safe quantity", async () => {
    const { clearance } = reader(product());
    expect(await clearance.cleared(scope({ variantId: "6c2d7c1a-9f0e-4b8e-8d7f-1c3e5a7b9d99" }))).toBeNull();
    expect(await clearance.cleared(scope({ productId: "unbound:offering-1", variantId: "unbound:variant-1" }))).toBeNull();
    for (const quantity of [0, -1, 1.5, Number.NaN]) expect(await clearance.cleared(scope({ quantity }))).toBeNull();
  });

  it("refuses an answer about a different line even if the resolver gives one", async () => {
    const answer = (p: Record<string, unknown>) => productControlQuoteLineClearance({
      resolveApprovedResearchPrice: async () => ({ state: "available", price: {
        priceId: PRICE, productId: PRODUCT, variantId: VARIANT, audience: "member", amountCents: 12750,
        currency: "USD", effectiveAt: AT, expiresAt: null, version: 2, ...p } as never }),
    }, NOW).cleared(scope());
    expect(await answer({})).not.toBeNull();
    for (const p of [{ variantId: "other" }, { productId: "other" }, { audience: "retail" }, { currency: "EUR" },
      { version: 0 }, { priceId: "bad id with spaces" }]) expect(await answer(p)).toBeNull();
  });

  it("propagates a Product Control read failure instead of answering", async () => {
    const clearance = productControlQuoteLineClearance(createAuthoritativePriceResolver({
      readProductForPricing: async () => { throw new Error("product control unavailable"); },
    }), NOW);
    await expect(clearance.cleared(scope())).rejects.toThrow("product control unavailable");
  });

  it("never exposes internal approval fields", async () => {
    const out = await reader(product()).clearance.cleared(scope());
    expect(JSON.stringify(out)).not.toMatch(/INTERNAL_|pricing-reviewer/);
  });
});
