// @vitest-environment jsdom
// /admin/research/orders/:id against the real AdminOrderDetailDto.
//
// The load-bearing case is that the screen offers only the moves the server
// reported as available. A control for a move the transition table would refuse
// is worse than no control: it invites an operator to try something that cannot
// work and teaches them not to trust the screen.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supa = vi.hoisted(() => ({
  auth: {
    getSession: async () => ({ data: { session: { access_token: "admin-token" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => {},
  },
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
}));

import { Route } from "wouter";
import OrderAdminDetail from "./OrderAdminDetail";
import type { AdminOrderDetailDto } from "@shared/research/commerce-api";

const ORDER_ID = "ord_paid_1";
const ORDER_PATH = `/api/admin/research/orders/${ORDER_ID}`;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  window.history.pushState({}, "", `/admin/research/orders/${ORDER_ID}`);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

type RecordedCall = { url: string; method: string; body: string | undefined };

function stubFetch(order: AdminOrderDetailDto, actionStatus = 200, actionBody: unknown = { ok: true }): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), method, body: typeof init?.body === "string" ? init.body : undefined });
      const json = (status: number, body: unknown) => ({
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
      });
      if (String(url).startsWith("/api/admin/me")) {
        return json(200, { success: true, email: "founder@xeniostechnology.com" });
      }
      if (String(url) === ORDER_PATH && method === "GET") return json(200, { ok: true, order });
      if (String(url).startsWith(ORDER_PATH)) return json(actionStatus, actionBody);
      throw new TypeError(`unstubbed fetch: ${url}`);
    }),
  );
  return calls;
}

function pageAtRoute(): ReactNode {
  return (
    <Route path="/admin/research/orders/:id">
      <OrderAdminDetail />
    </Route>
  );
}

async function renderPage(node: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

// React tracks its own value on the DOM node, so a plain assignment is
// ignored. Going through the native setter is what a real keystroke does.
function type(testId: string, value: string): void {
  const input = document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function has(view: HTMLElement, id: string): boolean {
  return view.querySelector(`[data-testid="${id}"]`) !== null;
}

function byTestId(view: HTMLElement, id: string): HTMLElement {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as HTMLElement;
}

function order(overrides: Partial<AdminOrderDetailDto> = {}): AdminOrderDetailDto {
  return {
    orderId: ORDER_ID,
    recordKind: "order",
    state: "payment_captured",
    placedAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T01:00:00.000Z",
    totalCents: 21095,
    payment: {
      amountDueCents: 21095,
      amountCapturedCents: 21095,
      amountRefundedCents: 0,
      currency: "USD",
    },
    shipmentsSource: "connected",
    shipments: [{ owner: "xenios", status: "pending", trackingNumber: null, carrier: null }],
    lines: [{ sku: "P001", displayName: "Product One", quantity: 2, lineTotalCents: 19800 }],
    shippingCents: 1295,
    storeCreditAppliedCents: 0,
    reviewReason: null,
    memberId: "mem_1",
    reviewTriggers: [],
    capturedAmountCents: 21095,
    availableActions: ["begin_processing", "record_tracking", "cancel"],
    ...overrides,
  };
}

describe("the admin order file", () => {
  it("renders the order the checkout wrote, with its money facts", async () => {
    stubFetch(order());
    const view = await renderPage(pageAtRoute());

    expect(byTestId(view, "order-id").textContent).toBe(ORDER_ID);
    expect(byTestId(view, "order-state").textContent).toContain("Paid");
    expect(byTestId(view, "order-total").textContent).toBe("$210.95");
    expect(byTestId(view, "order-captured").textContent).toBe("$210.95");
    expect(view.textContent).toContain("Product One");
  });

  it("says a captured amount is not recorded rather than showing zero", async () => {
    stubFetch(order({ capturedAmountCents: null }));
    const view = await renderPage(pageAtRoute());
    expect(byTestId(view, "order-captured").textContent).toBe("Not recorded");
    expect(byTestId(view, "order-captured").textContent).not.toContain("$0.00");
  });

  it("offers only the actions the server reported as available", async () => {
    stubFetch(order());
    const view = await renderPage(pageAtRoute());

    expect(has(view, "order-processing")).toBe(true);
    expect(has(view, "order-tracking-form")).toBe(true);
    expect(has(view, "order-cancel-form")).toBe(true);
    // Not offered, because the transition table would refuse them here.
    expect(has(view, "order-approve")).toBe(false);
    expect(has(view, "order-capture")).toBe(false);
    expect(has(view, "order-fulfilled")).toBe(false);
  });

  it("offers approve and cancel on a held order, and nothing that needs payment", async () => {
    stubFetch(order({ state: "manual_review", availableActions: ["approve", "cancel"], capturedAmountCents: null }));
    const view = await renderPage(pageAtRoute());

    expect(has(view, "order-approve")).toBe(true);
    expect(has(view, "order-cancel-form")).toBe(true);
    expect(has(view, "order-processing")).toBe(false);
    expect(has(view, "order-tracking-form")).toBe(false);
  });

  it("never offers to mark an order delivered, and says why", async () => {
    for (const state of ["payment_captured", "processing", "fulfilled"] as const) {
      stubFetch(order({ state, availableActions: state === "fulfilled" ? [] : ["begin_processing"] }));
      const view = await renderPage(pageAtRoute());
      expect(view.textContent).not.toContain("Mark delivered");
      expect(byTestId(view, "order-delivery-note").textContent).toContain("carrier");
      if (root) act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  });

  it("says plainly when nothing can be done from here", async () => {
    stubFetch(order({ state: "delivered", availableActions: [] }));
    const view = await renderPage(pageAtRoute());
    expect(byTestId(view, "order-no-actions").textContent).toContain("Nothing can be done");
  });

  it("sends the tracking a person typed, and does not move the order itself", async () => {
    const calls = stubFetch(order());
    const view = await renderPage(pageAtRoute());

    await act(async () => {
      type("order-tracking-carrier", "UPS");
      type("order-tracking-number", "1Z999AA10123456784");
    });
    await act(async () => {
      byTestId(view, "order-tracking-submit").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const posted = calls.find((call) => call.method === "POST" && call.url.endsWith("/shipments"));
    expect(posted).toBeTruthy();
    expect(JSON.parse(posted!.body ?? "{}")).toEqual({
      owner: "xenios",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
    });
    // No transition was requested alongside it.
    expect(calls.some((call) => call.url.endsWith("/fulfilled"))).toBe(false);
  });

  it("routes a refused action on its machine code and says nothing changed", async () => {
    stubFetch(order(), 409, { ok: false, code: "tracking_invalid", message: "not recordable" });
    const view = await renderPage(pageAtRoute());

    await act(async () => {
      byTestId(view, "order-tracking-submit").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(byTestId(view, "order-denied").textContent).toContain("was not recorded");
    expect(byTestId(view, "order-denied").textContent).toContain("Nothing about the shipment changed");
  });

  it("carries no member contact detail or provider reference in the order file", async () => {
    stubFetch(order());
    const view = await renderPage(pageAtRoute());
    // Scoped to the order itself: the admin chrome legitimately shows the
    // signed-in operator's own address.
    const file = [
      byTestId(view, "order-summary"),
      byTestId(view, "order-shipments"),
      byTestId(view, "order-actions"),
    ]
      .map((section) => section.textContent ?? "")
      .join(" ");
    expect(file).not.toContain("@");
    expect(file).not.toContain("pi_");
    expect(file).not.toContain("mem_1");
  });
});
