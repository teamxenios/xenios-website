import { readFileSync } from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import {
  RECONCILIATION_FACT_KINDS,
  RECONCILIATION_FORMULATION_EXCEPTIONS,
  RECONCILIATION_MAPPING_EXCEPTIONS,
  RECONCILIATION_MANIFEST_SHA256,
  RECONCILIATION_PACKAGE_SHA256,
  RECONCILIATION_REVIEW_PATH,
  RECONCILIATION_SOURCE_FILE_SHA256,
  RECONCILIATION_SOURCE_SET_ID,
  type ExactIdentity,
  type ReconciliationReviewResponse,
  type ReviewFact,
  type UnknownReason,
} from "@shared/research/revenue-launch";

export const RECONCILIATION_SOURCE_PATH = path.join(
  "config",
  "research",
  "revenue-launch",
  "seth-source-reconciliation-20260905.json",
);
export const RECONCILIATION_CANONICAL_PATH = path.join(
  "docs",
  "revenue-launch",
  "20260905",
  "canonical-reconciliation.json",
);
export const RECONCILIATION_SUPPLIER_PATH = path.join(
  "docs",
  "revenue-launch",
  "20260905",
  "complete-package-supplier-confirmations.json",
);

type ReconciliationScope = "phase_a" | "phase_a_exceptions";
type Guard = (req: Request, res: Response, next: NextFunction) => unknown;

export interface RevenueLaunchReconciliationRouteDependencies {
  requireAdmin: Guard;
  project?: (scope: ReconciliationScope) => ReconciliationReviewResponse;
}

type JsonObject = Record<string, unknown>;
type SourceRow = JsonObject & {
  sourceId: string;
  launchItemId: string;
  sourcePointer: string;
  sourceRowSha256: string;
  sourceProduct: string;
  sourceConfiguration: string;
};

class ReconciliationProjectionError extends Error {
  constructor(readonly reason: "source_unavailable" | "source_invalid" | "projection_unavailable") {
    super(reason);
  }
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function identifier(value: unknown): value is string {
  return text(value) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function utc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function readJson(cwd: string, relativePath: string): unknown {
  const filePath = path.resolve(cwd, relativePath);
  let bytes: string;
  try {
    bytes = readFileSync(filePath, "utf8");
  } catch {
    throw new ReconciliationProjectionError("source_unavailable");
  }
  try {
    return JSON.parse(bytes) as unknown;
  } catch {
    throw new ReconciliationProjectionError("source_invalid");
  }
}

function currentIdentity(value: unknown): ExactIdentity | null {
  if (value === null) return null;
  if (!object(value) || !identifier(value.productId) || !identifier(value.variantId) || !identifier(value.sku)) {
    throw new ReconciliationProjectionError("source_invalid");
  }
  return {
    productId: value.productId,
    variantId: value.variantId,
    sku: value.sku,
  };
}

function sourceRows(value: unknown): readonly SourceRow[] {
  if (!object(value) || !Array.isArray(value.phaseA) || value.phaseA.length !== 39 || value.phaseACount !== 39) {
    throw new ReconciliationProjectionError("source_invalid");
  }
  const seen = new Set<string>();
  return value.phaseA.map((row, index) => {
    if (!object(row) || !text(row.sourceId) || !text(row.launchItemId) || !text(row.sourcePointer) ||
        !digest(row.sourceRowSha256) || !text(row.sourceProduct) || !text(row.sourceConfiguration) ||
        row.sourceId !== `XRUO-${String(index + 1).padStart(3, "0")}` ||
        row.launchItemId !== `LIVE-EXISTING-${String(index + 1).padStart(3, "0")}` ||
        row.sourcePointer !== `/phaseAExistingDirectBuy/${index}` || seen.has(String(row.sourceId))) {
      throw new ReconciliationProjectionError("source_invalid");
    }
    seen.add(String(row.sourceId));
    return row as SourceRow;
  });
}

function canonicalRows(value: unknown): { bySourceId: ReadonlyMap<string, JsonObject>; observedAt: string; revision: string } {
  if (!object(value) || !Array.isArray(value.rows) || value.rows.length !== 39 || !utc(value.productionObservedAt) ||
      !object(value.inputHashes) || !digest(value.inputHashes.historical)) {
    throw new ReconciliationProjectionError("source_invalid");
  }
  const bySourceId = new Map<string, JsonObject>();
  for (const row of value.rows) {
    if (!object(row) || !text(row.sourceId) || bySourceId.has(row.sourceId)) {
      throw new ReconciliationProjectionError("source_invalid");
    }
    bySourceId.set(row.sourceId, row);
  }
  return {
    bySourceId,
    observedAt: value.productionObservedAt,
    revision: `canonical-reconciliation:${value.inputHashes.historical}`,
  };
}

function supplierObservation(value: unknown): { observedAt: string | null; mapped: ReadonlySet<string> } {
  if (!object(value)) return { observedAt: null, mapped: new Set() };
  if (value.observedAt !== undefined && !utc(value.observedAt)) {
    throw new ReconciliationProjectionError("source_invalid");
  }
  const mapped = new Set<string>();
  if (Array.isArray(value.rows)) {
    for (const row of value.rows) {
      if (!object(row) || !text(row.sourceId) || row.currentConfirmationPresent !== false) {
        throw new ReconciliationProjectionError("source_invalid");
      }
      mapped.add(row.sourceId);
    }
  }
  return { observedAt: typeof value.observedAt === "string" ? value.observedAt : null, mapped };
}

function unknownFact(reason: UnknownReason, observedAt: string | null): ReviewFact {
  return { state: "UNKNOWN", reason, observedAt, evidence: null };
}

function identityFact(identity: ExactIdentity | null, sourceId: string, observedAt: string, revision: string): ReviewFact {
  if (identity === null) return unknownFact("missing_binding", null);
  return {
    state: "CONFIRMED",
    reason: "exact_identity_reverified",
    observedAt,
    evidence: {
      authority: "source_reconciliation",
      recordId: sourceId,
      recordRevision: revision,
      observedAt,
      reviewedAt: null,
      reviewerLabel: null,
      expiresAt: null,
      href: `/admin/research/products/${identity.productId}`,
    },
  };
}

function validatePackage(source: JsonObject): void {
  const sourceHashes = source.sourceHashes;
  if (!digest(source.packageArchiveSha256) || source.packageArchiveSha256 !== RECONCILIATION_PACKAGE_SHA256 ||
      !digest(source.packageManifestSha256) || source.packageManifestSha256 !== RECONCILIATION_MANIFEST_SHA256 ||
      !object(sourceHashes) ||
      sourceHashes["manifests/XENIOS_SETH_LIVE_REVENUE_LAUNCH_MANIFEST_2026-09-05.json"] !== RECONCILIATION_SOURCE_FILE_SHA256) {
    throw new ReconciliationProjectionError("source_invalid");
  }
}

/**
 * Project the committed, immutable launch reconciliation into the shared
 * read-only wire contract. This function never reads prices, writes evidence,
 * or treats the source package as an approval or release authority.
 */
export function projectRevenueLaunchReconciliation(options: {
  cwd?: string;
  now?: Date;
  scope?: ReconciliationScope;
} = {}): ReconciliationReviewResponse {
  const scope = options.scope ?? "phase_a_exceptions";
  try {
    const cwd = options.cwd ?? process.cwd();
    const source = readJson(cwd, RECONCILIATION_SOURCE_PATH);
    if (!object(source)) throw new ReconciliationProjectionError("source_invalid");
    validatePackage(source);
    const rows = sourceRows(source);
    const canonical = canonicalRows(readJson(cwd, RECONCILIATION_CANONICAL_PATH));
    let supplierSource: unknown;
    try {
      supplierSource = readJson(cwd, RECONCILIATION_SUPPLIER_PATH);
    } catch (error) {
      if (error instanceof ReconciliationProjectionError && error.reason === "source_unavailable") {
        supplierSource = undefined;
      } else {
        throw error;
      }
    }
    const supplier = supplierObservation(supplierSource);
    const projectedAt = (options.now ?? new Date()).toISOString();
    if (!utc(projectedAt)) throw new ReconciliationProjectionError("projection_unavailable");
    if (Date.parse(canonical.observedAt) > Date.parse(projectedAt) ||
        (supplier.observedAt !== null && Date.parse(supplier.observedAt) > Date.parse(projectedAt))) {
      throw new ReconciliationProjectionError("projection_unavailable");
    }
    const exceptions = new Set<string>([
      ...RECONCILIATION_MAPPING_EXCEPTIONS,
      ...RECONCILIATION_FORMULATION_EXCEPTIONS,
    ]);
    const expectedRows = scope === "phase_a" ? rows : rows.filter((row) => exceptions.has(String(row.sourceId)));
    const projected = expectedRows.map((row) => {
      const sourceId = String(row.sourceId);
      const canonicalRow = canonical.bySourceId.get(sourceId);
      if (!canonicalRow) throw new ReconciliationProjectionError("source_invalid");
      const exactIdentity = currentIdentity(canonicalRow.currentCanonicalIdentity);
      const formulationReason = (RECONCILIATION_FORMULATION_EXCEPTIONS as readonly string[]).includes(sourceId)
        ? "confirmation_required"
        : "not_checked";
      const supplierReason = supplier.mapped.has(sourceId) ? "no_current_evidence" : "not_checked";
      return {
        sourceId,
        launchItemId: row.launchItemId,
        sourcePointer: row.sourcePointer,
        sourceRowSha256: row.sourceRowSha256,
        productLabel: row.sourceProduct,
        configurationLabel: row.sourceConfiguration,
        issueKinds: [
          ...((RECONCILIATION_MAPPING_EXCEPTIONS as readonly string[]).includes(sourceId) ? ["identity_binding" as const] : []),
          ...((RECONCILIATION_FORMULATION_EXCEPTIONS as readonly string[]).includes(sourceId) ? ["formulation" as const] : []),
        ],
        exactIdentity,
        proposedIdentity: null,
        facts: {
          identity_binding: identityFact(exactIdentity, sourceId, canonical.observedAt, canonical.revision),
          formulation: unknownFact(formulationReason, null),
          unit_of_sale: unknownFact("no_current_evidence", canonical.observedAt),
          supplier: unknownFact(supplierReason, supplier.mapped.has(sourceId) ? supplier.observedAt : null),
        },
      };
    });
    return {
      status: "AVAILABLE",
      schemaVersion: 1,
      projectedAt,
      source: {
        sourceSetId: RECONCILIATION_SOURCE_SET_ID,
        packageSha256: RECONCILIATION_PACKAGE_SHA256,
        manifestSha256: RECONCILIATION_MANIFEST_SHA256,
        sourceFileSha256: RECONCILIATION_SOURCE_FILE_SHA256,
        scope,
      },
      coverage: { complete: true, expectedRows: projected.length, returnedRows: projected.length },
      rows: projected,
    };
  } catch (error) {
    if (error instanceof ReconciliationProjectionError) {
      return { status: "UNAVAILABLE", schemaVersion: 1, reason: error.reason };
    }
    return { status: "UNAVAILABLE", schemaVersion: 1, reason: "projection_unavailable" };
  }
}

function noStore(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
}

/** Mount the Product Control reconciliation read behind the canonical admin guard. */
export function registerRevenueLaunchReconciliationApi(
  app: Express,
  deps: RevenueLaunchReconciliationRouteDependencies,
): void {
  app.get(RECONCILIATION_REVIEW_PATH, deps.requireAdmin, (req, res) => {
    noStore(res);
    const requestedScope = req.query.scope;
    if (requestedScope !== undefined && requestedScope !== "phase_a" && requestedScope !== "phase_a_exceptions") {
      res.status(400).json({ ok: false, code: "validation_failed", message: "scope must be phase_a or phase_a_exceptions" });
      return;
    }
    const scope = (requestedScope ?? "phase_a_exceptions") as ReconciliationScope;
    const projection = deps.project?.(scope) ?? projectRevenueLaunchReconciliation({ scope });
    if (projection.status === "UNAVAILABLE") {
      res.status(503).json(projection);
      return;
    }
    res.json(projection);
  });
}
