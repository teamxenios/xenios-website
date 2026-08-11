import { describe, expect, it } from "vitest";
import {
  buildMasterOfferingReconciliationCandidates,
  validateMasterOfferingReconciliationDecisions,
  type ExistingCatalogIdentity,
  type MasterOfferingReconciliationDecision,
} from "./reconciliation";
import { offering } from "./test-fixtures";

const existing: ExistingCatalogIdentity = {
  source: "current_catalog",
  productId: "product_1",
  variantId: null,
  canonicalKey: "research_vials|bpc 157",
  family: "research_vials",
  displayName: "BPC-157",
};

function decision(
  overrides: Partial<MasterOfferingReconciliationDecision> = {},
): MasterOfferingReconciliationDecision {
  return {
    planningOfferingId: "mo_test_product",
    disposition: "bind_existing_product",
    existingSource: existing.source,
    existingProductId: existing.productId,
    existingVariantId: existing.variantId,
    targetPlanningOfferingId: null,
    reviewedBy: "catalog-owner@example.com",
    reviewedAt: "2026-08-09T12:00:00.000Z",
    reason: "Exact reviewed canonical identity.",
    ...overrides,
  };
}

describe("master offering reconciliation", () => {
  it("suggests from exact canonical keys only and never applies a binding", () => {
    const exact = offering();
    const similarButNotExact = offering({
      id: "mo_similar",
      canonicalKey: "research_vials|bpc 157 spray",
      displayName: "BPC-157 Spray",
      slug: "research-vials-bpc-157-spray",
    });
    const candidates = buildMasterOfferingReconciliationCandidates(
      [exact, similarButNotExact],
      [existing],
    );
    const exactCandidate = candidates.find((entry) => entry.planningOfferingId === exact.id);
    const similarCandidate = candidates.find((entry) => entry.planningOfferingId === similarButNotExact.id);
    expect(exactCandidate?.exactMatches).toHaveLength(1);
    expect(exactCandidate?.suggestedDisposition).toBe("bind_existing_product");
    expect(exactCandidate?.requiresHumanReview).toBe(true);
    expect(similarCandidate?.exactMatches).toHaveLength(0);
    expect(similarCandidate?.suggestedDisposition).toBe("new_canonical_offering");
    expect(JSON.stringify(candidates)).not.toContain("amountCents");
    expect(JSON.stringify(candidates)).not.toContain("purchasable");
  });

  it("holds an exact key with multiple existing targets for human review", () => {
    const candidates = buildMasterOfferingReconciliationCandidates(
      [offering()],
      [existing, { ...existing, source: "second_registry", productId: "product_2" }],
    );
    expect(candidates[0].exactMatches).toHaveLength(2);
    expect(candidates[0].suggestedDisposition).toBe("hold_for_review");
  });

  it("accepts one complete reviewed exact binding decision", () => {
    expect(
      validateMasterOfferingReconciliationDecisions(
        [offering()],
        [existing],
        [decision()],
      ),
    ).toEqual({ ok: true, issues: [] });
  });

  it("rejects unknown targets, family mismatches, duplicate decisions, and incomplete review evidence", () => {
    const careTarget: ExistingCatalogIdentity = {
      ...existing,
      source: "care_registry",
      productId: "care_1",
      family: "clinician_guided_care",
    };
    const result = validateMasterOfferingReconciliationDecisions(
      [offering()],
      [existing, careTarget],
      [
        decision({
          existingSource: careTarget.source,
          existingProductId: careTarget.productId,
          reviewedBy: "",
          reviewedAt: "not-a-date",
          reason: "",
        }),
        decision({ existingProductId: "missing_product" }),
      ],
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "family_mismatch",
        "missing_reviewer",
        "invalid_reviewed_at",
        "missing_reason",
        "duplicate_decision",
        "unknown_existing_target",
      ]),
    );
  });

  it("requires a distinct valid planning target for duplicate merges", () => {
    const source = offering();
    const target = offering({
      id: "mo_target",
      canonicalKey: "research_vials|bpc 157 reviewed",
      slug: "research-vials-bpc-157-reviewed",
    });
    const valid = decision({
      disposition: "merge_duplicate_planning_rows",
      existingSource: null,
      existingProductId: null,
      existingVariantId: null,
      targetPlanningOfferingId: target.id,
    });
    expect(
      validateMasterOfferingReconciliationDecisions(
        [source, target],
        [],
        [valid],
      ).ok,
    ).toBe(true);
    expect(
      validateMasterOfferingReconciliationDecisions(
        [source, target],
        [],
        [{ ...valid, targetPlanningOfferingId: source.id }],
      ).issues.map((issue) => issue.code),
    ).toContain("self_merge");
  });
});
