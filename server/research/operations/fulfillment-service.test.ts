import { beforeEach, describe, expect, it } from "vitest";
import type { InventoryLot } from "../inventory/lots";
import { FulfillmentService, type FulfillmentWorkOrder } from "./fulfillment-service";
import { InventoryLedger } from "./inventory-ledger";
import { newOperationsAggregate, type OperationsActor } from "./state-machines";

const NOW = new Date("2026-07-25T16:00:00.000Z");
const mitch: OperationsActor = { id: "mitch", role: "mitch" };
const operations: OperationsActor = { id: "ops", role: "operations_manager" };
const affiliate: OperationsActor = { id: "aff", role: "affiliate" };

const lot: InventoryLot = {
  lotId: "lot-ops-1",
  sku: "SKU-OPS",
  owner: "mitch",
  disposition: "available",
  quantityAvailable: 0,
  manufacturedDate: "2026-01-01T00:00:00.000Z",
  expiryDate: "2027-07-25T00:00:00.000Z",
  retestDate: null,
  shelfLifeSource: "coa",
  documents: {
    coaOnFile: true,
    identityConfirmed: true,
    purityConfirmed: true,
    sterilityConfirmed: null,
    endotoxinConfirmed: null,
  },
  excursion: "none",
  recalled: false,
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("Mitch fulfillment portal service", () => {
  let inventory: InventoryLedger;
  let service: FulfillmentService;

  beforeEach(() => {
    inventory = new InventoryLedger();
    unwrap(inventory.registerLot(lot, 20, mitch, "receive-ops", NOW));
    service = new FulfillmentService(inventory);
    unwrap(
      service.create({
        id: "ful-1",
        orderReference: "XR-1042",
        recipientInitials: "A. R.",
        destinationZone: "TX-3",
        dueAt: "2026-07-25T22:00:00.000Z",
        items: [{ itemId: "line-1", sku: "SKU-OPS", displayName: "Research item", quantity: 3 }],
        aggregate: newOperationsAggregate("ful-1"),
        actor: operations,
        idempotencyKey: "create-1",
        occurredAt: NOW,
      }),
    );
  });

  function latest(): FulfillmentWorkOrder {
    const value = service.get("ful-1");
    if (!value) throw new Error("missing work order");
    return value;
  }

  function acknowledge(): FulfillmentWorkOrder {
    const current = latest();
    return unwrap(
      service.acknowledge({
        orderId: current.id,
        expectedVersion: current.aggregate.version,
        actor: mitch,
        idempotencyKey: "ack-1",
        occurredAt: NOW,
      }),
    );
  }

  function allocate(): FulfillmentWorkOrder {
    const current = latest();
    const inventoryLot = inventory.getLot("lot-ops-1")!;
    return unwrap(
      service.allocateExact({
        orderId: current.id,
        itemId: "line-1",
        lotId: inventoryLot.lot.lotId,
        quantity: 3,
        expectedLotVersion: inventoryLot.version,
        expectedVersion: current.aggregate.version,
        actor: mitch,
        idempotencyKey: "allocate-1",
        occurredAt: NOW,
      }),
    );
  }

  function readyToShip(): FulfillmentWorkOrder {
    acknowledge();
    allocate();
    let current = latest();
    unwrap(
      service.beginPicking({
        orderId: current.id,
        expectedVersion: current.aggregate.version,
        actor: mitch,
        idempotencyKey: "pick-1",
        occurredAt: NOW,
      }),
    );
    current = latest();
    unwrap(
      service.pack({
        orderId: current.id,
        expectedVersion: current.aggregate.version,
        actor: mitch,
        idempotencyKey: "pack-1",
        occurredAt: NOW,
      }),
    );
    current = latest();
    return unwrap(
      service.addShippingLabel({
        orderId: current.id,
        expectedVersion: current.aggregate.version,
        carrier: "UPS",
        service: "Ground",
        tracking: "1Z999",
        actor: mitch,
        idempotencyKey: "label-1",
        occurredAt: NOW,
      }),
    );
  }

  it("returns the named queues using a logistics-only row with no admin, CRM, affiliate, or clinical data", () => {
    const awaiting = service.listMitchQueue("awaiting_acknowledgement", NOW);
    const due = service.listMitchQueue("due_today", NOW);
    expect(awaiting).toHaveLength(1);
    expect(due).toHaveLength(1);
    expect(awaiting[0]).toMatchObject({
      orderReference: "XR-1042",
      recipientInitials: "A. R.",
      destinationZone: "TX-3",
      fulfillmentState: "awaiting_acknowledgement",
    });
    const serialized = JSON.stringify(awaiting[0]).toLowerCase();
    for (const forbidden of ["email", "phone", "health", "commission", "affiliate", "payment"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("supports acknowledgment, expected date, note, assistance, escalation, and exception actions with audit", () => {
    acknowledge();
    let current = latest();
    unwrap(
      service.setExpectedDate({
        orderId: current.id,
        expectedVersion: current.aggregate.version,
        expectedAt: "2026-07-25T20:00:00.000Z",
        actor: mitch,
        idempotencyKey: "expected-1",
        occurredAt: NOW,
      }),
    );
    current = latest();
    unwrap(
      service.addNote({
        orderId: current.id,
        expectedVersion: current.aggregate.version,
        text: "Need help confirming the ship window.",
        assistanceRequested: true,
        escalation: true,
        actor: mitch,
        idempotencyKey: "note-1",
        occurredAt: NOW,
      }),
    );
    current = latest();
    const exception = unwrap(
      service.reportException({
        orderId: current.id,
        expectedVersion: current.aggregate.version,
        kind: "shortage",
        severity: "samuel_decision",
        detail: "Three units short.",
        actor: mitch,
        idempotencyKey: "exception-1",
        occurredAt: NOW,
      }),
    );
    expect(exception.expectedAt).toBe("2026-07-25T20:00:00.000Z");
    expect(exception.notes[0]).toMatchObject({ assistanceRequested: true, escalation: true });
    expect(service.listMitchQueue("exceptions", NOW)).toHaveLength(1);
    expect(service.listMitchQueue("inventory_issues", NOW)).toHaveLength(1);
    expect(service.listMitchQueue("samuel_decisions", NOW)).toHaveLength(1);
    expect(service.listAudit().map((event) => event.action)).toEqual(
      expect.arrayContaining(["fulfillment.acknowledged", "fulfillment.expected_date", "fulfillment.note", "fulfillment.exception"]),
    );
  });

  it("requires acknowledgment and complete exact-lot allocation before picking", () => {
    const current = latest();
    const result = service.beginPicking({
      orderId: current.id,
      expectedVersion: current.aggregate.version,
      actor: mitch,
      idempotencyKey: "pick-too-early",
      occurredAt: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_state" });
  });

  it("runs exact-lot pick, pack, label, and shipment while preserving separated states", () => {
    const ready = readyToShip();
    expect(ready.aggregate.states).toMatchObject({
      allocation: "allocated",
      fulfillment: "ready_to_ship",
      shipment: "label_created",
      payment: "pending",
      order: "new",
    });
    const shipped = unwrap(
      service.ship({
        orderId: ready.id,
        expectedVersion: ready.aggregate.version,
        actor: mitch,
        idempotencyKey: "ship-1",
        occurredAt: NOW,
      }),
    );
    expect(shipped.aggregate.states).toMatchObject({
      allocation: "shipped",
      fulfillment: "shipped",
      shipment: "in_transit",
      payment: "pending",
      order: "new",
    });
    expect(shipped.shipment).toMatchObject({ carrier: "UPS", service: "Ground", tracking: "1Z999" });
    expect(service.listMitchQueue("shipped_today", NOW)).toHaveLength(1);
    expect(inventory.getLot("lot-ops-1")?.onHand).toBe(17);
  });

  it("absorbs a repeated ship command and never decrements inventory twice", () => {
    const ready = readyToShip();
    const command = {
      orderId: ready.id,
      expectedVersion: ready.aggregate.version,
      actor: mitch,
      idempotencyKey: "ship-retry",
      occurredAt: NOW,
    };
    const first = service.ship(command);
    const second = service.ship(command);
    expect(first).toMatchObject({ ok: true, idempotent: false });
    expect(second).toMatchObject({ ok: true, idempotent: true });
    expect(inventory.getLot("lot-ops-1")?.onHand).toBe(17);
    expect(inventory.listMovements().filter((movement) => movement.kind === "ship")).toHaveLength(1);
  });

  it("rejects stale writes and non-logistics roles", () => {
    const current = latest();
    const stale = service.acknowledge({
      orderId: current.id,
      expectedVersion: current.aggregate.version - 1,
      actor: mitch,
      idempotencyKey: "stale-ack",
      occurredAt: NOW,
    });
    expect(stale).toMatchObject({ ok: false, code: "stale_write" });
    const forbidden = service.acknowledge({
      orderId: current.id,
      expectedVersion: current.aggregate.version,
      actor: affiliate,
      idempotencyKey: "affiliate-ack",
      occurredAt: NOW,
    });
    expect(forbidden).toMatchObject({ ok: false, code: "forbidden" });
  });
});
