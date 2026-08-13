import { describe, expect, it } from "vitest";
import {
  CLIENT_SUPPLIED_TOTAL_KEYS,
  EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS,
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MAX_UNIT_PRICE_CENTS,
  createEarlyAccessOrder,
  readEarlyAccessOrder,
  type EarlyAccessOrder,
} from "./early-access-order";

const NOW = "2026-08-04T12:00:00.000Z";

const BASE = Object.freeze({
  orderId: "ord_ea_0001",
  customerRef: "cus_samuel",
  productId: "prd_bpc157",
  variantId: "var_5mg",
  sku: "XEA-BPC-5MG",
  quantity: 2,
  unitPriceCents: 12_450,
  unitPriceVersion: "prdver-9f2c1a",
  currency: "USD",
  now: NOW,
});

function create(overrides: Record<string, unknown> = {}): ReturnType<typeof createEarlyAccessOrder> {
  return createEarlyAccessOrder({ ...BASE, ...overrides });
}

function createdOrder(overrides: Record<string, unknown> = {}): EarlyAccessOrder {
  const result = create(overrides);
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return result.value;
}

describe("early access order totals", () => {
  it("computes the line total and the order total from the server price", () => {
    const order = createdOrder();
    expect(order.line.unitPriceCents).toBe(12_450);
    expect(order.line.lineTotalCents).toBe(24_900);
    expect(order.orderTotalCents).toBe(24_900);
    expect(order.status).toBe("awaiting_payment");
    expect(order.createdAt).toBe(NOW);
    expect(order.line.pricedAt).toBe(NOW);
  });

  it("refuses every client supplied total key rather than ignoring it", () => {
    for (const key of CLIENT_SUPPLIED_TOTAL_KEYS) {
      const result = createEarlyAccessOrder({ ...BASE, [key]: 1 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("client_total_supplied");
    }
  });

  it("refuses a client total even when it agrees with the server computation", () => {
    const result = createEarlyAccessOrder({ ...BASE, orderTotalCents: 24_900 });
    expect(result).toEqual({ ok: false, code: "client_total_supplied" });
  });

  it("is deterministic for the same input", () => {
    expect(createdOrder()).toEqual(createdOrder());
  });
});

describe("early access order quantity", () => {
  it("accepts the normal-order boundaries through fifty", () => {
    for (const quantity of [1, 2, 3, 20, 21, 25, 49, 50]) {
      const order = createdOrder({ quantity });
      expect(order.line.quantity).toBe(quantity);
      expect(order.orderTotalCents).toBe(12_450 * quantity);
    }
  });

  it("refuses a quantity outside one through fifty", () => {
    for (const quantity of [
      0,
      -1,
      51,
      100,
      1.5,
      "2",
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
    ]) {
      const result = create({ quantity });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("quantity_out_of_range");
    }
  });
});

describe("early access order price and currency", () => {
  it("refuses a missing, zero, negative, fractional, or oversized price", () => {
    for (const unitPriceCents of [
      0,
      -1,
      12.5,
      null,
      undefined,
      "12450",
      Number.NaN,
      EARLY_ACCESS_MAX_UNIT_PRICE_CENTS + 1,
    ]) {
      const result = create({ unitPriceCents });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("price_invalid");
    }
  });

  it("accepts the maximum unit price and keeps the total inside the bound", () => {
    // The bound is the maximum unit price times the maximum QUANTITY, so the
    // order that reaches it exactly is the one at the top of the band.
    const order = createdOrder({
      unitPriceCents: EARLY_ACCESS_MAX_UNIT_PRICE_CENTS,
      quantity: EARLY_ACCESS_MAX_QUANTITY,
    });
    expect(order.orderTotalCents).toBe(EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS);
  });

  it("refuses a currency outside the closed vocabulary", () => {
    for (const currency of ["usd", "EUR", "GBP", "", null, 840]) {
      const result = create({ currency });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("currency_invalid");
    }
  });
});

describe("early access order identifiers and referral", () => {
  it("refuses malformed identifiers with a specific code", () => {
    expect(create({ orderId: "" })).toEqual({ ok: false, code: "order_id_invalid" });
    expect(create({ customerRef: "no" })).toEqual({ ok: false, code: "customer_invalid" });
    expect(create({ productId: "bad id" })).toEqual({ ok: false, code: "product_invalid" });
    expect(create({ variantId: 5 })).toEqual({ ok: false, code: "product_invalid" });
    expect(create({ sku: null })).toEqual({ ok: false, code: "product_invalid" });
  });

  it("treats an omitted or null referral code as no referral", () => {
    const withoutKey = createEarlyAccessOrder({ ...BASE });
    expect(withoutKey.ok && withoutKey.value.referralCode).toBeNull();
    expect(createdOrder({ referralCode: null }).referralCode).toBeNull();
  });

  it("keeps a well formed referral code and refuses a malformed one", () => {
    expect(createdOrder({ referralCode: "ALEX-2026" }).referralCode).toBe("ALEX-2026");
    for (const referralCode of ["a", "has space", 42, "code$"]) {
      const result = create({ referralCode });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("referral_invalid");
    }
  });

  it("refuses a non canonical timestamp", () => {
    for (const now of ["2026-08-04T12:00:00Z", "not-a-date", 1_754_308_800_000, null]) {
      const result = create({ now });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("input_invalid");
    }
  });
});

describe("early access order hostile input", () => {
  it("refuses an extra key, a missing key, and a non-record", () => {
    expect(createEarlyAccessOrder({ ...BASE, note: "x" })).toEqual({ ok: false, code: "input_invalid" });
    const { sku: _omitted, ...withoutSku } = BASE;
    expect(createEarlyAccessOrder(withoutSku)).toEqual({ ok: false, code: "input_invalid" });
    expect(createEarlyAccessOrder(null)).toEqual({ ok: false, code: "input_invalid" });
    expect(createEarlyAccessOrder([BASE])).toEqual({ ok: false, code: "input_invalid" });
  });

  it("refuses an accessor supplied price without invoking the getter", () => {
    let reads = 0;
    const hostile: Record<string, unknown> = { ...BASE };
    delete hostile.unitPriceCents;
    Object.defineProperty(hostile, "unitPriceCents", {
      get() {
        reads += 1;
        return 1;
      },
      enumerable: true,
      configurable: true,
    });
    expect(createEarlyAccessOrder(hostile)).toEqual({ ok: false, code: "input_invalid" });
    expect(reads).toBe(0);
  });

  it("refuses a Proxy wrapped request", () => {
    expect(createEarlyAccessOrder(new Proxy({ ...BASE }, {}))).toEqual({
      ok: false,
      code: "input_invalid",
    });
  });
});

describe("early access order immutability", () => {
  it("freezes the order, the line, and the result", () => {
    const result = create();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.line)).toBe(true);
    expect(() => {
      (result.value as unknown as Record<string, unknown>).orderTotalCents = 1;
    }).toThrow();
    expect(() => {
      (result.value.line as unknown as Record<string, unknown>).unitPriceCents = 1;
    }).toThrow();
  });
});

describe("readEarlyAccessOrder", () => {
  it("round trips an order this module created", () => {
    const order = createdOrder();
    expect(readEarlyAccessOrder(JSON.parse(JSON.stringify(order)) as unknown)).toEqual(order);
  });

  it("re-derives the totals and refuses a snapshot whose total was tampered with", () => {
    const order = createdOrder();
    const inflated = { ...order, orderTotalCents: 1 };
    expect(readEarlyAccessOrder(inflated)).toBeNull();
    const inflatedLine = { ...order, line: { ...order.line, lineTotalCents: 1 } };
    expect(readEarlyAccessOrder(inflatedLine)).toBeNull();
    const repricedLine = { ...order, line: { ...order.line, unitPriceCents: 1 } };
    expect(readEarlyAccessOrder(repricedLine)).toBeNull();
  });

  it("refuses a currency that disagrees between the order and its line", () => {
    const order = createdOrder();
    expect(readEarlyAccessOrder({ ...order, line: { ...order.line, currency: "EUR" } })).toBeNull();
  });

  it("accepts every lifecycle status but refuses an invented one", () => {
    const order = createdOrder();
    for (const status of [
      "awaiting_payment",
      "payment_under_review",
      "payment_verified",
      "payment_rejected",
    ]) {
      expect(readEarlyAccessOrder({ ...order, status })?.status).toBe(status);
    }
    expect(readEarlyAccessOrder({ ...order, status: "paid" })).toBeNull();
    expect(readEarlyAccessOrder({ ...order, status: "shipped" })).toBeNull();
  });

  it("refuses an extra key on the order or on its line", () => {
    const order = createdOrder();
    expect(readEarlyAccessOrder({ ...order, paidAt: NOW })).toBeNull();
    expect(readEarlyAccessOrder({ ...order, line: { ...order.line, cost: 1 } })).toBeNull();
  });
});
