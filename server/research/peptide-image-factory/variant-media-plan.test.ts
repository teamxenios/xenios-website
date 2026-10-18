import { describe, expect, it } from "vitest";
import { validatePeptideMediaPlanEntry } from "./contracts";
import { PEPTIDE_MEDIA_PLAN } from "./variant-media-plan";

describe("source-bound peptide media plan", () => {
  it("covers all 86 exact workbook rows once with intentional non-checkout image states", () => {
    expect(PEPTIDE_MEDIA_PLAN).toHaveLength(86);
    expect(new Set(PEPTIDE_MEDIA_PLAN.map((entry) => entry.sku)).size).toBe(86);
    expect(PEPTIDE_MEDIA_PLAN.flatMap(validatePeptideMediaPlanEntry)).toEqual([]);
    expect(PEPTIDE_MEDIA_PLAN.filter((entry) => entry.visualState === "approved_exact_variant")).toEqual([]);
    expect(PEPTIDE_MEDIA_PLAN.filter((entry) => entry.visualState === "unavailable")).toHaveLength(18);
  });

  it("reconciles workbook presentation, action, and template counts", () => {
    const count = (field: "container" | "sourceAction" | "template", value: string) =>
      PEPTIDE_MEDIA_PLAN.filter((entry) => entry[field] === value).length;
    expect(count("container", "vial")).toBe(69);
    expect(count("container", "capsule_bottle")).toBe(2);
    expect(count("container", "sterile_solution")).toBe(3);
    expect(count("container", "source_vial")).toBe(12);
    expect(count("sourceAction", "HELD_PENDING_GATES")).toBe(16);
    expect(count("sourceAction", "REQUEST_ACCESS")).toBe(52);
    expect(count("sourceAction", "UNAVAILABLE")).toBe(18);
    expect(count("template", "raw_peptides_internal")).toBe(12);
  });

  it("contains no commercial or supplier authority fields", () => {
    const serialized = JSON.stringify(PEPTIDE_MEDIA_PLAN);
    for (const forbidden of ["price", "wholesale", "supplier", "inventory", "lot", "coa", "purity"]) {
      expect(serialized.toLowerCase()).not.toContain(`\"${forbidden}`);
    }
  });
});
