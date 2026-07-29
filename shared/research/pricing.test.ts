import { describe, expect, it } from "vitest";
import { CART_PURCHASE_AUDIENCES } from "./cart-product-selection";
import { PRICE_AUDIENCES } from "./product-admin";
import {
  computeLineTotalCents,
  CUSTOMER_PRICE_AUDIENCES,
  isCustomerPrice,
  isCustomerSafeAmountCents,
  isSafeQuantity,
  isValidCartPriceSnapshot,
  isValidOrderLinePriceSnapshot,
  normalizePriceCurrency,
  PRICE_RESOLUTION_FAILURE_REASONS,
  SUPPORTED_PRICE_CURRENCIES,
  type CartPriceSnapshot,
  type CustomerPrice,
  type OrderLinePriceSnapshot,
} from "./pricing";

const customerPrice: CustomerPrice = {
  priceId: "price-a",
  productId: "product-a",
  variantId: "variant-a",
  audience: "retail",
  amountCents: 14900,
  currency: "USD",
  effectiveAt: "2026-07-01T00:00:00+00:00",
  expiresAt: null,
  version: 2,
};

const snapshotBase = {
  productId: "product-a",
  variantId: "variant-a",
  sku: "SKU-A",
  displayName: "Product A",
  priceId: "price-a",
  priceVersion: 2,
  audience: "retail" as const,
  currency: "USD" as const,
  unitAmountCents: 14900,
  quantity: 3,
  lineTotalCents: 44700,
  effectiveAt: "2026-07-01T00:00:00+00:00",
  expiresAt: null,
};

const cartSnapshot: CartPriceSnapshot = {
  ...snapshotBase,
  pricedAt: "2026-07-28T12:00:00+00:00",
};

const orderSnapshot: OrderLinePriceSnapshot = {
  ...snapshotBase,
  agreedAt: "2026-07-28T12:05:00+00:00",
};

describe("customer price audiences", () => {
  it("stays identical to the cart purchase audiences and never gains compare_at", () => {
    expect([...CUSTOMER_PRICE_AUDIENCES]).toEqual([...CART_PURCHASE_AUDIENCES]);
    expect(CUSTOMER_PRICE_AUDIENCES).not.toContain("compare_at");
    expect(PRICE_AUDIENCES).toContain("compare_at");
  });

  it("keeps the failure taxonomy closed and complete", () => {
    expect([...PRICE_RESOLUTION_FAILURE_REASONS].sort()).toEqual(
      [
        "member_ineligible",
        "price_ambiguous",
        "price_expired",
        "price_future",
        "price_inactive",
        "price_missing",
        "price_unapproved",
        "product_inactive",
        "variant_inactive",
        "variant_unapproved",
        "wrong_audience",
        "wrong_currency",
      ].sort(),
    );
  });
});

describe("currency normalization", () => {
  it("allowlists USD in any casing or padding", () => {
    expect(SUPPORTED_PRICE_CURRENCIES).toEqual(["USD"]);
    expect(normalizePriceCurrency("USD")).toBe("USD");
    expect(normalizePriceCurrency(" usd ")).toBe("USD");
    expect(normalizePriceCurrency("Usd")).toBe("USD");
  });

  it("fails closed for anything off the allowlist", () => {
    expect(normalizePriceCurrency("EUR")).toBeNull();
    expect(normalizePriceCurrency("")).toBeNull();
    expect(normalizePriceCurrency("US D")).toBeNull();
    expect(normalizePriceCurrency("USD0")).toBeNull();
  });
});

describe("amount and quantity guards", () => {
  it("accepts only positive safe integers as amounts", () => {
    expect(isCustomerSafeAmountCents(1)).toBe(true);
    expect(isCustomerSafeAmountCents(14900)).toBe(true);
    expect(isCustomerSafeAmountCents(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isCustomerSafeAmountCents(0)).toBe(false);
    expect(isCustomerSafeAmountCents(-1)).toBe(false);
    expect(isCustomerSafeAmountCents(1.5)).toBe(false);
    expect(isCustomerSafeAmountCents(Number.NaN)).toBe(false);
    expect(isCustomerSafeAmountCents(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isCustomerSafeAmountCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isCustomerSafeAmountCents("14900")).toBe(false);
    expect(isCustomerSafeAmountCents(null)).toBe(false);
  });

  it("accepts only positive safe integers as quantities", () => {
    expect(isSafeQuantity(1)).toBe(true);
    expect(isSafeQuantity(250)).toBe(true);
    expect(isSafeQuantity(0)).toBe(false);
    expect(isSafeQuantity(-2)).toBe(false);
    expect(isSafeQuantity(2.5)).toBe(false);
    expect(isSafeQuantity("2")).toBe(false);
  });
});

describe("customer price guard", () => {
  it("accepts a complete customer price", () => {
    expect(isCustomerPrice(customerPrice)).toBe(true);
    expect(
      isCustomerPrice({ ...customerPrice, expiresAt: "2026-12-31T00:00:00Z" }),
    ).toBe(true);
  });

  it("fails closed on missing, zero, or off-contract fields", () => {
    expect(isCustomerPrice(null)).toBe(false);
    expect(isCustomerPrice({})).toBe(false);
    expect(isCustomerPrice({ ...customerPrice, amountCents: 0 })).toBe(false);
    expect(isCustomerPrice({ ...customerPrice, amountCents: -100 })).toBe(false);
    expect(isCustomerPrice({ ...customerPrice, priceId: "  " })).toBe(false);
    expect(isCustomerPrice({ ...customerPrice, audience: "compare_at" })).toBe(
      false,
    );
    expect(isCustomerPrice({ ...customerPrice, currency: "EUR" })).toBe(false);
    expect(isCustomerPrice({ ...customerPrice, version: 0 })).toBe(false);
    expect(isCustomerPrice({ ...customerPrice, version: 1.5 })).toBe(false);
    expect(isCustomerPrice({ ...customerPrice, effectiveAt: "" })).toBe(false);
    expect(isCustomerPrice({ ...customerPrice, expiresAt: 7 })).toBe(false);
  });
});

describe("integer line totals", () => {
  it("multiplies exactly with integer arithmetic", () => {
    expect(computeLineTotalCents(14900, 2)).toBe(29800);
    expect(computeLineTotalCents(1, 1)).toBe(1);
    expect(computeLineTotalCents(9999, 250)).toBe(2_499_750);
  });

  it("throws on any non positive, fractional, or unsafe input", () => {
    expect(() => computeLineTotalCents(0, 1)).toThrow(RangeError);
    expect(() => computeLineTotalCents(-14900, 1)).toThrow(RangeError);
    expect(() => computeLineTotalCents(149.5, 2)).toThrow(RangeError);
    expect(() => computeLineTotalCents(14900, 0)).toThrow(RangeError);
    expect(() => computeLineTotalCents(14900, -1)).toThrow(RangeError);
    expect(() => computeLineTotalCents(14900, 2.5)).toThrow(RangeError);
    expect(() => computeLineTotalCents(Number.NaN, 1)).toThrow(RangeError);
    expect(() =>
      computeLineTotalCents(Number.MAX_SAFE_INTEGER, 2),
    ).toThrow(RangeError);
  });
});

describe("cart price snapshot validity", () => {
  it("accepts a consistent snapshot", () => {
    expect(isValidCartPriceSnapshot(cartSnapshot)).toBe(true);
  });

  it("fails closed on inconsistent or malformed fields", () => {
    expect(isValidCartPriceSnapshot(null)).toBe(false);
    expect(isValidCartPriceSnapshot({})).toBe(false);
    expect(
      isValidCartPriceSnapshot({ ...cartSnapshot, lineTotalCents: 44701 }),
    ).toBe(false);
    expect(
      isValidCartPriceSnapshot({ ...cartSnapshot, unitAmountCents: 0 }),
    ).toBe(false);
    expect(isValidCartPriceSnapshot({ ...cartSnapshot, quantity: 0 })).toBe(
      false,
    );
    expect(isValidCartPriceSnapshot({ ...cartSnapshot, quantity: 1.5 })).toBe(
      false,
    );
    expect(isValidCartPriceSnapshot({ ...cartSnapshot, sku: " " })).toBe(false);
    expect(
      isValidCartPriceSnapshot({ ...cartSnapshot, audience: "compare_at" }),
    ).toBe(false);
    expect(
      isValidCartPriceSnapshot({ ...cartSnapshot, currency: "EUR" }),
    ).toBe(false);
    expect(
      isValidCartPriceSnapshot({ ...cartSnapshot, priceVersion: 0 }),
    ).toBe(false);
    expect(isValidCartPriceSnapshot({ ...cartSnapshot, pricedAt: "" })).toBe(
      false,
    );
    expect(isValidCartPriceSnapshot(orderSnapshot)).toBe(false);
  });
});

describe("order line price snapshot validity", () => {
  it("accepts a consistent snapshot", () => {
    expect(isValidOrderLinePriceSnapshot(orderSnapshot)).toBe(true);
  });

  it("fails closed on inconsistent or malformed fields", () => {
    expect(isValidOrderLinePriceSnapshot(cartSnapshot)).toBe(false);
    expect(
      isValidOrderLinePriceSnapshot({ ...orderSnapshot, agreedAt: " " }),
    ).toBe(false);
    expect(
      isValidOrderLinePriceSnapshot({
        ...orderSnapshot,
        lineTotalCents: 14900,
      }),
    ).toBe(false);
    expect(
      isValidOrderLinePriceSnapshot({
        ...orderSnapshot,
        unitAmountCents: -14900,
      }),
    ).toBe(false);
    expect(
      isValidOrderLinePriceSnapshot({ ...orderSnapshot, displayName: "" }),
    ).toBe(false);
  });
});
