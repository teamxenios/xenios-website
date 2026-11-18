// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestIntentCatalogItem, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import type { EarlyAccessCatalogCategory } from "../../../../shared/research/assisted-order/catalog-category";
import type { RequestIntentApi } from "./request-intent-api";
import { RequestIntentForm } from "./RequestIntentForm";
vi.mock("./assisted-order.css", () => ({ default: {} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A category link reaches the form as a prop the route read once. These cover what the form
// does with it: pre-set the view, select nothing, let the customer leave the view, and give way
// to a product link. The route's own capture is covered in EarlyAccessRoute.storefront.test.tsx.
function item(id: string, family: string): RequestIntentCatalogItem {
  return {
    productId: id, variantId: id + "-variant", productName: "Synthetic " + id, family,
    channel: "synthetic", specification: "Synthetic variant", format: null, packBasis: null, minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1,
    unitPriceCents: null, currency: "USD", workflowMode: "request_pricing",
    actionLabel: "Add to quote cart", accessNotice: null, researchUseOnly: false, catalogVersion: "synthetic", priceVersion: null,
    sourceSelection: { family: "synthetic", slug: id, variantId: id + "-source" },
    selectableForReview: true, intentExclusion: null, clinicalReviewRequired: false,
    sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null,
  };
}
function makeApi() {
  return {
    config: vi.fn(async () => ({ legal: [], form: [] })),
    catalog: vi.fn(async () => ({ items: [item("synthetic", "supplements")], total: 1, page: 1, pageSize: 24,
      families: ["supplements", "clinical_formulations_503a", "research_peptides_materials", "topicals_regenerative"],
      channels: [], workflowModes: [] })),
    submit: vi.fn(async () => null),
    recover: vi.fn(async () => null),
    staff: vi.fn(),
    staffQueue: vi.fn(async (): Promise<RequestIntentQueuePage> => ({ items: [], total: 0, page: 1, pageSize: 25 })),
  } satisfies RequestIntentApi;
}

let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); });
const familySelect = () => [...host.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Product family"))
  ?.querySelector("select") ?? null;
const topicalView = () => host.querySelector('[data-testid="catalog-topical-view"]');
async function renderWith(api: ReturnType<typeof makeApi>, entryCategory: EarlyAccessCatalogCategory | null,
  entryIntent: Parameters<typeof RequestIntentForm>[0]["entryIntent"] = null) {
  await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded
    entryCategory={entryCategory} entryIntent={entryIntent} />));
}

describe("category links into the catalog", () => {
  it.each([
    ["clinical", { family: "clinical_formulations_503a", presentation: undefined }, "clinical_formulations_503a"],
    ["research_peptides", { family: "research_peptides_materials", presentation: undefined }, "research_peptides_materials"],
    ["supplements", { family: "supplements", presentation: undefined }, "supplements"],
    ["topicals", { family: undefined, presentation: "topicals" }, ""],
  ] as const)("opens ?category=%s as its view, with nothing selected", async (category, query, selectValue) => {
    const api = makeApi();
    await renderWith(api, category);
    expect(api.catalog).toHaveBeenCalledWith(expect.objectContaining({ ...query, page: 1 }));
    expect(familySelect()?.value).toBe(selectValue);
    expect(Boolean(topicalView())).toBe(category === "topicals");
    expect(api.submit).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Selection from your link");
    expect([...host.querySelectorAll("button")].some((button) => button.textContent?.startsWith("Remove "))).toBe(false);
  });
  it("opens the ordinary catalog when there is no category", async () => {
    const api = makeApi();
    await renderWith(api, null);
    expect(api.catalog).toHaveBeenCalledWith(expect.objectContaining({ family: undefined, presentation: undefined, page: 1 }));
    expect(familySelect()?.value).toBe("");
    expect(topicalView()).toBeNull();
  });
  it("lets the customer clear a linked family", async () => {
    const api = makeApi();
    await renderWith(api, "supplements");
    const select = familySelect()!;
    await act(async () => { select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ family: undefined, presentation: undefined, page: 1 }));
  });
  it("lets the customer leave the topical view, and narrows it by family until then", async () => {
    const api = makeApi();
    await renderWith(api, "topicals");
    const select = familySelect()!;
    await act(async () => { select.value = "clinical_formulations_503a"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ family: "clinical_formulations_503a", presentation: "topicals", page: 1 }));
    const showAll = [...host.querySelectorAll("button")].find((button) => button.textContent === "Show all products")!;
    await act(async () => showAll.click());
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ family: "clinical_formulations_503a", presentation: undefined, page: 1 }));
    expect(topicalView()).toBeNull();
  });
  it("gives way to a product link, which keeps its own lookup and its own notice", async () => {
    const api = makeApi();
    await renderWith(api, "supplements", { family: "research_peptides_materials", slug: "synthetic", variantId: "synthetic-source", quantity: 1, action: "REQUEST_QUOTE" });
    expect(api.catalog).toHaveBeenCalledWith(expect.objectContaining({ family: undefined, presentation: undefined, page: 1, pageSize: 24 }));
    expect(familySelect()?.value).toBe("");
    expect(topicalView()).toBeNull();
    expect(host.textContent).toContain("Selection from your link");
  });
});
