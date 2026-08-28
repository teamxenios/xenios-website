// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FulfillmentAssignmentView } from "@shared/research/fulfillment/contracts";
import { FulfillmentBody, isFulfillmentAssignmentView } from "./Fulfillment";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  apiGet: api.get,
  apiPost: api.post,
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("./AdminResearchHome", () => ({
  AdminScreen: ({ children }: { children: (token: string) => ReactNode }) => <>{children("admin-token")}</>,
  AdminBoundary: ({
    state,
    unavailableTitle,
    unavailableBody,
    children,
  }: {
    state: string;
    unavailableTitle: string;
    unavailableBody: string;
    children: ReactNode;
  }) =>
    state === "ok" ? (
      <>{children}</>
    ) : state === "unavailable" ? (
      <div>{`${unavailableTitle} ${unavailableBody}`}</div>
    ) : (
      <div>{state}</div>
    ),
}));

const ASSIGNMENT: FulfillmentAssignmentView = {
  assignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  fulfillmentOrderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  orderReference: "ORDER-104",
  supplierId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  supplierLabel: "Verified supplier",
  state: "assigned",
  version: 4,
  expectedShipAt: "2026-08-29T12:00:00.000Z",
  recipient: {
    name: "Recipient",
    addressLine1: "10 Delivery Way",
    addressLine2: null,
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    country: "US",
    phone: null,
  },
  shippingService: "ground",
  handlingProfile: "ambient",
  lines: [
    {
      lineId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sku: "SKU-EXACT",
      quantity: 1,
      lotId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      lotCode: "LOT-EXACT",
    },
  ],
  labelReference: null,
  carrier: null,
  trackingReference: null,
  updatedAt: "2026-08-28T12:00:00.000Z",
};

async function renderBody() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<FulfillmentBody token="admin-token" />);
    await Promise.resolve();
  });
  return {
    host,
    unmount: () =>
      act(() => {
        root.unmount();
        host.remove();
      }),
  };
}

function actionButton(host: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  ) as HTMLButtonElement;
}

describe("canonical admin fulfillment screen", () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue({
      kind: "ok",
      data: { ok: true, assignments: [ASSIGNMENT] },
    });
    api.post.mockReset();
  });

  it("reads the canonical admin engine path", async () => {
    const view = await renderBody();
    expect(api.get).toHaveBeenCalledWith(
      "/api/research/fulfillment/admin/assignments",
      "admin-token",
    );
    expect(view.host.textContent).toContain("ORDER-104");
    view.unmount();
  });

  it("shows an unavailable engine explicitly and never calls it an empty queue", async () => {
    api.get.mockResolvedValue({ kind: "unavailable" });
    const view = await renderBody();
    expect(view.host.textContent).toContain("The canonical fulfillment engine is not available.");
    expect(view.host.textContent).toContain("No queue or zero count is inferred.");
    expect(view.host.textContent).not.toContain("No assigned fulfillment work.");
    view.unmount();
  });

  it("fails the whole view closed when even one assignment is malformed", async () => {
    api.get.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        assignments: [ASSIGNMENT, { ...ASSIGNMENT, assignmentId: "bad", state: "invented" }],
      },
    });
    const view = await renderBody();
    expect(view.host.textContent).toContain("Fulfillment queue data is unavailable.");
    expect(view.host.textContent).toContain("1 invalid assignment");
    expect(view.host.textContent).not.toContain("ORDER-104");
    view.unmount();
  });

  it("rejects empty, blank, duplicate, timestamp-invalid, and contradictory assignment evidence", () => {
    const secondLine = {
      ...ASSIGNMENT.lines[0],
      lineId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    };
    const invalid: unknown[] = [
      { ...ASSIGNMENT, lines: [] },
      { ...ASSIGNMENT, assignmentId: "   " },
      { ...ASSIGNMENT, orderReference: "\t" },
      { ...ASSIGNMENT, supplierLabel: " " },
      { ...ASSIGNMENT, updatedAt: "2026-08-28" },
      { ...ASSIGNMENT, expectedShipAt: "tomorrow" },
      { ...ASSIGNMENT, lines: [{ ...ASSIGNMENT.lines[0], sku: " " }] },
      { ...ASSIGNMENT, lines: [{ ...ASSIGNMENT.lines[0], lotCode: "\n" }] },
      { ...ASSIGNMENT, lines: [ASSIGNMENT.lines[0], ASSIGNMENT.lines[0]] },
      { ...ASSIGNMENT, lines: [ASSIGNMENT.lines[0], secondLine], carrier: "UPS" },
      { ...ASSIGNMENT, state: "packed", labelReference: null },
      {
        ...ASSIGNMENT,
        state: "tracking_created",
        labelReference: "LABEL-104",
        carrier: "UPS",
        trackingReference: null,
      },
      {
        ...ASSIGNMENT,
        state: "shipped",
        labelReference: null,
        carrier: "UPS",
        trackingReference: "TRACK-104",
      },
    ];

    expect(isFulfillmentAssignmentView(ASSIGNMENT)).toBe(true);
    for (const candidate of invalid) {
      expect(isFulfillmentAssignmentView(candidate)).toBe(false);
    }
  });

  it("accepts evidence-complete tracked states and evidence-free final dispositions", () => {
    const trackingEvidence = {
      labelReference: "LABEL-104",
      carrier: "UPS",
      trackingReference: "TRACK-104",
    };
    for (const state of ["tracking_created", "shipped", "delivered"] as const) {
      expect(isFulfillmentAssignmentView({ ...ASSIGNMENT, ...trackingEvidence, state })).toBe(true);
    }
    for (const state of ["replacement", "refunded"] as const) {
      expect(isFulfillmentAssignmentView({ ...ASSIGNMENT, state })).toBe(true);
    }
  });

  it("opts the admin surface into internal disposition authority", async () => {
    api.get.mockResolvedValue({
      kind: "ok",
      data: {
        ok: true,
        assignments: [
          {
            ...ASSIGNMENT,
            state: "delivered",
            labelReference: "LABEL-104",
            carrier: "UPS",
            trackingReference: "TRACK-104",
          },
        ],
      },
    });
    const view = await renderBody();
    expect(actionButton(view.host, "Record return")).toBeTruthy();
    expect(actionButton(view.host, "Record damage")).toBeTruthy();
    expect(actionButton(view.host, "Record loss")).toBeTruthy();
    expect(actionButton(view.host, "Record recall")).toBeTruthy();
    expect(view.host.textContent).not.toContain("Record refund disposition");
    view.unmount();
  });

  it("posts a canonical transition and reuses its idempotency key on retry", async () => {
    api.post
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValueOnce({
        kind: "ok",
        data: {
          ok: true,
          result: {
            assignmentId: ASSIGNMENT.assignmentId,
            state: "acknowledged",
            version: 5,
            idempotentReplay: false,
          },
        },
      });
    const view = await renderBody();

    await act(async () => {
      actionButton(view.host, "Acknowledge").click();
      await Promise.resolve();
    });
    expect(view.host.textContent).toContain("canonical engine is not mounted");

    await act(async () => {
      actionButton(view.host, "Acknowledge").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.post).toHaveBeenCalledTimes(2);
    const [firstPath, firstBody, firstToken] = api.post.mock.calls[0];
    const [secondPath, secondBody, secondToken] = api.post.mock.calls[1];
    expect(firstPath).toBe(
      `/api/research/fulfillment/admin/assignments/${ASSIGNMENT.assignmentId}/transition`,
    );
    expect(secondPath).toBe(firstPath);
    expect(firstToken).toBe("admin-token");
    expect(secondToken).toBe("admin-token");
    expect(firstBody).toMatchObject({ action: "acknowledge", expectedVersion: 4 });
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey);
    expect(firstBody.idempotencyKey).toMatch(/^fulfillment:/);
    view.unmount();
  });
});
