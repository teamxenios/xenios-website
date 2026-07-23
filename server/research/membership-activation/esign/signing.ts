import crypto from "crypto";
import {
  isProviderBackedMode,
  type EsignEventType,
  type EsignMediaPort,
  type EsignProvider,
  type EsignStore,
  type EsignTemplateDocument,
  type EsignTemplateSpec,
  type EsignWebhookEvent,
  type EsignWidget,
  type FetchedFile,
  type ProviderEventLogEntry,
  type SigningLinkStatus,
  type SigningMode,
  type SigningRequestRecord,
  type TemplateMappingRecord,
} from "./contracts";
import { sha256Hex, type DocumentLifecycle } from "../documents";
import type { SignatureService } from "../signatures";

// ---------------------------------------------------------------------------
// xenios research: the e-signature SIGNING DOMAIN.
//
// The Xenios agreement engine (documents.ts + signatures.ts) stays the source
// of legal truth: document identity, published version, source hash, required
// order, and the activation gate all live there. The provider (OpenSign or a
// future adapter) is EXECUTION ONLY. This service:
//
//   - derives a DETERMINISTIC template key from the exact mapped versions and
//     source hashes, so the same legal text always maps to the same template,
//     and any drift in the text produces a NEW template rather than reusing an
//     old one with new legal words;
//   - refuses to provision a template whose source hashes do not match the
//     currently published Xenios versions (TemplateSourceDrift);
//   - creates IDEMPOTENT signing sessions: a refresh or a repeat click returns
//     the existing request, never a second provider document;
//   - processes provider COMPLETION server-side, deduplicated by provider event
//     id, hashing and storing the signed pdf + certificate and recording the
//     provider completion as the Xenios acceptance. A browser redirect never
//     triggers this: the activation gate advances only after this transaction
//     commits.
//
// Nothing here logs a url, a token, or any secret. Unknown documents return a
// typed denial rather than throwing.
// ---------------------------------------------------------------------------

// --- Errors ----------------------------------------------------------------

/** The spec's source hashes do not match the currently published Xenios versions. */
export class TemplateSourceDrift extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateSourceDrift";
  }
}

/** The provider refused a provisioning or session call. */
export class EsignProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsignProviderError";
  }
}

// --- Completed-document ingestion seam --------------------------------------
// The completion path hashes and stores the signed pdf + certificate. To avoid
// a cross-file build race with archive.ts (which imports this contract too), the
// service accepts an injected ingest callback. When none is injected it falls
// back to a default that stores through the injected EsignMediaPort and hashes
// with node crypto. Either way this module never imports archive.ts.

export interface IngestCompletedInput {
  memberId: string;
  providerDocumentId: string;
  packetOrDocumentId: string;
  xeniosDocumentVersionIds: readonly string[];
  signedFile: FetchedFile;
  certificateFile: FetchedFile | null;
  signerEmail: string | null;
  completedAt: string;
}

export interface IngestCompletedResult {
  signedPdfRef: string;
  signedPdfHash: string;
  certificateRef: string | null;
  certificateHash: string | null;
}

export type IngestCompletedFn = (input: IngestCompletedInput) => Promise<IngestCompletedResult>;

// --- Result types -----------------------------------------------------------

export type CreateSigningSessionFailure =
  | "no_versions"
  | "mode_not_provider_backed"
  | "version_not_published"
  | "template_drift"
  | "provider_error";

export type CreateSigningSessionResult =
  | { ok: true; request: SigningRequestRecord; signingUrl: string | null; idempotentReplay: boolean }
  | { ok: false; code: CreateSigningSessionFailure };

export type ProcessWebhookFailure =
  | "unknown_document"
  | "unverified_completion"
  | "provider_error"
  | "ingest_failed";

export type ProcessWebhookResult =
  | { ok: true; applied: boolean; status: SigningLinkStatus; completedVersionIds?: readonly string[] }
  | { ok: false; code: ProcessWebhookFailure };

export interface CreateSigningSessionInput {
  memberId: string;
  signerEmail: string;
  mode: SigningMode;
  xeniosDocumentVersionIds: readonly string[];
  externalReference?: string;
  idempotencyKey: string;
}

export interface EsignServiceOptions {
  store: EsignStore;
  provider: EsignProvider;
  media: EsignMediaPort;
  lifecycle: DocumentLifecycle;
  signatures: SignatureService;
  now?: () => Date;
  newId?: () => string;
  /** Optional override of the completed-document ingest (default uses media). */
  ingestCompleted?: IngestCompletedFn;
}

// --- Helpers ----------------------------------------------------------------

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function isTerminalStatus(status: SigningLinkStatus): boolean {
  return (
    status === "completed" || status === "declined" || status === "revoked" || status === "expired"
  );
}

/** Non-completion event types to the signing-link status they set. */
const NON_COMPLETION_STATUS: Partial<Record<EsignEventType, SigningLinkStatus>> = {
  created: "created",
  viewed: "viewed",
  signed: "signed",
  declined: "declined",
  revoked: "revoked",
  expired: "expired",
};

// --- Service ----------------------------------------------------------------

export class EsignService {
  private readonly store: EsignStore;
  private readonly provider: EsignProvider;
  private readonly media: EsignMediaPort;
  private readonly lifecycle: DocumentLifecycle;
  // The Xenios agreement engine, held so the service is constructed with the
  // authoritative signing surface even though completion records acceptance
  // structurally rather than fabricating a member signature.
  private readonly signatures: SignatureService;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly ingest: IngestCompletedFn;

  constructor(deps: EsignServiceOptions) {
    this.store = deps.store;
    this.provider = deps.provider;
    this.media = deps.media;
    this.lifecycle = deps.lifecycle;
    this.signatures = deps.signatures;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.ingest = deps.ingestCompleted ?? ((input) => this.defaultIngest(input));
  }

  /** Expose the injected agreement engine for the caller that advances the gate. */
  get agreementEngine(): SignatureService {
    return this.signatures;
  }

  /**
   * A deterministic template key. The same mode + versions + source hashes
   * always produce the same key; any hash change produces a different key, so
   * drifted legal text never reuses a template built for the old text.
   */
  deterministicTemplateKey(
    mode: SigningMode,
    xeniosDocumentVersionIds: readonly string[],
    sourceContentHashes: readonly string[],
  ): string {
    const versions = [...xeniosDocumentVersionIds].sort().join(",");
    const hashes = [...sourceContentHashes].sort().join(",");
    return `tmpl_${sha256Hex(`${mode}|${versions}|${hashes}`)}`;
  }

  /**
   * Provision (or reuse) a provider template for a spec. Idempotent: an
   * identical, already-provisioned mapping is returned untouched. A mapping for
   * the same mode+versions but different hashes is marked "drifted" and a new
   * one is provisioned (a completed historical mapping is never overwritten).
   * Refuses (TemplateSourceDrift) if the spec's hashes do not match the
   * currently published Xenios versions.
   */
  async provisionTemplate(spec: EsignTemplateSpec): Promise<TemplateMappingRecord> {
    // Refuse drift against the published Xenios truth, per document.
    for (const doc of spec.documents) {
      const version = await this.lifecycle.getVersion(doc.xeniosDocumentVersionId);
      if (!version) {
        throw new TemplateSourceDrift(`no xenios version ${doc.xeniosDocumentVersionId} to map`);
      }
      if (version.status !== "published") {
        throw new TemplateSourceDrift(`xenios version ${doc.xeniosDocumentVersionId} is not published`);
      }
      if (version.contentHash !== doc.sourceContentHash) {
        throw new TemplateSourceDrift(`source hash drift for xenios version ${doc.xeniosDocumentVersionId}`);
      }
    }

    const versionIds = spec.documents.map((doc) => doc.xeniosDocumentVersionId);
    const hashes = spec.documents.map((doc) => doc.sourceContentHash);
    const key = this.deterministicTemplateKey(spec.mode, versionIds, hashes);

    const existing = await this.store.templates.getByKey(key);
    if (
      existing &&
      existing.provisioningStatus === "provisioned" &&
      sameSet(existing.sourceContentHashes, hashes) &&
      sameSet(existing.xeniosDocumentVersionIds, versionIds)
    ) {
      return existing; // idempotent: never re-provision an identical template
    }

    // Mark any stale same-mode+versions mapping (different hashes) as drifted.
    const nowIso = this.now().toISOString();
    for (const mapping of await this.store.templates.list()) {
      if (
        mapping.templateKey !== key &&
        mapping.mode === spec.mode &&
        mapping.provisioningStatus === "provisioned" &&
        sameSet(mapping.xeniosDocumentVersionIds, versionIds) &&
        !sameSet(mapping.sourceContentHashes, hashes)
      ) {
        await this.store.templates.upsert({ ...mapping, provisioningStatus: "drifted", updatedAt: nowIso });
      }
    }

    const provisioned = await this.provider.provisionTemplate(spec);
    if (!provisioned.ok) {
      throw new EsignProviderError(`provider refused template provisioning (${provisioned.code})`);
    }

    const mapping: TemplateMappingRecord = {
      templateKey: key,
      provider: this.provider.name,
      providerTemplateId: provisioned.value.providerTemplateId,
      providerTemplateVersion: provisioned.value.providerTemplateVersion,
      mode: spec.mode,
      xeniosDocumentVersionIds: versionIds,
      sourceContentHashes: hashes,
      provisioningStatus: "provisioned",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.store.templates.upsert(mapping);
    return mapping;
  }

  /**
   * Create an idempotent signing session. A repeat with the same (member,
   * idempotencyKey) returns the existing request and does not mint a second
   * provider document. Every version must be published; the template spec is
   * built from those published versions, so the mapping can never drift against
   * itself.
   */
  async createSigningSession(input: CreateSigningSessionInput): Promise<CreateSigningSessionResult> {
    const existing = await this.store.requests.getByIdempotencyKey(input.memberId, input.idempotencyKey);
    if (existing) {
      // The signing url is provider-ephemeral and never persisted, so a replay
      // returns the durable request with a null url.
      return { ok: true, request: existing, signingUrl: null, idempotentReplay: true };
    }

    if (input.xeniosDocumentVersionIds.length === 0) {
      return { ok: false, code: "no_versions" };
    }
    if (!isProviderBackedMode(input.mode)) {
      return { ok: false, code: "mode_not_provider_backed" };
    }

    const documents: EsignTemplateDocument[] = [];
    const versionIds: string[] = [];
    const hashes: string[] = [];
    for (const versionId of input.xeniosDocumentVersionIds) {
      const version = await this.lifecycle.getVersion(versionId);
      if (!version || version.status !== "published") {
        return { ok: false, code: "version_not_published" };
      }
      documents.push({
        xeniosDocumentVersionId: version.id,
        category: version.category,
        title: version.title,
        sourceContentHash: version.contentHash,
        widgets: this.defaultWidgets(version.id),
      });
      versionIds.push(version.id);
      hashes.push(version.contentHash);
    }

    const templateKey = this.deterministicTemplateKey(input.mode, versionIds, hashes);
    const spec: EsignTemplateSpec = {
      templateKey,
      title:
        documents.length === 1
          ? documents[0].title
          : `xenios activation packet (${documents.length} documents)`,
      mode: input.mode,
      documents,
    };

    let mapping: TemplateMappingRecord;
    try {
      mapping = await this.provisionTemplate(spec);
    } catch (error) {
      if (error instanceof TemplateSourceDrift) return { ok: false, code: "template_drift" };
      if (error instanceof EsignProviderError) return { ok: false, code: "provider_error" };
      throw error;
    }

    const requestId = this.newId();
    const externalReference = input.externalReference ?? requestId;
    const session = await this.provider.createSigningSession({
      providerTemplateId: mapping.providerTemplateId,
      memberId: input.memberId,
      signerEmail: input.signerEmail,
      externalReference,
      // Completion is processed server-side from the webhook, so no redirect is
      // trusted to advance anything.
      redirectUrl: null,
      accessCode: null,
      linkTtlMinutes: null,
    });
    if (!session.ok) {
      return { ok: false, code: "provider_error" };
    }

    const nowIso = this.now().toISOString();
    const packetOrDocumentId = input.mode === "opensign_packet" ? templateKey : versionIds[0];
    const request: SigningRequestRecord = {
      id: requestId,
      memberId: input.memberId,
      packetOrDocumentId,
      mode: input.mode,
      provider: this.provider.name,
      providerTemplateId: mapping.providerTemplateId,
      providerTemplateVersion: mapping.providerTemplateVersion,
      providerDocumentId: session.value.providerDocumentId,
      xeniosDocumentVersionIds: versionIds,
      sourceContentHashes: hashes,
      signerIdentifier: input.signerEmail,
      signingLinkStatus: "created",
      viewedAt: null,
      signedAt: null,
      completedAt: null,
      declinedAt: null,
      expiredAt: null,
      signedPdfRef: null,
      certificateRef: null,
      signedPdfHash: null,
      certificateHash: null,
      verifiedEventIds: [],
      providerEventHistory: [],
      xeniosAcceptanceEventIds: [],
      idempotencyKey: input.idempotencyKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.store.requests.insert(request);
    return { ok: true, request, signingUrl: session.value.signingUrl, idempotentReplay: false };
  }

  /**
   * Process one verified provider webhook event. The completion path is the
   * only thing that advances the Xenios acceptance, and it runs entirely
   * server-side. Unknown documents return a denial rather than throwing; a
   * replayed event id is a no-op.
   */
  async processWebhookEvent(event: EsignWebhookEvent): Promise<ProcessWebhookResult> {
    const record = await this.store.requests.getByProviderDocumentId(event.providerDocumentId);
    if (!record) return { ok: false, code: "unknown_document" };

    // Idempotent replay: this exact provider event was already applied.
    if (record.verifiedEventIds.includes(event.eventId)) {
      return {
        ok: true,
        applied: false,
        status: record.signingLinkStatus,
        completedVersionIds: record.completedAt ? record.xeniosDocumentVersionIds : undefined,
      };
    }

    const nowIso = this.now().toISOString();
    const logEntry: ProviderEventLogEntry = {
      eventId: event.eventId,
      type: event.type,
      occurredAt: event.occurredAt,
      recordedAt: nowIso,
    };

    if (event.type === "completed") {
      return this.applyCompletion(record, event, logEntry, nowIso);
    }

    // A terminal record is frozen: a stray later event is recorded in the trail
    // but never downgrades a completed / declined / revoked / expired status.
    const terminal = isTerminalStatus(record.signingLinkStatus);
    const mapped = NON_COMPLETION_STATUS[event.type];
    const nextStatus = terminal || !mapped ? record.signingLinkStatus : mapped;
    const updated: SigningRequestRecord = {
      ...record,
      signingLinkStatus: nextStatus,
      viewedAt: !terminal && event.type === "viewed" ? event.occurredAt : record.viewedAt,
      signedAt: !terminal && event.type === "signed" ? event.occurredAt : record.signedAt,
      declinedAt: !terminal && event.type === "declined" ? event.occurredAt : record.declinedAt,
      expiredAt: !terminal && event.type === "expired" ? event.occurredAt : record.expiredAt,
      verifiedEventIds: [...record.verifiedEventIds, event.eventId],
      providerEventHistory: [...record.providerEventHistory, logEntry],
      updatedAt: nowIso,
    };
    await this.store.requests.update(updated);
    return { ok: true, applied: !terminal && mapped !== undefined, status: nextStatus };
  }

  // --- internals ------------------------------------------------------------

  private async applyCompletion(
    record: SigningRequestRecord,
    event: EsignWebhookEvent,
    logEntry: ProviderEventLogEntry,
    nowIso: string,
  ): Promise<ProcessWebhookResult> {
    // Already completed under an earlier event: record the new event in the
    // trail, never re-ingest or re-advance (idempotent completion).
    if (record.completedAt) {
      const updated: SigningRequestRecord = {
        ...record,
        verifiedEventIds: [...record.verifiedEventIds, event.eventId],
        providerEventHistory: [...record.providerEventHistory, logEntry],
        updatedAt: nowIso,
      };
      await this.store.requests.update(updated);
      return {
        ok: true,
        applied: false,
        status: "completed",
        completedVersionIds: record.xeniosDocumentVersionIds,
      };
    }

    // (a) The record must map to a member and the exact versions it signs, and
    // a completion without the signed file is not proof of completion.
    if (!record.memberId || record.xeniosDocumentVersionIds.length === 0) {
      return { ok: false, code: "unverified_completion" };
    }
    if (!record.providerDocumentId || !event.signedFileUrl) {
      return { ok: false, code: "unverified_completion" };
    }

    // (b) Fetch the signed pdf and the certificate. On any provider failure,
    // persist NOTHING: the event id stays unrecorded so a retry re-attempts.
    const signedFetch = await this.provider.fetchCompletedFile({ fileUrl: event.signedFileUrl });
    if (!signedFetch.ok) return { ok: false, code: "provider_error" };
    let certificateFile: FetchedFile | null = null;
    if (event.certificateUrl) {
      const certFetch = await this.provider.fetchCompletedFile({ fileUrl: event.certificateUrl });
      if (!certFetch.ok) return { ok: false, code: "provider_error" };
      certificateFile = certFetch.value;
    }

    // (c) Hash and store both, through the injected ingest (default uses media).
    let ingested: IngestCompletedResult;
    try {
      ingested = await this.ingest({
        memberId: record.memberId,
        providerDocumentId: record.providerDocumentId,
        packetOrDocumentId: record.packetOrDocumentId,
        xeniosDocumentVersionIds: record.xeniosDocumentVersionIds,
        signedFile: signedFetch.value,
        certificateFile,
        signerEmail: event.signerEmail ?? record.signerIdentifier,
        completedAt: event.occurredAt,
      });
    } catch {
      return { ok: false, code: "ingest_failed" };
    }

    // (d)(e) Record refs+hashes, set completed, and record the provider
    // completion as the Xenios acceptance. We never fabricate a member
    // signature: the provider completion + certificate ARE the evidence. The
    // caller advances the Xenios gate from completedVersionIds after commit.
    const acceptanceIds = record.xeniosDocumentVersionIds.map((v) => `esign:${event.eventId}:${v}`);
    const updated: SigningRequestRecord = {
      ...record,
      signingLinkStatus: "completed",
      completedAt: event.occurredAt,
      signedPdfRef: ingested.signedPdfRef,
      signedPdfHash: ingested.signedPdfHash,
      certificateRef: ingested.certificateRef,
      certificateHash: ingested.certificateHash,
      verifiedEventIds: [...record.verifiedEventIds, event.eventId],
      providerEventHistory: [...record.providerEventHistory, logEntry],
      xeniosAcceptanceEventIds: [...record.xeniosAcceptanceEventIds, ...acceptanceIds],
      updatedAt: nowIso,
    };
    await this.store.requests.update(updated);
    return {
      ok: true,
      applied: true,
      status: "completed",
      completedVersionIds: record.xeniosDocumentVersionIds,
    };
  }

  /** The default completed-document ingest: hash with crypto, store through media. */
  private async defaultIngest(input: IngestCompletedInput): Promise<IngestCompletedResult> {
    const signedPdfHash = sha256Bytes(input.signedFile.bytes);
    const signedPath = `esign/${input.memberId}/${input.providerDocumentId}/signed.pdf`;
    const signedPut = await this.media.putObject({
      storagePath: signedPath,
      bytes: input.signedFile.bytes,
      contentType: input.signedFile.contentType ?? "application/pdf",
    });
    if (!signedPut.ok) throw new Error("signed document store failed");

    let certificateRef: string | null = null;
    let certificateHash: string | null = null;
    if (input.certificateFile) {
      certificateHash = sha256Bytes(input.certificateFile.bytes);
      const certPath = `esign/${input.memberId}/${input.providerDocumentId}/certificate.pdf`;
      const certPut = await this.media.putObject({
        storagePath: certPath,
        bytes: input.certificateFile.bytes,
        contentType: input.certificateFile.contentType ?? "application/pdf",
      });
      if (!certPut.ok) throw new Error("certificate store failed");
      certificateRef = certPut.value.storagePath;
    }

    return {
      signedPdfRef: signedPut.value.storagePath,
      signedPdfHash,
      certificateRef,
      certificateHash,
    };
  }

  private defaultWidgets(versionId: string): EsignWidget[] {
    return [
      { name: `${versionId}:legal_name`, type: "typed_legal_name", required: true },
      { name: `${versionId}:signature`, type: "signature", required: true },
      { name: `${versionId}:date`, type: "date", required: true },
    ];
  }
}
