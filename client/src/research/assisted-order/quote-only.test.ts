import { describe, expect, it } from "vitest";
import { catalogPriceLabel, money } from "./wizard-state";
import { requestIntentPriceNote } from "./RequestIntentForm";

// Quote-only wording on the order-request pages. A catalog item with no
// price reads "Request a quote", and so does one whose price an older server
// supplied: the quote form never formats an amount. The status pages keep
// their wording. Synthetic values only.

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
  it("never formats an amount, even when an older server or a stale fixture supplies one", () => {
    const note = requestIntentPriceNote({ unitPriceCents: 4_900, clinicalReviewRequired: false });
    expect(note).toBe("Request a quote");
    expect(note).not.toContain(money(4_900));
    expect(requestIntentPriceNote({ unitPriceCents: 4_900, clinicalReviewRequired: true })).toBe("Final price follows applicable review.");
  });
});
