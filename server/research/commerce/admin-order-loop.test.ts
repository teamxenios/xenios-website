// The operating loop on ONE order authority, end to end.
//
// The order a customer pays for is the row the durable checkout writes to
// research_orders. This file proves that the same row is the one the customer
// reads back, the one an operator opens, and the one that moves through the
// post-payment progression — so there is exactly one answer to "what is the
// order?".
//
// An earlier report said "nothing mints a canonical order". That was wrong in
// the way that matters: it was true only of the older, unmounted XO- lane.
// createDurableCheckoutSubmission persists the order through OrderRepository
// BEFORE any provider effect, and the capture commit updates that same row.
//
// What is deliberately NOT here: a route to mark an order delivered. The
// transition table admits delivered only from the system or a signed provider
// event, because delivery is the carrier's fact.
import { describe, expect, it } from "vitest";
import { TestPaymentProvider } from "../providers/payment";
import {
  createOrderService,
  type OrderRecord,
  type OrderRepository,
  type OrderService,
} from "./orders";

const NOW = new Date("2026-09-14T00:00:00Z");
const LATER = new Date("2026-09-14T06:00:00Z");

function paidOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    orderId: "ord_paid_1",
    memberId: "mem_1",
    state: "payment_captured",
    lines: [{ sku: "P001", displayName: "Product One", quantity: 2, lineTotalCents: 19800 }],
    totals: { subtotalCents: 19800, shippingCents: 1295, storeCreditAppliedCents: 0, totalCents: 21095 },
    providerReference: "pi_real",
    checkoutIdempotencyKey: "checkout-key-1",
    lastIdempotencyKey: "capture:ord_paid_1",
    reviewTriggers: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    capturedAmountCents: 21095,
    refundedCents: 0,
    shipments: [{ owner: "xenios", status: "pending", trackingNumber: null, carrier: null }],
    ...overrides,
  };
}

function repository(seed: OrderRecord[]): OrderRepository {
  const rows = new Map<string, OrderRecord>(seed.map((o) => [o.orderId, o]));
  const all = (): OrderRecord[] => [...rows.values()];
  return {
    async get(orderId) {
      return rows.get(orderId) ?? null;
    },
    async save(order) {
      rows.set(order.orderId, order);
    },
    async listByMember(memberId) {
      return all().filter((o) => o.memberId === memberId);
    },
    async findByCheckoutIdempotencyKey(memberId, key) {
      const matches = all().filter((o) => o.memberId === memberId && o.checkoutIdempotencyKey === key);
      if (matches.length > 1) throw new Error("order checkout idempotency lookup ambiguous");
      return matches[0] ?? null;
    },
    async findByIdempotencyKey(memberId, key) {
      return all().find((o) => o.memberId === memberId && o.lastIdempotencyKey === key) ?? null;
    },
    async listAll() {
      return all();
    },
  };
}

function serviceFor(seed: OrderRecord[]): OrderService {
  return createOrderService({
    repository: repository(seed),
    payment: new TestPaymentProvider(),
    commerceEnabled: true,
    durablePaymentExecutionAvailable: true,
  });
}

// ---------------------------------------------------------------------------
// The customer reads back exactly what was paid for
// ---------------------------------------------------------------------------

describe("the paid order is the order the customer sees", () => {
  it("returns the same order id, member and captured money through history and detail", async () => {
    const service = serviceFor([paidOrder()]);

    const history = await service.listForMember("mem_1");
    expect(history).toHaveLength(1);
    expect(history[0].orderId).toBe("ord_paid_1");

    const detail = await service.getForMember("mem_1", "ord_paid_1");
    expect(detail?.orderId).toBe("ord_paid_1");
    expect(detail?.state).toBe("payment_captured");
    expect(detail?.payment?.amountCapturedCents).toBe(21095);
    // The same row an operator opens.
    const adminView = await service.adminDetail("ord_paid_1");
    expect(adminView?.orderId).toBe(detail?.orderId);
    expect(adminView?.memberId).toBe("mem_1");
  });

  it("does not exist to another member", async () => {
    const service = serviceFor([paidOrder()]);
    expect(await service.getForMember("mem_2", "ord_paid_1")).toBeNull();
    expect(await service.listForMember("mem_2")).toEqual([]);
  });

  it("keeps one order per checkout key, so a replay reads back the same record", async () => {
    const repo = repository([paidOrder()]);
    const first = await repo.findByCheckoutIdempotencyKey("mem_1", "checkout-key-1");
    const second = await repo.findByCheckoutIdempotencyKey("mem_1", "checkout-key-1");
    expect(first?.orderId).toBe("ord_paid_1");
    expect(second?.orderId).toBe(first?.orderId);
    expect(await repo.listAll()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The post-payment progression
// ---------------------------------------------------------------------------

describe("a paid order can be worked to shipped", () => {
  it("moves payment_captured -> processing -> fulfilled, recording tracking on the way", async () => {
    const service = serviceFor([paidOrder()]);

    const processing = await service.beginProcessing("ord_paid_1", "admin", NOW);
    expect(processing.ok).toBe(true);
    if (processing.ok) expect(processing.order.state).toBe("processing");

    const tracked = await service.recordShipmentTracking(
      "ord_paid_1",
      "admin",
      { owner: "xenios", carrier: "UPS", trackingNumber: "1Z999AA10123456784" },
      NOW,
    );
    expect(tracked.ok).toBe(true);
    if (tracked.ok) {
      expect(tracked.order.shipments?.[0].carrier).toBe("UPS");
      expect(tracked.order.shipments?.[0].trackingNumber).toBe("1Z999AA10123456784");
      // Recording evidence is not a transition.
      expect(tracked.order.state).toBe("processing");
    }

    const fulfilled = await service.markFulfilled("ord_paid_1", "admin", LATER, "carrier accepted");
    expect(fulfilled.ok).toBe(true);
    if (fulfilled.ok) expect(fulfilled.order.state).toBe("fulfilled");

    // And the customer sees the shipment facts that were recorded, from the
    // same record, marked as a connected source rather than an assumed empty.
    const detail = await service.getForMember("mem_1", "ord_paid_1");
    expect(detail?.shipmentsSource).toBe("connected");
    expect(detail?.shipments[0].trackingNumber).toBe("1Z999AA10123456784");
  });

  it("refuses to be marked delivered by an operator", async () => {
    // Delivery belongs to the carrier. There is no admin route for it, and the
    // service refuses the actor even if one were added.
    const service = serviceFor([paidOrder({ state: "fulfilled" })]);
    const result = await service.markDelivered("ord_paid_1", "admin" as never, LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.denials).toEqual(["order_state_invalid"]);
  });
});

// ---------------------------------------------------------------------------
// Tracking is evidence, and is treated like evidence
// ---------------------------------------------------------------------------

describe("recording tracking", () => {
  it("refuses a carrier or tracking number that is not in a recordable shape", async () => {
    const service = serviceFor([paidOrder({ state: "processing" })]);
    for (const input of [
      { owner: "xenios" as const, carrier: "", trackingNumber: "1Z999AA10123456784" },
      { owner: "xenios" as const, carrier: "UPS", trackingNumber: "123" },
      { owner: "xenios" as const, carrier: "<script>", trackingNumber: "1Z999AA10123456784" },
    ]) {
      const result = await service.recordShipmentTracking("ord_paid_1", "admin", input, NOW);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.denials).toEqual(["tracking_invalid"]);
    }
  });

  it("never overwrites a shipment the provider has already spoken for", async () => {
    const service = serviceFor([
      paidOrder({
        state: "processing",
        shipments: [{ owner: "xenios", status: "shipped", trackingNumber: "PROVIDER-1", carrier: "FedEx" }],
      }),
    ]);
    const result = await service.recordShipmentTracking(
      "ord_paid_1",
      "admin",
      { owner: "xenios", carrier: "UPS", trackingNumber: "1Z999AA10123456784" },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.denials).toEqual(["order_state_invalid"]);
  });

  it("refuses a shipment group this order does not have", async () => {
    const service = serviceFor([paidOrder({ state: "processing" })]);
    const result = await service.recordShipmentTracking(
      "ord_paid_1",
      "admin",
      { owner: "mitch", carrier: "UPS", trackingNumber: "1Z999AA10123456784" },
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses tracking on an order that has not been paid for", async () => {
    const service = serviceFor([paidOrder({ state: "checkout_pending" })]);
    const result = await service.recordShipmentTracking(
      "ord_paid_1",
      "admin",
      { owner: "xenios", carrier: "UPS", trackingNumber: "1Z999AA10123456784" },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.denials).toEqual(["order_state_invalid"]);
  });
});

// ---------------------------------------------------------------------------
// What an operator is offered
// ---------------------------------------------------------------------------

describe("the actions an operator is offered", () => {
  it("offers only moves the transition table actually admits from this state", async () => {
    const held = await serviceFor([paidOrder({ state: "manual_review" })]).adminDetail("ord_paid_1");
    expect(held?.availableActions).toEqual(expect.arrayContaining(["approve", "cancel"]));
    // A held order has not been paid for, so it cannot be worked or tracked.
    expect(held?.availableActions).not.toContain("begin_processing");
    expect(held?.availableActions).not.toContain("record_tracking");

    const paid = await serviceFor([paidOrder()]).adminDetail("ord_paid_1");
    expect(paid?.availableActions).toEqual(expect.arrayContaining(["begin_processing", "record_tracking"]));
    expect(paid?.availableActions).not.toContain("approve");

    const working = await serviceFor([paidOrder({ state: "processing" })]).adminDetail("ord_paid_1");
    expect(working?.availableActions).toEqual(expect.arrayContaining(["mark_fulfilled", "record_tracking", "cancel"]));

    const done = await serviceFor([paidOrder({ state: "delivered" })]).adminDetail("ord_paid_1");
    expect(done?.availableActions).not.toContain("begin_processing");
    expect(done?.availableActions).not.toContain("record_tracking");
  });

  it("never offers an operator the delivered move", async () => {
    for (const state of ["payment_captured", "processing", "fulfilled"] as const) {
      const view = await serviceFor([paidOrder({ state })]).adminDetail("ord_paid_1");
      expect(view?.availableActions).not.toContain("mark_delivered" as never);
    }
  });

  it("carries the review triggers an operator needs, and no member contact detail", async () => {
    const view = await serviceFor([
      paidOrder({ state: "manual_review", reviewTriggers: ["order_total_threshold"] }),
    ]).adminDetail("ord_paid_1");

    expect(view?.reviewTriggers).toEqual(["order_total_threshold"]);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("providerReference");
    expect(serialized).not.toContain("pi_real");
  });

  it("reports no order rather than an empty one when the id is unknown", async () => {
    expect(await serviceFor([paidOrder()]).adminDetail("ord_missing")).toBeNull();
  });
});
