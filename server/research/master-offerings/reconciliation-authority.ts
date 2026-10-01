import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogReconciliation } from "./catalog-reconciliation";

/** One reviewed record. A newer filename never changes the active authority. */
export const PINNED_RECONCILIATION_FILE = "master-catalog-reconciliation-20260821.json";
export const RECONCILED_WORKBOOK_SHA256 = "6478ad0d3f710b75c6bf0c5f5e56ff1189ab2a2a4439cab23c2a28498134ea6f";

export interface ReviewedReconciliationAuthority {
  readonly file: typeof PINNED_RECONCILIATION_FILE;
  /** SHA-256 of source text encoded as UTF-8 after CRLF-to-LF normalization. */
  readonly sha256: string;
  readonly reconciliation: CatalogReconciliation;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fail(): never {
  throw new Error("Pinned catalog reconciliation is unavailable or inconsistent.");
}

/** Pure parsing, also used by the builder and bounded unit fixtures. */
export function parsePinnedReconciliationAuthority(bytes: string): ReviewedReconciliationAuthority {
  const raw: unknown = JSON.parse(bytes);
  if (!record(raw) || raw.schemaVersion !== 1 || !record(raw.sourceWorkbook) ||
      raw.sourceWorkbook.sha256 !== RECONCILED_WORKBOOK_SHA256 ||
      raw.sourceWorkbook.sourceRows !== 426 || !record(raw.expected) ||
      raw.expected.sourceRows !== 426 || raw.expected.canonicalVariants !== 424 ||
      !Array.isArray(raw.merges) || !Array.isArray(raw.commerceHolds)) fail();
  const sources = new Set<string>();
  const variants = new Set<string>();
  for (const hold of raw.commerceHolds) {
    if (!record(hold) || typeof hold.sourceRow !== "string" || !/^GRP-\d{4}$/.test(hold.sourceRow) ||
        typeof hold.specification !== "string" || hold.specification.trim() === "" ||
        typeof hold.product !== "string" || hold.product.trim() === "" ||
        !record(hold.catalogIdentity) ||
        typeof hold.catalogIdentity.offeringId !== "string" || !/^mo_[a-f0-9]{20}$/.test(hold.catalogIdentity.offeringId) ||
        typeof hold.catalogIdentity.offeringVariantId !== "string" || !/^mov_[a-f0-9]{20}$/.test(hold.catalogIdentity.offeringVariantId) ||
        sources.has(hold.sourceRow) || variants.has(hold.catalogIdentity.offeringVariantId)) fail();
    sources.add(hold.sourceRow);
    variants.add(hold.catalogIdentity.offeringVariantId);
  }
  return Object.freeze({
    file: PINNED_RECONCILIATION_FILE,
    // Git checks out this record with platform line endings. Only CRLF is
    // normalized; JSON whitespace, key order and every other content change
    // remain meaningful. This is not the workbook raw-byte checksum.
    sha256: createHash("sha256").update(bytes.replace(/\r\n/g, "\n"), "utf8").digest("hex"),
    reconciliation: raw as unknown as CatalogReconciliation,
  });
}

export function readPinnedReconciliationAuthority(cwd = process.cwd()): ReviewedReconciliationAuthority {
  // Same bounded parent contract as the committed dataset locator. Only an
  // absent exact file permits trying a parent; malformed or unreadable nearer
  // policy must never fall through to a different authority.
  let directory = path.resolve(cwd);
  for (let step = 0; step <= 3; step += 1) {
    let bytes: string;
    try {
      bytes = readFileSync(path.resolve(directory, "config", "research", PINNED_RECONCILIATION_FILE), "utf8");
    } catch (error) {
      if (!record(error) || error.code !== "ENOENT") throw error;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
      continue;
    }
    return parsePinnedReconciliationAuthority(bytes);
  }
  return fail();
}

/**
 * Validate lineage, never grant commerce. The approved new workbook requires
 * this exact record/hash. Historical and synthetic unreconciled datasets remain
 * readable, but cannot impersonate an approved reconciled catalog.
 */
export function assertDatasetReconciliationAuthority(
  raw: Record<string, unknown>,
  authority?: ReviewedReconciliationAuthority,
): void {
  if (raw.sourceWorkbookSha256 !== RECONCILED_WORKBOOK_SHA256 && raw.reconciliation === undefined) return;
  if (!authority || raw.sourceWorkbookSha256 !== authority.reconciliation.sourceWorkbook.sha256) fail();
  const metadata = raw.reconciliation;
  if (!record(metadata) || metadata.file !== authority.file || metadata.sha256 !== authority.sha256 ||
      metadata.sourceRows !== authority.reconciliation.expected.sourceRows ||
      metadata.canonicalRows !== authority.reconciliation.expected.canonicalVariants ||
      raw.workbookSourceRowCount !== authority.reconciliation.expected.sourceRows ||
      raw.sourceRowCount !== authority.reconciliation.expected.canonicalVariants ||
      !Array.isArray(metadata.commerceHeldRows) || !record(metadata.provenance) ||
      !Array.isArray(raw.products) || raw.products.length !== authority.reconciliation.expected.canonicalVariants) fail();
  const expectedSources = authority.reconciliation.commerceHolds.map((hold) => hold.sourceRow).sort();
  if (JSON.stringify([...metadata.commerceHeldRows].sort()) !== JSON.stringify(expectedSources)) fail();
  const identities = new Map<string, string>();
  for (const product of raw.products) {
    if (!record(product) || typeof product.id !== "string" || !Array.isArray(product.variants) ||
        product.variants.length !== 1 || !record(product.variants[0]) ||
        typeof product.variants[0].id !== "string" || identities.has(product.variants[0].id)) fail();
    identities.set(product.variants[0].id, product.id);
  }
  for (const hold of authority.reconciliation.commerceHolds) {
    if (identities.get(hold.catalogIdentity.offeringVariantId) !== hold.catalogIdentity.offeringId) fail();
    const sourceRows = metadata.provenance[hold.sourceRow];
    if (!Array.isArray(sourceRows) || !sourceRows.includes(hold.sourceRow)) fail();
  }
}
