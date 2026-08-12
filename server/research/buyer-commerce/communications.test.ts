import { describe, expect, it } from "vitest";

import { renderBuyerCommerceOutboxEmail, safeBuyerCommercePayload } from "./communications";

describe("buyer commerce shared-outbox renderer", () => {
  it("acknowledges a request without claiming price, payment, or fulfillment", () => {
    const rendered = renderBuyerCommerceOutboxEmail(
      "buyer_request_received",
      safeBuyerCommercePayload("buyer_request_received", {
        customerName: "Ada",
        requestRef: "XBR-1",
        lines: [{ name: "BPC 5 mg", quantity: 50 }],
        customerRef: "must-not-pass",
      }),
    );
    expect(rendered?.text).toContain("request acknowledgement");
    expect(rendered?.text).toContain("final pricing");
    expect(JSON.stringify(rendered)).not.toContain("must-not-pass");
  });

  it("keeps customer contact and shipping detail out of the operations email", () => {
    const payload = safeBuyerCommercePayload("buyer_request_operations", {
      requestRef: "XBR-1",
      lineCount: 3,
      manualReviewCount: 2,
      carePathwayCount: 0,
      customerEmail: "ada@example.com",
      shippingAddress: "secret",
    });
    expect(payload).toEqual({
      requestRef: "XBR-1",
      lineCount: 3,
      manualReviewCount: 2,
      carePathwayCount: 0,
    });
  });
});
