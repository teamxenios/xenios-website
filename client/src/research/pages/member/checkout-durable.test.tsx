// @vitest-environment jsdom
// The checkout page over the DURABLE card door: the page is the real
// component; the server is a scripted fetch that answers the real route
// contracts (payment-config, durable submit, continuation status/continue/
// cancel); the provider's browser surfaces are injected doubles. Nothing here
// touches a real provider or the SQL: it proves the page's behaviour against
// the contracts the composition tests prove server-side.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import { __resetCapabilitiesCache } from "../../lib/capabilities";
import type { PaymentMethodCollectorClient } from "../../payments/PaymentMethodCollector";
import type { PaymentAuthenticator } from "../../payments/PaymentAuthenticationStep";
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
  __resetCapabilitiesCache();
  window.sessionStorage.clear();
});

const SCOPE = "a".repeat(64);
const OTHER_SCOPE = "b".repeat(64);
/** The resume pointer's slot for one account scope. */
const RESUME_SLOT = (scope: string) => `xenios.research.checkoutResume.v1.${scope}`;
const resumePointer = (scope = SCOPE) => {
  const raw = window.sessionStorage.getItem(RESUME_SLOT(scope));
  return raw ? (JSON.parse(raw) as { scope: string; requestKey: string; orderId: string | null }) : null;
};
const ORDER = "00000001-0000-4000-8000-000000000000";
const SECRET = "pi_0001_secret_fixture";

function fixtureContext(token = "member-jwt", scope = SCOPE): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null, cartScope: scope },
    memberToken: token,
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

const readyCart: CartDto = {
  lines: [{ sku: "XN-01", displayName: "Peptide A", quantity: 2, purchaseMode: "one_time", unitPriceCents: 6900, lineTotalCents: 13800, blockedReason: null }],
  shipmentGroups: [{ owner: "mitch", skus: ["XN-01"] }],
  subtotalCents: 13800,
  shippingCents: 1295,
  storeCreditAppliedCents: 0,
  estimatedTotalCents: 15095,
  checkoutReady: true,
  blockingReasons: [],
  requiredAgreements: ["research_terms_v1"],
};
const storeCredit: StoreCreditDto = { spendableCents: 20000, pendingCents: 0, entries: [] } as unknown as StoreCreditDto;

type Recorded = { method: string; url: string; token: string | null; body: Record<string, unknown> | null };
type Reply = { status: number; body: unknown };
type Answer = Reply | ((call: Recorded) => Reply | Promise<Reply>);

/**
 * A scripted server keyed by "METHOD url". A route may be a function so a test
 * can sequence answers (first submit: authentication required; continue:
 * completed). Unknown routes are reported loudly.
 */
function server(routes: Record<string, Answer>, options: { config?: Answer; delayMs?: number; cart?: CartDto; dynamic?: (method: string, url: string) => Answer | undefined } = {}) {
  const calls: Recorded[] = [];
  const all: Record<string, Answer> = {
    "GET /api/research/capabilities": { status: 200, body: { ok: true, capabilities: { product_commerce: { enabled: true } } } },
    "GET /api/research/cart": { status: 200, body: { ok: true, cart: options.cart ?? readyCart } },
    "GET /api/research/store-credit": { status: 200, body: { ok: true, storeCredit } },
    "GET /api/research/checkout/payment-config": options.config ?? { status: 200, body: { ok: true, config: { provider: "stripe", publishableKey: "pk_test_abcdefgh12345678", mode: "test" } } },
    // The card door will not let a buyer pay before the exact amount is quoted.
    "POST /api/research/shipping/quote": { status: 200, body: { ok: true, quote: { kind: "configured_standard", service: "standard", amountCents: 1295, estimatedDeliveryRange: null, disclosure: "fixture" } } },
    ...routes,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const call: Recorded = { method, url, token: headers.get("Authorization")?.replace("Bearer ", "") ?? null, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
      calls.push(call);
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      const route = all[`${method} ${url}`] ?? options.dynamic?.(method, url);
      if (!route) throw new TypeError(`unstubbed fetch: ${method} ${url}`);
      const answer = typeof route === "function" ? await route(call) : route;
      return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, headers: new Headers({ "content-type": "application/json" }), json: async () => answer.body };
    }),
  );
  return { calls };
}

/** The provider-hosted card element double: complete at once; tokenizes to a fixed pm_ reference. */
function cardClient(reference = "pm_fixture_card"): PaymentMethodCollectorClient & { collects: number } {
  const client = {
    collects: 0,
    async mount(_container: HTMLElement, onChange: (state: { complete: boolean; error: string | null }) => void) {
      setTimeout(() => onChange({ complete: true, error: null }), 0);
      return {
        collect: async () => {
          client.collects += 1;
          return { ok: true as const, reference };
        },
        unmount() {},
      };
    },
  };
  return client;
}

async function render(node: ReactNode, context: ResearchContextValue = fixtureContext()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={context}>{node}</ResearchContext.Provider>);
  });
  await flush();
  return container!;
}
async function rerender(node: ReactNode, context: ResearchContextValue) {
  await act(async () => {
    root!.render(<ResearchContext.Provider value={context}>{node}</ResearchContext.Provider>);
  });
  await flush();
}
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
};

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
const has = (view: HTMLElement, id: string) => view.querySelector(`[data-testid="${id}"]`) !== null;

async function fillForm(view: HTMLElement) {
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
}

/** Fill the form and quote, i.e. everything the card door requires before Pay. */
async function fillFormAndQuote(view: HTMLElement) {
  await fillForm(view);
  await quoteShipping(view);
}
/** The card door requires a quote for the chosen service before the amount can be consented to. */
async function quoteShipping(view: HTMLElement) {
  await act(async () => {
    byTestId<HTMLButtonElement>(view, "co-quote").click();
  });
  await flush();
}

async function click(view: HTMLElement, id: string) {
  await act(async () => {
    byTestId<HTMLButtonElement>(view, id).click();
  });
  await flush();
}

const submitted = (calls: Recorded[]) => calls.filter((c) => c.method === "POST" && c.url === "/api/research/checkout/durable");
/** The durable door echoes the request key the page minted, as the real door does. */
const durableAnswer = (state: string, idempotent = false) => (call: Recorded): Reply => ({
  status: 200,
  body: { ok: true, checkout: { requestKey: String(call.body?.idempotencyKey), orderId: ORDER, state, idempotent } },
});
const settle = async (ms: number) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};
const continuation = (state: string, withSecret = false) => ({
  ok: true,
  continuation: { requestKey: "", orderId: ORDER, state, amountCents: 15095, currency: "usd", ...(withSecret ? { authentication: { providerReference: "pi_0001", clientSecret: SECRET } } : {}) },
});
const keyOf = (calls: Recorded[]) => String(submitted(calls)[0]!.body!.idempotencyKey);
const continuationPaths = (key: string) => ({
  status: `GET /api/research/checkout/executions/${encodeURIComponent(key)}/continuation`,
  continue: `POST /api/research/checkout/executions/${encodeURIComponent(key)}/continue`,
  cancel: `POST /api/research/checkout/executions/${encodeURIComponent(key)}/cancel`,
});

describe("checkout page over the durable card door", () => {
  it("keeps the ordering door, with no payment section, when no payment configuration is published", async () => {
    const { calls } = server({ "POST /api/research/checkout": { status: 403, body: { ok: false, code: "commerce_disabled" } } }, { config: { status: 503, body: { ok: false, code: "payment_disabled" } } });
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    expect(has(view, "co-payment")).toBe(false);
    expect(byTestId(view, "co-submit").textContent).toBe("Place order");
    await fillForm(view);
    await click(view, "co-submit");
    expect(calls.some((c) => c.url === "/api/research/checkout" && c.method === "POST")).toBe(true);
    expect(submitted(calls)).toHaveLength(0);
  });

  it("collects the card with the provider, submits ONE frozen request, mounts the bank step, and shows the order only after the server says completed", async () => {
    // The scripted server does not know the request key until the page mints it; the continuation doors answer by suffix.
    const { calls } = server(
      { "POST /api/research/checkout/durable": durableAnswer("authentication_required") },
      {
        dynamic: (method, url) => {
          if (!url.startsWith("/api/research/checkout/executions/")) return undefined;
          if (method === "POST" && url.endsWith("/continue")) return { status: 200, body: continuation("completed") };
          if (method === "GET" && url.endsWith("/continuation")) return { status: 200, body: continuation("authentication_required", true) };
          return undefined;
        },
      },
    );
    const card = cardClient();
    const authenticate = vi.fn<PaymentAuthenticator>(async () => "authenticated");
    const view = await render(<Checkout paymentMethodClient={card} authenticator={authenticate} />);
    expect(has(view, "co-payment")).toBe(true);
    expect(byTestId(view, "pm-test-mode").textContent).toContain("Test mode");
    await fillForm(view);
    // Before a quote the exact amount is unknown, so paying is withheld.
    expect(byTestId<HTMLButtonElement>(view, "co-submit").disabled).toBe(true);
    expect(has(view, "co-quote-required")).toBe(true);
    await quoteShipping(view);
    // The button names the amount the card is charged, and the summary agrees.
    expect(byTestId(view, "co-submit").textContent).toBe("Pay $150.95 and place order");
    expect(byTestId(view, "co-total").textContent).toBe("$150.95");
    expect(byTestId<HTMLButtonElement>(view, "co-submit").disabled).toBe(false);
    await click(view, "co-submit");
    const key = keyOf(calls);
    // The resume pointer was written BEFORE the answer came back.
    expect(resumePointer()?.requestKey).toBe(key);
    expect(card.collects).toBe(1);
    expect(submitted(calls)).toHaveLength(1);
    expect(submitted(calls)[0]!.body).toMatchObject({ paymentMethodReference: "pm_fixture_card", idempotencyKey: key, acceptedAgreementKeys: ["research_terms_v1"], researchAttestation: true });
    // No card data, no secret anywhere in the DOM or the request.
    expect(JSON.stringify(submitted(calls)[0]!.body)).not.toMatch(/4242|cvc/i);
    // The bank step is mounted for THIS request key; the form is gone.
    expect(has(view, "checkout-execution")).toBe(true);
    expect(has(view, "co-submit")).toBe(false);
    expect(byTestId(view, "checkout-execution").getAttribute("data-state")).toBe("authentication_required");
    expect(view.innerHTML).not.toContain(SECRET);
    expect(calls.some((c) => c.method === "GET" && c.url === `/api/research/checkout/executions/${encodeURIComponent(key)}/continuation` && c.token === "member-jwt")).toBe(true);
    // Confirm with the bank: the provider flow runs with the server's secret, then the server continues and completes.
    await click(view, "payment-continue");
    expect(authenticate).toHaveBeenCalledWith({ clientSecret: SECRET });
    expect(has(view, "checkout-paid")).toBe(true);
    expect(byTestId(view, "checkout-paid").textContent).toContain(`Order ${ORDER} is recorded.`);
    expect(byTestId(view, "checkout-paid").textContent).toContain("Payment received is not shipment");
    expect(byTestId<HTMLAnchorElement>(view, "checkout-paid-order").getAttribute("href")).toBe(`/research/member/orders/${ORDER}`);
    expect(view.innerHTML).not.toContain(SECRET);
    // The resume pointer is cleared once the order is settled.
    expect(resumePointer()).toBeNull();
  });

  it("a lost answer keeps the request frozen: retry resends the identical body under the identical key and never collects a second card", async () => {
    let attempts = 0;
    const { calls } = server({
      "POST /api/research/checkout/durable": (call) => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("socket hang up");
        return durableAnswer("completed", true)(call);
      },
    });
    const card = cardClient();
    const view = await render(<Checkout paymentMethodClient={card} />);
    await fillFormAndQuote(view);
    await click(view, "co-submit");
    expect(byTestId(view, "co-submit-error").textContent).toContain("Retry sends the same request");
    // The pointer exists even though no answer ever arrived: a refresh resumes
    // THIS key instead of minting a new one and paying twice.
    expect(resumePointer()?.requestKey).toBe(keyOf(calls));
    expect(resumePointer()?.orderId).toBeNull();
    expect(has(view, "co-payment-frozen")).toBe(true);
    expect(has(view, "co-payment")).toBe(false);
    expect(byTestId(view, "co-submit").textContent).toBe("Retry the same request");
    await click(view, "co-submit");
    const bodies = submitted(calls).map((c) => c.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(card.collects).toBe(1);
    expect(has(view, "checkout-paid")).toBe(true);
  });

  it("a cancelled checkout says nothing was charged and only an explicit new request mints a new key", async () => {
    const { calls } = server({
      "POST /api/research/checkout/durable": (call) => {
        const answer = durableAnswer("cancelled")(call);
        (answer.body as { checkout: Record<string, unknown> }).checkout.cancellation = { reason: "declined" };
        return answer;
      },
    });
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    await fillFormAndQuote(view);
    await click(view, "co-submit");
    expect(has(view, "checkout-cancelled")).toBe(true);
    expect(byTestId(view, "checkout-cancelled").getAttribute("data-reason")).toBe("declined");
    expect(byTestId(view, "checkout-cancelled").textContent).toContain("Your card was declined");
    expect(byTestId(view, "checkout-cancelled").textContent).toContain("nothing was charged");
    const first = keyOf(calls);
    expect(resumePointer()).toBeNull();
    // Cancelled is settled and terminal, so the key rotates on its own: the form
    // below can never re-submit the spent key and collect an idempotency_conflict.
    await click(view, "co-submit");
    const keys = submitted(calls).map((c) => String(c.body!.idempotencyKey));
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(first);
  });

  it("denials that persisted nothing reopen the form on the same key; large-order review goes to the ordering door with the same request", async () => {
    const { calls } = server({
      "POST /api/research/checkout/durable": { status: 400, body: { ok: false, code: "payment_method_required", codes: ["payment_method_required"] } },
    });
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    await fillFormAndQuote(view);
    await click(view, "co-submit");
    expect(view.textContent).toContain("Add a payment method to continue.");
    expect(has(view, "co-payment")).toBe(true);
    expect(byTestId(view, "co-submit").textContent).toBe("Pay $150.95 and place order");
    // A denial persisted nothing, so no pointer is left behind to resume.
    expect(resumePointer()).toBeNull();
    const first = keyOf(calls);
    await click(view, "co-submit");
    expect(keyOf(calls)).toBe(first);
    expect(submitted(calls)[1]!.body!.idempotencyKey).toBe(first);

    const held = server({
      "POST /api/research/checkout/durable": { status: 400, body: { ok: false, code: "large_order_review_required", codes: ["large_order_review_required"] } },
      "POST /api/research/checkout": { status: 403, body: { ok: false, code: "large_order_review_required" } },
    });
    act(() => root!.unmount());
    const review = await render(<Checkout paymentMethodClient={cardClient()} />);
    await fillFormAndQuote(review);
    await click(review, "co-submit");
    expect(has(review, "checkout-held")).toBe(true);
    const legacy = held.calls.filter((c) => c.method === "POST" && c.url === "/api/research/checkout");
    expect(legacy).toHaveLength(1);
    expect(legacy[0]!.body).toEqual(submitted(held.calls)[0]!.body);
  });

  it("an order the server prices as fully credit-covered takes the ordering door and asks for no card", async () => {
    // The client reads the SERVER's applied credit, never the advisory amount
    // typed into the box: the durable door charges subtotal + shipping minus
    // cart.storeCreditAppliedCents, so that is the only figure the page may use
    // to decide the door or to name an amount.
    const covered: CartDto = { ...readyCart, storeCreditAppliedCents: 15095, estimatedTotalCents: 0 };
    const { calls } = server(
      { "POST /api/research/checkout": { status: 200, body: { ok: true, order: { orderId: ORDER, state: "checkout_pending", placedAt: "2026-09-09T00:00:00Z", totalCents: 0, shipments: [] } } } },
      { cart: covered },
    );
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    expect(has(view, "co-payment")).toBe(false);
    expect(byTestId(view, "co-submit").textContent).toBe("Place order");
    await fillForm(view);
    await click(view, "co-submit");
    expect(submitted(calls)).toHaveLength(0);
    expect(calls.filter((c) => c.method === "POST" && c.url === "/api/research/checkout")).toHaveLength(1);
    expect(has(view, "checkout-confirmation")).toBe(true);
  });

  it("a server payment_disabled hands the same request to the ordering door instead of dead-ending under a live card field", async () => {
    const { calls } = server({
      "POST /api/research/checkout/durable": { status: 400, body: { ok: false, code: "payment_disabled", codes: ["payment_disabled"] } },
      "POST /api/research/checkout": { status: 200, body: { ok: true, order: { orderId: ORDER, state: "checkout_pending", placedAt: "2026-09-09T00:00:00Z", totalCents: 0, shipments: [] } } },
    });
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    await fillFormAndQuote(view);
    await click(view, "co-submit");
    // The buyer is not told "payments are not switched on" beneath a card field.
    expect(view.textContent).not.toContain("Payments are not switched on yet");
    expect(has(view, "checkout-confirmation")).toBe(true);
    const legacy = calls.filter((c) => c.method === "POST" && c.url === "/api/research/checkout");
    expect(legacy).toHaveLength(1);
    expect(legacy[0]!.body).toEqual(submitted(calls)[0]!.body);
    // Nothing is left pointing at a key the continuation door can never own.
    expect(resumePointer()).toBeNull();
  });

  it("resumes an unfinished checkout after a refresh, and treats a reference the server does not know as UNCERTAIN rather than stale", async () => {
    window.sessionStorage.setItem(RESUME_SLOT(SCOPE), JSON.stringify({ scope: SCOPE, requestKey: "req_resume_0001", orderId: ORDER, startedAt: "2026-09-09T00:00:00Z" }));
    const paths = continuationPaths("req_resume_0001");
    const { calls } = server({ [paths.status]: { status: 200, body: continuation("reconciliation_required") } });
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    expect(has(view, "checkout-execution")).toBe(true);
    expect(byTestId(view, "checkout-execution").getAttribute("data-state")).toBe("reconciliation_required");
    expect(byTestId(view, "payment-uncertain").textContent).toContain("do not pay again");
    expect(calls.filter((c) => c.method === "GET" && c.url.endsWith("/continuation")).map((c) => c.url)).toEqual(["/api/research/checkout/executions/req_resume_0001/continuation"]);
    expect(submitted(calls)).toHaveLength(0);

    // Another account on the same browser never sees it: each scope has its own slot.
    act(() => root!.unmount());
    server({ [paths.status]: { status: 200, body: continuation("reconciliation_required") } });
    const other = await render(<Checkout paymentMethodClient={cardClient()} />, fixtureContext("other-jwt", OTHER_SCOPE));
    expect(has(other, "checkout-execution")).toBe(false);
    expect(has(other, "co-submit")).toBe(true);
    // And the first account's pointer is still there for its owner.
    expect(resumePointer(SCOPE)?.requestKey).toBe("req_resume_0001");

    // The server does not know the reference. That is NOT proof nothing was
    // created (the durable door persists the execution last), so the page keeps
    // the key, says so, and points the buyer at their orders.
    act(() => root!.unmount());
    server({ [paths.status]: { status: 404, body: { ok: false, code: "not_found" } } });
    const unresolved = await render(<Checkout paymentMethodClient={cardClient()} />);
    expect(has(unresolved, "checkout-unresolved")).toBe(true);
    expect(byTestId(unresolved, "checkout-unresolved").textContent).toContain("do not pay again yet");
    expect(byTestId<HTMLAnchorElement>(unresolved, "co-unresolved-orders").getAttribute("href")).toBe("/research/member/orders");
    expect(resumePointer(SCOPE)?.requestKey).toBe("req_resume_0001");
    // Only the buyer's explicit choice mints a new key.
    await click(unresolved, "co-new-request");
    expect(has(unresolved, "checkout-unresolved")).toBe(false);
    expect(resumePointer(SCOPE)).toBeNull();
  });

  it("abandonment: the buyer cancels from the bank step; the page shows cancelled and nothing charged", async () => {
    const { calls } = server(
      { "POST /api/research/checkout/durable": durableAnswer("authentication_required") },
      {
        dynamic: (method, url) => {
          if (!url.startsWith("/api/research/checkout/executions/")) return undefined;
          if (method === "POST" && url.endsWith("/cancel")) return { status: 200, body: continuation("cancelled") };
          if (method === "GET" && url.endsWith("/continuation")) return { status: 200, body: continuation("authentication_required", true) };
          return undefined;
        },
      },
    );
    const view = await render(<Checkout paymentMethodClient={cardClient()} authenticator={async () => "cancelled"} />);
    await fillFormAndQuote(view);
    await click(view, "co-submit");
    expect(has(view, "payment-cancel")).toBe(true);
    await click(view, "payment-cancel");
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/cancel"))).toBe(true);
    expect(has(view, "checkout-cancelled")).toBe(true);
    expect(resumePointer()).toBeNull();
  });

  it("an account switch discards the execution in progress and a late answer never renders under the new account", async () => {
    // The durable door holds its answer until the test releases it, so the
    // account switch deterministically happens while the submit is in flight.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { calls } = server({
      "POST /api/research/checkout/durable": async (call) => {
        await held;
        return durableAnswer("authentication_required")(call);
      },
    });
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    await fillFormAndQuote(view);
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "co-submit").click();
    });
    await settle(10);
    expect(submitted(calls)).toHaveLength(1);
    // The submit is in flight; the account changes before the answer arrives.
    await rerender(<Checkout paymentMethodClient={cardClient()} />, fixtureContext("other-jwt", OTHER_SCOPE));
    release();
    await settle(20);
    expect(submitted(calls)).toHaveLength(1);
    expect(submitted(calls)[0]!.token).toBe("member-jwt");
    expect(has(view, "checkout-execution")).toBe(false);
    expect(has(view, "checkout-paid")).toBe(false);
    // The first account's pointer stays in ITS OWN slot for its owner to resume;
    // the new account sees nothing of it and is not offered a payment.
    expect(resumePointer(OTHER_SCOPE)).toBeNull();
    expect(has(view, "co-submit")).toBe(true);
    expect(byTestId<HTMLButtonElement>(view, "co-submit").disabled).toBe(false);
    expect(byTestId(view, "co-submit").textContent).not.toContain("Paying");
  });

  it("a refresh while the answer is unknown resumes the SAME key instead of minting a new one", async () => {
    // The buyer pays; the answer never arrives; the buyer refreshes the page.
    let held: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      held = resolve;
    });
    const first = server({
      "POST /api/research/checkout/durable": async (call) => {
        await gate;
        return durableAnswer("authentication_required")(call);
      },
    });
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    await fillFormAndQuote(view);
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "co-submit").click();
    });
    await settle(10);
    const key = keyOf(first.calls);
    expect(resumePointer()?.requestKey).toBe(key);
    held();
    await settle(10);

    // The refresh: a brand-new mount, same tab, same account.
    act(() => root!.unmount());
    const paths = continuationPaths(key);
    const second = server({ [paths.status]: { status: 200, body: continuation("authentication_required", true) } });
    const reopened = await render(<Checkout paymentMethodClient={cardClient()} />);
    // It resumes the original key through the owner-checked door; no new submission.
    expect(has(reopened, "checkout-execution")).toBe(true);
    expect(submitted(second.calls)).toHaveLength(0);
    expect(second.calls.some((c) => c.method === "GET" && c.url === `/api/research/checkout/executions/${encodeURIComponent(key)}/continuation`)).toBe(true);
  });

  it("the frozen state offers no way to mint a new key, only to find out what happened", async () => {
    const { calls } = server(
      {
        "POST /api/research/checkout/durable": () => {
          throw new TypeError("socket hang up");
        },
      },
      {
        dynamic: (method, url) =>
          method === "GET" && url.endsWith("/continuation") ? { status: 200, body: continuation("authentication_required", true) } : undefined,
      },
    );
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    await fillFormAndQuote(view);
    await click(view, "co-submit");
    expect(has(view, "co-payment-frozen")).toBe(true);
    const key = keyOf(calls);
    // No new-request control exists here: minting a key while the outcome is
    // unknown is how a buyer ends up with two orders.
    expect(has(view, "co-new-request")).toBe(false);
    // Every input that would change the frozen request is locked, and the page
    // does not name an amount the retry may not charge.
    expect(byTestId<HTMLInputElement>(view, "co-line1").disabled).toBe(true);
    expect(byTestId<HTMLSelectElement>(view, "co-service").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>(view, "co-quote").disabled).toBe(true);
    expect(byTestId(view, "co-total").textContent).toBe("Awaiting the result");
    expect(byTestId(view, "co-submit").textContent).toBe("Retry the same request");

    await click(view, "co-check-request");
    expect(has(view, "checkout-execution")).toBe(true);
    expect(has(view, "co-submit")).toBe(false);
    expect(submitted(calls)).toHaveLength(1);
    expect(String(submitted(calls)[0]!.body!.idempotencyKey)).toBe(key);
  });

  it("an order the continuation door does not own is shown as an existing order, never as a new payment", async () => {
    // The durable door answers for a LEGACY order placed under this key; the
    // continuation door knows no execution for it.
    const { calls } = server(
      { "POST /api/research/checkout/durable": durableAnswer("processing", true) },
      {
        // No execution owns this order: the continuation door disowns the key.
        dynamic: (method, url) =>
          url.includes("/checkout/executions/") ? { status: 404, body: { ok: false, code: "not_found" } } : undefined,
      },
    );
    const view = await render(<Checkout paymentMethodClient={cardClient()} />);
    await fillFormAndQuote(view);
    await click(view, "co-submit");
    await settle(10);
    expect(has(view, "checkout-order-exists")).toBe(true);
    expect(byTestId(view, "checkout-order-exists").textContent).toContain(`Order ${ORDER} is on your account.`);
    expect(byTestId<HTMLAnchorElement>(view, "checkout-order-exists-link").getAttribute("href")).toBe(`/research/member/orders/${ORDER}`);
    // No new key, no card form, no second submission.
    expect(has(view, "co-submit")).toBe(false);
    expect(submitted(calls)).toHaveLength(1);
    expect(resumePointer()).toBeNull();
  });
});
