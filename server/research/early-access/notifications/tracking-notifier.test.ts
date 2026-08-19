import { describe, expect, it, vi } from "vitest";

// The tracking notifier's contract, tested at both of its boundaries: the
// notifier itself (recipient derivation, fire-and-forget, the durable mail
// identity) and the projection it drives (the exact outbox row
// `projectEarlyAccessTracking` enqueues, pinned so the template contract
// cannot drift silently under this first real caller).

vi.mock("../../outbox", () => ({
  enqueueNotification: vi.fn(async () => true),
}));

import { enqueueNotification } from "../../outbox";
import type { EarlyAccessTrackingRecord } from "../commerce/release-service";
import type { EarlyAccessPlacement } from "../routes/store";
import { projectEarlyAccessTracking } from "./outbox-adapter";
import {
  createOutboxTrackingNotifier,
  earlyAccessTrackingEventIdFor,
} from "./tracking-notifier";

const ORDER_NUMBER = "XEA-0123456789ABCDEF";

const RECORD: EarlyAccessTrackingRecord = Object.freeze({
  releaseId: `rel-${ORDER_NUMBER}`,
  orderId: ORDER_NUMBER,
  carrier: "UPS",
  trackingNumber: "1Z-TEST-000001",
  recordedByActorId: "founder.aaaa1111",
  recordedAt: "2026-08-19T12:00:00.000Z",
  sequence: 1,
});

// Only the fields the notifier reads; the placement type is much larger.
const PLACEMENT = Object.freeze({
  orderNumber: ORDER_NUMBER,
  contact: Object.freeze({ email: "customer@example.com", phone: "+15550000000" }),
}) as unknown as EarlyAccessPlacement;

describe("the tracking template payload is pinned", () => {
  it("enqueues ea_tracking_posted keyed by the durable tracking-event identity", async () => {
    const enqueue = vi.mocked(enqueueNotification);
    enqueue.mockClear();

    const enqueued = await projectEarlyAccessTracking({
      trackingEventId: `${ORDER_NUMBER}:1`,
      cartCheckoutNumber: ORDER_NUMBER,
      recipientEmail: "customer@example.com",
      customerName: "",
      carrierLabel: "UPS",
      trackingReference: "1Z-TEST-000001",
      statusUrl: "https://xeniostechnology.com/research/early-access",
    });

    expect(enqueued).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    // The WHOLE row, pinned. The event key is the at-most-once identity, the
    // template key routes the renderer, and the payload is the allowlisted
    // five fields and nothing else - no supplier, no address, no amount.
    expect(enqueue).toHaveBeenCalledWith({
      eventKey: `ea:tracking:${ORDER_NUMBER}:1`,
      eventType: "ea_tracking_posted",
      templateKey: "ea_tracking_posted",
      recipient: "customer@example.com",
      payload: {
        customerName: "",
        cartCheckoutNumber: ORDER_NUMBER,
        carrierLabel: "UPS",
        trackingReference: "1Z-TEST-000001",
        statusUrl: "https://xeniostechnology.com/research/early-access",
      },
    });
  });
});

describe("the outbox tracking notifier", () => {
  it("derives the mail identity from the committed row's primary key", () => {
    expect(earlyAccessTrackingEventIdFor(RECORD)).toBe(`${ORDER_NUMBER}:1`);
    expect(earlyAccessTrackingEventIdFor({ ...RECORD, sequence: 3 })).toBe(`${ORDER_NUMBER}:3`);
  });

  it("projects the committed record to the server-derived contact", async () => {
    const projection = vi.fn(async () => true);
    const notifier = createOutboxTrackingNotifier({
      projection,
      siteUrl: "https://xeniostechnology.com/",
    });

    notifier.trackingPosted(PLACEMENT, RECORD);
    await Promise.resolve();

    expect(projection).toHaveBeenCalledTimes(1);
    expect(projection).toHaveBeenCalledWith({
      trackingEventId: `${ORDER_NUMBER}:1`,
      cartCheckoutNumber: ORDER_NUMBER,
      recipientEmail: "customer@example.com",
      customerName: "",
      carrierLabel: "UPS",
      trackingReference: "1Z-TEST-000001",
      statusUrl: "https://xeniostechnology.com/research/early-access",
    });
  });

  it("sends nothing for an order that carries no contact", async () => {
    const projection = vi.fn(async () => true);
    const notifier = createOutboxTrackingNotifier({ projection });

    notifier.trackingPosted(
      Object.freeze({ orderNumber: ORDER_NUMBER }) as unknown as EarlyAccessPlacement,
      RECORD,
    );
    await Promise.resolve();

    expect(projection).not.toHaveBeenCalled();
  });

  it("swallows a rejected enqueue into a named warning, never a throw", async () => {
    const warn = vi.fn();
    const projection = vi.fn(async () => {
      throw new Error("outbox down");
    });
    const notifier = createOutboxTrackingNotifier({ projection, warn });

    expect(() => notifier.trackingPosted(PLACEMENT, RECORD)).not.toThrow();
    // Two turns: the rejection, then the catch handler.
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(ORDER_NUMBER);
    expect(warn.mock.calls[0]?.[0]).toContain("outbox down");
  });

  it("names a lost enqueue when the outbox reports unavailable", async () => {
    const warn = vi.fn();
    const projection = vi.fn(async () => false);
    const notifier = createOutboxTrackingNotifier({ projection, warn });

    notifier.trackingPosted(PLACEMENT, RECORD);
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("outbox unavailable");
  });
});
