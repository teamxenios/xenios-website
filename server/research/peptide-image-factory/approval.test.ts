import { describe, expect, it } from "vitest";
import { evaluatePeptideMediaApproval, type PeptideReviewAsset } from "./approval";
import { PEPTIDE_MEDIA_CONTEXTS } from "./contracts";
import { findPeptideMediaPlanEntry } from "./variant-media-plan";

function exactAsset(sku: string): PeptideReviewAsset {
  const plan = findPeptideMediaPlanEntry(sku)!;
  return {
    variantId: plan.variantId,
    sku: plan.sku,
    strength: plan.strength,
    presentation: plan.presentation,
    sourceWorkbookSha256: plan.sourceWorkbookSha256,
    sourceType: "xenios_generated_render",
    provenanceTag: "generated_product_render",
    renderedLabelText: `${plan.productName} | ${plan.strength} | ${plan.sku}`,
    contexts: PEPTIDE_MEDIA_CONTEXTS,
    transparent: true,
    rawPeptidesRightsEvidence: plan.template === "raw_peptides_internal" ? "rights-record-1" : null,
    approvedBy: "Independent media reviewer",
    approvedAt: "2026-08-02T23:00:00Z",
  };
}

describe("peptide media approval", () => {
  it("accepts only an exact, complete, independently approved generated render", () => {
    const plan = findPeptideMediaPlanEntry("R360-DIHEXA-10MGX60-CAP")!;
    expect(evaluatePeptideMediaApproval(plan, exactAsset(plan.sku))).toEqual({ approved: true });
  });

  it("fails closed on cross-strength reuse, missing context, claims, or approval", () => {
    const plan = findPeptideMediaPlanEntry("R360-TESAMORELIN-10MG-VIAL")!;
    const asset = exactAsset(plan.sku);
    const result = evaluatePeptideMediaApproval(plan, {
      ...asset,
      strength: "20 mg",
      contexts: ["catalog"],
      renderedLabelText: `${asset.renderedLabelText} purity 99%`,
      approvedBy: null,
    });
    expect(result.approved).toBe(false);
    if (!result.approved) {
      expect(result.reasons).toEqual(expect.arrayContaining([
        "strength does not match the exact planned variant",
        "detail presentation is missing",
        "cart presentation is missing",
        "label contains an unverified claim field",
        "named media approver is missing",
      ]));
    }
  });

  it("does not approve Raw Peptides imagery without rights evidence", () => {
    const plan = findPeptideMediaPlanEntry("RAW-011")!;
    const result = evaluatePeptideMediaApproval(plan, { ...exactAsset(plan.sku), rawPeptidesRightsEvidence: null });
    expect(result).toEqual({ approved: false, reasons: ["Raw Peptides rights evidence is not on file"] });
  });
});
