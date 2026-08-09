import { describe, expect, it } from "vitest";
import { projectEarlyAccessShipmentEvents, type EarlyAccessShipmentEvent } from "./shipment-status";

const base = {
  cartCheckoutNumber: "XEC-1234567890ABCDEF",
  lines: [
    { orderNumber: "XEA-CART-1234567890ABCDEF-01", quantity: 1 },
    { orderNumber: "XEA-CART-1234567890ABCDEF-02", quantity: 2 },
  ],
  paymentVerifiedAt: "2026-08-09T01:00:00.000Z",
  shipByAt: "2026-08-12T01:00:00.000Z",
  nowIso: "2026-08-12T01:00:00.001Z",
} as const;

function event(overrides: Partial<EarlyAccessShipmentEvent> = {}): EarlyAccessShipmentEvent {
  return {
    eventId: "shipment:event:1",
    cartCheckoutNumber: base.cartCheckoutNumber,
    orderNumber: base.lines[0].orderNumber,
    kind: "shipment_shipped",
    tracking: [],
    recordedAt: "2026-08-10T00:00:00.000Z",
    recordedBy: "admin@example.com",
    supersedesEventId: null,
    ...overrides,
  };
}

describe("Early Access shipment current projection", () => {
  it("defines partial shipment and keeps an unshipped remainder overdue", () => {
    const result = projectEarlyAccessShipmentEvents({ ...base, events: [event()] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fulfilment.stage).toBe("partially_shipped");
    expect(result.fulfilment.overdue).toBe(true);
  });

  it("uses append-only tracking corrections as current without erasing the original", () => {
    const shipped = event();
    const original = event({
      eventId: "tracking:event:1",
      kind: "tracking_added",
      tracking: ["TRACK-OLD"],
      recordedAt: "2026-08-10T00:01:00.000Z",
    });
    const corrected = event({
      eventId: "tracking:event:2",
      kind: "tracking_corrected",
      tracking: ["TRACK-CORRECT"],
      recordedAt: "2026-08-10T00:05:00.000Z",
      supersedesEventId: original.eventId,
    });
    const result = projectEarlyAccessShipmentEvents({ ...base, events: [shipped, original, corrected] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fulfilment.lines[0].tracking).toEqual(["TRACK-CORRECT"]);
    expect([original, corrected]).toHaveLength(2);
  });

  it("refuses a correction that targets another child order", () => {
    const original = event({
      eventId: "tracking:event:1",
      kind: "tracking_added",
      tracking: ["TRACK-OLD"],
    });
    const bad = event({
      eventId: "shipment:event:2",
      orderNumber: base.lines[1].orderNumber,
      kind: "tracking_corrected",
      supersedesEventId: original.eventId,
    });
    expect(projectEarlyAccessShipmentEvents({ ...base, events: [original, bad] })).toEqual({
      ok: false,
      reason: "correction_target_wrong_order",
    });
  });
});
