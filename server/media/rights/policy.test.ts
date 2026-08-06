import { describe, expect, it } from "vitest";
import {
  deriveApprovalState,
  mayLinkPublicAsset,
  rightsAllowPublication,
  validateRightsEvidence,
} from "./policy";

const approvedRights = {
  status: "SUPPLIER_PROVIDED_APPROVED" as const,
  evidenceReference: "supplier-agreement://momentous/2026-01",
  grantedBy: "Momentous wholesale media team",
  permissionDate: "2026-01-15",
  expiresAt: null,
  limitations: "Exact current product packaging only",
};
const at = "2026-08-02T00:00:00.000Z";

describe("supplement media rights policy", () => {
  it("keeps public official pages rights-pending", () => {
    const pending = { ...approvedRights, status: "OFFICIAL_SOURCE_RIGHTS_PENDING" as const };
    expect(rightsAllowPublication(pending, at)).toBe(false);
    expect(
      deriveApprovalState("EXACT_MATCH", pending, at),
    ).toBe("RIGHTS_PENDING");
  });

  it("rejects bare approved states, expired evidence, and publication-prohibiting limitations", () => {
    expect(validateRightsEvidence({
      status: "WRITTEN_PERMISSION_APPROVED",
      evidenceReference: null,
      grantedBy: null,
      permissionDate: null,
      expiresAt: null,
      limitations: null,
    }, at).valid).toBe(false);
    expect(validateRightsEvidence({
      ...approvedRights,
      expiresAt: "2026-08-01",
    }, at).valid).toBe(false);
    expect(validateRightsEvidence({
      ...approvedRights,
      limitations: "Internal review only; do not publish",
    }, at).valid).toBe(false);
  });

  it("requires approval, exact match, provenance, and approved rights to link", () => {
    expect(
      mayLinkPublicAsset({
        approvalStatus: "APPROVED",
        rights: approvedRights,
        matchState: "EXACT_MATCH",
        exactVariantId: "variant-1",
        sourceUrl: "https://brand.example/product",
        at,
      }),
    ).toBe(true);
    expect(
      mayLinkPublicAsset({
        approvalStatus: "APPROVED",
        rights: { ...approvedRights, status: "OFFICIAL_SOURCE_RIGHTS_PENDING" },
        matchState: "EXACT_MATCH",
        exactVariantId: "variant-1",
        sourceUrl: "https://brand.example/product",
        at,
      }),
    ).toBe(false);
  });
});
