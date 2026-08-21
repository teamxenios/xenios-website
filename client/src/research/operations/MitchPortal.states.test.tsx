import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  FULFILLMENT_STATES,
  fulfillmentActionsFor,
  SUPPLIER_PERMITTED_ACTIONS,
  type FulfillmentAssignmentView,
  type FulfillmentState,
} from "@shared/research/fulfillment/contracts";
import { MitchPortal } from "./MitchPortal";

// ---------------------------------------------------------------------------
// These pin the defect class that let the admin surface drift away from the
// engine: three separate hardcoded state lists. The queue silently dropped
// every assignment in a state it had not been taught about, and it offered
// "Record shipment" on `packed`, which the server refuses because shipping is
// reachable only once tracking has been recorded.
// ---------------------------------------------------------------------------

function assignment(state: FulfillmentState): FulfillmentAssignmentView {
  return {
    assignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    fulfillmentOrderId: "55555555-5555-4555-8555-555555555555",
    orderReference: "XEA-7F3K9QW2TM4BXYZ1",
    supplierId: "33333333-3333-4333-8333-333333333333",
    supplierLabel: "Supplier A",
    state,
    version: 2,
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
    lines: [],
    labelReference: null,
    carrier: null,
    trackingReference: null,
    updatedAt: "2026-08-21T12:00:00.000Z",
  };
}

function markup(state: FulfillmentState, withCommands = true): string {
  return renderToStaticMarkup(
    <MitchPortal
      assignments={[assignment(state)]}
      {...(withCommands ? { onCommand: vi.fn() } : {})}
    />,
  );
}

function buttonLabels(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
}

describe("the restricted fulfillment queue renders every canonical state", () => {
  it("shows an assignment in each state, including the ones added later", () => {
    for (const state of FULFILLMENT_STATES) {
      expect(
        markup(state, false),
        `state ${state} must not disappear from the queue`,
      ).toContain("XEA-7F3K9QW2TM4BXYZ1");
    }
  });

  it("covers the three states the old hardcoded list did not know", () => {
    for (const state of ["tracking_created", "replacement", "refunded"] as const) {
      expect(FULFILLMENT_STATES).toContain(state);
      expect(markup(state, false)).toContain("XEA-7F3K9QW2TM4BXYZ1");
    }
  });
});

describe("the queue offers only actions the engine will accept", () => {
  it("never offers shipment before tracking has been recorded", () => {
    const labels = buttonLabels(markup("packed"));
    expect(labels).not.toContain("Record shipment");
    expect(labels).toContain("Record tracking");
  });

  it("offers shipment once tracking exists", () => {
    expect(buttonLabels(markup("tracking_created"))).toContain("Record shipment");
  });

  it("never offers an internal-only disposition to this restricted queue", () => {
    for (const state of FULFILLMENT_STATES) {
      const labels = buttonLabels(markup(state)).join(" | ");
      for (const forbidden of ["Cancel", "Recall", "Refund", "Replacement", "Return"]) {
        expect(labels, `${state} must not offer ${forbidden}`).not.toMatch(
          new RegExp(forbidden, "i"),
        );
      }
    }
  });

  it("offers no action at all from a terminal state", () => {
    for (const state of ["replacement", "refunded"] as const) {
      expect(fulfillmentActionsFor(state)).toEqual([]);
      expect(buttonLabels(markup(state))).toEqual([]);
    }
  });

  it("only ever renders actions the graph allows AND a supplier may take", () => {
    const permitted = new Set<string>(SUPPLIER_PERMITTED_ACTIONS);
    for (const state of FULFILLMENT_STATES) {
      const rendered = buttonLabels(markup(state));
      const allowed = fulfillmentActionsFor(state).filter((a) => permitted.has(a));
      expect(rendered.length, `state ${state}`).toBe(allowed.length);
    }
  });
});
