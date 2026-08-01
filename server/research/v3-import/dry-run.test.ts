import { describe, expect, it } from "vitest";

import { V3_READINESS_STATES } from "@shared/research/v3-import";
import { buildV3DryRunReport, renderV3DryRunMarkdown } from "./dry-run";
import { importV3Master } from "./import";
import {
  V3_SHEET_IMAGE_MANIFEST,
  V3_SHEET_OFFER_INDEX,
  V3_SHEET_PEPTIDE_MASTER,
  V3_SHEET_PRICE_BOOK,
  type V3Cell,
} from "./workbook";

const SUPPLIER = "Confidential Supplier Holdings";
const WHOLESALE_DOLLARS = 137.31;

function sheetOf(name: string, header: readonly string[], data: V3Cell[][]) {
  return {
    name,
    rows: [["title"], ["subtitle"], Array.from(header), ...data] as V3Cell[][],
  };
}

function mixedWorkbook() {
  return {
    offerIndex: sheetOf(
      V3_SHEET_OFFER_INDEX,
      ["Category", "ID / SKU", "Product / Service", "Variant / Format", "Access / Status", "Brand / Rail"],
      [
        ["Supplements", "SUP-1", "Sourced Supplement", "60 capsules", "Planning", "Brand"],
        ["Supplements", "SUP-2", "Pending Supplement", "30 capsules", "Planning", "Brand"],
        ["Supplements", "SUP-3", "Unavailable Supplement", "90 capsules", "Unavailable", "Brand"],
        ["Peptides & Research", "PEX-002", "TB-500", "10 mg", "Request access", "Recovery & Repair"],
        // No offer id: a rejection.
        ["Supplements", "-", "Nameless", "60 capsules", "Planning", "Brand"],
      ],
    ),
    priceBook: sheetOf(
      V3_SHEET_PRICE_BOOK,
      [
        "Category",
        "Subcategory / Brand",
        "ID / SKU",
        "Product / Service",
        "Variant / Format",
        "Primary Supplier / Delivery Owner",
        "Wholesale / Delivery Cost",
        "Wholesale Status",
        "Recommended Sell Price",
        "Access / Offer State",
        "Explanation / Commercial Basis",
      ],
      [
        ["Supplements", "Brand", "SUP-1", "Sourced Supplement", "60 capsules", SUPPLIER, WHOLESALE_DOLLARS, "Known from uploaded wholesale workbook", 400, null, "basis"],
        ["Supplements", "Brand", "SUP-2", "Pending Supplement", "30 capsules", SUPPLIER, null, "Pending brand wholesale", 40, null, "basis"],
        ["Supplements", "Brand", "SUP-3", "Unavailable Supplement", "90 capsules", SUPPLIER, null, "Pending brand wholesale", 60, null, "basis"],
        ["Peptides & Research", "Recovery & Repair", "PEX-002", "TB-500", "10 mg", SUPPLIER, null, "Pending", 120, null, "basis"],
        // A commercial row no offer covers.
        ["Supplements", "Brand", "SUP-99", "Uncovered", "60 capsules", SUPPLIER, null, "Pending", 20, null, "basis"],
      ],
    ),
    imageManifest: sheetOf(
      V3_SHEET_IMAGE_MANIFEST,
      ["Image ID", "Category", "SKU", "Product / Service", "Variant", "File Path", "Status"],
      [["IMG-1", "Supplements", "SUP-1", "Sourced Supplement", "60 capsules", null, "Needed"]],
    ),
    peptideMaster: sheetOf(
      V3_SHEET_PEPTIDE_MASTER,
      ["Product Code", "Variant SKU", "Strength"],
      [["PEX-002", "R360-TB500-10MG-VIAL", "10 mg"]],
    ),
  };
}

const SOURCE = {
  fileName: "XENIOS_RESEARCH_COMPLETE_MASTER_2026-08-01_V3.xlsx",
  sha256: "e2f7a8e1a59fbda8e01af1fc090112b8b51cc20bf30a890bab53c1d38dbc7f47",
  generatedAt: "2026-08-01",
};

describe("the dry-run report", () => {
  it("counts what the import actually produced", () => {
    const result = importV3Master(mixedWorkbook());
    const report = buildV3DryRunReport(result);

    expect(report.sourceRowCount).toBe(5);
    expect(report.accepted).toBe(4);
    expect(report.rejected).toBe(1);
    expect(report.accepted + report.rejected).toBe(report.sourceRowCount);
    expect(report.priceBookRowsWithoutOffer).toBe(1);
    expect(report.wholesaleKnown).toBe(1);
    expect(report.wholesalePending).toBe(3);
    expect(report.wholesaleKnown + report.wholesalePending).toBe(report.accepted);
  });

  it("reports zero activated and zero approved for an import", () => {
    const report = buildV3DryRunReport(importV3Master(mixedWorkbook()));
    expect(report.purchasable).toBe(0);
    expect(report.withApprovedPrice).toBe(0);
    const active = report.byReadiness.find((row) => row.state === "active_public");
    expect(active?.count).toBe(0);
  });

  it("has readiness counts that sum to the accepted rows", () => {
    const report = buildV3DryRunReport(importV3Master(mixedWorkbook()));
    const total = report.byReadiness.reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(report.accepted);
    expect(report.byReadiness.map((row) => row.state)).toEqual(
      Array.from(V3_READINESS_STATES),
    );
  });

  it("has category counts that sum to the accepted rows", () => {
    const report = buildV3DryRunReport(importV3Master(mixedWorkbook()));
    const total = report.byCategory.reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(report.accepted);
  });

  it("renders no cost, supplier, or margin into the markdown", () => {
    const markdown = renderV3DryRunMarkdown(
      buildV3DryRunReport(importV3Master(mixedWorkbook())),
      SOURCE,
    );
    expect(markdown).not.toContain(SUPPLIER);
    expect(markdown).not.toContain(String(WHOLESALE_DOLLARS));
    expect(markdown).not.toContain("13731");
    expect(markdown.toLowerCase()).not.toContain("gross margin");
  });

  it("names the exact source file and hash it was produced from", () => {
    const markdown = renderV3DryRunMarkdown(
      buildV3DryRunReport(importV3Master(mixedWorkbook())),
      SOURCE,
    );
    expect(markdown).toContain(SOURCE.fileName);
    expect(markdown).toContain(SOURCE.sha256);
    expect(markdown).toContain("This is a dry run.");
  });

  it("lists every readiness state, including the ones nothing reaches", () => {
    const markdown = renderV3DryRunMarkdown(
      buildV3DryRunReport(importV3Master(mixedWorkbook())),
      SOURCE,
    );
    for (const state of V3_READINESS_STATES) {
      expect(markdown).toContain(`| ${state} |`);
    }
  });
});
