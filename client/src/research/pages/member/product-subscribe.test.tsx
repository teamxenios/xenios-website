// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "wouter";
import { ResearchContext, type ResearchContextValue } from "../../core";
import ProductPage from "./ProductPage";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function context(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  } as Response;
}

function detail(slug: string, displayName: string) {
  return {
    ok: true,
    product: {
      id: `id-${slug}`,
      slug,
      displayName,
      canonicalName: displayName,
      aliases: [],
      lane: "research_material",
      category: "Research",
      classification: "Research material",
      summary: "Reviewed Research information.",
      displayState: "unavailable",
      media: null,
      price: null,
      readiness: null,
      selection: null,
      variantCount: 0,
      updatedAt: "2026-07-27T12:00:00.000Z",
      audience: "member",
      currency: "USD",
      evaluatedAt: "2026-07-27T12:00:00.000Z",
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      reviewDate: null,
      variants: [],
      relatedProducts: [],
      researchOnlyBoundary: true,
    },
  };
}

describe("member Product Control detail integration", () => {
  it("uses only the private member catalog endpoint and renders no purchase control when unavailable", async () => {
    const fetch = vi.fn(async () => ({
      status: 503,
      ok: false,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        ok: false,
        code: "member_catalog_unavailable",
      }),
    }));
    vi.stubGlobal("fetch", fetch);
    window.history.pushState({}, "", "/research/member/products/xn-01");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <ResearchContext.Provider value={context()}>
          <Route
            path="/research/member/products/:slug"
            component={ProductPage}
          />
        </ResearchContext.Provider>,
      );
    });
    await act(async () => {});

    expect(fetch).toHaveBeenCalledWith(
      "/api/research/member/products/xn-01",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer member-jwt",
        }),
      }),
    );
    expect(container.textContent).toContain("This product is not available.");
    expect(container.querySelector('[data-testid="ra-purchase-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="ra-subscribe-now"]')).toBeNull();
  });

  it("keeps the current slug when an earlier detail response finishes late", async () => {
    let finishFirst!: (value: Response) => void;
    const first = new Promise<Response>((resolve) => {
      finishFirst = resolve;
    });
    const fetch = vi.fn((input: RequestInfo | URL) =>
      String(input).endsWith("/product-a")
        ? first
        : Promise.resolve(jsonResponse(200, detail("product-b", "Beta Research"))),
    );
    vi.stubGlobal("fetch", fetch);
    window.history.pushState({}, "", "/research/member/products/product-a");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <ResearchContext.Provider value={context()}>
          <Route
            path="/research/member/products/:slug"
            component={ProductPage}
          />
        </ResearchContext.Provider>,
      );
    });
    await act(async () => {
      window.history.pushState({}, "", "/research/member/products/product-b");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {});
    expect(container.textContent).toContain("Beta Research");

    await act(async () => {
      finishFirst(jsonResponse(200, detail("product-a", "Alpha Research")));
    });
    expect(container.textContent).toContain("Beta Research");
    expect(container.textContent).not.toContain("Alpha Research");
  });

  it("rejects a detail projection whose normalized slug differs from the route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, detail("product-a", "Substituted Product")),
      ),
    );
    window.history.pushState({}, "", "/research/member/products/product-b");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <ResearchContext.Provider value={context()}>
          <Route
            path="/research/member/products/:slug"
            component={ProductPage}
          />
        </ResearchContext.Provider>,
      );
    });
    await act(async () => {});
    expect(container.textContent).toContain("This product is not available.");
    expect(container.textContent).not.toContain("Substituted Product");
  });
});
