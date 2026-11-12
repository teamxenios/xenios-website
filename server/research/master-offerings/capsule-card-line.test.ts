import { describe, expect, it } from "vitest";
import catalog from "./data/member-safe-master-offerings.generated.json";
import { researchListingSubcategory } from "../../../client/src/research/product-media/reviewed-form-holds";

// The card's form line, over the real catalog. Kept on the server side: client
// files may not import the master-offering data.
describe("the capsule card line over the real catalog", () => {
  it("leaves no listing card saying bottle", () => {
    const shown = catalog.products
      .filter((product) => product.subcategory === "Capsule / Bottle")
      .map((product) => [product.variants[0].id, researchListingSubcategory(product)] as const);
    expect(shown).toHaveLength(16);
    // Ten are form-held and show no form; the other six read Capsules.
    expect(shown.filter(([, text]) => text === null)).toHaveLength(10);
    expect(shown.filter(([, text]) => text === "Capsules").map(([id]) => id).sort()).toEqual([
      "mov_038386172c35c2ad8cca", "mov_0a8df59fa70328b1c1ca", "mov_235641a298fed1c2637e",
      "mov_395e7047e013e2074f6a", "mov_862b99ce1c9f144086dd", "mov_aef099fb39b3fa062f45",
    ]);
    for (const product of catalog.products) {
      expect(researchListingSubcategory(product) ?? "", product.id).not.toMatch(/bottle/i);
    }
  });
});
