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

  it("refuses a row whose own specification declares its formulation unresolved", () => {
    // The CJC-1295 WITH DAC row: peptides family, RUO, priced, bound, and a
    // perfectly valid Product Control selection. Every existing test passes for
    // it. It must still never reach a cart, because we cannot say what is in
    // the vial.
    const product = offering({
      family: "research_peptides_materials",
      displayState: "request_access",
      variants: [
        variant({
          displayState: "request_access",
          label: "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
        }),
      ],
    });
    const presentation = product.variants[0];

    const action = resolveMasterOfferingAction(product, presentation, bindingFor(presentation));
    expect(action.kind).not.toBe("add_to_cart");
    // Held, but not a care referral: the product is not provider-required, it
    // is undescribed. Telling a customer to see a provider would be a lie.
    expect(action.kind).not.toBe("explore_care");
  });

  it("refuses the manual purchase side door for a formulation-held row too", () => {
    const product = offering({
      family: "research_peptides_materials",
      displayState: "available_now",
      variants: [
        variant({
          displayState: "available_now",
          label: "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
        }),
      ],
    });
    const action = resolveMasterOfferingAction(
      product,
      product.variants[0],
      { binding: null, selection: null },
      undefined,
      { manualEarlyAccessPurchase: true },
    );
    expect(action.kind).not.toBe("request_early_access_purchase");
  });

  it("still emits Add to Cart for a sibling combination that states its amounts", () => {
    // The neighbouring CJC row. Held and unheld rows differ only by the
    // declaration, so this proves the hold is not simply refusing every combo.
    const product = offering({
      family: "research_peptides_materials",
      displayState: "request_access",
      variants: [
        variant({
          displayState: "request_access",
          label: "CJC-1295 (No DAC) 10 mg + IPAMORELIN 10 mg",
        }),
      ],
    });
    const presentation = product.variants[0];
    expect(
      resolveMasterOfferingAction(product, presentation, bindingFor(presentation)).kind,
    ).toBe("add_to_cart");
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

describe("the 420-row acceptance matrix", () => {
  // The exhaustive per-row verdict for the catalog as it actually ships.
  //
  // This is the artifact the peptide launch is graded against: every variant,
  // the exact reason it may or may not be bought directly, and the counts that
  // must hold before direct commerce is switched on. It is written as counts
  // rather than a snapshot so that a real catalog change reads as a number
  // moving, not as an opaque blob diff.
  const matrix = () => {
    const byReason = new Map<string, DatasetVariant[]>();
    for (const row of realCatalogVariants()) {
      const reason = directPurchaseRefusal(row) ?? "direct_eligible";
      const bucket = byReason.get(reason) ?? [];
      bucket.push(row);
      byReason.set(reason, bucket);
    }
    return byReason;
  };

  it("holds no row today, because the CJC-1295 WITH DAC row is not in the artifact yet", () => {
    // Flips to 1 the moment the workbook regeneration lands GRP-0422.
    expect(matrix().get("formulation_hold") ?? []).toHaveLength(0);
  });

  it("accounts for all 420 variants exactly once", () => {
    const buckets = matrix();
    const total = [...buckets.values()].reduce((sum, rows) => sum + rows.length, 0);
    expect(total).toBe(420);
  });

  it("refuses every classification-pending peptide, so none can be bought", () => {
    // The founder's target says 29 classification-pending rows are Request
    // Order, never a cart. Before this rule the resolver checked visibility and
    // the binding only, so all 29 would have offered Add to Cart the moment the
    // direct-commerce flag was turned on.
    const pending = matrix().get("classification_pending") ?? [];
    expect(pending).toHaveLength(29);
    expect(new Set(pending.map((row) => row.family))).toEqual(
      new Set(["research_peptides_materials"]),
    );
  });

  it("holds Research Capsules out of the launch, all 16 of them", () => {
    const excluded = matrix().get("family_outside_launch_scope") ?? [];
    expect(excluded).toHaveLength(16);
    expect(new Set(excluded.map((row) => row.family))).toEqual(new Set(["research_capsules"]));
  });

  it("routes all 242 compounded formulations and both shipping lines away from purchase", () => {
    // The 503A rows report `provider_pathway_family`, not the display-state
    // reason, because family is checked first: it is the reason that cannot be
    // edited away. `care_pathway_display_state` is empty today precisely
    // because every row currently carrying that state is also in a refused
    // family — which is the drift this authority exists to survive.
    expect(matrix().get("provider_pathway_family") ?? []).toHaveLength(242);
    expect(matrix().get("non_merchandise_family") ?? []).toHaveLength(2);
    expect(matrix().get("care_pathway_display_state") ?? []).toHaveLength(0);
  });

  it("leaves exactly the 106 confirmed-RUO peptide rows directly eligible today", () => {
    const eligible = matrix().get("direct_eligible") ?? [];
    const peptides = eligible.filter((row) => row.family === "research_peptides_materials");

    expect(peptides).toHaveLength(106);
    for (const row of peptides) {
      expect(row.displayState).toBe("request_access");
    }
  });

  it("records the non-peptide families still direct-eligible, pending a founder ruling", () => {
    // The founder's rule named peptides as in scope and Research Capsules as
    // out. It said nothing about these three, so this lane does not decide
    // their launch scope — it makes the open question countable instead of
    // silent. If they are meant to be out too, they join
    // DIRECT_PURCHASE_EXCLUDED_FAMILIES and these numbers go to zero.
    const eligible = matrix().get("direct_eligible") ?? [];
    const others = eligible.filter((row) => row.family !== "research_peptides_materials");
    const counts: Record<string, number> = {};
    for (const row of others) counts[row.family] = (counts[row.family] ?? 0) + 1;

    expect(counts).toEqual({
      supplements: 20,
      topicals_regenerative: 3,
      research_supplies: 2,
    });
  });

  it("still has none of the six rows the founder decided on 2026-08-20", () => {
    // 106 confirmed RUO today, 112 in the founder's target. The difference is
    // two classification corrections (Hexarelin 5 mg, Oxytocin 10 mg), three
    // new variants (Retatrutide 60 mg, MOTS-C 40 mg, Glutathione 600 mg) and
    // the formulation-blocked CJC-1295 WITH DAC + Ipamorelin combo.
    //
    // Creating those variants is a Product Control catalog mutation, which this
    // lane may not perform. So the gap is asserted rather than assumed: when
    // the artifact is regenerated with them, this test fails and the matrix
    // above is the checklist for what the new numbers must be.
    const rows = realCatalogVariants();
    const peptides = rows.filter((row) => row.family === "research_peptides_materials");
    expect(peptides).toHaveLength(135);

    const has = (needle: string) =>
      peptides.some((row) =>
        `${row.productName} ${row.variantLabel}`.toLowerCase().includes(needle.toLowerCase()),
      );
    expect(has("Retatrutide 60")).toBe(false);
    expect(has("MOTS-C 40")).toBe(false);
    expect(has("Glutathione 600")).toBe(false);
  });

  it("refuses every 503A row on family, so a display-state edit cannot release one", () => {
    const rows = realCatalogVariants().filter(
      (row) => row.family === "clinical_formulations_503a",
    );
    expect(rows).toHaveLength(242);

    for (const row of rows) {
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
