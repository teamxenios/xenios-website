// xenios research: the product image manifest, typed.
//
// The manifest is the list of every catalog row that NEEDS an image, together
// with what that image must satisfy. It is not a list of images we hold. As of
// the source workbook, every row's file path is empty and every row's status
// reads "Needed", so the honest coverage number is zero approved assets, and this
// module is built so that number cannot be inflated by a parse.
//
// The derived fields below are a reading of the workbook's own words into closed
// unions. Every mapping is exhaustive and total: an unrecognised workbook string
// throws at parse rather than defaulting to a weaker blocker, because a silent
// default would let a new workbook row arrive as "no blocker" and become
// publishable.

import {
  MANIFEST_ACCESS_STATES,
  MANIFEST_APPROVER,
  MANIFEST_CATEGORIES,
  MANIFEST_IDENTITY_RULE,
  MANIFEST_IMAGE_STATES,
  MANIFEST_REQUIRED_ASSETS,
  MANIFEST_ROWS,
  MANIFEST_ROW_COUNT,
  MANIFEST_SOURCE_RIGHTS,
  MANIFEST_STATUS,
} from "./manifest-data";
import { variantCarriesStrength } from "./strength";
import type { MediaPublicStatus } from "./types";

// ---------------------------------------------------------------------------
// Derived unions
// ---------------------------------------------------------------------------

/**
 * Which rights lane a row sits in. This decides what a legitimate asset for the
 * row could even be: a row whose only lawful source is an official brand feed can
 * never be satisfied by a render we draw ourselves.
 */
export const MANIFEST_RIGHTS_PATHS = [
  "THIRD_PARTY_RIGHTS_REQUIRED",
  "LICENSED_THIRD_PARTY",
  "XENIOS_GENERATED_RENDER",
  "XENIOS_ORIGINAL_ARTWORK",
] as const;

export type ManifestRightsPath = (typeof MANIFEST_RIGHTS_PATHS)[number];

/** What the row is actually waiting on, in our words, one bucket per row. */
export const MANIFEST_COVERAGE_STATES = [
  "APPROVED_ASSET",
  "PENDING_DESIGN",
  "BLOCKED_ON_RIGHTS",
  "BLOCKED_ON_IDENTITY",
  "BLOCKED_ON_CLAIMS_REVIEW",
] as const;

export type ManifestCoverageState = (typeof MANIFEST_COVERAGE_STATES)[number];

export type ManifestPriority = "P0" | "P1";

// ---------------------------------------------------------------------------
// The entry
// ---------------------------------------------------------------------------

export interface ManifestEntry {
  /** "IMG-00001". Derived from row position and checked against the workbook. */
  readonly imageId: string;
  readonly category: string;
  readonly sku: string;
  readonly product: string;
  /** Null when the workbook cell is blank. */
  readonly variant: string | null;
  readonly requiredAssets: string;
  readonly sourceRights: string;
  readonly identityRule: string;
  /** Null when the workbook cell is blank. */
  readonly accessState: string | null;
  readonly currentImageState: string;
  readonly priority: ManifestPriority;
  /** Always null: the workbook holds no file path for any row. */
  readonly filePath: null;
  readonly altText: string;
  readonly approver: string;
  readonly status: string;

  // Derived, exhaustively mapped from the workbook strings above.
  readonly rightsPath: ManifestRightsPath;
  readonly coverageState: ManifestCoverageState;
  /** True when the variant string is an actual strength rather than a format. */
  readonly variantCarriesStrength: boolean;
  /**
   * True for rows the workbook lists as competitor expansion candidates. These
   * are coverage and gap references only. They are not Xenios offers, and no
   * competitor asset may ever be attached to one.
   */
  readonly isExpansionCandidate: boolean;
}

// ---------------------------------------------------------------------------
// Exhaustive mappings
// ---------------------------------------------------------------------------

const RIGHTS_PATH_BY_SOURCE: Record<string, ManifestRightsPath> = {
  "Official brand account / rights required": "THIRD_PARTY_RIGHTS_REQUIRED",
  "Original/lab-authorized kit or service image": "THIRD_PARTY_RIGHTS_REQUIRED",
  "Original service illustration / licensed lifestyle": "LICENSED_THIRD_PARTY",
  "Approved Renew/Quantum assets or new licensed render": "LICENSED_THIRD_PARTY",
  "Xenios / Renew-style rendered vial after exact identity approval": "XENIOS_GENERATED_RENDER",
  "Original Xenios service/program artwork": "XENIOS_ORIGINAL_ARTWORK",
};

const COVERAGE_STATE_BY_IMAGE_STATE: Record<string, ManifestCoverageState> = {
  "Pending authorized image feed / rights": "BLOCKED_ON_RIGHTS",
  "Lab workflow / rights review": "BLOCKED_ON_RIGHTS",
  "Care route and rights review": "BLOCKED_ON_RIGHTS",
  "Claims and rights review required": "BLOCKED_ON_CLAIMS_REVIEW",
  "Blocked if identity/strength/label unresolved": "BLOCKED_ON_IDENTITY",
  "Design needed": "PENDING_DESIGN",
};

export const COMPETITOR_EXPANSION_CATEGORY = "Competitor Expansion Candidate";

/**
 * The workbook status string that would mean an approved asset exists. Nothing in
 * the current workbook carries it; it is named so the parser has something exact
 * to compare against instead of guessing.
 */
export const APPROVED_STATUS = "Approved";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function requireMapped<T>(table: Record<string, T>, key: string, column: string): T {
  const mapped = table[key];
  if (mapped === undefined) {
    throw new Error(
      `Product image manifest: unmapped ${column} value ${JSON.stringify(key)}. ` +
        "Add an explicit mapping. An unknown value is never defaulted, because the default would be publishable.",
    );
  }
  return mapped;
}

/** Derive the workbook image id from a zero based row index. */
export function manifestImageId(rowIndex: number): string {
  return `IMG-${String(rowIndex + 1).padStart(5, "0")}`;
}

function buildEntries(): readonly ManifestEntry[] {
  if (MANIFEST_ROWS.length !== MANIFEST_ROW_COUNT) {
    throw new Error(
      `Product image manifest: expected ${MANIFEST_ROW_COUNT} rows, found ${MANIFEST_ROWS.length}. ` +
        "A truncated generation must not pass.",
    );
  }

  return MANIFEST_ROWS.map((row, index) => {
    const [
      categoryIndex,
      sku,
      product,
      variant,
      requiredIndex,
      rightsIndex,
      accessIndex,
      stateIndex,
      priorityIsP0,
      altText,
    ] = row;

    const category = MANIFEST_CATEGORIES[categoryIndex];
    const sourceRights = MANIFEST_SOURCE_RIGHTS[rightsIndex];
    const currentImageState = MANIFEST_IMAGE_STATES[stateIndex];
    const accessRaw = MANIFEST_ACCESS_STATES[accessIndex];

    return {
      imageId: manifestImageId(index),
      category,
      sku,
      product,
      variant,
      requiredAssets: MANIFEST_REQUIRED_ASSETS[requiredIndex],
      sourceRights,
      identityRule: MANIFEST_IDENTITY_RULE,
      accessState: accessRaw.length > 0 ? accessRaw : null,
      currentImageState,
      priority: priorityIsP0 === 1 ? "P0" : "P1",
      filePath: null,
      altText,
      approver: MANIFEST_APPROVER,
      status: MANIFEST_STATUS,
      rightsPath: requireMapped(RIGHTS_PATH_BY_SOURCE, sourceRights, "Source / Rights"),
      coverageState: requireMapped(COVERAGE_STATE_BY_IMAGE_STATE, currentImageState, "Current Image State"),
      variantCarriesStrength: variantCarriesStrength(variant),
      isExpansionCandidate: category === COMPETITOR_EXPANSION_CATEGORY,
    } satisfies ManifestEntry;
  });
}

let cached: readonly ManifestEntry[] | null = null;

/** Every manifest row, in workbook order. */
export function productImageManifest(): readonly ManifestEntry[] {
  if (!cached) cached = buildEntries();
  return cached;
}

/**
 * The public status a surface may use for a manifest row today.
 *
 * The workbook holds no approved asset, so this returns NONE for every current
 * row. It is written as a real resolver rather than a constant so that when an
 * approved asset does arrive, the upgrade is one explicit condition, and until it
 * does, nothing can drift upward.
 */
export function manifestPublicStatus(entry: ManifestEntry): MediaPublicStatus {
  if (entry.status !== APPROVED_STATUS) return "NONE";
  if (entry.filePath === null) return "NONE";
  return "APPROVED_NOT_PUBLISHED";
}

/** Index of manifest rows by SKU. A SKU can hold several variant rows. */
export function manifestBySku(
  entries: readonly ManifestEntry[] = productImageManifest(),
): ReadonlyMap<string, readonly ManifestEntry[]> {
  const index = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    const bucket = index.get(entry.sku);
    if (bucket) bucket.push(entry);
    else index.set(entry.sku, [entry]);
  }
  return index;
}

/** Index of manifest rows by SKU and variant, the identity rule's granularity. */
export function manifestKey(sku: string, variant: string | null): string {
  return `${sku}::${variant ?? ""}`;
}

/**
 * Buckets rather than single entries, because the workbook is not unique on this
 * key: three supplement rows arrive with the placeholder SKU "-". Collapsing them
 * would hide a real data gap, so they are kept and surfaced as findings instead.
 */
export function manifestByVariant(
  entries: readonly ManifestEntry[] = productImageManifest(),
): ReadonlyMap<string, readonly ManifestEntry[]> {
  const index = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    const key = manifestKey(entry.sku, entry.variant);
    const bucket = index.get(key);
    if (bucket) bucket.push(entry);
    else index.set(key, [entry]);
  }
  return index;
}

/**
 * Workbook cells that look like a value but carry none. The manifest uses "-" as
 * a blank in several columns, and a blank is not an identifier and not alt text.
 */
const PLACEHOLDER_CELLS: ReadonlySet<string> = new Set(["-", "--", "n/a", "na", "tbd", "none", "?"]);

/** True when a workbook cell is empty or a placeholder dash. */
export function isPlaceholderCell(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_CELLS.has(trimmed);
}
