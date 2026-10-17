import { describe, expect, it } from "vitest";

import {
  CLIENT_SUPPLIED_MONEY_KEYS,
  EARLY_ACCESS_MAX_MONEY_CENTS,
  ORDER_MONEY_SNAPSHOT_KEYS,
  buildOrderMoneySnapshot,
  moneySnapshotInvariantHolds,
  payableTotalFromComponents,
  payableTotalOf,
  readOrderMoneySnapshot,
  type OrderMoneySnapshot,
} from "./order-money";
import { EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS } from "./early-access-order";

const BASE = Object.freeze({
  currency: "USD",
  subtotalCents: 59_700,
  discountCents: 11_940,
  shippingCents: 0,
  taxCents: 0,
  promotionId: "early-access-bundle-3",
  promotionVersion: "a".repeat(64),
});

function build(overrides: Record<string, unknown> = {}) {
  return buildOrderMoneySnapshot({ ...BASE, ...overrides });
}

function built(overrides: Record<string, unknown> = {}): OrderMoneySnapshot {
  const result = build(overrides);
  if (!result.ok) throw new Error(`fixture money refused: ${result.code}`);
  return result.value;
}

describe("the money snapshot", () => {
  it("derives the payable total and never reads one from the caller", () => {
    const money = built();
    expect(money.payableTotalCents).toBe(47_760);
    expect(payableTotalOf(money)).toBe(47_760);
    expect(moneySnapshotInvariantHolds(money)).toBe(true);
    expect(Object.keys(money).sort()).toEqual([...ORDER_MONEY_SNAPSHOT_KEYS].sort());
  });

  it("refuses any caller supplied amount with its own code", () => {
    for (const key of CLIENT_SUPPLIED_MONEY_KEYS) {
      expect(buildOrderMoneySnapshot({ ...BASE, [key]: 1 })).toEqual({
        ok: false,
        code: "client_amount_supplied",
      });
    }
  });

  it("carries shipping and tax through the invariant", () => {
    const money = built({ shippingCents: 1_250, taxCents: 400 });
    expect(money.payableTotalCents).toBe(59_700 - 11_940 + 1_250 + 400);
    expect(moneySnapshotInvariantHolds(money)).toBe(true);
  });

  it("is frozen, so a later caller cannot rewrite an amount in place", () => {
    const money = built();
    expect(Object.isFrozen(money)).toBe(true);
    expect(() => {
      (money as unknown as Record<string, unknown>).payableTotalCents = 1;
    }).toThrow();
  });

  it("keeps the domain money ceiling equal to the order total ceiling", () => {
    expect(EARLY_ACCESS_MAX_MONEY_CENTS).toBe(EARLY_ACCESS_MAX_ORDER_TOTAL_CENTS);
  });
});

describe("the money snapshot fails closed", () => {
  it("refuses a negative subtotal", () => {
    expect(build({ subtotalCents: -1 })).toEqual({ ok: false, code: "subtotal_invalid" });
  });

  it("refuses a negative payable total", () => {
    // Shipping and tax are zero, so a discount at the subtotal leaves nothing payable,
    // and anything beyond it is refused before the payable check is even reached.
    expect(build({ discountCents: 59_701 })).toEqual({
      ok: false,
      code: "discount_exceeds_subtotal",
    });
    expect(build({ discountCents: 59_700 })).toEqual({
      ok: false,
      code: "payable_total_invalid",
    });
  });

  it("refuses a discount larger than the subtotal it applies to", () => {
    expect(build({ subtotalCents: 100, discountCents: 101 })).toEqual({
      ok: false,
      code: "discount_exceeds_subtotal",
    });
  });

  it("refuses a non integer amount in any component", () => {
    expect(build({ subtotalCents: 59_700.5 })).toEqual({ ok: false, code: "subtotal_invalid" });
    expect(build({ discountCents: 0.1 })).toEqual({ ok: false, code: "discount_invalid" });
    expect(build({ shippingCents: 1.5 })).toEqual({ ok: false, code: "shipping_invalid" });
    expect(build({ taxCents: Number.NaN })).toEqual({ ok: false, code: "tax_invalid" });
  });

  it("refuses an overflowing amount", () => {
    expect(build({ subtotalCents: Number.MAX_SAFE_INTEGER })).toEqual({
      ok: false,
      code: "subtotal_invalid",
    });
    expect(build({ subtotalCents: Number.MAX_SAFE_INTEGER + 1 })).toEqual({
      ok: false,
      code: "subtotal_invalid",
    });
    // Each component is inside its bound but the sum is not.
    expect(
      build({
        subtotalCents: EARLY_ACCESS_MAX_MONEY_CENTS,
        discountCents: 0,
        shippingCents: 1,
      }),
    ).toEqual({ ok: false, code: "amount_overflow" });
  });

  it("refuses a mixed or unsupported currency", () => {
    for (const currency of ["EUR", "usd", "", null, 840]) {
      expect(build({ currency })).toEqual({ ok: false, code: "currency_unsupported" });
    }
  });

  it("refuses a discount with no promotion behind it", () => {
    expect(build({ promotionId: null, promotionVersion: null })).toEqual({
      ok: false,
      code: "promotion_invalid",
    });
    expect(build({ promotionVersion: null })).toEqual({ ok: false, code: "promotion_invalid" });
    expect(build({ promotionId: null })).toEqual({ ok: false, code: "promotion_invalid" });
  });

  it("accepts no promotion when nothing was taken off", () => {
    const money = built({ discountCents: 0, promotionId: null, promotionVersion: null });
    expect(money.payableTotalCents).toBe(59_700);
    expect(money.promotionId).toBeNull();
  });

  it("refuses an unexpected key rather than ignoring it", () => {
    expect(buildOrderMoneySnapshot({ ...BASE, note: "x" })).toEqual({
      ok: false,
      code: "input_invalid",
    });
    expect(buildOrderMoneySnapshot(null)).toEqual({ ok: false, code: "input_invalid" });
    expect(buildOrderMoneySnapshot([BASE])).toEqual({ ok: false, code: "input_invalid" });
  });
});

describe("reading a stored money snapshot", () => {
  it("round trips a snapshot it built", () => {
    const money = built();
    expect(readOrderMoneySnapshot({ ...money })).toEqual(money);
  });

  it("refuses a stored snapshot whose payable total disagrees with its components", () => {
    const money = built();
    expect(readOrderMoneySnapshot({ ...money, payableTotalCents: 59_700 })).toBeNull();
    expect(readOrderMoneySnapshot({ ...money, payableTotalCents: 47_759 })).toBeNull();
    expect(readOrderMoneySnapshot({ ...money, discountCents: 0 })).toBeNull();
    expect(readOrderMoneySnapshot({ ...money, subtotalCents: 59_701 })).toBeNull();
  });

  it("refuses a stored snapshot in another currency", () => {
    const money = built();
    expect(readOrderMoneySnapshot({ ...money, currency: "EUR" })).toBeNull();
  });

  it("refuses a stored snapshot with a missing or extra key", () => {
    const money = { ...built() } as Record<string, unknown>;
    const missing = { ...money };
    delete missing.taxCents;
    expect(readOrderMoneySnapshot(missing)).toBeNull();
    expect(readOrderMoneySnapshot({ ...money, extra: 1 })).toBeNull();
  });
});

describe("re-deriving a payable total from components", () => {
  it("mints the amount only when the invariant holds", () => {
    expect(
      payableTotalFromComponents({
        subtotalCents: 59_700,
        discountCents: 11_940,
        shippingCents: 0,
        taxCents: 0,
        statedPayableTotalCents: 47_760,
      }),
    ).toBe(47_760);
  });

  it("returns null rather than correcting a document that does not add up", () => {
    expect(
      payableTotalFromComponents({
        subtotalCents: 59_700,
        discountCents: 11_940,
        shippingCents: 0,
        taxCents: 0,
        statedPayableTotalCents: 59_700,
      }),
    ).toBeNull();
    expect(
      payableTotalFromComponents({
        subtotalCents: 100,
        discountCents: 100,
        shippingCents: 0,
        taxCents: 0,
        statedPayableTotalCents: 0,
      }),
    ).toBeNull();
  });
});
