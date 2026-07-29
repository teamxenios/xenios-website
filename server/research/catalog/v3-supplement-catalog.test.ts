import { describe, expect, it } from "vitest";
import {
  searchV3Supplements,
  v3PublicSupplements,
  v3SupplementPreviews,
} from "./v3-supplement-catalog";

describe("sanitized V3 supplement catalog", () => {
  it("contains supplier-independent supplement discovery profiles", () => {
    expect(v3SupplementPreviews).toHaveLength(15);
    expect(v3PublicSupplements).toBe(v3SupplementPreviews);
    expect(new Set(v3SupplementPreviews.map((item) => item.slug)).size).toBe(15);
  });

  it("keeps every supplement price-pending and purchase-disabled", () => {
    expect(
      v3SupplementPreviews.every(
        (item) =>
          item.pricingState === "public_price_pending" &&
          item.approvedPrice === null &&
          item.purchasingEnabled === false &&
          item.subscriptionState === "not_configured" &&
          item.flavorState === "not_confirmed",
      ),
    ).toBe(true);
  });

  it("searches safe identity fields without exposing operational facts", () => {
    expect(searchV3Supplements("magnesium").map((item) => item.slug)).toEqual([
      "magnesium-complex",
      "magnesium-l-threonate",
      "magnesium-malate",
    ]);
    expect(searchV3Supplements("no-match")).toEqual([]);
    expect(searchV3Supplements("")).toHaveLength(15);
  });

  it("serializes no price, SKU, inventory, lot, or source authority", () => {
    const serialized = JSON.stringify(v3SupplementPreviews);
    for (const key of [
      '"sku"',
      '"amountCents"',
      '"inventory"',
      '"lot"',
      '"officialUrl"',
    ]) {
      expect(serialized).not.toContain(key);
    }
  });
});
