// The payment-eligibility gate, proved against the REAL canonical artifacts
// rather than fixtures, because the whole value of this lane is that the counts
// the founder approved are the counts the system will actually charge for.
//
// Two sources are read, on purpose:
//   - docs/research-launch/MASTER_CATALOG_2026-08-16_SUMMARY.json — the founder's
//     workbook, 426 rows, the commercial truth;
//   - server/research/master-offerings/data/member-safe-master-offerings.generated.json
//     — the canonical RUNTIME dataset the site actually serves.
// Reading only the first proves a spreadsheet. Reading only the second proves
// today's shipping gap and calls it correct. The reconciliation between them is
// the finding.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalPaymentEligibility,
  compositionResolvedFromSpecification,
  mayEnterPaymentJourney,
  type CanonicalPaymentFacts,
} from "./canonical-payment-eligibility";

// The list the composition root will hand in, identical to the pathway
// resolver's DIRECT_PURCHASE_FAMILIES. Stated once here so every assertion
// below is evaluated against the real commercial policy.
const POLICY = { directPurchaseFamilies: ["research_peptides_materials"] } as const;

const REPO = path.resolve(__dirname, "../../../..");

type WorkbookRow = Readonly<{
  "Group ID": string;
  Family: string;
  Channel: string;
  Product: string;
  "Normalized Specification": string | null;
  "Buy Cost / Unit": unknown;
  "Suggested Sell Price": unknown;
}>;

function workbookRows(): readonly WorkbookRow[] {
  const raw = readFileSync(
    path.join(REPO, "docs/research-launch/MASTER_CATALOG_2026-08-16_SUMMARY.json"),
    "utf8",
  );
  return JSON.parse(raw).rows as readonly WorkbookRow[];
}

function runtimePeptideVariantLabels(): ReadonlySet<string> {
  const raw = readFileSync(
    path.join(
      REPO,
      "server/research/master-offerings/data/member-safe-master-offerings.generated.json",
    ),
    "utf8",
  );
  const parsed: unknown = JSON.parse(raw);
  const offerings = (
    Array.isArray(parsed)
      ? parsed
      : Object.values(parsed as Record<string, unknown>).find(Array.isArray)
  ) as readonly Record<string, never>[];
  const labels = new Set<string>();
  for (const offering of offerings) {
    if ((offering as { family?: string }).family !== "research_peptides_materials") {
      continue;
    }
    for (const variant of ((offering as { variants?: { label?: string }[] })
      .variants ?? [])) {
      labels.add((variant.label ?? "").toUpperCase().trim());
    }
  }
  return labels;
}

const PEPTIDE_FAMILY = "Research Peptides & Materials";
const CONFIRMED_RUO_CHANNEL = "RUO Research";

/** Map one workbook row onto the canonical facts the gate consumes. */
function factsFor(row: WorkbookRow): CanonicalPaymentFacts {
  const price = row["Suggested Sell Price"];
  return {
    family:
      row.Family === PEPTIDE_FAMILY ? "research_peptides_materials" : row.Family,
    researchUseOnlyConfirmed: row.Channel === CONFIRMED_RUO_CHANNEL,
    hasApprovedRetailPrice: typeof price === "number" && price > 0,
    compositionResolved: compositionResolvedFromSpecification(
      row["Normalized Specification"],
    ),
    commerceHold: false,
    availabilityUnderReview: false,
  };
}

function baseFacts(
  overrides: Partial<CanonicalPaymentFacts> = {},
): CanonicalPaymentFacts {
  return {
    family: "research_peptides_materials",
    researchUseOnlyConfirmed: true,
    hasApprovedRetailPrice: true,
    compositionResolved: true,
    commerceHold: false,
    availabilityUnderReview: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("the gate refuses on canonical facts, in the right order", () => {
  it("admits a confirmed, priced, resolved peptide variant", () => {
    expect(mayEnterPaymentJourney(baseFacts(), POLICY)).toBe(true);
  });

  it("refuses a family that is not approved for direct purchase", () => {
    for (const family of [
      "research_capsules",
      "clinical_503a",
      "supplements",
      "topicals_regenerative",
      "research_supplies",
      "shipping_fulfillment",
    ]) {
      expect(canonicalPaymentEligibility(baseFacts({ family }), POLICY)).toMatchObject({
        eligible: false,
        code: "FAMILY_NOT_DIRECT",
      });
    }
  });

  it("refuses an unconfirmed classification even when priced", () => {
    expect(
      canonicalPaymentEligibility(
        baseFacts({ researchUseOnlyConfirmed: false }),
        POLICY,
      ),
    ).toMatchObject({ eligible: false, code: "CLASSIFICATION_NOT_CONFIRMED" });
  });

  it("refuses an unresolved composition even when priced and confirmed RUO", () => {
    expect(
      canonicalPaymentEligibility(baseFacts({ compositionResolved: false }), POLICY),
    ).toMatchObject({ eligible: false, code: "COMPOSITION_UNRESOLVED" });
  });

  it("refuses a missing price rather than treating it as zero", () => {
    expect(
      canonicalPaymentEligibility(baseFacts({ hasApprovedRetailPrice: false }), POLICY),
    ).toMatchObject({ eligible: false, code: "NO_APPROVED_PRICE" });
  });

  it("refuses a held unit and a unit under availability review", () => {
    expect(canonicalPaymentEligibility(baseFacts({ commerceHold: true }), POLICY)).toMatchObject(
      { eligible: false, code: "UNIT_HELD" },
    );
    expect(
      canonicalPaymentEligibility(baseFacts({ availabilityUnderReview: true }), POLICY),
    ).toMatchObject({ eligible: false, code: "AVAILABILITY_UNDER_REVIEW" });
  });

  it("consults the disqualifying facts BEFORE price, so a price cannot promote a row", () => {
    // Every one of these is priced. None becomes eligible because of it.
    const priced = { hasApprovedRetailPrice: true } as const;
    expect(
      canonicalPaymentEligibility(
        baseFacts({ ...priced, family: "clinical_503a" }),
        POLICY,
      ),
    ).toMatchObject({ code: "FAMILY_NOT_DIRECT" });
    expect(
      canonicalPaymentEligibility(
        baseFacts({ ...priced, researchUseOnlyConfirmed: false }),
        POLICY,
      ),
    ).toMatchObject({ code: "CLASSIFICATION_NOT_CONFIRMED" });
    expect(
      canonicalPaymentEligibility(
        baseFacts({ ...priced, compositionResolved: false }),
        POLICY,
      ),
    ).toMatchObject({ code: "COMPOSITION_UNRESOLVED" });
  });
});

describe("composition reading", () => {
  it("treats a stated split-pending combination as unresolved", () => {
    expect(
      compositionResolvedFromSpecification(
        "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
      ),
    ).toBe(false);
  });

  it("does not hold an ordinary single-molecule vial", () => {
    expect(compositionResolvedFromSpecification("BPC-157 5 mg")).toBe(true);
    expect(compositionResolvedFromSpecification("RETATRUTIDE 60 mg")).toBe(true);
  });

  it("treats an absent specification as resolved, not as a combination", () => {
    expect(compositionResolvedFromSpecification(null)).toBe(true);
    expect(compositionResolvedFromSpecification("")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The founder's numbers, computed from the real workbook.
// ---------------------------------------------------------------------------

describe("the founder's peptide targets, computed not restated", () => {
  const rows = workbookRows();
  const peptides = rows.filter((row) => row.Family === PEPTIDE_FAMILY);

  it("finds 141 peptide rows, 112 confirmed RUO, 29 classification pending", () => {
    expect(peptides).toHaveLength(141);
    expect(
      peptides.filter((row) => row.Channel === CONFIRMED_RUO_CHANNEL),
    ).toHaveLength(112);
    expect(
      peptides.filter((row) => row.Channel !== CONFIRMED_RUO_CHANNEL),
    ).toHaveLength(29);
  });

  it("admits exactly 111 peptide rows to the payment journey", () => {
    const admitted = peptides.filter((row) =>
      mayEnterPaymentJourney(factsFor(row), POLICY),
    );
    expect(admitted).toHaveLength(111);
  });

  it("refuses exactly one confirmed-RUO peptide, and it is the CJC combination", () => {
    const refusedRuo = peptides
      .filter((row) => row.Channel === CONFIRMED_RUO_CHANNEL)
      .filter((row) => !mayEnterPaymentJourney(factsFor(row), POLICY));
    expect(refusedRuo).toHaveLength(1);
    expect(refusedRuo[0]["Group ID"]).toBe("GRP-0422");
    expect(refusedRuo[0]["Normalized Specification"]).toContain("split pending");
    expect(
      canonicalPaymentEligibility(factsFor(refusedRuo[0]), POLICY),
    ).toMatchObject({
      code: "COMPOSITION_UNRESOLVED",
    });
  });

  it("admits nothing outside the peptide family, from all 426 rows", () => {
    const admittedNonPeptide = rows
      .filter((row) => row.Family !== PEPTIDE_FAMILY)
      .filter((row) => mayEnterPaymentJourney(factsFor(row), POLICY));
    expect(admittedNonPeptide).toHaveLength(0);
  });

  it("keeps Research Capsules and 503A out even though they are priced", () => {
    for (const family of ["Research Capsules", "503A Clinical Formulations"]) {
      const inFamily = rows.filter((row) => row.Family === family);
      expect(inFamily.length).toBeGreaterThan(0);
      // Some of them ARE priced — that is exactly why the family rule matters.
      expect(
        inFamily.filter(
          (row) => typeof row["Suggested Sell Price"] === "number",
        ).length,
      ).toBeGreaterThan(0);
      expect(
        inFamily.filter((row) => mayEnterPaymentJourney(factsFor(row), POLICY)),
      ).toHaveLength(0);
    }
  });

  it("admits no row that carries no retail price", () => {
    const unpriced = peptides.filter(
      (row) => typeof row["Suggested Sell Price"] !== "number",
    );
    for (const row of unpriced) {
      expect(mayEnterPaymentJourney(factsFor(row), POLICY)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The WITH-DAC decision, pinned row by row.
// ---------------------------------------------------------------------------

describe("the WITH-DAC hold is exactly one row and is not broadened", () => {
  const rows = workbookRows();
  const byGroup = (id: string) => {
    const row = rows.find((candidate) => candidate["Group ID"] === id);
    if (!row) throw new Error(`${id} not found in the workbook`);
    return row;
  };

  // The founder's 2026-08-21 decision, stated row by row. Standalone WITH-DAC
  // products are NOT globally blocked; only the combination whose component
  // split is unresolved is. Written out per row so a future widening of the
  // composition predicate — the easy mistake, e.g. matching "DAC" — fails here
  // rather than silently pulling two priced products off the shelf.
  it("admits CJC-1295 WITH DAC 2 mg (confirmed RUO, priced)", () => {
    const row = byGroup("GRP-0272");
    expect(row["Normalized Specification"]).toBe("CJC-1295 WITH DAC 2 mg");
    expect(mayEnterPaymentJourney(factsFor(row), POLICY)).toBe(true);
  });

  it("admits CJC-1295 WITH DAC 5 mg (confirmed RUO, priced)", () => {
    const row = byGroup("GRP-0273");
    expect(row["Normalized Specification"]).toBe("CJC-1295 WITH DAC 5 mg");
    expect(mayEnterPaymentJourney(factsFor(row), POLICY)).toBe(true);
  });

  it("refuses CJC-1295 With DAC 10 mg for CLASSIFICATION, not composition", () => {
    const row = byGroup("GRP-0394");
    expect(row.Channel).not.toBe(CONFIRMED_RUO_CHANNEL);
    expect(canonicalPaymentEligibility(factsFor(row), POLICY)).toMatchObject({
      code: "CLASSIFICATION_NOT_CONFIRMED",
    });
  });

  it("refuses ONLY the combination, for COMPOSITION", () => {
    expect(canonicalPaymentEligibility(factsFor(byGroup("GRP-0422")), POLICY)).toMatchObject(
      { code: "COMPOSITION_UNRESOLVED" },
    );
    // Nothing else in the whole workbook is refused for composition.
    const compositionRefused = rows.filter((row) => {
      const verdict = canonicalPaymentEligibility(factsFor(row), POLICY);
      return !verdict.eligible && verdict.code === "COMPOSITION_UNRESOLVED";
    });
    expect(compositionRefused.map((row) => row["Group ID"])).toEqual(["GRP-0422"]);
  });

  it("leaves the No-DAC combinations orderable", () => {
    for (const id of ["GRP-0268", "GRP-0269", "GRP-0270", "GRP-0271"]) {
      expect(mayEnterPaymentJourney(factsFor(byGroup(id)), POLICY)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Operational readiness must never block ACCEPTING an order.
// ---------------------------------------------------------------------------

describe("downstream operational state cannot refuse a customer's order", () => {
  it("has no input for supplier, inventory, lot, COA or fulfillment readiness", () => {
    // The strongest possible statement of the rule: the gate cannot consider
    // these because they cannot be passed to it. A caller that wants to block
    // on stock has to change this type, which is a reviewed act.
    const keys = Object.keys(baseFacts());
    for (const operational of [
      "supplierAssigned",
      "supplierReady",
      "inventoryConfirmed",
      "inStock",
      "lotAssigned",
      "coaOnFile",
      "fulfillmentReady",
      "releasedUnit",
    ]) {
      expect(keys).not.toContain(operational);
    }
  });

  it("admits an eligible variant regardless of any operational surroundings", () => {
    // Same facts, asserted twice, to state plainly that nothing outside the six
    // canonical facts participates in the decision.
    expect(mayEnterPaymentJourney(baseFacts(), POLICY)).toBe(true);
    expect(
      mayEnterPaymentJourney(
        { ...baseFacts(), commerceHold: false, availabilityUnderReview: false },
        POLICY,
      ),
    ).toBe(true);
  });

  it("still honours an EXPLICIT commerce hold, which is a decision not a stock level", () => {
    expect(
      canonicalPaymentEligibility(baseFacts({ commerceHold: true }), POLICY),
    ).toMatchObject({ eligible: false, code: "UNIT_HELD" });
  });
});

// ---------------------------------------------------------------------------
// The reconciliation against what the site actually serves today.
// ---------------------------------------------------------------------------

describe("the runtime dataset reconciles to the founder's 139", () => {
  const peptides = workbookRows().filter((row) => row.Family === PEPTIDE_FAMILY);
  const runtime = runtimePeptideVariantLabels();

  it("serves 135 peptide variants today", () => {
    expect(runtime.size).toBe(135);
  });

  it("is missing exactly six workbook rows, and names them", () => {
    const missing = peptides.filter(
      (row) =>
        !runtime.has((row["Normalized Specification"] ?? "").toUpperCase().trim()),
    );
    expect(missing.map((row) => row["Group ID"]).sort()).toEqual([
      "GRP-0421",
      "GRP-0422",
      "GRP-0423",
      "GRP-0424",
      "GRP-0425",
      "GRP-0426",
    ]);
  });

  it("135 served + 4 generatable = the founder's 139 unique variants", () => {
    // GRP-0425 (OXYTOCIN 10 mg) and GRP-0426 (HEXARELIN 5 mg) are DUPLICATE
    // workbook rows of strengths whose canonical variants already exist and
    // already carry the newer price. Generating them would list the same
    // product twice at two prices with two actions. Four rows are genuinely
    // absent and are the four to generate.
    const DUPLICATES = ["GRP-0425", "GRP-0426"];
    const missing = peptides.filter(
      (row) =>
        !runtime.has((row["Normalized Specification"] ?? "").toUpperCase().trim()),
    );
    const generatable = missing.filter(
      (row) => !DUPLICATES.includes(row["Group ID"]),
    );
    expect(generatable).toHaveLength(4);
    expect(runtime.size + generatable.length).toBe(139);
  });

  it("the CJC combination is one of the four, so generating them opens a sale unless this gate holds", () => {
    // This is the sequencing hazard the gate exists for. The row does not
    // exist at runtime today, so nothing can buy it; the day the
    // reconciliation lane generates it, only this refusal stands between the
    // customer and a product whose split Xenios cannot state.
    const cjc = peptides.find((row) => row["Group ID"] === "GRP-0422");
    expect(cjc).toBeDefined();
    expect(
      runtime.has((cjc!["Normalized Specification"] ?? "").toUpperCase().trim()),
    ).toBe(false);
    expect(cjc!.Channel).toBe(CONFIRMED_RUO_CHANNEL);
    expect(typeof cjc!["Suggested Sell Price"]).toBe("number");
    expect(mayEnterPaymentJourney(factsFor(cjc!), POLICY)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("the gate cannot leak internal pricing", () => {
  it("takes no amount and no cost, only a boolean about price", () => {
    const facts = baseFacts();
    const keys = Object.keys(facts);
    expect(keys).toEqual([
      "family",
      "researchUseOnlyConfirmed",
      "hasApprovedRetailPrice",
      "compositionResolved",
      "commerceHold",
      "availabilityUnderReview",
    ]);
    // No amount, cost, margin, markup or supplier field can be passed in, so
    // none can be echoed back in a refusal.
    for (const forbidden of [
      "cost",
      "buyCost",
      "wholesale",
      "margin",
      "markup",
      "supplier",
      "priceCents",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("refusal reasons carry no money and no internal pricing vocabulary", () => {
    // Not "no digits" — a family key like `clinical_503a` legitimately carries
    // one, and asserting on digits would pass for the wrong reason. What must
    // never appear is an AMOUNT or an internal pricing word.
    const refusals = [
      canonicalPaymentEligibility(baseFacts({ family: "clinical_503a" }), POLICY),
      canonicalPaymentEligibility(
        baseFacts({ hasApprovedRetailPrice: false }),
        POLICY,
      ),
      canonicalPaymentEligibility(
        baseFacts({ compositionResolved: false }),
        POLICY,
      ),
      canonicalPaymentEligibility(baseFacts({ commerceHold: true }), POLICY),
    ];
    for (const refusal of refusals) {
      expect(refusal.eligible).toBe(false);
      if (refusal.eligible) continue;
      // No currency amount in any shape: $12, 12.00, 1,200, 1200 cents.
      expect(refusal.reason).not.toMatch(
        /[$£€]\s*\d|\d+[.,]\d{2}\b|\b\d+\s*(?:cents?|usd)\b/i,
      );
      for (const forbidden of [
        "cost",
        "wholesale",
        "margin",
        "markup",
        "multiplier",
        "benchmark",
        "supplier",
      ]) {
        expect(refusal.reason.toLowerCase()).not.toContain(forbidden);
      }
    }
  });
});
