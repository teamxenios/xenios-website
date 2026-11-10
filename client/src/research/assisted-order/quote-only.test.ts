import { describe, expect, it } from "vitest";
import { catalogPriceLabel, money } from "./wizard-state";
import { requestIntentPriceNote } from "./RequestIntentForm";

// Quote-only wording on the order-request pages. A catalog item with no
// price reads "Request a quote"; a priced item and the status pages keep
// today's wording. Synthetic values only.

describe("catalogPriceLabel", () => {
  it("reads Request a quote for an item with no price", () => {
    expect(catalogPriceLabel(null)).toBe("Request a quote");
  });
  it("formats a real price exactly as money() does", () => {
    expect(catalogPriceLabel(4_900)).toBe(money(4_900));
  });
  it("leaves money(null) as it was for status pages", () => {
    expect(money(null)).toBe("Price on request");
  });
});

describe("requestIntentPriceNote", () => {
  it("reads Request a quote for a priceless research item", () => {
    expect(requestIntentPriceNote({ unitPriceCents: null, clinicalReviewRequired: false })).toBe("Request a quote");
  });
  it("keeps the clinical wording", () => {
    expect(requestIntentPriceNote({ unitPriceCents: null, clinicalReviewRequired: true })).toBe("Final price follows applicable review.");
  });
  it("keeps today's wording for a priced item", () => {
    expect(requestIntentPriceNote({ unitPriceCents: 4_900, clinicalReviewRequired: false }))
      .toBe(`${money(4_900)} (catalog display, not a final quote)`);
  });
});
