import { describe, expect, it } from "vitest";
import { REQUEST_REPLY_EXPECTATION, REQUEST_REPLY_WINDOW_MS, requestReplyDueAt } from "../../../../shared/research/assisted-order/request-reply-expectation";
import {
  EARLY_ACCESS_BRAND, EARLY_ACCESS_CATEGORY_EXPLANATION, EARLY_ACCESS_REQUEST_BOUNDARY, EARLY_ACCESS_FAQS,
  EARLY_ACCESS_REQUEST_CTA, EARLY_ACCESS_REQUEST_STEPS, EARLY_ACCESS_RECEIPT_STEPS,
  finalRequestActionLabel, requestReceiptHeading,
} from "./request-experience-copy";

describe("request-specific labels and explanatory copy", () => {
  it("names the mixed-catalog brand without changing route identifiers", () => {
    expect(EARLY_ACCESS_BRAND.name).toBe("Xenios Care + Research");
    expect(EARLY_ACCESS_BRAND.wordmarkSuffix).toBe("care + research");
  });
  it("uses Submit Request only for the final new-request action", () => {
    expect(finalRequestActionLabel(false)).toBe("Submit Request");
    // The journey step names the same action the button shows.
    expect(EARLY_ACCESS_REQUEST_STEPS[1].description).toContain("then select Submit Request.");
    expect(EARLY_ACCESS_REQUEST_CTA.finalReview).toBe("Continue to request a quote");
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

describe("the original persisted receipt's 24 elapsed hours", () => {
  it("explains the same original receipt window conditionally in the after-submit FAQ", () => {
    const answer = EARLY_ACCESS_FAQS.find((entry) => entry.question === "What happens after I submit a request?")?.answer;
    expect(answer).toContain("Once your request is saved");
    expect(answer).toContain("reply within 24 hours of its original received time");
    expect(answer).not.toContain("Request received.");
    expect(answer).toContain("not an approved order, prescription or shipment");
  });
  it("uses the exact founder-approved team reply promise", () => {
    expect(REQUEST_REPLY_EXPECTATION).toBe("Request received. Our team will reply within 24 hours.");
    expect(REQUEST_REPLY_WINDOW_MS).toBe(86_400_000);
  });
  it.each([
    ["2026-11-27T17:45:00-06:00", "2026-11-28T23:45:00.000Z"],
    ["2026-03-08T00:30:00-06:00", "2026-03-09T06:30:00.000Z"],
    ["2026-11-01T00:30:00-05:00", "2026-11-02T05:30:00.000Z"],
    ["2026-12-31T23:59:59Z", "2027-01-01T23:59:59.000Z"],
  ])("preserves elapsed time from %s through weekends, midnight and daylight saving", (original, due) => {
    expect(requestReplyDueAt(original)).toBe(due);
    expect(Date.parse(due) - Date.parse(original)).toBe(86_400_000);
    expect(requestReplyDueAt(original)).toBe(due);
  });
  it.each(["", "invalid", "+275760-09-13T00:00:00.000Z"])("does not substitute the current clock for invalid/out-of-range %j", (original) => {
    expect(requestReplyDueAt(original)).toBeNull();
  });
});
