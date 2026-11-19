import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS, assistedOrderFormPair } from "../../../../shared/research/assisted-order/form";
import type { AssistedOrderCatalogQuery } from "../../../../shared/research/assisted-order/contract";
import type { RequestIntentCatalogItem, RequestIntentCatalogPage, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import { catalogFamilyLabel, familyNamedBySearch } from "./catalog-no-result";
import type { RequestIntentApi } from "./request-intent-api";
import { RequestIntentForm } from "./RequestIntentForm";

const FAMILIES = ["supplements", "clinical_formulations_503a", "research_peptides_materials"];

describe("the family a search names", () => {
  it.each([["supplements"], ["Supplements"], ["  SUPPLEMENT "], ["ｓｕｐｐｌｅｍｅｎｔｓ"]])("finds the Supplements filter for %j", (search) => {
    expect(familyNamedBySearch(search, FAMILIES)).toBe("supplements");
  });
  it("uses the name the filter shows, including the clinical name", () => {
    expect(catalogFamilyLabel("clinical_formulations_503a")).toBe("Clinical formulations");
    expect(familyNamedBySearch("clinical formulations", FAMILIES)).toBe("clinical_formulations_503a");
  });
  it.each([["supplement capsules"], ["supp"], [""], ["vitamins"]])("names no family for %j", (search) => {
    expect(familyNamedBySearch(search, FAMILIES)).toBeNull();
  });
  it("offers only a family the viewer can see", () => {
    expect(familyNamedBySearch("supplements", ["research_peptides_materials"])).toBeNull();
  });
});

// The same synthetic research row shape as RequestIntentForm.test.tsx.
function item(): RequestIntentCatalogItem {
  return {
    productId: "research", variantId: "research-variant", productName: "Synthetic research", family: "research_peptides_materials",
    channel: "synthetic", specification: "Synthetic variant", format: null, packBasis: null, minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1,
    unitPriceCents: null, currency: "USD", workflowMode: "request_pricing",
    actionLabel: "Add to quote cart", accessNotice: null, researchUseOnly: true, catalogVersion: "synthetic", priceVersion: null,
    sourceSelection: { family: "synthetic", slug: "research", variantId: "research-source" },
    selectableForReview: true, intentExclusion: null, clinicalReviewRequired: false,
    sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null,
  };
}
const page = (items: RequestIntentCatalogItem[]): RequestIntentCatalogPage => ({
  items, total: items.length, page: 1, pageSize: 24, families: FAMILIES, channels: [], workflowModes: [],
});

function makeApi(found: (query: AssistedOrderCatalogQuery) => boolean) {
  return {
    config: vi.fn(async () => ({ legal: [{ kind: "fixture-terms", version: "fixture-v1", label: "Synthetic legal requirement" }],
      form: ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((ack) => ({ id: ack.id, scope: ack.scope, copy: ack.copy, ...assistedOrderFormPair(ack) })) })),
    catalog: vi.fn(async (query: AssistedOrderCatalogQuery) => page(found(query) ? [item()] : [])),
    submit: vi.fn(),
    recover: vi.fn(),
    staff: vi.fn(),
    staffQueue: vi.fn(async (): Promise<RequestIntentQueuePage> => ({ items: [], total: 0, page: 1, pageSize: 25 })),
  } satisfies RequestIntentApi;
}

let host: HTMLDivElement, root: Root;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); });

const notice = () => host.querySelector<HTMLElement>('[data-testid="catalog-no-result"]');
const searchBox = () => [...host.querySelectorAll<HTMLInputElement>("input")].find((input) => input.closest("label")?.textContent === "Search catalog")!;
const button = (text: string) => [...(notice()?.querySelectorAll("button") ?? [])].find((entry) => entry.textContent === text);
async function render(api: RequestIntentApi) {
  await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} />));
}
async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(searchBox(), value);
    searchBox().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function press(text: string) {
  const target = button(text);
  expect(target, text).toBeTruthy();
  await act(async () => target!.click());
}
const lastQuery = (api: ReturnType<typeof makeApi>) => api.catalog.mock.calls.at(-1)![0];

describe("a catalog search that finds nothing", () => {
  it("says the search found nothing, and offers the family the search names", async () => {
    // Only the family filter finds the row; the word itself matches no listing.
    const api = makeApi((query) => !query.search && (!query.family || query.family === "supplements"));
    await render(api);
    expect(notice()).toBeNull();
    await type("supplements");
    expect(notice()!.textContent).toContain("No listings match “supplements”.");
    expect(notice()!.textContent).toContain("Search looks at product names, listed names, strengths and printed forms.");
    expect(notice()!.querySelector('a[href="/research/support"]')?.textContent).toBe("Ask the team");
    await press("Show Supplements");
    expect(lastQuery(api)).toMatchObject({ search: "", family: "supplements" });
    expect(searchBox().value).toBe("");
    expect(notice()).toBeNull();
    expect(host.querySelector(".xenios-order-cards")?.textContent).toContain("Synthetic research");
  });

  it("offers to clear a search that names no family, and adds no result", async () => {
    const api = makeApi((query) => !query.search);
    await render(api);
    await type("zzqx");
    expect(notice()!.textContent).toContain("No listings match “zzqx”.");
    expect(button("Show Supplements")).toBeUndefined();
    expect(host.querySelector(".xenios-order-cards")?.textContent ?? "").toBe("");
    await press("Clear search");
    expect(lastQuery(api)).toMatchObject({ search: "" });
    expect(searchBox().value).toBe("");
    expect(notice()).toBeNull();
  });

  it("names the family filter that is on, and offers every family", async () => {
    const api = makeApi((query) => !query.search && !query.family);
    await render(api);
    const select = [...host.querySelectorAll<HTMLSelectElement>("select")].find((entry) => entry.closest("label")?.textContent?.startsWith("Product family"))!;
    await act(async () => { select.value = "clinical_formulations_503a"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(notice()!.textContent).toContain("No listings in Clinical formulations.");
    await type("zzqx");
    expect(notice()!.textContent).toContain("No listings match “zzqx” in Clinical formulations.");
    await press("Show all families");
    expect(lastQuery(api)).toMatchObject({ search: "zzqx" });
    expect(lastQuery(api).family).toBeUndefined();
  });

  it("stays out of the way when the search finds rows", async () => {
    const api = makeApi(() => true);
    await render(api);
    await type("synthetic");
    expect(notice()).toBeNull();
  });
});
