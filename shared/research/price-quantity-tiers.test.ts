import { describe, expect, it } from "vitest";
import { readCanonicalPriceTiers, resolveCanonicalQuantityPrice } from "./price-quantity-tiers";

const TIERS = [
  { minimumQuantity: 1, amountCents: 12900 },
  { minimumQuantity: 5, amountCents: 12300 },
  { minimumQuantity: 10, amountCents: 11700 },
];

describe("canonical price version quantity ladder", () => {
  it.each([[1, 12900], [4, 12900], [5, 12300], [9, 12300], [10, 11700], [50, 11700]])(
    "resolves quantity %i to %i cents", (quantity, amount) => {
      expect(resolveCanonicalQuantityPrice(12900, TIERS, quantity)?.amountCents).toBe(amount);
    },
  );
  it("preserves a legacy scalar and does not mutate the version", () => {
    expect(resolveCanonicalQuantityPrice(9900, undefined, 10)).toEqual({ minimumQuantity: 1, amountCents: 9900 });
    expect(resolveCanonicalQuantityPrice(9900, [], 10)?.amountCents).toBe(9900);
    expect(resolveCanonicalQuantityPrice(3_000_000_000, undefined, 1)?.amountCents).toBe(3_000_000_000);
    const frozen = Object.freeze(TIERS.map(tier => Object.freeze({ ...tier })));
    const selected = resolveCanonicalQuantityPrice(12900, frozen, 5);
    expect(selected).toEqual(TIERS[1]);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(frozen[0].amountCents).toBe(12900);
  });
  it.each([null, false, "5", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    "rejects invalid or overflowing quantity %s", quantity => {
      expect(resolveCanonicalQuantityPrice(12900, TIERS, quantity)).toBeNull();
    },
  );
  it.each([
    null, {}, [{ minimumQuantity: 5, amountCents: 12900 }],
    [{ minimumQuantity: 1, amountCents: 12800 }],
    [TIERS[0], { minimumQuantity: 5, amountCents: 13000 }],
    [TIERS[0], TIERS[2], TIERS[1]], [TIERS[0], TIERS[0]],
    [TIERS[0], { minimumQuantity: 5, amountCents: 0 }],
    [TIERS[0], { minimumQuantity: 5, amountCents: 12300.5 }],
    [{ ...TIERS[0], cost: 2100 }],
  ])("refuses malformed ladders instead of repairing or using a scalar", value => {
    expect(readCanonicalPriceTiers(12900, value)).toBeNull();
  });
});
