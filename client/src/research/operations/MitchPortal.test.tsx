// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  FulfillmentAssignmentView,
  FulfillmentState,
} from "@shared/research/fulfillment/contracts";
import { MitchPortal, type MitchPortalProps } from "./MitchPortal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const BASE_ASSIGNMENT: FulfillmentAssignmentView = {
  assignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  fulfillmentOrderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  orderReference: "ORDER-104",
  supplierId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  supplierLabel: "Verified supplier",
  state: "assigned",
  version: 1,
  expectedShipAt: null,
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
      quantity: 2,
      lotId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      lotCode: "LOT-EXACT",
    },
  ],
  labelReference: null,
  carrier: null,
  trackingReference: null,
  updatedAt: "2026-08-28T12:00:00.000Z",
};

function assignment(
  state: FulfillmentState,
  overrides: Partial<FulfillmentAssignmentView> = {},
): FulfillmentAssignmentView {
  return {
    ...BASE_ASSIGNMENT,
    state,
    orderReference: `ORDER-${state}`,
    ...overrides,
  };
}

async function render(
  item: FulfillmentAssignmentView,
  onCommand: NonNullable<MitchPortalProps["onCommand"]> = vi.fn(async () => undefined),
  authority: "supplier" | "internal" = "supplier",
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MitchPortal assignments={[item]} authority={authority} onCommand={onCommand} />,
    ),
  );
  return {
    host,
    onCommand,
    unmount: () =>
      act(() => {
        root.unmount();
        host.remove();
      }),
  };
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("MitchPortal", () => {
  it("shows only assigned minimum-necessary fulfillment facts", () => {
    const html = renderToStaticMarkup(<MitchPortal assignments={[BASE_ASSIGNMENT]} />);
    expect(html).toContain("ORDER-104");
    expect(html).toContain("SKU-EXACT");
    expect(html).toContain("LOT-EXACT");
    expect(html).toContain("TRACKING INTEGRATION REQUIRED");
    expect(html).not.toContain("member email");
    expect(html).not.toContain("assessment");
    expect(html).not.toContain("affiliate");
    expect(html).not.toContain("payment");
  });

  it("distinguishes a connected authoritative empty queue", () => {
    const html = renderToStaticMarkup(<MitchPortal assignments={[]} />);
    expect(html).toContain("No assigned fulfillment work.");
    expect(html).toContain("authoritative empty assignment queue");
  });

  it("preserves tracking, replacement, refunded, and every terminal state", () => {
    const states: FulfillmentState[] = [
      "tracking_created",
      "delivered",
      "returned",
      "replacement",
      "refunded",
      "damaged",
      "lost",
      "recalled",
      "cancelled",
    ];
    const html = renderToStaticMarkup(
      <MitchPortal assignments={states.map((state) => assignment(state))} />,
    );
    for (const state of states) {
      expect(html).toContain(state.replaceAll("_", " "));
    }
  });

  it("offers shipment only after tracking_created and never directly from packed", () => {
    const packed = renderToStaticMarkup(
      <MitchPortal assignments={[assignment("packed")]} onCommand={vi.fn()} />,
    );
    expect(packed).toContain("Record tracking");
    expect(packed).not.toContain("Record shipment");

    const tracked = renderToStaticMarkup(
      <MitchPortal
        assignments={[
          assignment("tracking_created", {
            labelReference: "LABEL-104",
            carrier: "UPS",
            trackingReference: "TRACK-104",
          }),
        ]}
        onCommand={vi.fn()}
      />,
    );
    expect(tracked).toContain("Record shipment");
    expect(tracked).not.toContain("Record tracking");
  });

  it("suppresses all supplier commands and exception controls on terminal states", () => {
    const terminalStates: FulfillmentState[] = [
      "delivered",
      "returned",
      "replacement",
      "refunded",
      "damaged",
      "lost",
      "recalled",
      "cancelled",
    ];
    for (const state of terminalStates) {
      const html = renderToStaticMarkup(
        <MitchPortal assignments={[assignment(state)]} onCommand={vi.fn()} />,
      );
      expect(html).not.toContain("<button");
      expect(html).not.toContain("Report exception");
    }
  });

  it("exposes the exact internal reason-required disposition matrix", () => {
    const cases: Array<[FulfillmentState, string[]]> = [
      ["delivered", ["Record return", "Record damage", "Record loss", "Record recall"]],
      [
        "exception",
        [
          "Start picking",
          "Cancel",
          "Record return",
          "Record replacement disposition",
          "Record refund disposition",
          "Record damage",
          "Record loss",
          "Record recall",
        ],
      ],
      ["returned", ["Record replacement disposition", "Record refund disposition"]],
      ["damaged", ["Record replacement disposition", "Record refund disposition"]],
      ["lost", ["Record replacement disposition", "Record refund disposition"]],
      ["recalled", ["Record replacement disposition", "Record refund disposition"]],
      ["cancelled", ["Record refund disposition"]],
    ];

    for (const [state, expected] of cases) {
      const host = document.createElement("div");
      host.innerHTML = renderToStaticMarkup(
        <MitchPortal assignments={[assignment(state)]} authority="internal" onCommand={vi.fn()} />,
      );
      expect(Array.from(host.querySelectorAll("button"), (button) => button.textContent)).toEqual(
        expected,
      );
      expect(host.textContent).not.toContain("Report exception");
    }
  });

  it("keeps replacement and refunded terminal even for internal authority", () => {
    for (const state of ["replacement", "refunded"] as const) {
      const html = renderToStaticMarkup(
        <MitchPortal assignments={[assignment(state)]} authority="internal" onCommand={vi.fn()} />,
      );
      expect(html).not.toContain("<button");
      expect(html).not.toContain("Disposition reason");
    }
  });

  it("requires a concise reason before an internal disposition is submitted", async () => {
    const onCommand = vi.fn(async () => undefined);
    const item = assignment("delivered");
    const view = await render(item, onCommand, "internal");
    const returnButton = Array.from(view.host.querySelectorAll("button")).find(
      (button) => button.textContent === "Record return",
    ) as HTMLButtonElement;

    act(() => returnButton.click());
    expect(onCommand).not.toHaveBeenCalled();
    expect(view.host.textContent).toContain("Enter a disposition reason between 3 and 500 characters.");

    type(view.host.querySelector('input[required][maxlength="500"]') as HTMLInputElement, "Package returned unopened");
    await act(async () => {
      returnButton.click();
      await Promise.resolve();
    });
    expect(onCommand).toHaveBeenCalledWith(item, {
      action: "record_return",
      reason: "Package returned unopened",
    });
    view.unmount();
  });

  it("does not publish mutation controls without command wiring", () => {
    const html = renderToStaticMarkup(<MitchPortal assignments={[BASE_ASSIGNMENT]} />);
    expect(html).not.toContain("Acknowledge");
    expect(html).not.toContain("Report exception");
  });

  it("locks an assignment synchronously so a double click submits once", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onCommand = vi.fn(() => pending);
    const view = await render(BASE_ASSIGNMENT, onCommand);
    const button = Array.from(view.host.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Acknowledge",
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
      button.click();
      await Promise.resolve();
    });

    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Recording...");

    await act(async () => {
      release?.();
      await pending;
    });
    expect(button.disabled).toBe(false);
    view.unmount();
  });
});
