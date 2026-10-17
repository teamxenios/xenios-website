import { describe, expect, it } from "vitest";

import {
  InMemoryEarlyAccessCommerceStore,
  type EarlyAccessPlacement,
  type EarlyAccessSettlement,
} from "./store";

// The transaction boundary itself.
//
// The route tests prove the behaviour a caller sees. These prove the property
// underneath it: the check and the write happen in ONE turn, so a second caller
// arriving at the same moment loses cleanly and reads what the winner wrote.
// If any commit below ever becomes asynchronous inside its critical section,
// these are the tests that stop being true.

function placement(overrides: Partial<EarlyAccessPlacement> = {}): EarlyAccessPlacement {
  return {
    orderNumber: "XEA-0000000000000001",
    customerRef: "cust-alpha-0001",
    idempotencyKey: "ea-route-order-key-0001",
    order: { totalCents: 47_760 },
    invoice: { orderId: "XEA-0000000000000001" },
    shipTo: {},
    supplier: { supplierId: "supplier-apex", supplierSku: "APEX-CLEAN-10" },
    attribution: null,
    paymentState: "awaiting_payment",
    placedAt: "2026-08-04T12:00:00.000Z",
    ...overrides,
  } as unknown as EarlyAccessPlacement;
}

function settlement(overrides: Partial<EarlyAccessSettlement> = {}): EarlyAccessSettlement {
  return {
    orderNumber: "XEA-0000000000000001",
    verification: { idempotencyKey: "ea-confirm-key-000001" },
    verifiedOrder: {},
    receipt: { receiptId: "early-access-receipt:XEA-0000000000000001" },
    ledgerEntry: { externalTransactionId: "bank-txn-00001" },
    supplierOrder: { releaseId: "early-access-supplier-release:XEA-0000000000000001" },
    supplierPacket: {},
    outbox: { outboxId: "early-access-payment-confirmed:XEA-0000000000000001" },
    commission: null,
    settledAt: "2026-08-04T12:05:00.000Z",
    ...overrides,
  } as unknown as EarlyAccessSettlement;
}

describe("committing a placement", () => {
  it("lets exactly one of two simultaneous writers win, and hands the loser the winner", async () => {
    const store = new InMemoryEarlyAccessCommerceStore();
    const first = placement();
    const second = placement({ orderNumber: "XEA-0000000000000002" });

    const [a, b] = await Promise.all([store.commitPlacement(first), store.commitPlacement(second)]);

    expect([a.committed, b.committed].sort()).toEqual([false, true]);
    const loser = a.committed ? b : a;
    expect(loser.committed).toBe(false);
    if (!loser.committed) {
      expect(loser.reason).toBe("idempotency_key_taken");
      expect(loser.placement.orderNumber).toBe("XEA-0000000000000001");
    }
    expect(await store.placementByOrderNumber("XEA-0000000000000002")).toBeNull();
  });

  it("refuses a repeated order number outright", async () => {
    const store = new InMemoryEarlyAccessCommerceStore();
    await store.commitPlacement(placement());
    const clash = await store.commitPlacement(
      placement({ idempotencyKey: "ea-route-order-key-0002" }),
    );
    expect(clash.committed).toBe(false);
    if (!clash.committed) expect(clash.reason).toBe("order_number_taken");
  });
});

describe("committing a settlement", () => {
  it("converges two simultaneous confirmations on one result", async () => {
    const store = new InMemoryEarlyAccessCommerceStore();
    await store.commitPlacement(placement());

    const [a, b] = await Promise.all([
      store.commitSettlement(settlement()),
      store.commitSettlement(
        settlement({
          receipt: { receiptId: "early-access-receipt:XEA-0000000000000001" } as never,
          ledgerEntry: { externalTransactionId: "bank-txn-00002" } as never,
        }),
      ),
    ]);

    expect([a.committed, b.committed].sort()).toEqual([false, true]);
    const loser = a.committed ? b : a;
    if (!loser.committed) {
      expect(loser.reason).toBe("already_settled");
      expect(loser.settlement).not.toBeNull();
    }
    const stored = await store.settlement("XEA-0000000000000001");
    expect(stored?.ledgerEntry.externalTransactionId).toBe("bank-txn-00001");
    expect((await store.placementByOrderNumber("XEA-0000000000000001"))?.paymentState).toBe(
      "payment_verified",
    );
  });

  it("refuses a transaction identifier that already paid a different order", async () => {
    const store = new InMemoryEarlyAccessCommerceStore();
    await store.commitPlacement(placement());
    await store.commitPlacement(
      placement({ orderNumber: "XEA-0000000000000002", idempotencyKey: "ea-route-order-key-0002" }),
    );
    await store.commitSettlement(settlement());

    const reused = await store.commitSettlement(
      settlement({
        orderNumber: "XEA-0000000000000002",
        ledgerEntry: { externalTransactionId: "bank-txn-00001" } as never,
      }),
    );

    expect(reused.committed).toBe(false);
    if (!reused.committed) expect(reused.reason).toBe("transaction_id_used");
    expect(await store.settlement("XEA-0000000000000002")).toBeNull();
    expect((await store.placementByOrderNumber("XEA-0000000000000002"))?.paymentState).toBe(
      "awaiting_payment",
    );
  });

  it("refuses to settle an order that does not exist", async () => {
    const store = new InMemoryEarlyAccessCommerceStore();
    const orphan = await store.commitSettlement(settlement());
    expect(orphan.committed).toBe(false);
    if (!orphan.committed) expect(orphan.reason).toBe("order_unknown");
  });
});

describe("a proof never reaches a paid state", () => {
  it("moves an order to review and no further", async () => {
    const store = new InMemoryEarlyAccessCommerceStore();
    await store.commitPlacement(placement());
    const committed = await store.commitProof({
      orderNumber: "XEA-0000000000000001",
      record: { proofId: "eaproofid.00000001", sequence: 1 } as never,
      sha256: "c".repeat(64),
      receivedAt: "2026-08-04T12:01:00.000Z",
    });

    expect(committed.committed).toBe(true);
    expect((await store.placementByOrderNumber("XEA-0000000000000001"))?.paymentState).toBe(
      "under_review",
    );
    expect(await store.settlement("XEA-0000000000000001")).toBeNull();
  });

  it("refuses a record whose sequence no longer matches the chain", async () => {
    const store = new InMemoryEarlyAccessCommerceStore();
    await store.commitPlacement(placement());
    const stale = await store.commitProof({
      orderNumber: "XEA-0000000000000001",
      record: { proofId: "eaproofid.00000009", sequence: 4 } as never,
      sha256: "d".repeat(64),
      receivedAt: "2026-08-04T12:01:00.000Z",
    });
    expect(stale.committed).toBe(false);
    if (!stale.committed) expect(stale.reason).toBe("chain_moved");
  });
});
