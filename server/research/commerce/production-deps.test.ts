import { describe, expect, it } from "vitest";
import { buildCommerceDependencies } from "./production-deps";

// ---------------------------------------------------------------------------
// End-to-end proof of the wired commerce dependencies (integration lane).
//
// The commerce router is registered in server/index.ts with these production
// deps. This suite proves what boots at runtime, not just that it compiles:
//   1. The catalog read path serves the REAL product list.
//   2. No unconfirmed supplier fact reaches a member as fact (price is null,
//      never a guessed number or zero).
//   3. Nothing is purchasable, because commerce is disabled and no SKU passes
//      the eligibility gate. This is the load-bearing safety property.
//   4. Every stateful surface fails closed with commerce_disabled.
// ---------------------------------------------------------------------------

describe("production commerce dependencies", () => {
  const deps = buildCommerceDependencies(() => new Date("2026-07-21T00:00:00Z"));

  it("serves the complete supplier-independent 49-profile V3 catalog", () => {
    const products = deps.catalog.listProducts();
    expect(products).toHaveLength(49);
    const skus = products.map((p) => p.sku);
    expect(skus).toContain("XN-RETA-GLP-3");
    expect(skus).toContain("XN-BACTERIOSTATIC-WATER-USP-GRADE");
    expect(skus.some((sku) => /^P\d{3}$/.test(sku))).toBe(false);
  });

  it("shows no unconfirmed supplier fact as fact: every price is null, never zero or a guess", () => {
    for (const product of deps.catalog.listProducts()) {
      // V3 preview values are structurally not_confirmed and never
      // member-displayable, so no guessed number can reach this payload.
      expect(product.priceCents).toBeNull();
    }
  });

  it("sells nothing: no product is purchasable while commerce is disabled", () => {
    const purchasable = deps.catalog.listProducts().filter((p) => p.purchasable);
    expect(purchasable).toEqual([]);
  });

  it("a product detail carries confirmed facts only and no claims text", () => {
    const first = deps.catalog.listProducts()[0];
    const detail = deps.catalog.getProduct(first.slug);
    expect(detail).not.toBeNull();
    expect(detail!.purchasable).toBe(false);
    expect(detail!.priceCents).toBeNull();
    // The member detail never carries claims text.
    expect(detail!.prohibitedClaims).toEqual([]);
  });

  it("returns a valid goal list (empty until the content lane's goal mappings are loaded)", () => {
    // Honest state: the V3 source does not authorize goal mappings yet.
    const goals = deps.catalog.listGoals();
    expect(Array.isArray(goals)).toBe(true);
  });

  it("reports commerce capabilities as disabled to a member", () => {
    const caps = deps.capabilities.memberVisible();
    expect(caps.product_commerce.enabled).toBe(false);
    expect(caps.quantum_commerce.enabled).toBe(false);
  });

  it("fails every stateful surface closed with commerce_disabled", async () => {
    const asOf = new Date("2026-07-21T00:00:00Z");
    expect(await deps.cart.addLine("mem_1", { sku: "P001", quantity: 1, purchaseMode: "one_time" }, asOf)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
    expect(await deps.checkout.submit("mem_1", { shippingAddressId: "x" } as never, asOf)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
    expect(await deps.subscriptions.apply("mem_1", "sub_1", { action: "pause" } as never, asOf)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
    expect(await deps.claims.submitClaim("mem_1", {} as never, asOf)).toEqual({ ok: false, code: "commerce_disabled" });
    // Reads return empty, never another member's data.
    expect(await deps.orders.listForMember("mem_1")).toEqual([]);
    expect(await deps.partners.findByMemberId("mem_1")).toBeNull();
  });
});
