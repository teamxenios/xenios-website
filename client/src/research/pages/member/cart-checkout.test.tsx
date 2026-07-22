// @vitest-environment jsdom
// Cart and checkout page behavior against the FROZEN commerce contract:
// honest null-price copy (never $0.00), per-line blocked reasons rendered
// through the designed denial copy, checkoutReady as the ONLY gate on the
// checkout control, and a checkout submit that routes on the machine code:
// ok -> confirmation, commerce_disabled -> the canonical calm pending state
// with the form values retained, large_order_review_required -> the
// pending-review notice with NO error styling (the order exists). fetch is
// stubbed with json content-type headers, matching the api lib's envelope
// parsing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import Cart from "./Cart";
import Checkout from "./Checkout";
import type { CartDto, StoreCreditDto } from "@shared/research/commerce-api";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

// Only the fields the pages read need real values (test-only cast, same
// pattern as persona-states.test.tsx).
function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

type StubRoute = {
  method: string;
  path: string;
  status: number;
  body: unknown;
};

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

async function renderPage(node: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={fixtureContext()}>{node}</ResearchContext.Provider>);
  });
  // One more flush so the load effect's fetch promises settle into state.
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const blockedCart: CartDto = {
  lines: [
    {
      sku: "XN-01",
      displayName: "Peptide A",
      quantity: 2,
      purchaseMode: "one_time",
      unitPriceCents: 6900,
      lineTotalCents: 13800,
      blockedReason: null,
    },
    {
      sku: "XN-02",
      displayName: "Peptide B",
      quantity: 1,
      purchaseMode: "subscription",
      subscriptionFrequencyDays: 30,
      unitPriceCents: null,
      lineTotalCents: null,
      blockedReason: "unconfirmed_supplier_facts",
    },
  ],
  shipmentGroups: [
    { owner: "mitch", skus: ["XN-01"] },
    { owner: "xenios", skus: ["XN-02"] },
  ],
  subtotalCents: 13800,
  shippingCents: 1295,
  storeCreditAppliedCents: 0,
  estimatedTotalCents: 15095,
  checkoutReady: false,
  blockingReasons: ["commerce_disabled", "unconfirmed_supplier_facts"],
  requiredAgreements: ["research_terms_v1"],
};

const readyCart: CartDto = {
  lines: [
    {
      sku: "XN-01",
      displayName: "Peptide A",
      quantity: 2,
      purchaseMode: "one_time",
      unitPriceCents: 6900,
      lineTotalCents: 13800,
      blockedReason: null,
    },
  ],
  shipmentGroups: [{ owner: "xenios", skus: ["XN-01"] }],
  subtotalCents: 13800,
  shippingCents: 1295,
  storeCreditAppliedCents: 0,
  estimatedTotalCents: 15095,
  checkoutReady: true,
  blockingReasons: [],
  requiredAgreements: ["research_terms_v1"],
};

const storeCredit: StoreCreditDto = { spendableCents: 2500, pendingCents: 500, entries: [] };

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

describe("Cart page", () => {
  it("renders null prices as the honest copy, blocked reasons as designed copy, and disables checkout when not ready", async () => {
    stubFetch([{ method: "GET", path: "/api/research/cart", status: 200, body: { ok: true, cart: blockedCart } }]);
    const view = await renderPage(<Cart />);

    // Null price copy, never $0.00 and never blank.
    expect(view.textContent).toContain("Pricing not yet confirmed");
    expect(view.textContent).not.toContain("$0.00");

    // The priced line still shows real money.
    expect(view.textContent).toContain("$138.00");

    // The per-line blocked reason renders OUR designed copy, not a raw code.
    expect(view.textContent).toContain("Awaiting supplier confirmation.");
    expect(view.textContent).not.toContain("unconfirmed_supplier_facts");

    // ONE shipping figure for the whole order, even with two shipment groups.
    expect(byTestId(view, "cart-shipping").textContent).toContain("$12.95");
    expect(view.textContent).not.toContain("$25.90");
    expect(view.textContent).toContain("shipping is charged once");

    // checkoutReady=false disables the continue control with honest reasons.
    const continueControl = byTestId<HTMLButtonElement>(view, "continue-to-checkout");
    expect(continueControl.tagName).toBe("BUTTON");
    expect(continueControl.disabled).toBe(true);
    const blockers = byTestId(view, "checkout-blockers");
    expect(blockers.textContent).toContain("Ordering is not open yet.");
    expect(blockers.textContent).toContain("Awaiting supplier confirmation.");

    // The agreements heads-up names what checkout will ask.
    expect(view.textContent).toContain("Checkout will ask you to accept:");
    // Opaque agreement keys render as readable names, since the contract
    // publishes no member-facing labels for them yet.
    expect(view.textContent).toContain("Research terms v1");
  });

  it("renders the continue control as a link to checkout when checkoutReady is true", async () => {
    stubFetch([{ method: "GET", path: "/api/research/cart", status: 200, body: { ok: true, cart: readyCart } }]);
    const view = await renderPage(<Cart />);
    const continueControl = byTestId<HTMLAnchorElement>(view, "continue-to-checkout");
    expect(continueControl.tagName).toBe("A");
    expect(continueControl.getAttribute("href")).toBe("/research/member/checkout");
  });

  it("shows the designed empty state linking to products for an empty cart", async () => {
    stubFetch([
      {
        method: "GET",
        path: "/api/research/cart",
        status: 200,
        body: { ok: true, cart: { ...readyCart, lines: [], shipmentGroups: [], checkoutReady: false } },
      },
    ]);
    const view = await renderPage(<Cart />);
    expect(view.textContent).toContain("Your cart is empty.");
    expect(view.querySelector('[data-testid="ra-empty"] a[href="/research/member/products"]')).toBeTruthy();
  });

  it("routes a denied cart read (403 + machine code) to the designed denial copy", async () => {
    stubFetch([
      {
        method: "GET",
        path: "/api/research/cart",
        status: 403,
        body: { ok: false, code: "membership_inactive" },
      },
    ]);
    const view = await renderPage(<Cart />);
    expect(view.textContent).toContain("Membership is not active.");
    expect(view.textContent).not.toContain("membership_inactive");
  });
});

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

async function renderCheckoutWithSubmit(checkout: { status: number; body: unknown }) {
  const calls = stubFetch([
    { method: "GET", path: "/api/research/cart", status: 200, body: { ok: true, cart: readyCart } },
    { method: "GET", path: "/api/research/store-credit", status: 200, body: { ok: true, storeCredit } },
    { method: "POST", path: "/api/research/checkout", status: checkout.status, body: checkout.body },
  ]);
  const view = await renderPage(<Checkout />);

  await act(async () => {
    setValue(byTestId<HTMLInputElement>(view, "co-line1"), "1 Research Way");
    setValue(byTestId<HTMLInputElement>(view, "co-city"), "Austin");
    setValue(byTestId<HTMLInputElement>(view, "co-state"), "TX");
    setValue(byTestId<HTMLInputElement>(view, "co-postal"), "78701");
  });
  await act(async () => {
    byTestId<HTMLInputElement>(view, "co-agree-research_terms_v1").click();
  });
  await act(async () => {
    byTestId<HTMLInputElement>(view, "co-attest").click();
  });
  await act(async () => {
    byTestId<HTMLButtonElement>(view, "co-submit").click();
  });

  return { view, calls };
}

function checkoutBodies(calls: RecordedCall[]): Array<Record<string, unknown>> {
  return calls
    .filter((c) => c.url === "/api/research/checkout")
    .map((c) => JSON.parse(String(c.init?.body)) as Record<string, unknown>);
}

describe("Checkout page", () => {
  it("renders the canonical commerce_disabled state and keeps the form values", async () => {
    const { view, calls } = await renderCheckoutWithSubmit({
      status: 403,
      body: { ok: false, code: "commerce_disabled", message: "server text that must not lead" },
    });

    // The canonical copy, ours, calm, pending tone (a status, not an alert).
    expect(view.textContent).toContain("Ordering is not open yet.");
    expect(view.textContent).toContain(
      "Nothing you entered was lost. Ordering opens once commerce is switched on, and this exact flow will work unchanged.",
    );
    const denial = view.querySelector('[data-testid="ra-denial"]');
    expect(denial).toBeTruthy();
    expect(denial!.getAttribute("role")).toBe("status");

    // The form is retained and still editable.
    expect(byTestId<HTMLInputElement>(view, "co-line1").value).toBe("1 Research Way");
    expect(byTestId<HTMLInputElement>(view, "co-postal").value).toBe("78701");
    expect(byTestId<HTMLButtonElement>(view, "co-submit").disabled).toBe(false);

    // A retry reuses the SAME idempotency key (no success has happened).
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "co-submit").click();
    });
    const bodies = checkoutBodies(calls);
    expect(bodies).toHaveLength(2);
    expect(typeof bodies[0].idempotencyKey).toBe("string");
    expect(bodies[1].idempotencyKey).toBe(bodies[0].idempotencyKey);
  });

  it("presents large_order_review_required as a pending review, not an error", async () => {
    const { view } = await renderCheckoutWithSubmit({
      status: 200,
      body: { ok: false, code: "large_order_review_required" },
    });

    expect(view.textContent).toContain("Order received, pending review.");
    expect(view.textContent).toContain(
      "Large orders get a personal review before processing. Typical turnaround is about two hours.",
    );

    // Success-adjacent: no error styling anywhere, and a route to orders.
    expect(view.querySelector('[role="alert"]')).toBeNull();
    const held = view.querySelector('[data-testid="checkout-held"]');
    expect(held).toBeTruthy();
    expect(held!.getAttribute("role")).toBe("status");
    expect(held!.querySelector('a[href="/research/member/orders"]')).toBeTruthy();
  });

  it("shows the confirmation with the order id and a link to orders on ok", async () => {
    const { view, calls } = await renderCheckoutWithSubmit({
      status: 200,
      body: {
        ok: true,
        order: {
          orderId: "ord-1042",
          state: "checkout_pending",
          placedAt: "2026-07-21T00:00:00Z",
          totalCents: 15095,
          shipments: [],
        },
      },
    });

    const confirmation = view.querySelector('[data-testid="checkout-confirmation"]');
    expect(confirmation).toBeTruthy();
    expect(confirmation!.textContent).toContain("Order ord-1042 was placed.");
    expect(confirmation!.querySelector('a[href="/research/member/orders"]')).toBeTruthy();

    // The submitted request carried the agreements and the attestation.
    const bodies = checkoutBodies(calls);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].acceptedAgreementKeys).toEqual(["research_terms_v1"]);
    expect(bodies[0].researchAttestation).toBe(true);
    expect(bodies[0].shippingAddress).toEqual({
      line1: "1 Research Way",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
    });
  });

  it("renders any other denial code through the designed copy with the form still editable", async () => {
    const { view } = await renderCheckoutWithSubmit({
      status: 200,
      body: { ok: false, code: "state_not_serviceable" },
    });
    expect(view.textContent).toContain("We cannot ship to that state yet.");
    expect(view.textContent).not.toContain("state_not_serviceable");
    expect(byTestId<HTMLInputElement>(view, "co-line1").value).toBe("1 Research Way");
    expect(byTestId<HTMLButtonElement>(view, "co-submit").disabled).toBe(false);
  });

  it("quotes shipping through the live POST /api/research/shipping/quote with the entered address", async () => {
    const calls = stubFetch([
      { method: "GET", path: "/api/research/cart", status: 200, body: { ok: true, cart: readyCart } },
      { method: "GET", path: "/api/research/store-credit", status: 200, body: { ok: true, storeCredit } },
      {
        method: "POST",
        path: "/api/research/shipping/quote",
        status: 200,
        body: {
          ok: true,
          quote: {
            service: "expedited_2day",
            amountCents: 2450,
            estimatedDeliveryRange: { earliestDays: 2, latestDays: 3 },
            disclosure: "Quoted for this address and service.",
          },
        },
      },
    ]);
    const view = await renderPage(<Checkout />);

    // The quote control is honestly disabled until the address is complete.
    expect(byTestId<HTMLButtonElement>(view, "co-quote").disabled).toBe(true);

    await act(async () => {
      setValue(byTestId<HTMLInputElement>(view, "co-line1"), "1 Research Way");
      setValue(byTestId<HTMLInputElement>(view, "co-city"), "Austin");
      setValue(byTestId<HTMLInputElement>(view, "co-state"), "TX");
      setValue(byTestId<HTMLInputElement>(view, "co-postal"), "78701");
      setValue(byTestId<HTMLSelectElement>(view, "co-service"), "expedited_2day");
    });
    expect(byTestId<HTMLButtonElement>(view, "co-quote").disabled).toBe(false);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "co-quote").click();
    });

    const quoteCall = calls.find((c) => c.url === "/api/research/shipping/quote");
    expect(quoteCall).toBeTruthy();
    expect(JSON.parse(String(quoteCall!.init?.body))).toEqual({
      destination: { line1: "1 Research Way", city: "Austin", state: "TX", postalCode: "78701", country: "US" },
      service: "expedited_2day",
    });

    const result = byTestId(view, "co-quote-result");
    expect(result.textContent).toContain("$24.50");
    expect(result.textContent).toContain("Estimated 2 to 3 days.");
    expect(result.textContent).toContain("Quoted for this address and service.");
  });

  it("routes a denied quote (address_invalid) through the designed denial copy", async () => {
    stubFetch([
      { method: "GET", path: "/api/research/cart", status: 200, body: { ok: true, cart: readyCart } },
      { method: "GET", path: "/api/research/store-credit", status: 200, body: { ok: true, storeCredit } },
      {
        method: "POST",
        path: "/api/research/shipping/quote",
        status: 400,
        body: { ok: false, code: "address_invalid", message: "raw server text" },
      },
    ]);
    const view = await renderPage(<Checkout />);

    await act(async () => {
      setValue(byTestId<HTMLInputElement>(view, "co-line1"), "1 Research Way");
      setValue(byTestId<HTMLInputElement>(view, "co-city"), "Austin");
      setValue(byTestId<HTMLInputElement>(view, "co-state"), "ZZ");
      setValue(byTestId<HTMLInputElement>(view, "co-postal"), "00000");
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "co-quote").click();
    });

    const denial = view.querySelector('[data-testid="ra-denial"]');
    expect(denial).toBeTruthy();
    expect(view.textContent).not.toContain("raw server text");
    expect(view.querySelector('[data-testid="co-quote-result"]')).toBeNull();
  });

  it("surfaces store credit with the canonical labels and bounds the applied amount", async () => {
    stubFetch([
      { method: "GET", path: "/api/research/cart", status: 200, body: { ok: true, cart: readyCart } },
      { method: "GET", path: "/api/research/store-credit", status: 200, body: { ok: true, storeCredit } },
    ]);
    const view = await renderPage(<Checkout />);
    expect(view.textContent).toContain("Available now");
    expect(view.textContent).toContain("$25.00");
    expect(view.textContent).toContain("Pending review");
    expect(view.textContent).toContain("$5.00");

    // An entry above the spendable balance is clamped to it.
    await act(async () => {
      setValue(byTestId<HTMLInputElement>(view, "co-credit"), "100");
    });
    expect(view.textContent).toContain("Applying $25.00");
  });
});
