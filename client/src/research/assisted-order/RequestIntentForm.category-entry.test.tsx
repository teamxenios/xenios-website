// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestIntentCatalogItem, RequestIntentQueuePage } from "../../../../shared/research/assisted-order/request-intent";
import type { RequestIntentApi } from "./request-intent-api";
import { linkedCatalogFamily, RequestIntentForm } from "./RequestIntentForm";
vi.mock("./assisted-order.css", () => ({ default: {} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    catalog: vi.fn(async () => ({ items: [item("supplement", "supplements")], total: 1, page: 1, pageSize: 24,
      families: ["supplements", "research_peptides_materials"], channels: [], workflowModes: [] })),
    submit: vi.fn(async () => null),
    recover: vi.fn(async () => null),
    staff: vi.fn(),
    staffQueue: vi.fn(async (): Promise<RequestIntentQueuePage> => ({ items: [], total: 0, page: 1, pageSize: 25 })),
  } satisfies RequestIntentApi;
}

let host: HTMLDivElement, root: Root;
const startPath = window.location.pathname + window.location.search;
beforeEach(() => { sessionStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); sessionStorage.clear();
  window.history.replaceState(null, "", startPath);
});
const familySelect = () => [...host.querySelectorAll("label")].find((label) => label.textContent?.startsWith("Product family"))
  ?.querySelector("select") ?? null;

describe("category links into the catalog", () => {
  it("accepts only a known catalog family, and nothing else from the link", () => {
    expect(linkedCatalogFamily("?family=supplements")).toBe("supplements");
    expect(linkedCatalogFamily("?family=topicals_regenerative&slug=x&variant=y")).toBe("topicals_regenerative");
    for (const search of ["", "?family=", "?family=peptides", "?family=Supplements", "?family=supplements%20", "?category=supplements"]) {
      expect(linkedCatalogFamily(search)).toBe("");
    }
  });
  it("opens the catalog filtered to the linked family, with nothing selected", async () => {
    window.history.replaceState(null, "", "/earlyaccess?family=supplements");
    const api = makeApi();
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded />));
    expect(api.catalog).toHaveBeenCalledWith(expect.objectContaining({ family: "supplements", page: 1 }));
    expect(familySelect()?.value).toBe("supplements");
    expect(api.submit).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Selection from your link");
  });
  it("ignores an unknown family and shows every family", async () => {
    window.history.replaceState(null, "", "/earlyaccess?family=clinical_peptides");
    const api = makeApi();
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded />));
    expect(api.catalog).toHaveBeenCalledWith(expect.objectContaining({ family: undefined }));
    expect(familySelect()?.value).toBe("");
  });
  it("lets the customer clear the linked family", async () => {
    window.history.replaceState(null, "", "/earlyaccess?family=supplements");
    const api = makeApi();
    await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded />));
    const select = familySelect()!;
    await act(async () => { select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ family: undefined, page: 1 }));
  });
});
