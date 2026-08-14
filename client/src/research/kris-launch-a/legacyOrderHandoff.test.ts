import { beforeEach, describe, expect, it } from "vitest";
import type { KrisCatalogItemView } from "@shared/research/kris-launch-a/contract";
import { krisFixtureItems } from "./__fixtures__/krisFixtureServer";
import {
  clearKrisLegacyOrder,
  consumeKrisLegacyOrder,
  queueKrisLegacyOrder,
} from "./legacyOrderHandoff";

describe("Kris -> legacy single-order handoff", () => {
  beforeEach(clearKrisLegacyOrder);

  it("preserves the server identity and partner price at fixed quantity one", () => {
    const item = krisFixtureItems().find((row) => row.canBuyNow);
    expect(item).toBeDefined();
    if (!item || item.price.state !== "priced") return;

    expect(queueKrisLegacyOrder(item)).toBe(true);
    expect(consumeKrisLegacyOrder()).toEqual({
      product: {
        productId: item.legacyOrder?.productId,
        variantId: item.legacyOrder?.variantId,
        name: item.displayName,
        strength: item.specification,
        unitPriceCents: item.price.amountCents,
        currency: item.price.currency,
        description: `${item.access.statusLabel}. ${item.suppliedNote}`,
        availability: "AVAILABLE",
        quantityLimit: 1,
      },
      quantity: 1,
    });
    expect(consumeKrisLegacyOrder()).toBeNull();
  });

  it.each(["provider_workflow", "classification_pending", "price_pending"] as const)(
    "refuses %s",
    (mode) => {
      const item = krisFixtureItems().find((row) => row.purchaseMode === mode);
      expect(item).toBeDefined();
      expect(queueKrisLegacyOrder(item as KrisCatalogItemView)).toBe(false);
      expect(consumeKrisLegacyOrder()).toBeNull();
    },
  );

  it("refuses a direct classification without an exact server binding", () => {
    const item = krisFixtureItems().find((row) => row.purchaseMode === "direct_eligible");
    expect(item).toBeDefined();
    if (!item) return;
    expect(
      queueKrisLegacyOrder({ ...item, legacyOrder: null, canBuyNow: false }),
    ).toBe(false);
  });
});
