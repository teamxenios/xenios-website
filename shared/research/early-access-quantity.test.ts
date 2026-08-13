import { describe, expect, it } from "vitest";
import {
  DIRECT_EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
  REQUEST_MAX_QUANTITY,
  isEarlyAccessAggregateQuantity,
  isEarlyAccessQuantity,
  readEarlyAccessQuantity,
  routeEarlyAccessQuantity,
} from "./early-access-quantity";

/**
 * F-013: NORMAL ORDER QUANTITY IS 1 THROUGH 50.
 *
 * These tests replace the F-012 suite, which asserted the opposite and would
 * have passed forever while the product was wrong. That is the specific hazard
 * this file exists to prevent: a green suite is only evidence if it is pinned
 * to the CURRENT decision. Every assertion below fails loudly if anyone
 * reintroduces a quantity-based review threshold.
 */
describe("F-013 quantity band, 1 through 50", () => {
  it("states one band and binds every alias to it", () => {
    expect(EARLY_ACCESS_MIN_QUANTITY).toBe(1);
    expect(EARLY_ACCESS_MAX_QUANTITY).toBe(50);
    // Under F-012 these held 20 and 50, and that divergence WAS the bug: a
    // quantity legal at one door was illegal at the next. Pinning them to the
    // same value makes that class of defect unrepresentable.
    expect(DIRECT_EARLY_ACCESS_MAX_QUANTITY).toBe(EARLY_ACCESS_MAX_QUANTITY);
    expect(REQUEST_MAX_QUANTITY).toBe(EARLY_ACCESS_MAX_QUANTITY);
  });

  it("accepts every whole quantity from 1 through 50", () => {
    for (let q = 1; q <= 50; q += 1) {
      expect(isEarlyAccessQuantity(q)).toBe(true);
    }
  });

  it("treats 21 as exactly as ordinary as 20", () => {
    // The founder's own phrasing. 21 was the first quantity F-012 diverted, so
    // it is the sharpest single probe for a surviving threshold.
    expect(routeEarlyAccessQuantity(20)).toEqual({ kind: "direct_cart", quantity: 20 });
    expect(routeEarlyAccessQuantity(21)).toEqual({ kind: "direct_cart", quantity: 21 });
  });

  it("routes 49 and 50 to the ordinary cart", () => {
    expect(routeEarlyAccessQuantity(49)).toEqual({ kind: "direct_cart", quantity: 49 });
    expect(routeEarlyAccessQuantity(50)).toEqual({ kind: "direct_cart", quantity: 50 });
  });

  it("fails closed at 51 rather than routing it anywhere", () => {
    // 51 is refused, NOT diverted. A refusal and a review queue are different
    // outcomes, and F-013 authorizes only the former.
    expect(isEarlyAccessQuantity(51)).toBe(false);
    expect(routeEarlyAccessQuantity(51)).toBeNull();
    expect(readEarlyAccessQuantity(51)).toBeNull();
  });

  it("NEGATIVE CONTROL: no quantity in 1..50 may produce a review state", () => {
    // The single assertion that would catch a regression to F-012 anywhere in
    // the band, rather than only at the old 20/21 boundary. If someone
    // reintroduces a threshold at 30, or 25, or 21, this fails.
    for (let q = 1; q <= 50; q += 1) {
      const route = routeEarlyAccessQuantity(q);
      expect(route).not.toBeNull();
      expect(route?.kind).toBe("direct_cart");
      // Belt and braces: the removed variant must not reappear under its old
      // name through any code path.
      expect(JSON.stringify(route)).not.toContain("manual_review");
    }
  });
});

describe("non-quantity restrictions survive F-013 untouched", () => {
  it("reports a per-product ceiling by NAMING it, not by queueing the buyer", () => {
    // Founder release authority may approve a product for fewer than 50 units.
    // That is product authority, a legitimate non-quantity rule. The buyer is
    // told the real limit instead of being dropped into a review queue.
    const route = routeEarlyAccessQuantity(30, 12);
    expect(route).toEqual({ kind: "exceeds_product_limit", quantity: 30, limit: 12 });
  });

  it("allows a quantity that sits exactly on the product ceiling", () => {
    expect(routeEarlyAccessQuantity(12, 12)).toEqual({ kind: "direct_cart", quantity: 12 });
  });

  it("lets the global band govern when no valid product limit is projected", () => {
    // F-012 sent an otherwise ordinary quantity to review whenever the limit
    // was malformed. That was backwards: a bad projection is a server bug, and
    // answering it by reclassifying a valid order hides the bug and penalizes
    // the buyer. The global band governs alone instead.
    expect(routeEarlyAccessQuantity(30, null)).toEqual({ kind: "direct_cart", quantity: 30 });
    expect(routeEarlyAccessQuantity(30, "12")).toEqual({ kind: "direct_cart", quantity: 30 });
    expect(routeEarlyAccessQuantity(30, 0)).toEqual({ kind: "direct_cart", quantity: 30 });
  });
});

describe("the band still refuses everything that is not a whole number in range", () => {
  it("refuses zero, negatives and 51", () => {
    for (const q of [0, -1, -50, 51, 100, 1_000]) {
      expect(isEarlyAccessQuantity(q)).toBe(false);
    }
  });

  it("coerces nothing", () => {
    // Each of these becomes a plausible quantity under `Number(x)` or `+x`, and
    // that is exactly why none of them may be accepted here.
    for (const q of ["1", "50", true, false, null, undefined, [], [5], {}, "" as unknown]) {
      expect(isEarlyAccessQuantity(q)).toBe(false);
      expect(readEarlyAccessQuantity(q)).toBeNull();
      expect(routeEarlyAccessQuantity(q)).toBeNull();
    }
  });

  it("refuses decimals, NaN and both infinities", () => {
    for (const q of [1.5, 49.999, 50.0000001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isEarlyAccessQuantity(q)).toBe(false);
    }
    // 50.0 is 50. A test that treated it as a decimal would be asserting a bug.
    expect(isEarlyAccessQuantity(50.0)).toBe(true);
  });

  it("refuses magnitudes beyond exact integer arithmetic", () => {
    for (const q of [1e21, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]) {
      expect(isEarlyAccessQuantity(q)).toBe(false);
    }
  });
});

describe("aggregate across several lines of the same variant", () => {
  it("permits sums up to 50 and refuses 51", () => {
    // 25 + 25 is a legal pair of lines and a legal total.
    expect(isEarlyAggregate(25, 25)).toBe(true);
    // 25 + 26 is a legal pair of lines and an ILLEGAL total, which is the whole
    // reason this check is separate from the per-line one.
    expect(isEarlyAggregate(25, 26)).toBe(false);
    expect(isEarlyAggregate(50, 1)).toBe(false);
  });

  it("moves with the band rather than restating a number", () => {
    expect(isEarlyAccessAggregateQuantity(EARLY_ACCESS_MAX_QUANTITY)).toBe(true);
    expect(isEarlyAccessAggregateQuantity(EARLY_ACCESS_MAX_QUANTITY + 1)).toBe(false);
  });
});

function isEarlyAggregate(a: number, b: number): boolean {
  return isEarlyAccessAggregateQuantity(a + b);
}
