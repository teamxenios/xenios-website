import { describe, expect, it } from "vitest";
import {
  v3CatalogProfiles,
  v3PreviewMemberCatalog,
  v3PreviewMemberDetail,
  v3PreviewProducts,
} from "../catalog/v3-preview-catalog";
import { buildCommerceDependencies } from "./production-deps";

// ---------------------------------------------------------------------------
// End-to-end proof of the wired commerce dependencies (integration lane).
//
// The commerce router is registered in server/index.ts with these production
// deps. This suite proves what boots at runtime, not just that it compiles:
//   1. The legacy SKU catalog is empty until canonical Product Control
//      product + variant + SKU authority exists.
//   2. All 49 supplier-independent profiles remain available through the
//      non-transactional discovery/member preview projections.
//   3. No unconfirmed supplier fact reaches a member as fact.
//   4. Every stateful surface fails closed with commerce_disabled.
// ---------------------------------------------------------------------------

describe("production commerce dependencies", () => {
  const deps = buildCommerceDependencies(() => new Date("2026-07-21T00:00:00Z"));

  it("keeps legacy SKU compatibility empty while preserving all 49 truthful previews", () => {
    expect(deps.catalog.listProducts()).toEqual([]);
    expect(v3PreviewProducts).toHaveLength(49);
    expect(
      v3PreviewMemberCatalog("2026-07-21T00:00:00.000Z").items,
    ).toHaveLength(49);
  });

  it("shows no invented SKU or price through either compatibility or preview paths", () => {
    const memberCatalog = v3PreviewMemberCatalog(
      "2026-07-21T00:00:00.000Z",
    );
    expect(deps.catalog.listProducts()).toEqual([]);
    expect(memberCatalog.items.every((product) => product.price === null)).toBe(
      true,
    );
    expect(JSON.stringify(memberCatalog)).not.toMatch(/"sku"\s*:/i);
  });

  it("sells nothing: no product is purchasable while commerce is disabled", () => {
    const purchasable = deps.catalog.listProducts().filter((p) => p.purchasable);
    expect(purchasable).toEqual([]);
  });

  it("denies legacy detail authority while retaining a non-transactional preview", () => {
    const first = v3CatalogProfiles[0];
    expect(deps.catalog.getProduct(first.slug)).toBeNull();
    const detail = v3PreviewMemberDetail(
      first.slug,
      "2026-07-21T00:00:00.000Z",
    );
    expect(detail).not.toBeNull();
    expect(detail!.price).toBeNull();
    expect(detail!.variants).toEqual([]);
    expect(detail!.selection).toBeNull();
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
