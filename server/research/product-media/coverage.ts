// xenios research: product image coverage.
//
// One report, one rule: count what we hold, never what we intend to hold. An
// asset counts as approved only when an approved asset record exists for the
// manifest row. Intent, priority, and design plans do not move the number.
//
// The current source workbook contains no file path and no approved status on any
// of its 1179 rows, so the truthful approved count today is zero. This module is
// written so that number rises only when real asset records arrive, and the
// markdown renderer below is the exact text checked into
// docs/research-commerce/PRODUCT_IMAGE_COVERAGE.md, with a test asserting the two
// agree. A stale report is a false report.

import {
  MANIFEST_COVERAGE_STATES,
  productImageManifest,
  type ManifestCoverageState,
  type ManifestEntry,
} from "@shared/research/product-media/manifest";
import { manifestKey } from "@shared/research/product-media/manifest";
import type { ProductMediaAsset } from "@shared/research/product-media/types";

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** What a manifest row resolves to once real assets are taken into account. */
export const COVERAGE_BUCKETS = [
  "APPROVED",
  "PENDING",
  "BLOCKED_ON_RIGHTS",
  "BLOCKED_ON_IDENTITY",
  "BLOCKED_ON_CLAIMS_REVIEW",
] as const;

export type CoverageBucket = (typeof COVERAGE_BUCKETS)[number];

export interface CategoryCoverage {
  readonly category: string;
  readonly rows: number;
  readonly p0Rows: number;
  readonly approved: number;
  readonly pending: number;
  readonly blockedOnRights: number;
  readonly blockedOnIdentity: number;
  readonly blockedOnClaimsReview: number;
}

export interface CoverageSummary {
  readonly totalRows: number;
  readonly distinctSkus: number;
  readonly rowsWithVariant: number;
  readonly rowsWithStrengthVariant: number;
  readonly p0Rows: number;
  readonly p1Rows: number;
  readonly approved: number;
  readonly pending: number;
  readonly blockedOnRights: number;
  readonly blockedOnIdentity: number;
  readonly blockedOnClaimsReview: number;
  readonly expansionCandidateRows: number;
  readonly rowsWithoutSku: number;
  readonly assetsHeld: number;
  readonly byCategory: readonly CategoryCoverage[];
  readonly byRightsPath: readonly { readonly rightsPath: string; readonly rows: number }[];
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

const BUCKET_BY_COVERAGE_STATE: Record<ManifestCoverageState, CoverageBucket> = {
  APPROVED_ASSET: "APPROVED",
  PENDING_DESIGN: "PENDING",
  BLOCKED_ON_RIGHTS: "BLOCKED_ON_RIGHTS",
  BLOCKED_ON_IDENTITY: "BLOCKED_ON_IDENTITY",
  BLOCKED_ON_CLAIMS_REVIEW: "BLOCKED_ON_CLAIMS_REVIEW",
};

/**
 * The bucket for one row.
 *
 * An approved asset for the row wins over the workbook's blocker, because a real
 * approved record is stronger evidence than a planning cell. Nothing else can
 * promote a row: absence of an asset never reads as approved.
 */
export function bucketFor(entry: ManifestEntry, approvedAssetCount: number): CoverageBucket {
  if (approvedAssetCount > 0) return "APPROVED";
  return BUCKET_BY_COVERAGE_STATE[entry.coverageState];
}

/** Assets that count as coverage: approved or published, and identity verified. */
export function countsAsCoverage(asset: ProductMediaAsset): boolean {
  if (asset.sourceType === "internal_placeholder") return false;
  if (asset.identityStatus !== "VERIFIED_EXACT_VARIANT") return false;
  return asset.publicStatus === "PUBLISHED" || asset.publicStatus === "APPROVED_NOT_PUBLISHED";
}

export interface CoverageInput {
  readonly manifest?: readonly ManifestEntry[];
  readonly assets?: readonly ProductMediaAsset[];
}

export function computeCoverage(input: CoverageInput = {}): CoverageSummary {
  const manifest = input.manifest ?? productImageManifest();
  const assets = input.assets ?? [];

  const approvedByKey = new Map<string, number>();
  for (const asset of assets) {
    if (!countsAsCoverage(asset)) continue;
    const key = manifestKey(asset.productId, asset.variantId);
    approvedByKey.set(key, (approvedByKey.get(key) ?? 0) + 1);
  }

  const categories = new Map<string, { rows: number; p0Rows: number } & Record<CoverageBucket, number>>();
  const rightsPaths = new Map<string, number>();

  let approved = 0;
  let pending = 0;
  let blockedOnRights = 0;
  let blockedOnIdentity = 0;
  let blockedOnClaimsReview = 0;
  let p0Rows = 0;
  let rowsWithVariant = 0;
  let rowsWithStrengthVariant = 0;
  let expansionCandidateRows = 0;
  let rowsWithoutSku = 0;
  const skus = new Set<string>();

  for (const entry of manifest) {
    const bucket = bucketFor(entry, approvedByKey.get(manifestKey(entry.sku, entry.variant)) ?? 0);

    if (bucket === "APPROVED") approved += 1;
    else if (bucket === "PENDING") pending += 1;
    else if (bucket === "BLOCKED_ON_RIGHTS") blockedOnRights += 1;
    else if (bucket === "BLOCKED_ON_IDENTITY") blockedOnIdentity += 1;
    else blockedOnClaimsReview += 1;

    if (entry.priority === "P0") p0Rows += 1;
    if (entry.variant !== null) rowsWithVariant += 1;
    if (entry.variantCarriesStrength) rowsWithStrengthVariant += 1;
    if (entry.isExpansionCandidate) expansionCandidateRows += 1;
    if (entry.sku === "-" || entry.sku.trim().length === 0) rowsWithoutSku += 1;
    skus.add(entry.sku);

    let row = categories.get(entry.category);
    if (!row) {
      row = {
        rows: 0,
        p0Rows: 0,
        APPROVED: 0,
        PENDING: 0,
        BLOCKED_ON_RIGHTS: 0,
        BLOCKED_ON_IDENTITY: 0,
        BLOCKED_ON_CLAIMS_REVIEW: 0,
      };
      categories.set(entry.category, row);
    }
    row.rows += 1;
    if (entry.priority === "P0") row.p0Rows += 1;
    row[bucket] += 1;

    rightsPaths.set(entry.rightsPath, (rightsPaths.get(entry.rightsPath) ?? 0) + 1);
  }

  const byCategory: CategoryCoverage[] = Array.from(categories.entries())
    .map(([category, row]) => ({
      category,
      rows: row.rows,
      p0Rows: row.p0Rows,
      approved: row.APPROVED,
      pending: row.PENDING,
      blockedOnRights: row.BLOCKED_ON_RIGHTS,
      blockedOnIdentity: row.BLOCKED_ON_IDENTITY,
      blockedOnClaimsReview: row.BLOCKED_ON_CLAIMS_REVIEW,
    }))
    .sort((a, b) => b.rows - a.rows || a.category.localeCompare(b.category));

  const byRightsPath = Array.from(rightsPaths.entries())
    .map(([rightsPath, rows]) => ({ rightsPath, rows }))
    .sort((a, b) => b.rows - a.rows || a.rightsPath.localeCompare(b.rightsPath));

  return {
    totalRows: manifest.length,
    distinctSkus: skus.size,
    rowsWithVariant,
    rowsWithStrengthVariant,
    p0Rows,
    p1Rows: manifest.length - p0Rows,
    approved,
    pending,
    blockedOnRights,
    blockedOnIdentity,
    blockedOnClaimsReview,
    expansionCandidateRows,
    rowsWithoutSku,
    assetsHeld: assets.length,
    byCategory,
    byRightsPath,
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/**
 * The per category table body, exactly as it appears in the checked in report.
 * The doc drift test renders this and asserts the file contains it, so the two
 * cannot disagree.
 */
export function renderCategoryTable(summary: CoverageSummary): string {
  const header = [
    "| Category | Rows | P0 | Approved | Pending design | Blocked on rights | Blocked on identity | Blocked on claims review |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  const body = summary.byCategory.map(
    (row) =>
      `| ${row.category} | ${row.rows} | ${row.p0Rows} | ${row.approved} | ${row.pending} | ` +
      `${row.blockedOnRights} | ${row.blockedOnIdentity} | ${row.blockedOnClaimsReview} |`,
  );
  const total = summary.byCategory.reduce(
    (acc, row) => ({
      rows: acc.rows + row.rows,
      p0: acc.p0 + row.p0Rows,
      approved: acc.approved + row.approved,
      pending: acc.pending + row.pending,
      rights: acc.rights + row.blockedOnRights,
      identity: acc.identity + row.blockedOnIdentity,
      claims: acc.claims + row.blockedOnClaimsReview,
    }),
    { rows: 0, p0: 0, approved: 0, pending: 0, rights: 0, identity: 0, claims: 0 },
  );
  const footer =
    `| **Total** | **${total.rows}** | **${total.p0}** | **${total.approved}** | **${total.pending}** | ` +
    `**${total.rights}** | **${total.identity}** | **${total.claims}** |`;

  return [...header, ...body, footer].join("\n");
}

/** The rights path table body, same drift guarantee. */
export function renderRightsPathTable(summary: CoverageSummary): string {
  const header = ["| Rights path | Rows |", "| --- | ---: |"];
  const body = summary.byRightsPath.map((row) => `| ${row.rightsPath} | ${row.rows} |`);
  return [...header, ...body].join("\n");
}

/** Sanity guard used by the coverage test and by any future report writer. */
export function assertCoverageConsistent(summary: CoverageSummary): void {
  const bucketTotal =
    summary.approved +
    summary.pending +
    summary.blockedOnRights +
    summary.blockedOnIdentity +
    summary.blockedOnClaimsReview;
  if (bucketTotal !== summary.totalRows) {
    throw new Error(`Coverage buckets sum to ${bucketTotal} but the manifest has ${summary.totalRows} rows.`);
  }
  if (MANIFEST_COVERAGE_STATES.length !== COVERAGE_BUCKETS.length) {
    throw new Error("Every manifest coverage state must map to exactly one coverage bucket.");
  }
}
