import { describe, expect, it } from "vitest";
import { researchListingSubcategory } from "./reviewed-form-holds";

// Two rows that are in the hold map today, with their own offering ids.
const heldVial = { id: "mo_afb0add32da0de7426f5", variants: [{ id: "mov_9262033fe69a14a50f1c" }] };

describe("the catalog subcategory on a listing card", () => {
  it("is not shown for a held row, whatever form it names", () => {
    for (const subcategory of ["Lyophilized Vial", "Capsule / Bottle", "Liquid", "Solution"]) {
      expect(researchListingSubcategory({ ...heldVial, subcategory })).toBeNull();
    }
  });
  it("is shown for a row that is not held", () => {
    expect(researchListingSubcategory({
      id: "mo_not_held", subcategory: "Capsule / Bottle", variants: [{ id: "mov_not_held" }],
    })).toBe("Capsule / Bottle");
  });
  it("needs the held variant to belong to the held offering", () => {
    expect(researchListingSubcategory({
      id: "mo_another_offering", subcategory: "Lyophilized Vial", variants: heldVial.variants,
    })).toBe("Lyophilized Vial");
  });
});
