import { describe, expect, it } from "vitest";
import {
  canonicalKeyForMasterRow,
  displayStateForMasterRow,
  familyForMasterRow,
  normalizeMasterOfferings,
  normalizeOfferingText,
} from "./normalize";
import { rawMasterRow } from "./test-fixtures";

describe("master offerings normalization", () => {
  it("normalizes punctuation for forgiving BPC, NAD+, and Greek-name matching", () => {
    expect(normalizeOfferingText("BPC-157")).toBe("bpc 157");
    expect(normalizeOfferingText("NAD+")).toBe("nad plus");
    expect(normalizeOfferingText("Thymosin-α-1®")).toBe("thymosin alpha 1");
  });

  it("canonicalizes research framing without collapsing variants", () => {
    const five = rawMasterRow({ productName: "BPC-157 Research Material", variantOrFormat: "5 mg vial" });
    const ten = rawMasterRow({ sheetRow: 6, productName: "BPC-157", variantOrFormat: "10 mg vial" });
    expect(canonicalKeyForMasterRow(five)).toBe(canonicalKeyForMasterRow(ten));
    const catalog = normalizeMasterOfferings([five, ten], []);
    expect(catalog.products).toHaveLength(1);
    expect(catalog.products[0].variants.map((entry) => entry.label)).toEqual([
      "5 mg vial",
      "10 mg vial",
    ]);
  });

  it("uses Early Access only as a display-state overlay and never imports workbook money", () => {
    const row = rawMasterRow({
      updatedWholesaleCost: 25,
      updatedSellPrice: 62.5,
      recommendedLaunchSellPrice: 75,
    });
    const catalog = normalizeMasterOfferings(
      [row],
      [{
        sheetRow: 5,
        catalogSection: "Research",
        productName: "BPC-157",
        variantOrFormat: "10 mg vial",
        status: "Available",
        researchCategory: "Peptide",
        notes: "Available now",
      }],
    );
    const serialized = JSON.stringify(catalog.products[0]);
    expect(catalog.products[0].displayState).toBe("available_now");
    expect(serialized).not.toContain("62.5");
    expect(serialized).not.toContain("75");
    expect(serialized).not.toContain("Private supplier");
    expect(serialized).not.toContain("Private source note");
  });

  it("holds regulatory research products out of the member catalog", () => {
    const catalog = normalizeMasterOfferings([
      rawMasterRow({ productName: "Semaglutide Research Material" }),
      rawMasterRow({ sheetRow: 6, sourceSku: "PLAN-002", productName: "Tirzepatide Research Material" }),
      rawMasterRow({ sheetRow: 7, sourceSku: "PLAN-003", productName: "Retatrutide Research Material" }),
    ], []);
    expect(catalog.products).toHaveLength(0);
    expect(catalog.holds).toHaveLength(3);
    expect(catalog.holds.map((hold) => hold.displayName).sort()).toEqual([
      "Retatrutide",
      "Semaglutide",
      "Tirzepatide",
    ]);
  });

  it("suppresses provider and team names even in the admin hold projection", () => {
    const catalog = normalizeMasterOfferings([
      rawMasterRow({
        category: "Provider & Performance Network",
        brandOrSubcategory: "Named provider",
        productName: "Dr. Confidential Person",
        sourceAccessState: "Custom engagement",
      }),
    ], []);
    expect(catalog.products).toHaveLength(0);
    expect(catalog.holds).toEqual([
      expect.objectContaining({ displayName: null, family: "provider_network" }),
    ]);
    expect(JSON.stringify(catalog.holds)).not.toContain("Dr. Confidential Person");
  });

  it("reports duplicate rows, placeholder IDs, zero planning amounts, and unknown states", () => {
    const rows = [
      rawMasterRow({
        sourceSku: "-",
        originalSellPrice: 0,
        sourceAccessState: "A new unmapped state",
      }),
      rawMasterRow({
        sheetRow: 6,
        sourceSku: "PLAN-002",
        sourceAccessState: "Planning / source verification required",
      }),
    ];
    const codes = normalizeMasterOfferings(rows, []).issues.map((issue) => issue.code);
    expect(codes).toContain("placeholder_source_id");
    expect(codes).toContain("zero_planning_price");
    expect(codes).toContain("unknown_access_state");
    expect(codes).toContain("duplicate_source_row");
  });

  it("fails closed instead of quietly routing a new category into the wrong family", () => {
    const row = rawMasterRow({ category: "Unexpected New Category" });
    expect(() => familyForMasterRow(row)).toThrow(/Unsupported master offering category/);
    expect(() => normalizeMasterOfferings([row], [])).toThrow(/Unsupported master offering category/);
  });

  it("maps blank and closed access states deterministically", () => {
    const blank = rawMasterRow({ sourceAccessState: null });
    const map = new Map();
    expect(displayStateForMasterRow(blank, map)).toBe("planned");
    expect(displayStateForMasterRow(rawMasterRow({ sourceAccessState: "Request access" }), map)).toBe("request_access");
    expect(displayStateForMasterRow(rawMasterRow({ sourceAccessState: "Clinical/testing workflow" }), map)).toBe("care_pathway");
  });
});
