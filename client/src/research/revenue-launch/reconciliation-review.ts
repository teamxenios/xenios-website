import {
  RECONCILIATION_EVIDENCE_STATES,
  RECONCILIATION_FACT_KINDS,
  RECONCILIATION_REVIEW_PATH,
  type EvidenceReference,
  type EvidenceState,
  type ExactIdentity,
  type FactKind,
  type ReconciliationReviewResponse,
  type ReconciliationReviewRow,
  type ReviewFact,
  type UnknownReason,
} from "@shared/research/revenue-launch";
import { apiGet, type ApiResult } from "../lib/api";

/**
 * Read the server-owned reconciliation projection. This adapter deliberately
 * rejects malformed data instead of allowing a browser-provided label, clock,
 * or empty response to look like evidence.
 */
export async function getReconciliationReview(
  token: string,
): Promise<ApiResult<ReconciliationReviewResponse>> {
  const result = await apiGet<unknown>(RECONCILIATION_REVIEW_PATH, token);
  if (result.kind !== "ok") return result;
  if (!reconciliationReviewResponseValid(result.data)) {
    return {
      kind: "error",
      code: "invalid_reconciliation_response",
      message: "The reconciliation review returned an invalid response.",
    };
  }
  return { kind: "ok", data: result.data };
}

export function reconciliationReviewResponseValid(
  value: unknown,
): value is ReconciliationReviewResponse {
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      (value.status !== "AVAILABLE" && value.status !== "UNAVAILABLE")) return false;
  if (value.status === "UNAVAILABLE") {
    return value.reason === "source_unavailable" ||
      value.reason === "source_invalid" || value.reason === "projection_unavailable";
  }
  if (typeof value.projectedAt !== "string" || !isRecord(value.source) ||
      !isRecord(value.coverage) || value.coverage.complete !== true ||
      !isNonNegativeInteger(value.coverage.expectedRows) ||
      !isNonNegativeInteger(value.coverage.returnedRows) ||
      value.coverage.returnedRows > value.coverage.expectedRows ||
      !Array.isArray(value.rows) ||
      !isSource(value.source)) return false;
  const coverage = value.coverage;
  const projectedAt = value.projectedAt as string;
  if (value.rows.length !== coverage.returnedRows) return false;
  const seen = new Set<string>();
  return value.rows.every((row) => {
    if (!isReviewRow(row, projectedAt)) return false;
    const reviewRow = row as ReconciliationReviewRow;
    if (seen.has(reviewRow.sourceId)) return false;
    seen.add(reviewRow.sourceId);
    return true;
  });
}

function isReviewRow(value: unknown, projectedAt: string): value is ReconciliationReviewRow {
  if (!isRecord(value) || !nonEmptyString(value.sourceId) || !nonEmptyString(value.launchItemId) ||
      !nonEmptyString(value.sourcePointer) || !sha256(value.sourceRowSha256) ||
      !nonEmptyString(value.productLabel) || !nonEmptyString(value.configurationLabel) ||
      !Array.isArray(value.issueKinds) || !value.issueKinds.every(isIssueKind) ||
      !isNullableIdentity(value.exactIdentity) || !isNullableIdentity(value.proposedIdentity) ||
      !isFacts(value.facts)) return false;
  const facts = value.facts;
  const exactIdentity = value.exactIdentity as ExactIdentity | null;
  if (!RECONCILIATION_FACT_KINDS.every((kind) => isReviewFact(kind, facts[kind], exactIdentity, projectedAt))) return false;
  return ((facts.identity_binding as ReviewFact).state === "CONFIRMED") === (exactIdentity !== null);
}

function isFacts(value: unknown): value is Record<FactKind, ReviewFact> {
  return isRecord(value);
}

function isReviewFact(kind: FactKind, value: unknown, exactIdentity: ExactIdentity | null, projectedAt: string): value is ReviewFact {
  if (!isRecord(value) || !isEvidenceState(value.state) || !nonEmptyString(value.reason) ||
      !nullableTimestamp(value.observedAt) || !isNullableEvidence(value.evidence, exactIdentity, projectedAt)) return false;
  if (value.evidence !== null) {
    if (Date.parse(value.evidence.observedAt) > Date.parse(projectedAt)) return false;
    if (value.evidence.reviewedAt !== null && Date.parse(value.evidence.reviewedAt) > Date.parse(value.evidence.observedAt)) return false;
  }
  if (value.state === "UNKNOWN") {
    return isUnknownReason(value.reason);
  }
  if (value.state === "PENDING") return value.reason === "review_requested" && value.evidence !== null;
  if (value.state === "CONFIRMED") {
    if (exactIdentity === null || value.evidence === null || typeof value.observedAt !== "string" ||
        value.evidence.observedAt > value.observedAt ||
        (value.evidence.expiresAt !== null && Date.parse(value.evidence.expiresAt) <= Date.parse(projectedAt))) return false;
    if (value.reason === "exact_identity_reverified") {
      return kind === "identity_binding" && value.evidence.authority === "source_reconciliation";
    }
    return value.reason === "verified_fact" &&
      value.evidence.authority === (kind === "supplier" ? "supplier_confirmation" : "required_input");
  }
  if (value.state === "EXPIRED") {
    if (value.reason !== "validity_ended" || value.evidence === null ||
        value.evidence.expiresAt === null || typeof value.observedAt !== "string") return false;
    return Date.parse(value.evidence.expiresAt) <= Date.parse(projectedAt);
  }
  return value.reason === "explicit_rejection" && value.evidence !== null;
}

function isEvidence(value: unknown, exactIdentity: ExactIdentity | null, projectedAt: string): value is EvidenceReference {
  return isRecord(value) &&
    (value.authority === "source_reconciliation" || value.authority === "required_input" || value.authority === "supplier_confirmation") &&
    nonEmptyString(value.recordId) && nonEmptyString(value.recordRevision) &&
    typeof value.observedAt === "string" && nullableTimestamp(value.reviewedAt) &&
    nullableString(value.reviewerLabel) && nullableTimestamp(value.expiresAt) &&
    nullableString(value.href) &&
    (value.href === null || (exactIdentity !== null && value.href === `/admin/research/products/${exactIdentity.productId}`)) &&
    Date.parse(value.observedAt as string) <= Date.parse(projectedAt);
}

function isNullableEvidence(value: unknown, exactIdentity: ExactIdentity | null, projectedAt: string): value is EvidenceReference | null {
  return value === null || isEvidence(value, exactIdentity, projectedAt);
}

function isSource(value: Record<string, unknown>): boolean {
  return nonEmptyString(value.sourceSetId) && sha256(value.packageSha256) &&
    sha256(value.manifestSha256) && sha256(value.sourceFileSha256) &&
    (value.scope === "phase_a" || value.scope === "phase_a_exceptions");
}

function isNullableIdentity(value: unknown): boolean {
  return value === null || (isRecord(value) && nonEmptyString(value.productId) && nonEmptyString(value.variantId) && nonEmptyString(value.sku));
}

function isEvidenceState(value: unknown): value is EvidenceState {
  return RECONCILIATION_EVIDENCE_STATES.some((state) => state === value);
}

function isIssueKind(value: unknown): value is FactKind {
  return value === "identity_binding" || value === "formulation";
}

function isUnknownReason(value: string): value is UnknownReason {
  return ["missing_binding", "confirmation_required", "not_checked", "no_current_evidence", "read_unavailable", "revision_mismatch", "superseded", "not_applicable", "withdrawn", "invalid_evidence"].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
