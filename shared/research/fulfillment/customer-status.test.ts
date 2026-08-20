import { describe, expect, it } from "vitest";
import type {
  FulfillmentAssignmentView,
  FulfillmentState,
} from "./contracts";
import { FULFILLMENT_STATES } from "./contracts";
import {
  CUSTOMER_STATUS_LABELS,
  projectCustomerFulfillmentStatus,
} from "./customer-status";

function view(state: FulfillmentState): FulfillmentAssignmentView {
  return {
    assignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    fulfillmentOrderId: "55555555-5555-4555-8555-555555555555",
    orderReference: "XEN-1001",
    supplierId: "33333333-3333-4333-8333-333333333333",
    supplierLabel: "Supplier A",
    state,
    version: 5,
    expectedShipAt: "2026-08-21T00:00:00.000Z",
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
    handlingProfile: "cold_chain",
    lines: [
      {
        lineId: "66666666-6666-4666-8666-666666666666",
        sku: "XEN-SKU-1",
        quantity: 2,
        lotId: "77777777-7777-4777-8777-777777777777",
        lotCode: "LOT-100",
      },
    ],
    labelReference: "LBL-1",
    carrier: "UPS",
    trackingReference: "1Z999",
    updatedAt: "2026-08-19T12:00:00.000Z",
  };
}

describe("customer fulfillment status projection", () => {
  it("covers every internal state with a labeled customer status", () => {
    for (const state of FULFILLMENT_STATES) {
      const projected = projectCustomerFulfillmentStatus(view(state));
      expect(projected.status).toBeTruthy();
      expect(projected.statusLabel).toBe(CUSTOMER_STATUS_LABELS[projected.status]);
    }
  });

  it("never leaks supplier identity, lots, handling economics, or reasons", () => {
    for (const state of FULFILLMENT_STATES) {
      const projected = projectCustomerFulfillmentStatus(view(state)) as Record<
        string,
        unknown
      >;
      const serialized = JSON.stringify(projected);
      expect(serialized).not.toContain("Supplier A");
      expect(serialized).not.toContain("LOT-100");
      expect(serialized).not.toContain("cold_chain");
      expect(serialized).not.toContain("LBL-1");
      expect(projected.supplierId).toBeUndefined();
      expect(projected.supplierLabel).toBeUndefined();
      expect(projected.lines).toBeUndefined();
      expect(projected.handlingProfile).toBeUndefined();
    }
  });

  it("withholds tracking before tracking_created and never calls a label shipped", () => {
    const packed = projectCustomerFulfillmentStatus(view("packed"));
    expect(packed.trackingReference).toBeNull();
    expect(packed.carrier).toBeNull();
    expect(packed.shipped).toBe(false);

    const tracked = projectCustomerFulfillmentStatus(view("tracking_created"));
    expect(tracked.trackingReference).toBe("1Z999");
    expect(tracked.carrier).toBe("UPS");
    expect(tracked.status).toBe("tracking_created");
    expect(tracked.shipped).toBe(false);

    const shipped = projectCustomerFulfillmentStatus(view("shipped"));
    expect(shipped.shipped).toBe(true);
    const delivered = projectCustomerFulfillmentStatus(view("delivered"));
    expect(delivered.shipped).toBe(true);
  });

  it("keeps failure states generic for the customer", () => {
    for (const state of ["exception", "damaged", "lost"] as const) {
      expect(projectCustomerFulfillmentStatus(view(state)).status).toBe(
        "attention_required",
      );
    }
    expect(projectCustomerFulfillmentStatus(view("recalled")).status).toBe("recalled");
  });
});
