import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  type DocumentCategory,
  type DocumentRequirement,
  type DocumentStatus,
  type DocumentVersionRecord,
  type DocumentVersionsStore,
  ACTIVATION_STEPS,
  type ActivationStep,
  type CounselReviewState,
} from "../documents";
import { DuplicateSignature, type SignatureRecord, type SignaturesStore } from "../signatures";

// ---------------------------------------------------------------------------
// Persistent store for founding-membership agreement documents and signatures.
//
// Follows the Track B persistence exemplar (server/research/commerce/
// persistence/): pure row mappers exported for direct test, an in-memory
// reference implementation, a Supabase implementation over an injected client
// exercised by a fake client in tests, and a resolver that falls back to the
// in-memory reference when Supabase is not configured.
//
// Postures:
//   - Versions are read defensively (a missing table reads as no versions,
//     which FAILS CLOSED at the activation gate: nothing published means
//     activation is blocked, never waved through).
//   - Signature WRITES are loud. A legal signature that vanishes silently is
//     the worst failure, so an insert error throws.
//   - Signatures have NO update and NO delete anywhere in the port. The
//     append-only audit is structural here and again in the database trigger.
//   - Rows that do not map to a known category or status are dropped, never
//     guessed at.
//
// Tables ship in supabase/research-fm-agreements.sql. Building this does NOT
// enable the activation flow; consumers stay behind the default-false
// RESEARCH_FOUNDING_ACTIVATION_ENABLED flag added by the surface wave.
// ---------------------------------------------------------------------------

export type DocumentsStore = DocumentVersionsStore & SignaturesStore;

const VERSIONS_TABLE = "research_fm_document_versions";
const SIGNATURES_TABLE = "research_fm_document_signatures";
const TENANT = "xenios_research";
const UNIQUE_VIOLATION = "23505";

// ---------------------------------------------------------------------------
// Row shapes and pure mappers
// ---------------------------------------------------------------------------

export interface DocumentVersionRow {
  id: string;
  tenant: string;
  category: string;
  title: string;
  semver: string;
  status: string;
  effective_date: string | null;
  published_at: string | null;
  jurisdiction: string;
  content: string;
  content_hash: string;
  download_ref: string | null;
  requirement: string;
  activation_step: string | null;
  reacceptance_required: boolean;
  requires_separate_acknowledgment: boolean;
  superseded_version_id: string | null;
  publisher: string | null;
  counsel_review: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const VERSION_COLUMNS =
  "id, tenant, category, title, semver, status, effective_date, published_at, jurisdiction, " +
  "content, content_hash, download_ref, requirement, activation_step, reacceptance_required, " +
  "requires_separate_acknowledgment, superseded_version_id, publisher, counsel_review, notes, " +
  "created_at, updated_at";

export function versionToRow(record: DocumentVersionRecord): DocumentVersionRow {
  return {
    id: record.id,
    tenant: TENANT,
    category: record.category,
    title: record.title,
    semver: record.semver,
    status: record.status,
    effective_date: record.effectiveDate,
    published_at: record.publishedAt,
    jurisdiction: record.jurisdiction,
    content: record.content,
    content_hash: record.contentHash,
    download_ref: record.downloadRef,
    requirement: record.requirement,
    activation_step: record.activationStep,
    reacceptance_required: record.reacceptanceRequired,
    requires_separate_acknowledgment: record.requiresSeparateAcknowledgment,
    superseded_version_id: record.supersededVersionId,
    publisher: record.publisher,
    counsel_review: record.counselReview,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

const COUNSEL_REVIEW_STATES = ["not_reviewed", "under_review", "changes_requested", "approved"] as const;

/** Null when the row carries a category, status, or enum this code does not know. */
export function rowToVersion(row: DocumentVersionRow): DocumentVersionRecord | null {
  if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(row.category)) return null;
  if (!(DOCUMENT_STATUSES as readonly string[]).includes(row.status)) return null;
  if (row.requirement !== "required" && row.requirement !== "optional") return null;
  if (!(COUNSEL_REVIEW_STATES as readonly string[]).includes(row.counsel_review)) return null;
  if (row.activation_step !== null && !(ACTIVATION_STEPS as readonly string[]).includes(row.activation_step)) {
    return null;
  }
  return {
    id: row.id,
    category: row.category as DocumentCategory,
    title: row.title,
    semver: row.semver,
    status: row.status as DocumentStatus,
    effectiveDate: row.effective_date,
    publishedAt: row.published_at,
    jurisdiction: row.jurisdiction,
    content: row.content,
    contentHash: row.content_hash,
    downloadRef: row.download_ref,
    requirement: row.requirement as DocumentRequirement,
    activationStep: row.activation_step as ActivationStep | null,
    reacceptanceRequired: row.reacceptance_required,
    requiresSeparateAcknowledgment: row.requires_separate_acknowledgment,
    supersededVersionId: row.superseded_version_id,
    publisher: row.publisher,
    counselReview: row.counsel_review as CounselReviewState,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SignatureRow {
  id: string;
  tenant: string;
  member_id: string;
  document_version_id: string;
  category: string;
  semver: string;
  content_hash: string;
  typed_legal_name: string;
  full_document_shown: boolean;
  affirmative_consent: boolean;
  separate_acknowledgment: boolean;
  electronic_consent_version_id: string;
  ip_hash: string | null;
  user_agent_hash: string | null;
  signed_at: string;
}

const SIGNATURE_COLUMNS =
  "id, tenant, member_id, document_version_id, category, semver, content_hash, typed_legal_name, " +
  "full_document_shown, affirmative_consent, separate_acknowledgment, electronic_consent_version_id, " +
  "ip_hash, user_agent_hash, signed_at";

export function signatureToRow(record: SignatureRecord): SignatureRow {
  return {
    id: record.id,
    tenant: TENANT,
    member_id: record.memberId,
    document_version_id: record.documentVersionId,
    category: record.category,
    semver: record.semver,
    content_hash: record.contentHash,
    typed_legal_name: record.typedLegalName,
    full_document_shown: record.fullDocumentShown,
    affirmative_consent: record.affirmativeConsent,
    separate_acknowledgment: record.separateAcknowledgment,
    electronic_consent_version_id: record.electronicConsentVersionId,
    ip_hash: record.ipHash,
    user_agent_hash: record.userAgentHash,
    signed_at: record.signedAt,
  };
}

/** Null when the row does not carry the attestations a signature must have. */
export function rowToSignature(row: SignatureRow): SignatureRecord | null {
  if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(row.category)) return null;
  // A signature row without both attestations is not a signature this system
  // ever wrote; refuse to hydrate it rather than inventing consent.
  if (row.full_document_shown !== true || row.affirmative_consent !== true) return null;
  return {
    id: row.id,
    memberId: row.member_id,
    documentVersionId: row.document_version_id,
    category: row.category as DocumentCategory,
    semver: row.semver,
    contentHash: row.content_hash,
    typedLegalName: row.typed_legal_name,
    fullDocumentShown: true,
    affirmativeConsent: true,
    separateAcknowledgment: row.separate_acknowledgment,
    electronicConsentVersionId: row.electronic_consent_version_id,
    ipHash: row.ip_hash,
    userAgentHash: row.user_agent_hash,
    signedAt: row.signed_at,
  };
}

// ---------------------------------------------------------------------------
// In-memory reference implementation
// ---------------------------------------------------------------------------

export function createInMemoryDocumentsStore(): DocumentsStore {
  const versions = new Map<string, DocumentVersionRecord>();
  const signatures: SignatureRecord[] = [];
  const cloneVersion = (r: DocumentVersionRecord): DocumentVersionRecord => ({ ...r });
  const cloneSignature = (r: SignatureRecord): SignatureRecord => ({ ...r });

  return {
    async insertVersion(record) {
      if (versions.has(record.id)) {
        throw new Error(`Document version ${record.id} already exists.`);
      }
      versions.set(record.id, cloneVersion(record));
    },
    async updateVersion(record) {
      if (!versions.has(record.id)) {
        throw new Error(`Document version ${record.id} does not exist.`);
      }
      versions.set(record.id, cloneVersion(record));
    },
    async getVersion(id) {
      const record = versions.get(id);
      return record ? cloneVersion(record) : null;
    },
    async listVersions(category) {
      return Array.from(versions.values())
        .filter((r) => (category ? r.category === category : true))
        .sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id),
        )
        .map(cloneVersion);
    },
    async getPublished(category) {
      const published = Array.from(versions.values()).find(
        (r) => r.category === category && r.status === "published",
      );
      return published ? cloneVersion(published) : null;
    },
    async insertSignature(record) {
      const duplicate = signatures.some(
        (s) => s.memberId === record.memberId && s.documentVersionId === record.documentVersionId,
      );
      if (duplicate) throw new DuplicateSignature(record.memberId, record.documentVersionId);
      signatures.push(cloneSignature(record));
    },
    async getSignature(memberId, documentVersionId) {
      const found = signatures.find(
        (s) => s.memberId === memberId && s.documentVersionId === documentVersionId,
      );
      return found ? cloneSignature(found) : null;
    },
    async listSignaturesForMember(memberId) {
      return signatures
        .filter((s) => s.memberId === memberId)
        .sort((a, b) =>
          a.signedAt < b.signedAt ? -1 : a.signedAt > b.signedAt ? 1 : a.id.localeCompare(b.id),
        )
        .map(cloneSignature);
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed implementation
// ---------------------------------------------------------------------------

export function createSupabaseDocumentsStore(client: SupabaseClient = getSupabaseAdmin()): DocumentsStore {
  // Version reads are defensive: an unprovisioned table reads as no versions,
  // which the activation gate treats as BLOCKING (fail closed). Writes throw.
  async function readRows<T>(table: string, columns: string, apply?: (query: any) => any): Promise<T[]> {
    try {
      let query: any = client.from(table).select(columns);
      if (apply) query = apply(query);
      const { data, error } = await query;
      if (error || !Array.isArray(data)) return [];
      return data as T[];
    } catch {
      return [];
    }
  }

  return {
    async insertVersion(record) {
      const ins = await client.from(VERSIONS_TABLE).insert(versionToRow(record));
      if (ins.error) throw new Error(`document version insert failed: ${ins.error.message}`);
    },

    async updateVersion(record) {
      const row = versionToRow(record);
      const upd = await client
        .from(VERSIONS_TABLE)
        .update(row)
        .eq("id", record.id)
        .select("id")
        .maybeSingle();
      if (upd.error) throw new Error(`document version update failed: ${upd.error.message}`);
      if (!upd.data) throw new Error(`document version update matched no row: ${record.id}`);
    },

    async getVersion(id) {
      try {
        const { data, error } = await client
          .from(VERSIONS_TABLE)
          .select(VERSION_COLUMNS)
          .eq("id", id)
          .maybeSingle();
        if (error || !data) return null;
        return rowToVersion(data as unknown as DocumentVersionRow);
      } catch {
        return null;
      }
    },

    async listVersions(category) {
      const rows = await readRows<DocumentVersionRow>(VERSIONS_TABLE, VERSION_COLUMNS, (q) =>
        category ? q.eq("category", category) : q,
      );
      return rows
        .map(rowToVersion)
        .filter((r): r is DocumentVersionRecord => r !== null)
        .sort((a, b) =>
          a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id),
        );
    },

    async getPublished(category) {
      const rows = await readRows<DocumentVersionRow>(VERSIONS_TABLE, VERSION_COLUMNS, (q) =>
        q.eq("category", category).eq("status", "published"),
      );
      const mapped = rows.map(rowToVersion).filter((r): r is DocumentVersionRecord => r !== null);
      return mapped.length > 0 ? mapped[0] : null;
    },

    async insertSignature(record) {
      // LOUD write: a signature that silently fails to persist is the worst
      // failure this store can have. The database unique constraint on
      // (member_id, document_version_id) is the concurrency guard.
      const ins = await client.from(SIGNATURES_TABLE).insert(signatureToRow(record));
      if (ins.error) {
        if ((ins.error as { code?: string }).code === UNIQUE_VIOLATION) {
          throw new DuplicateSignature(record.memberId, record.documentVersionId);
        }
        throw new Error(`signature insert failed: ${ins.error.message}`);
      }
    },

    async getSignature(memberId, documentVersionId) {
      try {
        const { data, error } = await client
          .from(SIGNATURES_TABLE)
          .select(SIGNATURE_COLUMNS)
          .eq("member_id", memberId)
          .eq("document_version_id", documentVersionId)
          .maybeSingle();
        if (error || !data) return null;
        return rowToSignature(data as unknown as SignatureRow);
      } catch {
        return null;
      }
    },

    async listSignaturesForMember(memberId) {
      const rows = await readRows<SignatureRow>(SIGNATURES_TABLE, SIGNATURE_COLUMNS, (q) =>
        q.eq("member_id", memberId),
      );
      return rows
        .map(rowToSignature)
        .filter((r): r is SignatureRecord => r !== null)
        .sort((a, b) =>
          a.signedAt < b.signedAt ? -1 : a.signedAt > b.signedAt ? 1 : a.id.localeCompare(b.id),
        );
    },
  };
}

/**
 * The real store when Supabase is configured, else the in-memory reference.
 * Consumers sit behind the founding-activation flag, so an unconfigured
 * deployment keeps failing closed rather than silently persisting.
 */
export function resolveDocumentsStore(): DocumentsStore {
  return supabaseConfigured() ? createSupabaseDocumentsStore() : createInMemoryDocumentsStore();
}
