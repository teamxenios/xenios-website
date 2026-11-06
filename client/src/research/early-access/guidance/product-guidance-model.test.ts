import { describe, expect, it } from "vitest";
import { productGuidance, RESEARCH_LIMIT, summarizeSelection } from "./product-guidance-model";
const flags = { clinicalReviewRequired: false, researchUseOnly: false };
describe("display category resolver", () => {
  it.each([
    [{ ...flags, family: "supplements" }, "supplement"],
    [{ ...flags, researchUseOnly: true }, "research"],
    [{ ...flags, clinicalReviewRequired: true }, "clinical"],
    [{ ...flags, researchUseOnly: true, clinicalReviewRequired: true }, "unconfirmed"],
    [{ ...flags, family: "clinical_formulations_503a" }, "unconfirmed"],
    [{}, "unconfirmed"],
    [{ ...flags, intentExclusion: "non_merchandise" }, "service"],
  ] as const)("presents %o as %s", (input, expected) => expect(productGuidance(input).category).toBe(expected));
  it("keeps the strict research boundary for conflicting flags", () => {
    expect(productGuidance({ ...flags, researchUseOnly: true, clinicalReviewRequired: true }).limits).toContain(RESEARCH_LIMIT);
  });
  it.each(["sourceDisplayState", "sourceVariantDisplayState"] as const)(
    "shows a pending research capsule when %s requires approval",
    (field) => {
      const guidance = productGuidance({
        ...flags,
        family: "research_capsules",
        researchUseOnly: true,
        sourceRefusal: "family_outside_launch_scope",
        [field]: "approval_required",
      });
      expect(guidance.category).toBe("unconfirmed");
      expect(guidance.limits).toContain(RESEARCH_LIMIT);
    },
  );
  it.each([undefined, false])("keeps the lab limit for research supplies with flag %s", (researchUseOnly) => {
    const guidance = productGuidance({ ...flags, family: "research_supplies", researchUseOnly });
    expect(guidance.category).toBe("unconfirmed");
    expect(guidance.limits).toContain(RESEARCH_LIMIT);
  });
  it("keeps shipping and included supplies outside the request with the review warning", () => {
    const guidance = productGuidance({ ...flags, family: "shipping_and_fulfillment", intentExclusion: "non_merchandise" });
    expect(guidance.label).toBe("Listing information");
    expect(guidance.explanation).toContain("shipping or an included item and cannot be added");
    expect(guidance.limits).toContain("Internal review required.");
  });
  it("counts exact variants once", () => {
    const item = { ...flags, productId: "p", variantId: "v" };
    expect(summarizeSelection([item, item]).distinctVariants).toBe(1);
  });
});
