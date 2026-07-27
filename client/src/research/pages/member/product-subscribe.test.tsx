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
});
