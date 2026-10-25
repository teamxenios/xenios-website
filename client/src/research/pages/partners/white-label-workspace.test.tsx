// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import type { WhiteLabelWorkspaceView } from "@shared/research/partners/white-label";
import WhiteLabelWorkspace from "./WhiteLabelWorkspace";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function context(token: string | null): ResearchContextValue {
  return {
    gate: "open",
    member: token ? { firstName: "Sam", status: "active", applicationStatus: null } : null,
    memberToken: token,
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

async function render(token: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<ResearchContext.Provider value={context(token)}><WhiteLabelWorkspace /></ResearchContext.Provider>);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return container;
}

function response(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, headers: new Headers({ "content-type": "application/json" }), json: async () => body };
}

function fixture(): WhiteLabelWorkspaceView {
  return {
    organizationId: "organization-opaque",
    organizationName: "North Studio",
    applicationState: "approved",
    version: 4,
    trackingState: "awaiting_partner",
    brand: { brandName: "North", logoAssetReference: "asset-opaque", primaryColor: "#111111", secondaryColor: "#eeeeee", mode: "co_branded", packagingNotes: null, packagingState: "under_review", packagingPreviewReference: null },
    fulfillmentMode: "hybrid",
    variants: [{ productId: "product-opaque", variantId: "variant-opaque", sku: "SKU-EXACT-1", productName: "Research peptide", variantName: "10 mg presentation", qualityState: "verified", selectable: true, unavailableReason: null }],
    selections: [{ selectionId: "selection-1", productId: "product-opaque", variantId: "variant-opaque", sku: "SKU-EXACT-1", productName: "Research peptide", variantName: "10 mg presentation", requestedQuantity: 100, qualityState: "verified", createdAt: "2026-07-31T12:00:00.000Z" }],
    quotes: [{ quoteId: "quote-1", state: "issued", selectionIds: ["selection-1"], amountCents: 250000, currency: "USD", version: 1, requestedAt: "2026-07-31T12:00:00.000Z", issuedAt: "2026-07-31T13:00:00.000Z", expiresAt: "2026-08-15T13:00:00.000Z" }],
    supportTickets: [],
    updatedAt: "2026-07-31T13:00:00.000Z",
  };
}

describe("WhiteLabelWorkspace", () => {
  it("fails closed for a signed-out visitor without calling the API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const view = await render(null);
    expect(view.textContent).toContain("Sign in required");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders the truthful application state when the workspace route is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(404, {})));
    const view = await render("member-token");
    expect(view.textContent).toContain("Request white-label review");
    expect(view.textContent).toContain("does not create inventory, purchase labels, or start fulfillment");
    expect(view.textContent).not.toContain("Application received");
  });

  it("renders the final partner workspace without internal economics or customer data", async () => {
    const payload = { ok: true, workspace: fixture() };
    vi.stubGlobal("fetch", vi.fn(async () => response(200, payload)));
    const view = await render("member-token");
    expect(view.textContent).toContain("North Studio");
    expect(view.textContent).toContain("Eligible product variants");
    expect(view.textContent).toContain("SKU-EXACT-1");
    expect(view.textContent).toContain("Label and packaging review");
    expect(view.textContent).toContain("Blind shipping");
    expect(view.textContent).toContain("$2,500.00");
    expect(view.textContent).toContain("cannot execute payouts, buy labels, dispatch shipments, or message customers");
    expect(view.textContent).not.toMatch(/supplier cost|margin|multiplier|customer email|internal notes/i);
    expect(view.querySelectorAll("h2")).toHaveLength(1);
    expect(view.querySelector('section[aria-labelledby="white-label-products"]')).not.toBeNull();
  });

  it("submits an exact SKU and never sends a product-only selection", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const workspace = fixture();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
      if ((init?.method ?? "GET") === "GET") return response(200, { ok: true, workspace });
      return response(200, { ok: true, result: { workspace, idempotentReplay: false } });
    }));
    const view = await render("member-token");
    await act(async () => {
      (Array.from(view.querySelectorAll("button")).find((button) => button.textContent === "Add exact variant") as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const post = calls.find((call) => call.url.endsWith("/selections"));
    expect(post?.body).toMatchObject({ sku: "SKU-EXACT-1", requestedQuantity: 1, expectedVersion: 4 });
    expect(post?.body).not.toHaveProperty("productId");
    expect(post?.body).not.toHaveProperty("memberId");
  });

  it("uses mobile-safe responsive grids instead of fixed desktop widths", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ok: true, workspace: fixture() })));
    const view = await render("member-token");
    const responsive = Array.from(view.querySelectorAll<HTMLElement>("[style]")).filter((element) => element.style.gridTemplateColumns.includes("min(100%"));
    expect(responsive.length).toBeGreaterThanOrEqual(2);
    expect(view.querySelector('[style*="min-width"]')).toBeNull();
  });
});
