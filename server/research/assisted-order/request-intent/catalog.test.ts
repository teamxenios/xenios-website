import { describe, expect, it } from "vitest";
import type { NormalizedMasterOffering } from "../../master-offerings/model";
import type { AssistedOrderMasterCatalogInput } from "../production-catalog";
import type { AssistedOrderViewer } from "../ports";
import { createRequestIntentCatalog } from "./catalog";

const viewer = { actorType: "member", memberId: "synthetic", normalizedEmail: null,
  earlyAccessSessionHash: null, capabilities: new Set(["assisted_orders:submit"]) } as AssistedOrderViewer;
function offering(id: number, clinical = false): NormalizedMasterOffering {
  return {
    id: "off-" + id, slug: "synthetic-" + id, canonicalKey: "synthetic-" + id,
    displayName: "Synthetic " + id, canonicalName: "Synthetic " + id,
    family: clinical ? "clinical_formulations_503a" : "research_peptides_materials",
    category: "Synthetic", subcategory: null, brand: null, aliases: [],
    displayState: clinical ? "care_pathway" : "request_access", stateExplanation: "", copyState: "approved", visibility: "member",
    variants: [{ id: "var-" + id, label: "Synthetic exact variant", displayState: clinical ? "care_pathway" : "request_access", visibility: "member", sourceReferences: [] }],
    sourceReferences: [],
  };
}
function wiring(rows: NormalizedMasterOffering[]): AssistedOrderMasterCatalogInput {
  return {
    serviceFor: () => ({
      async select(query) {
        const page = query.page ?? 1, pageSize = Math.min(query.pageSize ?? 24, 100);
        return { offerings: rows.slice((page - 1) * pageSize, page * pageSize),
          prices: new Map(), page: { page, pageSize, total: rows.length } };
      },
    }),
    bindingFor: (variantId) => ({ productId: "product-" + variantId, variantId: "pc-" + variantId }),
    offeringVariantFor: () => null, catalogVersion: "synthetic-v1",
  };
}
describe("mixed request canonical projection", () => {
  it("keeps clinical and nonclinical rows, exact quantities and source identity past the first page", async () => {
    const rows = Array.from({ length: 105 }, (_, index) => offering(index, index === 104));
    const catalog = createRequestIntentCatalog(wiring(rows));
    const page = await catalog.list(viewer, { page: 5, pageSize: 24 });
    expect(page.total).toBe(105);
    expect(page.items).toHaveLength(9);
    const [clinical, wrong] = await catalog.resolveMany(viewer, [
      { productId: "product-var-104", variantId: "pc-var-104" },
      { productId: "wrong-product", variantId: "pc-var-104" },
    ]);
    expect(clinical).toMatchObject({ selectableForReview: true, clinicalReviewRequired: true,
      researchUseOnly: false, unitPriceCents: null, workflowMode: "provider_request", maximumQuantity: 100,
      sourceSelection: { variantId: "var-104" } });
    expect(wrong).toBeNull();
  });
  it("keeps held classification and Coming soon distinct without hiding rows", async () => {
    const held = offering(1), future = offering(2);
    held.displayState = "temporarily_unavailable";
    future.displayState = "coming_soon";
    const page = await createRequestIntentCatalog(wiring([held, future])).list(viewer, {});
    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({ workflowMode: "availability_review", selectableForReview: true,
      sourceDisplayState: "temporarily_unavailable" });
    expect(page.items[1]).toMatchObject({ selectableForReview: false, intentExclusion: "coming_soon" });
  });
  it("lists a coming-soon row and a supply or service row as selectable only once the request store accepts their lines", async () => {
    const future = offering(2), supply = offering(3);
    future.displayState = "coming_soon";
    supply.family = "shipping_and_fulfillment";
    const closed = await createRequestIntentCatalog(wiring([offering(1), future, supply])).list(viewer, {});
    expect(closed.items.map((item) => [item.selectableForReview, item.intentExclusion])).toEqual([
      [true, null], [false, "coming_soon"], [false, "non_merchandise"],
    ]);
    const open = await createRequestIntentCatalog({ ...wiring([offering(1), future, supply]), allListedInquirable: true }).list(viewer, {});
    // The reason stays on the row for staff; it no longer excludes the row.
    expect(open.items.map((item) => [item.selectableForReview, item.intentExclusion])).toEqual([
      [true, null], [true, "coming_soon"], [true, "non_merchandise"],
    ]);
    expect(open.items[2]).toMatchObject({ sourceRefusal: "non_merchandise_family", actionLabel: "Supply or service inquiry" });
    // An inquiry never carries a price for either kind of row.
    expect(open.items.slice(1).every((item) => item.unitPriceCents === null)).toBe(true);
  });
  it("fails closed when the catalog cannot be fully enumerated, rather than reporting partial coverage", async () => {
    const input = wiring([offering(1)]);
    const catalog = createRequestIntentCatalog({ ...input, serviceFor: () => ({
      select: async (query) => ({ offerings: [], prices: new Map(), page: { page: query.page ?? 1, pageSize: 100, total: 105 } }),
    }) });
    await expect(catalog.list(viewer, {})).rejects.toThrow("request_intent_catalog_incomplete");
  });
});

describe("sorting the whole request catalog by name", () => {
  // Thirty rows, inserted in descending id order, so catalog order is not name order.
  const rows = Array.from({ length: 30 }, (_, index) => offering(29 - index));
  const names = async (query: Parameters<ReturnType<typeof createRequestIntentCatalog>["list"]>[1]) => {
    const catalog = createRequestIntentCatalog(wiring(rows));
    const first = await catalog.list(viewer, { ...query, page: 1, pageSize: 24 });
    const second = await catalog.list(viewer, { ...query, page: 2, pageSize: 24 });
    expect(first.total).toBe(30);
    return [...first.items, ...second.items].map((item) => item.productName);
  };
  const ascending = Array.from({ length: 30 }, (_, index) => "Synthetic " + index);

  it("keeps catalog order when no sort is asked for", async () => {
    expect(await names({})).toEqual([...ascending].reverse());
  });
  it("sorts A to Z across pages, reading a number in a name as a number, with every row exactly once", async () => {
    const sorted = await names({ sort: "name_asc" });
    // "Synthetic 2" comes before "Synthetic 10", and page 2 continues page 1.
    expect(sorted).toEqual(ascending);
    expect(new Set(sorted).size).toBe(30);
  });
  it("sorts Z to A across pages", async () => {
    expect(await names({ sort: "name_desc" })).toEqual([...ascending].reverse());
  });
  it("sorts within a search, not just within a page", async () => {
    const catalog = createRequestIntentCatalog(wiring(rows));
    const page = await catalog.list(viewer, { search: "synthetic 1", sort: "name_asc", pageSize: 24 });
    expect(page.items.map((item) => item.productName)).toEqual(
      ["Synthetic 1", ...Array.from({ length: 10 }, (_, index) => "Synthetic " + (10 + index))]);
  });
  it("gives rows with the same name a fixed order, so paging cannot repeat or skip one", async () => {
    const twins = [offering(3), offering(1), offering(2)].map((row) => ({ ...row, displayName: "Same name", canonicalName: "Same name" }));
    const catalog = createRequestIntentCatalog(wiring(twins));
    const once = (await catalog.list(viewer, { sort: "name_asc" })).items.map((item) => item.variantId);
    const again = (await catalog.list(viewer, { sort: "name_asc" })).items.map((item) => item.variantId);
    expect(once).toEqual(again);
    expect(new Set(once).size).toBe(3);
  });
  it("refuses a sort it does not know", async () => {
    const catalog = createRequestIntentCatalog(wiring(rows));
    await expect(catalog.list(viewer, { sort: "best_sellers" as never })).rejects.toThrow("request_intent_sort_invalid");
  });
});
