import { describe, expect, it } from "vitest";
import type { SupplementMediaRecord } from "../official-sources/contracts";
import {
  buildProductControlLinkRequests,
  resolveSupplementProductImage,
} from "./reconcile";

describe("supplement media reconciliation", () => {
  it("never links a rights-pending asset", () => {
    const record = {
      canonicalProductId: "p1",
      canonicalVariantId: "v1",
      assetId: "a1",
      storagePath: "supplements/a1.webp",
      publicUrl: "https://cdn.example/a1.webp",
      altText: "Momentous Creatine, 60 servings",
      sourceProductUrl: "https://www.livemomentous.com/products/creatine",
      approvalStatus: "APPROVED",
      matchState: "EXACT_MATCH",
      rights: { status: "OFFICIAL_SOURCE_RIGHTS_PENDING" },
    } as SupplementMediaRecord;
    expect(buildProductControlLinkRequests([record])).toEqual([]);
  });

  it("never links a bare approved status without evidence", () => {
    const record = {
      canonicalProductId: "p1",
      canonicalVariantId: "v1",
      assetId: "a1",
      storagePath: "supplements/a1.webp",
      publicUrl: "https://cdn.example/a1.webp",
      altText: "Momentous Creatine, 60 servings",
      sourceProductUrl: "https://www.livemomentous.com/products/creatine",
      approvalStatus: "APPROVED",
      matchState: "EXACT_MATCH",
      rights: {
        status: "SUPPLIER_PROVIDED_APPROVED",
        evidenceReference: null,
        grantedBy: null,
        permissionDate: null,
        expiresAt: null,
        limitations: null,
      },
    } as SupplementMediaRecord;
    expect(buildProductControlLinkRequests([record])).toEqual([]);
  });

  it("uses the exact fallback order without substituting variants", () => {
    expect(
      resolveSupplementProductImage({
        exactVariantUrl: null,
        canonicalProductUrl: null,
        brandPlaceholderUrl: "brand.webp",
        categoryPlaceholderUrl: "category.webp",
        imagePendingUrl: "pending.webp",
      }),
    ).toEqual({ kind: "brand_placeholder", url: "brand.webp" });
  });
});
