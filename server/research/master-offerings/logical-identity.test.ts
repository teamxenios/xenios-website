/**
 * The rungs of the identity ladder, and the refusals that keep it honest.
 *
 * Every test here is a case where a cheaper design would have merged two things
 * that are not the same thing.
 */

import { describe, expect, it } from "vitest";
import { catalogRevisionFromNormalized } from "./catalog-revision";
import {
  jaccard,
  matchCatalogRevisions,
  quantitySignature,
  quantityUnits,
  tokensOf,
} from "./logical-identity";
import { normalizeMasterOfferings } from "./normalize";
import type { RawEarlyAccessRow, RawMasterOfferingRow } from "./model";

function row(
  overrides: Partial<RawMasterOfferingRow> & {
    sheetRow: number;
    productName: string;
    sourceSku: string;
  },
): RawMasterOfferingRow {
  return {
    sourceGroup: "Existing Xenios master",
    category: "Peptides & Research",
    brandOrSubcategory: "Research",
    variantOrFormat: "5 mg",
    familyOrTag: "Research",
    supplierOrOwner: "Withheld",
    originalWholesaleCost: null,
    updatedWholesaleCost: null,
    wholesaleStatus: "",
    originalSellPrice: null,
    updatedSellPrice: null,
    targetSellAtUpdatedCost: null,
    recommendedLaunchSellPrice: null,
    updatedMarkupMultiple: null,
    updatedGrossProfit: null,
    updatedGrossMargin: null,
    sourceAccessState: "Request access",
    activationPriority: "",
    austinSupplierBenchmark: false,
    activationRequirement: "",
    sourceNotes: "",
    productUrl: null,
    ...overrides,
  };
}

function revision(
  label: string,
  rows: readonly RawMasterOfferingRow[],
  earlyAccess: readonly RawEarlyAccessRow[] = [],
) {
  return catalogRevisionFromNormalized({
    label,
    sourceWorkbookSha256: `${label}-sha`,
    catalog: normalizeMasterOfferings(rows, earlyAccess),
  });
}

describe("label quantity signatures", () => {
  it("reads the quantity a label states, whatever the wording around it", () => {
    expect(quantitySignature("5 mg")).toBe("5");
    expect(quantitySignature("5mg vial")).toBe("5");
    expect(quantitySignature("5 mg lyophilized vial")).toBe("5");
    // A word between the number and the unit must not change the size.
    expect(quantitySignature("60 vegetarian capsules")).toBe("60");
    expect(quantitySignature("60 capsules")).toBe("60");
    expect(quantitySignature("Standard offering")).toBeNull();
    expect(quantitySignature("5 mg 5 mg")).toBe("5+5");
  });

  it("keeps different quantities different", () => {
    expect(quantitySignature("10 mg")).not.toBe(quantitySignature("40 mg"));
    expect(quantitySignature("60 vegetarian capsules")).not.toBe(
      quantitySignature("120 vegetarian capsules"),
    );
  });

  it("keeps the units so an equal number in a different unit still fails", () => {
    expect(quantityUnits("5 mg")).toEqual(["mg"]);
    expect(quantityUnits("5 ml")).toEqual(["ml"]);
    expect(quantityUnits("60 vegetarian capsules")).toEqual(["capsule"]);
  });

  it("scores token overlap the obvious way", () => {
    expect(jaccard(tokensOf("beta peptide"), tokensOf("beta peptide"))).toBe(1);
    expect(jaccard(tokensOf("alpha"), tokensOf("omega"))).toBe(0);
  });
});

describe("rung 2, the workbook source ID", () => {
  it("carries an id through a rename when the source ID is unchanged", () => {
    const match = matchCatalogRevisions(
      revision("current", [
        row({ sheetRow: 2, productName: "Kappa Peptide", sourceSku: "K-1" }),
      ]),
      revision("candidate", [
        row({ sheetRow: 2, productName: "Kappa Peptide Extended", sourceSku: "K-1" }),
      ]),
    );
    expect(match.preserved).toHaveLength(1);
    expect(match.preserved[0].confidence).toBe("certain");
    expect(match.preserved[0].idChanged).toBe(true);
    expect(match.added).toEqual([]);
    expect(match.removed).toEqual([]);
  });

  it("refuses a source ID match when the two names have nothing in common", () => {
    const match = matchCatalogRevisions(
      revision("current", [
        row({ sheetRow: 2, productName: "Kappa", sourceSku: "K-1" }),
      ]),
      revision("candidate", [
        row({ sheetRow: 2, productName: "Omega", sourceSku: "K-1" }),
      ]),
    );
    expect(match.preserved).toEqual([]);
    expect(match.review).toHaveLength(1);
    expect(match.review[0].confidence).toBe("high");
    expect(match.review[0].reason).toContain("as likely a reused ID as a rename");
    // The pair is still reported both ways, so nothing disappears quietly.
    expect(match.added).toHaveLength(1);
    expect(match.removed).toHaveLength(1);
  });

  it("refuses a merge, because a source ID group is not one to one", () => {
    const match = matchCatalogRevisions(
      revision("current", [
        row({ sheetRow: 2, productName: "Merge One", sourceSku: "DUP-1" }),
        row({ sheetRow: 3, productName: "Merge Two", sourceSku: "DUP-1" }),
      ]),
      revision("candidate", [
        row({ sheetRow: 2, productName: "Merged Product", sourceSku: "DUP-1" }),
      ]),
    );
    expect(match.preserved).toEqual([]);
    expect(match.review.map((item) => item.evidence[0].kind)).toEqual([
      "source_sku_group_ambiguous",
      "source_sku_group_ambiguous",
    ]);
    expect(match.removed).toHaveLength(2);
    expect(match.added).toHaveLength(1);
  });

  it("does not use a blank or placeholder source ID as identity", () => {
    const match = matchCatalogRevisions(
      revision("current", [
        row({ sheetRow: 2, productName: "Nameless One", sourceSku: "-" }),
      ]),
      revision("candidate", [
        row({ sheetRow: 2, productName: "Nameless Renamed", sourceSku: "-" }),
      ]),
    );
    expect(match.preserved).toEqual([]);
    expect(match.removed).toHaveLength(1);
    expect(match.added).toHaveLength(1);
  });
});

describe("the refusals", () => {
  it("never carries an id across a family change, at any confidence", () => {
    const match = matchCatalogRevisions(
      revision("current", [
        row({
          sheetRow: 2,
          productName: "Crossover",
          sourceSku: "X-1",
          category: "Quantum & Regenerative",
        }),
      ]),
      revision("candidate", [
        row({
          sheetRow: 2,
          productName: "Crossover",
          sourceSku: "X-1",
          category: "Memberships & Programs",
        }),
      ]),
    );
    expect(match.preserved).toEqual([]);
    expect(match.review).toHaveLength(1);
    expect(match.review[0].confidence).toBe("high");
    expect(match.review[0].evidence[0].kind).toBe("family_changed");
    expect(match.review[0].reason).toContain("visibility and routing");
  });

  it("treats a brand change on a branded family as a real identity question", () => {
    const supplement = (brand: string) =>
      row({
        sheetRow: 2,
        productName: "Magnesium Glycinate",
        sourceSku: "S-1",
        category: "Supplements",
        brandOrSubcategory: brand,
        variantOrFormat: "60 capsules",
      });
    const match = matchCatalogRevisions(
      revision("current", [supplement("Thorne")]),
      revision("candidate", [supplement("Pure Encapsulations")]),
    );
    expect(match.preserved).toEqual([]);
    expect(
      match.review.some((item) => item.evidence[0].kind === "brand_changed"),
    ).toBe(true);
  });

  it("does not read a variant leaving and another arriving as a rename", () => {
    const current = revision("current", [
      row({ sheetRow: 2, productName: "Iota", sourceSku: "I-1", variantOrFormat: "5 mg" }),
      row({ sheetRow: 3, productName: "Iota", sourceSku: "I-1", variantOrFormat: "10 mg" }),
    ]);
    const candidate = revision("candidate", [
      row({ sheetRow: 2, productName: "Iota", sourceSku: "I-1", variantOrFormat: "5 mg" }),
      row({ sheetRow: 3, productName: "Iota", sourceSku: "I-1", variantOrFormat: "40 mg" }),
    ]);
    const match = matchCatalogRevisions(current, candidate);
    const pair = match.unchanged[0];
    expect(pair.variants.preserved).toEqual([]);
    expect(pair.variants.lost.map((variant) => variant.label)).toEqual(["10 mg"]);
    expect(pair.variants.gained.map((variant) => variant.label)).toEqual(["40 mg"]);
    expect(pair.variants.review[0].confidence).toBe("medium");
    expect(pair.variants.review[0].evidence.map((entry) => entry.kind)).toContain(
      "incompatible_quantity",
    );
  });

  it("does read a re-worded label of the same quantity as the same variant", () => {
    const match = matchCatalogRevisions(
      revision("current", [
        row({ sheetRow: 2, productName: "Iota", sourceSku: "I-1", variantOrFormat: "10 mg" }),
      ]),
      revision("candidate", [
        row({ sheetRow: 2, productName: "Iota", sourceSku: "I-1", variantOrFormat: "10 mg vial" }),
      ]),
    );
    const pair = match.unchanged[0];
    expect(pair.variants.preserved).toHaveLength(1);
    expect(pair.variants.preserved[0].confidence).toBe("certain");
    expect(pair.variants.lost).toEqual([]);
    expect(pair.variants.gained).toEqual([]);
  });

  it("flags a canonical key that now sits over completely different rows", () => {
    const match = matchCatalogRevisions(
      revision("current", [
        row({ sheetRow: 2, productName: "Zeta", sourceSku: "OLD-1" }),
      ]),
      revision("candidate", [
        row({ sheetRow: 2, productName: "Zeta", sourceSku: "NEW-9" }),
      ]),
    );
    expect(match.unchanged).toHaveLength(1);
    expect(match.canonicalKeyReassignments).toHaveLength(1);
    expect(match.canonicalKeyReassignments[0].previousSourceSkus).toEqual([
      "OLD-1",
    ]);
    expect(match.canonicalKeyReassignments[0].nextSourceSkus).toEqual(["NEW-9"]);
  });
});

describe("determinism", () => {
  it("produces the same result on repeated runs", () => {
    const current = revision("current", [
      row({ sheetRow: 2, productName: "One", sourceSku: "A-1" }),
      row({ sheetRow: 3, productName: "Two", sourceSku: "A-2" }),
      row({ sheetRow: 4, productName: "Three", sourceSku: "A-3" }),
    ]);
    const candidate = revision("candidate", [
      row({ sheetRow: 2, productName: "One Renamed", sourceSku: "A-1" }),
      row({ sheetRow: 3, productName: "Two", sourceSku: "A-2" }),
      row({ sheetRow: 4, productName: "Four", sourceSku: "A-4" }),
    ]);
    const first = matchCatalogRevisions(current, candidate);
    const second = matchCatalogRevisions(current, candidate);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
