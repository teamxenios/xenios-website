import { describe, expect, it } from "vitest";
import { findPeptideMediaPlanEntry } from "./variant-media-plan";
import { renderPeptideReviewSvg, reviewFilename } from "./render-svg";

describe("deterministic peptide SVG labels", () => {
  it("writes exact variant text over the neutral base and never claims supplier photography", () => {
    const entry = findPeptideMediaPlanEntry("R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL");
    expect(entry).not.toBeNull();
    const svg = renderPeptideReviewSvg(entry!);
    expect(svg).toContain("Thymosin Alpha-1 + KPV + LL-37 Research Blend");
    expect(svg).toContain("5 mg / 5 mg / 5 mg");
    expect(svg).toContain("R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL");
    expect(svg).toContain("Thymosin Alpha-1 + KPV +</text>");
    expect(svg).toContain("LL-37 Research Blend</text>");
    expect(svg).toContain('class="sku">R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL</text>');
    expect(svg).toContain('data-provenance="generated_product_render"');
    expect(svg).toContain("NOT APPROVED FOR PUBLICATION");
    expect(svg).not.toMatch(/supplier[_ ]photograph|\bCOA\b|purity|sterility|endotoxin|LOT \{|EXP \{/i);
  });

  it("keeps Raw Peptides output internal and rights-pending", () => {
    const entry = findPeptideMediaPlanEntry("RAW-011")!;
    const svg = renderPeptideReviewSvg(entry);
    expect(svg).toContain("RAW PEPTIDES  /  INTERNAL EVIDENCE");
    expect(svg).toContain("RIGHTS REVIEW PENDING  •  INTERNAL ONLY");
    expect(reviewFilename(entry)).toBe("rawpeptides-raw-011-v1.svg");
  });

  it("escapes hostile XML instead of allowing label markup", () => {
    const entry = { ...findPeptideMediaPlanEntry("RAW-001")!, productName: "A < B & C" };
    const svg = renderPeptideReviewSvg(entry);
    expect(svg).toContain("A &lt; B &amp; C");
    expect(svg).not.toContain("A < B & C");
  });
});
