// ---------------------------------------------------------------------------
// xenios research: NATIVE (embedded) e-signature signing service.
//
// The member signs every agreement inside the Xenios activation page. There is
// no external provider, no signing URL, no webhook, and no redirect: the
// authenticated submission IS the completion. This service is orchestration
// over pieces that already exist and are already tested:
//
//   - SignatureService records the LEGAL signature and enforces every guard
//     (published-only, fullDocumentShown, affirmativeConsent, electronic
//     consent first, separate acknowledgment, append-only, idempotent replay,
//     sha-256-hashed IP/UA, typed legal name). It stays the source of legal
//     truth; this service never bypasses it.
//   - PdfGenerator renders the signed agreement PDF and the completion
//     certificate (injected, so this is unit-tested without a PDF engine).
//   - The archive pipeline (ingestCompletedDocuments) hashes and stores both
//     files privately, and the esign store keeps the durable signing-request +
//     archive records the document centers read.
//
// The identity is ALWAYS the server-supplied member context; a member id is
// never read from a request body. Nothing here reads a secret, touches the
// network, or logs evidence.
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

/** The native signing failure codes (a superset of the signature codes). */
export type NativeSignFailureCode =
  | SignFailureCode
  | "capability_disabled"
  | "signature_evidence_required"
  | "pdf_generation_error"
  | "storage_error";

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

/**
 * The pieces the native service composes. The store is the composed esign
 * store ({ requests, templates, archive }); media is the private bucket port.
 */
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

  /**
   * Complete a native signature for ONE document. Idempotent by
   * (memberId, idempotencyKey): a retry returns the existing request instead
   * of minting a second one or a second signed PDF.
   */
  async completeNativeSignature(input: CompleteNativeSignatureInput): Promise<NativeSignResult> {
    const { store, media, lifecycle, signatures, pdf } = this.deps;

    // Idempotent replay: a completed request for this key already exists.
    const existing = await store.requests.getByIdempotencyKey(input.memberId, input.idempotencyKey);
    if (existing) {
      return {
        ok: true,
        request: existing,
        replayed: true,
        signedPdfHash: existing.signedPdfHash ?? "",
        certificateHash: existing.certificateHash ?? "",
      };
    }

    // Evidence discipline: a legal name is always required; a drawn signature
    // must carry its PNG. The typed method needs no image (the typed legal name
    // is the signature representation).
    const typedLegalName = (input.evidence.typedLegalName ?? "").trim();
    if (typedLegalName.length < 2) {
      return { ok: false, code: "legal_name_required" };
    }
    if (input.evidence.method === "drawn" && !hasDrawnEvidence(input.evidence.drawnPngBase64)) {
      return { ok: false, code: "signature_evidence_required", message: "A drawn signature is required." };
    }

    // Record the LEGAL signature through the existing engine. This is where
    // every guard lives; the native path adds evidence, it never relaxes a rule.
    const signResult = await signatures.sign({
      memberId: input.memberId,
      documentVersionId: input.document.documentVersionId,
      typedLegalName,
      fullDocumentShown: input.document.fullDocumentShown,
      affirmativeConsent: input.document.affirmativeConsent,
      separateAcknowledgment: input.document.separateAcknowledgment,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    if (!signResult.ok) {
      return { ok: false, code: signResult.code };
    }
    const signature = signResult.signature;

    // The published version (the signature bound to it; it exists).
    const version = await lifecycle.getVersion(signature.documentVersionId);
    if (!version) {
      return { ok: false, code: "version_not_found" };
    }
    const requiresSeparateAck = categoryDefinitionFor(version.category).requiresSeparateAcknowledgment;

    const requestId = this.newId();

    // Generate the signed PDF, hash it, then generate the certificate that
    // attests that hash, then hash the certificate. The signed PDF's own hash
    // cannot live inside itself, so the certificate carries it.
    let signedPdf: Buffer;
    let certificate: Buffer;
    try {
      signedPdf = await pdf.generateSignedAgreementPdf({
        agreementTitle: version.title,
        agreementContent: version.content,
        semver: version.semver,
        documentVersionId: version.id,
        sourceContentHash: version.contentHash,
        typedLegalName,
        signatureMethod: input.evidence.method,
        drawnPngBase64: normalizePng(input.evidence.drawnPngBase64),
        signedAt: signature.signedAt,
        separateAcknowledgment: requiresSeparateAck && signature.separateAcknowledgment,
        signingRequestId: requestId,
      });
      const signedPdfSha256 = sha256Hex(signedPdf);
      certificate = await pdf.generateCompletionCertificatePdf({
        memberId: input.memberId,
        signerEmail: input.signerEmail,
        documents: [
          { title: version.title, documentVersionId: version.id, contentHash: version.contentHash },
        ],
        signingRequestId: requestId,
        signedAt: signature.signedAt,
        ipHash: signature.ipHash,
        userAgentHash: signature.userAgentHash,
        signatureMethod: input.evidence.method,
        signedPdfSha256,
      });
    } catch {
      // The legal signature is already durably recorded; only the PDF evidence
      // failed. Report it so the caller can retry; nothing partial is stored.
      return { ok: false, code: "pdf_generation_error", message: "The signed document could not be generated." };
    }

    // Store both privately and take back the refs + hashes (xenios-owned).
    const completedAt = signature.signedAt;
    let ingest;
    try {
      ingest = await ingestCompletedDocuments({
        memberId: input.memberId,
        packetOrDocumentId: version.id,
        version: version.semver,
        signedPdf: { bytes: signedPdf, contentType: "application/pdf" },
        certificate: { bytes: certificate, contentType: "application/pdf" },
        media,
        provider: XENIOS_NATIVE_PROVIDER,
        completedAt,
      });
    } catch {
      return { ok: false, code: "storage_error", message: "The signed document could not be stored." };
    }

    const nowIso = this.now().toISOString();
    const request: SigningRequestRecord = {
      id: requestId,
      memberId: input.memberId,
      packetOrDocumentId: version.id,
      mode: "esign_document",
      provider: XENIOS_NATIVE_PROVIDER,
      providerTemplateId: null,
      providerTemplateVersion: null,
      // Native has no external provider document. The record is found by id,
      // idempotency key, and member; providerDocumentId stays null (the partial
      // unique index permits many nulls).
      providerDocumentId: null,
      xeniosDocumentVersionIds: [version.id],
      sourceContentHashes: [version.contentHash],
      signerIdentifier: input.signerEmail,
      signingLinkStatus: "completed",
      viewedAt: null,
      signedAt: signature.signedAt,
      completedAt,
      declinedAt: null,
      expiredAt: null,
      signedPdfRef: ingest.signedPdfRef,
      certificateRef: ingest.certificateRef,
      signedPdfHash: ingest.signedPdfHash,
      certificateHash: ingest.certificateHash,
      verifiedEventIds: [],
      providerEventHistory: [
        { eventId: `native:${requestId}`, type: "completed", occurredAt: completedAt, recordedAt: nowIso },
      ],
      // The native completion IS recorded as the acceptance; the underlying
      // native SignatureRecord already satisfies the agreement gate directly.
      xeniosAcceptanceEventIds: [signature.id],
      idempotencyKey: input.idempotencyKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await store.requests.insert(request);
    } catch {
      // A racing duplicate lost the unique (member, idempotency_key) race: the
      // winner is authoritative. Return it as a replay.
      const winner = await store.requests.getByIdempotencyKey(input.memberId, input.idempotencyKey);
      if (winner) {
        return {
          ok: true,
          request: winner,
          replayed: true,
          signedPdfHash: winner.signedPdfHash ?? "",
          certificateHash: winner.certificateHash ?? "",
        };
      }
      return { ok: false, code: "storage_error", message: "The signing record could not be stored." };
    }

    // The archive row the document centers read. A failure here is non-fatal:
    // the signing-request row already carries the refs and hashes.
    const archiveRecord: ArchiveRecord = {
      id: this.newId(),
      memberId: input.memberId,
      packetOrDocumentId: version.id,
      documentVersionId: version.id,
      provider: XENIOS_NATIVE_PROVIDER,
      providerDocumentId: null,
      signedPdfRef: ingest.signedPdfRef,
      signedPdfHash: ingest.signedPdfHash,
      certificateRef: ingest.certificateRef,
      certificateHash: ingest.certificateHash,
      xeniosSourceHash: version.contentHash,
      signerEmail: input.signerEmail,
      completedAt,
      retentionClass: "legal_records",
      accessClassification: "member_and_admin",
      archiveStatus: "stored",
      emailDeliveryStatus: "pending",
      localExportStatus: "not_exported",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    try {
      await store.archive.insert(archiveRecord);
    } catch {
      // Non-fatal by design; the signing request is the source of truth.
    }

    return {
      ok: true,
      request,
      replayed: signResult.replayed,
      signedPdfHash: ingest.signedPdfHash,
      certificateHash: ingest.certificateHash,
    };
  }
}

/** True when a drawn-signature payload carries actual PNG bytes. */
function hasDrawnEvidence(drawnPngBase64: string | null): boolean {
  return normalizePng(drawnPngBase64).length > 0;
}

/** Strip an optional data-uri prefix and whitespace from a base64 PNG. */
function normalizePng(drawnPngBase64: string | null): string {
  if (!drawnPngBase64) return "";
  return drawnPngBase64.replace(/^data:image\/png;base64,/, "").trim();
}
