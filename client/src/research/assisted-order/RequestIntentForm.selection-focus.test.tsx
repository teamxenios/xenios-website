// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestIntentForm } from "./RequestIntentForm";
import type { RequestIntentApi } from "./request-intent-api";
import type { RequestIntentCatalogItem, RequestIntentCatalogPage } from "../../../../shared/research/assisted-order/request-intent";

const first: RequestIntentCatalogItem = {
  productId: "synthetic-product", variantId: "synthetic-variant-one", productName: "Synthetic item",
  family: "research_peptides_materials", channel: "synthetic", specification: "Exact first variant",
  format: null, packBasis: null, minimumQuantity: 3, maximumQuantity: 99, quantityIncrement: 1,
  unitPriceCents: null, currency: "USD", workflowMode: "request_pricing", actionLabel: "Add to quote cart",
  accessNotice: null, researchUseOnly: true, catalogVersion: "synthetic", priceVersion: null,
  sourceSelection: { family: "synthetic", slug: "synthetic", variantId: "synthetic-source-one" },
  selectableForReview: true, intentExclusion: null, clinicalReviewRequired: false,
  sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null,
};
const second: RequestIntentCatalogItem = { ...first, variantId: "synthetic-variant-two", specification: "Exact second variant", minimumQuantity: 7,
  sourceSelection: { family: "synthetic", slug: "synthetic", variantId: "synthetic-source-two" } };
function makeApi(items: RequestIntentCatalogItem[] = [first, second]) {
  const page: RequestIntentCatalogPage = { items, total: items.length, page: 1, pageSize: 24,
    families: [first.family], channels: [], workflowModes: [] };
  return { config: vi.fn(async () => ({ legal: [], form: [] })), catalog: vi.fn<RequestIntentApi["catalog"]>(async () => page),
    submit: vi.fn(), recover: vi.fn(), staff: vi.fn(), staffQueue: vi.fn() } satisfies RequestIntentApi;
}
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("External transport disabled in owned mounted fixture"); }));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function mount(api: RequestIntentApi, compact = true) {
  await act(async () => root.render(<RequestIntentForm api={api} storage={sessionStorage} embedded={compact} ownerKey={compact ? "early-access-session" : "synthetic-owner"} />));
}
function row(variantId: string) {
  const found = Array.from(host.querySelectorAll<HTMLElement>("article[data-variant-id]")).find(node => node.dataset.variantId === variantId);
  expect(found).toBeTruthy(); return found!;
}
function add(variantId = first.variantId) {
  const button = row(variantId).querySelector<HTMLButtonElement>(".xenios-order-card-actions > button.xenios-order-button");
  expect(button).toBeTruthy(); return button!;
}
function quantity(variantId = first.variantId) {
  const input = row(variantId).querySelector<HTMLInputElement>('.xenios-order-quantity input[type="number"]');
  expect(input).toBeTruthy(); return input!;
}
function search() { return host.querySelector<HTMLInputElement>('[data-testid="request-catalog-search"]')!; }

describe("catalog Add preserves genuine customer focus", () => {
  it.each([false, true])("returns the removed focused Add to its current quantity input, compact=%s", async compact => {
    const api = makeApi(), storage = vi.spyOn(Storage.prototype, "setItem"); await mount(api, compact);
    const trigger = add(); trigger.focus(); expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    expect(trigger.isConnected).toBe(false); expect(document.activeElement).toBe(quantity()); expect(quantity().value).toBe("3");
    expect(quantity().getAttribute("min")).toBe("3"); expect(quantity().getAttribute("max")).toBe("99");
    expect(quantity().getAttribute("aria-label")).toContain("Exact first variant");
    expect(api.submit).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
  });
  it("binds focus to the exact selected variant even when two rows have the same name", async () => {
    const api = makeApi(); await mount(api); const trigger = add(second.variantId); trigger.focus();
    await act(async () => trigger.click());
    expect(document.activeElement).toBe(quantity(second.variantId)); expect(quantity(second.variantId).value).toBe("7");
    expect(row(first.variantId).querySelector('input[type="number"]')).toBeNull(); expect(add().isConnected).toBe(true);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it.each(["search", "other-add"])("preserves a customer move to %s before the selection commit", async destination => {
    const api = makeApi(); await mount(api); const trigger = add(), moved = destination === "search" ? search() : add(second.variantId);
    trigger.focus();
    await act(async () => { trigger.click(); moved.focus(); expect(document.activeElement).toBe(moved); });
    expect(trigger.isConnected).toBe(false); expect(quantity().value).toBe("3"); expect(document.activeElement).toBe(moved);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("does not invent focused Add intent for an unfocused programmatic selection", async () => {
    const api = makeApi(); await mount(api); search().focus(); const retained = search();
    await act(async () => add().click());
    expect(quantity().value).toBe("3"); expect(document.activeElement).toBe(retained); expect(api.submit).not.toHaveBeenCalled();
  });
  it("leaves an unselectable listing and its restriction unchanged", async () => {
    const held = { ...first, selectableForReview: false, intentExclusion: "coming_soon" as const, reviewMessage: "Synthetic unavailable listing" };
    const api = makeApi([held]); await mount(api);
    expect(row(first.variantId).querySelector(".xenios-order-card-actions > button.xenios-order-button")).toBeNull();
    expect(host.textContent).toContain("Coming soon"); expect(host.textContent).toContain("Synthetic unavailable listing");
    expect(host.querySelector('.xenios-order-quantity input')).toBeNull(); expect(api.submit).not.toHaveBeenCalled();
  });
  it("consumes Add focus intent once and leaves later quantity edits and Search focus alone", async () => {
    const api = makeApi(); await mount(api); const trigger = add(); trigger.focus(); await act(async () => trigger.click());
    expect(document.activeElement).toBe(quantity()); const input = quantity(); search().focus();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "8");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(quantity().value).toBe("8"); expect(document.activeElement).toBe(search()); expect(api.submit).not.toHaveBeenCalled();
  });
});
