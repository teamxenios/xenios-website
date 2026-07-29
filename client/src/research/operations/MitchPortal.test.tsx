import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FulfillmentAssignmentView } from "@shared/research/fulfillment/contracts";
import { MitchPortal } from "./MitchPortal";

const assignment: FulfillmentAssignmentView = {
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
  updatedAt: "2026-07-28T12:00:00.000Z",
};

describe("MitchPortal", () => {
  it("shows only assigned minimum-necessary fulfillment facts", () => {
    const html = renderToStaticMarkup(<MitchPortal assignments={[assignment]} />);
    expect(html).toContain("ORDER-104");
    expect(html).toContain("SKU-EXACT");
    expect(html).toContain("LOT-EXACT");
    expect(html).toContain("TRACKING INTEGRATION REQUIRED");
    expect(html).not.toContain("member email");
    expect(html).not.toContain("assessment");
    expect(html).not.toContain("affiliate");
    expect(html).not.toContain("payment");
  });

  it("renders a truthful empty state", () => {
    const html = renderToStaticMarkup(<MitchPortal assignments={[]} />);
    expect(html).toContain("No assigned fulfillment work.");
    expect(html).toContain("explicitly assigned");
  });

  it("shows one state-primary action when command wiring exists", () => {
    const onCommand = vi.fn();
    const html = renderToStaticMarkup(
      <MitchPortal assignments={[assignment]} onCommand={onCommand} />,
    );
    expect(html).toContain("Acknowledge");
    expect(html).toContain("Report exception");
    expect(html).not.toContain("Start picking");
  });

  it("does not publish dead mutation controls without command wiring", () => {
    const html = renderToStaticMarkup(<MitchPortal assignments={[assignment]} />);
    expect(html).not.toContain("Acknowledge");
    expect(html).not.toContain("Report exception");
  });
});
