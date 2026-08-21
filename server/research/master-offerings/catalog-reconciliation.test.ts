// The reviewed reconciliation layer, and the ways it must refuse.
//
// A reconciliation that silently no-ops is worse than not having one: the
// numbers keep being quoted in release packets after they stop being true.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCatalogReconciliation,
  assertReconciledAccounting,
  CatalogReconciliationError,
  type CatalogReconciliation,
} from "./catalog-reconciliation";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const ARTIFACT = path.join(
  REPO_ROOT,
  "config",
  "research",
  "master-catalog-reconciliation-20260821.json",
);

function reviewed(): CatalogReconciliation {
  return JSON.parse(fs.readFileSync(ARTIFACT, "utf8"));
}

function row(groupId: string, extra: Record<string, unknown> = {}) {
  return { "Group ID": groupId, sheetRow: 1, ...extra };
}

/** The four rows the reviewed artifact actually names, plus a bystander. */
function workbookRows() {
  return [
    row("GRP-0402", { Family: "Research Peptides & Materials", Channel: "Supplier Catalog / Classification Pending" }),
    row("GRP-0426", { Family: "Research Peptides & Materials", Channel: "RUO Research" }),
    row("GRP-0407", { Family: "Research Peptides & Materials", Channel: "Supplier Catalog / Classification Pending" }),
    row("GRP-0425", { Family: "Research Peptides & Materials", Channel: "RUO Research" }),
    row("GRP-0422", { Family: "Research Peptides & Materials", Channel: "RUO Research" }),
    row("GRP-0001", { Family: "503A Clinical Formulations", Channel: "Clinical / Provider Only" }),
  ];
}

describe("the reviewed catalog reconciliation", () => {
  it("keeps the workbook whole and only changes which rows are canonical", () => {
    const rows = workbookRows();
    const { rows: kept, provenance } = applyCatalogReconciliation(rows, reviewed());

    expect(provenance.sourceRowCount).toBe(6);
    expect(provenance.canonicalRowCount).toBe(4);
    // The superseded rows are gone from the CANONICAL set...
    const ids = kept.map((r) => r["Group ID"]);
    expect(ids).not.toContain("GRP-0402");
    expect(ids).not.toContain("GRP-0407");
    // ...and the input array is untouched, because it is the evidence.
    expect(rows).toHaveLength(6);
  });

  it("does not rewrite the surviving row's values", () => {
    // The artifact records what the canonical answer should be so a human can
    // read it, but the row that survives is the workbook's own, unedited.
    const { rows: kept } = applyCatalogReconciliation(workbookRows(), reviewed());
    const hexarelin = kept.find((r) => r["Group ID"] === "GRP-0426");
    expect(hexarelin?.Channel).toBe("RUO Research");
  });

  it("keeps provenance back to every source row that produced a product", () => {
    const { provenance } = applyCatalogReconciliation(workbookRows(), reviewed());
    expect(provenance.sourceRowsByCanonical.get("GRP-0426")).toEqual([
      "GRP-0426",
      "GRP-0402",
    ]);
    expect(provenance.sourceRowsByCanonical.get("GRP-0425")).toEqual([
      "GRP-0425",
      "GRP-0407",
    ]);
  });

  it("records the formulation hold without touching the row's classification", () => {
    const { rows: kept, provenance } = applyCatalogReconciliation(
      workbookRows(),
      reviewed(),
    );
    expect(provenance.commerceHeldRows.has("GRP-0422")).toBe(true);
    // Still present, still RUO in the source. The hold is a separate fact, so
    // "classification confirmed" and "formulation unresolved" stay distinct.
    const cjc = kept.find((r) => r["Group ID"] === "GRP-0422");
    expect(cjc).toBeTruthy();
    expect(cjc?.Channel).toBe("RUO Research");
  });

  it("REFUSES a merge whose kept row is gone", () => {
    const rows = workbookRows().filter((r) => r["Group ID"] !== "GRP-0426");
    expect(() => applyCatalogReconciliation(rows, reviewed())).toThrow(
      CatalogReconciliationError,
    );
  });

  it("REFUSES a merge whose superseded row is already absent", () => {
    // The tempting behaviour is to shrug: the row is gone, the merge is
    // satisfied. But it means the workbook changed under a reviewed decision,
    // and nobody has looked at whether the decision still holds.
    const rows = workbookRows().filter((r) => r["Group ID"] !== "GRP-0402");
    expect(() => applyCatalogReconciliation(rows, reviewed())).toThrow(
      /GRP-0402/,
    );
  });

  it("REFUSES a hold that matches nothing", () => {
    // The dangerous direction: a hold that silently matches no row would put a
    // formulation-unresolved product on sale.
    const rows = workbookRows().filter((r) => r["Group ID"] !== "GRP-0422");
    expect(() => applyCatalogReconciliation(rows, reviewed())).toThrow(
      /GRP-0422/,
    );
  });

  it("REFUSES accounting that has drifted from the reviewed numbers", () => {
    expect(() =>
      assertReconciledAccounting(reviewed(), {
        sourceRows: 426,
        canonicalVariants: 424,
        peptideDirect: 110,
      }),
    ).toThrow(/peptideDirect: expected 111, got 110/);
  });

  it("accepts the accounting the real workbook actually produces", () => {
    // Measured 2026-08-21 by running the real export over the founder's
    // workbook: 426 source rows in, 424 canonical variants out.
    expect(() =>
      assertReconciledAccounting(reviewed(), {
        sourceRows: 426,
        canonicalVariants: 424,
        peptideSourceRows: 141,
        peptideCanonicalVariants: 139,
        peptideDirect: 111,
        peptideFormulationBlocked: 1,
        peptidePendingUnique: 27,
      }),
    ).not.toThrow();
  });

  it("pins the reviewed artifact's own headline numbers", () => {
    const artifact = reviewed();
    expect(artifact.expected.canonicalVariants).toBe(424);
    expect(artifact.expected.peptideCanonicalVariants).toBe(139);
    expect(artifact.expected.peptideDirect).toBe(111);
    expect(artifact.expected.peptideFormulationBlocked).toBe(1);
    expect(artifact.expected.peptidePendingUnique).toBe(27);
    // Source rows and canonical variants are different ideas and must never be
    // quoted interchangeably again.
    expect(artifact.expected.sourceRows).not.toBe(
      artifact.expected.canonicalVariants,
    );
    // Every decision names the workbook it was reviewed against.
    expect(artifact.sourceWorkbook.sha256).toHaveLength(64);
  });
});
