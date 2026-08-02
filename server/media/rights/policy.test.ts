import { describe, expect, it } from "vitest";
import {
  deriveApprovalState,
  mayLinkPublicAsset,
  rightsAllowPublication,
} from "./policy";

describe("supplement media rights policy", () => {
  it("keeps public official pages rights-pending", () => {
    expect(rightsAllowPublication("OFFICIAL_SOURCE_RIGHTS_PENDING")).toBe(false);
    expect(
      deriveApprovalState("EXACT_MATCH", "OFFICIAL_SOURCE_RIGHTS_PENDING"),
    ).toBe("RIGHTS_PENDING");
  });

  it("requires approval, exact match, provenance, and approved rights to link", () => {
    expect(
      mayLinkPublicAsset({
        approvalStatus: "APPROVED",
        rightsStatus: "SUPPLIER_PROVIDED_APPROVED",
        matchState: "EXACT_MATCH",
        exactVariantId: "variant-1",
        sourceUrl: "https://brand.example/product",
      }),
    ).toBe(true);
    expect(
      mayLinkPublicAsset({
        approvalStatus: "APPROVED",
        rightsStatus: "OFFICIAL_SOURCE_RIGHTS_PENDING",
        matchState: "EXACT_MATCH",
        exactVariantId: "variant-1",
        sourceUrl: "https://brand.example/product",
      }),
    ).toBe(false);
  });
});
