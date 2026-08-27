import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AssistedOrderCatalogItem,
  AssistedOrderCatalogPage,
} from "../../../../shared/research/assisted-order/contract";

const api = vi.hoisted(() => ({
  loadAssistedOrderCatalog: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, ...api };
});

import { refreshSelectionSnapshots } from "./selection-refresh";
import { addOrUpdateSelection, catalogItemKey } from "./wizard-state";

const item: AssistedOrderCatalogItem = {
  productId: "p1",
  variantId: "v1",
  productName: "Alpha Peptide",
  family: "Family",
  channel: "research",
  specification: "10 mg",
  format: "Vial",
  packBasis: "Per vial",
  minimumQuantity: 1,
  maximumQuantity: 100,
  quantityIncrement: 1,
  unitPriceCents: 2500,
  currency: "USD",
  workflowMode: "direct_order_request",
  actionLabel: "Add to order request",
  accessNotice: null,
  researchUseOnly: true,
  catalogVersion: "cat-1",
  priceVersion: "price-1",
};

const siblingVariant: AssistedOrderCatalogItem = {
  ...item,
  variantId: "v2",
  specification: "25 mg",
};

function page(items: readonly AssistedOrderCatalogItem[]): AssistedOrderCatalogPage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 24,
    families: [],
    channels: [],
    workflowModes: [],
  };
}

beforeEach(() => {
  api.loadAssistedOrderCatalog.mockReset();
});

describe("selection refresh", () => {
  it("adopts the fresh server snapshot for matching keys and keeps quantity and notes", async () => {
    const fresh = { ...item, unitPriceCents: 2700, priceVersion: "price-2", maximumQuantity: 3 };
    api.loadAssistedOrderCatalog.mockResolvedValue(page([fresh]));
    const selections = addOrUpdateSelection(new Map(), item, 5, "cold chain");
    const result = await refreshSelectionSnapshots(selections);
    const refreshed = result.selections.get(catalogItemKey(item))!;
    expect(refreshed.item.unitPriceCents).toBe(2700);
    expect(refreshed.item.priceVersion).toBe("price-2");
    // Quantity re-clamps against the FRESH constraints.
    expect(refreshed.quantity).toBe(3);
    expect(refreshed.notes).toBe("cold chain");
    expect(result.missing).toHaveLength(0);
  });

  it("removes and reports selections the live catalog no longer resolves", async () => {
    api.loadAssistedOrderCatalog.mockResolvedValue(page([]));
    const selections = addOrUpdateSelection(new Map(), item, 2);
    const result = await refreshSelectionSnapshots(selections);
    expect(result.selections.size).toBe(0);
    expect(result.missing).toEqual(["Alpha Peptide"]);
  });

  it("removes and reports a selection that became held or Care-only", async () => {
    for (const workflowMode of ["availability_review", "provider_request"] as const) {
      api.loadAssistedOrderCatalog.mockResolvedValueOnce(
        page([{ ...item, workflowMode }]),
      );
      const selections = addOrUpdateSelection(new Map(), item, 2);
      const result = await refreshSelectionSnapshots(selections);
      expect(result.selections.size).toBe(0);
      expect(result.missing).toEqual(["Alpha Peptide"]);
    }
  });

  it("fetches once per product name, not once per variant", async () => {
    api.loadAssistedOrderCatalog.mockResolvedValue(page([item, siblingVariant]));
    let selections = addOrUpdateSelection(new Map(), item, 1);
    selections = addOrUpdateSelection(selections, siblingVariant, 2);
    const result = await refreshSelectionSnapshots(selections);
    expect(api.loadAssistedOrderCatalog).toHaveBeenCalledTimes(1);
    expect(result.selections.size).toBe(2);
  });
});
