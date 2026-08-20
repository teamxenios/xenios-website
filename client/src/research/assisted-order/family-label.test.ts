import { describe, expect, it } from "vitest";
import {
  MASTER_OFFERING_FAMILIES,
  MASTER_OFFERING_FAMILY_LABELS,
} from "@shared/research/master-offerings/contract";
import { assistedOrderFamilyLabel } from "./family-label";

describe("assistedOrderFamilyLabel", () => {
  it("uses the canonical label for every family in the closed vocabulary", () => {
    // Sweeping the whole vocabulary, not a sample: this is what keeps the
    // order form, the member catalog and the public storefront from drifting
    // into three different words for one family.
    for (const family of MASTER_OFFERING_FAMILIES) {
      expect(assistedOrderFamilyLabel(family)).toBe(
        MASTER_OFFERING_FAMILY_LABELS[family],
      );
    }
  });

  it("never shows a customer a raw SCREAMING_SNAKE identifier", () => {
    // The reported defect: the card eyebrow is text-transform: uppercase, so
    // the raw slug reached the customer as CLINICAL_FORMULATIONS_503A while
    // they were choosing what to order.
    for (const family of [
      ...MASTER_OFFERING_FAMILIES,
      "clinical_formulations_503a",
      "some_future_family",
    ]) {
      const label = assistedOrderFamilyLabel(family);
      expect(label).not.toContain("_");
      expect(label).not.toBe(label.toUpperCase());
    }
  });

  it("de-slugs an unknown family instead of inventing a marketing name", () => {
    expect(assistedOrderFamilyLabel("some_future_family")).toBe(
      "Some Future Family",
    );
  });

  it("keeps a designation token upper-case rather than title-casing it", () => {
    // "503a" is a real designation; "503a" title-cased reads as a typo.
    expect(assistedOrderFamilyLabel("compounding_503a")).toBe(
      "Compounding 503A",
    );
  });

  it("answers something renderable for blank or whitespace input", () => {
    for (const blank of ["", "   "]) {
      expect(assistedOrderFamilyLabel(blank)).toBe("Other");
    }
  });
});
