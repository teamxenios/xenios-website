// xenios research: product media verification.
//
// Four families of automated check, each a pure function over the manifest and
// the asset registry. Nothing here fetches, downloads, resizes, or generates an
// image. It reads what we claim to hold and reports where the claim outruns the
// evidence.
//
//   1. MISSING MEDIA      every active product row has an image state. The state
//                         may be NONE. What is not allowed is silence, because a
//                         row nobody has stated a position on is a row that can
//                         quietly ship with whatever lands in the folder.
//
//   2. STRENGTH MISMATCH  no image may sit on a variant whose strength differs
//                         from the strength printed on the pictured item. A
//                         generic vial may not display a strength other than the
//                         selected variant's. This is a truthfulness rule: the
//                         label in the photograph is a statement about what the
//                         buyer receives.
//
//   3. UNSAFE PUBLIC      no active product ships with a broken asset, an asset
//                         sourced from a competitor, an empty placeholder, or an
//                         asset belonging to a different product.
//
//   4. HYGIENE            duplicate mismatched labels, missing alt text,
//                         oversized files, orphaned assets.
//
// Severity is two valued on purpose. "blocking" means a surface must not publish.
// "advisory" means someone should fix it but no reader is being misled today.

import { roleMakesIdentityClaim } from "./asset";
import {
  isPlaceholderCell,
  manifestKey,
  productImageManifest,
  type ManifestEntry,
} from "./manifest";
import { formatStrength, strengthsMatch, variantCarriesStrength } from "./strength";
import type { ImageRole, ProductMediaAsset } from "./types";

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export const MEDIA_FINDING_CODES = [
  "MISSING_MEDIA_STATE",
  "MISSING_PRODUCT_IDENTIFIER",
  "STRENGTH_MISMATCH",
  "UNDECLARED_STRENGTH_ON_IDENTITY_IMAGE",
  "BROKEN_ASSET",
  "COMPETITOR_SOURCED_ASSET",
  "PLACEHOLDER_PUBLISHED",
  "UNRELATED_ASSET",
  "ORPHANED_ASSET",
  "DUPLICATE_MISMATCHED_LABEL",
  "MISSING_ALT_TEXT",
  "OVERSIZED_FILE",
  "EXPANSION_CANDIDATE_ASSET",
] as const;

export type MediaFindingCode = (typeof MEDIA_FINDING_CODES)[number];

export type MediaFindingSeverity = "blocking" | "advisory";

export interface MediaFinding {
  readonly code: MediaFindingCode;
  readonly severity: MediaFindingSeverity;
  /** The manifest image id when the finding is about a row. */
  readonly imageId: string | null;
  /** The asset id when the finding is about an asset we hold. */
  readonly assetId: string | null;
  readonly sku: string | null;
  readonly variant: string | null;
  readonly detail: string;
}

const SEVERITY_BY_CODE: Record<MediaFindingCode, MediaFindingSeverity> = {
  MISSING_MEDIA_STATE: "blocking",
  MISSING_PRODUCT_IDENTIFIER: "advisory",
  STRENGTH_MISMATCH: "blocking",
  UNDECLARED_STRENGTH_ON_IDENTITY_IMAGE: "blocking",
  BROKEN_ASSET: "blocking",
  COMPETITOR_SOURCED_ASSET: "blocking",
  PLACEHOLDER_PUBLISHED: "blocking",
  UNRELATED_ASSET: "blocking",
  ORPHANED_ASSET: "advisory",
  DUPLICATE_MISMATCHED_LABEL: "blocking",
  MISSING_ALT_TEXT: "advisory",
  OVERSIZED_FILE: "advisory",
  EXPANSION_CANDIDATE_ASSET: "blocking",
};

function finding(
  code: MediaFindingCode,
  parts: { imageId?: string | null; assetId?: string | null; sku?: string | null; variant?: string | null; detail: string },
): MediaFinding {
  return {
    code,
    severity: SEVERITY_BY_CODE[code],
    imageId: parts.imageId ?? null,
    assetId: parts.assetId ?? null,
    sku: parts.sku ?? null,
    variant: parts.variant ?? null,
    detail: parts.detail,
  };
}

// ---------------------------------------------------------------------------
// Competitor sources
// ---------------------------------------------------------------------------

/**
 * Named references only. These businesses are studied for coverage and gaps. We
 * never reuse their images, labels, or copy, so an asset whose path, holder, or
 * evidence pointer names one of them is refused wherever it came from.
 */
export const COMPETITOR_SOURCE_TOKENS: readonly string[] = [
  "fasttrack",
  "scriptbridge",
  "northline",
  "systemlabs",
  "scientificsean",
];

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Order preserving dedupe. Kept explicit so the build target stays unconstrained. */
function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** The competitor token an asset's provenance strings name, or null. */
export function competitorTokenIn(...values: readonly (string | null | undefined)[]): string | null {
  const haystack = squash(values.filter((value): value is string => typeof value === "string").join(" "));
  if (haystack.length === 0) return null;
  for (const token of COMPETITOR_SOURCE_TOKENS) {
    if (haystack.includes(token)) return token;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Size budgets
// ---------------------------------------------------------------------------

const MB = 1024 * 1024;

/**
 * Byte budgets per role. A hero may be heavier than a card. These are shipping
 * budgets, not correctness limits, so exceeding one is advisory.
 */
export const DEFAULT_MAX_BYTES_BY_ROLE: Record<ImageRole, number> = {
  card: 400 * 1024,
  detail_hero: 1 * MB,
  gallery: 1 * MB,
  label: 1 * MB,
  package: 1 * MB,
  lifestyle: 2 * MB,
  document_preview: 2 * MB,
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface VerificationInput {
  /** Defaults to the workbook manifest. */
  readonly manifest?: readonly ManifestEntry[];
  /** Everything we hold. Empty is a valid, truthful input. */
  readonly assets: readonly ProductMediaAsset[];
  readonly maxBytesByRole?: Partial<Record<ImageRole, number>>;
  /**
   * Rows a surface currently treats as active. Defaults to every manifest row
   * that is not a competitor expansion candidate, since a candidate is a
   * reference and not something we offer.
   */
  readonly activeImageIds?: ReadonlySet<string>;
}

export interface VerificationReport {
  readonly findings: readonly MediaFinding[];
  readonly blockingCount: number;
  readonly advisoryCount: number;
  readonly rowsChecked: number;
  readonly assetsChecked: number;
}

function defaultActiveIds(manifest: readonly ManifestEntry[]): ReadonlySet<string> {
  const active = new Set<string>();
  for (const entry of manifest) {
    if (!entry.isExpansionCandidate) active.add(entry.imageId);
  }
  return active;
}

// ---------------------------------------------------------------------------
// Check 1: every active product has an image state
// ---------------------------------------------------------------------------

export function checkMissingMediaState(
  manifest: readonly ManifestEntry[],
  activeImageIds: ReadonlySet<string>,
): readonly MediaFinding[] {
  const findings: MediaFinding[] = [];
  const seen = new Set<string>();

  for (const entry of manifest) {
    seen.add(entry.imageId);
    // coverageState is a total mapping, so an entry that reached here always has
    // a state. The check that matters is the inverse one below: an active id with
    // no manifest row at all.
    if (isPlaceholderCell(entry.sku)) {
      findings.push(
        finding("MISSING_PRODUCT_IDENTIFIER", {
          imageId: entry.imageId,
          sku: entry.sku,
          variant: entry.variant,
          detail: `${entry.product} carries no SKU in the manifest, so no asset can be bound to it by identifier.`,
        }),
      );
    }
  }

  activeImageIds.forEach((imageId) => {
    if (!seen.has(imageId)) {
      findings.push(
        finding("MISSING_MEDIA_STATE", {
          imageId,
          detail: `${imageId} is treated as active but has no manifest row, so it has no image state at all.`,
        }),
      );
    }
  });

  return findings;
}

// ---------------------------------------------------------------------------
// Check 2: strength mismatch
// ---------------------------------------------------------------------------

export function checkStrengthMatch(
  assets: readonly ProductMediaAsset[],
  byVariant: ReadonlyMap<string, readonly ManifestEntry[]>,
): readonly MediaFinding[] {
  const findings: MediaFinding[] = [];

  for (const asset of assets) {
    const rows = byVariant.get(manifestKey(asset.productId, asset.variantId));
    const entry = rows && rows.length > 0 ? rows[0] : undefined;
    if (!entry) continue; // handled as an orphan by check 4

    const variantStrength = entry.variantCarriesStrength ? entry.variant : null;

    if (asset.declaredStrength !== null) {
      // The image shows a strength. It must be the variant's strength, and the
      // variant must have one at all.
      if (variantStrength === null || !strengthsMatch(asset.declaredStrength, variantStrength)) {
        findings.push(
          finding("STRENGTH_MISMATCH", {
            imageId: entry.imageId,
            assetId: asset.assetId,
            sku: entry.sku,
            variant: entry.variant,
            detail:
              `Asset ${asset.assetId} shows ${formatStrength(asset.declaredStrength)} but is attached to ` +
              `${entry.product} ${formatStrength(variantStrength)}. An image may never display a strength ` +
              "other than the selected variant's.",
          }),
        );
      }
      continue;
    }

    // The image declares no strength. That is fine for a lifestyle or gallery
    // shot, and fine for a variant that is a format rather than a strength. It is
    // not fine for a published card, hero, label, or package image on a strength
    // bearing variant: the reader takes that picture as the item they receive, so
    // a plain vial must be confirmed to carry no strength printing rather than
    // left unstated.
    const publiclyVisible = asset.publicStatus === "PUBLISHED";
    if (publiclyVisible && variantStrength !== null && roleMakesIdentityClaim(asset)) {
      findings.push(
        finding("UNDECLARED_STRENGTH_ON_IDENTITY_IMAGE", {
          imageId: entry.imageId,
          assetId: asset.assetId,
          sku: entry.sku,
          variant: entry.variant,
          detail:
            `Asset ${asset.assetId} is a published ${asset.role} image on ${entry.product} ` +
            `${formatStrength(variantStrength)} but declares no strength. Record the strength printed on the ` +
            "pictured item, or record that it prints none.",
        }),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 3: nothing unsafe reaches an active product
// ---------------------------------------------------------------------------

export function checkPublicSafety(
  assets: readonly ProductMediaAsset[],
  byVariant: ReadonlyMap<string, readonly ManifestEntry[]>,
  activeImageIds: ReadonlySet<string>,
): readonly MediaFinding[] {
  const findings: MediaFinding[] = [];

  for (const asset of assets) {
    const rows = byVariant.get(manifestKey(asset.productId, asset.variantId));
    const entry = rows && rows.length > 0 ? rows[0] : undefined;
    const onActiveRow = entry ? activeImageIds.has(entry.imageId) : false;

    const competitor = competitorTokenIn(
      asset.filePath,
      asset.rightsRecord?.holder,
      asset.rightsRecord?.evidenceRef,
      asset.rightsRecord?.recordId,
    );
    if (competitor) {
      findings.push(
        finding("COMPETITOR_SOURCED_ASSET", {
          imageId: entry?.imageId ?? null,
          assetId: asset.assetId,
          sku: asset.productId,
          variant: asset.variantId,
          detail:
            `Asset ${asset.assetId} names ${competitor} in its provenance. Competitor imagery is a reference ` +
            "for coverage only and is never reused, whatever its rights row says.",
        }),
      );
    }

    if (entry?.isExpansionCandidate) {
      findings.push(
        finding("EXPANSION_CANDIDATE_ASSET", {
          imageId: entry.imageId,
          assetId: asset.assetId,
          sku: entry.sku,
          variant: entry.variant,
          detail:
            `Asset ${asset.assetId} is attached to ${entry.product}, a competitor expansion candidate. ` +
            "Candidates are gap analysis rows, not Xenios offers, and carry no product imagery.",
        }),
      );
    }

    if (asset.publicStatus !== "PUBLISHED") continue;

    if (asset.sourceType === "internal_placeholder") {
      findings.push(
        finding("PLACEHOLDER_PUBLISHED", {
          imageId: entry?.imageId ?? null,
          assetId: asset.assetId,
          sku: asset.productId,
          variant: asset.variantId,
          detail: `Asset ${asset.assetId} is an internal placeholder and is published. Show no image instead.`,
        }),
      );
    }

    if (
      asset.filePath === null ||
      asset.filePath.trim().length === 0 ||
      asset.checksum === null ||
      asset.checksum.trim().length === 0
    ) {
      findings.push(
        finding("BROKEN_ASSET", {
          imageId: entry?.imageId ?? null,
          assetId: asset.assetId,
          sku: asset.productId,
          variant: asset.variantId,
          detail: `Asset ${asset.assetId} is published with no stored file or no checksum, so it renders broken.`,
        }),
      );
    }

    if (onActiveRow && asset.identityStatus !== "VERIFIED_EXACT_VARIANT") {
      findings.push(
        finding("UNRELATED_ASSET", {
          imageId: entry?.imageId ?? null,
          assetId: asset.assetId,
          sku: asset.productId,
          variant: asset.variantId,
          detail:
            `Asset ${asset.assetId} is published on an active product with identity ${asset.identityStatus}. ` +
            "Only an asset confirmed to depict the exact product and variant may be shown.",
        }),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Check 4: hygiene
// ---------------------------------------------------------------------------

export function checkHygiene(
  assets: readonly ProductMediaAsset[],
  byVariant: ReadonlyMap<string, readonly ManifestEntry[]>,
  maxBytesByRole: Record<ImageRole, number>,
): readonly MediaFinding[] {
  const findings: MediaFinding[] = [];
  const byChecksum = new Map<string, ProductMediaAsset[]>();

  for (const asset of assets) {
    const rows = byVariant.get(manifestKey(asset.productId, asset.variantId));
    if (!rows || rows.length === 0) {
      findings.push(
        finding("ORPHANED_ASSET", {
          assetId: asset.assetId,
          sku: asset.productId,
          variant: asset.variantId,
          detail:
            `Asset ${asset.assetId} points at ${asset.productId}${asset.variantId ? ` / ${asset.variantId}` : ""}, ` +
            "which has no manifest row. Either the row was retired or the asset was misfiled.",
        }),
      );
    }

    if (isPlaceholderCell(asset.altText)) {
      findings.push(
        finding("MISSING_ALT_TEXT", {
          imageId: rows?.[0]?.imageId ?? null,
          assetId: asset.assetId,
          sku: asset.productId,
          variant: asset.variantId,
          detail: `Asset ${asset.assetId} has placeholder alt text ${JSON.stringify(asset.altText)}.`,
        }),
      );
    }

    const budget = maxBytesByRole[asset.role];
    if (asset.byteSize !== null && budget !== undefined && asset.byteSize > budget) {
      findings.push(
        finding("OVERSIZED_FILE", {
          imageId: rows?.[0]?.imageId ?? null,
          assetId: asset.assetId,
          sku: asset.productId,
          variant: asset.variantId,
          detail: `Asset ${asset.assetId} is ${asset.byteSize} bytes against a ${budget} byte budget for role ${asset.role}.`,
        }),
      );
    }

    if (asset.checksum !== null && asset.checksum.trim().length > 0) {
      const bucket = byChecksum.get(asset.checksum);
      if (bucket) bucket.push(asset);
      else byChecksum.set(asset.checksum, [asset]);
    }
  }

  // Same bytes, different label. One file cannot truthfully be two different
  // products or two different strengths at once.
  byChecksum.forEach((bucket, checksum) => {
    if (bucket.length < 2) return;
    const products = unique(bucket.map((asset) => asset.productId));
    const strengths = unique(bucket.map((asset) => asset.declaredStrength ?? ""));
    if (products.length === 1 && strengths.length === 1) return;

    for (const asset of bucket) {
      findings.push(
        finding("DUPLICATE_MISMATCHED_LABEL", {
          assetId: asset.assetId,
          sku: asset.productId,
          variant: asset.variantId,
          detail:
            `Checksum ${checksum} is shared by ${bucket.length} assets labelled as ` +
            `${products.join(", ")} at strengths ${strengths.map((value) => value || "none declared").join(", ")}. ` +
            "The same file cannot depict more than one product or strength.",
        }),
      );
    }
  });

  return findings;
}

// ---------------------------------------------------------------------------
// The whole run
// ---------------------------------------------------------------------------

export function verifyProductMedia(input: VerificationInput): VerificationReport {
  const manifest = input.manifest ?? productImageManifest();
  const activeImageIds = input.activeImageIds ?? defaultActiveIds(manifest);
  const maxBytesByRole = { ...DEFAULT_MAX_BYTES_BY_ROLE, ...(input.maxBytesByRole ?? {}) };

  const byVariant = new Map<string, ManifestEntry[]>();
  for (const entry of manifest) {
    const key = manifestKey(entry.sku, entry.variant);
    const bucket = byVariant.get(key);
    if (bucket) bucket.push(entry);
    else byVariant.set(key, [entry]);
  }

  const findings: MediaFinding[] = [
    ...checkMissingMediaState(manifest, activeImageIds),
    ...checkStrengthMatch(input.assets, byVariant),
    ...checkPublicSafety(input.assets, byVariant, activeImageIds),
    ...checkHygiene(input.assets, byVariant, maxBytesByRole),
  ];

  return {
    findings,
    blockingCount: findings.filter((item) => item.severity === "blocking").length,
    advisoryCount: findings.filter((item) => item.severity === "advisory").length,
    rowsChecked: manifest.length,
    assetsChecked: input.assets.length,
  };
}

/** Convenience for a surface: may this asset be shown at all. */
export function isPublishable(asset: ProductMediaAsset, entry: ManifestEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.isExpansionCandidate) return false;
  if (asset.publicStatus !== "PUBLISHED") return false;
  if (asset.identityStatus !== "VERIFIED_EXACT_VARIANT") return false;
  if (asset.sourceType === "internal_placeholder") return false;
  if (competitorTokenIn(asset.filePath, asset.rightsRecord?.holder, asset.rightsRecord?.evidenceRef)) return false;
  if (asset.declaredStrength !== null) {
    const variantStrength = variantCarriesStrength(entry.variant) ? entry.variant : null;
    if (!strengthsMatch(asset.declaredStrength, variantStrength)) return false;
  }
  return true;
}
