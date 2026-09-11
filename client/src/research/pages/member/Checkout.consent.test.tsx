// @vitest-environment jsdom
// Real React handlers and real commerce transport validation, with an explicitly
// local recording fetch and provider field double. No network/provider effects.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ResearchContext, type ResearchContextValue } from "../../core";
import { __resetCapabilitiesCache } from "../../lib/capabilities";
import type { CartDto, CheckoutQuoteSnapshot } from "@shared/research/commerce-api";
import { CURRENT_CHECKOUT_CREDIT_POLICY } from "@shared/research/checkout-credit-policy";
import type { CollectPaymentMethod, PaymentMethodCollectorClient } from "../../payments/PaymentMethodCollector";
import Checkout from "./Checkout";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | null = null;
let view: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  view?.remove(); root = null; view = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  __resetCapabilitiesCache(); window.sessionStorage.clear();
});

const cart: CartDto = {
  lines: [{ sku: "LOCAL-1", displayName: "Local fixture item", quantity: 1, purchaseMode: "one_time", unitPriceCents: 10_000, lineTotalCents: 10_000, blockedReason: null }],
  shipmentGroups: [{ owner: "xenios", skus: ["LOCAL-1"] }], subtotalCents: 10_000,
  shippingCents: 500, storeCreditAppliedCents: 0, estimatedTotalCents: 10_500,
  checkoutReady: true, blockingReasons: [], requiredAgreements: ["research_terms_v1"],
};
const snapshot = (overrides: Partial<CheckoutQuoteSnapshot> = {}): CheckoutQuoteSnapshot => ({
  quote: { kind: "configured_fallback", service: "standard", amountCents: 500, estimatedDeliveryRange: null, disclosure: "Local shipping fixture" },
  subtotalCents: 10_000,
  checkoutConsent: { policyVersion: CURRENT_CHECKOUT_CREDIT_POLICY.version, totalCents: 10_000, appliedCents: 500 },
  expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
const context = (label = "a", signedIn = true): ResearchContextValue => ({
  gate: signedIn ? "open" : "locked", member: signedIn ? { firstName: "Fixture", status: "active", applicationStatus: null, cartScope: label.repeat(64) } : null,
  memberToken: signedIn ? `fixture-only-${label}` : null, memberChecking: false, recovery: "none",
} as ResearchContextValue);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
type Reply = { status: number; body: unknown };
type Call = { path: string; method: string; authorization: string | null; body: Record<string, unknown> | null };
const okQuote = (value: unknown = snapshot()): Reply => ({ status: 200, body: { ok: true, ...(value as Record<string, unknown>) } });
function server(options: {
  quote?: (call: Call) => Reply | Promise<Reply>;
  getCart?: () => CartDto;
  card?: boolean;
  durable?: (call: Call) => Reply | Promise<Reply>;
} = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const call: Call = { path: String(input), method: init?.method ?? "GET", authorization: new Headers(init?.headers).get("Authorization"),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null };
    calls.push(call);
    let reply: Reply;
    switch (`${call.method} ${call.path}`) {
      case "GET /api/research/capabilities": reply = { status: 200, body: { ok: true, capabilities: { product_commerce: { enabled: true } } } }; break;
      case "GET /api/research/cart": reply = { status: 200, body: { ok: true, cart: options.getCart?.() ?? cart } }; break;
      case "GET /api/research/store-credit": reply = { status: 200, body: { ok: true, storeCredit: { spendableCents: 1_000, pendingCents: 0, entries: [] } } }; break;
      case "GET /api/research/checkout/payment-config": reply = options.card === false
        ? { status: 503, body: { ok: false, code: "payment_disabled" } }
        : { status: 200, body: { ok: true, config: { provider: "stripe", publishableKey: "fixture-only", mode: "test" } } }; break;
      case "POST /api/research/shipping/quote": reply = await (options.quote?.(call) ?? okQuote()); break;
      case "POST /api/research/checkout/durable": reply = await (options.durable?.(call)
        ?? { status: 503, body: { ok: false, code: "capability_disabled" } }); break;
      case "POST /api/research/checkout": reply = { status: 400, body: { ok: false, code: "commerce_disabled" } }; break;
      default: throw new Error("Unexpected local fixture transport");
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  }));
  return { calls, submitted: () => calls.filter(call => call.path === "/api/research/checkout/durable") };
}
function collector(wait?: Promise<Awaited<ReturnType<CollectPaymentMethod>>>) {
  const collect = vi.fn<CollectPaymentMethod>(async () => wait ? await wait : { ok: true, reference: "pm_fixture_only" });
  const client: PaymentMethodCollectorClient = { async mount(_element, onChange) {
    onChange({ complete: true, error: null }); return { collect, unmount() {} };
  } };
  return { client, collect };
}
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
async function render(client: PaymentMethodCollectorClient, principal = context()) {
  view = document.createElement("div"); document.body.appendChild(view); root = createRoot(view);
  await update(client, principal); return view;
}
async function update(client: PaymentMethodCollectorClient, principal: ResearchContextValue) {
  await act(async () => root!.render(<ResearchContext.Provider value={principal}><Checkout paymentMethodClient={client} /></ResearchContext.Provider>));
  await flush();
}
function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = view!.querySelector(`[data-testid="${id}"]`);
  if (!element) throw new Error(`Missing fixture element ${id}`);
  return element as T;
}
const has = (id: string) => view!.querySelector(`[data-testid="${id}"]`) !== null;
function change(id: string, value: string) {
  const element = byId<HTMLInputElement | HTMLSelectElement>(id);
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
async function click(id: string) { await act(async () => byId<HTMLButtonElement>(id).click()); await flush(); }
async function fill() {
  await act(async () => { change("co-line1", "1 Local Fixture Way"); change("co-city", "Austin"); change("co-state", "TX"); change("co-postal", "78701"); });
  await click("co-agree-research_terms_v1"); await click("co-attest");
}
async function ready(client: PaymentMethodCollectorClient) { await render(client); await fill(); await click("co-quote"); }

describe("native checkout binds server credit consent", () => {
  it("withholds a new card submission until a complete quote exists", async () => {
    const transport = server(); const card = collector(); await render(card.client); await fill();
    expect(byId<HTMLButtonElement>("co-submit").disabled).toBe(true);
    await click("co-submit"); expect(card.collect).not.toHaveBeenCalled(); expect(transport.submitted()).toHaveLength(0);
    expect(has("co-consent-summary")).toBe(false);
  });

  it("displays and freezes the server's credit amount instead of the older cart estimate", async () => {
    const transport = server(); const card = collector(); await ready(card.client);
    expect(byId("co-total").textContent).toBe("$100.00");
    expect(byId("co-consent-summary").textContent).toContain("$5.00 in store credit");
    expect(byId("co-submit").textContent).toContain("Pay $100.00");
    await click("co-submit");
    expect(transport.submitted()).toHaveLength(1);
    expect(transport.submitted()[0]!.body).toMatchObject({ checkoutConsent: snapshot().checkoutConsent, expectedTotalCents: 10_000, applyStoreCreditCents: 500, paymentMethodReference: "pm_fixture_only" });
    expect(byId("co-consent-summary").textContent).toContain("Submitted intent");
  });

  it.each(["missing", "malformed", "expired", "unavailable"])("refuses a %s snapshot without collecting or submitting", async kind => {
    server({ quote: () => kind === "unavailable" ? { status: 503, body: { ok: false, code: "shipping_unavailable" } }
      : kind === "missing" ? okQuote({ quote: snapshot().quote })
      : kind === "expired" ? okQuote(snapshot({ expiresAt: new Date(Date.now() - 1).toISOString() }))
      : okQuote({ ...snapshot(), checkoutConsent: { ...snapshot().checkoutConsent, appliedCents: "500" } }) });
    const card = collector(); await ready(card.client);
    expect(has("co-quote-result")).toBe(false); expect(byId<HTMLButtonElement>("co-submit").disabled).toBe(true);
    await click("co-submit"); expect(card.collect).not.toHaveBeenCalled(); expect(has("co-consent-summary")).toBe(false);
  });

  it("requires cart refresh on changed canonical subtotal before displaying a new quote", async () => {
    let currentCart = cart;
    const changed = snapshot({ subtotalCents: 11_000, checkoutConsent: { ...snapshot().checkoutConsent, totalCents: 11_000 } });
    server({ quote: () => okQuote(changed), getCart: () => currentCart });
    const card = collector(); await ready(card.client);
    expect(has("co-refresh-cart")).toBe(true); expect(has("co-quote-result")).toBe(false);
    expect(byId<HTMLButtonElement>("co-submit").disabled).toBe(true);
    currentCart = { ...cart, subtotalCents: 11_000, estimatedTotalCents: 11_500,
      lines: [{ ...cart.lines[0]!, unitPriceCents: 11_000, lineTotalCents: 11_000 }] };
    await click("co-refresh-cart"); expect(has("co-consent-summary")).toBe(false);
    await click("co-quote"); expect(byId("co-total").textContent).toBe("$110.00");
  });

  it("rechecks expiry in the submit handler even without a timer render", async () => {
    const value = snapshot(); const transport = server({ quote: () => okQuote(value) });
    const card = collector(); await ready(card.client);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(value.expiresAt));
    await click("co-submit");
    expect(card.collect).not.toHaveBeenCalled(); expect(transport.submitted()).toHaveLength(0);
    expect(byId("co-validation").textContent).toContain("current checkout quote");
  });

  it("does not approve a matching cart headline over disagreeing displayed item totals", async () => {
    const transport = server({ getCart: () => ({ ...cart, lines: [{ ...cart.lines[0]!, lineTotalCents: 9_000 }] }) });
    const card = collector(); await ready(card.client);
    expect(has("co-refresh-cart")).toBe(true); expect(has("co-consent-summary")).toBe(false);
    expect(byId<HTMLButtonElement>("co-submit").disabled).toBe(true);
    await click("co-submit"); expect(card.collect).not.toHaveBeenCalled(); expect(transport.submitted()).toHaveLength(0);
  });

  it("rechecks expiry after asynchronous card collection before creating the intent", async () => {
    const value = snapshot(); const waiting = deferred<Awaited<ReturnType<CollectPaymentMethod>>>();
    const transport = server({ quote: () => okQuote(value) }); const card = collector(waiting.promise);
    await ready(card.client); await click("co-submit"); expect(card.collect).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(value.expiresAt));
    await act(async () => waiting.resolve({ ok: true, reference: "pm_fixture_only" })); await flush();
    expect(transport.submitted()).toHaveLength(0); expect(has("co-payment-frozen")).toBe(false);
    expect(byId("co-validation").textContent).toContain("changed while the card field");
  });

  it.each([["co-city", "Dallas"], ["co-service", "next_day"]])("fences a late quote after %s changes", async (field, value) => {
    const pending = deferred<Reply>(); server({ quote: () => pending.promise }); const card = collector();
    await render(card.client); await fill(); await click("co-quote");
    await act(async () => change(field!, value!));
    await act(async () => pending.resolve(okQuote())); await flush();
    expect(has("co-quote-result")).toBe(false); expect(has("co-consent-summary")).toBe(false);
    expect(byId<HTMLButtonElement>("co-quote").disabled).toBe(false);
  });

  it("rejects an address change during card collection before sending an intent", async () => {
    const pending = deferred<Awaited<ReturnType<CollectPaymentMethod>>>(); const transport = server(); const card = collector(pending.promise);
    await ready(card.client); await click("co-submit");
    await act(async () => change("co-city", "Dallas"));
    await act(async () => pending.resolve({ ok: true, reference: "pm_fixture_only" })); await flush();
    expect(transport.submitted()).toHaveLength(0); expect(has("co-payment-frozen")).toBe(false);
    expect(byId("co-validation").textContent).toContain("changed while the card field");
  });

  it("an older quote cannot replace a newer quote for a changed address", async () => {
    const old = deferred<Reply>(); let requests = 0;
    server({ quote: () => ++requests === 1 ? old.promise : okQuote() }); const card = collector();
    await render(card.client); await fill(); await click("co-quote");
    await act(async () => change("co-city", "Dallas")); await click("co-quote");
    expect(byId("co-total").textContent).toBe("$100.00");
    await act(async () => old.resolve(okQuote(snapshot({ checkoutConsent: { ...snapshot().checkoutConsent, appliedCents: 0, totalCents: 10_500 } })))); await flush();
    expect(byId("co-total").textContent).toBe("$100.00");
  });

  it("A to B to A does not revive A's earlier pending quote", async () => {
    const pending = deferred<Reply>(); server({ quote: () => pending.promise }); const card = collector();
    await render(card.client); await fill(); await click("co-quote");
    await update(card.client, context("b")); await update(card.client, context("a"));
    await act(async () => pending.resolve(okQuote())); await flush();
    expect(has("co-consent-summary")).toBe(false); expect(has("co-quote-result")).toBe(false);
    expect(byId<HTMLInputElement>("co-line1").value).toBe("");
  });

  it("logout retires a pending card collection and its private consent", async () => {
    const pending = deferred<Awaited<ReturnType<CollectPaymentMethod>>>();
    const transport = server(); const card = collector(pending.promise); await ready(card.client); await click("co-submit");
    await update(card.client, context("a", false));
    expect(has("co-consent-summary")).toBe(false); expect(has("co-submit")).toBe(false);
    await act(async () => pending.resolve({ ok: true, reference: "pm_fixture_only" })); await flush();
    expect(transport.submitted()).toHaveLength(0); expect(window.sessionStorage.length).toBe(0);
  });

  it("freezes the entire consent and retries it exactly after quote expiry", async () => {
    const value = snapshot(); const transport = server({ quote: () => okQuote(value) }); const card = collector();
    await ready(card.client); await click("co-submit");
    const original = transport.submitted()[0]!.body;
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(value.expiresAt) + 1);
    await click("co-submit");
    expect(transport.submitted()).toHaveLength(2); expect(transport.submitted()[1]!.body).toEqual(original);
    expect(card.collect).toHaveBeenCalledTimes(1); expect(byId("co-total").textContent).toBe("$100.00");
  });

  it("preserves the assisted path without fabricating card consent", async () => {
    const transport = server({ card: false }); const card = collector(); await render(card.client); await fill();
    await click("co-submit");
    const request = transport.calls.find(call => call.path === "/api/research/checkout");
    expect(request).toBeDefined(); expect(request!.body).not.toHaveProperty("checkoutConsent");
    expect(request!.body).not.toHaveProperty("expectedTotalCents"); expect(card.collect).not.toHaveBeenCalled();
    expect(transport.submitted()).toHaveLength(0);
  });

  it("an informational quote cannot add card consent or mixed totals to the assisted path", async () => {
    const transport = server({ card: false }); const card = collector(); await ready(card.client);
    expect(has("co-quote-result")).toBe(true); expect(has("co-consent-summary")).toBe(false);
    expect(byId("co-total").textContent).toBe("$105.00");
    expect(byId("co-credit-applied").textContent).toContain("$0.00");
    expect(byId("co-submit").textContent).toBe("Place order");
    await click("co-submit");
    const request = transport.calls.find(call => call.path === "/api/research/checkout");
    expect(request!.body).not.toHaveProperty("checkoutConsent"); expect(request!.body).not.toHaveProperty("expectedTotalCents");
    expect(request!.body).not.toHaveProperty("applyStoreCreditCents"); expect(card.collect).not.toHaveBeenCalled();
    expect(transport.submitted()).toHaveLength(0);
  });
});
