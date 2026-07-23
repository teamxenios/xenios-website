// ---------------------------------------------------------------------------
// xenios research: NATIVE (embedded) e-signature signing service.
//
// The member signs every agreement inside the Xenios activation page. There is
// no external provider, no signing URL, no webhook, and no redirect: the
// authenticated submission IS the completion.
//
// ATOMIC COMPLETION. A native agreement counts as signed (and satisfies the
// activation gate) ONLY when all of the following have succeeded, in order:
//   1. every legal guard in SignatureService (never duplicated or weakened),
//   2. signed-PDF generation,
//   3. completion-certificate generation,
//   4. both private uploads,
//   5. the durable signing-request evidence record is persisted,
//   6. the legal SignatureRecord is inserted LAST.
// The SignatureRecord is what the gate reads, and it is written LAST through
// SignatureService's beforeCommit hook: if any earlier step fails, the
// signature is never inserted, so the agreement stays unsigned and the gate
// does not advance. The archive row is a post-signature recoverable projection
// (the request record already holds the refs + hashes).
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
import { SignatureService, type SignFailureCode } from "../signatures";
import {
  XENIOS_NATIVE_PROVIDER,
  type ArchiveRecord,
  type CompleteNativeSignatureInput,
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

/** Thrown from inside the atomic beforeCommit so the signature is never
 * inserted; the caller maps it to a precise result code. */
class NativeEvidenceError extends Error {
  constructor(
    public readonly code: NativeSignFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "NativeEvidenceError";
  }
}

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
    const { store, media, lifecycle, signatures, pdf } = this.deps;
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
    let builtRequest: SigningRequestRecord | undefined;
    let signedPdfHash = "";
    let certificateHash = "";

    try {
      const signResult = await signatures.sign(
        {
          memberId,
          documentVersionId,
          typedLegalName,
          fullDocumentShown: input.document.fullDocumentShown,
          affirmativeConsent: input.document.affirmativeConsent,
          separateAcknowledgment: input.document.separateAcknowledgment,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
        {
          // Runs after every legal guard passes and the signature record is
          // built, but BEFORE it is inserted. Any throw here leaves the
          // agreement unsigned.
          beforeCommit: async (signature) => {
            const version = await lifecycle.getVersion(signature.documentVersionId);
            if (!version) {
              throw new NativeEvidenceError("version_not_found", "The document version could not be resolved.");
            }
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
              throw new NativeEvidenceError("pdf_generation_error", "The signed document could not be generated.");
            }
            signedPdfHash = sha256Hex(signedPdf);

            // (3) completion certificate
            let certificate: Buffer;
            try {
              certificate = await pdf.generateCompletionCertificatePdf({
                memberId,
                signerEmail: input.signerEmail,
                documents: [
                  { title: version.title, documentVersionId: version.id, contentHash: version.contentHash },
                ],
                signingRequestId: requestId,
                signedAt: signature.signedAt,
                ipHash: signature.ipHash,
                userAgentHash: signature.userAgentHash,
                signatureMethod: input.evidence.method,
                signedPdfSha256: signedPdfHash,
              });
            } catch {
              throw new NativeEvidenceError(
                "certificate_generation_error",
                "The completion certificate could not be generated.",
              );
            }
            certificateHash = sha256Hex(certificate);

            // (4) both private uploads (xenios-owned hashes)
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
              throw new NativeEvidenceError("storage_error", "The signed document could not be stored.");
            }

            // (5) the durable EVIDENCE record, in state `evidence_stored`. This
            // is NON-activating: signingLinkStatus is not `completed`, so it is
            // never shown as signed, never downloadable, and never counts at the
            // gate. It is keyed deterministically so a retry upserts the same row
            // (no orphan) and a same-key race admits exactly one. Written BEFORE
            // the signature: if this fails, the signature is never inserted.
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
            builtRequest = await upsertRequestRecord(store, evidence, memberId, idempotencyKey);
          },
        },
      );

      if (!signResult.ok) {
        // A guard failure (builtRequest undefined, nothing uploaded) OR the
        // final signature insert failed (builtRequest is evidence_stored, and
        // the uploaded objects are now orphans). In the latter case mark the
        // request failed_cleanup_required so a sweeper can delete the objects.
        // Either way the agreement stays UNSIGNED and the gate does not advance.
        if (builtRequest) await this.markFailedCleanup(builtRequest);
        return { ok: false, code: signResult.code };
      }

      // The legal signature committed. The COMPLETION TRANSITION flips the
      // request evidence_stored -> completed, binding the version, hashes, refs,
      // and the signature id, then writes the archive projection. Only after
      // this does the agreement present as signed. (This transition and the
      // signature insert are two writes across two stores, not one database
      // transaction, so the flow is NOT claimed to be fully atomic; a transition
      // failure leaves the request in evidence_stored and is reconciled on the
      // next call. See the implementation report.)
      const signature = signResult.signature;
      if (!builtRequest) {
        // Replay: the signature pre-existed, so beforeCommit did not run.
        const prior = await this.findNativeRequestFor(memberId, documentVersionId, idempotencyKey);
        if (prior && prior.nativeCompletionState !== "completed") {
          const done = await this.finalizeCompleted(prior, signature);
          return {
            ok: true,
            request: done,
            replayed: true,
            signedPdfHash: done.signedPdfHash ?? "",
            certificateHash: done.certificateHash ?? "",
          };
        }
        return {
          ok: true,
          request:
            prior ??
            replayShell(requestId, memberId, documentVersionId, signature.signedAt, idempotencyKey, input.signerEmail, this.now().toISOString()),
          replayed: true,
          signedPdfHash: prior?.signedPdfHash ?? "",
          certificateHash: prior?.certificateHash ?? "",
        };
      }

      const completed = await this.finalizeCompleted(builtRequest, signature);
      return {
        ok: true,
        request: completed,
        replayed: signResult.replayed,
        signedPdfHash,
        certificateHash,
      };
    } catch (err) {
      if (err instanceof NativeEvidenceError) {
        // beforeCommit failed (pdf/cert/upload/evidence-persist). If an evidence
        // row was written, mark it for cleanup; the agreement is unsigned.
        if (builtRequest) await this.markFailedCleanup(builtRequest).catch(() => {});
        return { ok: false, code: err.code, message: err.message };
      }
      throw err;
    }
  }

  /** The completion transition: evidence_stored -> completed, binding the
   * signature and refs, then the archive projection. */
  private async finalizeCompleted(
    evidence: SigningRequestRecord,
    signature: { id: string; signedAt: string },
  ): Promise<SigningRequestRecord> {
    const nowIso = this.now().toISOString();
    const completed: SigningRequestRecord = {
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
    await this.deps.store.requests.update(completed);
    await this.persistArchiveBestEffort(completed);
    return completed;
  }

  /** Mark an evidence record's uploaded objects for cleanup after the signature
   * commit failed. The state is the durable cleanup marker a sweeper reads. */
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

  /** Find the completed native request for this member+version (by key first,
   * else any native request for the version). */
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

  private async persistArchiveBestEffort(request: SigningRequestRecord): Promise<void> {
    const nowIso = this.now().toISOString();
    const archiveRecord: ArchiveRecord = {
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
    try {
      // Idempotent: skip if an archive row for this request's document already
      // exists (a retry after the signature committed).
      const existing = await this.deps.store.archive.listByMember(request.memberId);
      if (existing.some((a) => a.signedPdfHash === request.signedPdfHash && a.documentVersionId === archiveRecord.documentVersionId)) {
        return;
      }
      await this.deps.store.archive.insert(archiveRecord);
    } catch {
      // Non-fatal by design; the signing request is the source of truth.
    }
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
 * store outage (no row appears) throws so the signature is never inserted.
 */
async function upsertRequestRecord(
  store: EsignStore,
  request: SigningRequestRecord,
  memberId: string,
  idempotencyKey: string,
): Promise<SigningRequestRecord> {
  const prior = await store.requests.getByIdempotencyKey(memberId, idempotencyKey);
  if (prior) {
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
      try {
        await store.requests.update({ ...request, id: winner.id, createdAt: winner.createdAt });
      } catch {
        // best effort; the winner row already carries this document's evidence
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
