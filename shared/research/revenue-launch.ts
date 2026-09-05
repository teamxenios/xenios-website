/** Protected Product Control read projection, never a mutable evidence authority.
 * States are supplied by canonical server evidence. The client must not promote
 * a state from labels, price, a successful empty lookup or its own clock.
 * Runtime parser/projection implementations enforce the wire constraints.
 */
export const RECONCILIATION_REVIEW_SCHEMA_VERSION = 1 as const;
export const RECONCILIATION_FACT_KINDS = ["identity_binding", "formulation", "unit_of_sale", "supplier"] as const;
export const RECONCILIATION_EVIDENCE_STATES = ["UNKNOWN", "PENDING", "CONFIRMED", "EXPIRED", "REJECTED"] as const;
export const RECONCILIATION_REVIEW_PATH = "/api/admin/research/products/revenue-launch/reconciliation" as const;
export const RECONCILIATION_SOURCE_SET_ID = "seth-revenue-launch-20260905" as const;
export const RECONCILIATION_PACKAGE_SHA256 = "cb33226b379268f42a9ca1a1b62ad59eb3f1d929778fdc33c631c159ef910033";
export const RECONCILIATION_MANIFEST_SHA256 = "8f805f1a13defcd552bf838c4575af8a25a5aa25ffcab2ea4ddb2458188827e7";
export const RECONCILIATION_SOURCE_FILE_SHA256 = "6b19efe85ff533bccc34ea2d26a895c1d735fcf2def2a7631e7f798b7fb2e211";
export const RECONCILIATION_MAPPING_EXCEPTIONS = ["XRUO-007", "XRUO-014", "XRUO-024", "XRUO-026", "XRUO-035"] as const;
export const RECONCILIATION_FORMULATION_EXCEPTIONS = ["XRUO-009", "XRUO-010", "XRUO-013", "XRUO-014", "XRUO-025", "XRUO-039"] as const;

export type EvidenceState =
  | "UNKNOWN" | "PENDING" | "CONFIRMED" | "EXPIRED" | "REJECTED";

export type FactKind =
  | "identity_binding" | "formulation" | "unit_of_sale" | "supplier";

export type ExactIdentity = Readonly<{
  productId: string;
  variantId: string;
  sku: string;
}>;

// Only safe references to records the viewer may inspect; never raw evidence.
export type EvidenceReference = Readonly<{
  authority: "source_reconciliation" | "required_input" | "supplier_confirmation";
  recordId: string;
  recordRevision: string; // Canonical version or immutable record digest.
  observedAt: string;     // UTC ISO timestamp of the source observation.
  reviewedAt: string | null;
  reviewerLabel: string | null; // Server-redacted display label, not contact data.
  expiresAt: string | null;
  href: string | null;    // Authorized internal read/navigation link only.
}>;

export type UnknownReason =
  | "missing_binding" | "confirmation_required" | "not_checked"
  | "no_current_evidence" | "read_unavailable" | "revision_mismatch"
  | "superseded" | "not_applicable" | "withdrawn" | "invalid_evidence";

export type ReviewFact =
  | Readonly<{
      state: "UNKNOWN";
      reason: UnknownReason;
      observedAt: string | null; // Successful empty read time, if known.
      evidence: EvidenceReference | null; // May reference inapplicable history.
    }>
  | Readonly<{
      state: "PENDING";
      reason: "review_requested";
      observedAt: string;
      evidence: EvidenceReference; // The actual submitted review/request record.
    }>
  | Readonly<{
      state: "CONFIRMED";
      reason: "exact_identity_reverified" | "verified_fact";
      observedAt: string;
      evidence: EvidenceReference;
    }>
  | Readonly<{
      state: "EXPIRED";
      reason: "validity_ended";
      observedAt: string;
      evidence: EvidenceReference & Readonly<{ expiresAt: string }>;
    }>
  | Readonly<{
      state: "REJECTED";
      reason: "explicit_rejection";
      observedAt: string;
      evidence: EvidenceReference;
    }>;

export type ReconciliationReviewRow = Readonly<{
  sourceId: string;
  launchItemId: string;
  sourcePointer: string; // Exact JSON pointer into the immutable source file.
  sourceRowSha256: string;
  productLabel: string;
  configurationLabel: string; // Preserve source assumption/DAC distinctions.
  issueKinds: readonly ("identity_binding" | "formulation")[];
  exactIdentity: ExactIdentity | null; // Corroborated join, NOT commerce approval.
  proposedIdentity: ExactIdentity | null; // Explicit recorded proposal only.
  facts: Readonly<Record<FactKind, ReviewFact>>;
}>;

export type ReconciliationReviewResponse =
  | Readonly<{
      status: "AVAILABLE";
      schemaVersion: 1;
      projectedAt: string; // Server clock; does not refresh evidence observations.
      source: Readonly<{
        sourceSetId: string;
        packageSha256: string;
        manifestSha256: string;
        sourceFileSha256: string;
        scope: "phase_a_exceptions" | "phase_a";
      }>;
      coverage: Readonly<{
        complete: true;
        expectedRows: number;
        returnedRows: number;
      }>;
      rows: readonly ReconciliationReviewRow[];
    }>
  | Readonly<{
      status: "UNAVAILABLE";
      schemaVersion: 1;
      reason: "source_unavailable" | "source_invalid" | "projection_unavailable";
    }>;

type WireObject = Record<string, unknown>;
function object(value: unknown): value is WireObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: WireObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function text(value: unknown, max = 240): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function identifier(value: unknown): value is string {
  return text(value, 120) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}
function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function utc(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}
function identity(value: unknown): value is ExactIdentity {
  return object(value) && exactKeys(value, ["productId", "variantId", "sku"]) &&
    identifier(value.productId) && identifier(value.variantId) && identifier(value.sku);
}
const UNKNOWN_REASONS: readonly string[] = ["missing_binding", "confirmation_required", "not_checked",
  "no_current_evidence", "read_unavailable", "revision_mismatch", "superseded", "not_applicable", "withdrawn", "invalid_evidence"];
function reference(value: unknown, rowIdentity: ExactIdentity | null, projectedAt: string): value is EvidenceReference {
  if (!object(value) || !exactKeys(value, ["authority", "recordId", "recordRevision", "observedAt", "reviewedAt", "reviewerLabel", "expiresAt", "href"])) return false;
  if (!["source_reconciliation", "required_input", "supplier_confirmation"].includes(String(value.authority)) ||
      !identifier(value.recordId) || !text(value.recordRevision, 200) || !utc(value.observedAt) ||
      Date.parse(value.observedAt) > Date.parse(projectedAt) ||
      !(value.reviewedAt === null || utc(value.reviewedAt)) ||
      !(value.reviewerLabel === null || text(value.reviewerLabel, 120)) ||
      !(value.expiresAt === null || utc(value.expiresAt))) return false;
  if (value.reviewedAt !== null && Date.parse(value.reviewedAt as string) > Date.parse(value.observedAt)) return false;
  // The first mounted reference destination is canonical Product Control only.
  // No arbitrary path, query, external URL or encoded credential-bearing link.
  return value.href === null || (rowIdentity !== null && value.href === `/admin/research/products/${rowIdentity.productId}`);
}
function fact(value: unknown, kind: FactKind, rowIdentity: ExactIdentity | null, projectedAt: string): value is ReviewFact {
  if (!object(value) || !exactKeys(value, ["state", "reason", "observedAt", "evidence"]) ||
      !(value.observedAt === null || utc(value.observedAt))) return false;
  if (value.observedAt !== null && Date.parse(value.observedAt as string) > Date.parse(projectedAt)) return false;
  if (value.evidence !== null && !reference(value.evidence, rowIdentity, projectedAt)) return false;
  if (value.state === "UNKNOWN") return UNKNOWN_REASONS.includes(String(value.reason));
  if (value.observedAt === null || value.evidence === null) return false;
  const evidence = value.evidence as EvidenceReference;
  if (Date.parse(evidence.observedAt) > Date.parse(value.observedAt as string)) return false;
  switch (value.state) {
    case "PENDING": return value.reason === "review_requested";
    case "CONFIRMED":
      if (rowIdentity === null || (evidence.expiresAt !== null && Date.parse(evidence.expiresAt) <= Date.parse(projectedAt))) return false;
      if (value.reason === "exact_identity_reverified") return kind === "identity_binding" && evidence.authority === "source_reconciliation";
      return value.reason === "verified_fact" && (kind === "supplier" ? evidence.authority === "supplier_confirmation" : evidence.authority === "required_input");
    case "EXPIRED": return value.reason === "validity_ended" && evidence.expiresAt !== null && Date.parse(evidence.expiresAt) <= Date.parse(projectedAt);
    case "REJECTED": return value.reason === "explicit_rejection";
    default: return false;
  }
}

/** Strict wire validation only. It never manufactures, upgrades or refreshes an
 * evidence state; source applicability and decision authority stay server-owned.
 * An invalid/partial response is null, never an AVAILABLE empty list.
 */
export function readReconciliationReviewResponse(value: unknown): ReconciliationReviewResponse | null {
  if (!object(value) || value.schemaVersion !== 1) return null;
  if (value.status === "UNAVAILABLE") {
    return exactKeys(value, ["status", "schemaVersion", "reason"]) &&
      ["source_unavailable", "source_invalid", "projection_unavailable"].includes(String(value.reason))
      ? value as ReconciliationReviewResponse : null;
  }
  if (value.status !== "AVAILABLE" || !exactKeys(value, ["status", "schemaVersion", "projectedAt", "source", "coverage", "rows"]) ||
      !utc(value.projectedAt) || !object(value.source) || !object(value.coverage) || !Array.isArray(value.rows)) return null;
  const source = value.source;
  if (!exactKeys(source, ["sourceSetId", "packageSha256", "manifestSha256", "sourceFileSha256", "scope"]) ||
      source.sourceSetId !== RECONCILIATION_SOURCE_SET_ID || source.packageSha256 !== RECONCILIATION_PACKAGE_SHA256 ||
      source.manifestSha256 !== RECONCILIATION_MANIFEST_SHA256 || source.sourceFileSha256 !== RECONCILIATION_SOURCE_FILE_SHA256 ||
      !["phase_a", "phase_a_exceptions"].includes(String(source.scope))) return null;
  const expected = source.scope === "phase_a"
    ? Array.from({ length: 39 }, (_, index) => `XRUO-${String(index + 1).padStart(3, "0")}`)
    : [...new Set<string>([...RECONCILIATION_MAPPING_EXCEPTIONS, ...RECONCILIATION_FORMULATION_EXCEPTIONS])];
  if (!exactKeys(value.coverage, ["complete", "expectedRows", "returnedRows"]) || value.coverage.complete !== true ||
      value.coverage.expectedRows !== expected.length || value.coverage.returnedRows !== expected.length || value.rows.length !== expected.length) return null;
  const seen = new Set<string>();
  for (const row of value.rows) {
    if (!object(row) || !exactKeys(row, ["sourceId", "launchItemId", "sourcePointer", "sourceRowSha256", "productLabel", "configurationLabel", "issueKinds", "exactIdentity", "proposedIdentity", "facts"]) ||
        typeof row.sourceId !== "string" || !expected.includes(row.sourceId) || seen.has(row.sourceId)) return null;
    seen.add(row.sourceId);
    if (row.launchItemId !== `LIVE-EXISTING-${row.sourceId.slice(-3)}` ||
        row.sourcePointer !== `/phaseAExistingDirectBuy/${Number(row.sourceId.slice(-3)) - 1}` ||
        !digest(row.sourceRowSha256) || !text(row.productLabel) || !text(row.configurationLabel, 500) ||
        !Array.isArray(row.issueKinds) || !(row.exactIdentity === null || identity(row.exactIdentity)) ||
        !(row.proposedIdentity === null || identity(row.proposedIdentity)) || !object(row.facts) ||
        !exactKeys(row.facts, RECONCILIATION_FACT_KINDS)) return null;
    const issues: string[] = [];
    if ((RECONCILIATION_MAPPING_EXCEPTIONS as readonly string[]).includes(row.sourceId)) issues.push("identity_binding");
    if ((RECONCILIATION_FORMULATION_EXCEPTIONS as readonly string[]).includes(row.sourceId)) issues.push("formulation");
    const issueKinds = row.issueKinds;
    if (issueKinds.length !== issues.length || new Set(issueKinds).size !== issues.length ||
        !issues.every((issue) => issueKinds.includes(issue))) return null;
    const exactIdentity = row.exactIdentity as ExactIdentity | null;
    for (const kind of RECONCILIATION_FACT_KINDS) if (!fact(row.facts[kind], kind, exactIdentity, value.projectedAt)) return null;
    if (((row.facts.identity_binding as ReviewFact).state === "CONFIRMED") !== (exactIdentity !== null)) return null;
  }
  return value as ReconciliationReviewResponse;
}
