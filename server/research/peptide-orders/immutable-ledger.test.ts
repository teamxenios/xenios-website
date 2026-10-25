import { describe, expect, it } from "vitest";
import {
  createInMemoryPeptideOrderLedger,
  type ImmutableOrderLine,
  type ReserveOrderInput,
  type SettleOrderInput,
} from "./immutable-ledger";

const AT = "2026-08-02T23:45:00.000Z";
const LATER = "2026-08-02T23:46:00.000Z";

function line(sku = "PEP-BPC157-10MG", quantity = 1): ImmutableOrderLine {
  return {
    sku,
    displayName: sku === "PEP-TB500-10MG" ? "TB-500 10 mg" : "BPC-157 10 mg",
    quantity,
    unitPriceCents: 14900,
    lineTotalCents: 14900 * quantity,
    price: {
      priceId: `price-${sku}`,
      priceVersion: 3,
      approvedBy: "founder-samuel",
      approvedAt: "2026-08-02T20:00:00.000Z",
      currency: "usd",
    },
  };
}

function reserve(
  orderId: string,
  lines: readonly ImmutableOrderLine[] = [line()],
  idempotencyKey = `reserve-${orderId}-0001`,
): ReserveOrderInput {
  return {
    orderId,
    memberId: "member-0001",
    lines,
    actorId: "checkout-service",
    at: AT,
    idempotencyKey,
  };
}

function settle(orderId: string, key: string, reason: string): SettleOrderInput {
  return {
    orderId,
    actorId: "payment-webhook",
    at: LATER,
    reason,
    idempotencyKey: key,
  };
}

describe("atomic all-or-none reservation", () => {
  it("reserves every line and exposes exact inventory projection", async () => {
    const ledger = createInMemoryPeptideOrderLedger({
      "PEP-BPC157-10MG": 4,
      "PEP-TB500-10MG": 3,
    });
    const result = await ledger.reserve(reserve("order-0001", [line(), line("PEP-TB500-10MG", 2)]));

    expect(result.ok).toBe(true);
    expect(await ledger.inventory("PEP-BPC157-10MG")).toEqual({
      sku: "PEP-BPC157-10MG", onHand: 4, reserved: 1, available: 3, paidAllocated: 0,
    });
    expect(await ledger.inventory("PEP-TB500-10MG")).toEqual({
      sku: "PEP-TB500-10MG", onHand: 3, reserved: 2, available: 1, paidAllocated: 0,
    });
  });

  it("rolls back the entire basket when any line is unavailable", async () => {
    const ledger = createInMemoryPeptideOrderLedger({
      "PEP-BPC157-10MG": 4,
      "PEP-TB500-10MG": 1,
    });
    const result = await ledger.reserve(reserve("order-0001", [line(), line("PEP-TB500-10MG", 2)]));

    expect(result).toEqual({ ok: false, code: "inventory_unavailable" });
    expect((await ledger.inventory("PEP-BPC157-10MG"))!.available).toBe(4);
    expect((await ledger.inventory("PEP-TB500-10MG"))!.available).toBe(1);
    expect(await ledger.detail("order-0001", "member-0001")).toBeNull();
  });

  it("serializes concurrent checkouts so stock cannot be oversold", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 1 });
    const results = await Promise.all([
      ledger.reserve(reserve("order-0001")),
      ledger.reserve(reserve("order-0002")),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, code: "inventory_unavailable" },
    ]);
    expect(await ledger.inventory("PEP-BPC157-10MG")).toMatchObject({ reserved: 1, available: 0 });
  });
});

describe("release, paid allocation, and retry behavior", () => {
  it("releases a failed-payment hold and makes stock available again", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 1 });
    await ledger.reserve(reserve("order-0001"));

    const released = await ledger.release(
      settle("order-0001", "release-order-0001", "payment authorization failed"),
    );

    expect(released.ok && released.value.state).toBe("released");
    expect(await ledger.inventory("PEP-BPC157-10MG")).toMatchObject({ reserved: 0, available: 1 });
    expect((await ledger.reserve(reserve("order-0002"))).ok).toBe(true);
  });

  it("absorbs exact retries without reserving or releasing twice", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 2 });
    const command = reserve("order-0001");
    const first = await ledger.reserve(command);
    const second = await ledger.reserve(command);
    const releaseCommand = settle("order-0001", "release-order-0001", "payment failed");
    const released = await ledger.release(releaseCommand);
    const replayedRelease = await ledger.release(releaseCommand);

    expect(first.ok && first.idempotentReplay).toBe(false);
    expect(second.ok && second.idempotentReplay).toBe(true);
    expect(released.ok && released.idempotentReplay).toBe(false);
    expect(replayedRelease.ok && replayedRelease.idempotentReplay).toBe(true);
    expect(await ledger.inventory("PEP-BPC157-10MG")).toMatchObject({ reserved: 0, available: 2 });
  });

  it("rejects a changed command that reuses an idempotency key", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 3 });
    await ledger.reserve(reserve("order-0001", [line()], "one-shared-key-0001"));
    const conflict = await ledger.reserve(reserve("order-0001", [line("PEP-BPC157-10MG", 2)], "one-shared-key-0001"));

    expect(conflict).toEqual({ ok: false, code: "idempotency_conflict" });
    expect(await ledger.inventory("PEP-BPC157-10MG")).toMatchObject({ reserved: 1, available: 2 });
  });

  it("moves reserved units to paid allocation exactly once", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 2 });
    await ledger.reserve(reserve("order-0001"));
    const command = settle("order-0001", "capture-order-0001", "payment captured");
    const first = await ledger.finalizePaid(command);
    const second = await ledger.finalizePaid(command);

    expect(first.ok && first.value.state).toBe("paid_allocated");
    expect(second.ok && second.idempotentReplay).toBe(true);
    expect(await ledger.inventory("PEP-BPC157-10MG")).toMatchObject({
      reserved: 0, paidAllocated: 1, available: 1,
    });
  });
});

describe("immutable lines and provenance", () => {
  it("does not permit callers to mutate persisted order lines or price snapshots", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 3 });
    const source = line();
    await ledger.reserve(reserve("order-0001", [source]));
    (source as { quantity: number }).quantity = 999;
    (source.price as { priceVersion: number }).priceVersion = 999;

    const firstRead = (await ledger.detail("order-0001", "member-0001"))!;
    (firstRead.lines[0] as { quantity: number }).quantity = 888;
    (firstRead.lines[0]!.price as { priceVersion: number }).priceVersion = 888;
    const reread = (await ledger.detail("order-0001", "member-0001"))!;

    expect(reread.lines[0]).toMatchObject({ quantity: 1, lineTotalCents: 14900 });
    expect(reread.lines[0]!.price).toMatchObject({ priceVersion: 3, approvedBy: "founder-samuel" });
  });

  it("records bounded refund and versioned commission provenance append-only", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 2 });
    await ledger.reserve(reserve("order-0001", [line("PEP-BPC157-10MG", 2)]));
    await ledger.finalizePaid(settle("order-0001", "capture-order-0001", "payment captured"));

    const refund = await ledger.recordRefund({
      ...settle("order-0001", "refund-order-0001", "one vial returned"),
      refundId: "refund-0001",
      amountCents: 14900,
      providerReference: "provider-refund-0001",
    });
    const commission = await ledger.recordCommission({
      ...settle("order-0001", "commission-order-0001", "captured sale attribution"),
      commissionId: "commission-0001",
      partnerId: "partner-0001",
      amountCents: 1490,
      ruleId: "partner-rule-standard",
      ruleVersion: 4,
    });

    expect(refund.ok && refund.value.refunds[0]).toMatchObject({
      refundId: "refund-0001", amountCents: 14900, providerReference: "provider-refund-0001",
    });
    expect(commission.ok && commission.value.commissions[0]).toMatchObject({
      commissionId: "commission-0001", ruleId: "partner-rule-standard", ruleVersion: 4,
    });

    const excessive = await ledger.recordRefund({
      ...settle("order-0001", "refund-order-0002", "invalid excess refund"),
      refundId: "refund-0002",
      amountCents: 14901,
      providerReference: "provider-refund-0002",
    });
    expect(excessive).toEqual({ ok: false, code: "refund_exceeds_paid_total" });
    expect((await ledger.detail("order-0001", "member-0001"))!.refunds).toHaveLength(1);
  });
});

describe("member confirmation, history, detail, and tracking contracts", () => {
  it("returns member-scoped confirmation without operator/provider secrets", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 2 });
    await ledger.reserve(reserve("order-0001"));

    const confirmation = await ledger.confirmation("order-0001", "member-0001");

    expect(confirmation).toMatchObject({ orderId: "order-0001", totalCents: 14900 });
    expect(confirmation!.lines[0]).toMatchObject({ priceId: "price-PEP-BPC157-10MG", priceVersion: 3 });
    expect(JSON.stringify(confirmation)).not.toContain("approvedBy");
    expect(await ledger.confirmation("order-0001", "member-other")).toBeNull();
  });

  it("appends tracking evidence and a sequenced history", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 2 });
    await ledger.reserve(reserve("order-0001"));
    await ledger.finalizePaid(settle("order-0001", "capture-order-0001", "payment captured"));
    const tracked = await ledger.recordTracking({
      ...settle("order-0001", "tracking-order-0001", "carrier accepted package"),
      shipmentId: "shipment-0001",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      status: "in_transit",
    });

    expect(tracked.ok && tracked.value.tracking).toEqual([{
      shipmentId: "shipment-0001",
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      status: "in_transit",
      recordedAt: LATER,
    }]);
    expect(tracked.ok && tracked.value.history.map((event) => [event.sequence, event.type])).toEqual([
      [1, "reserved"],
      [2, "paid_allocated"],
      [3, "tracking_recorded"],
    ]);
  });
});

describe("fail-closed validation", () => {
  it("rejects zero, fractional, and internally inconsistent prices", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 10 });
    for (const invalid of [
      { ...line(), unitPriceCents: 0, lineTotalCents: 0 },
      { ...line(), unitPriceCents: 14900.5, lineTotalCents: 14900.5 },
      { ...line(), lineTotalCents: 1 },
    ]) {
      const result = await ledger.reserve(reserve(`order-${Math.random()}`, [invalid]));
      expect(result).toEqual({ ok: false, code: "invalid_input" });
    }
    expect(await ledger.inventory("PEP-BPC157-10MG")).toMatchObject({ available: 10 });
  });

  it("rejects duplicate SKUs rather than ambiguously aggregating them", async () => {
    const ledger = createInMemoryPeptideOrderLedger({ "PEP-BPC157-10MG": 10 });
    const result = await ledger.reserve(reserve("order-0001", [line(), line()]));
    expect(result).toEqual({ ok: false, code: "invalid_input" });
    expect(await ledger.inventory("PEP-BPC157-10MG")).toMatchObject({ available: 10 });
  });
});
