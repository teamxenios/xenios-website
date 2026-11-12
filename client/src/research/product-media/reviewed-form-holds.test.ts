import { describe, expect, it } from "vitest";
import media from "./product-media-format.generated.json";
import catalog from "../../../../server/research/master-offerings/data/member-safe-master-offerings.generated.json";
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
  it("leaves no real listing card saying bottle", () => {
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
