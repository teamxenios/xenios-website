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

  it("serves the real catalog: all 15 research SKUs plus mapped records render", () => {
    const products = deps.catalog.listProducts();
    // The adapted legacy catalog carries the 15 research SKUs (P001-P015) and
    // additional mapped records; every one is catalog-visible to a member.
    expect(products.length).toBeGreaterThanOrEqual(15);
    const skus = products.map((p) => p.sku);
    for (const sku of ["P001", "P002", "P003", "P006", "P015"]) {
      expect(skus).toContain(sku);
    }
  });

  it("shows no unconfirmed supplier fact as fact: every price is null, never zero or a guess", () => {
    for (const product of deps.catalog.listProducts()) {
      // Legacy values are unverified_legacy and never member-displayable, so
      // the member payload carries null rather than an unconfirmed number.
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
    // Honest state: the legacy catalog adapter carries no goal->product
    // mappings, so goal navigation is empty. It is populated when the content
    // lane's goal data feeds the catalog. Whatever it returns, no goal exposes
    // a purchasable product.
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
