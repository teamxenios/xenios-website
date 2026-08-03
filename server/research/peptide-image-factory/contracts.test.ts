import { describe, expect, it } from "vitest";
import {
  defaultVisualState,
  normalizeContainer,
  templateForVariant,
  validatePeptideMediaPlanEntry,
} from "./contracts";
import { PEPTIDE_MEDIA_PLAN } from "./variant-media-plan";

describe("peptide image factory contracts", () => {
  it("maps exact presentations and namespaces deterministically", () => {
    expect(normalizeContainer("Vial")).toBe("vial");
    expect(normalizeContainer("Capsule bottle")).toBe("capsule_bottle");
    expect(normalizeContainer("Sterile solution")).toBe("sterile_solution");
    expect(normalizeContainer("Vial / source presentation")).toBe("source_vial");
    expect(templateForVariant("RAW-001")).toBe("raw_peptides_internal");
    expect(templateForVariant("R360-PT141-10MG-VIAL")).toBe("renew_360");
    expect(defaultVisualState("UNAVAILABLE")).toBe("unavailable");
  });

  it("accepts every source-bound plan row and rejects identity/template drift", () => {
    expect(PEPTIDE_MEDIA_PLAN.flatMap(validatePeptideMediaPlanEntry)).toEqual([]);
    const source = PEPTIDE_MEDIA_PLAN[0];
    expect(validatePeptideMediaPlanEntry({ ...source, sku: "../../wrong" })).toContain(
      "sku is not a canonical identifier",
    );
    expect(validatePeptideMediaPlanEntry({ ...source, template: "raw_peptides_internal" })).toContain(
      "template does not match the exact variant namespace",
    );
    expect(validatePeptideMediaPlanEntry({ ...source, visualState: "approved_exact_variant" })).toContain(
      "source rows must enter the image factory in a held or unavailable state",
    );
  });
});
