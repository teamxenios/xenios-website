import { describe, expect, it } from "vitest";
import { createInMemoryDocumentsStore } from "../persistence/documents-store";
import { createInMemoryEsignStore } from "./persistence/esign-store";
import { createInMemoryNativeCommit } from "./native-commit";
import type { ArchiveRecord, NativeCommitInput, SigningRequestRecord } from "./contracts";
import type { SignatureRecord } from "../signatures";

// ---------------------------------------------------------------------------
// The atomic-commit unit tests: the in-memory NativeCommitFn is the exact
// semantics the production Supabase RPC mirrors. Every verification branch is
// exercised directly, plus the happy commit, idempotent replay, and serialized
// concurrency (exactly one signature + one archive).
// ---------------------------------------------------------------------------

const MEMBER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const VERSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMAIL = "member@members.test";
const KEY = "idem-key-1";
const REQ_ID = "native_req_1";
const NOW = "2026-07-23T12:00:00.000Z";

function evidenceRequest(over: Partial<SigningRequestRecord> = {}): SigningRequestRecord {
  return {
    id: REQ_ID,
    memberId: MEMBER,
    packetOrDocumentId: VERSION,
    mode: "esign_document",
    provider: "xenios_native",
    providerTemplateId: null,
    providerTemplateVersion: null,
    providerDocumentId: null,
    xeniosDocumentVersionIds: [VERSION],
    sourceContentHashes: ["a".repeat(64)],
    signerIdentifier: EMAIL,
    signingLinkStatus: "created",
    nativeCompletionState: "evidence_stored",
    viewedAt: null,
    signedAt: null,
    completedAt: null,
    declinedAt: null,
    expiredAt: null,
    signedPdfRef: "esign/x/signed.pdf",
    certificateRef: "esign/x/cert.pdf",
    signedPdfHash: "b".repeat(64),
    certificateHash: "c".repeat(64),
    verifiedEventIds: [],
    providerEventHistory: [],
    xeniosAcceptanceEventIds: [],
    idempotencyKey: KEY,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function signature(over: Partial<SignatureRecord> = {}): SignatureRecord {
  return {
    id: "sig_1",
    memberId: MEMBER,
    documentVersionId: VERSION,
    category: "founding_membership_agreement",
    semver: "1.0.0",
    contentHash: "d".repeat(64),
    typedLegalName: "Member Test",
    fullDocumentShown: true,
    affirmativeConsent: true,
    separateAcknowledgment: false,
    electronicConsentVersionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ipHash: null,
    userAgentHash: null,
    signedAt: NOW,
    ...over,
  };
}

function completedFrom(req: SigningRequestRecord, sig: SignatureRecord): SigningRequestRecord {
  return {
    ...req,
    signingLinkStatus: "completed",
    nativeCompletionState: "completed",
    signedAt: sig.signedAt,
    completedAt: sig.signedAt,
    xeniosAcceptanceEventIds: [sig.id],
  };
}

function archiveFrom(req: SigningRequestRecord, id = "arc_1"): ArchiveRecord {
  return {
    id,
    memberId: req.memberId,
    packetOrDocumentId: req.packetOrDocumentId,
    documentVersionId: req.xeniosDocumentVersionIds[0] ?? null,
    provider: req.provider,
    providerDocumentId: null,
    signedPdfRef: req.signedPdfRef,
    signedPdfHash: req.signedPdfHash,
    certificateRef: req.certificateRef,
    certificateHash: req.certificateHash,
    xeniosSourceHash: req.sourceContentHashes[0] ?? null,
    signerEmail: req.signerIdentifier,
    completedAt: req.signedAt,
    retentionClass: "legal_records",
    accessClassification: "member_and_admin",
    archiveStatus: "stored",
    emailDeliveryStatus: "pending",
    localExportStatus: "not_exported",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function fixture(reqOver: Partial<SigningRequestRecord> = {}) {
  const docs = createInMemoryDocumentsStore();
  const esign = createInMemoryEsignStore();
  const req = evidenceRequest(reqOver);
  await esign.requests.insert(req);
  const commit = createInMemoryNativeCommit(docs, esign);
  const sig = signature();
  const input: NativeCommitInput = {
    signature: sig,
    memberId: MEMBER,
    documentVersionId: VERSION,
    idempotencyKey: KEY,
    completedRequest: completedFrom(req, sig),
    archive: archiveFrom(req),
  };
  return { docs, esign, commit, input, sig };
}

describe("createInMemoryNativeCommit: verification branches (nothing is written)", () => {
  it("request_missing when no request row exists", async () => {
    const docs = createInMemoryDocumentsStore();
    const esign = createInMemoryEsignStore();
    const commit = createInMemoryNativeCommit(docs, esign);
    const sig = signature();
    const res = await commit({
      signature: sig,
      memberId: MEMBER,
      documentVersionId: VERSION,
      idempotencyKey: KEY,
      completedRequest: completedFrom(evidenceRequest(), sig),
      archive: archiveFrom(evidenceRequest()),
    });
    expect(res).toEqual({ ok: false, code: "request_missing" });
    expect(await docs.getSignature(MEMBER, VERSION)).toBeNull();
  });

  it("member_mismatch when the acting member is not the request owner", async () => {
    const { commit, input, docs } = await fixture();
    const res = await commit({ ...input, memberId: OTHER });
    expect(res).toEqual({ ok: false, code: "member_mismatch" });
    expect(await docs.getSignature(MEMBER, VERSION)).toBeNull();
  });

  it("version_mismatch when the document version does not match the request", async () => {
    const { commit, input, docs } = await fixture();
    const res = await commit({ ...input, documentVersionId: "wrong-version" });
    expect(res).toEqual({ ok: false, code: "version_mismatch" });
    expect(await docs.getSignature(MEMBER, VERSION)).toBeNull();
  });

  it("request_not_evidence_stored when the request is still preparing", async () => {
    const { commit, input, docs } = await fixture({ nativeCompletionState: "preparing" });
    const res = await commit(input);
    expect(res).toEqual({ ok: false, code: "request_not_evidence_stored" });
    expect(await docs.getSignature(MEMBER, VERSION)).toBeNull();
  });

  it("evidence_incomplete when a signed-PDF ref or hash is missing", async () => {
    const { commit, input, docs } = await fixture({ signedPdfRef: null });
    const res = await commit(input);
    expect(res).toEqual({ ok: false, code: "evidence_incomplete" });
    expect(await docs.getSignature(MEMBER, VERSION)).toBeNull();
  });
});

describe("createInMemoryNativeCommit: the atomic effects", () => {
  it("commits the signature, the completion transition, and the archive together", async () => {
    const { commit, input, docs, esign } = await fixture();
    const res = await commit(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.replayed).toBe(false);
    // (2) signature inserted
    expect(await docs.getSignature(MEMBER, VERSION)).not.toBeNull();
    // (3) request completed, bound to the signature id
    const req = await esign.requests.getById(REQ_ID);
    expect(req?.nativeCompletionState).toBe("completed");
    expect(req?.signingLinkStatus).toBe("completed");
    expect(req?.xeniosAcceptanceEventIds).toEqual([input.signature.id]);
    // (4) exactly one archive row
    const archive = await esign.archive.listByMember(MEMBER);
    expect(archive).toHaveLength(1);
    expect(archive[0].documentVersionId).toBe(VERSION);
  });

  it("replays idempotently: a second commit adds no second signature or archive", async () => {
    const { commit, input, docs, esign } = await fixture();
    const first = await commit(input);
    expect(first.ok).toBe(true);
    // A second identical commit sees the request already completed and replays.
    const second = await commit(input);
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect((await docs.listSignaturesForMember(MEMBER)).filter((s) => s.documentVersionId === VERSION)).toHaveLength(1);
    expect(await esign.archive.listByMember(MEMBER)).toHaveLength(1);
  });

  it("serializes concurrent commits to exactly one signature and one archive", async () => {
    const { commit, input, docs, esign } = await fixture();
    // Two racers with distinct signature ids (as two prepare() calls would mint).
    const inputA = input;
    const inputB: NativeCommitInput = {
      ...input,
      signature: { ...input.signature, id: "sig_2" },
      completedRequest: { ...input.completedRequest, xeniosAcceptanceEventIds: ["sig_2"] },
      archive: archiveFrom(evidenceRequest(), "arc_2"),
    };
    const [a, b] = await Promise.all([commit(inputA), commit(inputB)]);
    expect(a.ok && b.ok).toBe(true);
    // Exactly one signature, one completed request, one archive.
    expect((await docs.listSignaturesForMember(MEMBER)).filter((s) => s.documentVersionId === VERSION)).toHaveLength(1);
    const req = await esign.requests.getById(REQ_ID);
    expect(req?.nativeCompletionState).toBe("completed");
    expect(await esign.archive.listByMember(MEMBER)).toHaveLength(1);
    // Exactly one of the two racers is the fresh insert; the other replays.
    expect([a.ok && a.replayed, b.ok && b.replayed].filter(Boolean)).toHaveLength(1);
  });
});
