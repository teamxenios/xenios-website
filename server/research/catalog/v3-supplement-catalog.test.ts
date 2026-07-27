import { describe, expect, it } from "vitest";
import {
  searchV3Supplements,
  v3PublicSupplements,
} from "./v3-supplement-catalog";

describe("V3 public supplement candidates", () => {
  it("projects exactly 62 unique truthful coming-soon candidates", () => {
    expect(v3PublicSupplements).toHaveLength(62);
    expect(new Set(v3PublicSupplements.map((item) => item.id)).size).toBe(62);
    for (const item of v3PublicSupplements) {
      expect(item.publicState).toBe("coming_soon");
      expect(item.formatState).toBe("pending_confirmation");
      expect(item.sizeState).toBe("pending_confirmation");
      expect(item.flavorState).toBe("pending_if_applicable");
      expect(item.subscriptionState).toBe("disabled");
      expect(item.price).toBeNull();
      expect(item.sku).toBeNull();
    }
  });

  it("does not expose wholesale, internal-role, source-url, SKU, or pairing claims", () => {
    const serialized = JSON.stringify(v3PublicSupplements);
    expect(serialized).not.toMatch(
      /source wholesale|internal role|official source url|paired research products|source protocol|northline/i,
    );
    expect(serialized).not.toMatch(/"sku":"|"price":\d/);
  });

  it("supports bounded public search without changing candidate truth", () => {
    expect(searchV3Supplements()).toHaveLength(62);
    expect(searchV3Supplements("momentous").length).toBeGreaterThan(0);
    expect(searchV3Supplements("magnesium").length).toBeGreaterThan(0);
    expect(searchV3Supplements("not-a-real-supplement")).toEqual([]);
  });
});
