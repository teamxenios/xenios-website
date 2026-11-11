// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestIntentForm } from "./RequestIntentForm";
import type { RequestIntentApi } from "./request-intent-api";
import type { RequestIntentCatalogItem, RequestIntentCatalogPage } from "../../../../shared/research/assisted-order/request-intent";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const product: RequestIntentCatalogItem = {
  productId: "synthetic-product", variantId: "synthetic-variant", productName: "Synthetic item",
  family: "research_peptides_materials", channel: "synthetic", specification: "Synthetic exact variant",
  format: null, packBasis: null, minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1,
  unitPriceCents: null, currency: "USD", workflowMode: "request_pricing", actionLabel: "Add to quote cart",
  accessNotice: null, researchUseOnly: true, catalogVersion: "synthetic", priceVersion: null,
  sourceSelection: { family: "synthetic", slug: "synthetic", variantId: "synthetic-source" },
  selectableForReview: true, intentExclusion: null, clinicalReviewRequired: false,
  sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null,
};
function page(number = 1, total = 1): RequestIntentCatalogPage {
  return { items: number === 1 ? [product] : [], total, page: number, pageSize: 24,
    families: [product.family], channels: [], workflowModes: [] };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function makeApi() {
  return {
    config: vi.fn(async () => ({ legal: [], form: [] })),
    catalog: vi.fn<RequestIntentApi["catalog"]>(async () => page()),
    submit: vi.fn(), recover: vi.fn(), staff: vi.fn(), staffQueue: vi.fn(),
  } satisfies RequestIntentApi;
}
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  sessionStorage.clear(); host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External effects disabled in synthetic test"); }));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); vi.unstubAllGlobals();
});
async function mount(api: RequestIntentApi) {
  await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} />));
}
function button(label: string) {
  return [...host.querySelectorAll("button")].find(node => node.textContent === label);
}
async function click(label: string) {
  const node = button(label); expect(node, "Missing customer action: " + label).toBeTruthy();
  await act(async () => node!.click());
}
async function search(value: string) {
  const input = host.querySelector<HTMLInputElement>('input:not([type])')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function noWrites(api: ReturnType<typeof makeApi>) {
  expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(0); expect(fetch).not.toHaveBeenCalled();
}

describe("Quick Order catalog read recovery", () => {
  it("ends the false loading state and retries one failed read only after a customer action", async () => {
    const api = makeApi(), retry = deferred<RequestIntentCatalogPage>();
    api.catalog.mockRejectedValueOnce(new Error("private upstream exception"))
      .mockImplementationOnce(() => retry.promise);
    await mount(api);
    expect(host.textContent).not.toContain("Loading catalog...");
    expect(button("Retry catalog")).toBeTruthy();
    expect(host.textContent).not.toContain("private upstream exception");
    expect(api.catalog).toHaveBeenCalledTimes(1);
    await click("Retry catalog");
    expect(api.catalog).toHaveBeenCalledTimes(2);
    expect(api.catalog).toHaveBeenLastCalledWith({ search: "", family: undefined, page: 1, pageSize: 24 });
    expect(button("Retry catalog")).toBeUndefined();
    expect(host.textContent).toContain("Loading catalog...");
    await act(async () => retry.resolve(page()));
    expect(host.textContent).toContain("1 visible catalog entries");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await click("Add Synthetic item to quote cart");
    expect(button("Continue to details")!.disabled).toBe(false);
    noWrites(api);
  });

  it("retries the current filtered page and retains the selected exact variant and quantity", async () => {
    const api = makeApi();
    api.catalog.mockResolvedValueOnce(page()).mockResolvedValueOnce(page(1, 25))
      .mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValueOnce(page(2, 25));
    await mount(api); await click("Add Synthetic item to quote cart");
    const quantity = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(quantity, "7");
      quantity.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await search("exact synthetic"); await click("Next");
    expect(button("Retry catalog")).toBeTruthy();
    await click("Retry catalog");
    expect(api.catalog).toHaveBeenCalledTimes(4);
    expect(api.catalog).toHaveBeenLastCalledWith({ search: "exact synthetic", family: undefined, page: 2, pageSize: 24 });
    const summary = host.querySelector('aside[aria-label="Selected request items"]')!;
    expect(summary.textContent).toContain("Synthetic exact variant");
    expect(summary.textContent).toContain("Requested quantity: 7");
    expect(host.textContent).toContain("Page 2");
    await click("Continue to details");
    expect(host.querySelector('input[name="name"]')).not.toBeNull();
    noWrites(api);
  });

  it("keeps repeated failures recoverable without automatic retries or raw exception details", async () => {
    const api = makeApi(); api.catalog.mockRejectedValue(new Error("private connection string"));
    await mount(api); await click("Retry catalog");
    expect(api.catalog).toHaveBeenCalledTimes(2);
    expect(button("Retry catalog")).toBeTruthy();
    expect(host.textContent).not.toContain("Loading catalog...");
    expect(host.textContent).not.toContain("private connection string");
    expect(host.querySelector('a[href="tel:7374186381"]')).not.toBeNull();
    noWrites(api);
  });

  it("preserves the selected family in the retried catalog query", async () => {
    const api = makeApi();
    api.catalog.mockResolvedValueOnce(page()).mockRejectedValueOnce(new Error("family read failed"))
      .mockResolvedValueOnce(page());
    await mount(api);
    const family = host.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      family.value = "research_peptides_materials";
      family.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click("Retry catalog");
    expect(api.catalog).toHaveBeenCalledTimes(3);
    expect(api.catalog).toHaveBeenLastCalledWith({ search: "", family: "research_peptides_materials", page: 1, pageSize: 24 });
    expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("research_peptides_materials");
    noWrites(api);
  });

  it("discards an old retry success when the customer changes the search", async () => {
    const api = makeApi(), old = deferred<RequestIntentCatalogPage>();
    api.catalog.mockRejectedValueOnce(new Error("unavailable")).mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ ...page(), items: [{ ...product, productName: "New search result" }] });
    await mount(api); await click("Retry catalog"); await search("new query");
    await act(async () => old.resolve({ ...page(), items: [{ ...product, productName: "Obsolete result" }] }));
    expect(host.textContent).toContain("New search result");
    expect(host.textContent).not.toContain("Obsolete result");
    expect(button("Retry catalog")).toBeUndefined(); noWrites(api);
  });

  it("discards an old retry failure after a newer successful search", async () => {
    const api = makeApi(), old = deferred<RequestIntentCatalogPage>();
    api.catalog.mockRejectedValueOnce(new Error("unavailable")).mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(page());
    await mount(api); await click("Retry catalog"); await search("new query");
    await act(async () => old.reject(new Error("old failure")));
    expect(host.textContent).toContain("1 visible catalog entries");
    expect(button("Retry catalog")).toBeUndefined(); expect(host.querySelector('[role="alert"]')).toBeNull();
    noWrites(api);
  });

  it("does not erase an independent requirements failure when the catalog recovers", async () => {
    const api = makeApi(); api.config.mockRejectedValueOnce(new Error("config unavailable"));
    api.catalog.mockRejectedValueOnce(new Error("catalog unavailable")).mockResolvedValueOnce(page());
    await mount(api); await click("Retry catalog");
    expect(host.textContent).toContain("Current request requirements are unavailable. Submission remains closed.");
    expect(button("Continue to details")!.disabled).toBe(true);
    expect(api.config).toHaveBeenCalledTimes(1); noWrites(api);
  });

  it("leaves uncertain-attempt recovery exclusive and does not read the catalog", async () => {
    const api = makeApi(); sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, JSON.stringify({
      key: "30000000-0000-4000-8000-000000000001", acceptedAt: "2026-11-01T00:00:00.000Z", state: "in_flight",
    }));
    const original = sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    await mount(api);
    expect(button("Check saved request")).toBeTruthy(); expect(button("Retry catalog")).toBeUndefined();
    expect(api.catalog).not.toHaveBeenCalled(); expect(api.config).not.toHaveBeenCalled();
    expect(api.submit).not.toHaveBeenCalled(); expect(api.recover).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(original);
  });
});
