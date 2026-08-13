import { describe, expect, it } from "vitest";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
  isEarlyAccessQuantity,
  readEarlyAccessQuantity,
  routeEarlyAccessQuantity,
} from "./early-access-quantity";
import { FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT } from "../../server/research/early-access/release/founder-first-release-seed";

/**
 * The founder's acceptance list, asserted literally.
 *
 * Every other quantity test in this repository checks a mechanism. This one
 * checks the SENTENCE the founder wrote: Q1 normal, Q20 normal, Q21 normal,
 * Q25 normal, Q49 normal, Q50 normal, Q51 refused. It exists so that the
 * decision can be verified without reading any implementation, and so that a
 * future refactor has to break something obviously named before it can quietly
 * change the policy.
 */
describe("F-013 founder acceptance list", () => {
  const NORMAL = [1, 20, 21, 25, 49, 50] as const;

  it.each(NORMAL)("Q%i is a normal order quantity", (quantity) => {
    expect(isEarlyAccessQuantity(quantity)).toBe(true);
    expect(readEarlyAccessQuantity(quantity)).toBe(quantity);
    expect(routeEarlyAccessQuantity(quantity)).toEqual({
      kind: "direct_cart",
      quantity,
    });
  });

  it("Q51 is refused, and refused is not the same as diverted", () => {
    expect(isEarlyAccessQuantity(51)).toBe(false);
    expect(readEarlyAccessQuantity(51)).toBeNull();
    // Null is a refusal. If this ever returns a route object of any kind, some
    // layer has started accepting 51 by sending it somewhere else.
    expect(routeEarlyAccessQuantity(51)).toBeNull();
  });

  it("no quantity in the whole band produces a review state", () => {
    for (let q = EARLY_ACCESS_MIN_QUANTITY; q <= EARLY_ACCESS_MAX_QUANTITY; q += 1) {
      expect(routeEarlyAccessQuantity(q)?.kind).toBe("direct_cart");
    }
  });

  it("the seeded founder release ceiling is the band, not a lower silent cap", () => {
    // The last code-level hiding place. A seed below the band would refuse Q21
    // on PRODUCT authority in any freshly seeded environment, while every
    // quantity test above still passed.
    expect(FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT).toBe(EARLY_ACCESS_MAX_QUANTITY);
    expect(FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT).toBe(50);
  });
});
