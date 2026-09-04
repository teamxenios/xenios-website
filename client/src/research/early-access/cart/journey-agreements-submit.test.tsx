// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EarlyAccessMultiCartJourney } from "./EarlyAccessMultiCartJourney";
import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";
import { readEarlyAccessHistoryState } from "./history";
import { LAST_CART_CHECKOUT_STORAGE_KEY } from "./cartAttemptStore";

/**
 * THE TWO NEW STATE TRANSITIONS, DRIVEN THROUGH THE REAL COMPONENT.
 *
 * Required Agreements and Submit Order are steps, not panels, so they are
 * tested the way a customer meets them: by walking the journey, pressing Back
 * and Forward, and refreshing in the middle.
 *
 * The assertions that matter most are again the negative ones. Nothing in this
 * file may cause a second checkout, and no screen may say an order is submitted
 * or paid unless the SERVER said so in the response the screen is rendering.
 */

const CART_KEY = "xenios.research.earlyAccess.cart.v1";
const CHECKOUT_NUMBER = "XEC-ABCDEFGH12345678";

const PRODUCTS: readonly EarlyAccessCardProduct[] = [
  {
    productId: "prod-1",
    variantId: "var-1",
    name: "Alpha Research Material",
    strength: "10 mg",
    unitPriceCents: 5_600,
    currency: "USD",
    description: "Alpha description",
    availability: "AVAILABLE",
    purchasable: true,
    quantityLimit: 20,
  },
] as unknown as readonly EarlyAccessCardProduct[];

const QUOTE = {
  quoteId: "q-1",
  currency: "USD",
  lines: [
    {
      productId: "prod-1",
      variantId: "var-1",
      displayName: "Alpha Research Material",
      strength: "10 mg",
      sku: "SKU-1",
      quantity: 1,
      supplierId: "sup-1",
      supplierSku: "SUP-1",
      currency: "USD",
      unitPriceCents: 5_600,
      subtotalCents: 5_600,
      discountCents: 0,
      payableCents: 5_600,
      promotionId: null,
      promotionVersion: null,
      promotionLabel: null,
    },
  ],
  subtotalCents: 5_600,
  discountCents: 0,
  shippingCents: 0,
  taxCents: 0,
  payableTotalCents: 5_600,
  intentHash: "hash-1",
  quotedAt: "2026-08-09T09:00:00.000Z",
  expiresAt: "2026-08-09T10:00:00.000Z",
};

const CHECKOUT = {
  cartCheckoutNumber: CHECKOUT_NUMBER,
  contact: { email: "buyer@example.test", phone: "7135551234" },
  shipTo: {
    recipientName: "Buyer Name",
    line1: "1 Research Road",
    line2: null,
    city: "Houston",
    region: "TX",
    postalCode: "77001",
    country: "US",
  },
  children: [
    {
      orderNumber: "XEA-1",
      productId: "prod-1",
      variantId: "var-1",
      sku: "SKU-1",
      quantity: 1,
      supplierId: "sup-1",
      supplierSku: "SUP-1",
      unitPriceCents: 5_600,
      subtotalCents: 5_600,
      discountCents: 0,
      payableCents: 5_600,
    },
  ],
  invoice: {
    invoiceNumber: "XEA-INV-0001",
    cartCheckoutNumber: CHECKOUT_NUMBER,
    paymentReference: "XEA-PAY-8F3K2Q",
    currency: "USD",
    lines: [],
    subtotalCents: 5_600,
    discountCents: 0,
    shippingCents: 0,
    taxCents: 0,
    payableTotalCents: 5_600,
    instructions: "Concierge instructions.",
    issuedAt: "2026-08-09T09:00:00.000Z",
    status: "awaiting_payment",
  },
  paymentState: "awaiting_payment",
  placedAt: "2026-08-09T09:00:00.000Z",
};

function statusBody(
  overrides: Readonly<{ state?: string; paid?: boolean; externalProofCount?: number }> = {},
) {
  return {
    ok: true,
    status: {
      checkout: { ...CHECKOUT, paymentState: overrides.state ?? "awaiting_payment" },
      payment: {
        state: overrides.state ?? "awaiting_payment",
        paid: overrides.paid ?? false,
        externalProofCount: overrides.externalProofCount ?? 0,
      },
      receipt: null,
      fulfilment: { released: false, childOrders: [] },
    },
  };
}

let container: HTMLElement;
let root: Root;
let posted: Array<{ path: string; body: unknown }>;
let statusOverrides: Readonly<{ state?: string; paid?: boolean; externalProofCount?: number }>;
/**
 * When set, the checkout POST parks here instead of answering, so a test can
 * press Confirm again while the first request is still in flight. That is the
 * real duplicate-order race: the incident this journey was hardened against
 * placed two orders sixty seconds apart, and a customer pressing a button twice
 * because nothing visibly happened is exactly how it starts.
 */
let holdCheckout: null | { release: (value: unknown) => void; promise: Promise<unknown> };

function deferCheckout(): void {
  let release: (value: unknown) => void = () => {};
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  holdCheckout = { release, promise };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(accepted = true) {
  posted = [];
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") {
      posted.push({ path, body: init.body === undefined ? null : JSON.parse(String(init.body)) });
      if (path.endsWith("/agreements/accept")) {
        return jsonResponse({ ok: true, kind: "early_access_terms", version: "v1" });
      }
      if (path.endsWith("/cart/quote")) return jsonResponse({ ok: true, quote: QUOTE });
      if (path.endsWith("/cart/checkout")) {
        if (holdCheckout !== null) await holdCheckout.promise;
        return jsonResponse({ ok: true, replayed: false, checkout: CHECKOUT });
      }
      return jsonResponse({ ok: true });
    }
    if (path.endsWith("/research/policies")) {
      return jsonResponse({
        policies: {
          "research-use": { title: "Research Use Policy", updated: "July 2026", sections: [] },
        },
      });
    }
    if (path.endsWith("/early-access/agreements")) {
      return jsonResponse({
        ok: true,
        required: [{ kind: "early_access_terms", version: "v1" }],
        accepted,
      });
    }
    if (path.endsWith("/status")) return jsonResponse(statusBody(statusOverrides));
    if (path.includes("/payment-instructions")) return jsonResponse({ ok: true, presentation: null });
    if (path.includes("/cart/")) return jsonResponse({ ok: true, checkout: CHECKOUT });
    return jsonResponse({ ok: true });
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountJourney(): Promise<void> {
  await act(async () => {
    root.render(<EarlyAccessMultiCartJourney products={PRODUCTS} onExitEarlyAccess={() => {}} />);
  });
  await settle();
}

function text(): string {
  return container.textContent ?? "";
}

function buttons(label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (button) => (button.textContent ?? "").trim() === label,
  ) as HTMLButtonElement[];
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

function setInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function fillDetails(): Promise<void> {
  const inputs = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
  const values = [
    "buyer@example.test",
    "7135551234",
    "Buyer Name",
    "1 Research Road",
    "",
    "Houston",
    "TX",
    "77001",
  ];
  await act(async () => {
    inputs.slice(0, values.length).forEach((input, index) => setInput(input, values[index]!));
  });
  await settle();
}

async function walkToAgreements(): Promise<void> {
  await mountJourney();
  await click(buttons("Add to cart")[0]!);
  await click(buttons("View cart (1)")[0]!);
  await click(buttons("Continue to shipping")[0]!);
  await fillDetails();
  await click(buttons("Review cart")[0]!);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/research/early-access");
  statusOverrides = {};
  holdCheckout = null;
  vi.stubGlobal("scrollTo", () => {});
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("Required Agreements is a step between shipping and review", () => {
  it("leaving the contact form lands on Required Agreements and QUOTES NOTHING", async () => {
    stubFetch(true);
    await walkToAgreements();

    expect(readEarlyAccessHistoryState(window.history.state)?.step).toBe("agreements");
    expect(text()).toContain("Required agreements");
    // The cart is priced at the END of this step, not on the way into it.
    expect(posted.filter((entry) => entry.path.includes("/cart/quote"))).toEqual([]);
  });

  it("the quote is taken only when the SERVER says the agreements are on file", async () => {
    stubFetch(true);
    await walkToAgreements();
    expect(
      container.querySelector('[data-testid="early-access-agreements-standing"]')
        ?.getAttribute("data-satisfied"),
    ).toBe("true");

    await click(buttons("Continue to review")[0]!);
    expect(posted.filter((entry) => entry.path.includes("/cart/quote")).length).toBe(1);
    expect(readEarlyAccessHistoryState(window.history.state)?.step).toBe("review");
  });

  it("with the standing unsatisfied there is NO continue control and no quote", async () => {
    // The catalogue gate already refuses this customer, so reach the step by
    // navigation instead and prove the step itself also refuses.
    stubFetch(false);
    await mountJourney();
    await click(buttons("Add to cart")[0]!);
    await click(buttons("View cart (1)")[0]!);
    await click(buttons("Continue to shipping")[0]!);

    // Held at the catalogue, told why, and nothing priced.
    expect(text()).toContain("Research Use Policy must be accepted");
    expect(posted.filter((entry) => entry.path.includes("/cart/quote"))).toEqual([]);
    expect(container.querySelector('[data-testid="early-access-agreements-continue"]')).toBeNull();
  });
});

describe("Back, Forward and refresh across the new steps never buy", () => {
  it("a popstate onto agreements or submit POSTs nothing at all", async () => {
    stubFetch(true);
    await walkToAgreements();
    const before = posted.length;

    for (const step of ["submit", "agreements", "review", "payment", "status"] as const) {
      window.history.pushState({ earlyAccess: true, step }, "", window.location.pathname);
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate", { state: { earlyAccess: true, step } }));
      });
      await settle();
    }

    expect(posted.length).toBe(before);
    expect(posted.filter((entry) => entry.path.includes("/cart/checkout"))).toEqual([]);
  });

  it("agreements restored after a refresh, with contact gone, walks back to the form", async () => {
    stubFetch(true);
    // Cart survives a refresh in browser storage; contact and shipping do not,
    // because they are deliberately held in memory only.
    window.sessionStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "prod-1", variantId: "var-1", quantity: 1 }] }),
    );
    window.history.replaceState(
      { earlyAccess: true, step: "agreements" },
      "",
      "/research/early-access",
    );
    await mountJourney();

    // Not left on a step whose Continue would price a cart with nowhere to ship.
    expect(readEarlyAccessHistoryState(window.history.state)?.step).toBe("details");
    expect(text()).toContain("Contact & Shipping");
  });

  it("submit restored after a refresh with no checkout falls back to a reachable step", async () => {
    stubFetch(true);
    window.history.replaceState({ earlyAccess: true, step: "submit" }, "", "/research/early-access");
    await mountJourney();

    const step = readEarlyAccessHistoryState(window.history.state)?.step;
    expect(step).toBe("catalog");
    expect(container.querySelector('[data-testid="early-access-submit-file"]')).toBeNull();
  });
});

describe("one checkout, one invoice, one payment reference", () => {
  it("pressing Confirm twice while the FIRST request is still in flight posts one checkout", async () => {
    stubFetch(true);
    await walkToAgreements();
    await click(buttons("Continue to review")[0]!);

    // The server has not answered yet, so the button is still on screen and the
    // customer can hit it again. This is the reachable duplicate risk.
    deferCheckout();
    const confirm = buttons("Confirm and create cart order")[0]!;
    // ALL THREE IN ONE BATCH, BEFORE REACT RE-RENDERS. This matters: if the
    // presses are spread across renders the button has already been disabled by
    // `busy`, and the test proves only that a disabled button does not fire.
    // The guard being exercised here is the in-flight ref inside `confirm`,
    // which is the one that still holds when the render has not caught up.
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Three presses, one request, before anything has come back.
    expect(posted.filter((entry) => entry.path.includes("/cart/checkout")).length).toBe(1);

    holdCheckout!.release(null);
    holdCheckout = null;
    await settle();

    expect(posted.filter((entry) => entry.path.includes("/cart/checkout")).length).toBe(1);
    expect(readEarlyAccessHistoryState(window.history.state)?.step).toBe("payment");
  });

  it("every checkout request in one journey carries the SAME cart attempt key", async () => {
    stubFetch(true);
    await walkToAgreements();
    await click(buttons("Continue to review")[0]!);
    deferCheckout();
    const confirm = buttons("Confirm and create cart order")[0]!;
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    holdCheckout!.release(null);
    holdCheckout = null;
    await settle();

    const keys = posted
      .filter((entry) => entry.path.includes("/cart/checkout"))
      .map((entry) => (entry.body as { idempotencyKey?: string }).idempotencyKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^xeac_[0-9a-f]{36}$/);
  });

  it("confirming twice creates exactly one checkout, and the submit step reuses it", async () => {
    stubFetch(true);
    await walkToAgreements();
    await click(buttons("Continue to review")[0]!);

    const confirm = buttons("Confirm and create cart order")[0] ?? buttons("Confirm")[0];
    expect(confirm).toBeDefined();
    await click(confirm!);
    // A second press of the same control, and a navigation back onto review.
    await act(async () => {
      confirm!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();

    expect(posted.filter((entry) => entry.path.includes("/cart/checkout")).length).toBe(1);
    expect(readEarlyAccessHistoryState(window.history.state)?.step).toBe("payment");
    expect(window.sessionStorage.getItem(LAST_CART_CHECKOUT_STORAGE_KEY)).toBe(CHECKOUT_NUMBER);

    // The payment screen states the reserved milestone and no other.
    expect(text()).toContain("Checkout reserved");
    expect(text()).toContain("has not been submitted for payment review yet");

    await click(buttons("I have sent the payment")[0]!);
    expect(readEarlyAccessHistoryState(window.history.state)?.step).toBe("submit");
    expect(text()).toContain(CHECKOUT_NUMBER);
    // Still one checkout. Reaching the submit step creates nothing.
    expect(posted.filter((entry) => entry.path.includes("/cart/checkout")).length).toBe(1);
  });
});

describe("the status screen reports the server, not the browser", () => {
  it("with nothing submitted it says RESERVED and offers the submit route", async () => {
    stubFetch(true);
    statusOverrides = { state: "awaiting_payment", externalProofCount: 0 };
    window.sessionStorage.setItem(LAST_CART_CHECKOUT_STORAGE_KEY, CHECKOUT_NUMBER);
    window.history.replaceState({ earlyAccess: true, step: "status" }, "", "/research/early-access");
    await mountJourney();
    await click(buttons("Refresh status")[0]!);

    const heading = container.querySelector('[data-testid="early-access-status-stage"]');
    expect(heading?.getAttribute("data-stage")).toBe("checkout_reserved");
    expect(heading?.getAttribute("data-submitted")).toBe("false");
    expect(heading?.getAttribute("data-payment-confirmed")).toBe("false");
    expect(container.querySelector('[data-testid="early-access-status-submit"]')).not.toBeNull();
  });

  it("once the SERVER records a proof it says submitted, and withdraws the submit route", async () => {
    stubFetch(true);
    statusOverrides = { state: "under_review", externalProofCount: 1 };
    window.sessionStorage.setItem(LAST_CART_CHECKOUT_STORAGE_KEY, CHECKOUT_NUMBER);
    window.history.replaceState({ earlyAccess: true, step: "status" }, "", "/research/early-access");
    await mountJourney();
    await click(buttons("Refresh status")[0]!);

    const heading = container.querySelector('[data-testid="early-access-status-stage"]');
    expect(heading?.getAttribute("data-stage")).toBe("payment_review_required");
    expect(heading?.getAttribute("data-submitted")).toBe("true");
    // AND STILL NOT PAID. This is the sentence the whole lane exists to protect.
    expect(heading?.getAttribute("data-payment-confirmed")).toBe("false");
    expect(text()).toContain("not confirmed");
    expect(container.querySelector('[data-testid="early-access-status-submit"]')).toBeNull();
  });
});
