import { describe, expect, it } from "vitest";

import { upsertBuyerDraftLine } from "./useBuyerDraft";

const line = {
  offeringId: "p1",
  variantId: "v1",
  sku: "SKU-1",
  label: "Product 1",
  quantity: 1,
};

describe("buyer draft", () => {
  it("keeps one line per exact variant and supports 1-50", () => {
    const first = upsertBuyerDraftLine([], line);
    const replaced = upsertBuyerDraftLine(first, { ...line, quantity: 50 });
    expect(replaced).toEqual([{ ...line, quantity: 50 }]);
  });

  it("does not merge identical variant ids belonging to different offerings", () => {
    const first = upsertBuyerDraftLine([], line);
    const second = upsertBuyerDraftLine(first, { ...line, offeringId: "p2", sku: "SKU-2" });
    expect(second).toHaveLength(2);
  });

  it("clamps browser-only convenience state without changing server authority", () => {
    expect(upsertBuyerDraftLine([], { ...line, quantity: 51 })[0]?.quantity).toBe(50);
    expect(upsertBuyerDraftLine([], { ...line, quantity: 0 })[0]?.quantity).toBe(1);
  });
});
