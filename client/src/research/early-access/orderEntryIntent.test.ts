import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistedOrderCatalogItem } from "@shared/research/assisted-order/contract";
import { loadAssistedOrderCatalog } from "../assisted-order/api";
import { loadOrderEntryIntent, matchesOrderEntryIntent, orderEntryIntentFromReturnTo, orderEntryIntentFromSearch, orderEntryIntentHref, resolveOrderEntryIntent } from "./orderEntryIntent";

vi.mock("../assisted-order/api", () => ({ loadAssistedOrderCatalog: vi.fn() }));
const search = "?family=research_vials&slug=alpha&variant=mov_alpha&qty=7&intent=buy_now";
const intent = orderEntryIntentFromSearch(search)!;
const item: AssistedOrderCatalogItem = {
  productId: "pc-product", variantId: "pc-variant", productName: "Server Alpha", family: "research_vials", channel: "research",
  specification: "10 mg", format: null, packBasis: null, minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1,
  unitPriceCents: 2500, currency: "USD", workflowMode: "direct_order_request", actionLabel: "Add to order request", accessNotice: null,
  researchUseOnly: true, catalogVersion: "cat-current", priceVersion: "price-current",
  sourceSelection: { family: "research_vials", slug: "alpha", variantId: "mov_alpha" },
};

beforeEach(() => vi.mocked(loadAssistedOrderCatalog).mockReset());

describe("Order Entry selection transport", () => {
  it("keeps the exact original selection through Quick and assisted URLs and member returnTo", () => {
    expect(intent).toMatchObject({ family: "research_vials", slug: "alpha", variantId: "mov_alpha", quantity: 7, action: "BUY_NOW" });
    for (const path of ["/research/early-access", "/research/early-access/order-request"] as const) {
      expect(orderEntryIntentFromSearch(new URL(orderEntryIntentHref(path, intent), "https://example.invalid").search)).toEqual(intent);
    }
    expect(orderEntryIntentFromReturnTo("/research/member/catalog/research_vials/alpha?variant=mov_alpha&qty=7&intent=buy_now")).toEqual(intent);
    expect(orderEntryIntentHref("/research/early-access", null)).toBe("/research/early-access");
  });

  it.each([
    "", `${search}&ref=PARTNER`, `${search}&token=credential`, `${search}&qty=3`, `${search}&returnTo=/admin`,
    search.replace("qty=7", "qty=0"), search.replace("qty=7", "qty=101"), search.replace("qty=7", "qty=7.5"),
    search.replace("qty=7", "qty=07"), search.replace("alpha&", "../alpha&"), search.replace("mov_alpha", "x%40example.invalid"),
    search.replace("buy_now", "paid"), search.replace("research_vials", "unknown_family"),
    search.replace("buy_now", "toString"), search.replace("buy_now", "constructor"), search.replace("buy_now", "__proto__"),
  ])("drops malformed or expanded input: %s", (value) => expect(orderEntryIntentFromSearch(value)).toBeNull());

  it("routes Care intent only into Care", () => {
    const care = { ...intent, action: "CARE" as const };
    expect(orderEntryIntentHref("/research/early-access", care)).toBe("/care/schedule");
    expect(resolveOrderEntryIntent(care, [item])).toEqual({ kind: "care" });
  });

  it.each([1, 50, 51, 100])("preserves navigation quantity %s without widening the direct cart", (quantity) => {
    const candidate = orderEntryIntentFromSearch(search.replace("qty=7", `qty=${quantity}`));
    expect(candidate?.quantity).toBe(quantity);
    expect(orderEntryIntentFromReturnTo(`/research/member/catalog/research_vials/alpha?variant=mov_alpha&qty=${quantity}&intent=assisted_order`)?.quantity).toBe(quantity);
    expect(orderEntryIntentHref("/research/early-access", candidate)).toContain(`qty=${quantity}`);
  });

  it("resolves only the exact server source mapping, independent of Product Control IDs and names", () => {
    expect(resolveOrderEntryIntent(intent, [item])).toMatchObject({ kind: "matched", item, quantity: 7 });
    expect(matchesOrderEntryIntent({ ...item, variantId: "mov_alpha", sourceSelection: undefined }, intent)).toBe(false);
    expect(resolveOrderEntryIntent(intent, [{ ...item, sourceSelection: { ...item.sourceSelection!, slug: "other" } }])).toEqual({ kind: "missing" });
    expect(resolveOrderEntryIntent(intent, [{ ...item, sourceSelection: { ...item.sourceSelection!, family: "clinical_formulations_503a" } }])).toEqual({ kind: "missing" });
    expect(resolveOrderEntryIntent(intent, [item, item])).toEqual({ kind: "ambiguous" });
    expect(resolveOrderEntryIntent(intent, [{ ...item, family: "clinical_formulations_503a" }])).toEqual({ kind: "unavailable" });
  });

  it("never preselects Care, held, invalid quantities, or a widened browser action", () => {
    expect(resolveOrderEntryIntent(intent, [{ ...item, workflowMode: "provider_request" }])).toEqual({ kind: "care" });
    expect(resolveOrderEntryIntent(intent, [{ ...item, workflowMode: "availability_review" }])).toEqual({ kind: "unavailable" });
    expect(resolveOrderEntryIntent(intent, [{ ...item, maximumQuantity: 3 }])).toEqual({ kind: "quantity_unavailable" });
    expect(resolveOrderEntryIntent(intent, [{ ...item, minimumQuantity: 2, quantityIncrement: 2 }])).toEqual({ kind: "quantity_unavailable" });
    expect(resolveOrderEntryIntent(intent, [{ ...item, workflowMode: "request_pricing" }])).toMatchObject({ kind: "matched", item: { workflowMode: "request_pricing" } });
  });

  it("reads the complete bounded family and matches through metadata", async () => {
    vi.mocked(loadAssistedOrderCatalog).mockResolvedValue({ items: [item], total: 1, page: 1, pageSize: 100, families: [], channels: [], workflowModes: [] });
    expect(await loadOrderEntryIntent(intent)).toMatchObject({ kind: "matched" });
    expect(loadAssistedOrderCatalog).toHaveBeenCalledWith({ family: "research_vials", page: 1, pageSize: 100 }, undefined);
  });

  it("refuses truncated final pages, duplicate matches, malformed entries and changing page sizes", async () => {
    const page = { items: [item], total: 1, page: 1, pageSize: 100, families: [], channels: [], workflowModes: [] };
    vi.mocked(loadAssistedOrderCatalog).mockResolvedValue({ ...page, total: 10 });
    expect(await loadOrderEntryIntent(intent)).toEqual({ kind: "unavailable" });
    vi.mocked(loadAssistedOrderCatalog).mockResolvedValue({ ...page, items: [item, item], total: 2 });
    expect(await loadOrderEntryIntent(intent)).toEqual({ kind: "ambiguous" });
    vi.mocked(loadAssistedOrderCatalog).mockResolvedValue({ ...page, items: [null as never] });
    expect(await loadOrderEntryIntent(intent)).toEqual({ kind: "unavailable" });
    vi.mocked(loadAssistedOrderCatalog).mockResolvedValueOnce({ ...page, total: 2, pageSize: 1 })
      .mockResolvedValueOnce({ ...page, total: 2, page: 2, pageSize: 2 });
    expect(await loadOrderEntryIntent(intent)).toEqual({ kind: "unavailable" });
  });
});
