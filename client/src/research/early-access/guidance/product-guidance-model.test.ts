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
  it("counts exact variants once", () => {
    const item = { ...flags, productId: "p", variantId: "v" };
    expect(summarizeSelection([item, item]).distinctVariants).toBe(1);
  });
});
