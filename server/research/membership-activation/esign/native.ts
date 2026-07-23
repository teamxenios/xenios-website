// ---------------------------------------------------------------------------
// xenios research: NATIVE (embedded) e-signature signing service.
//
// The member signs every agreement inside the Xenios activation page. There is
// no external provider, no signing URL, no webhook, and no redirect: the
// authenticated submission IS the completion.
//
// ATOMIC COMPLETION. A native agreement counts as signed (and satisfies the
// activation gate) ONLY when the final legal commit succeeds. The flow, in
// order:
//   1. every legal guard in SignatureService (never duplicated or weakened),
//      which BUILDS the signature record WITHOUT inserting it (prepare()),
//   2. signed-PDF generation,
//   3. completion-certificate generation,
//   4. both private uploads,
//   5. the durable signing-request evidence record is persisted in state
//      `evidence_stored` (NON-activating: never shown as signed, never
//      downloadable, never counts at the gate),
//   6. THE ATOMIC COMMIT (a single database transaction, a Supabase RPC in
//      production): it inserts the legal SignatureRecord, transitions the
//      request evidence_stored -> completed, and upserts the archive record, ALL
//      OR NOTHING.
// The SignatureRecord is what the gate reads, and it is inserted ONLY inside
// step 6's transaction, together with the completion transition. So a native
// SignatureRecord can never exist unless its matching request is `completed`:
// if the commit fails, no signature is inserted, the request is not completed,
// the agreement stays unsigned, and the gate does not advance. The uploaded
// objects (step 4) are outside the transaction (acceptable: evidence_stored is
// non-activating) and are marked failed_cleanup_required on a commit failure so
// a sweeper can delete the orphans.
//
// IDEMPOTENCY. The signing-request id is DERIVED from (member, idempotency key),
// so a retry upserts the same row rather than orphaning a new one, and the
// signature's own (member, version) uniqueness admits exactly one signature. An
// idempotency key is bound to its document version: reusing it for a different
// document is a conflict, not a replay.
//
// The identity is ALWAYS the server-supplied member context; a member id is
// never read from a request body. Nothing here reads a secret, touches the
// network, or logs the signature payload.
// ---------------------------------------------------------------------------

import crypto from "crypto";
import { DocumentLifecycle, categoryDefinitionFor } from "../documents";
import { SignatureService, type SignFailureCode, type SignatureRecord } from "../signatures";
import {
  XENIOS_NATIVE_PROVIDER,
  type ArchiveRecord,
  type CompleteNativeSignatureInput,
  type NativeCommitFn,
  type EsignMediaPort,
  type EsignStore,
  type PdfGenerator,
  type SigningRequestRecord,
} from "./contracts";
import { ingestCompletedDocuments, sha256Hex } from "./archive";

/** Maximum decoded size of a drawn-signature PNG. A trimmed canvas signature is
 * a few KB; this bounds a hostile payload well above any real one. */
export const MAX_DRAWN_SIGNATURE_BYTES = 1 * 1024 * 1024;
/** Maximum drawn-signature image dimensions (a signature strip, not a photo). */
export const MAX_DRAWN_SIGNATURE_WIDTH = 2000;
export const MAX_DRAWN_SIGNATURE_HEIGHT = 1000;

export type NativeSignFailureCode =
  | SignFailureCode
  | "capability_disabled"
  | "signature_evidence_required"
  | "signature_invalid"
  | "signature_too_large"
  | "signature_dimensions"
  | "pdf_generation_error"
  | "certificate_generation_error"
  | "idempotency_conflict";

export type NativeSignResult =
  | {
      ok: true;
      request: SigningRequestRecord;
      replayed: boolean;
      signedPdfHash: string;
      certificateHash: string;
    }
  | { ok: false; code: NativeSignFailureCode; message?: string };

export interface NativeEsignServiceOptions {
  now?: () => Date;
  newId?: () => string;
}

export interface NativeEsignServiceDeps {
  store: EsignStore;
  media: EsignMediaPort;
  lifecycle: DocumentLifecycle;
  signatures: SignatureService;
  pdf: PdfGenerator;
  /**
   * The atomic-commit seam: inserts the legal signature, transitions the
   * request to completed, and upserts the archive as ONE database transaction
   * (a Supabase RPC in production, an in-memory equivalent in tests). This is
   * the ONLY place a native SignatureRecord is inserted.
   */
  commit: NativeCommitFn;
}

export class NativeEsignService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly deps: NativeEsignServiceDeps,
    options: NativeEsignServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => crypto.randomUUID());
  }

  async completeNativeSignature(input: CompleteNativeSignatureInput): Promise<NativeSignResult> {
    const { store, media, lifecycle, signatures, pdf, commit } = this.deps;
    const memberId = input.memberId;
    const documentVersionId = input.document.documentVersionId;
    const idempotencyKey = input.idempotencyKey;

    // Idempotency INTENT BINDING: a key that already named a different document
    // is a conflict, never a replay of the first document.
    const existingByKey = await store.requests.getByIdempotencyKey(memberId, idempotencyKey);
    if (existingByKey && existingByKey.xeniosDocumentVersionIds[0] !== documentVersionId) {
      return {
        ok: false,
        code: "idempotency_conflict",
        message: "This idempotency key was already used for a different document.",
      };
    }

    // Evidence-input validation (before any legal write).
    const typedLegalName = (input.evidence.typedLegalName ?? "").trim();
    if (typedLegalName.length < 2) return { ok: false, code: "legal_name_required" };
    let drawnBytes: Buffer | null = null;
    if (input.evidence.method === "drawn") {
      const png = validateDrawnPng(input.evidence.drawnPngBase64 ?? "");
      if (!png.ok) return { ok: false, code: png.code, message: png.message };
      drawnBytes = png.bytes;
    }

    const requestId = deterministicRequestId(memberId, idempotencyKey);

    // (1) EVERY legal guard, and BUILD the signature record WITHOUT inserting
    // it. The insert happens only inside the atomic commit below.
    const prep = await signatures.prepare({
      memberId,
      documentVersionId,
      typedLegalName,
      fullDocumentShown: input.document.fullDocumentShown,
      affirmativeConsent: input.document.affirmativeConsent,
      separateAcknowledgment: input.document.separateAcknowledgment,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    if (!prep.ok) return { ok: false, code: prep.code };

    // REPLAY: the signature already exists (a prior native completion, or a
    // clickwrap AgreementSignCard signature). The evidence is never
    // regenerated; return the completed native request if there is one.
    if (prep.existing) {
      return this.replayCompleted(memberId, documentVersionId, idempotencyKey, prep.existing, requestId, input.signerEmail);
    }

    const signature = prep.record;

    const version = await lifecycle.getVersion(documentVersionId);
    if (!version) return { ok: false, code: "version_not_found" };
    const requiresSeparateAck = categoryDefinitionFor(version.category).requiresSeparateAcknowledgment;

    // (2) signed PDF
    let signedPdf: Buffer;
    try {
      signedPdf = await pdf.generateSignedAgreementPdf({
        agreementTitle: version.title,
        agreementContent: version.content,
        semver: version.semver,
        documentVersionId: version.id,
        sourceContentHash: version.contentHash,
        typedLegalName,
        signatureMethod: input.evidence.method,
        drawnPngBase64: drawnBytes ? drawnBytes.toString("base64") : null,
        signedAt: signature.signedAt,
        separateAcknowledgment: requiresSeparateAck && signature.separateAcknowledgment,
        signingRequestId: requestId,
      });
    } catch {
      return { ok: false, code: "pdf_generation_error", message: "The signed document could not be generated." };
    }
    const signedPdfHash = sha256Hex(signedPdf);

    // (3) completion certificate
    let certificate: Buffer;
    try {
      certificate = await pdf.generateCompletionCertificatePdf({
        memberId,
        signerEmail: input.signerEmail,
        documents: [{ title: version.title, documentVersionId: version.id, contentHash: version.contentHash }],
        signingRequestId: requestId,
        signedAt: signature.signedAt,
        ipHash: signature.ipHash,
        userAgentHash: signature.userAgentHash,
        signatureMethod: input.evidence.method,
        signedPdfSha256: signedPdfHash,
      });
    } catch {
      return {
        ok: false,
        code: "certificate_generation_error",
        message: "The completion certificate could not be generated.",
      };
    }
    const certificateHash = sha256Hex(certificate);

    // (4) both private uploads (xenios-owned hashes). OUTSIDE the transaction.
    let ingest;
    try {
      ingest = await ingestCompletedDocuments({
        memberId,
        packetOrDocumentId: version.id,
        version: version.semver,
        signedPdf: { bytes: signedPdf, contentType: "application/pdf" },
        certificate: { bytes: certificate, contentType: "application/pdf" },
        media,
        provider: XENIOS_NATIVE_PROVIDER,
        completedAt: signature.signedAt,
      });
    } catch {
      return { ok: false, code: "storage_error", message: "The signed document could not be stored." };
    }

    // (5) the durable EVIDENCE record, in state `evidence_stored`. NON-activating
    // (signingLinkStatus is not `completed`), so it is never shown as signed,
    // never downloadable, and never counts at the gate. Keyed deterministically
    // so a retry upserts the same row (no orphan) and a same-key race admits
    // exactly one. Written BEFORE the commit; the signature is NOT inserted here.
    const nowIso = this.now().toISOString();
    const evidence: SigningRequestRecord = {
      id: requestId,
      memberId,
      packetOrDocumentId: version.id,
      mode: "esign_document",
      provider: XENIOS_NATIVE_PROVIDER,
      providerTemplateId: null,
      providerTemplateVersion: null,
      providerDocumentId: null,
      xeniosDocumentVersionIds: [version.id],
      sourceContentHashes: [version.contentHash],
      signerIdentifier: input.signerEmail,
      signingLinkStatus: "created",
      nativeCompletionState: "evidence_stored",
      viewedAt: null,
      signedAt: null,
      completedAt: null,
      declinedAt: null,
      expiredAt: null,
      signedPdfRef: ingest.signedPdfRef,
      certificateRef: ingest.certificateRef,
      signedPdfHash: ingest.signedPdfHash,
      certificateHash: ingest.certificateHash,
      verifiedEventIds: [],
      providerEventHistory: [
        { eventId: `native:${requestId}:evidence`, type: "created", occurredAt: nowIso, recordedAt: nowIso },
      ],
      xeniosAcceptanceEventIds: [],
      idempotencyKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    let builtRequest: SigningRequestRecord;
    try {
      builtRequest = await upsertRequestRecord(store, evidence, memberId, idempotencyKey);
    } catch (err) {
      if (err instanceof NativeEvidenceError) return { ok: false, code: err.code, message: err.message };
      throw err;
    }

    // (6) THE ATOMIC COMMIT. Insert the signature, transition the request to
    // completed, and upsert the archive as ONE transaction. On failure: NO
    // signature exists, the request is not completed, the evidence is marked for
    // cleanup, the agreement stays unsigned, and the gate does not advance.
    const completedRequest = this.completedShape(builtRequest, signature, this.now().toISOString());
    const archive = this.archiveShape(completedRequest);
    const committed = await commit({
      signature,
      memberId,
      documentVersionId,
      idempotencyKey,
      completedRequest,
      archive,
    });
    if (!committed.ok) {
      await this.markFailedCleanup(builtRequest);
      // Every atomic-commit failure surfaces as a storage error: the signature
      // did not commit, so from the member's side the completion could not be
      // stored. The specific NativeCommitCode is for server logs, never leaked.
      return { ok: false, code: "storage_error", message: "The signature could not be committed." };
    }

    // The request bound to the signature that actually committed (a concurrent
    // winner may differ from this call's built record).
    const finalRequest =
      committed.signature.id === signature.id
        ? completedRequest
        : { ...completedRequest, xeniosAcceptanceEventIds: [committed.signature.id] };
    return {
      ok: true,
      request: finalRequest,
      replayed: committed.replayed,
      signedPdfHash,
      certificateHash,
    };
  }

  /**
   * Replay for an already-existing signature. If a completed native request is
   * on file, return it. A signature with no completed native request means the
   * agreement was signed off the native path (clickwrap); the agreement is
   * signed, there is simply no native signed-PDF to point at.
   */
  private async replayCompleted(
    memberId: string,
    documentVersionId: string,
    idempotencyKey: string,
    signature: SignatureRecord,
    requestId: string,
    signerEmail: string,
  ): Promise<NativeSignResult> {
    const prior = await this.findNativeRequestFor(memberId, documentVersionId, idempotencyKey);
    if (prior && prior.nativeCompletionState === "completed") {
      return {
        ok: true,
        request: prior,
        replayed: true,
        signedPdfHash: prior.signedPdfHash ?? "",
        certificateHash: prior.certificateHash ?? "",
      };
    }
    return {
      ok: true,
      request:
        prior ??
        replayShell(requestId, memberId, documentVersionId, signature.signedAt, idempotencyKey, signerEmail, this.now().toISOString()),
      replayed: true,
      signedPdfHash: prior?.signedPdfHash ?? "",
      certificateHash: prior?.certificateHash ?? "",
    };
  }

  /** Build the completed-request shape (state completed, signature id bound)
   * that the atomic commit persists. Pure: no store write. */
  private completedShape(
    evidence: SigningRequestRecord,
    signature: { id: string; signedAt: string },
    nowIso: string,
  ): SigningRequestRecord {
    return {
      ...evidence,
      signingLinkStatus: "completed",
      nativeCompletionState: "completed",
      signedAt: signature.signedAt,
      completedAt: signature.signedAt,
      xeniosAcceptanceEventIds: [signature.id],
      providerEventHistory: [
        ...evidence.providerEventHistory,
        { eventId: `native:${evidence.id}:completed`, type: "completed", occurredAt: signature.signedAt, recordedAt: nowIso },
      ],
      updatedAt: nowIso,
    };
  }

  /** Build the archive projection the atomic commit inserts. Pure: no store write. */
  private archiveShape(request: SigningRequestRecord): ArchiveRecord {
    const nowIso = this.now().toISOString();
    return {
      id: this.newId(),
      memberId: request.memberId,
      packetOrDocumentId: request.packetOrDocumentId,
      documentVersionId: request.xeniosDocumentVersionIds[0] ?? null,
      provider: request.provider,
      providerDocumentId: null,
      signedPdfRef: request.signedPdfRef,
      signedPdfHash: request.signedPdfHash,
      certificateRef: request.certificateRef,
      certificateHash: request.certificateHash,
      xeniosSourceHash: request.sourceContentHashes[0] ?? null,
      signerEmail: request.signerIdentifier,
      completedAt: request.completedAt,
      retentionClass: "legal_records",
      accessClassification: "member_and_admin",
      archiveStatus: "stored",
      emailDeliveryStatus: "pending",
      localExportStatus: "not_exported",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  /** Mark an evidence record's uploaded objects for cleanup after the atomic
   * commit failed. The state is the durable cleanup marker a sweeper reads. The
   * agreement is unsigned and the gate is not advanced. */
  private async markFailedCleanup(evidence: SigningRequestRecord): Promise<void> {
    try {
      await this.deps.store.requests.update({
        ...evidence,
        nativeCompletionState: "failed_cleanup_required",
        updatedAt: this.now().toISOString(),
      });
    } catch {
      // best effort; the request already carries a non-completed state
    }
  }

  /** Find the native request for this member+version (by key first, else any
   * native request for the version). */
  private async findNativeRequestFor(
    memberId: string,
    documentVersionId: string,
    idempotencyKey: string,
  ): Promise<SigningRequestRecord | undefined> {
    const byKey = await this.deps.store.requests.getByIdempotencyKey(memberId, idempotencyKey);
    if (byKey && byKey.xeniosDocumentVersionIds[0] === documentVersionId) return byKey;
    const all = await this.deps.store.requests.listByMember(memberId);
    return all.find(
      (r) => r.provider === XENIOS_NATIVE_PROVIDER && r.xeniosDocumentVersionIds[0] === documentVersionId,
    );
  }
}

/** Thrown from inside evidence persistence so the caller maps it to a precise
 * result code without inserting a signature. */
class NativeEvidenceError extends Error {
  constructor(
    public readonly code: NativeSignFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "NativeEvidenceError";
  }
}

/** Deterministic request id from (member, idempotency key): a retry produces the
 * same id, so it upserts one row rather than orphaning a new one. */
function deterministicRequestId(memberId: string, idempotencyKey: string): string {
  return "native_" + sha256Hex(Buffer.from(`${memberId}:${idempotencyKey}`, "utf8")).slice(0, 32);
}

/**
 * Persist the signing-request evidence row idempotently and race-tolerantly.
 * A prior row (retry) is updated; a concurrent racer that inserted first is
 * detected by re-fetching after a failed insert and updated instead. A genuine
 * store outage (no row appears) throws so the commit never runs.
 */
async function upsertRequestRecord(
  store: EsignStore,
  request: SigningRequestRecord,
  memberId: string,
  idempotencyKey: string,
): Promise<SigningRequestRecord> {
  const prior = await store.requests.getByIdempotencyKey(memberId, idempotencyKey);
  if (prior) {
    // A prior row that already completed must NOT be reopened to evidence_stored.
    if (prior.nativeCompletionState === "completed") return prior;
    await store.requests.update({ ...request, id: prior.id, createdAt: prior.createdAt });
    return { ...request, id: prior.id, createdAt: prior.createdAt };
  }
  try {
    await store.requests.insert(request);
    return request;
  } catch {
    // Either a concurrent racer inserted this (member, idempotencyKey) first, or
    // the store is down. Re-fetch: if the row now exists it was the race, so
    // reconcile to it; otherwise the store genuinely failed.
    const winner = await store.requests.getByIdempotencyKey(memberId, idempotencyKey);
    if (winner) {
      if (winner.nativeCompletionState !== "completed") {
        try {
          await store.requests.update({ ...request, id: winner.id, createdAt: winner.createdAt });
        } catch {
          // best effort; the winner row already carries this document's evidence
        }
      }
      return { ...request, id: winner.id, createdAt: winner.createdAt };
    }
    throw new NativeEvidenceError("storage_error", "The signing record could not be stored.");
  }
}

/** A minimal completed-request view for a replay where the signature exists but
 * was created outside the native path (e.g. clickwrap): the agreement is signed,
 * there is simply no native PDF to point at. */
function replayShell(
  requestId: string,
  memberId: string,
  documentVersionId: string,
  signedAt: string,
  idempotencyKey: string,
  signerEmail: string,
  nowIso: string,
): SigningRequestRecord {
  return {
    id: requestId,
    memberId,
    packetOrDocumentId: documentVersionId,
    mode: "esign_document",
    provider: XENIOS_NATIVE_PROVIDER,
    providerTemplateId: null,
    providerTemplateVersion: null,
    providerDocumentId: null,
    xeniosDocumentVersionIds: [documentVersionId],
    sourceContentHashes: [],
    signerIdentifier: signerEmail,
    signingLinkStatus: "completed",
    nativeCompletionState: "completed",
    viewedAt: null,
    signedAt,
    completedAt: signedAt,
    declinedAt: null,
    expiredAt: null,
    signedPdfRef: null,
    certificateRef: null,
    signedPdfHash: null,
    certificateHash: null,
    verifiedEventIds: [],
    providerEventHistory: [],
    xeniosAcceptanceEventIds: [],
    idempotencyKey,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** The 8-byte PNG signature. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Validate a drawn-signature payload server-side: strict base64, real PNG bytes,
 * a bounded decoded size, and bounded image dimensions. Refuses precisely; the
 * caller never logs the payload.
 */
export function validateDrawnPng(
  raw: string,
): { ok: true; bytes: Buffer } | { ok: false; code: NativeSignFailureCode; message: string } {
  const cleaned = raw.replace(/^data:image\/png;base64,/, "").trim();
  if (cleaned.length === 0) {
    return { ok: false, code: "signature_evidence_required", message: "A drawn signature is required." };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    return { ok: false, code: "signature_invalid", message: "The signature image is not valid base64." };
  }
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.length === 0) {
    return { ok: false, code: "signature_invalid", message: "The signature image is empty." };
  }
  if (bytes.length > MAX_DRAWN_SIGNATURE_BYTES) {
    return { ok: false, code: "signature_too_large", message: "The signature image is too large." };
  }
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return { ok: false, code: "signature_invalid", message: "The signature image is not a PNG." };
  }
  // IHDR is the first chunk: width at byte offset 16, height at 20 (big-endian).
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (
    width === 0 ||
    height === 0 ||
    width > MAX_DRAWN_SIGNATURE_WIDTH ||
    height > MAX_DRAWN_SIGNATURE_HEIGHT
  ) {
    return { ok: false, code: "signature_dimensions", message: "The signature image dimensions are out of range." };
  }
  return { ok: true, bytes };
}
