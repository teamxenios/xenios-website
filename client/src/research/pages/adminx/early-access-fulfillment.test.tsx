// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EarlyAccessAdminPaymentOrderDto,
  EarlyAccessSupplierOrderReadDto,
} from "../../adapters/earlyAccessAdminOrders";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// ---------------------------------------------------------------------------
// The fulfillment operations screen. What is tested here is honesty at the
// boundaries: the settled queue's fail-closed 503 renders as an explicit
// unavailable state and NEVER as an empty queue; a malformed order number
// never reaches the server; and the shipped door's TRACKING_REQUIRED 409
// surfaces as the operator's next action rather than a generic failure.
// ---------------------------------------------------------------------------

const QUEUE_ORDER: EarlyAccessAdminPaymentOrderDto = {
  orderNumber: "XEA-0123456789ABCDEF",
  placedAt: "2026-08-18T12:00:00.000Z",
  paymentState: "under_review",
  payableTotalCents: 47_760,
  currency: "USD",
  sku: "EA-SKU-1",
  quantity: 2,
  contact: { email: "customer@example.com", phone: "+15550000000" },
  paymentReference: "XEA-REF",
  proofCount: 1,
  currentProof: {
    reviewedProofRef: "eap.1",
    filename: "transfer.png",
    contentType: "image/png",
    byteSize: 1200,
    sha256: "b".repeat(64),
    method: "zelle",
    submittedAt: "2026-08-18T13:00:00.000Z",
  },
};

const SUPPLIER_VIEW: EarlyAccessSupplierOrderReadDto = {
  ok: true,
  packet: {
    releaseId: "rel-XEA-0123456789ABCDEF",
    orderReference: "XEA-0123456789ABCDEF",
    supplierId: "supplier.one",
    supplierSku: "SKU-0001",
    quantity: 2,
    recipient: {
      recipientName: "Jane Researcher",
      line1: "1 Lab Way",
      line2: null,
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US",
    },
  },
  supplierOrder: {
    releaseId: "rel-XEA-0123456789ABCDEF",
    orderId: "XEA-0123456789ABCDEF",
    supplierId: "supplier.one",
    supplierSku: "SKU-0001",
    quantity: 2,
    releasedByActorId: "founder.aaaa1111",
    releasedAt: "2026-08-18T14:00:00.000Z",
    verificationIdempotencyKey: "ea-confirm-key-000001",
  },
  events: [],
  tracking: [],
  fulfillment: null,
};

const adapters = vi.hoisted(() => ({
  listQueue: vi.fn(),
  fulfillmentQueue: vi.fn(),
  getSupplierOrder: vi.fn(),
  postTracking: vi.fn(),
  markShipped: vi.fn(),
}));

vi.mock("../../adapters/earlyAccessAdminOrders", () => ({
  listEarlyAccessPaymentQueue: adapters.listQueue,
  listEarlyAccessFulfillmentQueue: adapters.fulfillmentQueue,
  getEarlyAccessSupplierOrder: adapters.getSupplierOrder,
  postEarlyAccessTracking: adapters.postTracking,
  markEarlyAccessShipped: adapters.markShipped,
  // Imported by the cockpit (AdminResearchHome), which this page reaches
  // through AdminScreen/AdminBoundary; unused by these tests.
  listEarlyAccessAdminExceptions: vi.fn(async () => ({ kind: "unavailable" })),
  countAssistedOrdersSubmitted: vi.fn(async () => ({ kind: "unavailable" })),
  getEarlyAccessPaymentOrder: vi.fn(async () => ({ kind: "unavailable" })),
}));

async function render() {
  const { FulfillmentOperationsBody } = await import("./EarlyAccessFulfillment");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<FulfillmentOperationsBody token="admin-token" />));
  return { host, unmount: () => act(() => root.unmount()) };
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function lookup(host: HTMLElement, orderNumber: string) {
  type(host.querySelector("#ea-dispatch-order-number") as HTMLInputElement, orderNumber);
  await act(async () => {
    (host.querySelector('form[aria-label="Find an order to dispatch"]') as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

describe("the Early Access fulfillment screen", () => {
  beforeEach(() => {
    adapters.listQueue.mockReset().mockResolvedValue({ kind: "ok", data: { ok: true, items: [QUEUE_ORDER] } });
    adapters.fulfillmentQueue.mockReset().mockResolvedValue({ kind: "unavailable" });
    adapters.getSupplierOrder.mockReset();
    adapters.postTracking.mockReset();
    adapters.markShipped.mockReset();
  });

  it("renders the live payment review queue with server figures", async () => {
    const view = await render();
    expect(view.host.textContent).toContain("XEA-0123456789ABCDEF");
    expect(view.host.textContent).toContain("$477.60 USD");
    expect(view.host.textContent).toContain("zelle - transfer.png");
    view.unmount();
  });

  it("renders the settled queue's fail-closed 503 as unavailable, never as empty", async () => {
    const view = await render();
    expect(view.host.textContent).toContain("The settled-awaiting-fulfillment queue is not available yet.");
    // The honest-unavailable copy, not the empty-queue copy.
    expect(view.host.textContent).not.toContain("Every settled order has a recorded shipment.");
    view.unmount();
  });

  it("refuses a malformed order number without calling the server", async () => {
    const view = await render();
    await lookup(view.host, "not-an-order");
    expect(view.host.textContent).toContain("That is not an Early Access order number.");
    expect(adapters.getSupplierOrder).not.toHaveBeenCalled();
    view.unmount();
  });

  it("loads the supplier packet, with the shipping address, for a real order", async () => {
    adapters.getSupplierOrder.mockResolvedValue({ kind: "ok", data: SUPPLIER_VIEW });
    const view = await render();
    await lookup(view.host, "XEA-0123456789ABCDEF");
    expect(adapters.getSupplierOrder).toHaveBeenCalledWith("admin-token", "XEA-0123456789ABCDEF");
    expect(view.host.textContent).toContain("Jane Researcher");
    expect(view.host.textContent).toContain("2 x SKU-0001 via supplier.one");
    view.unmount();
  });

  it("surfaces PAYMENT_NOT_VERIFIED as guidance rather than an error", async () => {
    adapters.getSupplierOrder.mockResolvedValue({ kind: "denied", code: "PAYMENT_NOT_VERIFIED" });
    const view = await render();
    await lookup(view.host, "XEA-0123456789ABCDEF");
    expect(view.host.textContent).toContain("has not been confirmed by a named human");
    view.unmount();
  });

  it("surfaces the shipped door's TRACKING_REQUIRED 409 as the next action", async () => {
    adapters.getSupplierOrder.mockResolvedValue({ kind: "ok", data: SUPPLIER_VIEW });
    adapters.markShipped.mockResolvedValue({ kind: "denied", code: "TRACKING_REQUIRED" });
    const view = await render();
    await lookup(view.host, "XEA-0123456789ABCDEF");

    await act(async () => {
      (view.host.querySelector('[data-testid="button-ea-mark-shipped"]') as HTMLButtonElement).click();
    });

    expect(adapters.markShipped).toHaveBeenCalledWith("admin-token", "XEA-0123456789ABCDEF");
    expect(view.host.textContent).toContain("Record the carrier and tracking number first");
    view.unmount();
  });

  it("posts tracking and re-reads the order instead of trusting the browser", async () => {
    adapters.getSupplierOrder.mockResolvedValue({ kind: "ok", data: SUPPLIER_VIEW });
    adapters.postTracking.mockResolvedValue({
      kind: "ok",
      data: { ...SUPPLIER_VIEW, paymentState: "payment_verified" },
    });
    const view = await render();
    await lookup(view.host, "XEA-0123456789ABCDEF");

    type(view.host.querySelector("#ea-dispatch-carrier") as HTMLInputElement, "UPS");
    type(view.host.querySelector("#ea-dispatch-tracking-number") as HTMLInputElement, "1Z-TEST-000001");
    await act(async () => {
      (view.host.querySelector('form[aria-label="Record tracking"]') as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(adapters.postTracking).toHaveBeenCalledWith("admin-token", "XEA-0123456789ABCDEF", {
      carrier: "UPS",
      trackingNumber: "1Z-TEST-000001",
    });
    // One read at lookup, one re-read after the write.
    expect(adapters.getSupplierOrder).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
