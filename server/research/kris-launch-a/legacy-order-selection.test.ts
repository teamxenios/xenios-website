import { describe, expect, it, vi } from "vitest";
import { projectKrisItem } from "./projection";
import { krisProduct, pricedAt } from "./test-fixtures";

const AT = "2026-08-13T23:30:00.000Z";

function exact(priceCents = 2_464, quantityLimit = 50) {
  return {
    productId: "PEX-012",
    variantId: "R360-AOD9604-5MG-VIAL",
    unitPriceCents: priceCents,
    currency: "USD",
    quantityLimit,
    evaluatedAt: AT,
  };
}

describe("Kris legacy-order server handoff", () => {
  const direct = krisProduct({ channel: "ruo_research" });
  const price = pricedAt(2_464);

  it("attaches an exact Product Control selection without changing the purchase matrix", () => {
    const projected = projectKrisItem(direct, price, () => exact());
    expect(projected.purchaseMode).toBe("direct_eligible");
    expect(projected.canBuyNow).toBe(true);
    expect(projected.legacyOrder).toEqual(exact());
  });

  it.each([
    ["missing", undefined],
    ["price drift", () => exact(2_465)],
    ["quantity missing", () => exact(2_464, 0)],
    ["quantity over authority band", () => exact(2_464, 51)],
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
