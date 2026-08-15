import { describe, expect, it } from "vitest";
import type { AssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/contract";
import {
  addOrUpdateSelection,
  money,
  removeSelection,
  selectionEstimateCents,
  selectionsToLines,
} from "./wizard-state";

const item: AssistedOrderCatalogItem = {
  productId: "p1",
  variantId: "v1",
  productName: "Product",
  family: "Family",
  channel: "RUO",
  specification: "10 mg",
  format: "Vial",
  packBasis: "Per vial",
  minimumQuantity: 1,
  maximumQuantity: 100,
  quantityIncrement: 1,
  unitPriceCents: 2500,
  currency: "USD",
  workflowMode: "direct_order_request",
  actionLabel: "Add",
  accessNotice: null,
  researchUseOnly: true,
  catalogVersion: "c1",
  priceVersion: "p1",
};

describe("assisted order wizard state", () => {
  it("adds, updates and removes selections", () => {
    let state = addOrUpdateSelection(new Map(), item, 2);
    expect(selectionEstimateCents(state)).toBe(5000);
    state = addOrUpdateSelection(state, item, 3);
    expect(selectionEstimateCents(state)).toBe(7500);
    state = removeSelection(state, item);
    expect(state.size).toBe(0);
  });

  it("pins catalog and price versions in submission lines", () => {
    const state = addOrUpdateSelection(new Map(), item, 2);
    expect(selectionsToLines(state)[0]).toMatchObject({
      expectedCatalogVersion: "c1",
      expectedPriceVersion: "p1",
      expectedUnitPriceCents: 2500,
    });
  });

  it("renders null price as pending", () => {
    expect(money(null)).toBe("Price pending");
  });
});
