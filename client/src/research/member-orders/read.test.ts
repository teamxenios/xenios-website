import { describe, expect, it } from "vitest";
import { ORDER_STATES } from "@shared/research/commerce";
import type { OrderSummaryDto } from "@shared/research/commerce-api";
import { memberShipmentSummary, readMemberOrders } from "./read";

type Shipment = OrderSummaryDto["shipments"][number];
const shipment = (patch: Partial<Shipment> = {}): Shipment => ({
  owner: "xenios",
  status: "Preparing synthetic shipment",
  trackingNumber: "SYNTHETIC-TRACKING-1",
  carrier: "Synthetic Carrier",
  ...patch,
});
const order = (patch: Partial<OrderSummaryDto> = {}): OrderSummaryDto => ({
  orderId: "XO-SYNTHETIC_One.1",
  state: "processing",
  placedAt: "2026-09-07T12:34:56.000Z",
  totalCents: 12345,
  shipments: [shipment()],
  ...patch,
});
const envelope = (orders: unknown = [order()]) => ({ ok: true, orders });
const payment = () => ({ amountDueCents: 12345, amountCapturedCents: 0, amountRefundedCents: null, currency: "USD" as const });
const badCents: unknown[] = [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity, -Infinity, "0", null, undefined, true, {}];
const atDateLimit = `2026-09-07T12:34:56.${"0".repeat(43)}Z`;

describe("readMemberOrders canonical projection", () => {
  it("returns only the exact consumed order, shipment, and payment fields", () => {
    const expected = order({ recordKind: "order", shipmentsSource: "connected", payment: payment() });
    const response = {
      ...envelope(),
      unrelatedEnvelopeData: "synthetic-private-envelope",
      orders: [{
        ...expected,
        unrelatedRowData: "synthetic-private-row",
        shipments: [{ ...expected.shipments[0], unrelatedShipmentData: "synthetic-private-shipment" }],
        payment: { ...expected.payment, unrelatedPaymentData: "synthetic-private-payment" },
      }],
    };
    expect(readMemberOrders(response)).toEqual([expected]);
  });

  it("accepts legacy rows without inventing optional evidence", () => {
    const expected = order({ shipments: [] });
    const result = readMemberOrders(envelope([expected]));
    expect(result).toEqual([expected]);
    expect(result![0]).not.toHaveProperty("recordKind");
    expect(result![0]).not.toHaveProperty("shipmentsSource");
    expect(result![0]).not.toHaveProperty("payment");
  });

  it.each(ORDER_STATES)("accepts the canonical lifecycle state %s without deriving payment evidence", (state) => {
    const result = readMemberOrders(envelope([order({ state })]));
    expect(result?.[0].state).toBe(state);
    expect(result![0]).not.toHaveProperty("payment");
  });

  it("preserves a legitimate empty list", () => {
    expect(readMemberOrders(envelope([]))).toEqual([]);
  });

  it("accepts the exact ID, date, text, and integer upper boundaries", () => {
    expect(atDateLimit).toHaveLength(64);
    expect(Number.isFinite(Date.parse(atDateLimit))).toBe(true);
    const expected = order({
      orderId: `A${"x".repeat(191)}`,
      placedAt: atDateLimit,
      totalCents: Number.MAX_SAFE_INTEGER,
      shipments: [shipment({ status: "S".repeat(160), trackingNumber: "T".repeat(160), carrier: "C".repeat(160) })],
    });
    expect(readMemberOrders(envelope([expected]))).toEqual([expected]);
  });

  it("preserves safe identifiers and ISO date offsets without normalizing their spelling", () => {
    const rows = [
      order({ orderId: "0", placedAt: "2026-09-07T12:34:56+05:30", totalCents: 0 }),
      order({ orderId: "Xo-Mixed_Case.2", placedAt: "2026-09-07T12:34:56Z" }),
      order({ orderId: "xo-mixed_case.2" }),
    ];
    expect(readMemberOrders(envelope(rows))).toEqual(rows);
  });
});

describe("readMemberOrders refuses malformed responses", () => {
  it.each([
    null, undefined, false, 0, "orders", [], [order()], {},
    { ok: false, orders: [] }, { ok: "true", orders: [] }, { ok: 1, orders: [] },
    { orders: [] }, { ok: true }, { ok: true, orders: null }, { ok: true, orders: {} },
  ])("does not turn invalid envelope %j into an empty history", (response) => {
    expect(readMemberOrders(response)).toBeNull();
  });

  it.each(["orderId", "state", "placedAt", "totalCents", "shipments"])("requires %s on every row", (field) => {
    const row: Record<string, unknown> = { ...order() };
    delete row[field];
    expect(readMemberOrders(envelope([row]))).toBeNull();
  });

  it.each([null, undefined, false, 0, "order", [], {}])("refuses a malformed row %j", (row) => {
    expect(readMemberOrders(envelope([row]))).toBeNull();
  });

  it.each([
    { field: "orderId", invalid: ["", ".", "..", "_order", "-order", "with space", "nested/order", "nested\\order", "percent%2Forder", "query?x", "hash#x", "order\n", "order\u0000", "é-order", `A${"x".repeat(192)}`, 123, null, {}] },
    { field: "state", invalid: ["", "paid", "PROCESSING", "unknown", "processing ", null, 1, {}] },
    { field: "placedAt", invalid: ["", "not-a-date", "2026-09-07", "09/07/2026", "2026-09-07 12:34:56Z", "2026-13-07T12:34:56Z", "2026-09-07T25:34:56Z", `2026-09-07T12:34:56.${"0".repeat(44)}Z`, 0, null, {}] },
    { field: "totalCents", invalid: badCents },
    { field: "shipments", invalid: [undefined, null, {}, "none", 0, true] },
  ])("rejects invalid $field values", ({ field, invalid }) => {
    for (const value of invalid) {
      expect(readMemberOrders(envelope([{ ...order(), [field]: value }])), `${field}: ${String(value)}`).toBeNull();
    }
  });

  it("rejects duplicate IDs even when the duplicate reports different state or money", () => {
    const first = order();
    const second = order({ state: "refunded", totalCents: 0 });
    expect(readMemberOrders(envelope([first, second]))).toBeNull();
  });

  it.each([0, 1])("rejects the whole response when malformed row %s accompanies a valid row", (invalidIndex) => {
    const rows: unknown[] = [order(), order({ orderId: "XO-SYNTHETIC_Second" })];
    rows[invalidIndex] = { ...rows[invalidIndex] as object, totalCents: -1 };
    expect(readMemberOrders(envelope(rows))).toBeNull();
  });
});

describe("readMemberOrders optional evidence", () => {
  it.each(["order", "request"] as const)("accepts explicit %s record evidence", (recordKind) => {
    expect(readMemberOrders(envelope([order({ recordKind })]))?.[0].recordKind).toBe(recordKind);
  });

  it("rejects invalid optional record-kind or shipment-source values", () => {
    for (const value of [null, "", "unknown", "ORDER", 0, false, {}, []]) {
      expect(readMemberOrders(envelope([{ ...order(), recordKind: value }]))).toBeNull();
    }
    for (const value of [null, "", "available", "CONNECTED", 0, false, {}, []]) {
      expect(readMemberOrders(envelope([{ ...order(), shipmentsSource: value }]))).toBeNull();
    }
  });

  it.each(["connected", "unavailable"] as const)("accepts explicit %s shipment evidence", (shipmentsSource) => {
    expect(readMemberOrders(envelope([order({ shipmentsSource })]))?.[0].shipmentsSource).toBe(shipmentsSource);
  });

  it.each([
    null,
    { amountDueCents: 0, amountCapturedCents: null, amountRefundedCents: null, currency: "USD" as const },
    { amountDueCents: 12345, amountCapturedCents: 0, amountRefundedCents: 0, currency: "USD" as const },
    { amountDueCents: Number.MAX_SAFE_INTEGER, amountCapturedCents: Number.MAX_SAFE_INTEGER, amountRefundedCents: Number.MAX_SAFE_INTEGER, currency: "USD" as const },
  ])("preserves payment facts including the distinction between null and zero: %j", (evidence) => {
    expect(readMemberOrders(envelope([order({ payment: evidence })]))?.[0].payment).toEqual(evidence);
  });

  it("refuses a malformed optional payment container", () => {
    for (const value of [false, 0, "paid", [], {}]) {
      expect(readMemberOrders(envelope([{ ...order(), payment: value }]))).toBeNull();
    }
  });

  it.each(["amountDueCents", "amountCapturedCents", "amountRefundedCents", "currency"])("requires payment.%s when a payment object is present", (field) => {
    const evidence: Record<string, unknown> = { ...payment() };
    delete evidence[field];
    expect(readMemberOrders(envelope([{ ...order(), payment: evidence }]))).toBeNull();
  });

  it.each(["amountDueCents", "amountCapturedCents", "amountRefundedCents"])("rejects invalid payment.%s money", (field) => {
    const invalid = field === "amountDueCents" ? badCents : badCents.filter((value) => value !== null);
    for (const value of invalid) {
      expect(readMemberOrders(envelope([{ ...order(), payment: { ...payment(), [field]: value } }])), `${field}: ${String(value)}`).toBeNull();
    }
  });

  it("accepts only the exact USD payment currency", () => {
    for (const currency of ["usd", "EUR", "USD ", "", null, 1, {}]) {
      expect(readMemberOrders(envelope([{ ...order(), payment: { ...payment(), currency } }]))).toBeNull();
    }
  });
});

describe("readMemberOrders shipment rows", () => {
  it("accepts both canonical owners and nullable tracking fields", () => {
    const expected = order({ shipments: [
      shipment({ owner: "mitch", trackingNumber: null, carrier: null }),
      shipment({ owner: "xenios", trackingNumber: "SYNTHETIC-SECOND", carrier: "Synthetic Carrier Two" }),
    ] });
    expect(readMemberOrders(envelope([expected]))).toEqual([expected]);
  });

  it("refuses any malformed shipment without retaining the other valid rows", () => {
    for (const bad of [null, undefined, false, 0, "shipment", [], {}]) {
      expect(readMemberOrders(envelope([{ ...order(), shipments: [shipment(), bad] }]))).toBeNull();
    }
  });

  it.each(["owner", "status", "trackingNumber", "carrier"])("requires shipment.%s", (field) => {
    const row: Record<string, unknown> = { ...shipment() };
    delete row[field];
    expect(readMemberOrders(envelope([{ ...order(), shipments: [row] }]))).toBeNull();
  });

  it("refuses unknown shipment owners", () => {
    for (const owner of ["", "Mitch", "Xenios", "other", null, 1, {}]) {
      expect(readMemberOrders(envelope([{ ...order(), shipments: [{ ...shipment(), owner }] }]))).toBeNull();
    }
  });

  it.each(["status", "trackingNumber", "carrier"])("refuses malformed, blank, oversized, or control-bearing shipment.%s", (field) => {
    const invalid: unknown[] = [undefined, "", "   ", "x".repeat(161), 0, false, {}, []];
    if (field === "status") invalid.push(null);
    for (const control of ["\u0000", "\b", "\t", "\n", "\r", "\u001f", "\u007f"]) invalid.push(`synthetic${control}text`);
    for (const value of invalid) {
      expect(readMemberOrders(envelope([{ ...order(), shipments: [{ ...shipment(), [field]: value }] }])), `${field}: ${String(value)}`).toBeNull();
    }
  });
});

describe("memberShipmentSummary preserves shipment-source uncertainty", () => {
  it.each([undefined, "unavailable"] as const)("source %s never claims shipment completeness, even with an array of rows", (shipmentsSource) => {
    for (const shipments of [[], [shipment()]]) {
      expect(memberShipmentSummary(order({ shipmentsSource, shipments }))).toBe("Shipment details unavailable");
    }
  });

  it("a connected source returning no records does not invent an unfulfilled state", () => {
    expect(memberShipmentSummary(order({ shipmentsSource: "connected", shipments: [] }))).toBe("No shipment records returned");
  });

  it("uses the established owner labels, reported status, and optional tracking", () => {
    const value = order({ shipmentsSource: "connected", shipments: [
      shipment({ owner: "mitch", status: "Ready for carrier", trackingNumber: null, carrier: null }),
      shipment({ owner: "xenios", status: "In transit", trackingNumber: "SYNTHETIC-TRACKING-2" }),
    ] });
    expect(memberShipmentSummary(value)).toBe("Mitch: Ready for carrier · Xenios: In transit, tracking SYNTHETIC-TRACKING-2");
  });

  it("unknown wire fields cannot substitute for connected shipment evidence", () => {
    const result = readMemberOrders({
      ok: true,
      orders: [{ ...order({ shipments: [] }), shipmentHistoryComplete: true, shipmentStatus: "Delivered" }],
    });
    expect(result).toEqual([order({ shipments: [] })]);
    expect(memberShipmentSummary(result![0])).toBe("Shipment details unavailable");
  });

  it.each(["delivered", "fulfilled", "partially_fulfilled", "refunded"] as const)("does not derive shipment availability from lifecycle state %s", (state) => {
    expect(memberShipmentSummary(order({ state, shipments: [] }))).toBe("Shipment details unavailable");
  });
});
