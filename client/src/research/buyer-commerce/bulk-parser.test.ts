import { describe, expect, it } from "vitest";

import { parseBuyerBulkOrder } from "./bulk-parser";

describe("buyer bulk parser", () => {
  it("accepts singles, small orders, and quantity 50", () => {
    expect(parseBuyerBulkOrder("SKU-1\nSKU-2,4\nSKU-3\t50")).toEqual({
      rows: [
        { sku: "SKU-1", quantity: 1 },
        { sku: "SKU-2", quantity: 4 },
        { sku: "SKU-3", quantity: 50 },
      ],
      errors: [],
    });
  });

  it("merges repeated exact SKUs and refuses aggregate quantity above 50", () => {
    expect(parseBuyerBulkOrder("SKU-1,20\nsku-1,30")).toEqual({
      rows: [{ sku: "SKU-1", quantity: 50 }],
      errors: [],
    });
    const refused = parseBuyerBulkOrder("SKU-1,20\nSKU-1,31");
    expect(refused.rows).toEqual([{ sku: "SKU-1", quantity: 20 }]);
    expect(refused.errors[0]).toContain("totals more than 50");
  });

  it("refuses decimals, zero, 51, and malformed rows", () => {
    const result = parseBuyerBulkOrder("A,0\nB,1.5\nC,51\nD,2,extra");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(4);
  });
});
