// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestIntentForm } from "./RequestIntentForm";
import type { RequestIntentApi } from "./request-intent-api";
import type { RequestIntentCatalogItem, RequestIntentCatalogPage } from "../../../../shared/research/assisted-order/request-intent";

// Keyboard focus around catalog paging. Both page controls are disabled while a
// page loads; a browser then either drops focus to the document or leaves it on
// the disabled control. The form must put focus back once the new page mounts.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const TOTAL = 73; // four pages of 24
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
function item(n: number): RequestIntentCatalogItem {
  return { ...product, productId: "synthetic-product-" + n, variantId: "synthetic-variant-" + n,
    productName: "Synthetic item " + n,
    sourceSelection: { family: "synthetic", slug: "synthetic-" + n, variantId: "synthetic-source-" + n } };
}
function pageOf(number: number, total = TOTAL): RequestIntentCatalogPage {
  const first = (number - 1) * 24, count = Math.max(0, Math.min(24, total - first));
  return { items: Array.from({ length: count }, (_, index) => item(first + index + 1)), total, page: number, pageSize: 24,
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
    catalog: vi.fn<RequestIntentApi["catalog"]>(async () => pageOf(1)),
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
  Reflect.deleteProperty(window, "matchMedia");
});
async function mount(api: RequestIntentApi, compact = false) {
  await act(async () => root.render(compact
    ? <RequestIntentForm api={api} storage={sessionStorage} embedded ownerKey="early-access-session" />
    : <RequestIntentForm api={api} storage={sessionStorage} />));
}
function pager(label: "Previous" | "Next") {
  const node = [...host.querySelectorAll<HTMLButtonElement>('nav[aria-label="Catalog pages"] button')]
    .find((button) => button.textContent === label);
  expect(node, "Missing page control: " + label).toBeTruthy();
  return node!;
}
function pageLabel() {
  return host.querySelector('nav[aria-label="Catalog pages"] span')?.textContent;
}
async function settle() { await act(async () => { await Promise.resolve(); }); }
/** The customer presses a focused page control; the read for the next page stays open. */
async function press(label: "Previous" | "Next", api: ReturnType<typeof makeApi>) {
  const read = deferred<RequestIntentCatalogPage>();
  api.catalog.mockImplementationOnce(() => read.promise);
  const control = pager(label);
  control.focus();
  expect(document.activeElement).toBe(control);
  await act(async () => control.click());
  return { control, read };
}
/** The browser form in which focus falls to the document when the focused control is disabled. */
function dropFocusToDocument(control: HTMLButtonElement) {
  control.blur();
  expect(document.activeElement).toBe(document.body);
}

describe("catalog paging keeps keyboard focus", () => {
  it("returns focus to Next once the next page mounts, and not while it loads", async () => {
    const api = makeApi();
    await mount(api);
    expect(pageLabel()).toBe("Page 1 of 4");
    const { control, read } = await press("Next", api);
    expect(api.catalog).toHaveBeenLastCalledWith({ search: "", family: undefined, page: 2, pageSize: 24 });
    expect(control.disabled).toBe(true);
    dropFocusToDocument(control);
    await settle();
    expect(host.textContent).toContain("Loading catalog...");
    expect(document.activeElement).toBe(document.body);
    await act(async () => read.resolve(pageOf(2)));
    expect(pageLabel()).toBe("Page 2 of 4");
    expect(host.textContent).toContain("Synthetic item 25");
    expect(pager("Next").disabled).toBe(false);
    expect(document.activeElement).toBe(pager("Next"));
  });

  it("keeps focus on Next when the browser leaves it on the disabled control", async () => {
    const api = makeApi();
    await mount(api);
    const { control, read } = await press("Next", api);
    expect(control.disabled).toBe(true);
    expect(document.activeElement).toBe(control);
    await act(async () => read.resolve(pageOf(2)));
    expect(pager("Next").disabled).toBe(false);
    expect(document.activeElement).toBe(pager("Next"));
  });

  it("moves focus to Next when Previous reaches the first page and stays disabled there", async () => {
    const api = makeApi();
    await mount(api);
    const forward = await press("Next", api);
    await act(async () => forward.read.resolve(pageOf(2)));
    const { control, read } = await press("Previous", api);
    expect(control.disabled).toBe(true);
    expect(document.activeElement).toBe(control);
    await act(async () => read.resolve(pageOf(1)));
    expect(pageLabel()).toBe("Page 1 of 4");
    expect(pager("Previous").disabled).toBe(true);
    expect(document.activeElement).toBe(pager("Next"));
  });

  it("moves focus to Next at the first page when focus fell to the document", async () => {
    const api = makeApi();
    await mount(api);
    const forward = await press("Next", api);
    await act(async () => forward.read.resolve(pageOf(2)));
    const { control, read } = await press("Previous", api);
    dropFocusToDocument(control);
    await act(async () => read.resolve(pageOf(1)));
    expect(pager("Previous").disabled).toBe(true);
    expect(document.activeElement).toBe(pager("Next"));
  });

  it("moves focus to Previous when Next reaches the last page", async () => {
    const api = makeApi();
    await mount(api);
    const forward = await press("Next", api);
    await act(async () => forward.read.resolve(pageOf(2, 25)));
    expect(pageLabel()).toBe("Page 2 of 2");
    expect(pager("Next").disabled).toBe(true);
    expect(document.activeElement).toBe(pager("Previous"));
  });

  it("returns focus to the pressed control after a failed page is retried", async () => {
    const api = makeApi();
    await mount(api);
    const { control, read } = await press("Next", api);
    dropFocusToDocument(control);
    await act(async () => read.reject(new Error("temporary failure")));
    const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Retry catalog");
    expect(retry).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
    const second = deferred<RequestIntentCatalogPage>();
    api.catalog.mockImplementationOnce(() => second.promise);
    retry!.focus();
    await act(async () => retry!.click());
    expect(api.catalog).toHaveBeenLastCalledWith({ search: "", family: undefined, page: 2, pageSize: 24 });
    expect(host.textContent).toContain("Loading catalog...");
    await act(async () => second.resolve(pageOf(2)));
    expect(pageLabel()).toBe("Page 2 of 4");
    expect(document.activeElement).toBe(pager("Next"));
  });

  it("leaves focus where the customer moved it while the page loaded", async () => {
    const api = makeApi();
    await mount(api);
    const { control, read } = await press("Next", api);
    dropFocusToDocument(control);
    const search = host.querySelector<HTMLInputElement>('[data-testid="request-catalog-search"]')!;
    search.focus();
    expect(document.activeElement).toBe(search);
    await act(async () => read.resolve(pageOf(2)));
    expect(pageLabel()).toBe("Page 2 of 4");
    expect(document.activeElement).toBe(search);
  });

  it("forgets a pressed page control once a search starts a different read", async () => {
    const api = makeApi();
    await mount(api);
    const { control, read } = await press("Next", api);
    dropFocusToDocument(control);
    const searched = deferred<RequestIntentCatalogPage>();
    api.catalog.mockImplementationOnce(() => searched.promise);
    const search = host.querySelector<HTMLInputElement>('[data-testid="request-catalog-search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "synthetic");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(api.catalog).toHaveBeenLastCalledWith({ search: "synthetic", family: undefined, page: 1, pageSize: 24 });
    expect(document.activeElement).toBe(document.body);
    await act(async () => { read.resolve(pageOf(2)); searched.resolve(pageOf(1)); });
    expect(pageLabel()).toBe("Page 1 of 4");
    expect(document.activeElement).toBe(document.body);
  });

  it("on a phone, moves focus to the catalog start that was scrolled into view", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({
      matches: query === "(max-width: 700px)", media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }) });
    const api = makeApi();
    await mount(api, true);
    const start = host.querySelector<HTMLElement>(".xenios-order-catalog-start")!;
    expect(start.tabIndex).toBe(-1);
    const scroll = vi.fn();
    Object.defineProperty(start, "scrollIntoView", { configurable: true, value: scroll });
    const { read } = await press("Next", api);
    await act(async () => read.resolve(pageOf(2)));
    expect(pageLabel()).toBe("Page 2 of 4");
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
    expect(document.activeElement).toBe(start);
  });
});
