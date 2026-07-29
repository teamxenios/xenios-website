// The formatter's load-bearing promise: a $0.00 output is impossible. Every
// path that could produce one (zero, negative, float, NaN, Infinity, beyond
// safe range, unknown currency) is rejected with a typed reason, and the
// valid path is exact integer arithmetic with locale-fixed en-US output.

import { describe, expect, it } from "vitest";
import {
  formatCustomerAmountCents,
  PriceFormatError,
  tryFormatCustomerAmountCents,
  type PriceFormatFailure,
} from "./format";

describe("formatCustomerAmountCents (exact output)", () => {
  const cases: Array<[number, string]> = [
    [1, "$0.01"],
    [99, "$0.99"],
    [100, "$1.00"],
    [1015, "$10.15"],
    [100000, "$1,000.00"],
    [180000, "$1,800.00"],
    [123456789, "$1,234,567.89"],
    [999999999, "$9,999,999.99"],
  ];

  for (const [cents, expected] of cases) {
    it(`formats ${cents} cents as ${expected}`, () => {
      expect(formatCustomerAmountCents(cents, "USD")).toBe(expected);
    });
  }

  it("stays exact at the top of the safe integer range", () => {
    // The largest safe integer, formatted with pure integer arithmetic.
    expect(formatCustomerAmountCents(Number.MAX_SAFE_INTEGER, "USD")).toBe(
      "$90,071,992,547,409.91",
    );
  });
});

describe("formatCustomerAmountCents (the impossible-$0 invariant)", () => {
  const rejected: Array<[number, PriceFormatFailure]> = [
    [0, "zero_amount"],
    [-0, "zero_amount"],
    [-1, "negative_amount"],
    [-180000, "negative_amount"],
    [19.99, "non_integer_amount"],
    [0.5, "non_integer_amount"],
    [Number.NaN, "unsafe_amount"],
    [Number.POSITIVE_INFINITY, "unsafe_amount"],
    [Number.NEGATIVE_INFINITY, "unsafe_amount"],
    [2 ** 53, "unsafe_amount"],
  ];

  for (const [cents, reason] of rejected) {
    it(`rejects ${String(cents)} with reason ${reason}`, () => {
      let thrown: unknown;
      try {
        formatCustomerAmountCents(cents, "USD");
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(PriceFormatError);
      expect((thrown as PriceFormatError).reason).toBe(reason);
    });
  }

  it("never returns a formatted zero from any rejected input", () => {
    for (const [cents] of rejected) {
      const result = tryFormatCustomerAmountCents(cents, "USD");
      expect(result.ok).toBe(false);
      // A failed result carries no text at all, so "$0.00" cannot escape.
      expect("text" in result).toBe(false);
    }
  });

  it("rejects currencies off the allowlist, including case variants", () => {
    for (const currency of ["EUR", "usd", "CAD", ""]) {
      let thrown: unknown;
      try {
        formatCustomerAmountCents(100, currency);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(PriceFormatError);
      expect((thrown as PriceFormatError).reason).toBe("unsupported_currency");
    }
  });
});

describe("tryFormatCustomerAmountCents", () => {
  it("matches the throwing formatter on the valid path", () => {
    expect(tryFormatCustomerAmountCents(180000, "USD")).toEqual({
      ok: true,
      text: "$1,800.00",
    });
  });

  it("returns the typed reason instead of throwing", () => {
    expect(tryFormatCustomerAmountCents(0, "USD")).toEqual({
      ok: false,
      reason: "zero_amount",
    });
    expect(tryFormatCustomerAmountCents(100, "EUR")).toEqual({
      ok: false,
      reason: "unsupported_currency",
    });
  });
});
