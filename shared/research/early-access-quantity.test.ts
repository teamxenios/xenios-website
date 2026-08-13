import { describe, expect, it } from "vitest";

import {
  DIRECT_EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MAX_QUANTITY,
  REQUEST_MAX_QUANTITY,
  isDirectEarlyAccessQuantity,
  isEarlyAccessRequestQuantity,
  routeEarlyAccessQuantity,
} from "./early-access-quantity";

describe("founder normal-order quantity authority", () => {
  it("keeps every compatibility name on the one 1..50 normal-order band", () => {
    expect(DIRECT_EARLY_ACCESS_MAX_QUANTITY).toBe(50);
    expect(EARLY_ACCESS_MAX_QUANTITY).toBe(DIRECT_EARLY_ACCESS_MAX_QUANTITY);
    expect(EARLY_ACCESS_MAX_QUANTITY).toBe(REQUEST_MAX_QUANTITY);
    expect(isDirectEarlyAccessQuantity(20)).toBe(true);
    expect(isDirectEarlyAccessQuantity(21)).toBe(true);
    expect(isDirectEarlyAccessQuantity(50)).toBe(true);
  });

  it("accepts normal orders through 50 and refuses 51 without coercion", () => {
    expect(REQUEST_MAX_QUANTITY).toBe(50);
    expect(isEarlyAccessRequestQuantity(50)).toBe(true);
    expect(isEarlyAccessRequestQuantity(51)).toBe(false);
    expect(isEarlyAccessRequestQuantity("50")).toBe(false);
  });

  it("routes every valid default quantity direct and 51 nowhere", () => {
    expect(routeEarlyAccessQuantity(1)).toEqual({ kind: "direct_cart", quantity: 1 });
    expect(routeEarlyAccessQuantity(20)).toEqual({ kind: "direct_cart", quantity: 20 });
    expect(routeEarlyAccessQuantity(21)).toEqual({ kind: "direct_cart", quantity: 21 });
    expect(routeEarlyAccessQuantity(25)).toEqual({ kind: "direct_cart", quantity: 25 });
    expect(routeEarlyAccessQuantity(49)).toEqual({ kind: "direct_cart", quantity: 49 });
    expect(routeEarlyAccessQuantity(50)).toEqual({ kind: "direct_cart", quantity: 50 });
    expect(routeEarlyAccessQuantity(51)).toBeNull();
  });

  it("uses explicit lower authority without classifying the quantity for review", () => {
    expect(routeEarlyAccessQuantity(20, 19)).toEqual({ kind: "order_request", quantity: 20, directLimit: 19 });
    expect(routeEarlyAccessQuantity(19, 19)).toEqual({ kind: "direct_cart", quantity: 19 });
    expect(routeEarlyAccessQuantity(1, 50)).toEqual({ kind: "direct_cart", quantity: 1 });
    expect(routeEarlyAccessQuantity(1, null)).toEqual({ kind: "order_request", quantity: 1, directLimit: null });
  });
});
