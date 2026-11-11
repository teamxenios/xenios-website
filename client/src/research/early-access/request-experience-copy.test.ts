import { describe, expect, it } from "vitest";
import {
  EARLY_ACCESS_BRAND, EARLY_ACCESS_CATEGORY_EXPLANATION, EARLY_ACCESS_REQUEST_BOUNDARY,
  EARLY_ACCESS_REQUEST_CTA, EARLY_ACCESS_REQUEST_STEPS, EARLY_ACCESS_RECEIPT_STEPS,
  finalRequestActionLabel, requestReceiptHeading,
} from "./request-experience-copy";

describe("request-specific labels and explanatory copy", () => {
  it("names the mixed-catalog brand without changing route identifiers", () => {
    expect(EARLY_ACCESS_BRAND.name).toBe("Xenios Care + Research");
    expect(EARLY_ACCESS_BRAND.wordmarkSuffix).toBe("care + research");
  });
  it("uses Request a quote only for the final new-request action", () => {
    expect(finalRequestActionLabel(false)).toBe("Request a quote");
    expect(EARLY_ACCESS_REQUEST_CTA.finalReview).toBe("Continue to submit request");
    expect(EARLY_ACCESS_REQUEST_CTA.details).toBe("Continue to details");
  });
  it("keeps same-attempt retry distinct", () => {
    expect(finalRequestActionLabel(true)).toBe("Retry same request");
    expect(finalRequestActionLabel(true, true)).toBe("Submitting request…");
    expect(finalRequestActionLabel(false, true)).toBe("Submitting request…");
  });
  it("does not imply a reopened receipt sent another request", () => {
    expect(requestReceiptHeading(false)).toBe("Request submitted");
    expect(requestReceiptHeading(true)).toBe("Your submitted request");
  });
  it("keeps clinical, nonclinical and research-only boundaries explicit", () => {
    expect(EARLY_ACCESS_CATEGORY_EXPLANATION).toContain("Nonclinical");
    expect(EARLY_ACCESS_CATEGORY_EXPLANATION).toContain("not human or veterinary use");
    expect(EARLY_ACCESS_REQUEST_STEPS[3].description).toMatch(/^For clinical products,/);
  });
  it("explains the founder's five ordered stages with unique keys", () => {
    expect(EARLY_ACCESS_REQUEST_STEPS.map((step) => step.id))
      .toEqual(["choose", "submit", "team", "clinical", "decision"]);
    expect(new Set(EARLY_ACCESS_REQUEST_STEPS.map((step) => step.id)).size).toBe(5);
  });
  it("makes payment conditional on approval and availability", () => {
    expect(EARLY_ACCESS_REQUEST_STEPS[4].description).toContain("For approved, available items");
    expect(EARLY_ACCESS_REQUEST_STEPS[4].description).toContain("not approved do not proceed to payment");
    expect(EARLY_ACCESS_RECEIPT_STEPS[3].description).toContain("has not collected payment");
  });
  it("preserves no-payment, no-prescription and no-shipping-confirmation limits", () => {
    for (const phrase of ["does not collect payment", "approve treatment", "create a prescription", "confirm shipping"]) {
      expect(EARLY_ACCESS_REQUEST_BOUNDARY).toContain(phrase);
    }
  });
});
