import { describe, expect, it } from "vitest";
import type { CustomerPrice, PriceResolution } from "@shared/research/pricing";
import { PRICE_RESOLUTION_FAILURE_REASONS } from "@shared/research/pricing";
import {
  projectCatalogPrice,
  projectedAmountCents,
} from "./catalog-price-projection";

const customerPrice: CustomerPrice = {
  priceId: "price-a",
  productId: "product-a",
  variantId: "variant-a",
  audience: "retail",
  amountCents: 14900,
  currency: "USD",
  effectiveAt: "2026-07-01T00:00:00+00:00",
  expiresAt: null,
  version: 2,
};

describe("catalog price projection", () => {
  it("projects an available price to exactly the card-safe fields", () => {
    const projection = projectCatalogPrice({
      state: "available",
      price: customerPrice,
    });
    expect(projection).toEqual({ state: "priced", price: customerPrice });
    expect(projection.state).toBe("priced");
    if (projection.state !== "priced") return;
    expect(Object.keys(projection.price).sort()).toEqual(
      [
        "amountCents",
        "audience",
        "currency",
        "effectiveAt",
        "expiresAt",
        "priceId",
        "productId",
        "variantId",
        "version",
      ].sort(),
    );
    expect(projectedAmountCents(projection)).toBe(14900);
  });

  it("strips any extra key a caller attached to the price", () => {
    const poisoned = {
      ...customerPrice,
      approvalNote: "internal",
      supplierCostCents: 4200,
    } as unknown as CustomerPrice;
    const projection = projectCatalogPrice({
      state: "available",
      price: poisoned,
    });
    expect(projection.state).toBe("priced");
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("approvalNote");
    expect(serialized).not.toContain("supplierCostCents");
  });

  it("maps every failure reason to not_currently_available", () => {
    for (const reason of PRICE_RESOLUTION_FAILURE_REASONS) {
      const resolution: PriceResolution =
        reason === "price_ambiguous"
          ? { state: "ambiguous", reason }
          : { state: "unavailable", reason };
      expect(projectCatalogPrice(resolution)).toEqual({
        state: "not_currently_available",
      });
      expect(projectedAmountCents(projectCatalogPrice(resolution))).toBeNull();
    }
  });

  it("makes a zero or malformed amount impossible to display", () => {
    const malformedAmounts = [
      0,
      -14900,
      149.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 2,
    ];
    for (const amountCents of malformedAmounts) {
      const projection = projectCatalogPrice({
        state: "available",
        price: { ...customerPrice, amountCents },
      });
      expect(projection).toEqual({ state: "not_currently_available" });
      expect(projectedAmountCents(projection)).toBeNull();
    }
  });

  it("rejects a structurally broken available price instead of defaulting", () => {
    const broken = [
      { ...customerPrice, priceId: " " },
      { ...customerPrice, currency: "EUR" },
      { ...customerPrice, audience: "compare_at" },
      { ...customerPrice, version: 0 },
      { ...customerPrice, effectiveAt: "" },
    ] as unknown as CustomerPrice[];
    for (const price of broken) {
      expect(projectCatalogPrice({ state: "available", price })).toEqual({
        state: "not_currently_available",
      });
    }
  });

  it("never yields an amount of zero from any projection", () => {
    const projections = [
      projectCatalogPrice({ state: "unavailable", reason: "price_missing" }),
      projectCatalogPrice({ state: "ambiguous", reason: "price_ambiguous" }),
      projectCatalogPrice({
        state: "available",
        price: { ...customerPrice, amountCents: 0 },
      }),
      projectCatalogPrice({ state: "available", price: customerPrice }),
    ];
    for (const projection of projections) {
      const amount = projectedAmountCents(projection);
      expect(amount === null || amount > 0).toBe(true);
      expect(amount).not.toBe(0);
    }
  });
});
