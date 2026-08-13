import { describe, expect, it } from "vitest";

import {
  DIRECT_EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MAX_QUANTITY,
  REQUEST_MAX_QUANTITY,
  isDirectEarlyAccessQuantity,
  isEarlyAccessRequestQuantity,
  routeEarlyAccessQuantity,
} from "./early-access-quantity";

describe("F-012 split quantity authority", () => {
  it("keeps every compatibility direct-cart name at 20", () => {
    expect(DIRECT_EARLY_ACCESS_MAX_QUANTITY).toBe(20);
    expect(EARLY_ACCESS_MAX_QUANTITY).toBe(DIRECT_EARLY_ACCESS_MAX_QUANTITY);
    expect(EARLY_ACCESS_MAX_QUANTITY).not.toBe(REQUEST_MAX_QUANTITY);
    expect(isDirectEarlyAccessQuantity(20)).toBe(true);
    expect(isDirectEarlyAccessQuantity(21)).toBe(false);
    expect(isDirectEarlyAccessQuantity(50)).toBe(false);
  });

  it("accepts manual requests through 50 and refuses 51 without coercion", () => {
    expect(REQUEST_MAX_QUANTITY).toBe(50);
    expect(isEarlyAccessRequestQuantity(50)).toBe(true);
    expect(isEarlyAccessRequestQuantity(51)).toBe(false);
    expect(isEarlyAccessRequestQuantity("50")).toBe(false);
  });

  it("routes 20 direct, 21 and 50 manual, and 51 nowhere", () => {
    expect(routeEarlyAccessQuantity(20)).toEqual({ kind: "direct_cart", quantity: 20 });
    expect(routeEarlyAccessQuantity(21)).toEqual({ kind: "manual_review", quantity: 21 });
    expect(routeEarlyAccessQuantity(50)).toEqual({ kind: "manual_review", quantity: 50 });
    expect(routeEarlyAccessQuantity(51)).toBeNull();
  });

  it("uses the strict effective direct authority and fails closed on a bad ceiling", () => {
    expect(routeEarlyAccessQuantity(20, 19)).toEqual({ kind: "manual_review", quantity: 20 });
    expect(routeEarlyAccessQuantity(19, 19)).toEqual({ kind: "direct_cart", quantity: 19 });
    expect(routeEarlyAccessQuantity(1, 50)).toEqual({ kind: "manual_review", quantity: 1 });
    expect(routeEarlyAccessQuantity(1, null)).toEqual({ kind: "manual_review", quantity: 1 });
  });
});
