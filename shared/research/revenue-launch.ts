/** Protected Product Control read projection, never a mutable evidence authority.
 * States are supplied by canonical server evidence. The client must not promote
 * a state from labels, price, a successful empty lookup or its own clock.
 * Runtime parser/projection implementations enforce the wire constraints.
 */
export const RECONCILIATION_REVIEW_SCHEMA_VERSION = 1 as const;
export const RECONCILIATION_FACT_KINDS = ["identity_binding", "formulation", "unit_of_sale", "supplier"] as const;
export const RECONCILIATION_EVIDENCE_STATES = ["UNKNOWN", "PENDING", "CONFIRMED", "EXPIRED", "REJECTED"] as const;
export const RECONCILIATION_REVIEW_PATH = "/api/admin/research/products/revenue-launch/reconciliation" as const;

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
