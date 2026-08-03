import { describe, expect, it } from "vitest";
import {
  FULFILLMENT_NOTIFICATION_EVENTS,
  buildFulfillmentNotification,
  type FulfillmentNotificationInput,
} from "./notifications";

const AT = "2026-08-02T23:00:00.000Z";

const BASE = {
  schemaVersion: 1,
  eventId: "11111111-1111-4111-8111-111111111111",
  occurredAt: AT,
  fulfillmentOrderId: "22222222-2222-4222-8222-222222222222",
  assignmentId: "33333333-3333-4333-8333-333333333333",
  supplierId: "44444444-4444-4444-8444-444444444444",
  orderReference: "XR-ORDER-1001",
  shipmentReference: "XR-SHIP-1001",
} as const;

function inputFor(
  eventType: (typeof FULFILLMENT_NOTIFICATION_EVENTS)[number],
): FulfillmentNotificationInput {
  switch (eventType) {
    case "shipment_shipped":
    case "shipment_delivered":
      return {
        ...BASE,
        eventType,
        carrierCode: "ups",
        trackingReference: "1Z999AA10123456784",
        expectedDeliveryAt: "2026-08-05T23:00:00.000Z",
      };
    case "shipment_delayed":
      return { ...BASE, eventType, delayCode: "carrier_delay" };
    case "shipment_exception":
      return { ...BASE, eventType, exceptionCode: "carrier_exception" };
    case "replacement_created":
      return { ...BASE, eventType, replacementReference: "XR-REPLACE-1001" };
    case "return_authorized":
      return { ...BASE, eventType, returnReference: "XR-RETURN-1001" };
    case "recall_opened":
      return { ...BASE, eventType, recallReference: "XR-RECALL-1001" };
    default:
      return { ...BASE, eventType };
  }
}

describe("fulfillment notification contract", () => {
  it("projects a shipped customer event without supplier or internal identifiers", () => {
    const notification = buildFulfillmentNotification(
      inputFor("shipment_shipped"),
      "customer",
    );

    expect(notification).toEqual({
      schemaVersion: 1,
      eventKey:
        "fulfillment:11111111-1111-4111-8111-111111111111:customer",
      eventId: "11111111-1111-4111-8111-111111111111",
      eventType: "shipment_shipped",
      audience: "customer",
      templateKey: "fulfillment_customer_shipment_shipped",
      occurredAt: AT,
      payload: {
        orderReference: "XR-ORDER-1001",
        shipmentReference: "XR-SHIP-1001",
        statusCode: "shipped",
        occurredAt: AT,
        carrierCode: "ups",
        trackingReference: "1Z999AA10123456784",
        expectedDeliveryAt: "2026-08-05T23:00:00.000Z",
      },
    });
    expect(notification.payload).not.toHaveProperty("supplierId");
    expect(notification.payload).not.toHaveProperty("assignmentId");
    expect(notification.payload).not.toHaveProperty("fulfillmentOrderId");
  });

  it("adds exact operational identifiers only for the operations audience", () => {
    const notification = buildFulfillmentNotification(
      inputFor("shipment_exception"),
      "operations",
    );

    expect(notification.payload).toMatchObject({
      statusCode: "exception",
      reasonCode: "carrier_exception",
      fulfillmentOrderId: BASE.fulfillmentOrderId,
      assignmentId: BASE.assignmentId,
      supplierId: BASE.supplierId,
    });
    expect(notification.payload).not.toHaveProperty("recipient");
    expect(notification.payload).not.toHaveProperty("address");
  });

  it.each(FULFILLMENT_NOTIFICATION_EVENTS)(
    "has deterministic customer and operations templates for %s",
    (eventType) => {
      const input = inputFor(eventType);
      const customer = buildFulfillmentNotification(input, "customer");
      const operations = buildFulfillmentNotification(input, "operations");

      expect(customer.templateKey).toBe(`fulfillment_customer_${eventType}`);
      expect(operations.templateKey).toBe(`fulfillment_ops_${eventType}`);
      expect(customer.payload.statusCode).toBeTruthy();
      expect(operations.payload.statusCode).toBe(customer.payload.statusCode);
    },
  );

  it("refuses rich or private fields instead of silently dropping them", () => {
    const forbidden = [
      ["memberEmail", "person@example.com"],
      ["shippingAddress", { line1: "10 Private Way" }],
      ["paymentAmount", 9900],
      ["wholesalePrice", 1200],
      ["affiliateCode", "PRIVATE"],
      ["clinicalNote", "private"],
      ["internalNote", "private"],
      ["exceptionDetail", "unbounded free text"],
    ] as const;

    for (const [key, value] of forbidden) {
      expect(() =>
        buildFulfillmentNotification(
          { ...inputFor("shipment_exception"), [key]: value },
          "customer",
        ),
      ).toThrow();
    }
  });

  it("requires event-specific fixed evidence and refuses guessed carrier data", () => {
    const shipped = inputFor("shipment_shipped") as Record<string, unknown>;
    const { trackingReference: _tracking, ...withoutTracking } = shipped;

    expect(() =>
      buildFulfillmentNotification(withoutTracking, "customer"),
    ).toThrow();
    expect(() =>
      buildFulfillmentNotification(
        { ...shipped, carrierCode: "unknown_carrier" },
        "customer",
      ),
    ).toThrow();
    expect(() =>
      buildFulfillmentNotification(
        {
          ...inputFor("shipment_exception"),
          exceptionCode: "something happened",
        },
        "customer",
      ),
    ).toThrow();
  });

  it("rejects malformed identifiers, noncanonical instants, and unknown audiences", () => {
    expect(() =>
      buildFulfillmentNotification(
        {
          ...inputFor("shipment_packed"),
          eventId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        },
        "customer",
      ),
    ).toThrow(/canonical lowercase UUID/);
    expect(() =>
      buildFulfillmentNotification(
        { ...inputFor("shipment_packed"), occurredAt: "2026-08-02T23:00:00Z" },
        "customer",
      ),
    ).toThrow(/normalized millisecond UTC instant/);
    expect(() =>
      buildFulfillmentNotification(inputFor("shipment_packed"), "supplier"),
    ).toThrow();
  });

  it("is byte-deterministic and does not mutate the source input", () => {
    const input = inputFor("recall_opened");
    const before = JSON.stringify(input);
    const first = buildFulfillmentNotification(input, "customer");
    const second = buildFulfillmentNotification(input, "customer");

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(input)).toBe(before);
    expect(first.payload).toEqual({
      orderReference: BASE.orderReference,
      shipmentReference: BASE.shipmentReference,
      statusCode: "recall_notice",
      occurredAt: AT,
      recallReference: "XR-RECALL-1001",
    });
  });

  it("never emits forbidden customer, clinical, payment, or supplier-economic keys", () => {
    const output = FULFILLMENT_NOTIFICATION_EVENTS.flatMap((eventType) => [
      buildFulfillmentNotification(inputFor(eventType), "customer"),
      buildFulfillmentNotification(inputFor(eventType), "operations"),
    ]);
    const serialized = JSON.stringify(output);

    for (const marker of [
      "memberEmail",
      "recipientName",
      "shippingAddress",
      "payment",
      "wholesale",
      "margin",
      "affiliate",
      "clinical",
      "health",
      "internalNote",
      "exceptionDetail",
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });
});
