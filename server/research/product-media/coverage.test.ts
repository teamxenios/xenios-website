import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createProductMediaAsset } from "@shared/research/product-media/asset";
import { productImageManifest, type ManifestEntry } from "@shared/research/product-media/manifest";
import type { ProductMediaAsset } from "@shared/research/product-media/types";

import {
  assertCoverageConsistent,
  bucketFor,
  computeCoverage,
  countsAsCoverage,
  renderCategoryTable,
  renderRightsPathTable,
} from "./coverage";

const REPORT_PATH = resolve(__dirname, "../../../docs/research-commerce/PRODUCT_IMAGE_COVERAGE.md");
// Normalised so the drift check compares content, not the checkout's line ending
// convention. Git may hand this file back as CRLF on Windows.
const report = readFileSync(REPORT_PATH, "utf8").replace(/\r\n/g, "\n");
const summary = computeCoverage();

describe("coverage over the real workbook", () => {
  it("counts every one of the 1179 data rows once", () => {
    expect(summary.totalRows).toBe(1179);
    assertCoverageConsistent(summary);
  });

  it("reports zero approved assets, because the workbook holds none", () => {
    expect(summary.approved).toBe(0);
    expect(summary.assetsHeld).toBe(0);
    for (const entry of productImageManifest()) {
      expect(entry.status).toBe("Needed");
      expect(entry.filePath).toBeNull();
    }
  });

  it("splits the remainder into pending, rights blocked, identity blocked, and claims blocked", () => {
    expect(summary.pending).toBe(65);
    expect(summary.blockedOnRights).toBe(947);
    expect(summary.blockedOnIdentity).toBe(159);
    expect(summary.blockedOnClaimsReview).toBe(8);
    expect(
      summary.pending + summary.blockedOnRights + summary.blockedOnIdentity + summary.blockedOnClaimsReview,
    ).toBe(1179);
  });

  it("reports the manifest shape the report quotes", () => {
    expect(summary.distinctSkus).toBe(1152);
    expect(summary.rowsWithVariant).toBe(376);
    expect(summary.rowsWithStrengthVariant).toBe(126);
    expect(summary.p0Rows).toBe(200);
    expect(summary.p1Rows).toBe(979);
    expect(summary.expansionCandidateRows).toBe(73);
    expect(summary.rowsWithoutSku).toBe(3);
  });

  it("groups every row under exactly one category", () => {
    const rows = summary.byCategory.reduce((sum, row) => sum + row.rows, 0);
    expect(rows).toBe(1179);
    expect(summary.byCategory[0]).toMatchObject({ category: "Supplements", rows: 893, blockedOnRights: 893 });
  });

  it("groups every row under exactly one rights path", () => {
    const rows = summary.byRightsPath.reduce((sum, row) => sum + row.rows, 0);
    expect(rows).toBe(1179);
    expect(summary.byRightsPath).toEqual([
      { rightsPath: "THIRD_PARTY_RIGHTS_REQUIRED", rows: 935 },
      { rightsPath: "XENIOS_GENERATED_RENDER", rows: 159 },
      { rightsPath: "XENIOS_ORIGINAL_ARTWORK", rows: 65 },
      { rightsPath: "LICENSED_THIRD_PARTY", rows: 20 },
    ]);
  });
});

// A coverage report that can drift from the code is a report nobody can trust.
// The checked in tables are rendered by the module and compared byte for byte.
describe("the checked in report matches the computed numbers", () => {
  it("contains the rendered category table", () => {
    expect(report).toContain(renderCategoryTable(summary));
  });

  it("contains the rendered rights path table", () => {
    expect(report).toContain(renderRightsPathTable(summary));
  });

  it("states the headline numbers the module computes", () => {
    expect(report).toContain("| Manifest data rows | 1179 |");
    expect(report).toContain("| Rows with an **approved asset** | **0** |");
    expect(report).toContain(`| Rows **pending design** (Xenios original artwork still to be made) | ${summary.pending} |`);
    expect(report).toContain(
      `| Rows **blocked on rights** (a third party must authorise the image) | ${summary.blockedOnRights} |`,
    );
    expect(report).toContain(
      `| Rows **blocked on identity** (exact product, strength, or label unresolved) | ${summary.blockedOnIdentity} |`,
    );
    expect(report).toContain(`| Rows **blocked on claims review** | ${summary.blockedOnClaimsReview} |`);
    expect(report).toContain(`| Distinct SKUs | ${summary.distinctSkus} |`);
    expect(report).toContain(`| Rows carrying a variant | ${summary.rowsWithVariant} |`);
    expect(report).toContain(
      `| Rows whose variant is a real strength (for example \`15 mg / 15 mg\`) | ${summary.rowsWithStrengthVariant} |`,
    );
    expect(report).toContain(`| Rows with no SKU in the workbook | ${summary.rowsWithoutSku} |`);
  });

  it("names the source workbook and its hash", () => {
    expect(report).toContain("e2f7a8e1a59fbda8e01af1fc090112b8b51cc20bf30a890bab53c1d38dbc7f47");
    expect(report).toContain("48 Product Image Manifest");
  });

  it("uses no em dash", () => {
    expect(report.includes("—")).toBe(false);
  });
});

describe("an asset moves a row into approved, nothing else does", () => {
  const row: ManifestEntry = productImageManifest()[0];

  function approvedAsset(overrides: Partial<Parameters<typeof createProductMediaAsset>[0]> = {}): ProductMediaAsset {
    return createProductMediaAsset({
      assetId: "AST-1",
      productId: row.sku,
      variantId: row.variant,
      role: "detail_hero",
      sourceType: "xenios_generated_render",
      rightsStatus: "RIGHTS_NOT_REQUIRED",
      identityStatus: "VERIFIED_EXACT_VARIANT",
      declaredStrength: row.variant,
      altText: row.altText,
      publicStatus: "APPROVED_NOT_PUBLISHED",
      ...overrides,
    });
  }

  it("counts an approved, identity verified asset", () => {
    const asset = approvedAsset();
    expect(countsAsCoverage(asset)).toBe(true);
    const withAsset = computeCoverage({ assets: [asset] });
    expect(withAsset.approved).toBe(1);
    expect(withAsset.blockedOnIdentity).toBe(summary.blockedOnIdentity - 1);
    assertCoverageConsistent(withAsset);
  });

  it("does not count a draft, an unverified asset, or a placeholder", () => {
    expect(countsAsCoverage(approvedAsset({ publicStatus: "PENDING_APPROVAL" }))).toBe(false);
    expect(countsAsCoverage(approvedAsset({ identityStatus: "PENDING_VERIFICATION", publicStatus: "APPROVED_NOT_PUBLISHED" }))).toBe(
      false,
    );
    expect(
      countsAsCoverage(
        approvedAsset({ sourceType: "internal_placeholder", rightsStatus: "RIGHTS_NOT_REQUIRED" }),
      ),
    ).toBe(false);

    const unchanged = computeCoverage({ assets: [approvedAsset({ publicStatus: "PENDING_APPROVAL" })] });
    expect(unchanged.approved).toBe(0);
  });

  it("never promotes a row on absence alone", () => {
    expect(bucketFor(row, 0)).toBe("BLOCKED_ON_IDENTITY");
    expect(bucketFor(row, 1)).toBe("APPROVED");
  });
});
