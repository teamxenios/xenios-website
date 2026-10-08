// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "wouter";
import { ResearchContext, type ResearchContextValue } from "../../core";
import ProductPage from "./ProductPage";
import { createSubscription } from "../../adapters/commerce";

vi.mock("../../adapters/commerce", () => ({ createSubscription: vi.fn() }));

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
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.pushState({}, "", "/research/member/products/synthetic-product");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function CommitCapture({ capture }: { capture?: (text: string) => void }) {
  useLayoutEffect(() => { capture?.(host.textContent ?? ""); });
  return null;
}
async function mount(memberToken: string | null = context.memberToken, capture?: (text: string) => void) {
  await act(async () => root.render(<ResearchContext.Provider value={{ ...context, memberToken }}>
    <Route path="/research/member/products/:slug" component={ProductPage} />
    <CommitCapture capture={capture} />
  </ResearchContext.Provider>));
}
async function render(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response(body, status)));
  await mount();
}

describe("mounted product subscription authority boundary", () => {
  it("shows unavailable for a canonical Research detail and ignores extra offer-like fields", async () => {
    await render({ ok: true, product: { ...product(), subscriptionEligible: true,
      priceVersion: "invented", subscriptionOffer: { priceCents: 100, enabled: true } } });
    expect(host.textContent).toContain("Synthetic Research");
    expect(host.textContent).toContain("A subscription offer is not available for this product.");
    expect(host.textContent).not.toMatch(/recurring deliveries|Unit price|Choose your schedule/);
    expect(host.querySelector("form")).toBeNull();
    expect(createSubscription).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("does not mount a Research subscription on a non-Research detail", async () => {
    await render({ ok: true, product: { ...product(), researchOnlyBoundary: false } });
    expect(Array.from(host.querySelectorAll("h2"), node => node.textContent)).not.toContain("Product subscription");
    expect(host.textContent).not.toContain("recurring deliveries");
    expect(createSubscription).not.toHaveBeenCalled();
  });
  it("does not imply an offer when the product endpoint is unavailable", async () => {
    await render({ ok: false, code: "member_catalog_unavailable" }, 503);
    expect(host.textContent).not.toContain("recurring deliveries");
    expect(host.querySelector("form")).toBeNull();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("does not offer a subscription when the account read is unauthorized", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ ok: false, code: "unauthorized" }, 401)));
    await mount(null);
    expect(host.textContent).not.toContain("Synthetic Research");
    expect(Array.from(host.querySelectorAll("h2"), node => node.textContent)).not.toContain("Product subscription");
    expect(host.querySelector("form")).toBeNull();
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("rejects a detail whose canonical slug does not match the route", async () => {
    await render({ ok: true, product: { ...product(), slug: "different-product" } });
    expect(host.textContent).not.toContain("Synthetic Research");
    expect(host.textContent).not.toContain("A subscription offer");
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("an old route response cannot overwrite the newer product view", async () => {
    let finishOld!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(response({ ok: true, product: { ...product(), id: "new-product", slug: "new-product", displayName: "New Research" } })));
    await mount();
    await act(async () => {
      window.history.pushState({}, "", "/research/member/products/new-product");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(host.querySelector("h1")?.textContent).toBe("New Research");
    await act(async () => finishOld(response({ ok: true, product: product() })));
    expect(host.querySelector("h1")?.textContent).toBe("New Research");
    expect(host.textContent).not.toContain("Synthetic Research");
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("hides a previous account's resolved detail before the next loading effect", async () => {
    await render({ ok: true, product: { ...product(), displayName: "Previous account product" } });
    expect(host.textContent).toContain("Previous account product");
    let finishNew!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(resolve => { finishNew = resolve; }));
    const commits: string[] = [];
    await mount("synthetic-new-account", text => commits.push(text));
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.every(text => !text.includes("Previous account product"))).toBe(true);
    expect(host.textContent).not.toContain("Previous account product");
    expect(host.textContent).not.toContain("A subscription offer");
    await act(async () => finishNew(response({ ok: true, product: { ...product(), displayName: "Current account product" } })));
    expect(host.querySelector("h1")?.textContent).toBe("Current account product");
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("an old account response cannot overwrite the newer account view", async () => {
    let finishOld!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockReturnValueOnce(new Promise<Response>(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(response({ ok: true, product: { ...product(), displayName: "Current account product" } })));
    await mount();
    await mount("synthetic-new-account");
    expect(host.querySelector("h1")?.textContent).toBe("Current account product");
    await act(async () => finishOld(response({ ok: true, product: { ...product(), displayName: "Old account product" } })));
    expect(host.querySelector("h1")?.textContent).toBe("Current account product");
    expect(host.textContent).not.toContain("Old account product");
    expect(createSubscription).not.toHaveBeenCalled();
  });

  it("ignores late product reads after page unmount", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>(resolve => { finish = resolve; })));
    await mount();
    act(() => root.render(null));
    await act(async () => finish(response({ ok: true, product: product() })));
    expect(host.textContent).toBe("");
    expect(createSubscription).not.toHaveBeenCalled();
  });
});
