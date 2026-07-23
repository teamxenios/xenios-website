// @vitest-environment jsdom
// Product page subscription creation against the LIVE contract
// (POST /api/research/subscriptions). Covered: the direct "Start subscription"
// path exists only in subscription mode, posts the server's exact wire shape
// (sku, quantity, frequencyDays, priceVersion presented), renders the honest
// pending-confirmation success (nothing is charged on creation), and routes a
// denial on the machine code. presentedPriceVersion records what the member
// actually saw, including the unconfirmed-price case.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { Route } from "wouter";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import ProductPage, { presentedPriceVersion } from "./ProductPage";
import type { ProductDetailDto } from "@shared/research/commerce-api";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

type StubRoute = { method: string; path: string; status: number; body: unknown };
type RecordedCall = { url: string; init: RequestInit | undefined };

function stubFetch(routes: StubRoute[]): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const method = (init?.method ?? "GET").toUpperCase();
      const route = routes.find((r) => r.method === method && r.path === url);
      if (!route) throw new TypeError(`unstubbed fetch: ${method} ${url}`);
      return {
        status: route.status,
        ok: route.status >= 200 && route.status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => route.body,
      };
    }),
  );
  return calls;
}

async function renderProductPage(): Promise<HTMLDivElement> {
  window.history.pushState({}, "", "/research/member/products/xn-01");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={fixtureContext()}>
        <Route path="/research/member/products/:slug" component={ProductPage} />
      </ResearchContext.Provider>,
    );
  });
  await act(async () => {});
  return container!;
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

const product: ProductDetailDto = {
  sku: "XN-01",
  slug: "xn-01",
  displayName: "Peptide A",
  lane: "supplement",
  availability: "in_stock",
  purchasable: true,
  priceCents: 6900,
  goalMappings: [],
  guideState: "guide_published",
  relatedGuideSlugs: [],
  confirmedFacts: {},
  unavailableReason: null,
  prohibitedClaims: [],
  faq: [],
};

const PRODUCT_ROUTE: StubRoute = {
  method: "GET",
  path: "/api/research/products/xn-01",
  status: 200,
  body: { ok: true, product },
};

describe("presentedPriceVersion", () => {
  it("records the confirmed price in cents, and says so plainly when unconfirmed", () => {
    expect(presentedPriceVersion(6900)).toBe("cents-6900");
    expect(presentedPriceVersion(0)).toBe("cents-0");
    expect(presentedPriceVersion(null)).toBe("price-unconfirmed");
  });
});

describe("ProductPage subscription creation", () => {
  it("shows the direct create control only in subscription mode", async () => {
    stubFetch([PRODUCT_ROUTE]);
    const view = await renderProductPage();

    // One-time mode: no direct-subscription control exists.
    expect(view.querySelector('[data-testid="ra-subscribe-now"]')).toBeNull();

    await act(async () => {
      setValue(byTestId<HTMLSelectElement>(view, "ra-add-mode"), "subscription");
    });
    expect(view.querySelector('[data-testid="ra-subscribe-now"]')).not.toBeNull();
  });

  it("posts the server's exact wire shape and renders the pending-confirmation success", async () => {
    const calls = stubFetch([
      PRODUCT_ROUTE,
      {
        method: "POST",
        path: "/api/research/subscriptions",
        status: 200,
        body: {
          ok: true,
          subscription: {
            subscriptionId: "sub-9",
            sku: "XN-01",
            displayName: "Peptide A",
            state: "pending",
            frequencyDays: 60,
            quantity: 2,
            nextChargeAt: null,
            nextShipmentAt: null,
          },
        },
      },
    ]);
    const view = await renderProductPage();

    await act(async () => {
      setValue(byTestId<HTMLSelectElement>(view, "ra-add-mode"), "subscription");
    });
    await act(async () => {
      setValue(byTestId<HTMLInputElement>(view, "ra-add-quantity"), "2");
      setValue(byTestId<HTMLSelectElement>(view, "ra-add-frequency"), "60");
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "ra-subscribe-now").click();
    });

    const post = calls.find((c) => c.url === "/api/research/subscriptions");
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post!.init?.body))).toEqual({
      sku: "XN-01",
      quantity: 2,
      frequencyDays: 60,
      priceVersion: "cents-6900",
    });

    const success = byTestId(view, "ra-subscribe-success");
    expect(success.textContent).toContain("pending");
    expect(success.textContent).toContain("nothing has been charged");
    expect(success.querySelector('a[href="/research/member/subscriptions"]')).toBeTruthy();
  });

  it("routes a denied create on the machine code through the designed copy", async () => {
    stubFetch([
      PRODUCT_ROUTE,
      {
        method: "POST",
        path: "/api/research/subscriptions",
        status: 403,
        body: { ok: false, code: "commerce_disabled", message: "raw server text" },
      },
    ]);
    const view = await renderProductPage();

    await act(async () => {
      setValue(byTestId<HTMLSelectElement>(view, "ra-add-mode"), "subscription");
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "ra-subscribe-now").click();
    });

    expect(view.querySelector('[data-testid="ra-denial"]')).toBeTruthy();
    expect(view.textContent).toContain("Ordering is not open yet.");
    expect(view.textContent).not.toContain("raw server text");
    expect(view.querySelector('[data-testid="ra-subscribe-success"]')).toBeNull();
  });

  it("refuses a non-whole quantity before any request is made", async () => {
    const calls = stubFetch([PRODUCT_ROUTE]);
    const view = await renderProductPage();

    await act(async () => {
      setValue(byTestId<HTMLSelectElement>(view, "ra-add-mode"), "subscription");
    });
    await act(async () => {
      setValue(byTestId<HTMLInputElement>(view, "ra-add-quantity"), "0");
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "ra-subscribe-now").click();
    });

    expect(view.textContent).toContain("Enter a whole quantity of at least 1.");
    expect(calls.filter((c) => (c.init?.method ?? "GET").toUpperCase() === "POST")).toHaveLength(0);
  });
});
