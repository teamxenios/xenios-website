// @vitest-environment jsdom
// The supplier workspace against the LIVE fulfillment endpoints
// (GET/POST /api/research/fulfillment/supplier/assignments...).
//
// The negative controls are the point of this file: a tracking number never
// reads as shipped, an internal-authority disposition is never offered, a
// widened projection is refused rather than displayed, no supplier id is ever
// sent, and a server refusal is reported rather than shown as success.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FulfillmentAssignmentView } from "@shared/research/fulfillment/contracts";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../core";
import SupplierWorkspace from "./Workspace";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

const CONTEXT = {
  gate: "open",
  member: { firstName: "Sam", status: "active", applicationStatus: null },
  memberToken: "supplier-jwt",
  memberChecking: false,
  recovery: "none",
} as unknown as ResearchContextValue;

const BASE: FulfillmentAssignmentView = {
  assignmentId: "asg_1",
  fulfillmentOrderId: "ful_1",
  orderReference: "XRR-1001",
  supplierId: "raw-peptides",
  supplierLabel: "Raw Peptides",
  state: "assigned",
  version: 3,
  expectedShipAt: "2026-08-22T00:00:00Z",
  recipient: {
    name: "A Quinn",
    addressLine1: "1 Test St",
    addressLine2: null,
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
    phone: null,
  },
  shippingService: "ground",
  handlingProfile: "ambient",
  lines: [{ lineId: "l1", sku: "SKU-1", quantity: 2, lotId: "lot_1", lotCode: "L-1" }],
  labelReference: null,
  carrier: null,
  trackingReference: null,
  updatedAt: "2026-08-20T00:00:00Z",
};

type Call = { url: string; method: string; body: string | undefined };

function stubFetch(
  assignments: FulfillmentAssignmentView[],
  post: { status: number; body: unknown } = { status: 200, body: { ok: true, result: {} } },
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), method, body: typeof init?.body === "string" ? init.body : undefined });
      const isPost = method === "POST";
      const status = isPost ? post.status : 200;
      const body = isPost ? post.body : { ok: true, assignments };
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => body,
      };
    }),
  );
  return calls;
}

function stubUnavailable(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 503,
      ok: false,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
    })),
  );
}

async function render(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={CONTEXT}>
        <SupplierWorkspace />
      </ResearchContext.Provider>,
    );
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

function buttonNamed(view: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(view.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
}

describe("supplier workspace: the assigned work", () => {
  it("renders the assignment with its lines, lot, and destination", async () => {
    stubFetch([BASE]);
    const view = await render();
    expect(view.textContent).toContain("XRR-1001");
    expect(view.textContent).toContain("2 x SKU-1");
    expect(view.textContent).toContain("lot L-1");
    expect(view.textContent).toContain("A Quinn");
    expect(view.textContent).toContain("Assigned to you");
  });

  it("offers acknowledge as the forward step and never an internal disposition", async () => {
    stubFetch([BASE]);
    const view = await render();
    expect(buttonNamed(view, "Acknowledge")).toBeTruthy();
    for (const forbidden of ["Cancel order", "Record recall", "Record refund", "Record replacement", "Record damage"]) {
      expect(buttonNamed(view, forbidden)).toBeUndefined();
    }
  });

  it("sends the action with the read version and no supplier id anywhere", async () => {
    const calls = stubFetch([BASE]);
    const view = await render();
    await act(async () => {
      buttonNamed(view, "Acknowledge")!.click();
    });
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/research/fulfillment/supplier/assignments/asg_1/transition");
    const body = JSON.parse(post?.body ?? "{}");
    expect(body.action).toBe("acknowledge");
    expect(body.expectedVersion).toBe(3);
    expect(body.idempotencyKey).toBeTruthy();
    // Supplier identity is resolved server-side; the client never names one.
    expect(post?.body).not.toContain("raw-peptides");
    expect(body.supplierId).toBeUndefined();
  });
});

describe("supplier workspace: a tracking number is not a shipment", () => {
  it("requires a tracking number before the tracking step can be submitted", async () => {
    stubFetch([{ ...BASE, state: "packed" }]);
    const view = await render();
    const addTracking = buttonNamed(view, "Add tracking")!;
    expect(addTracking.disabled).toBe(true);
  });

  it("says tracking is recorded but not shipped, and still offers Mark shipped", async () => {
    stubFetch([
      { ...BASE, state: "tracking_created", carrier: "UPS", trackingReference: "1Z999" },
    ]);
    const view = await render();
    expect(view.textContent).toContain("1Z999");
    expect(view.textContent).toContain("not yet marked shipped");
    expect(view.textContent).toContain("Tracking added, not yet shipped");
    expect(buttonNamed(view, "Mark shipped")).toBeTruthy();
  });

  it("does not show the not-yet-shipped caution once actually shipped", async () => {
    stubFetch([{ ...BASE, state: "shipped", carrier: "UPS", trackingReference: "1Z999" }]);
    const view = await render();
    expect(view.textContent).not.toContain("not yet marked shipped");
    expect(buttonNamed(view, "Mark delivered")).toBeTruthy();
  });
});

describe("supplier workspace: fails closed", () => {
  it("refuses to render an assignment carrying data a supplier must not see", async () => {
    const widened = { ...BASE, xeniosMarginCents: 4200 } as unknown as FulfillmentAssignmentView;
    stubFetch([widened]);
    const view = await render();
    expect(view.querySelector('[data-testid="sw-refused"]')).toBeTruthy();
    expect(view.textContent).toContain("must not show");
    // The number itself never reaches the page.
    expect(view.textContent).not.toContain("4200");
    expect(view.textContent).not.toContain("XRR-1001");
  });

  it("shows the honest not-switched-on state while supplier access is unwired", async () => {
    stubUnavailable();
    const view = await render();
    expect(view.textContent).toContain("Supplier access is not switched on yet.");
    expect(view.textContent).not.toContain("XRR-1001");
  });

  it("reports a server refusal instead of claiming the step succeeded", async () => {
    stubFetch([BASE], {
      status: 403,
      body: { ok: false, code: "FORBIDDEN", message: "This fulfillment disposition is an internal decision." },
    });
    const view = await render();
    await act(async () => {
      buttonNamed(view, "Acknowledge")!.click();
    });
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("internal decision");
  });

  it("says nothing was recorded when the write lands on an unwired surface", async () => {
    stubFetch([BASE], { status: 503, body: { ok: false, code: "NOT_CONFIGURED" } });
    const view = await render();
    await act(async () => {
      buttonNamed(view, "Acknowledge")!.click();
    });
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    expect(view.textContent).toContain("nothing was recorded");
  });

  it("reports an empty queue truthfully", async () => {
    stubFetch([]);
    const view = await render();
    expect(view.textContent).toContain("No work is assigned to you right now.");
  });
});
