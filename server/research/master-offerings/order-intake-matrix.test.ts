import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveMasterOfferingAction } from "./action";
import { reviewedHeldSpecifications, reviewedHeldVariantIds } from "./reviewed-holds";
import type {
  MasterOfferingDisplayState,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import type {
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";
import { cartSelection } from "./testing/cart-selection.test-support";
import { projectMasterOfferingVariant } from "./customer-projection";
import type { MasterOfferingPriceView } from "@shared/research/master-offerings/pricing-contract";

let sealedCartSelection: Awaited<ReturnType<typeof cartSelection>>;

beforeAll(async () => {
  sealedCartSelection = await cartSelection();
});

// ---------------------------------------------------------------------------
// ORDER INTAKE MATRIX — every canonical variant, at the layer that decides what
// the customer's button says.
//
// The workbook matrix proves the SOURCE adds up. This proves the RESOLVER
// agrees, which is a different question. It runs every shipped variant through
// resolveMasterOfferingAction with exact current presentation state plus a
// matching binding and a fully valid Product Control selection. A separate
// helper deliberately simulates publishing a request-access row as
// available-now, so candidate counts never masquerade as current runtime truth.
//
// That inversion is the point. A test that withholds commerce proves nothing
// about a routing rule, because everything refuses for the wrong reason. Here
// everything is pre-approved, so each refusal names a rule that actually fired.
// ---------------------------------------------------------------------------

interface Row {
  /** Supplied for every real dataset row; synthetic policy fixtures may omit it. */
  offeringVariantId?: string;
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
      variants: Array<{ id: string; label: string; displayState: MasterOfferingDisplayState }>;
    }>;
  };
  const rows: Row[] = [];
  for (const product of parsed.products) {
    for (const presentation of product.variants) {
      rows.push({
        offeringVariantId: presentation.id,
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
    id: row.offeringVariantId ?? "mov_matrix_variant",
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

  const selection = sealedCartSelection;
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
    {
      reviewedFormulationHolds: reviewedHeldSpecifications(),
      reviewedFormulationHoldVariantIds: reviewedHeldVariantIds(),
    },
  );
}

const orderable = (row: Row) => resolvedAction(row).kind === "add_to_cart";

/** Candidate answer after the distinct presentation authority publishes a
 * request-access row as available-now. Other states are left untouched. */
const publicationCandidateOrderable = (row: Row) =>
  resolvedAction(
    row.displayState === "request_access" && row.variantDisplayState === "request_access"
      ? { ...row, displayState: "available_now", variantDisplayState: "available_now" }
      : row,
  ).kind === "add_to_cart";

describe("order intake matrix: what the customer's button says", () => {
  it("resolves every shipped variant, none skipped", () => {
    const rows = shippedRows();
    expect(rows).toHaveLength(424);
    expect(new Set(rows.map((row) => row.offeringVariantId)).size).toBe(424);
    for (const row of rows) {
      expect(row.offeringVariantId).toMatch(/^mov_/);
      expect(resolvedAction(row).kind).toBeTruthy();
    }
  });

  it("emits no Add to Cart for the exact runtime artifact before available-now publication", () => {
    expect(shippedRows().filter(orderable)).toEqual([]);
  });

  it("would offer direct ordering to 111 confirmed-RUO candidates only after explicit available-now publication and commerce approval", () => {
    const peptides = shippedRows().filter(
      (row) => row.family === "research_peptides_materials" && publicationCandidateOrderable(row),
    );

    expect(peptides).toHaveLength(111);
    for (const row of peptides) {
      expect(row.variantDisplayState).toBe("request_access");
    }
  });

  it("would also offer it to 25 NON-peptide candidates after publication, which is an open founder decision", () => {
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
      (row) => row.family !== "research_peptides_materials" && publicationCandidateOrderable(row),
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

    expect(pending).toHaveLength(27);
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
    const held = shippedRows().find((row) => row.offeringVariantId === "mov_f61758881da2b7bfa539");
    expect(held).toBeDefined();
    expect(held!.variantLabel).toBe("CJC-1295 WITH DAC + IPAMORELIN 5 mg total");
    expect(publicationCandidateOrderable(held!)).toBe(false);
    // Presentation wording is not authority to remove a source-identity hold.
    expect(publicationCandidateOrderable({
      ...held!, productName: "Renamed research material", variantLabel: "Reviewed formulation",
    })).toBe(false);
  });

  it("keeps the standalone WITH DAC strengths eligible after explicit available-now publication", () => {
    // Founder decision 2026-08-21: 2 mg and 5 mg are DIRECT. If a future
    // widening of the hold catches these, sellable rows leave the shelf.
    for (const label of ["CJC-1295 WITH DAC 2 mg", "CJC-1295 WITH DAC 5 mg"]) {
      expect(
        publicationCandidateOrderable({
          family: "research_peptides_materials",
          productName: "CJC-1295 With Dac",
          variantLabel: label,
          displayState: "request_access",
          variantDisplayState: "request_access",
        }),
      ).toBe(true);
    }
  });

  it("matches the reconciled classification target without manufacturing current commerce approval", () => {
    // Hypothetical publication with the sealed synthetic selection above:
    // 139 canonical peptides = 111 eligible + 1 held + 27 pending.
    // Current Add to Cart stays zero. The six new identities are still unbound
    // in the real composition, which this favourable-policy fixture does not
    // replace. Ingestion is not a binding, price or publication approval.
    const rows = shippedRows();
    expect(rows.filter((r) => r.family === "research_peptides_materials")).toHaveLength(139);
    expect(
      rows.filter((r) => r.family === "research_peptides_materials" && publicationCandidateOrderable(r)),
    ).toHaveLength(111);
    // 136 hypothetical candidates = 111 peptides plus 25 non-peptide rows.
    expect(rows.filter(publicationCandidateOrderable)).toHaveLength(136);

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
// The synthetic $99 fixture below proves price/action independence only. It
// does not release the source's intended cents or create a Product Control
// price for GRP-0422. The real six unbound identities stay unpriced in coverage.
// A future separately approved price may coexist with a formulation hold.
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
    id: row.offeringVariantId ?? "mov_matrix_variant",
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

  const selection = sealedCartSelection;
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
    {
      reviewedFormulationHolds: reviewedHeldSpecifications(),
      reviewedFormulationHoldVariantIds: reviewedHeldVariantIds(),
    },
  );
}

describe("a Request Order row still shows its retail price", () => {
  it("prices the formulation-held combination while refusing to sell it", () => {
    const view = projectRow(
      {
        family: "research_peptides_materials",
        productName: "CJC-1295 + Ipamorelin",
        variantLabel: "CJC-1295 WITH DAC + IPAMORELIN 5 mg total",
        displayState: "available_now",
        variantDisplayState: "available_now",
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
        displayState: "available_now",
        variantDisplayState: "available_now",
      },
      RETAIL_PRICE,
    );
    const orderableRow = projectRow(
      {
        family: "research_peptides_materials",
        productName: "CJC-1295 With Dac",
        variantLabel: "CJC-1295 WITH DAC 5 mg",
        displayState: "available_now",
        variantDisplayState: "available_now",
      },
      RETAIL_PRICE,
    );

    expect(orderableRow.action.kind).toBe("add_to_cart");
    expect(held.price).toEqual(orderableRow.price);
  });
});
