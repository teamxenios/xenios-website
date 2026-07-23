import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, supabaseConfigured } from "../../../../supabase";
import {
  ESIGN_EVENT_TYPES,
  SIGNING_MODES,
  type ArchiveRecord,
  type ArchiveAccessClassification,
  type ArchiveRecordStore,
  type EsignEventType,
  type EsignStore,
  type ProviderEventLogEntry,
  type SigningLinkStatus,
  type SigningMode,
  type SigningRequestRecord,
  type SigningRequestStore,
  type TemplateMappingRecord,
  type TemplateMappingStore,
} from "../contracts";

// ---------------------------------------------------------------------------
// Persistence for the three e-signature record types in contracts.ts:
// signing requests, provisioned template mappings, and archive records.
//
// Follows the founding-membership persistence exemplar (documents-store.ts):
// pure row mappers exported for direct test, an in-memory reference, a Supabase
// implementation over an injected client (exercised by a fake client in tests),
// and a resolver that falls back to the in-memory reference when Supabase is
// not configured.
//
// The combined `EsignStore` is a composed object of three NAMED facets
// (`requests`, `templates`, `archive`), each its own store over its own table.
// The request and archive facets both carry insert/update/getById/listByMember
// over different record types; keeping them as distinct named facets means each
// method stays reachable, so archive.listByMember (the admin document center and
// the member packet ZIP need it) is a first-class query, not lost to a collision.
//
// Postures, matched to the exemplar:
//   - Reads FAIL CLOSED. A missing table or a malformed row reads as no data
//     (null / empty list). A signing request that cannot be trusted is safer
//     absent than half-hydrated: the activation gate stays blocked, never
//     waved through on a row this code cannot verify.
//   - Writes are LOUD. A completed signing request or an archive record that
//     silently failed to persist is the worst failure this store can have, so
//     an insert / update / upsert error throws.
//   - rowToX returns null on a malformed or unknown-enum row, never a guess.
//   - Arrays and the provider event history round-trip through jsonb columns.
// ---------------------------------------------------------------------------

const REQUESTS_TABLE = "research_fm_esign_requests";
const TEMPLATES_TABLE = "research_fm_esign_templates";
const ARCHIVE_TABLE = "research_fm_esign_archive";
const TENANT = "xenios_research";

// Runtime enum guards. The contract exports the mode and event-type arrays; the
// remaining enums are declared here so a malformed row can be rejected.
const SIGNING_LINK_STATUSES = [
  "created",
  "viewed",
  "signed",
  "completed",
  "declined",
  "revoked",
  "expired",
] as const;
const PROVISIONING_STATUSES = ["provisioned", "drifted", "superseded"] as const;
const ARCHIVE_ACCESS_CLASSIFICATIONS = ["member_and_admin", "admin_only"] as const;
const ARCHIVE_STATUSES = ["stored", "ingest_failed"] as const;
const EMAIL_DELIVERY_STATUSES = ["pending", "sent", "skipped"] as const;
const LOCAL_EXPORT_STATUSES = ["not_exported", "exported"] as const;

function byCreatedThenId<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Defensive value parsers for jsonb columns
// ---------------------------------------------------------------------------

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => typeof entry === "string")) return null;
  return [...value];
}

function eventHistory(value: unknown): ProviderEventLogEntry[] | null {
  if (!Array.isArray(value)) return null;
  const out: ProviderEventLogEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.eventId !== "string") return null;
    if (typeof entry.type !== "string" || !(ESIGN_EVENT_TYPES as readonly string[]).includes(entry.type)) {
      return null;
    }
    if (typeof entry.occurredAt !== "string") return null;
    if (typeof entry.recordedAt !== "string") return null;
    out.push({
      eventId: entry.eventId,
      type: entry.type as EsignEventType,
      occurredAt: entry.occurredAt,
      recordedAt: entry.recordedAt,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Signing request row + mappers
// ---------------------------------------------------------------------------

export interface SigningRequestRow {
  id: string;
  tenant: string;
  member_id: string;
  packet_or_document_id: string;
  mode: string;
  provider: string;
  provider_template_id: string | null;
  provider_template_version: string | null;
  provider_document_id: string | null;
  xenios_document_version_ids: unknown;
  source_content_hashes: unknown;
  signer_identifier: string;
  signing_link_status: string;
  viewed_at: string | null;
  signed_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  expired_at: string | null;
  signed_pdf_ref: string | null;
  certificate_ref: string | null;
  signed_pdf_hash: string | null;
  certificate_hash: string | null;
  verified_event_ids: unknown;
  provider_event_history: unknown;
  xenios_acceptance_event_ids: unknown;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

const REQUEST_COLUMNS =
  "id, tenant, member_id, packet_or_document_id, mode, provider, provider_template_id, " +
  "provider_template_version, provider_document_id, xenios_document_version_ids, source_content_hashes, " +
  "signer_identifier, signing_link_status, viewed_at, signed_at, completed_at, declined_at, expired_at, " +
  "signed_pdf_ref, certificate_ref, signed_pdf_hash, certificate_hash, verified_event_ids, " +
  "provider_event_history, xenios_acceptance_event_ids, idempotency_key, created_at, updated_at";

export function requestToRow(record: SigningRequestRecord): SigningRequestRow {
  return {
    id: record.id,
    tenant: TENANT,
    member_id: record.memberId,
    packet_or_document_id: record.packetOrDocumentId,
    mode: record.mode,
    provider: record.provider,
    provider_template_id: record.providerTemplateId,
    provider_template_version: record.providerTemplateVersion,
    provider_document_id: record.providerDocumentId,
    xenios_document_version_ids: [...record.xeniosDocumentVersionIds],
    source_content_hashes: [...record.sourceContentHashes],
    signer_identifier: record.signerIdentifier,
    signing_link_status: record.signingLinkStatus,
    viewed_at: record.viewedAt,
    signed_at: record.signedAt,
    completed_at: record.completedAt,
    declined_at: record.declinedAt,
    expired_at: record.expiredAt,
    signed_pdf_ref: record.signedPdfRef,
    certificate_ref: record.certificateRef,
    signed_pdf_hash: record.signedPdfHash,
    certificate_hash: record.certificateHash,
    verified_event_ids: [...record.verifiedEventIds],
    provider_event_history: record.providerEventHistory.map((entry) => ({ ...entry })),
    xenios_acceptance_event_ids: [...record.xeniosAcceptanceEventIds],
    idempotency_key: record.idempotencyKey,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/** Null when the row carries a mode or status this code does not know, or a malformed jsonb array. */
export function rowToRequest(row: SigningRequestRow): SigningRequestRecord | null {
  if (!(SIGNING_MODES as readonly string[]).includes(row.mode)) return null;
  if (!(SIGNING_LINK_STATUSES as readonly string[]).includes(row.signing_link_status)) return null;
  const versionIds = stringArray(row.xenios_document_version_ids);
  const hashes = stringArray(row.source_content_hashes);
  const verified = stringArray(row.verified_event_ids);
  const acceptance = stringArray(row.xenios_acceptance_event_ids);
  const history = eventHistory(row.provider_event_history);
  if (!versionIds || !hashes || !verified || !acceptance || !history) return null;
  return {
    id: row.id,
    memberId: row.member_id,
    packetOrDocumentId: row.packet_or_document_id,
    mode: row.mode as SigningMode,
    provider: row.provider,
    providerTemplateId: row.provider_template_id,
    providerTemplateVersion: row.provider_template_version,
    providerDocumentId: row.provider_document_id,
    xeniosDocumentVersionIds: versionIds,
    sourceContentHashes: hashes,
    signerIdentifier: row.signer_identifier,
    signingLinkStatus: row.signing_link_status as SigningLinkStatus,
    viewedAt: row.viewed_at,
    signedAt: row.signed_at,
    completedAt: row.completed_at,
    declinedAt: row.declined_at,
    expiredAt: row.expired_at,
    signedPdfRef: row.signed_pdf_ref,
    certificateRef: row.certificate_ref,
    signedPdfHash: row.signed_pdf_hash,
    certificateHash: row.certificate_hash,
    verifiedEventIds: verified,
    providerEventHistory: history,
    xeniosAcceptanceEventIds: acceptance,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Template mapping row + mappers
// ---------------------------------------------------------------------------

export interface TemplateMappingRow {
  template_key: string;
  tenant: string;
  provider: string;
  provider_template_id: string;
  provider_template_version: string;
  mode: string;
  xenios_document_version_ids: unknown;
  source_content_hashes: unknown;
  provisioning_status: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_COLUMNS =
  "template_key, tenant, provider, provider_template_id, provider_template_version, mode, " +
  "xenios_document_version_ids, source_content_hashes, provisioning_status, created_at, updated_at";

export function templateToRow(record: TemplateMappingRecord): TemplateMappingRow {
  return {
    template_key: record.templateKey,
    tenant: TENANT,
    provider: record.provider,
    provider_template_id: record.providerTemplateId,
    provider_template_version: record.providerTemplateVersion,
    mode: record.mode,
    xenios_document_version_ids: [...record.xeniosDocumentVersionIds],
    source_content_hashes: [...record.sourceContentHashes],
    provisioning_status: record.provisioningStatus,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/** Null when the row carries a mode or provisioning status this code does not know, or malformed arrays. */
export function rowToTemplate(row: TemplateMappingRow): TemplateMappingRecord | null {
  if (!(SIGNING_MODES as readonly string[]).includes(row.mode)) return null;
  if (!(PROVISIONING_STATUSES as readonly string[]).includes(row.provisioning_status)) return null;
  const versionIds = stringArray(row.xenios_document_version_ids);
  const hashes = stringArray(row.source_content_hashes);
  if (!versionIds || !hashes) return null;
  return {
    templateKey: row.template_key,
    provider: row.provider,
    providerTemplateId: row.provider_template_id,
    providerTemplateVersion: row.provider_template_version,
    mode: row.mode as SigningMode,
    xeniosDocumentVersionIds: versionIds,
    sourceContentHashes: hashes,
    provisioningStatus: row.provisioning_status as TemplateMappingRecord["provisioningStatus"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Archive row + mappers
// ---------------------------------------------------------------------------

export interface ArchiveRow {
  id: string;
  tenant: string;
  member_id: string;
  packet_or_document_id: string;
  document_version_id: string | null;
  provider: string;
  provider_document_id: string | null;
  signed_pdf_ref: string | null;
  signed_pdf_hash: string | null;
  certificate_ref: string | null;
  certificate_hash: string | null;
  xenios_source_hash: string | null;
  signer_email: string | null;
  completed_at: string | null;
  retention_class: string;
  access_classification: string;
  archive_status: string;
  email_delivery_status: string;
  local_export_status: string;
  created_at: string;
  updated_at: string;
}

const ARCHIVE_COLUMNS =
  "id, tenant, member_id, packet_or_document_id, document_version_id, provider, provider_document_id, " +
  "signed_pdf_ref, signed_pdf_hash, certificate_ref, certificate_hash, xenios_source_hash, signer_email, " +
  "completed_at, retention_class, access_classification, archive_status, email_delivery_status, " +
  "local_export_status, created_at, updated_at";

export function archiveToRow(record: ArchiveRecord): ArchiveRow {
  return {
    id: record.id,
    tenant: TENANT,
    member_id: record.memberId,
    packet_or_document_id: record.packetOrDocumentId,
    document_version_id: record.documentVersionId,
    provider: record.provider,
    provider_document_id: record.providerDocumentId,
    signed_pdf_ref: record.signedPdfRef,
    signed_pdf_hash: record.signedPdfHash,
    certificate_ref: record.certificateRef,
    certificate_hash: record.certificateHash,
    xenios_source_hash: record.xeniosSourceHash,
    signer_email: record.signerEmail,
    completed_at: record.completedAt,
    retention_class: record.retentionClass,
    access_classification: record.accessClassification,
    archive_status: record.archiveStatus,
    email_delivery_status: record.emailDeliveryStatus,
    local_export_status: record.localExportStatus,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/** Null when the row carries a classification or status this code does not know. */
export function rowToArchive(row: ArchiveRow): ArchiveRecord | null {
  if (!(ARCHIVE_ACCESS_CLASSIFICATIONS as readonly string[]).includes(row.access_classification)) return null;
  if (!(ARCHIVE_STATUSES as readonly string[]).includes(row.archive_status)) return null;
  if (!(EMAIL_DELIVERY_STATUSES as readonly string[]).includes(row.email_delivery_status)) return null;
  if (!(LOCAL_EXPORT_STATUSES as readonly string[]).includes(row.local_export_status)) return null;
  return {
    id: row.id,
    memberId: row.member_id,
    packetOrDocumentId: row.packet_or_document_id,
    documentVersionId: row.document_version_id,
    provider: row.provider,
    providerDocumentId: row.provider_document_id,
    signedPdfRef: row.signed_pdf_ref,
    signedPdfHash: row.signed_pdf_hash,
    certificateRef: row.certificate_ref,
    certificateHash: row.certificate_hash,
    xeniosSourceHash: row.xenios_source_hash,
    signerEmail: row.signer_email,
    completedAt: row.completed_at,
    retentionClass: row.retention_class,
    accessClassification: row.access_classification as ArchiveAccessClassification,
    archiveStatus: row.archive_status as ArchiveRecord["archiveStatus"],
    emailDeliveryStatus: row.email_delivery_status as ArchiveRecord["emailDeliveryStatus"],
    localExportStatus: row.local_export_status as ArchiveRecord["localExportStatus"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// In-memory reference implementation
// ---------------------------------------------------------------------------

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createInMemoryEsignStore(): EsignStore {
  const requestRows = new Map<string, SigningRequestRecord>();
  const templateRows = new Map<string, TemplateMappingRecord>();
  const archiveRows = new Map<string, ArchiveRecord>();

  const requests: SigningRequestStore = {
    async insert(record) {
      if (requestRows.has(record.id)) throw new Error(`Signing request ${record.id} already exists.`);
      requestRows.set(record.id, clone(record));
    },
    async update(record) {
      if (!requestRows.has(record.id)) throw new Error(`Signing request ${record.id} does not exist.`);
      requestRows.set(record.id, clone(record));
    },
    async getById(id) {
      const found = requestRows.get(id);
      return found ? clone(found) : null;
    },
    async getByProviderDocumentId(providerDocumentId) {
      const found = Array.from(requestRows.values()).find(
        (record) => record.providerDocumentId === providerDocumentId,
      );
      return found ? clone(found) : null;
    },
    async getByIdempotencyKey(memberId, idempotencyKey) {
      const found = Array.from(requestRows.values()).find(
        (record) => record.memberId === memberId && record.idempotencyKey === idempotencyKey,
      );
      return found ? clone(found) : null;
    },
    async listByMember(memberId) {
      return Array.from(requestRows.values())
        .filter((record) => record.memberId === memberId)
        .sort(byCreatedThenId)
        .map(clone);
    },
  };

  const templates: TemplateMappingStore = {
    async upsert(record) {
      templateRows.set(record.templateKey, clone(record));
    },
    async getByKey(templateKey) {
      const found = templateRows.get(templateKey);
      return found ? clone(found) : null;
    },
    async list() {
      return Array.from(templateRows.values())
        .sort((a, b) => a.templateKey.localeCompare(b.templateKey))
        .map(clone);
    },
  };

  const archive: ArchiveRecordStore = {
    async insert(record) {
      if (archiveRows.has(record.id)) throw new Error(`Archive record ${record.id} already exists.`);
      archiveRows.set(record.id, clone(record));
    },
    async update(record) {
      if (!archiveRows.has(record.id)) throw new Error(`Archive record ${record.id} does not exist.`);
      archiveRows.set(record.id, clone(record));
    },
    async getById(id) {
      const found = archiveRows.get(id);
      return found ? clone(found) : null;
    },
    async listByMember(memberId) {
      return Array.from(archiveRows.values())
        .filter((record) => record.memberId === memberId)
        .sort(byCreatedThenId)
        .map(clone);
    },
  };

  return { requests, templates, archive };
}

// ---------------------------------------------------------------------------
// Supabase-backed implementation
// ---------------------------------------------------------------------------

export function createSupabaseEsignStore(client: SupabaseClient = getSupabaseAdmin()): EsignStore {
  // Reads are defensive: an unprovisioned table reads as empty / null, which
  // keeps the activation gate blocked (fail closed). Writes throw.
  async function readRows<T>(
    table: string,
    columns: string,
    apply?: (query: any) => any,
  ): Promise<T[]> {
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

  async function readOne<T>(
    table: string,
    columns: string,
    apply: (query: any) => any,
  ): Promise<T | null> {
    try {
      const { data, error } = await apply(client.from(table).select(columns)).maybeSingle();
      if (error || !data) return null;
      return data as T;
    } catch {
      return null;
    }
  }

  const requests: SigningRequestStore = {
    async insert(record) {
      const ins = await client.from(REQUESTS_TABLE).insert(requestToRow(record));
      if (ins.error) throw new Error(`signing request insert failed: ${ins.error.message}`);
    },
    async update(record) {
      const upd = await client
        .from(REQUESTS_TABLE)
        .update(requestToRow(record))
        .eq("id", record.id)
        .select("id")
        .maybeSingle();
      if (upd.error) throw new Error(`signing request update failed: ${upd.error.message}`);
      if (!upd.data) throw new Error(`signing request update matched no row: ${record.id}`);
    },
    async getById(id) {
      const row = await readOne<SigningRequestRow>(REQUESTS_TABLE, REQUEST_COLUMNS, (q) => q.eq("id", id));
      return row ? rowToRequest(row) : null;
    },
    async getByProviderDocumentId(providerDocumentId) {
      const row = await readOne<SigningRequestRow>(REQUESTS_TABLE, REQUEST_COLUMNS, (q) =>
        q.eq("provider_document_id", providerDocumentId),
      );
      return row ? rowToRequest(row) : null;
    },
    async getByIdempotencyKey(memberId, idempotencyKey) {
      const row = await readOne<SigningRequestRow>(REQUESTS_TABLE, REQUEST_COLUMNS, (q) =>
        q.eq("member_id", memberId).eq("idempotency_key", idempotencyKey),
      );
      return row ? rowToRequest(row) : null;
    },
    async listByMember(memberId) {
      const rows = await readRows<SigningRequestRow>(REQUESTS_TABLE, REQUEST_COLUMNS, (q) =>
        q.eq("member_id", memberId),
      );
      return rows
        .map(rowToRequest)
        .filter((r): r is SigningRequestRecord => r !== null)
        .sort(byCreatedThenId);
    },
  };

  const templates: TemplateMappingStore = {
    async upsert(record) {
      const up = await client
        .from(TEMPLATES_TABLE)
        .upsert(templateToRow(record), { onConflict: "template_key" });
      if (up.error) throw new Error(`template mapping upsert failed: ${up.error.message}`);
    },
    async getByKey(templateKey) {
      const row = await readOne<TemplateMappingRow>(TEMPLATES_TABLE, TEMPLATE_COLUMNS, (q) =>
        q.eq("template_key", templateKey),
      );
      return row ? rowToTemplate(row) : null;
    },
    async list() {
      const rows = await readRows<TemplateMappingRow>(TEMPLATES_TABLE, TEMPLATE_COLUMNS);
      return rows
        .map(rowToTemplate)
        .filter((r): r is TemplateMappingRecord => r !== null)
        .sort((a, b) => a.templateKey.localeCompare(b.templateKey));
    },
  };

  const archive: ArchiveRecordStore = {
    async insert(record) {
      const ins = await client.from(ARCHIVE_TABLE).insert(archiveToRow(record));
      if (ins.error) throw new Error(`archive insert failed: ${ins.error.message}`);
    },
    async update(record) {
      const upd = await client
        .from(ARCHIVE_TABLE)
        .update(archiveToRow(record))
        .eq("id", record.id)
        .select("id")
        .maybeSingle();
      if (upd.error) throw new Error(`archive update failed: ${upd.error.message}`);
      if (!upd.data) throw new Error(`archive update matched no row: ${record.id}`);
    },
    async getById(id) {
      const row = await readOne<ArchiveRow>(ARCHIVE_TABLE, ARCHIVE_COLUMNS, (q) => q.eq("id", id));
      return row ? rowToArchive(row) : null;
    },
    async listByMember(memberId) {
      const rows = await readRows<ArchiveRow>(ARCHIVE_TABLE, ARCHIVE_COLUMNS, (q) =>
        q.eq("member_id", memberId),
      );
      return rows
        .map(rowToArchive)
        .filter((r): r is ArchiveRecord => r !== null)
        .sort(byCreatedThenId);
    },
  };

  return { requests, templates, archive };
}

/**
 * The real store when Supabase is configured, else the in-memory reference.
 * Consumers sit behind the founding-activation flag, so an unconfigured
 * deployment keeps failing closed rather than silently persisting.
 */
export function resolveEsignStore(): EsignStore {
  return supabaseConfigured() ? createSupabaseEsignStore() : createInMemoryEsignStore();
}
