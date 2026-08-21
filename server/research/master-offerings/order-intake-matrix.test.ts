import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMasterOfferingAction } from "./action";
import { reviewedHeldSpecifications } from "./reviewed-holds";
import type {
  MasterOfferingDisplayState,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import type {
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";
import { cartSelection } from "./test-fixtures";
import { projectMasterOfferingVariant } from "./customer-projection";
import type { MasterOfferingPriceView } from "@shared/research/master-offerings/pricing-contract";

// ---------------------------------------------------------------------------
// ORDER INTAKE MATRIX — every canonical variant, at the layer that decides what
// the customer's button says.
//
// The workbook matrix proves the SOURCE adds up. This proves the RESOLVER
// agrees, which is a different question. It runs every shipped variant through
// resolveMasterOfferingAction with commerce deliberately made perfect: a
// matching binding and a fully valid Product Control selection.
//
// That inversion is the point. A test that withholds commerce proves nothing
// about a routing rule, because everything refuses for the wrong reason. Here
// everything is pre-approved, so each refusal names a rule that actually fired.
// ---------------------------------------------------------------------------

interface Row {
  family: MasterOfferingFamily;
  productName: string;
  variantLabel: string;
  displayState: MasterOfferingDisplayState;
  variantDisplayState: MasterOfferingDisplayState;
}

function shippedRows(): Row[] {
  const file = path.join(__dirname, "data", "member-safe-master-offerings.generated.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    products: Array<{
      displayName: string;
      family: MasterOfferingFamily;
      displayState: MasterOfferingDisplayState;
      variants: Array<{ label: string; displayState: MasterOfferingDisplayState }>;
    }>;
  };
  const rows: Row[] = [];
  for (const product of parsed.products) {
    for (const presentation of product.variants) {
      rows.push({
        family: product.family,
        productName: product.displayName,
        variantLabel: presentation.label,
        displayState: product.displayState,
        variantDisplayState: presentation.displayState,
      });
    }
  }
  return rows;
}

/** One row, with commerce made as favourable as it can legally be. */
function resolvedAction(row: Row) {
  const variant: NormalizedMasterOfferingVariant = {
    id: "mov_matrix_variant",
    label: row.variantLabel,
    displayState: row.variantDisplayState,
    visibility: "member",
    sourceReferences: [],
  };
  const offering = {
    id: "mo_matrix_offering",
    slug: "matrix",
    canonicalKey: "matrix",
    displayName: row.productName,
    canonicalName: row.productName,
    family: row.family,
    category: "matrix",
    subcategory: null,
    brand: null,
    aliases: [],
    displayState: row.displayState,
    stateExplanation: "",
    copyState: "approved",
    visibility: "member",
    variants: [variant],
    sourceReferences: [],
  } as unknown as NormalizedMasterOffering;

  const selection = cartSelection();
  return resolveMasterOfferingAction(
    offering,
    variant,
    {
      binding: {
        offeringVariantId: variant.id,
        productId: selection.productId,
        variantId: selection.variantId,
      },
      selection,
    },
    undefined,
    { reviewedFormulationHolds: reviewedHeldSpecifications() },
  );
}

const orderable = (row: Row) => resolvedAction(row).kind === "add_to_cart";

describe("order intake matrix: what the customer's button says", () => {
  it("resolves every shipped variant, none skipped", () => {
    const rows = shippedRows();
    expect(rows).toHaveLength(420);
    for (const row of rows) {
      expect(resolvedAction(row).kind).toBeTruthy();
    }
  });

  it("offers direct ordering to all 106 confirmed-RUO peptides", () => {
    const peptides = shippedRows().filter(
      (row) => row.family === "research_peptides_materials" && orderable(row),
    );

    expect(peptides).toHaveLength(106);
    for (const row of peptides) {
      expect(row.variantDisplayState).toBe("request_access");
    }
  });

  it("also offers it to 25 NON-peptide rows, which is an open founder decision", () => {
    // The founder's rule reads as an allowlist: direct order applies when the
    // canonical family is research_peptides_materials. Read that way, these 25
    // rows should not carry an order button in a PEPTIDE launch.
    //
    // They are not refused here, because this lane does not get to remove 25
    // sellable rows on an inference. The rule names peptides as in scope and
    // Research Capsules as out, and says nothing at all about these three
    // families. So the count is asserted and escalated rather than acted on:
    // it is exactly the "ambiguity that could make the wrong product orderable"
    // the founder asked to be escalated.
    //
    // Nothing is live either way: direct commerce is flag-off. To close it,
    // add these families to DIRECT_PURCHASE_EXCLUDED_FAMILIES and this test
    // flips to zero.
    const others = shippedRows().filter(
      (row) => row.family !== "research_peptides_materials" && orderable(row),
    );
    const counts: Record<string, number> = {};
    for (const row of others) counts[row.family] = (counts[row.family] ?? 0) + 1;

    expect(counts).toEqual({
      supplements: 20,
      topicals_regenerative: 3,
      research_supplies: 2,
    });
  });

  it("routes every classification-pending peptide to a request, never a cart", () => {
    const pending = shippedRows().filter(
      (row) =>
        row.family === "research_peptides_materials" &&
        row.variantDisplayState === "approval_required",
    );

    expect(pending).toHaveLength(29);
    for (const row of pending) {
      expect(resolvedAction(row).kind).not.toBe("add_to_cart");
    }
  });

  it("keeps Research Capsules out of direct ordering", () => {
    const capsules = shippedRows().filter((row) => row.family === "research_capsules");
    expect(capsules).toHaveLength(16);
    for (const row of capsules) {
      expect(resolvedAction(row).kind).not.toBe("add_to_cart");
    }
  });

  it("sends every clinical formulation through Care and never to a cart", () => {
    const clinical = shippedRows().filter((row) => row.family === "clinical_formulations_503a");
    expect(clinical).toHaveLength(242);
    for (const row of clinical) {
      expect(resolvedAction(row).kind).toBe("explore_care");
    }
  });

  it("never offers a shipping line as a product", () => {
    for (const row of shippedRows().filter((r) => r.family === "shipping_and_fulfillment")) {
      expect(resolvedAction(row).kind).not.toBe("add_to_cart");
    }
  });

  it("refuses the formulation-held combination under its canonical name", () => {
    // GRP-0422 is not in the shipped artifact yet, so it is resolved directly
    // rather than read from it. Under the RUO classification with a perfect
    // selection, the hold is the only thing between it and a cart.
    expect(
      orderable({
        family: "research_peptides_materials",
        productName: "CJC-1295 + Ipamorelin",
        variantLabel: "CJC-1295 WITH DAC + IPAMORELIN 5 mg total",
        displayState: "request_access",
        variantDisplayState: "request_access",
      }),
    ).toBe(false);
  });

  it("keeps the standalone WITH DAC strengths orderable", () => {
    // Founder decision 2026-08-21: 2 mg and 5 mg are DIRECT. If a future
    // widening of the hold catches these, sellable rows leave the shelf.
    for (const label of ["CJC-1295 WITH DAC 2 mg", "CJC-1295 WITH DAC 5 mg"]) {
      expect(
        orderable({
          family: "research_peptides_materials",
          productName: "CJC-1295 With Dac",
          variantLabel: label,
          displayState: "request_access",
          variantDisplayState: "request_access",
        }),
      ).toBe(true);
    }
  });

  it("records the gap between what ships today and the founder's target", () => {
    // TODAY: 106 direct, because the reconciled artifact has not been
    // regenerated into the repo. GRP-0425/0426 are absent, so the runtime still
    // carries the PENDING twins of Hexarelin 5 mg and Oxytocin 10 mg.
    //
    // TARGET: 139 canonical peptide variants = 111 direct + 1 formulation
    // blocked + 27 classification pending.
    //
    // This is the tripwire. When the regeneration lands it fails, and the
    // numbers below are the checklist for what it must become.
    const rows = shippedRows();
    expect(rows.filter((r) => r.family === "research_peptides_materials")).toHaveLength(135);
    expect(
      rows.filter((r) => r.family === "research_peptides_materials" && orderable(r)),
    ).toHaveLength(106);
    // 131 = the 106 peptides plus the 25 non-peptide rows above.
    expect(rows.filter(orderable)).toHaveLength(131);

    const TARGET = Object.freeze({
      canonicalPeptideVariants: 139,
      direct: 111,
      formulationBlocked: 1,
      classificationPending: 27,
    });
    expect(
      TARGET.direct + TARGET.formulationBlocked + TARGET.classificationPending,
    ).toBe(TARGET.canonicalPeptideVariants);
  });
});

// ---------------------------------------------------------------------------
// A row the customer cannot order still has to show what it costs.
//
// The founder's routing table says GRP-0422 is VISIBLE, RETAIL PRICED, and
// Request Order. Those are three separate properties and only one of them is a
// routing decision. Price and action are resolved independently — the action
// resolver never sees the price, and the projection sets them side by side —
// so this pins the independence rather than assuming it.
//
// The regression it guards against is a plausible and well-meant one: someone
// deciding that a product you cannot buy should not show a price. That would
// leave a customer requesting an order for an amount nobody ever showed them.
// ---------------------------------------------------------------------------

const RETAIL_PRICE: MasterOfferingPriceView = {
  state: "priced",
  amountCents: 9900,
  currency: "USD",
  display: "$99.00",
  basis: "exact_listed_unit",
  priceId: "price_grp_0422",
  priceVersion: 1,
  effectiveAt: "2026-08-19T00:00:00.000Z",
  expiresAt: null,
};

function projectRow(row: Row, price: MasterOfferingPriceView) {
  const variant: NormalizedMasterOfferingVariant = {
    id: "mov_matrix_variant",
    label: row.variantLabel,
    displayState: row.variantDisplayState,
    visibility: "member",
    sourceReferences: [],
  };
  const offering = {
    id: "mo_matrix_offering",
    slug: "matrix",
    canonicalKey: "matrix",
    displayName: row.productName,
    canonicalName: row.productName,
    family: row.family,
    category: "matrix",
    subcategory: null,
    brand: null,
    aliases: [],
    displayState: row.displayState,
    stateExplanation: "",
    copyState: "approved",
    visibility: "member",
    variants: [variant],
    sourceReferences: [],
  } as unknown as NormalizedMasterOffering;

  const selection = cartSelection();
  return projectMasterOfferingVariant(
    offering,
    variant,
    () => ({
      binding: {
        offeringVariantId: variant.id,
        productId: selection.productId,
        variantId: selection.variantId,
      },
      selection,
    }),
    price,
    { reviewedFormulationHolds: reviewedHeldSpecifications() },
  );
}

describe("a Request Order row still shows its retail price", () => {
  it("prices the formulation-held combination while refusing to sell it", () => {
    const view = projectRow(
      {
        family: "research_peptides_materials",
        productName: "CJC-1295 + Ipamorelin",
        variantLabel: "CJC-1295 WITH DAC + IPAMORELIN 5 mg total",
        displayState: "request_access",
        variantDisplayState: "request_access",
      },
      RETAIL_PRICE,
    );

    // Visible, priced, and not directly orderable — all three at once.
    expect(view.label).toBe("CJC-1295 WITH DAC + IPAMORELIN 5 mg total");
    expect(view.price).toMatchObject({ state: "priced", amountCents: 9900, display: "$99.00" });
    expect(view.action.kind).not.toBe("add_to_cart");
  });

  it("prices a classification-pending peptide it will not sell", () => {
    const view = projectRow(
      {
        family: "research_peptides_materials",
        productName: "Some Pending Peptide",
        variantLabel: "PENDING PEPTIDE 10 mg",
        displayState: "approval_required",
        variantDisplayState: "approval_required",
      },
      RETAIL_PRICE,
    );

    expect(view.price).toMatchObject({ state: "priced", amountCents: 9900 });
    expect(view.action.kind).not.toBe("add_to_cart");
  });

  it("keeps the price identical to the one an orderable row would show", () => {
    // The same price object reaches the customer whether or not the row can be
    // bought, so a held row cannot quietly render a different number.
    const held = projectRow(
      {
        family: "research_peptides_materials",
        productName: "CJC-1295 + Ipamorelin",
        variantLabel: "CJC-1295 WITH DAC + IPAMORELIN 5 mg total",
        displayState: "request_access",
        variantDisplayState: "request_access",
      },
      RETAIL_PRICE,
    );
    const orderableRow = projectRow(
      {
        family: "research_peptides_materials",
        productName: "CJC-1295 With Dac",
        variantLabel: "CJC-1295 WITH DAC 5 mg",
        displayState: "request_access",
        variantDisplayState: "request_access",
      },
      RETAIL_PRICE,
    );

    expect(orderableRow.action.kind).toBe("add_to_cart");
    expect(held.price).toEqual(orderableRow.price);
  });
});
