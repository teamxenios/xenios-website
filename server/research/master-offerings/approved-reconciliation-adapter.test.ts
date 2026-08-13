import { describe, expect, it } from "vitest";
import {
  compileApprovedMasterOfferingReconciliation,
  type MasterOfferingReconciliationEnvelope,
} from "./approved-reconciliation-adapter";
import type { ExistingCatalogIdentity } from "./reconciliation";
import { offering } from "./test-fixtures";

const existing: ExistingCatalogIdentity = {
  source: "current_catalog",
  productId: "product_1",
  variantId: null,
  canonicalKey: "research_vials|bpc 157",
  family: "research_vials",
  displayName: "BPC-157",
};

function envelope(
  approval: MasterOfferingReconciliationEnvelope["approval"] = "approved",
): MasterOfferingReconciliationEnvelope {
  const decision = {
    planningOfferingId: "mo_test_product",
    disposition: "bind_existing_product" as const,
    existingSource: "current_catalog",
    existingProductId: "product_1",
    existingVariantId: null,
    targetPlanningOfferingId: null,
    reviewedBy: "catalog-reviewer@example.com",
    reviewedAt: "2026-08-11T18:00:00.000Z",
    reason: "Approved exact catalog identity.",
  };
  if (approval !== "approved") return { approval, decision };
  return {
    approval,
    approvedBy: "founder@example.com",
    approvedAt: "2026-08-11T18:30:00.000Z",
    sourceDigest: "a".repeat(64),
    decision,
  };
}

describe("approved reconciliation adapter", () => {
  it("refuses recommendations so the current 31 rows remain unapplied", () => {
    const result = compileApprovedMasterOfferingReconciliation(
      [offering()],
      [existing],
      [envelope("recommended")],
    );
    expect(result).toEqual({
      ok: false,
      code: "unapproved_decision",
      issues: [],
    });
  });

  it("compiles approval evidence into a read-only identity plan", () => {
    const result = compileApprovedMasterOfferingReconciliation(
      [offering()],
      [existing],
      [envelope()],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolutions).toEqual([
      expect.objectContaining({
        planningOfferingId: "mo_test_product",
        disposition: "bind_existing_product",
        existingIdentity: existing,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("amountCents");
    expect(JSON.stringify(result)).not.toContain("purchasable");
    expect(JSON.stringify(result)).not.toContain("commerceBinding");
  });
});
