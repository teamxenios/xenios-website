// @vitest-environment jsdom
// The mounted roster consumes the real service -> route -> adapter payload.
// A hand-written UI fixture previously hid camelCase/snake_case contract drift.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Request, Response } from "express";
import { ORDER_STATES, type OrderState } from "@shared/research/commerce";
import { createOrderService, type OrderRecord, type OrderRepository } from "../../../../../server/research/commerce/orders";
import { registerCommerceApi, type CommerceDependencies } from "../../../../../server/research/commerce/routes";
import { TestPaymentProvider } from "../../../../../server/research/providers/payment";

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: {
    getSession: async () => ({ data: { session: { access_token: "synthetic-admin-token" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => {},
  } }),
}));

import OrdersAdmin from "./OrdersAdmin";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const PATH = "/api/admin/research/orders";
let root: Root | undefined;
let container: HTMLDivElement;

function record(state: OrderState, index = 0): OrderRecord {
  return {
    orderId: `native-${state}-${index}`,
    memberId: `member-${index}`,
    state,
    lines: [{ sku: "SYNTHETIC-SKU", displayName: "Synthetic item", quantity: 1, lineTotalCents: 12345 }],
    totals: { subtotalCents: 12345, shippingCents: 0, storeCreditAppliedCents: 0, totalCents: 12345 },
    providerReference: "synthetic-provider-reference",
    checkoutIdempotencyKey: `synthetic-checkout-${index}`,
    lastIdempotencyKey: null,
    reviewTriggers: [],
    createdAt: new Date(Date.UTC(2026, 8, 21, 12, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 21, 12, index)).toISOString(),
    capturedAmountCents: state === "payment_captured" ? 12345 : undefined,
    shipments: [],
  };
}

async function routeResponse(records: OrderRecord[]) {
  // Only listAll is used by the actual roster projection. Any attempted
  // read/write through another repository method fails this test immediately.
  const repository = { listAll: async () => records } as OrderRepository;
  const service = createOrderService({ repository, payment: new TestPaymentProvider(), commerceEnabled: true });
  type Handler = (req: Request, res: Response) => unknown;
  let handler: Handler | undefined;
  const admin = vi.fn();
  const add = (path: string, ...handlers: Handler[]) => {
    if (path !== PATH) return;
    expect(handlers[0]).toBe(admin);
    handler = handlers.at(-1);
  };
  registerCommerceApi({ get: add, post() {}, patch() {}, delete() {} } as never,
    { ordersAdmin: { roster: () => service.adminRoster() } } as CommerceDependencies,
    { requireAdmin: admin, requireActiveMember: vi.fn(), requireMember: vi.fn() });
  let body: unknown;
  let status = 200;
  const res = {
    set() { return res; },
    status(code: number) { status = code; return res; },
    json(value: unknown) { body = value; return res; },
  };
  expect(handler).toBeTypeOf("function");
  await handler!({ params: {}, query: {} } as Request, res as unknown as Response);
  expect(status).toBe(200);
  return body;
}

function stubResponse(body: unknown, status = 200) {
  const calls: Array<{ path: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path: String(path), init });
    const isIdentity = String(path) === "/api/admin/me";
    if (!isIdentity && String(path) !== PATH) throw new Error(`Unexpected path: ${path}`);
    return new Response(JSON.stringify(isIdentity ? { success: true, email: "admin@fixture.invalid" } : body), {
      status: isIdentity ? 200 : status,
      headers: { "Content-Type": "application/json" },
    });
  }));
  return calls;
}

async function renderPage() {
  root = createRoot(container);
  await act(async () => { root!.render(<OrdersAdmin />); });
  return container;
}

function visibleOrderIds(): string[] {
  return Array.from(container.querySelectorAll("tbody a")).map((link) => link.textContent ?? "");
}

function tab(label: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((el) => el.textContent === label);
  if (!match) throw new Error(`Missing tab: ${label}`);
  return match;
}

beforeEach(() => {
  window.history.pushState({}, "", "/admin/research/orders");
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container.remove();
  vi.unstubAllGlobals();
});

describe("mounted native order roster", () => {
  it("renders real route IDs, member references, money, dates and canonical states", async () => {
    const calls = stubResponse(await routeResponse([record("manual_review"), record("payment_captured", 1)]));
    await renderPage();
    expect(visibleOrderIds()).toEqual(["native-payment_captured-1", "native-manual_review-0"]);
    expect(container.querySelector('tbody a')?.getAttribute("href")).toBe("/admin/research/orders/native-payment_captured-1");
    expect(container.textContent).toContain("member-1");
    expect(container.textContent).toContain("$123.45");
    expect(container.textContent).toContain("Payment received");
    expect(container.textContent).toContain("Pending review");
    expect(container.textContent).toContain("Sep 21, 2026");
    expect(container.textContent).toContain("Not recorded");
    expect(container.textContent).not.toMatch(/NaN|undefined/);
    const requests = calls.filter((call) => call.path === PATH);
    expect(requests).toHaveLength(1);
    expect(requests[0].init).toMatchObject({ method: "GET", cache: "no-store", headers: { Authorization: "Bearer synthetic-admin-token" } });
  });

  it("filters every native lifecycle state locally instead of sending ignored status queries", async () => {
    const calls = stubResponse(await routeResponse(ORDER_STATES.map((state, index) => record(state, index))));
    await renderPage();
    const queues: Array<[string, OrderState[]]> = [
      ["Awaiting payment", ["draft", "checkout_pending", "payment_authorized", "approved"]],
      ["Needs review", ["manual_review", "exception"]],
      ["Paid", ["payment_captured"]],
      ["Fulfilling", ["processing", "partially_fulfilled"]],
      ["Shipped", ["fulfilled", "delivered"]],
      ["Closed", ["cancelled", "refunded", "replaced"]],
    ];
    for (const [label, states] of queues) {
      await act(async () => tab(label).click());
      expect(visibleOrderIds().sort()).toEqual(states.map((state) => `native-${state}-${ORDER_STATES.indexOf(state)}`).sort());
    }
    await act(async () => tab("All").click());
    expect(visibleOrderIds()).toHaveLength(ORDER_STATES.length);
    expect(calls.filter((call) => call.path === PATH)).toHaveLength(1);
  });

  it("searches canonical order and member IDs without legacy field crashes", async () => {
    stubResponse(await routeResponse([record("payment_captured", 1), record("manual_review", 2)]));
    await renderPage();
    const label = Array.from(container.querySelectorAll("label")).find((element) => element.textContent === "Search orders")!;
    const input = document.getElementById(label.htmlFor) as HTMLInputElement;
    expect(input).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    for (const value of ["MEMBER-1", "NATIVE-PAYMENT_CAPTURED-1"]) {
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
      expect(visibleOrderIds()).toEqual(["native-payment_captured-1"]);
    }
  });

  it("paginates the real roster and resets the page on a queue change", async () => {
    stubResponse(await routeResponse(Array.from({ length: 23 }, (_, index) => record("payment_captured", index))));
    await renderPage();
    expect(visibleOrderIds()).toHaveLength(20);
    const next = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="Pagination"] button')).find((el) => el.textContent === "Next")!;
    expect(next).toBeDefined();
    await act(async () => next.click());
    expect(visibleOrderIds()).toHaveLength(3);
    await act(async () => tab("Paid").click());
    expect(visibleOrderIds()).toHaveLength(20);
  });

  it("renders a true empty queue only for a successful canonical empty response", async () => {
    stubResponse(await routeResponse([]));
    await renderPage();
    expect(container.textContent).toContain("No orders in this queue.");
  });

  it("does not turn an unavailable source into an empty-order claim", async () => {
    stubResponse({ ok: false, code: "capability_disabled" }, 503);
    await renderPage();
    expect(container.textContent).toContain("The order queue is unavailable.");
    expect(container.textContent).toContain("This does not mean there are no orders");
    expect(container.textContent).not.toContain("No orders in this queue.");
  });

  it("rejects the obsolete DTO instead of rendering broken links and NaN money", async () => {
    stubResponse({ ok: true, orders: [{ id: "legacy-id", reference: "legacy", total_cents: 12345 }] });
    await renderPage();
    expect(container.textContent).toContain("The order queue could not be verified.");
    expect(container.textContent).not.toContain("No orders in this queue.");
    expect(container.querySelector("tbody")).toBeNull();
  });
});
