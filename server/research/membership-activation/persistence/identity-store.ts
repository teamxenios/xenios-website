import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IDENTITY_CASE_STATUSES,
  type IdentityCaseStatus,
  type IdentityDocumentCase,
} from "../identity-documents";
import {
  IDENTITY_REJECTION_CATEGORIES,
  IDENTITY_REVIEW_OUTCOMES,
  IDENTITY_REVIEW_TYPE,
  assertMinimalVerificationRecord,
  isMaskedLast4,
  type IdentityRejectionCategory,
  type IdentityReviewOutcome,
  type IdentityVerificationRecord,
} from "../identity-reviews";
import {
  IDENTITY_AUDIT_KINDS,
  type IdentityAuditEvent,
  type IdentityAuditKind,
} from "../identity-retention";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// xenios research founding membership activation: identity persistence
// (Domain 3), following the Track B persistence exemplars
// (server/research/commerce/persistence/) exactly: pure row mappers, an
// in-memory reference implementation, a Supabase implementation over an
// injected client, and a resolver that falls back to the reference when
// Supabase is not configured, so nothing half-persists.
//
// Three tables (supabase/research-fm-identity.sql):
//   research_fm_identity_cases    one header row per case (current state).
//   research_fm_identity_reviews  the minimal verification record. The ONLY
//                                 update ever applied is stamping
//                                 raw_source_deleted_at; everything else is
//                                 written once at review completion.
//   research_fm_identity_audit    APPEND-ONLY. The database trigger refuses
//                                 update and delete, and this store has no
//                                 method for either.
//
// The minimal-record contract is enforced at the WRITE: saveReview runs
// assertMinimalVerificationRecord before any client call, so a record that
// grew a forbidden field is refused here even if a caller skipped its own
// check. Reads are defensive: a row with an unknown status, outcome, or an
// overlong license fragment is dropped or scrubbed, never guessed at.
// ---------------------------------------------------------------------------

const CASES_TABLE = "research_fm_identity_cases";
const REVIEWS_TABLE = "research_fm_identity_reviews";
const AUDIT_TABLE = "research_fm_identity_audit";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface IdentityCaseRow {
  case_id: string;
  tenant_id: string;
  member_id: string;
  status: string;
  consent_version: string | null;
  consent_recorded_at: string | null;
  storage_path: string | null;
  content_type: string | null;
  upload_url_expires_at: string | null;
  uploaded_at: string | null;
  review_id: string | null;
  raw_deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IdentityReviewRow {
  review_id: string;
  case_id: string;
  tenant_id: string;
  member_id: string;
  review_type: string;
  name_match: string;
  age_threshold_met: boolean;
  document_not_expired: boolean;
  jurisdiction: string | null;
  license_last4: string | null;
  outcome: string;
  rejection_category: string | null;
  reviewer_id: string;
  started_at: string;
  completed_at: string;
  raw_source_deleted_at: string | null;
}

/** An insertable audit row. Append only: no update or delete shape exists. */
export interface IdentityAuditRow {
  tenant_id: string;
  case_id: string;
  member_id: string;
  kind: string;
  actor_type: string;
  actor_id: string | null;
  occurred_at: string;
  detail: string | null;
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

const CASE_STATUSES: ReadonlySet<string> = new Set(IDENTITY_CASE_STATUSES);
const REVIEW_OUTCOMES: ReadonlySet<string> = new Set(IDENTITY_REVIEW_OUTCOMES);
const REJECTION_CATEGORIES: ReadonlySet<string> = new Set(IDENTITY_REJECTION_CATEGORIES);
const AUDIT_KINDS: ReadonlySet<string> = new Set(IDENTITY_AUDIT_KINDS);
const AUDIT_ACTORS: ReadonlySet<string> = new Set(["member", "admin", "system"]);

export function caseToRow(record: IdentityDocumentCase): IdentityCaseRow {
  return {
    case_id: record.caseId,
    tenant_id: record.tenantId,
    member_id: record.memberId,
    status: record.status,
    consent_version: record.consentVersion,
    consent_recorded_at: record.consentRecordedAt,
    storage_path: record.storagePath,
    content_type: record.contentType,
    upload_url_expires_at: record.uploadUrlExpiresAt,
    uploaded_at: record.uploadedAt,
    review_id: record.reviewId,
    raw_deleted_at: record.rawDeletedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/** A row with a status the state machine does not know is dropped, never
 * guessed: a misread identity state must not open or close any gate. */
export function rowToCase(row: IdentityCaseRow): IdentityDocumentCase | null {
  if (!CASE_STATUSES.has(row.status)) return null;
  return {
    caseId: row.case_id,
    tenantId: row.tenant_id,
    memberId: row.member_id,
    status: row.status as IdentityCaseStatus,
    consentVersion: row.consent_version ?? null,
    consentRecordedAt: row.consent_recorded_at ?? null,
    storagePath: row.storage_path ?? null,
    contentType: row.content_type ?? null,
    uploadUrlExpiresAt: row.upload_url_expires_at ?? null,
    uploadedAt: row.uploaded_at ?? null,
    reviewId: row.review_id ?? null,
    rawDeletedAt: row.raw_deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function reviewToRow(record: IdentityVerificationRecord): IdentityReviewRow {
  return {
    review_id: record.reviewId,
    case_id: record.caseId,
    tenant_id: record.tenantId,
    member_id: record.memberId,
    review_type: record.reviewType,
    name_match: record.nameMatch,
    age_threshold_met: record.ageThresholdMet,
    document_not_expired: record.documentNotExpired,
    jurisdiction: record.jurisdiction,
    license_last4: record.licenseLast4,
    outcome: record.outcome,
    rejection_category: record.rejectionCategory,
    reviewer_id: record.reviewerId,
    started_at: record.startedAt,
    completed_at: record.completedAt,
    raw_source_deleted_at: record.rawSourceDeletedAt,
  };
}

/** Defensive read of the minimal verification record. Unknown types or
 * outcomes drop the row; a license fragment longer than four characters is
 * SCRUBBED to null on the way in, because a fuller number must not propagate
 * even if it somehow reached the table. */
export function rowToReview(row: IdentityReviewRow): IdentityVerificationRecord | null {
  if (row.review_type !== IDENTITY_REVIEW_TYPE) return null;
  if (!REVIEW_OUTCOMES.has(row.outcome)) return null;
  if (row.name_match !== "match" && row.name_match !== "mismatch") return null;
  if (row.rejection_category !== null && !REJECTION_CATEGORIES.has(row.rejection_category)) return null;
  const last4 = row.license_last4 !== null && isMaskedLast4(row.license_last4) ? row.license_last4 : null;
  return {
    reviewId: row.review_id,
    caseId: row.case_id,
    tenantId: row.tenant_id,
    memberId: row.member_id,
    reviewType: IDENTITY_REVIEW_TYPE,
    nameMatch: row.name_match,
    ageThresholdMet: row.age_threshold_met,
    documentNotExpired: row.document_not_expired,
    jurisdiction: row.jurisdiction ?? null,
    licenseLast4: last4,
    outcome: row.outcome as IdentityReviewOutcome,
    rejectionCategory: (row.rejection_category as IdentityRejectionCategory | null) ?? null,
    reviewerId: row.reviewer_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    rawSourceDeletedAt: row.raw_source_deleted_at ?? null,
  };
}

export function auditToRow(event: IdentityAuditEvent): IdentityAuditRow {
  return {
    tenant_id: event.tenantId,
    case_id: event.caseId,
    member_id: event.memberId,
    kind: event.kind,
    actor_type: event.actorType,
    actor_id: event.actorId,
    occurred_at: event.at,
    detail: event.detail,
  };
}

export function rowToAudit(row: IdentityAuditRow): IdentityAuditEvent | null {
  if (!AUDIT_KINDS.has(row.kind)) return null;
  if (!AUDIT_ACTORS.has(row.actor_type)) return null;
  return {
    tenantId: row.tenant_id,
    caseId: row.case_id,
    memberId: row.member_id,
    kind: row.kind as IdentityAuditKind,
    actorType: row.actor_type as IdentityAuditEvent["actorType"],
    actorId: row.actor_id ?? null,
    at: row.occurred_at,
    detail: row.detail ?? null,
  };
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

export interface IdentityStore {
  saveCase(record: IdentityDocumentCase): Promise<void>;
  getCase(tenantId: string, caseId: string): Promise<IdentityDocumentCase | null>;
  /** Scoped to the owner: a caller can only list the member it names. */
  listCasesByMember(tenantId: string, memberId: string): Promise<IdentityDocumentCase[]>;
  /** Every case still holding a raw object, for the deletion sweep. */
  listCasesWithRawSource(tenantId: string): Promise<IdentityDocumentCase[]>;
  saveReview(record: IdentityVerificationRecord): Promise<void>;
  getReviewForCase(tenantId: string, caseId: string): Promise<IdentityVerificationRecord | null>;
  appendAuditEvent(event: IdentityAuditEvent): Promise<void>;
  listAuditEvents(tenantId: string, caseId: string): Promise<IdentityAuditEvent[]>;
}

// ---------------------------------------------------------------------------
// In-memory reference implementation
// ---------------------------------------------------------------------------

export function createInMemoryIdentityStore(): IdentityStore {
  const cases = new Map<string, IdentityDocumentCase>();
  const reviews = new Map<string, IdentityVerificationRecord>();
  const audit: IdentityAuditEvent[] = [];

  const key = (tenantId: string, id: string) => `${tenantId} ${id}`;

  return {
    async saveCase(record) {
      cases.set(key(record.tenantId, record.caseId), { ...record });
    },
    async getCase(tenantId, caseId) {
      const found = cases.get(key(tenantId, caseId));
      return found ? { ...found } : null;
    },
    async listCasesByMember(tenantId, memberId) {
      return Array.from(cases.values())
        .filter((kase) => kase.tenantId === tenantId && kase.memberId === memberId)
        .map((kase) => ({ ...kase }));
    },
    async listCasesWithRawSource(tenantId) {
      return Array.from(cases.values())
        .filter((kase) => kase.tenantId === tenantId && kase.storagePath !== null)
        .map((kase) => ({ ...kase }));
    },
    async saveReview(record) {
      assertMinimalVerificationRecord(record);
      reviews.set(key(record.tenantId, record.caseId), { ...record });
    },
    async getReviewForCase(tenantId, caseId) {
      const found = reviews.get(key(tenantId, caseId));
      return found ? { ...found } : null;
    },
    async appendAuditEvent(event) {
      audit.push({ ...event });
    },
    async listAuditEvents(tenantId, caseId) {
      return audit
        .filter((event) => event.tenantId === tenantId && event.caseId === caseId)
        .map((event) => ({ ...event }));
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed implementation (injected client; tests drive a fake)
// ---------------------------------------------------------------------------

export function createSupabaseIdentityStore(
  client: SupabaseClient = getSupabaseAdmin(),
): IdentityStore {
  return {
    async saveCase(record) {
      const up = await client.from(CASES_TABLE).upsert(caseToRow(record), { onConflict: "case_id" });
      if (up.error) throw new Error(`identity case upsert failed: ${up.error.message}`);
    },

    async getCase(tenantId, caseId) {
      const res = await client
        .from(CASES_TABLE)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("case_id", caseId)
        .maybeSingle();
      if (res.error) throw new Error(`identity case load failed: ${res.error.message}`);
      if (!res.data) return null;
      return rowToCase(res.data as IdentityCaseRow);
    },

    async listCasesByMember(tenantId, memberId) {
      const res = await client
        .from(CASES_TABLE)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("member_id", memberId);
      if (res.error) throw new Error(`identity case list failed: ${res.error.message}`);
      return ((res.data ?? []) as IdentityCaseRow[])
        .map(rowToCase)
        .filter((kase): kase is IdentityDocumentCase => kase !== null);
    },

    async listCasesWithRawSource(tenantId) {
      const res = await client
        .from(CASES_TABLE)
        .select("*")
        .eq("tenant_id", tenantId)
        .not("storage_path", "is", null);
      if (res.error) throw new Error(`identity sweep list failed: ${res.error.message}`);
      return ((res.data ?? []) as IdentityCaseRow[])
        .map(rowToCase)
        .filter((kase): kase is IdentityDocumentCase => kase !== null);
    },

    async saveReview(record) {
      // The structural contract runs before any client call, so a record that
      // grew a forbidden field never reaches the wire.
      assertMinimalVerificationRecord(record);
      const up = await client
        .from(REVIEWS_TABLE)
        .upsert(reviewToRow(record), { onConflict: "review_id" });
      if (up.error) throw new Error(`identity review upsert failed: ${up.error.message}`);
    },

    async getReviewForCase(tenantId, caseId) {
      const res = await client
        .from(REVIEWS_TABLE)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("case_id", caseId)
        .maybeSingle();
      if (res.error) throw new Error(`identity review load failed: ${res.error.message}`);
      if (!res.data) return null;
      return rowToReview(res.data as IdentityReviewRow);
    },

    async appendAuditEvent(event) {
      // Append only: insert, never update or delete. The database trigger
      // enforces the same rule below this code.
      const ins = await client.from(AUDIT_TABLE).insert(auditToRow(event));
      if (ins.error) throw new Error(`identity audit insert failed: ${ins.error.message}`);
    },

    async listAuditEvents(tenantId, caseId) {
      const res = await client
        .from(AUDIT_TABLE)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("case_id", caseId);
      if (res.error) throw new Error(`identity audit load failed: ${res.error.message}`);
      return ((res.data ?? []) as IdentityAuditRow[])
        .map(rowToAudit)
        .filter((event): event is IdentityAuditEvent => event !== null)
        .sort((a, b) => a.at.localeCompare(b.at));
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution: durable when Supabase is configured, else the in-memory
// reference so an unconfigured deployment fails closed rather than
// half-persisting identity state.
// ---------------------------------------------------------------------------

export function resolveIdentityStore(): IdentityStore {
  return supabaseConfigured() ? createSupabaseIdentityStore() : createInMemoryIdentityStore();
}
