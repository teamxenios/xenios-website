// ---------------------------------------------------------------------------
// xenios research: e-signature integration contract.
//
// OpenSign (or any future provider) is the signature EXECUTION provider. The
// Xenios agreement engine (documents.ts + signatures.ts) stays the source of
// legal truth: document identity, version, source hash, required order,
// separate-acknowledgment requirements, reacceptance, and the activation gate
// all live there. A provider completion event is processed server-side and
// only THEN does the Xenios agreement gate advance; a browser redirect is
// never proof of completion.
//
// This file is the shared, dependency-free contract every e-sign module builds
// against (provider adapter, signing domain, archive, persistence). It imports
// nothing from the rest of the codebase so the pieces can be built and tested
// independently without drifting on shared types.
// ---------------------------------------------------------------------------

// --- Provider result envelope (mirrors media-provider.ts ProviderResult) ----

export type EsignErrorCode = "DISABLED" | "NOT_CONFIGURED" | "REFUSED" | "PROVIDER_ERROR";

export type EsignProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: EsignErrorCode; message?: string };

// --- Signing modes: not every document is a signature ----------------------
// The final legal package marks some documents as public notices or clickwrap
// acknowledgments. We do NOT force all 17 through OpenSign, and we never reduce
// a signature-required document to a bare checkbox.

export const SIGNING_MODES = [
  "view_only_public_policy",
  "clickwrap_acceptance",
  "typed_signature",
  "opensign_document",
  "opensign_packet",
] as const;
export type SigningMode = (typeof SIGNING_MODES)[number];

/** The two modes that route through an external e-signature provider. */
export function isProviderBackedMode(mode: SigningMode): boolean {
  return mode === "opensign_document" || mode === "opensign_packet";
}

// --- Template + widget specification ---------------------------------------

export const ESIGN_WIDGET_TYPES = [
  "typed_legal_name",
  "date",
  "signature",
  "initials",
  "consent_checkbox",
  "arbitration_acknowledgment",
  "release_acknowledgment",
  "member_email",
  "external_reference",
  "document_version_reference",
] as const;
export type EsignWidgetType = (typeof ESIGN_WIDGET_TYPES)[number];

export interface EsignWidget {
  /** Stable, unique-within-template widget name. */
  name: string;
  type: EsignWidgetType;
  required: boolean;
  page?: number;
}

/** One Xenios document version participating in a provider template. */
export interface EsignTemplateDocument {
  xeniosDocumentVersionId: string;
  category: string;
  title: string;
  /** The exact Xenios source content hash; drift invalidates the template. */
  sourceContentHash: string;
  widgets: readonly EsignWidget[];
}

export interface EsignTemplateSpec {
  /** Deterministic key derived from the mapped versions (never random). */
  templateKey: string;
  title: string;
  mode: SigningMode;
  documents: readonly EsignTemplateDocument[];
}

// --- Signing-session creation ----------------------------------------------

export interface CreateSigningSessionInput {
  providerTemplateId: string;
  /** The authenticated member is the primary identity binding. */
  memberId: string;
  signerEmail: string;
  /** Opaque Xenios reference echoed back on webhook events for mapping. */
  externalReference: string;
  redirectUrl: string | null;
  /** Optional additional control; never a predictable code. */
  accessCode?: string | null;
  linkTtlMinutes?: number | null;
}

export interface SigningSession {
  providerDocumentId: string;
  signingUrl: string;
  expiresAt: string | null;
}

// --- Completed-file fetch --------------------------------------------------

export interface FetchCompletedFileInput {
  /** The provider file URL from a verified webhook; fetched immediately. */
  fileUrl: string;
}

export interface FetchedFile {
  bytes: Buffer;
  contentType: string | null;
}

// --- Webhook events --------------------------------------------------------

export const ESIGN_EVENT_TYPES = [
  "created",
  "viewed",
  "signed",
  "completed",
  "declined",
  "revoked",
  "expired",
] as const;
export type EsignEventType = (typeof ESIGN_EVENT_TYPES)[number];

export interface EsignWebhookEvent {
  /** Provider event id; the replay-dedup key. */
  eventId: string;
  type: EsignEventType;
  providerDocumentId: string;
  signedFileUrl?: string | null;
  certificateUrl?: string | null;
  signerEmail?: string | null;
  externalReference?: string | null;
  /** ISO timestamp the provider reports for the event. */
  occurredAt: string;
}

export type EsignWebhookVerification =
  | { ok: true; event: EsignWebhookEvent }
  | { ok: false; code: "invalid_signature" | "stale" | "malformed" };

// --- The provider port -----------------------------------------------------

export interface EsignProvider {
  readonly name: string;
  /** True only for a real, configured adapter. Disabled/unconfigured = false. */
  readonly isLive: boolean;
  provisionTemplate(
    spec: EsignTemplateSpec,
  ): Promise<EsignProviderResult<{ providerTemplateId: string; providerTemplateVersion: string }>>;
  createSigningSession(
    input: CreateSigningSessionInput,
  ): Promise<EsignProviderResult<SigningSession>>;
  fetchCompletedFile(input: FetchCompletedFileInput): Promise<EsignProviderResult<FetchedFile>>;
  /** Deterministic, side-effect-free HMAC verification of a raw webhook body. */
  verifyWebhook(rawBody: string, signatureHeader: string | null, nowMs: number): EsignWebhookVerification;
}

// --- Durable Xenios records -------------------------------------------------

export type SigningLinkStatus =
  | "created"
  | "viewed"
  | "signed"
  | "completed"
  | "declined"
  | "revoked"
  | "expired";

export interface ProviderEventLogEntry {
  eventId: string;
  type: EsignEventType;
  occurredAt: string;
  recordedAt: string;
}

/**
 * The durable Xenios record for one provider signing request. Xenios owns this;
 * OpenSign Drive may keep a provider copy, but Xenios ingests its own.
 */
export interface SigningRequestRecord {
  id: string;
  memberId: string;
  /** The packet id (opensign_packet) or single Xenios document id. */
  packetOrDocumentId: string;
  mode: SigningMode;
  provider: string;
  providerTemplateId: string | null;
  providerTemplateVersion: string | null;
  providerDocumentId: string | null;
  /** The exact Xenios document versions this request signs. */
  xeniosDocumentVersionIds: readonly string[];
  /** The source content hashes at request time; drift is detectable. */
  sourceContentHashes: readonly string[];
  signerIdentifier: string;
  signingLinkStatus: SigningLinkStatus;
  viewedAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  expiredAt: string | null;
  signedPdfRef: string | null;
  certificateRef: string | null;
  signedPdfHash: string | null;
  certificateHash: string | null;
  /** Provider event ids already applied (idempotency). */
  verifiedEventIds: readonly string[];
  providerEventHistory: readonly ProviderEventLogEntry[];
  /** Xenios signature/acceptance record ids created on completion. */
  xeniosAcceptanceEventIds: readonly string[];
  /** Idempotency key so a refresh/retry never mints a duplicate request. */
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

/** A provisioned provider template mapped to exact Xenios versions. */
export interface TemplateMappingRecord {
  templateKey: string;
  provider: string;
  providerTemplateId: string;
  providerTemplateVersion: string;
  mode: SigningMode;
  xeniosDocumentVersionIds: readonly string[];
  sourceContentHashes: readonly string[];
  provisioningStatus: "provisioned" | "drifted" | "superseded";
  createdAt: string;
  updatedAt: string;
}

// --- Archive record (Xenios private storage) -------------------------------

export type ArchiveAccessClassification = "member_and_admin" | "admin_only";

export interface ArchiveRecord {
  id: string;
  memberId: string;
  packetOrDocumentId: string;
  documentVersionId: string | null;
  provider: string;
  providerDocumentId: string | null;
  signedPdfRef: string | null;
  signedPdfHash: string | null;
  certificateRef: string | null;
  certificateHash: string | null;
  xeniosSourceHash: string | null;
  signerEmail: string | null;
  completedAt: string | null;
  retentionClass: string;
  accessClassification: ArchiveAccessClassification;
  archiveStatus: "stored" | "ingest_failed";
  emailDeliveryStatus: "pending" | "sent" | "skipped";
  localExportStatus: "not_exported" | "exported";
  createdAt: string;
  updatedAt: string;
}

// --- Persistence ports (in-memory + Supabase implement these) --------------

export interface SigningRequestStore {
  insert(record: SigningRequestRecord): Promise<void>;
  update(record: SigningRequestRecord): Promise<void>;
  getById(id: string): Promise<SigningRequestRecord | null>;
  getByProviderDocumentId(providerDocumentId: string): Promise<SigningRequestRecord | null>;
  getByIdempotencyKey(memberId: string, idempotencyKey: string): Promise<SigningRequestRecord | null>;
  listByMember(memberId: string): Promise<readonly SigningRequestRecord[]>;
}

export interface TemplateMappingStore {
  upsert(record: TemplateMappingRecord): Promise<void>;
  getByKey(templateKey: string): Promise<TemplateMappingRecord | null>;
  list(): Promise<readonly TemplateMappingRecord[]>;
}

export interface ArchiveRecordStore {
  insert(record: ArchiveRecord): Promise<void>;
  update(record: ArchiveRecord): Promise<void>;
  getById(id: string): Promise<ArchiveRecord | null>;
  listByMember(memberId: string): Promise<readonly ArchiveRecord[]>;
}

/**
 * Combined store surface the e-sign services depend on. Composed of three
 * named facets rather than an intersection: the request and archive facets
 * both carry insert/update/getById/listByMember over different record types,
 * so an intersection would collide and lose archive-by-member listing (needed
 * by the admin document center and the member packet ZIP). Named facets keep
 * each method distinct and reachable.
 */
export interface EsignStore {
  requests: SigningRequestStore;
  templates: TemplateMappingStore;
  archive: ArchiveRecordStore;
}

// --- Private media port for completed documents (mirrors IdentityMediaPort) -

export interface EsignUploadGrant {
  storagePath: string;
  bytesWritten: number;
}

export interface EsignAccessGrant {
  signedUrl: string;
  expiresAt: string;
}

export interface EsignMediaPort {
  /** Ingest completed bytes into a private object at storagePath. */
  putObject(input: {
    storagePath: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<EsignProviderResult<EsignUploadGrant>>;
  /** Short-lived, admin-authorized signed download URL. */
  createAccessUrl(input: {
    storagePath: string;
    expiresInSeconds: number;
    now: Date;
  }): Promise<EsignProviderResult<EsignAccessGrant>>;
  /** Read bytes back (for the ZIP packet builder). */
  getObject(storagePath: string): Promise<EsignProviderResult<FetchedFile>>;
}
