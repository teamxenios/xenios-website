import { describe, expect, it } from "vitest";
import { DocumentLifecycle, type DocumentCategory } from "../documents";
import { SignatureService } from "../signatures";
import { createInMemoryDocumentsStore } from "../persistence/documents-store";
import { InMemoryEsignMediaProvider } from "./archive";
import { createInMemoryEsignStore } from "./persistence/esign-store";
import { NativeEsignService } from "./native";
import type { CompleteNativeSignatureInput, PdfGenerator } from "./contracts";

const NOW = () => new Date("2026-07-23T12:00:00.000Z");
const MEMBER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EMAIL = "member@members.test";

// A deterministic PDF generator: real bytes, no engine. It also lets a test
// prove the signed-pdf sha-256 flows into the certificate.
const fakePdf: PdfGenerator = {
  generateSignedAgreementPdf: async (input) =>
    Buffer.from(
      `SIGNED ${input.documentVersionId} ${input.typedLegalName} ${input.signatureMethod} ack=${input.separateAcknowledgment}`,
      "utf8",
    ),
  generateCompletionCertificatePdf: async (input) =>
    Buffer.from(`CERT ${input.signingRequestId} pdf=${input.signedPdfSha256} m=${input.memberId}`, "utf8"),
};

function build() {
  const documentsStore = createInMemoryDocumentsStore();
  let v = 0;
  const lifecycle = new DocumentLifecycle(documentsStore, { now: NOW, newId: () => `v-${++v}` });
  let s = 0;
  const signatures = new SignatureService(documentsStore, { now: NOW, newId: () => `sig-${++s}` });
  const store = createInMemoryEsignStore();
  const media = new InMemoryEsignMediaProvider();
  let r = 0;
  const service = new NativeEsignService(
    { store, media, lifecycle, signatures, pdf: fakePdf },
    { now: NOW, newId: () => `req-${++r}` },
  );
  return { lifecycle, signatures, store, media, service };
}

async function publish(lifecycle: DocumentLifecycle, category: DocumentCategory, semver = "1.0.0") {
  const draft = await lifecycle.createDraft({
    category,
    semver,
    jurisdiction: "US-TX",
    content: `Full published text for ${category} ${semver}. `.repeat(4),
  });
  await lifecycle.transition(draft.id, "under_legal_review");
  await lifecycle.setCounselReview(draft.id, "approved");
  await lifecycle.transition(draft.id, "approved_for_publication");
  return lifecycle.publish(draft.id, { publisher: "counsel-test" });
}

function signInput(over: Partial<CompleteNativeSignatureInput> & { documentVersionId: string }): CompleteNativeSignatureInput {
  return {
    memberId: MEMBER,
    signerEmail: EMAIL,
    document: {
      documentVersionId: over.documentVersionId,
      fullDocumentShown: over.document?.fullDocumentShown ?? true,
      affirmativeConsent: over.document?.affirmativeConsent ?? true,
      separateAcknowledgment: over.document?.separateAcknowledgment,
    },
    evidence: over.evidence ?? { method: "typed", typedLegalName: "Member Test", drawnPngBase64: null },
    idempotencyKey: over.idempotencyKey ?? `key-${over.documentVersionId}`,
    ip: over.ip ?? "203.0.113.7",
    userAgent: over.userAgent ?? "test-agent/1.0",
  };
}

/** Native-sign the electronic-record consent first (the gate demands it). */
async function consentFirst(lifecycle: DocumentLifecycle, service: NativeEsignService, memberId = MEMBER) {
  const consent = await publish(lifecycle, "electronic_record_consent");
  const res = await service.completeNativeSignature(
    signInput({ memberId, documentVersionId: consent.id, idempotencyKey: `consent-${memberId}` }),
  );
  expect(res.ok).toBe(true);
  return consent;
}

describe("NativeEsignService.completeNativeSignature", () => {
  it("completes a TYPED signature end to end, storing the signed PDF + certificate hashes", async () => {
    const { lifecycle, service, store, media } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");

    const res = await service.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.request.mode).toBe("esign_document");
    expect(res.request.provider).toBe("xenios_native");
    expect(res.request.signingLinkStatus).toBe("completed");
    expect(res.signedPdfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.certificateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.request.signedPdfHash).toBe(res.signedPdfHash);
    expect(res.request.certificateHash).toBe(res.certificateHash);

    // Persisted: the request is retrievable and an archive row exists.
    const persisted = await store.requests.getById(res.request.id);
    expect(persisted?.signedPdfRef).toBe(res.request.signedPdfRef);
    const archive = await store.archive.listByMember(MEMBER);
    expect(archive.some((a) => a.signedPdfHash === res.signedPdfHash)).toBe(true);

    // The bytes are actually in private storage.
    const stored = await media.getObject(res.request.signedPdfRef!);
    expect(stored.ok).toBe(true);
  });

  it("completes a DRAWN signature (embedded canvas PNG)", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    // A 1x1 transparent PNG.
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await service.completeNativeSignature(
      signInput({
        documentVersionId: agreement.id,
        evidence: { method: "drawn", typedLegalName: "Member Test", drawnPngBase64: `data:image/png;base64,${png}` },
      }),
    );
    expect(res.ok).toBe(true);
  });

  it("refuses a signature when the document is not published", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const draft = await lifecycle.createDraft({
      category: "privacy_notice",
      semver: "1.0.0",
      jurisdiction: "US-TX",
      content: "Draft-only text.",
    });
    const res = await service.completeNativeSignature(signInput({ documentVersionId: draft.id }));
    expect(res).toMatchObject({ ok: false, code: "not_published" });
  });

  it("refuses when fullDocumentShown is false", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const res = await service.completeNativeSignature(
      signInput({ documentVersionId: agreement.id, document: { documentVersionId: agreement.id, fullDocumentShown: false, affirmativeConsent: true } }),
    );
    expect(res).toMatchObject({ ok: false, code: "full_document_not_shown" });
  });

  it("refuses when affirmativeConsent is false", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const res = await service.completeNativeSignature(
      signInput({ documentVersionId: agreement.id, document: { documentVersionId: agreement.id, fullDocumentShown: true, affirmativeConsent: false } }),
    );
    expect(res).toMatchObject({ ok: false, code: "consent_not_affirmative" });
  });

  it("refuses a legal name that is blank", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const res = await service.completeNativeSignature(
      signInput({ documentVersionId: agreement.id, evidence: { method: "typed", typedLegalName: " ", drawnPngBase64: null } }),
    );
    expect(res).toMatchObject({ ok: false, code: "legal_name_required" });
  });

  it("refuses a drawn method with no signature image", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const res = await service.completeNativeSignature(
      signInput({ documentVersionId: agreement.id, evidence: { method: "drawn", typedLegalName: "Member Test", drawnPngBase64: "" } }),
    );
    expect(res).toMatchObject({ ok: false, code: "signature_evidence_required" });
  });

  it("refuses ARBITRATION without its separate acknowledgment, then accepts with it", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const arbitration = await publish(lifecycle, "arbitration_agreement");
    const without = await service.completeNativeSignature(signInput({ documentVersionId: arbitration.id }));
    expect(without).toMatchObject({ ok: false, code: "separate_acknowledgment_required" });
    const withAck = await service.completeNativeSignature(
      signInput({
        documentVersionId: arbitration.id,
        document: { documentVersionId: arbitration.id, fullDocumentShown: true, affirmativeConsent: true, separateAcknowledgment: true },
        idempotencyKey: "arb-with-ack",
      }),
    );
    expect(withAck.ok).toBe(true);
  });

  it("refuses the RELEASE/waiver (covenant slot) without its separate acknowledgment", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const covenant = await publish(lifecycle, "membership_covenant");
    const without = await service.completeNativeSignature(signInput({ documentVersionId: covenant.id }));
    expect(without).toMatchObject({ ok: false, code: "separate_acknowledgment_required" });
  });

  it("is idempotent: a duplicate submission replays instead of minting a second request", async () => {
    const { lifecycle, service, store } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const first = await service.completeNativeSignature(
      signInput({ documentVersionId: agreement.id, idempotencyKey: "dup-key" }),
    );
    const second = await service.completeNativeSignature(
      signInput({ documentVersionId: agreement.id, idempotencyKey: "dup-key" }),
    );
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.replayed).toBe(true);
      expect(second.request.id).toBe(first.request.id);
    }
    // Exactly one request for this member+key.
    const all = await store.requests.listByMember(MEMBER);
    expect(all.filter((x) => x.idempotencyKey === "dup-key")).toHaveLength(1);
  });

  it("requires the electronic-record consent before any other document (native path)", async () => {
    const { lifecycle, service } = build();
    // No consent signed first.
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const res = await service.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(res).toMatchObject({ ok: false, code: "electronic_consent_required" });
  });

  it("keeps each member's documents isolated (no cross-member request)", async () => {
    const { lifecycle, service, store } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    await service.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    const otherDocs = await store.requests.listByMember(OTHER);
    expect(otherDocs).toHaveLength(0);
    const otherArchive = await store.archive.listByMember(OTHER);
    expect(otherArchive).toHaveLength(0);
  });
});
