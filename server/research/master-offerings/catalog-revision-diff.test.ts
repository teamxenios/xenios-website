/**
 * The five-mutation proof, on a hermetic catalog.
 *
 * A workbook swap does five things and only five things matter: a product is
 * renamed, a variant label is edited, a product arrives, a product leaves, and
 * an availability changes. This file makes all five happen at once, through the
 * real normalizer, and asserts that the reconciliation tells them apart. The
 * same five are proved again against the real 1,236-row workbook in
 * catalog-revision-real-workbook.test.ts when that private intake is present.
 */

import { describe, expect, it } from "vitest";
import {
  catalogRevisionFromGeneratedArtifact,
  catalogRevisionFromNormalized,
} from "./catalog-revision";
import { buildCatalogRevisionDiff, idContinuityMap } from "./catalog-revision-diff";
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

const CURRENT_ROWS: readonly RawMasterOfferingRow[] = [
  row({ sheetRow: 2, productName: "Alpha Peptide Research Material", sourceSku: "SYN-001", variantOrFormat: "5 mg" }),
  row({ sheetRow: 3, productName: "Alpha Peptide Research Material", sourceSku: "SYN-001", variantOrFormat: "10 mg" }),
  row({ sheetRow: 4, productName: "Beta Peptide Research Material", sourceSku: "SYN-002" }),
  row({ sheetRow: 5, productName: "Gamma Peptide Research Material", sourceSku: "SYN-003" }),
  row({ sheetRow: 6, productName: "Delta Peptide Research Material", sourceSku: "SYN-004" }),
];

const AVAILABLE_DELTA: RawEarlyAccessRow = {
  sheetRow: 2,
  catalogSection: "Available now",
  productName: "Delta Peptide",
  variantOrFormat: "5 mg",
  status: "Available",
  researchCategory: "Research",
  notes: "",
};

/** The candidate workbook: all five mutations applied at once. */
const CANDIDATE_ROWS: readonly RawMasterOfferingRow[] = [
  row({ sheetRow: 2, productName: "Alpha Peptide Research Material", sourceSku: "SYN-001", variantOrFormat: "5 mg" }),
  // 2. a variant label is edited
  row({ sheetRow: 3, productName: "Alpha Peptide Research Material", sourceSku: "SYN-001", variantOrFormat: "10 mg vial" }),
  // 1. a product is renamed, keeping its workbook source ID
  row({ sheetRow: 4, productName: "Beta Peptide Renamed Research Material", sourceSku: "SYN-002" }),
  // 4. Gamma is gone
  row({ sheetRow: 6, productName: "Delta Peptide Research Material", sourceSku: "SYN-004" }),
  // 3. a product arrives
  row({ sheetRow: 7, productName: "Epsilon Peptide Research Material", sourceSku: "SYN-005" }),
];

// 5. an availability changes
const HELD_DELTA: RawEarlyAccessRow = { ...AVAILABLE_DELTA, status: "Held" };

function revision(
  label: string,
  rows: readonly RawMasterOfferingRow[],
  earlyAccess: readonly RawEarlyAccessRow[],
) {
  return catalogRevisionFromNormalized({
    label,
    sourceWorkbookSha256: `${label}-sha`,
    catalog: normalizeMasterOfferings(rows, earlyAccess),
  });
}

const current = revision("current", CURRENT_ROWS, [AVAILABLE_DELTA]);
const candidate = revision("candidate", CANDIDATE_ROWS, [HELD_DELTA]);
const diff = buildCatalogRevisionDiff(current, candidate, {
  generatedAt: "2026-08-13T00:00:00.000Z",
});

describe("the five mutations of a catalog swap", () => {
  it("counts the two revisions the way the normalizer does", () => {
    expect(diff.current.offerings).toBe(4);
    expect(diff.candidate.offerings).toBe(4);
    expect(diff.current.variants).toBe(5);
    expect(diff.candidate.variants).toBe(5);
  });

  it("1. classifies a rename as a rename and preserves the offering id", () => {
    expect(diff.renamed).toHaveLength(1);
    const rename = diff.renamed[0];
    expect(rename.previousName).toBe("Beta Peptide");
    expect(rename.nextName).toBe("Beta Peptide Renamed");
    expect(rename.confidence).toBe("certain");
    expect(rename.previousId).not.toBe(rename.nextId);
    expect(rename.evidence.map((entry) => entry.kind)).toContain(
      "source_sku_set_identical",
    );
    // The rename is never reported as a removal plus an addition.
    expect(diff.retired.map((offering) => offering.displayName)).not.toContain(
      "Beta Peptide",
    );
    expect(diff.added.map((offering) => offering.displayName)).not.toContain(
      "Beta Peptide Renamed",
    );
  });

  it("1b. carries every variant id under a renamed offering", () => {
    const beta = diff.renamed[0];
    const carried = diff.idContinuity.filter(
      (entry) => entry.kind === "variant" && entry.offeringId === beta.nextId,
    );
    expect(carried).toHaveLength(1);
    expect(carried[0].idChanged).toBe(true);
    expect(carried[0].confidence).toBe("certain");
    expect(carried[0].evidence.map((entry) => entry.kind)).toContain(
      "normalized_label_identical",
    );
  });

  it("2. classifies a variant label edit as the same variant, not a swap", () => {
    const alpha = diff.idContinuity.find(
      (entry) => entry.kind === "offering" && entry.name === "Alpha Peptide",
    );
    expect(alpha?.idChanged).toBe(false);
    const edited = diff.idContinuity.find(
      (entry) => entry.name === "Alpha Peptide / 10 mg vial",
    );
    expect(edited).toBeDefined();
    expect(edited?.idChanged).toBe(true);
    expect(edited?.confidence).toBe("certain");
    expect(edited?.evidence.map((entry) => entry.kind)).toEqual([
      "sole_residual_variant",
      "compatible_quantity",
    ]);
    expect(diff.summary.variantsGained).toBe(0);
    expect(diff.summary.variantsLost).toBe(0);
  });

  it("3. reports the new product as added", () => {
    expect(diff.added.map((offering) => offering.displayName)).toEqual([
      "Epsilon Peptide",
    ]);
    expect(diff.added[0].sourceSkus).toEqual(["SYN-005"]);
  });

  it("4. reports the missing product as retired, never deleted silently", () => {
    expect(diff.retired.map((offering) => offering.displayName)).toEqual([
      "Gamma Peptide",
    ]);
    // Retirement keeps the evidence a human needs to find what is now orphaned.
    expect(diff.retired[0].variantIds).toHaveLength(1);
    expect(diff.retired[0].sourceSkus).toEqual(["SYN-003"]);
    expect(
      diff.humanAttention.some((note) => note.includes("retired by this swap")),
    ).toBe(true);
  });

  it("5. reports the availability change at both levels", () => {
    expect(diff.displayStateTransitions).toEqual([
      {
        kind: "offering",
        offeringId: expect.any(String),
        name: "Delta Peptide",
        previous: "available_now",
        next: "temporarily_unavailable",
      },
      {
        kind: "variant",
        offeringId: expect.any(String),
        name: "Delta Peptide / 5 mg",
        previous: "available_now",
        next: "temporarily_unavailable",
      },
    ]);
  });

  it("merges nothing it is not certain about", () => {
    expect(diff.review).toEqual([]);
    expect(diff.summary.offeringIdsPreserved).toBe(1);
    expect(diff.summary.variantIdsPreserved).toBe(2);
    const applied = idContinuityMap(diff);
    expect(Object.keys(applied)).toHaveLength(3);
    for (const [previousId, nextId] of Object.entries(applied)) {
      expect(previousId).not.toBe(nextId);
    }
  });
});

describe("product control state", () => {
  it("says plainly that no binding was checked when none was supplied", () => {
    expect(diff.bindingRisk).toEqual([]);
    expect(
      diff.humanAttention.some((note) =>
        note.includes("No Product Control binding inventory was supplied"),
      ),
    ).toBe(true);
  });

  it("tells an operator exactly where each binding lands", () => {
    const alphaEdited = current.offerings
      .find((offering) => offering.displayName === "Alpha Peptide")
      ?.variants.find((variant) => variant.label === "10 mg");
    const gamma = current.offerings.find(
      (offering) => offering.displayName === "Gamma Peptide",
    );
    const delta = current.offerings.find(
      (offering) => offering.displayName === "Delta Peptide",
    );
    const withBindings = buildCatalogRevisionDiff(current, candidate, {
      generatedAt: "2026-08-13T00:00:00.000Z",
      bindings: [
        {
          offeringVariantId: alphaEdited?.id ?? "",
          productId: "pc_alpha",
          variantId: "pcv_alpha_10",
        },
        {
          offeringVariantId: gamma?.variants[0].id ?? "",
          productId: "pc_gamma",
          variantId: "pcv_gamma_5",
        },
        {
          offeringVariantId: delta?.variants[0].id ?? "",
          productId: "pc_delta",
          variantId: "pcv_delta_5",
        },
        {
          offeringVariantId: "mov_neverexisted",
          productId: "pc_ghost",
          variantId: "pcv_ghost",
        },
      ],
    });
    const outcomes = Object.fromEntries(
      withBindings.bindingRisk.map((item) => [item.productId, item.outcome]),
    );
    expect(outcomes).toEqual({
      pc_alpha: "id_moved_continuity_available",
      pc_gamma: "offering_retired",
      pc_delta: "unchanged",
      pc_ghost: "unknown_to_current_catalog",
    });
    const moved = withBindings.bindingRisk.find(
      (item) => item.productId === "pc_alpha",
    );
    expect(moved?.replacementOfferingVariantId).toBeTruthy();
    expect(moved?.replacementOfferingVariantId).not.toBe(
      moved?.offeringVariantId,
    );
    const retired = withBindings.bindingRisk.find(
      (item) => item.productId === "pc_gamma",
    );
    // The consequence is stated, not implied.
    expect(retired?.note).toContain("closes this catalog action path");
    expect(retired?.note).toContain(
      "does not itself revoke durable mutation authority",
    );
    expect(withBindings.summary.bindingsAtRisk).toBe(3);
  });
});

describe("a generated artifact as the current side", () => {
  const artifact = {
    schemaVersion: 1,
    generatedAt: "2026-08-13T00:00:00.000Z",
    sourceWorkbookSha256: "a".repeat(64),
    canonicalProductCount: current.offerings.length,
    variantCount: current.offerings.reduce(
      (sum, offering) => sum + offering.variants.length,
      0,
    ),
    invariants: {
      containsSupplierIdentity: false,
      containsWholesaleCost: false,
      containsPlanningPrice: false,
      containsMargin: false,
      containsInternalNotes: false,
      containsProviderNames: false,
      planningRowCanBecomePurchasable: false,
    },
    products: current.offerings.map((offering) => ({
      id: offering.id,
      slug: offering.slug,
      displayName: offering.displayName,
      canonicalName: offering.displayName,
      family: offering.family,
      category: offering.category,
      subcategory: offering.subcategory,
      brand: offering.brand,
      aliases: offering.aliases,
      displayState: offering.displayState,
      stateExplanation: "",
      copyState: "needs_review",
      variants: offering.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        displayState: variant.displayState,
      })),
    })),
  };

  it("refuses to claim a rename it cannot see, and says why", () => {
    const degraded = catalogRevisionFromGeneratedArtifact({
      label: "current",
      parsed: artifact,
    });
    const degradedDiff = buildCatalogRevisionDiff(degraded, candidate, {
      generatedAt: "2026-08-13T00:00:00.000Z",
    });
    expect(degradedDiff.confidenceCeiling).toBe("high");
    // The rename is still visible, but only as a proposal.
    expect(degradedDiff.renamed).toEqual([]);
    expect(degradedDiff.retired.map((offering) => offering.displayName)).toContain(
      "Beta Peptide",
    );
    expect(
      degradedDiff.review.some(
        (item) =>
          item.previousName === "Beta Peptide" &&
          item.nextName === "Beta Peptide Renamed",
      ),
    ).toBe(true);
    expect(idContinuityMap(degradedDiff)).not.toHaveProperty(
      current.offerings.find(
        (offering) => offering.displayName === "Beta Peptide",
      )?.id ?? "",
    );
    expect(degradedDiff.limitations[0]).toContain(
      "carries no workbook source ID",
    );
  });
});
