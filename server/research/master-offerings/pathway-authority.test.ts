import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NON_MERCHANDISE_FAMILIES,
  PROVIDER_PATHWAY_FAMILIES,
  directPurchaseRefusal,
  isDirectPurchaseForbidden,
  requiresProviderPathway,
} from "@shared/research/master-offerings/pathway-authority";
import {
  MASTER_OFFERING_DISPLAY_STATES,
  type MasterOfferingDisplayState,
  type MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import { resolveMasterOfferingAction } from "./action";
import { authorityFor } from "../assisted-order/production-catalog";
import { cartSelection, offering, variant } from "./test-fixtures";

// ---------------------------------------------------------------------------
// The pathway authority is the single answer to "may this row ever be a direct
// purchase". These tests pin three things: that it refuses on family as well as
// display state, that wiring it into the action resolver moved nothing on the
// catalog as it ships today, and that the assisted-order lane cannot drift away
// from it again.
// ---------------------------------------------------------------------------

const subject = (
  family: MasterOfferingFamily,
  displayState: MasterOfferingDisplayState = "available_now",
  variantDisplayState: MasterOfferingDisplayState = displayState,
) => ({ family, displayState, variantDisplayState });

describe("direct purchase refusal", () => {
  it("names the reason rather than answering a bare boolean", () => {
    expect(directPurchaseRefusal(subject("clinical_formulations_503a"))).toBe(
      "provider_pathway_family",
    );
    expect(directPurchaseRefusal(subject("shipping_and_fulfillment"))).toBe(
      "non_merchandise_family",
    );
    expect(directPurchaseRefusal(subject("research_vials", "care_pathway"))).toBe(
      "care_pathway_display_state",
    );
    expect(directPurchaseRefusal(subject("research_vials"))).toBeNull();
  });

  it("refuses a provider family in every display state it could be published under", () => {
    for (const family of PROVIDER_PATHWAY_FAMILIES) {
      for (const state of MASTER_OFFERING_DISPLAY_STATES) {
        expect(isDirectPurchaseForbidden(subject(family, state))).toBe(true);
      }
    }
  });

  it("refuses when only the variant carries the care pathway state", () => {
    expect(isDirectPurchaseForbidden(subject("research_vials", "available_now", "care_pathway"))).toBe(
      true,
    );
  });

  it("does not refuse an ordinary research row in a purchasable state", () => {
    for (const state of ["available_now", "request_access"] as const) {
      expect(isDirectPurchaseForbidden(subject("research_peptides_materials", state))).toBe(false);
    }
  });

  it("routes provider families to the provider pathway but never a shipping line", () => {
    expect(requiresProviderPathway(subject("clinical_formulations_503a"))).toBe(true);
    expect(requiresProviderPathway(subject("research_vials", "care_pathway"))).toBe(true);
    // Refused, but not a care referral: a shipping charge is not a treatment.
    expect(isDirectPurchaseForbidden(subject("shipping_and_fulfillment"))).toBe(true);
    expect(requiresProviderPathway(subject("shipping_and_fulfillment"))).toBe(false);
  });

  it("keeps the two family sets disjoint, so one row has one reason", () => {
    for (const family of PROVIDER_PATHWAY_FAMILIES) {
      expect(NON_MERCHANDISE_FAMILIES.has(family)).toBe(false);
    }
  });
});

describe("the action resolver consults the authority", () => {
  const bindingFor = (presentation: { id: string }, selection = cartSelection()) => ({
    binding: {
      offeringVariantId: presentation.id,
      productId: selection.productId,
      variantId: selection.variantId,
    },
    selection,
  });

  it("refuses Add to Cart for a provider family even when its commerce is perfect", () => {
    // The exact hazard: a compounded clinical formulation published as
    // available_now rather than care_pathway. Before the authority existed this
    // returned Add to Cart, because the resolver only ever tested display state.
    const product = offering({
      family: "clinical_formulations_503a",
      displayState: "available_now",
      variants: [variant({ displayState: "available_now" })],
    });
    const presentation = product.variants[0];

    const action = resolveMasterOfferingAction(product, presentation, bindingFor(presentation));
    expect(action.kind).toBe("explore_care");
  });

  it("refuses the manual Early Access purchase side door for the same row", () => {
    const product = offering({
      family: "clinical_formulations_503a",
      displayState: "available_now",
      variants: [variant({ displayState: "available_now" })],
    });
    const presentation = product.variants[0];

    const action = resolveMasterOfferingAction(
      product,
      presentation,
      { binding: null, selection: null },
      undefined,
      { manualEarlyAccessPurchase: true },
    );
    expect(action.kind).toBe("explore_care");
  });

  it("refuses a shipping line as a purchase without calling it a care referral", () => {
    const product = offering({
      family: "shipping_and_fulfillment",
      displayState: "available_now",
      variants: [variant({ displayState: "available_now" })],
    });
    const presentation = product.variants[0];

    expect(
      resolveMasterOfferingAction(product, presentation, bindingFor(presentation)).kind,
    ).not.toBe("add_to_cart");
  });

  it("still emits Add to Cart for an ordinary research row", () => {
    const selection = cartSelection();
    const product = offering({ family: "research_peptides_materials" });
    const presentation = product.variants[0];

    expect(
      resolveMasterOfferingAction(product, presentation, bindingFor(presentation, selection)).kind,
    ).toBe("add_to_cart");
  });
});

// ---------------------------------------------------------------------------
// The real catalog. These two tests are the point of the lane: they prove the
// change is inert on today's data and that the two lanes now answer alike.
// ---------------------------------------------------------------------------

interface DatasetVariant {
  family: MasterOfferingFamily;
  displayState: MasterOfferingDisplayState;
  variantDisplayState: MasterOfferingDisplayState;
  productName: string;
  variantLabel: string;
}

function realCatalogVariants(): DatasetVariant[] {
  const file = path.join(__dirname, "data", "member-safe-master-offerings.generated.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    products: Array<{
      displayName: string;
      family: MasterOfferingFamily;
      displayState: MasterOfferingDisplayState;
      variants: Array<{ label: string; displayState: MasterOfferingDisplayState }>;
    }>;
  };
  const rows: DatasetVariant[] = [];
  for (const product of parsed.products) {
    for (const presentation of product.variants) {
      rows.push({
        family: product.family,
        displayState: product.displayState,
        variantDisplayState: presentation.displayState,
        productName: product.displayName,
        variantLabel: presentation.label,
      });
    }
  }
  return rows;
}

describe("the shipped catalog", () => {
  it("is refused for exactly the rows the display-state rule already refused", () => {
    const rows = realCatalogVariants();
    expect(rows).toHaveLength(420);

    // The rule as it stood before the authority existed.
    const previouslyForbidden = (row: DatasetVariant) =>
      row.displayState === "care_pathway" || row.variantDisplayState === "care_pathway";

    const moved = rows.filter((row) => isDirectPurchaseForbidden(row) !== previouslyForbidden(row));
    // Zero. Every 503a row already carries care_pathway, so widening the rule to
    // families changes no rendered action today — it only removes the catalog's
    // ability to drift out of the rule tomorrow.
    expect(moved).toEqual([]);
  });

  it("refuses every 503a row on family, so a display-state edit cannot release one", () => {
    const rows = realCatalogVariants().filter(
      (row) => row.family === "clinical_formulations_503a",
    );
    expect(rows).toHaveLength(242);

    for (const row of rows) {
      // Re-publish the row as plainly available and it stays refused.
      expect(
        isDirectPurchaseForbidden({
          family: row.family,
          displayState: "available_now",
          variantDisplayState: "available_now",
        }),
      ).toBe(true);
    }
  });
});

describe("cross-lane agreement", () => {
  // The assisted-order lane owns its own file and this lane may not edit it.
  // This test reads its exported derivation and asserts the two lanes answer
  // alike, so if either rule is widened without the other, the divergence
  // surfaces here as a failure rather than as a customer buying a compounded
  // formulation.
  const assistedOrderRequiresProvider = (
    family: MasterOfferingFamily,
    displayState: MasterOfferingDisplayState,
  ): boolean => {
    const product = offering({
      family,
      displayState,
      variants: [variant({ displayState })],
    });
    const authority = authorityFor(
      product,
      product.variants[0],
      undefined,
      { productId: "pc_product_1", variantId: "pc_variant_1" },
      "catalog-v1",
    );
    return authority.providerWorkflowRequired;
  };

  it("agrees with the assisted-order lane for every family and display state", () => {
    const families: MasterOfferingFamily[] = [
      "clinical_formulations_503a",
      "research_peptides_materials",
      "research_capsules",
      "research_supplies",
      "supplements",
      "topicals_regenerative",
      "research_vials",
    ];

    for (const family of families) {
      for (const state of MASTER_OFFERING_DISPLAY_STATES) {
        expect({
          family,
          state,
          provider: requiresProviderPathway(subject(family, state)),
        }).toEqual({
          family,
          state,
          provider: assistedOrderRequiresProvider(family, state),
        });
      }
    }
  });

  it("is refused by the assisted-order lane too, for every provider family that has published variants", () => {
    const published = new Set(realCatalogVariants().map((row) => row.family));
    const publishedProviderFamilies = [...PROVIDER_PATHWAY_FAMILIES].filter((family) =>
      published.has(family),
    );
    expect(publishedProviderFamilies).toEqual(["clinical_formulations_503a"]);

    for (const family of publishedProviderFamilies) {
      for (const state of MASTER_OFFERING_DISPLAY_STATES) {
        expect(assistedOrderRequiresProvider(family, state)).toBe(true);
      }
    }
  });

  it("records the two provider-domain families this lane refuses and the assisted-order lane does not", () => {
    // A real, currently harmless gap, kept visible rather than asserted away.
    //
    // This lane refuses `clinician_guided_care` and `provider_network` on
    // family; the assisted-order lane names only `clinical_formulations_503a`,
    // so it would call a priced, bound row in either family direct-eligible.
    // That file belongs to another lane and this one may not edit it, so the
    // gap is handed over rather than patched from here.
    //
    // It is inert only because neither family has a published variant. The
    // second half of this test is the tripwire: publish one, and this fails
    // before the disagreement can reach a customer.
    const diverging = [...PROVIDER_PATHWAY_FAMILIES].filter(
      (family) => !assistedOrderRequiresProvider(family, "available_now"),
    );
    expect(diverging.sort()).toEqual(["clinician_guided_care", "provider_network"]);

    const published = new Set(realCatalogVariants().map((row) => row.family));
    for (const family of diverging) {
      expect(published.has(family)).toBe(false);
    }
  });
});
