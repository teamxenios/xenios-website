/**
 * One revision of the master catalog, in the only form reconciliation can trust.
 *
 * A "revision" is what one workbook version becomes after normalize.ts has run
 * over it: member-safe offerings, their variants, and the private evidence that
 * identity work needs (the canonical key and the workbook's own source IDs).
 *
 * Why this exists as its own shape rather than reusing the generated dataset:
 * offering and variant ids are content hashes, so identity work has to see the
 * content they hash. The deployed member-safe artifact deliberately drops the
 * canonical key (it is on the reader's banned-key list and the reader hardcodes
 * it to the empty string), and it carries no source ID at all. So the deployed
 * artifact cannot be used to compute or repair identity. Reconciliation runs
 * offline, against normalizer output, and this module is that boundary.
 *
 * A revision can still be built from a generated artifact, at reduced fidelity,
 * for the case where the current catalog is all an operator has. That mode is
 * marked "artifact" and the matcher refuses to reach its highest-confidence
 * conclusions from it, rather than pretending the evidence is there.
 *
 * This module reads. It mounts no route, writes no database, changes no flag,
 * creates no Product Control binding, and mutates nothing.
 */

import type {
  MasterOfferingDisplayState,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import {
  loadMasterOfferingDataset,
  MasterOfferingDatasetUnavailable,
} from "./dataset-reader";
import { normalizeOfferingText } from "./normalize";
import type {
  MasterOfferingAdminHold,
  MasterOfferingImportIssue,
  NormalizedMasterOffering,
  NormalizedMasterOfferingCatalog,
} from "./model";

/**
 * How much evidence this revision carries.
 *
 * "normalized" came from normalizeMasterOfferings and has the canonical key and
 * the workbook source IDs. "artifact" came from a generated member-safe dataset:
 * it has ids, names, aliases, and states, and nothing private. The matcher reads
 * this field and lowers its own ceiling accordingly.
 */
export type CatalogRevisionFidelity = "normalized" | "artifact";

/** A workbook source ID that is worth treating as an identifier. */
export function isStableSourceSku(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  // A run of dashes is the same blank the workbook writes when nobody assigned
  // an ID, and a single character cannot carry identity.
  if (/^-+$/.test(trimmed)) return false;
  return trimmed.length >= 2;
}

export function normalizeSourceSku(value: string): string {
  return value.trim().toUpperCase();
}

export interface CatalogRevisionVariant {
  id: string;
  label: string;
  /** Exactly the text the variant id was hashed over. */
  normalizedLabel: string;
  displayState: MasterOfferingDisplayState;
  /** Empty on an artifact revision. */
  sourceSkus: readonly string[];
  /** Empty on an artifact revision. */
  sheetRows: readonly number[];
}

export interface CatalogRevisionOffering {
  id: string;
  slug: string;
  /** Empty string on an artifact revision. */
  canonicalKey: string;
  family: MasterOfferingFamily;
  displayName: string;
  normalizedName: string;
  brand: string | null;
  normalizedBrand: string;
  category: string;
  subcategory: string | null;
  displayState: MasterOfferingDisplayState;
  aliases: readonly string[];
  normalizedAliases: readonly string[];
  /** Empty on an artifact revision. */
  sourceSkus: readonly string[];
  /** Empty on an artifact revision. */
  sheetRows: readonly number[];
  variants: readonly CatalogRevisionVariant[];
}

export interface CatalogRevision {
  /** Operator-facing name for this side of the comparison. */
  label: string;
  fidelity: CatalogRevisionFidelity;
  sourceWorkbookSha256: string;
  /** Zero on an artifact revision, which does not carry a row count. */
  sourceRowCount: number;
  offerings: readonly CatalogRevisionOffering[];
  holds: readonly MasterOfferingAdminHold[];
  issues: readonly MasterOfferingImportIssue[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value !== ""))).sort();
}

function uniqueSortedNumbers(values: readonly number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function skusOf(references: readonly { sourceSku: string }[]): readonly string[] {
  return uniqueSorted(
    references
      .map((reference) => reference.sourceSku)
      .filter(isStableSourceSku)
      .map(normalizeSourceSku),
  );
}

function revisionOffering(
  product: NormalizedMasterOffering,
): CatalogRevisionOffering {
  return {
    id: product.id,
    slug: product.slug,
    canonicalKey: product.canonicalKey,
    family: product.family,
    displayName: product.displayName,
    normalizedName: normalizeOfferingText(product.displayName),
    brand: product.brand,
    normalizedBrand: normalizeOfferingText(product.brand ?? ""),
    category: product.category,
    subcategory: product.subcategory,
    displayState: product.displayState,
    aliases: product.aliases,
    normalizedAliases: uniqueSorted(product.aliases.map(normalizeOfferingText)),
    sourceSkus: skusOf(product.sourceReferences),
    sheetRows: uniqueSortedNumbers(
      product.sourceReferences.map((reference) => reference.sheetRow),
    ),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      normalizedLabel: normalizeOfferingText(variant.label),
      displayState: variant.displayState,
      sourceSkus: skusOf(variant.sourceReferences),
      sheetRows: uniqueSortedNumbers(
        variant.sourceReferences.map((reference) => reference.sheetRow),
      ),
    })),
  };
}

/** Build a full-fidelity revision from normalizer output. */
export function catalogRevisionFromNormalized(input: {
  label: string;
  sourceWorkbookSha256: string;
  catalog: NormalizedMasterOfferingCatalog;
}): CatalogRevision {
  return {
    label: input.label,
    fidelity: "normalized",
    sourceWorkbookSha256: input.sourceWorkbookSha256,
    sourceRowCount: input.catalog.sourceRowCount,
    offerings: input.catalog.products.map(revisionOffering),
    holds: input.catalog.holds,
    issues: input.catalog.issues,
  };
}

export class CatalogRevisionUnreadable extends Error {
  constructor(readonly reason: string) {
    super(`catalog revision unreadable: ${reason}`);
    this.name = "CatalogRevisionUnreadable";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build a reduced-fidelity revision from a generated member-safe dataset.
 *
 * The dataset is validated through the production reader first, so anything the
 * catalog would refuse to serve is refused here too. The revision is then built
 * from the raw parsed file rather than from the reader's output, because the
 * reader substitutes the offering name for an opaque variant label and a
 * comparison wants the label the file actually holds.
 */
export function catalogRevisionFromGeneratedArtifact(input: {
  label: string;
  parsed: unknown;
}): CatalogRevision {
  let sourceWorkbookSha256 = "";
  try {
    sourceWorkbookSha256 =
      loadMasterOfferingDataset(input.parsed).summary.sourceWorkbookSha256;
  } catch (error) {
    if (error instanceof MasterOfferingDatasetUnavailable) {
      throw new CatalogRevisionUnreadable(error.reason);
    }
    throw error;
  }

  const raw = input.parsed as Record<string, unknown>;
  const products = Array.isArray(raw.products) ? raw.products : [];
  const offerings = products.filter(isRecord).map((product) => {
    const displayName = String(product.displayName ?? "");
    const brand =
      typeof product.brand === "string" && product.brand.trim() !== ""
        ? product.brand
        : null;
    const aliases = Array.isArray(product.aliases)
      ? product.aliases.filter(
          (alias): alias is string => typeof alias === "string",
        )
      : [];
    const variants = (Array.isArray(product.variants) ? product.variants : [])
      .filter(isRecord)
      .map((variant) => {
        const label = String(variant.label ?? "");
        return {
          id: String(variant.id ?? ""),
          label,
          normalizedLabel: normalizeOfferingText(label),
          displayState: variant.displayState as MasterOfferingDisplayState,
          sourceSkus: [] as readonly string[],
          sheetRows: [] as readonly number[],
        };
      });
    const offering: CatalogRevisionOffering = {
      id: String(product.id ?? ""),
      slug: String(product.slug ?? ""),
      // Deliberately empty. The generated file drops the canonical key, so the
      // only honest value here is absent, never a reconstruction.
      canonicalKey: "",
      family: product.family as MasterOfferingFamily,
      displayName,
      normalizedName: normalizeOfferingText(displayName),
      brand,
      normalizedBrand: normalizeOfferingText(brand ?? ""),
      category: String(product.category ?? ""),
      subcategory:
        typeof product.subcategory === "string" &&
        product.subcategory.trim() !== ""
          ? product.subcategory
          : null,
      displayState: product.displayState as MasterOfferingDisplayState,
      aliases,
      normalizedAliases: uniqueSorted(aliases.map(normalizeOfferingText)),
      sourceSkus: [],
      sheetRows: [],
      variants,
    };
    return offering;
  });

  return {
    label: input.label,
    fidelity: "artifact",
    sourceWorkbookSha256,
    sourceRowCount: 0,
    offerings,
    holds: [],
    issues: [],
  };
}

export function countVariants(revision: CatalogRevision): number {
  return revision.offerings.reduce(
    (sum, offering) => sum + offering.variants.length,
    0,
  );
}

/**
 * The duplicate_source_row findings the normalizer already reports, surfaced per
 * run rather than left inside the audit file. Empty on an artifact revision,
 * which carries no issues.
 */
export function duplicateSourceRowIssues(
  revision: CatalogRevision,
): readonly MasterOfferingImportIssue[] {
  return revision.issues.filter(
    (issue) => issue.code === "duplicate_source_row",
  );
}
