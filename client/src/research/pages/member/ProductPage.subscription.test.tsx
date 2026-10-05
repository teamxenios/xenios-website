// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "wouter";
import { ResearchContext, type ResearchContextValue } from "../../core";
import ProductPage from "./ProductPage";

let host: HTMLDivElement;
let root: Root;
const context = { gate: "open", member: { firstName: "Synthetic", status: "active", applicationStatus: null },
  memberToken: "synthetic-customer", memberChecking: false, recovery: "none" } as ResearchContextValue;
function product() {
  return { id: "synthetic-product", slug: "synthetic-product", displayName: "Synthetic Research",
    canonicalName: "Synthetic Research", aliases: [], lane: "research_material", category: "Research",
    classification: "Research material", summary: "Synthetic review only.", displayState: "unavailable",
    media: null, price: null, readiness: null, selection: null, variantCount: 0,
    updatedAt: "2026-10-05T12:00:00.000Z", audience: "member", currency: "USD",
    evaluatedAt: "2026-10-05T12:00:00.000Z", overview: null, specifications: null,
    researchInformation: null, storageInformation: null, shippingInformation: null,
    returnInformation: null, disclaimers: null, reviewDate: null, variants: [], relatedProducts: [],
    researchOnlyBoundary: true };
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.pushState({}, "", "/research/member/products/synthetic-product");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  })));
  await act(async () => root.render(<ResearchContext.Provider value={context}>
    <Route path="/research/member/products/:slug" component={ProductPage} />
  </ResearchContext.Provider>));
}

describe("mounted product subscription authority boundary", () => {
  it("shows unavailable for a canonical Research detail and ignores extra offer-like fields", async () => {
    await render({ ok: true, product: { ...product(), subscriptionEligible: true,
      priceVersion: "invented", subscriptionOffer: { priceCents: 100, enabled: true } } });
    expect(host.textContent).toContain("Synthetic Research");
    expect(host.textContent).toContain("A subscription offer is not available for this product yet");
    expect(host.querySelector("form")).toBeNull();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("does not mount a Research subscription on a non-Research detail", async () => {
    await render({ ok: true, product: { ...product(), researchOnlyBoundary: false } });
    expect(host.querySelector("h2")?.textContent).not.toBe("Product subscription");
    expect(host.textContent).not.toContain("Request recurring deliveries");
  });
  it("does not imply an offer when the product endpoint is unavailable", async () => {
    await render({ ok: false, code: "member_catalog_unavailable" }, 503);
    expect(host.textContent).not.toContain("Request recurring deliveries");
    expect(host.querySelector("form")).toBeNull();
  });
});
