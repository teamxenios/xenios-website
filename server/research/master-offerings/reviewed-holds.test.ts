import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeSpecification,
  readReviewedCommerceHolds,
  reviewedHeldSpecifications,
} from "./reviewed-holds";
import { isFormulationHeld } from "@shared/research/master-offerings/formulation-hold";
import { isDirectPurchaseForbidden } from "@shared/research/master-offerings/pathway-authority";
import { resolveMasterOfferingAction } from "./action";
import { offering, variant } from "./test-fixtures";
import { cartSelection } from "./testing/cart-selection.test-support";

// The specification the RECONCILED catalog gives the held product. Note what is
// absent: the workbook's "(split pending)" marker. A customer must not read our
// internal uncertainty in a product name, so the canonical rewrite removes it —
// and with it, any hold that depended on matching that text.
const CANONICAL_HELD_SPEC = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total";
const WORKBOOK_HELD_SPEC = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)";

describe("the reviewed commerce holds", () => {
  it("reads the founder's record and finds the one held row", () => {
    const holds = readReviewedCommerceHolds();
    expect(holds.map((hold) => hold.sourceRow)).toEqual(["GRP-0422"]);
    expect(holds[0].specification).toBe(CANONICAL_HELD_SPEC);
  });

  it("holds the CANONICAL specification, which carries no marker to match", () => {
    // The regression this file exists for. The marker rule alone answers false
    // here, so the hold would have evaporated at exactly the moment the
    // reconciled product entered the catalog.
    expect(isFormulationHeld(CANONICAL_HELD_SPEC)).toBe(false);
    expect(isFormulationHeld(CANONICAL_HELD_SPEC, reviewedHeldSpecifications())).toBe(true);
  });

  it("still holds the raw workbook row, which has not been reconciled yet", () => {
    expect(isFormulationHeld(WORKBOOK_HELD_SPEC)).toBe(true);
  });

  it("compares specifications insensitively to spacing and case", () => {
    const holds = reviewedHeldSpecifications();
    expect(isFormulationHeld("  cjc-1295  with dac + IPAMORELIN 5 mg TOTAL ", holds)).toBe(true);
    expect(normalizeSpecification(" a  b ")).toBe("A B");
  });

  it("does not broaden the hold to the standalone WITH DAC products", () => {
    // Founder decision 2026-08-21: WITH DAC 2 mg and 5 mg are confirmed RUO,
    // priced, and DIRECT. Only the combination is held. Broadening the hold to
    // anything reading "WITH DAC" would take three sellable rows off the shelf.
    const holds = reviewedHeldSpecifications();
    for (const spec of [
      "CJC-1295 WITH DAC 2 mg",
      "CJC-1295 WITH DAC 5 mg",
      "CJC-1295 - With DAC (10mg)",
      "CJC-1295 (No DAC) 5 mg + IPAMORELIN 5 mg",
    ]) {
      expect(isFormulationHeld(spec, holds)).toBe(false);
    }
  });

  it("refuses direct purchase for the held row through the pathway authority", () => {
    expect(
      isDirectPurchaseForbidden({
        family: "research_peptides_materials",
        displayState: "request_access",
        variantDisplayState: "request_access",
        specification: CANONICAL_HELD_SPEC,
        reviewedHolds: reviewedHeldSpecifications(),
      }),
    ).toBe(true);
  });

  it("never reaches Add to Cart, even with a perfect binding and selection", async () => {
    const product = offering({
      family: "research_peptides_materials",
      displayState: "available_now",
      variants: [variant({ displayState: "available_now", label: CANONICAL_HELD_SPEC })],
    });
    const presentation = product.variants[0];
    const selection = await cartSelection();

    const action = resolveMasterOfferingAction(
      product,
      presentation,
      {
        binding: {
          offeringVariantId: presentation.id,
          productId: selection.productId,
          variantId: selection.variantId,
        },
        selection,
      },
      undefined,
      { reviewedFormulationHolds: reviewedHeldSpecifications() },
    );
    expect(action.kind).not.toBe("add_to_cart");
  });

  it("sells the same row the moment the founder removes the entry", async () => {
    // The record says releasing it needs no code change. This proves that: an
    // empty hold set and the row is purchasable again.
    const product = offering({
      family: "research_peptides_materials",
      displayState: "available_now",
      variants: [variant({ displayState: "available_now", label: CANONICAL_HELD_SPEC })],
    });
    const presentation = product.variants[0];
    const selection = await cartSelection();

    const action = resolveMasterOfferingAction(
      product,
      presentation,
      {
        binding: {
          offeringVariantId: presentation.id,
          productId: selection.productId,
          variantId: selection.variantId,
        },
        selection,
      },
      undefined,
      { reviewedFormulationHolds: new Set<string>() },
    );
    expect(action.kind).toBe("add_to_cart");
  });
});

describe("fail closed", () => {
  it("refuses to answer 'nothing is held' when the record cannot be read", () => {
    // An unreadable reconciliation is an UNKNOWN number of holds. Answering an
    // empty set would put a formulation-unresolved product on sale.
    expect(() => readReviewedCommerceHolds("/nonexistent-xenios-root")).toThrow();
  });
});

describe("the hold is on by default", () => {
  it("is carried by the lane composition, not left for a caller to remember", async () => {
    // The failure this pins: a hold that must be opted into is a hold nobody
    // has. DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES carries none, so if the
    // composition forgets to supply the reviewed set, every held product is
    // purchasable and every unit test in this repo still passes.
    const source = readFileSync(
      new URL("./composition.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("reviewedFormulationHolds: reviewedHeldSpecifications(");
  });

  it("leaves the held row purchasable if the reviewed set is not supplied", async () => {
    // Documents the exact regression the composition line prevents, so anyone
    // who deletes that line sees this test explain what they just switched off.
    const product = offering({
      family: "research_peptides_materials",
      displayState: "available_now",
      variants: [variant({ displayState: "available_now", label: CANONICAL_HELD_SPEC })],
    });
    const presentation = product.variants[0];
    const selection = await cartSelection();
    const commerce = {
      binding: {
        offeringVariantId: presentation.id,
        productId: selection.productId,
        variantId: selection.variantId,
      },
      selection,
    };

    // No reviewed set: sellable. This is what "the hold was consulted by
    // nobody" looked like in the running system.
    expect(resolveMasterOfferingAction(product, presentation, commerce).kind).toBe("add_to_cart");

    // With it: refused.
    expect(
      resolveMasterOfferingAction(product, presentation, commerce, undefined, {
        reviewedFormulationHolds: reviewedHeldSpecifications(),
      }).kind,
    ).not.toBe("add_to_cart");
  });
});
