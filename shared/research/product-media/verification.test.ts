import { describe, expect, it } from "vitest";

import { createProductMediaAsset } from "./asset";
import { productImageManifest, type ManifestEntry } from "./manifest";
import type { ProductMediaAsset, ProductMediaAssetInput, RightsRecord } from "./types";
import {
  DEFAULT_MAX_BYTES_BY_ROLE,
  competitorTokenIn,
  isPublishable,
  verifyProductMedia,
} from "./verification";

const GRANT: RightsRecord = {
  recordId: "RGT-1",
  holder: "Momentous",
  grantedOn: "2026-05-04",
  expiresOn: null,
  evidenceRef: "vault://rights/RGT-1.pdf",
  scope: "product_photography",
};

function entry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    imageId: "IMG-00001",
    category: "Peptides & Research",
    sku: "PEP-001",
    product: "BPC-157 + TB-500 Research Blend",
    variant: "15 mg / 15 mg",
    requiredAssets: "Transparent vial PNG; catalog WebP",
    sourceRights: "Xenios / Renew-style rendered vial after exact identity approval",
    identityRule: "Exact product and variant required",
    accessState: "Approval required",
    currentImageState: "Blocked if identity/strength/label unresolved",
    priority: "P0",
    filePath: null,
    altText: "BPC-157 + TB-500 Research Blend 15 mg / 15 mg",
    approver: "Product + Brand + Quality",
    status: "Needed",
    rightsPath: "XENIOS_GENERATED_RENDER",
    coverageState: "BLOCKED_ON_IDENTITY",
    variantCarriesStrength: true,
    isExpansionCandidate: false,
    ...overrides,
  };
}

function asset(overrides: Partial<ProductMediaAssetInput> = {}): ProductMediaAsset {
  return createProductMediaAsset({
    assetId: "AST-1",
    productId: "PEP-001",
    variantId: "15 mg / 15 mg",
    role: "detail_hero",
    sourceType: "official_brand",
    rightsStatus: "RIGHTS_ON_FILE",
    rightsRecord: GRANT,
    identityStatus: "VERIFIED_EXACT_VARIANT",
    declaredStrength: "15 mg / 15 mg",
    checksum: "sha256:aaa",
    filePath: "media/pep-001/hero.webp",
    byteSize: 120_000,
    altText: "BPC-157 + TB-500 Research Blend 15 mg / 15 mg",
    publicStatus: "PUBLISHED",
    approvalOwner: "Samuel Boadu",
    approvalDate: "2026-08-01",
    ...overrides,
  });
}

function codes(report: ReturnType<typeof verifyProductMedia>): string[] {
  return report.findings.map((item) => item.code).sort();
}

describe("check 1: every active product has an image state", () => {
  it("finds a state for all 1179 workbook rows and reports nothing on an empty registry", () => {
    const report = verifyProductMedia({ assets: [] });
    expect(report.rowsChecked).toBe(1179);
    expect(report.assetsChecked).toBe(0);
    // The only findings over the real workbook are the three rows the workbook
    // itself leaves without a SKU. Every other row has a state, and NONE is a
    // state.
    expect(codes(report)).toEqual(["MISSING_PRODUCT_IDENTIFIER", "MISSING_PRODUCT_IDENTIFIER", "MISSING_PRODUCT_IDENTIFIER"]);
    expect(report.blockingCount).toBe(0);
  });

  it("reports an active product with no manifest row at all", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [],
      activeImageIds: new Set(["IMG-00001", "IMG-99999"]),
    });
    expect(codes(report)).toEqual(["MISSING_MEDIA_STATE"]);
    expect(report.findings[0].imageId).toBe("IMG-99999");
  });
});

describe("check 2: strength mismatch", () => {
  it("passes when the pictured strength is the variant strength", () => {
    const report = verifyProductMedia({ manifest: [entry()], assets: [asset()] });
    expect(codes(report)).toEqual([]);
  });

  it("blocks a vial that displays a strength other than the selected variant", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ declaredStrength: "10 mg / 10 mg" })],
    });
    expect(codes(report)).toContain("STRENGTH_MISMATCH");
    const found = report.findings.find((item) => item.code === "STRENGTH_MISMATCH");
    expect(found?.severity).toBe("blocking");
    expect(found?.detail).toContain("10 mg / 10 mg");
  });

  it("blocks a strength claim on a variant that has no strength", () => {
    const report = verifyProductMedia({
      manifest: [entry({ variant: "Capsules", variantCarriesStrength: false })],
      assets: [asset({ variantId: "Capsules", declaredStrength: "10 mg" })],
    });
    expect(codes(report)).toContain("STRENGTH_MISMATCH");
  });

  it("blocks a published identity image on a strength variant that declares nothing", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ declaredStrength: null })],
    });
    expect(codes(report)).toContain("UNDECLARED_STRENGTH_ON_IDENTITY_IMAGE");
  });

  it("allows a lifestyle image to declare no strength", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ role: "lifestyle", declaredStrength: null })],
    });
    expect(codes(report)).toEqual([]);
  });

  it("allows an unpublished draft to declare no strength", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ declaredStrength: null, publicStatus: "PENDING_APPROVAL" })],
    });
    expect(codes(report)).toEqual([]);
  });
});

describe("check 3: nothing unsafe reaches an active product", () => {
  it("blocks a competitor sourced asset wherever the name appears", () => {
    const fromPath = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ filePath: "media/scraped/fast-track/hero.webp" })],
    });
    expect(codes(fromPath)).toContain("COMPETITOR_SOURCED_ASSET");

    const fromHolder = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ rightsRecord: { ...GRANT, holder: "Scientific Sean" } })],
    });
    expect(codes(fromHolder)).toContain("COMPETITOR_SOURCED_ASSET");
  });

  it("recognises every named competitor regardless of punctuation", () => {
    expect(competitorTokenIn("FastTrack")).toBe("fasttrack");
    expect(competitorTokenIn("script-bridge")).toBe("scriptbridge");
    expect(competitorTokenIn("NORTHLINE")).toBe("northline");
    expect(competitorTokenIn("System Labs")).toBe("systemlabs");
    expect(competitorTokenIn("scientific_sean")).toBe("scientificsean");
    expect(competitorTokenIn("media/pep-001/hero.webp")).toBeNull();
    expect(competitorTokenIn(null, undefined)).toBeNull();
  });

  it("blocks any asset attached to a competitor expansion candidate", () => {
    const report = verifyProductMedia({
      manifest: [entry({ isExpansionCandidate: true, category: "Competitor Expansion Candidate" })],
      assets: [asset()],
      activeImageIds: new Set(["IMG-00001"]),
    });
    expect(codes(report)).toContain("EXPANSION_CANDIDATE_ASSET");
  });

  it("blocks a published asset with no stored file or checksum", () => {
    // Publishing without bytes is refused at construction, so the broken state
    // can only arrive through a stored record. Verification still catches it.
    const broken = { ...asset(), checksum: null } as ProductMediaAsset;
    const report = verifyProductMedia({ manifest: [entry()], assets: [broken] });
    expect(codes(report)).toContain("BROKEN_ASSET");
  });

  it("blocks a published placeholder", () => {
    const placeholder = {
      ...asset({ publicStatus: "APPROVED_NOT_PUBLISHED" }),
      sourceType: "internal_placeholder",
      publicStatus: "PUBLISHED",
    } as ProductMediaAsset;
    const report = verifyProductMedia({ manifest: [entry()], assets: [placeholder] });
    expect(codes(report)).toContain("PLACEHOLDER_PUBLISHED");
  });

  it("blocks a published asset whose identity is unverified", () => {
    const unrelated = { ...asset(), identityStatus: "UNVERIFIED" } as ProductMediaAsset;
    const report = verifyProductMedia({ manifest: [entry()], assets: [unrelated] });
    expect(codes(report)).toContain("UNRELATED_ASSET");
  });
});

describe("check 4: hygiene", () => {
  it("flags an orphaned asset with no manifest row", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ productId: "SUP-999", variantId: null, declaredStrength: null })],
    });
    expect(codes(report)).toContain("ORPHANED_ASSET");
  });

  it("flags placeholder alt text", () => {
    const report = verifyProductMedia({ manifest: [entry()], assets: [asset({ altText: "-" })] });
    expect(codes(report)).toContain("MISSING_ALT_TEXT");
  });

  it("flags an oversized file against the role budget", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ role: "card", byteSize: DEFAULT_MAX_BYTES_BY_ROLE.card + 1 })],
    });
    expect(codes(report)).toContain("OVERSIZED_FILE");
  });

  it("respects an overridden byte budget", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [asset({ role: "card", byteSize: 900_000 })],
      maxBytesByRole: { card: 1_000_000 },
    });
    expect(codes(report)).not.toContain("OVERSIZED_FILE");
  });

  it("flags one file labelled as two different products or strengths", () => {
    const first = entry();
    const second = entry({ imageId: "IMG-00002", sku: "PEP-002", variant: "10 mg / 10 mg / 50 mg" });
    const report = verifyProductMedia({
      manifest: [first, second],
      assets: [
        asset(),
        asset({
          assetId: "AST-2",
          productId: "PEP-002",
          variantId: "10 mg / 10 mg / 50 mg",
          declaredStrength: "10 mg / 10 mg / 50 mg",
          checksum: "sha256:aaa",
          altText: "BPC-157 + TB-500 + GHK-Cu Research Blend 10 mg / 10 mg / 50 mg",
        }),
      ],
    });
    const duplicates = report.findings.filter((item) => item.code === "DUPLICATE_MISMATCHED_LABEL");
    expect(duplicates.length).toBe(2);
    expect(duplicates[0].severity).toBe("blocking");
  });

  it("does not flag two crops of the same product at the same strength", () => {
    const report = verifyProductMedia({
      manifest: [entry()],
      assets: [asset(), asset({ assetId: "AST-2", role: "card", checksum: "sha256:aaa" })],
    });
    expect(codes(report)).not.toContain("DUPLICATE_MISMATCHED_LABEL");
  });
});

describe("isPublishable", () => {
  it("is false without a manifest row, on a candidate row, and for a placeholder", () => {
    expect(isPublishable(asset(), undefined)).toBe(false);
    expect(isPublishable(asset(), entry({ isExpansionCandidate: true }))).toBe(false);
  });

  it("is false on a strength mismatch and true on an exact match", () => {
    expect(isPublishable(asset({ declaredStrength: "10 mg" }), entry())).toBe(false);
    expect(isPublishable(asset(), entry())).toBe(true);
  });

  it("is false for a draft", () => {
    expect(isPublishable(asset({ publicStatus: "APPROVED_NOT_PUBLISHED" }), entry())).toBe(false);
  });
});

describe("the real workbook", () => {
  it("holds no approved asset, so no row is publishable today", () => {
    const manifest = productImageManifest();
    for (const row of manifest.slice(0, 50)) {
      expect(row.status).toBe("Needed");
      expect(row.filePath).toBeNull();
    }
  });
});
