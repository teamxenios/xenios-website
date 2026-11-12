import { describe, expect, it } from "vitest";
import media from "./product-media-format.generated.json";
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
      id: "mo_not_held", subcategory: "Lyophilized Vial", variants: [{ id: "mov_not_held" }],
    })).toBe("Lyophilized Vial");
  });
  it("never names a bottle: a row that is not held reads Capsules", () => {
    expect(researchListingSubcategory({
      id: "mo_not_held", subcategory: "Capsule / Bottle", variants: [{ id: "mov_not_held" }],
    })).toBe("Capsules");
  });
  it("needs the held variant to belong to the held offering", () => {
    expect(researchListingSubcategory({
      id: "mo_another_offering", subcategory: "Lyophilized Vial", variants: heldVial.variants,
    })).toBe("Lyophilized Vial");
  });
});

describe("the real format map", () => {
  // The product image tests reach the vial symbol through synthetic rows only. While the reviewed
  // form holds stand, every real vial-format variant is held and falls back to the neutral symbol.
  // That is today's state and not a rule, so it is not asserted here; this only checks that the
  // real map still has vial rows for the fallback to matter to.
  it("still lists vial-format variants", () => {
    const vials = Object.values(media.formatByVariantId).filter((format) => format === "vial");
    expect(vials.length).toBeGreaterThan(0);
  });
});
