import { describe, expect, it } from "vitest";
import { directPurchaseRefusal, requiresProviderPathway } from "./pathway-authority";

const heldId = "mov_f61758881da2b7bfa539";
const subject = {
  family: "research_peptides_materials",
  displayState: "request_access",
  variantDisplayState: "request_access",
  specification: "Customer-facing label without internal wording",
  offeringVariantId: heldId,
  reviewedHoldVariantIds: new Set([heldId]),
} as const;

describe("structured reviewed formulation hold", () => {
  it("refuses the exact held identity independently of its current label", () => {
    expect(directPurchaseRefusal(subject)).toBe("formulation_hold");
    expect(directPurchaseRefusal({ ...subject, specification: null })).toBe("formulation_hold");
    expect(requiresProviderPathway(subject)).toBe(false);
  });

  it("does not place another identity on hold merely for sharing display text", () => {
    expect(directPurchaseRefusal({ ...subject, offeringVariantId: "mov_other" })).toBeNull();
  });

  it("fails closed when structured authority or selected identity is unresolved", () => {
    expect(directPurchaseRefusal({ ...subject, reviewedHoldVariantIds: null })).toBe("formulation_hold");
    expect(directPurchaseRefusal({ ...subject, offeringVariantId: undefined })).toBe("formulation_hold");
  });

  it("preserves Care, classification and declared-source refusals", () => {
    expect(directPurchaseRefusal({ ...subject, family: "clinical_formulations_503a" }))
      .toBe("provider_pathway_family");
    expect(directPurchaseRefusal({
      ...subject, offeringVariantId: "mov_other", variantDisplayState: "approval_required",
    })).toBe("classification_pending");
    expect(directPurchaseRefusal({
      ...subject, offeringVariantId: "mov_other", specification: "Combination (split pending)",
    })).toBe("formulation_hold");
  });
});
