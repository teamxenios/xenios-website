import { describe, expect, it, vi } from "vitest";
import { projectKrisItem } from "./projection";
import { krisProduct, pricedAt } from "./test-fixtures";

const AT = "2026-08-13T23:30:00.000Z";

function exact(priceCents = 14_900, quantityLimit = 20) {
  return {
    productId: "pc-product-bpc",
    variantId: "pc-variant-bpc-10mg",
    unitPriceCents: priceCents,
    currency: "USD",
    quantityLimit,
    evaluatedAt: AT,
  };
}

describe("Kris legacy-order server handoff", () => {
  const direct = krisProduct({ channel: "ruo_research" });
  const price = pricedAt(14_900);

  it("attaches an exact Product Control selection without changing the purchase matrix", () => {
    const projected = projectKrisItem(direct, price, () => exact());
    expect(projected.purchaseMode).toBe("direct_eligible");
    expect(projected.canBuyNow).toBe(true);
    expect(projected.legacyOrder).toEqual(exact());
  });

  it.each([
    ["missing", undefined],
    ["price drift", () => exact(14_901)],
    ["quantity missing", () => exact(14_900, 0)],
    ["quantity over authority band", () => exact(14_900, 51)],
  ] as const)("fails closed when the handoff is %s", (_label, resolver) => {
    const projected = projectKrisItem(direct, price, resolver);
    expect(projected.purchaseMode).toBe("direct_eligible");
    expect(projected.canBuyNow).toBe(false);
    expect(projected.legacyOrder).toBeNull();
  });

  it("never upgrades a provider row even when a resolver returns a forged selection", () => {
    const resolver = vi.fn(() => exact());
    const projected = projectKrisItem(
      krisProduct({ channel: "clinical_provider_only" }),
      price,
      resolver,
    );
    expect(projected.purchaseMode).toBe("provider_workflow");
    expect(projected.canBuyNow).toBe(false);
    expect(projected.legacyOrder).toBeNull();
    expect(resolver).not.toHaveBeenCalled();
  });

  it("projects no supplier, cost, buyer credential, or private proof field", () => {
    const serialized = JSON.stringify(projectKrisItem(direct, price, () => exact())).toLowerCase();
    for (const forbidden of [
      "supplier",
      "buycost",
      "margin",
      "customerref",
      "membertoken",
      "paymentproof",
      "storageref",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
