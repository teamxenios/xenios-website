import { beforeEach, describe, expect, it } from "vitest";
import type { InventoryLot } from "../inventory/lots";
import { InventoryLedger } from "./inventory-ledger";
import type { OperationsActor } from "./state-machines";

const NOW = new Date("2026-07-25T16:00:00.000Z");
const mitch: OperationsActor = { id: "mitch", role: "mitch" };
const system: OperationsActor = { id: "system", role: "system" };
const affiliate: OperationsActor = { id: "aff-1", role: "affiliate" };

function cleanLot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    lotId: "lot-1",
    sku: "SKU-1",
    owner: "mitch",
    disposition: "available",
    quantityAvailable: 0,
    manufacturedDate: "2026-01-01T00:00:00.000Z",
    expiryDate: "2027-01-01T00:00:00.000Z",
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
    ...overrides,
  };
}

function value<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("append-only exact-lot inventory", () => {
  let ledger: InventoryLedger;

  beforeEach(() => {
    ledger = new InventoryLedger();
    value(ledger.registerLot(cleanLot(), 10, mitch, "receipt-1", NOW));
  });

  it("records receipt and allocation movements without decrementing physical stock", () => {
    const lot = ledger.getLot("lot-1")!;
    value(
      ledger.allocateExact({
        orderId: "ord-1",
        itemId: "line-1",
        sku: "SKU-1",
        lotId: "lot-1",
        quantity: 3,
        expectedLotVersion: lot.version,
        actor: mitch,
        idempotencyKey: "alloc-1",
        occurredAt: NOW,
      }),
    );
    expect(ledger.getLot("lot-1")).toMatchObject({ onHand: 10, allocated: 3, available: 7 });
    expect(ledger.listMovements().map((movement) => [movement.kind, movement.onHandDelta])).toEqual([
      ["receipt", 10],
      ["allocate", 0],
    ]);
  });

  it("blocks a quarantined or undocumented exact lot", () => {
    const blocked = new InventoryLedger();
    value(
      blocked.registerLot(
        cleanLot({ lotId: "lot-q", disposition: "quarantined" }),
        5,
        mitch,
        "receipt-q",
        NOW,
      ),
    );
    const result = blocked.allocateExact({
      orderId: "ord-1",
      itemId: "line-1",
      sku: "SKU-1",
      lotId: "lot-q",
      quantity: 1,
      expectedLotVersion: 1,
      actor: mitch,
      idempotencyKey: "alloc-q",
      occurredAt: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "lot_blocked" });
    if (!result.ok) expect(result.evaluation?.blockReasons).toContain("quarantined");
  });

  it("requires an exact allocation for every item before shipment", () => {
    const result = ledger.shipOrder({
      orderId: "ord-1",
      requiredItems: [{ itemId: "line-1", sku: "SKU-1", quantity: 2 }],
      actor: mitch,
      idempotencyKey: "ship-1",
      occurredAt: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "allocation_incomplete" });
    expect(ledger.getLot("lot-1")?.onHand).toBe(10);
  });

  it("ships once and absorbs retry without double decrement", () => {
    const lot = ledger.getLot("lot-1")!;
    value(
      ledger.allocateExact({
        orderId: "ord-1",
        itemId: "line-1",
        sku: "SKU-1",
        lotId: "lot-1",
        quantity: 4,
        expectedLotVersion: lot.version,
        actor: mitch,
        idempotencyKey: "alloc-ship",
        occurredAt: NOW,
      }),
    );
    const command = {
      orderId: "ord-1",
      requiredItems: [{ itemId: "line-1", sku: "SKU-1", quantity: 4 }],
      actor: mitch,
      idempotencyKey: "ship-once",
      occurredAt: NOW,
    };
    const first = ledger.shipOrder(command);
    const second = ledger.shipOrder(command);
    expect(first).toMatchObject({ ok: true, idempotent: false });
    expect(second).toMatchObject({ ok: true, idempotent: true });
    expect(ledger.getLot("lot-1")).toMatchObject({ onHand: 6, allocated: 0, available: 6 });
    expect(ledger.listMovements().filter((movement) => movement.kind === "ship")).toHaveLength(1);
  });

  it("re-checks lot eligibility at shipment time", () => {
    const lot = ledger.getLot("lot-1")!;
    value(
      ledger.allocateExact({
        orderId: "ord-1",
        itemId: "line-1",
        sku: "SKU-1",
        lotId: "lot-1",
        quantity: 2,
        expectedLotVersion: lot.version,
        actor: mitch,
        idempotencyKey: "alloc-expire",
        occurredAt: NOW,
      }),
    );
    const afterExpiry = new Date("2027-01-01T00:00:00.000Z");
    const result = ledger.shipOrder({
      orderId: "ord-1",
      requiredItems: [{ itemId: "line-1", sku: "SKU-1", quantity: 2 }],
      actor: mitch,
      idempotencyKey: "ship-expired",
      occurredAt: afterExpiry,
    });
    expect(result).toMatchObject({ ok: false, code: "lot_blocked" });
    expect(ledger.getLot("lot-1")?.onHand).toBe(10);
  });

  it("returns against the shipped lot and refuses an over-return", () => {
    const lot = ledger.getLot("lot-1")!;
    value(
      ledger.allocateExact({
        orderId: "ord-1",
        itemId: "line-1",
        sku: "SKU-1",
        lotId: "lot-1",
        quantity: 3,
        expectedLotVersion: lot.version,
        actor: mitch,
        idempotencyKey: "alloc-return",
        occurredAt: NOW,
      }),
    );
    value(
      ledger.shipOrder({
        orderId: "ord-1",
        requiredItems: [{ itemId: "line-1", sku: "SKU-1", quantity: 3 }],
        actor: mitch,
        idempotencyKey: "ship-return",
        occurredAt: NOW,
      }),
    );
    value(
      ledger.returnItem({
        orderId: "ord-1",
        itemId: "line-1",
        quantity: 2,
        reason: "unopened return",
        actor: mitch,
        idempotencyKey: "return-1",
        occurredAt: NOW,
      }),
    );
    expect(ledger.getLot("lot-1")?.onHand).toBe(9);
    const tooMany = ledger.returnItem({
      orderId: "ord-1",
      itemId: "line-1",
      quantity: 2,
      reason: "extra",
      actor: mitch,
      idempotencyKey: "return-2",
      occurredAt: NOW,
    });
    expect(tooMany).toMatchObject({ ok: false, code: "return_exceeds_shipped" });
  });

  it("protects lot writes with a version and permissions", () => {
    const lot = ledger.getLot("lot-1")!;
    const stale = ledger.allocateExact({
      orderId: "ord-1",
      itemId: "line-1",
      sku: "SKU-1",
      lotId: "lot-1",
      quantity: 1,
      expectedLotVersion: lot.version + 1,
      actor: mitch,
      idempotencyKey: "stale",
      occurredAt: NOW,
    });
    expect(stale).toMatchObject({ ok: false, code: "lot_stale" });
    const forbidden = ledger.allocateExact({
      orderId: "ord-1",
      itemId: "line-1",
      sku: "SKU-1",
      lotId: "lot-1",
      quantity: 1,
      expectedLotVersion: lot.version,
      actor: affiliate,
      idempotencyKey: "forbidden",
      occurredAt: NOW,
    });
    expect(forbidden).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("returns defensive copies so callers cannot rewrite the ledger", () => {
    const movements = ledger.listMovements();
    movements[0].onHandDelta = 9_999;
    expect(ledger.getLot("lot-1")?.onHand).toBe(10);
  });
});
