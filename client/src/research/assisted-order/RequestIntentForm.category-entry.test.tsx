// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestIntentCatalogItem, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import type { EarlyAccessCatalogCategory } from "../../../../shared/research/assisted-order/catalog-category";
import type { RequestIntentApi } from "./request-intent-api";
import { RequestIntentForm } from "./RequestIntentForm";
import {CatalogAdmissionStandingContext} from "../early-access/PreCatalogContact";
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
  it("a saved referral changes no category view, selection, admission or guide answer",async()=>{
    const api=makeApi();
    await act(async()=>root.render(<CatalogAdmissionStandingContext.Provider value={{admitted:true,policyRevision:"a".repeat(64),referralEnabled:true,
      referralRevision:"10000000-0000-4000-8000-000000000003"}}><RequestIntentForm api={api} storage={sessionStorage} embedded entryCategory="supplements"/></CatalogAdmissionStandingContext.Provider>));
    expect(api.catalog).toHaveBeenCalledWith(expect.objectContaining({family:"supplements",page:1}));
    expect(familySelect()?.value).toBe("supplements");
    expect(api.submit).not.toHaveBeenCalled();expect(sessionStorage.length).toBe(0);
  });
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

describe("the optional catalog guide inside the form", () => {
  // The guide mounts only on the Early Access entry path, like the existing request guide.
  beforeEach(() => { window.history.replaceState(null, "", "/earlyaccess"); });
  afterEach(() => { window.history.replaceState(null, "", "/"); });
  const guide = () => host.querySelector('[data-testid="catalog-guide"]');
  const buttonNamed = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text)!;
  const choose = async (label: string) => {
    const input = [...host.querySelectorAll("label")].find((l) => l.textContent === label)!.querySelector("input")!;
    await act(async () => input.click());
  };

  it("applies a chosen view through the ordinary catalog read, and selects nothing", async () => {
    const api = makeApi();
    await renderWith(api, null);
    expect(guide()).not.toBeNull();
    await act(async () => buttonNamed("Start the guide").click());
    await choose("Skincare and topicals");
    await act(async () => buttonNamed("Show starting points").click());
    await act(async () => buttonNamed("View category").click());
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ family: undefined, presentation: "topicals", page: 1 }));
    expect(topicalView()).not.toBeNull();
    expect(api.submit).not.toHaveBeenCalled();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Remove "))).toBe(false);
    await act(async () => buttonNamed("Show all products").click());
    expect(topicalView()).toBeNull();
  });

  it("browsing the full catalog clears a linked category view", async () => {
    const api = makeApi();
    await renderWith(api, "supplements");
    await act(async () => buttonNamed("Start the guide").click());
    await act(async () => buttonNamed("Browse the full catalog").click());
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ family: undefined, presentation: undefined, page: 1 }));
    expect(familySelect()?.value).toBe("");
  });

  it("is absent when a product link is active, so the link keeps precedence", async () => {
    const api = makeApi();
    await renderWith(api, null, { family: "research_peptides_materials", slug: "synthetic", variantId: "synthetic-source", quantity: 1, action: "REQUEST_QUOTE" });
    expect(host.textContent).toContain("Selection from your link");
    expect(guide()).toBeNull();
  });

  it("leaves the address and browser storage as they were", async () => {
    const api = makeApi();
    await renderWith(api, null);
    const before = { href: window.location.href, session: sessionStorage.length, local: localStorage.length };
    await act(async () => buttonNamed("Start the guide").click());
    await choose("Laboratory research");
    await act(async () => buttonNamed("Show starting points").click());
    expect({ href: window.location.href, session: sessionStorage.length, local: localStorage.length }).toEqual(before);
  });
});
