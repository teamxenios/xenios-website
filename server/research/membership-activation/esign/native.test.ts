import { describe, expect, it } from "vitest";
import { DocumentLifecycle, type DocumentCategory } from "../documents";
import { SignatureService } from "../signatures";
import { createInMemoryDocumentsStore, type DocumentsStore } from "../persistence/documents-store";
import { InMemoryEsignMediaProvider } from "./archive";
import { createInMemoryEsignStore } from "./persistence/esign-store";
import { NativeEsignService, validateDrawnPng } from "./native";
import { createInMemoryNativeCommit } from "./native-commit";
import type {
  CompleteNativeSignatureInput,
  EsignMediaPort,
  EsignStore,
  NativeCommitFn,
  PdfGenerator,
} from "./contracts";
import type { SignaturesStore } from "../signatures";

const NOW = () => new Date("2026-07-23T12:00:00.000Z");
const MEMBER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EMAIL = "member@members.test";

// A 1x1 transparent PNG (valid), with a real IHDR.
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const fakePdf: PdfGenerator = {
  generateSignedAgreementPdf: async (input) =>
    Buffer.from(`SIGNED ${input.documentVersionId} ${input.typedLegalName} ${input.signatureMethod}`, "utf8"),
  generateCompletionCertificatePdf: async (input) =>
    Buffer.from(`CERT ${input.signingRequestId} ${input.signedPdfSha256}`, "utf8"),
};

interface BuildOpts {
  pdf?: PdfGenerator;
  media?: EsignMediaPort;
  store?: EsignStore;
  /** Override the atomic-commit seam (e.g. a failing commit for the RPC-failure tests). */
  commit?: (signatures: SignaturesStore, esign: EsignStore) => NativeCommitFn;
}

function build(opts: BuildOpts = {}) {
  const documentsStore: DocumentsStore = createInMemoryDocumentsStore();
  let v = 0;
  const lifecycle = new DocumentLifecycle(documentsStore, { now: NOW, newId: () => `v-${++v}` });
  let s = 0;
  const signatures = new SignatureService(documentsStore, { now: NOW, newId: () => `sig-${++s}` });
  const store = opts.store ?? createInMemoryEsignStore();
  const media = opts.media ?? new InMemoryEsignMediaProvider();
  const commit = (opts.commit ?? createInMemoryNativeCommit)(documentsStore, store);
  let r = 0;
  const service = new NativeEsignService(
    { store, media, lifecycle, signatures, pdf: opts.pdf ?? fakePdf, commit },
    { now: NOW, newId: () => `arc-${++r}` },
  );
  return { documentsStore, lifecycle, signatures, store, media, service };
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

function signInput(
  over: Partial<CompleteNativeSignatureInput> & { documentVersionId: string },
): CompleteNativeSignatureInput {
  return {
    memberId: over.memberId ?? MEMBER,
    signerEmail: over.signerEmail ?? EMAIL,
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

async function consentFirst(
  lifecycle: DocumentLifecycle,
  service: NativeEsignService,
  memberId = MEMBER,
) {
  const consent = await publish(lifecycle, "electronic_record_consent");
  const res = await service.completeNativeSignature(
    signInput({ memberId, documentVersionId: consent.id, idempotencyKey: `consent-${memberId}` }),
  );
  expect(res.ok).toBe(true);
  return consent;
}

// A store whose requests.insert/update always throw (simulates a DB failure).
function failingRequestStore(): EsignStore {
  const base = createInMemoryEsignStore();
  return {
    ...base,
    requests: {
      ...base.requests,
      insert: async () => {
        throw new Error("db down");
      },
      update: async () => {
        throw new Error("db down");
      },
    },
  };
}

describe("NativeEsignService: happy paths", () => {
  it("completes a typed signature and persists both hashes + the request record", async () => {
    const { lifecycle, service, store, documentsStore } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const res = await service.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.request.mode).toBe("esign_document");
    expect(res.request.provider).toBe("xenios_native");
    expect(res.signedPdfHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.certificateHash).toMatch(/^[0-9a-f]{64}$/);
    // The legal signature exists (the agreement is signed).
    expect(await documentsStore.getSignature(MEMBER, agreement.id)).not.toBeNull();
    // The archive projection landed.
    expect((await store.archive.listByMember(MEMBER)).length).toBeGreaterThan(0);
  });

  it("completes a drawn signature", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const res = await service.completeNativeSignature(
      signInput({
        documentVersionId: agreement.id,
        evidence: { method: "drawn", typedLegalName: "Member Test", drawnPngBase64: `data:image/png;base64,${PNG_1x1}` },
      }),
    );
    expect(res.ok).toBe(true);
  });
});

describe("NativeEsignService: legal guards are reused, never weakened", () => {
  it("refuses an unpublished document, unshown document, non-affirmative consent, and blank name", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const draft = await lifecycle.createDraft({ category: "privacy_notice", semver: "9.0.0", jurisdiction: "US-TX", content: "d" });
    expect(await service.completeNativeSignature(signInput({ documentVersionId: draft.id }))).toMatchObject({ ok: false, code: "not_published" });
    expect(
      await service.completeNativeSignature(signInput({ documentVersionId: agreement.id, document: { documentVersionId: agreement.id, fullDocumentShown: false, affirmativeConsent: true } })),
    ).toMatchObject({ ok: false, code: "full_document_not_shown" });
    expect(
      await service.completeNativeSignature(signInput({ documentVersionId: agreement.id, document: { documentVersionId: agreement.id, fullDocumentShown: true, affirmativeConsent: false } })),
    ).toMatchObject({ ok: false, code: "consent_not_affirmative" });
    expect(
      await service.completeNativeSignature(signInput({ documentVersionId: agreement.id, evidence: { method: "typed", typedLegalName: " ", drawnPngBase64: null } })),
    ).toMatchObject({ ok: false, code: "legal_name_required" });
  });

  it("refuses arbitration and the release/waiver without their separate acknowledgment", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const arbitration = await publish(lifecycle, "arbitration_agreement");
    expect(await service.completeNativeSignature(signInput({ documentVersionId: arbitration.id }))).toMatchObject({
      ok: false,
      code: "separate_acknowledgment_required",
    });
    const covenant = await publish(lifecycle, "membership_covenant");
    expect(await service.completeNativeSignature(signInput({ documentVersionId: covenant.id }))).toMatchObject({
      ok: false,
      code: "separate_acknowledgment_required",
    });
  });

  it("requires the electronic-record consent before any other document", async () => {
    const { lifecycle, service } = build();
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    expect(await service.completeNativeSignature(signInput({ documentVersionId: agreement.id }))).toMatchObject({
      ok: false,
      code: "electronic_consent_required",
    });
  });
});

describe("NativeEsignService: ATOMIC COMPLETION (a partial failure leaves the agreement unsigned)", () => {
  async function setup(opts: BuildOpts) {
    const ctx = build(opts);
    // Consent uses the same (possibly failing) deps; publish it directly and
    // sign it only when the deps are healthy.
    const consent = await publish(ctx.lifecycle, "electronic_record_consent");
    if (!opts.pdf && !opts.media && !opts.store) {
      await ctx.service.completeNativeSignature(signInput({ documentVersionId: consent.id, idempotencyKey: "c" }));
    }
    const agreement = await publish(ctx.lifecycle, "founding_membership_agreement");
    return { ...ctx, agreement };
  }

  it("PDF generation failure leaves the agreement unsigned", async () => {
    const pdf: PdfGenerator = { ...fakePdf, generateSignedAgreementPdf: async () => { throw new Error("boom"); } };
    // Consent signs on a healthy service; then the failing pdf is swapped in.
    const healthy = build();
    await consentFirst(healthy.lifecycle, healthy.service);
    const agreement = await publish(healthy.lifecycle, "founding_membership_agreement");
    const failing = new NativeEsignService(
      {
        store: healthy.store,
        media: healthy.media,
        lifecycle: healthy.lifecycle,
        signatures: healthy.signatures,
        pdf,
        commit: createInMemoryNativeCommit(healthy.documentsStore, healthy.store),
      },
      { now: NOW },
    );
    const res = await failing.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(res).toMatchObject({ ok: false, code: "pdf_generation_error" });
    // Unsigned: no signature, no request.
    expect(await healthy.documentsStore.getSignature(MEMBER, agreement.id)).toBeNull();
    expect(await healthy.store.requests.getByIdempotencyKey(MEMBER, `key-${agreement.id}`)).toBeNull();
  });

  it("signed-PDF / certificate storage failure leaves the agreement unsigned", async () => {
    const failingMedia: EsignMediaPort = {
      putObject: async () => ({ ok: false, code: "PROVIDER_ERROR", message: "storage down" }),
      createAccessUrl: async () => ({ ok: false, code: "PROVIDER_ERROR" }),
      getObject: async () => ({ ok: false, code: "PROVIDER_ERROR" }),
    };
    const healthy = build();
    await consentFirst(healthy.lifecycle, healthy.service);
    const agreement = await publish(healthy.lifecycle, "founding_membership_agreement");
    const failing = new NativeEsignService(
      {
        store: healthy.store,
        media: failingMedia,
        lifecycle: healthy.lifecycle,
        signatures: healthy.signatures,
        pdf: fakePdf,
        commit: createInMemoryNativeCommit(healthy.documentsStore, healthy.store),
      },
      { now: NOW },
    );
    const res = await failing.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(res).toMatchObject({ ok: false, code: "storage_error" });
    expect(await healthy.documentsStore.getSignature(MEMBER, agreement.id)).toBeNull();
  });

  it("certificate storage failure (second upload) leaves the agreement unsigned", async () => {
    // Signed-PDF upload succeeds; the certificate upload (second putObject) fails.
    const inner = new InMemoryEsignMediaProvider();
    let puts = 0;
    const media: EsignMediaPort = {
      putObject: async (i) => {
        puts += 1;
        if (puts === 2) return { ok: false, code: "PROVIDER_ERROR", message: "cert store down" };
        return inner.putObject(i);
      },
      createAccessUrl: (i) => inner.createAccessUrl(i),
      getObject: (p) => inner.getObject(p),
    };
    const healthy = build();
    await consentFirst(healthy.lifecycle, healthy.service);
    const agreement = await publish(healthy.lifecycle, "founding_membership_agreement");
    const failing = new NativeEsignService(
      {
        store: healthy.store,
        media,
        lifecycle: healthy.lifecycle,
        signatures: healthy.signatures,
        pdf: fakePdf,
        commit: createInMemoryNativeCommit(healthy.documentsStore, healthy.store),
      },
      { now: NOW },
    );
    const res = await failing.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(res).toMatchObject({ ok: false, code: "storage_error" });
    expect(await healthy.documentsStore.getSignature(MEMBER, agreement.id)).toBeNull();
  });

  it("certificate GENERATION failure leaves the agreement unsigned", async () => {
    const pdf: PdfGenerator = { ...fakePdf, generateCompletionCertificatePdf: async () => { throw new Error("cert boom"); } };
    const healthy = build();
    await consentFirst(healthy.lifecycle, healthy.service);
    const agreement = await publish(healthy.lifecycle, "founding_membership_agreement");
    const failing = new NativeEsignService(
      {
        store: healthy.store,
        media: healthy.media,
        lifecycle: healthy.lifecycle,
        signatures: healthy.signatures,
        pdf,
        commit: createInMemoryNativeCommit(healthy.documentsStore, healthy.store),
      },
      { now: NOW },
    );
    const res = await failing.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(res).toMatchObject({ ok: false, code: "certificate_generation_error" });
    expect(await healthy.documentsStore.getSignature(MEMBER, agreement.id)).toBeNull();
  });

  it("database request-record failure leaves the agreement unsigned", async () => {
    const healthy = build();
    await consentFirst(healthy.lifecycle, healthy.service);
    const agreement = await publish(healthy.lifecycle, "founding_membership_agreement");
    const brokenStore = failingRequestStore();
    const failing = new NativeEsignService(
      {
        store: brokenStore,
        media: healthy.media,
        lifecycle: healthy.lifecycle,
        signatures: healthy.signatures,
        pdf: fakePdf,
        commit: createInMemoryNativeCommit(healthy.documentsStore, brokenStore),
      },
      { now: NOW },
    );
    const res = await failing.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(res).toMatchObject({ ok: false, code: "storage_error" });
    // The signature store is the healthy one; still nothing was signed.
    expect(await healthy.documentsStore.getSignature(MEMBER, agreement.id)).toBeNull();
  });

  it("FINAL SignatureRecord insert failure: unsigned, evidence not completed, cleanup-required, retry converges", async () => {
    // Everything before the signature succeeds; the final insertSignature throws.
    const documentsStore = createInMemoryDocumentsStore();
    const lifecycle = new DocumentLifecycle(documentsStore, { now: NOW });
    const store = createInMemoryEsignStore();
    const media = new InMemoryEsignMediaProvider();
    const consent = await publish(lifecycle, "electronic_record_consent");
    const agreement = await publish(lifecycle, "founding_membership_agreement");

    // Sign the consent on a HEALTHY service so the agreement clears the
    // electronic-consent-first guard.
    const healthy = new NativeEsignService(
      {
        store,
        media,
        lifecycle,
        signatures: new SignatureService(documentsStore, { now: NOW }),
        pdf: fakePdf,
        commit: createInMemoryNativeCommit(documentsStore, store),
      },
      { now: NOW },
    );
    await healthy.completeNativeSignature(signInput({ documentVersionId: consent.id, idempotencyKey: "c" }));

    // The failing service shares the same stores, but the ATOMIC COMMIT's
    // signature insert throws (the final legal transaction fails). No signature
    // may persist; the evidence is marked for cleanup.
    const failingDocsStore = {
      ...documentsStore,
      insertSignature: async () => {
        throw new Error("signature commit down");
      },
    };
    const failing = new NativeEsignService(
      {
        store,
        media,
        lifecycle,
        signatures: new SignatureService(documentsStore, { now: NOW }),
        pdf: fakePdf,
        commit: createInMemoryNativeCommit(failingDocsStore, store),
      },
      { now: NOW },
    );
    const res = await failing.completeNativeSignature(signInput({ documentVersionId: agreement.id, idempotencyKey: "k" }));
    expect(res).toMatchObject({ ok: false, code: "storage_error" });

    // The agreement is UNSIGNED: no legal signature, so the gate (which reads
    // signatures) does not advance. Evidence WAS uploaded, but uploaded evidence
    // alone never counts.
    expect(await documentsStore.getSignature(MEMBER, agreement.id)).toBeNull();
    const req = await store.requests.getByIdempotencyKey(MEMBER, "k");
    expect(req).not.toBeNull();
    expect(req?.signedPdfRef).toBeTruthy(); // evidence uploaded
    expect(req?.nativeCompletionState).toBe("failed_cleanup_required"); // marked for cleanup
    expect(req?.signingLinkStatus).not.toBe("completed"); // never presented as completed

    // Retry on a healthy service converges to exactly one completed signature +
    // one completed request.
    const retry = await healthy.completeNativeSignature(signInput({ documentVersionId: agreement.id, idempotencyKey: "k" }));
    expect(retry.ok).toBe(true);
    expect(await documentsStore.getSignature(MEMBER, agreement.id)).not.toBeNull();
    const done = await store.requests.getByIdempotencyKey(MEMBER, "k");
    expect(done?.nativeCompletionState).toBe("completed");
    expect(done?.signingLinkStatus).toBe("completed");
    const forVersion = (await store.requests.listByMember(MEMBER)).filter((r) => r.xeniosDocumentVersionIds[0] === agreement.id);
    expect(forVersion).toHaveLength(1);
    const sigs = (await documentsStore.listSignaturesForMember(MEMBER)).filter((s) => s.documentVersionId === agreement.id);
    expect(sigs).toHaveLength(1);
  });

  it("a completed native request presents; an evidence_stored one does not (gate checks completed, not uploaded)", async () => {
    // A successful completion is presentable-completed.
    const { lifecycle, service, store } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const ok = await service.completeNativeSignature(signInput({ documentVersionId: agreement.id }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.request.nativeCompletionState).toBe("completed");
    const stored = await store.requests.getByIdempotencyKey(MEMBER, `key-${agreement.id}`);
    expect(stored?.nativeCompletionState).toBe("completed");
    expect(stored?.signingLinkStatus).toBe("completed");
  });

  it("a retry after a transient PDF failure succeeds exactly once", async () => {
    let calls = 0;
    const pdf: PdfGenerator = {
      ...fakePdf,
      generateSignedAgreementPdf: async (input) => {
        calls += 1;
        if (calls === 1) throw new Error("transient");
        return fakePdf.generateSignedAgreementPdf(input);
      },
    };
    const healthy = build();
    await consentFirst(healthy.lifecycle, healthy.service);
    const agreement = await publish(healthy.lifecycle, "founding_membership_agreement");
    const svc = new NativeEsignService(
      {
        store: healthy.store,
        media: healthy.media,
        lifecycle: healthy.lifecycle,
        signatures: healthy.signatures,
        pdf,
        commit: createInMemoryNativeCommit(healthy.documentsStore, healthy.store),
      },
      { now: NOW },
    );
    const first = await svc.completeNativeSignature(signInput({ documentVersionId: agreement.id, idempotencyKey: "retry" }));
    expect(first.ok).toBe(false);
    expect(await healthy.documentsStore.getSignature(MEMBER, agreement.id)).toBeNull();
    const second = await svc.completeNativeSignature(signInput({ documentVersionId: agreement.id, idempotencyKey: "retry" }));
    expect(second.ok).toBe(true);
    // Exactly one signature, one request.
    expect(await healthy.documentsStore.getSignature(MEMBER, agreement.id)).not.toBeNull();
    const reqs = (await healthy.store.requests.listByMember(MEMBER)).filter((r) => r.xeniosDocumentVersionIds[0] === agreement.id);
    expect(reqs).toHaveLength(1);
  });

  it("concurrent retries do not create multiple signatures or orphan records", async () => {
    const { lifecycle, service, store, documentsStore } = build();
    await consentFirst(lifecycle, service);
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    const body = signInput({ documentVersionId: agreement.id, idempotencyKey: "concurrent" });
    const [a, b] = await Promise.all([
      service.completeNativeSignature(body),
      service.completeNativeSignature(body),
    ]);
    expect(a.ok && b.ok).toBe(true);
    // Exactly one signature and one request for this member+version.
    expect(await documentsStore.getSignature(MEMBER, agreement.id)).not.toBeNull();
    const reqs = (await store.requests.listByMember(MEMBER)).filter((r) => r.xeniosDocumentVersionIds[0] === agreement.id);
    expect(reqs).toHaveLength(1);
    const sigCount = (await documentsStore.listSignaturesForMember(MEMBER)).filter((s) => s.documentVersionId === agreement.id);
    expect(sigCount).toHaveLength(1);
  });
});

describe("NativeEsignService: ATOMIC COMMIT (the final legal transaction)", () => {
  // A commit that always fails WITHOUT writing (simulates an RPC / transaction
  // failure). The signature must never persist.
  const failingCommit: (s: SignaturesStore, e: EsignStore) => NativeCommitFn = () => async () => ({
    ok: false,
    code: "commit_error",
  });

  it("#1 a transaction failure inserts NO signature", async () => {
    // Consent must be signed first, so use a healthy service for consent, then a
    // failing-commit service for the agreement over the SAME stores.
    const healthy = build();
    await consentFirst(healthy.lifecycle, healthy.service);
    const agreement = await publish(healthy.lifecycle, "founding_membership_agreement");
    const failing = new NativeEsignService(
      {
        store: healthy.store,
        media: healthy.media,
        lifecycle: healthy.lifecycle,
        signatures: healthy.signatures,
        pdf: fakePdf,
        commit: failingCommit(healthy.documentsStore, healthy.store),
      },
      { now: NOW },
    );
    const res = await failing.completeNativeSignature(signInput({ documentVersionId: agreement.id, idempotencyKey: "fail" }));
    expect(res.ok).toBe(false);
    expect(await healthy.documentsStore.getSignature(MEMBER, agreement.id)).toBeNull();
  });

  it("#2 a transaction failure leaves the request NOT completed (marked for cleanup), evidence uploaded", async () => {
    const healthy = build();
    await consentFirst(healthy.lifecycle, healthy.service);
    const agreement = await publish(healthy.lifecycle, "founding_membership_agreement");
    const failing = new NativeEsignService(
      {
        store: healthy.store,
        media: healthy.media,
        lifecycle: healthy.lifecycle,
        signatures: healthy.signatures,
        pdf: fakePdf,
        commit: failingCommit(healthy.documentsStore, healthy.store),
      },
      { now: NOW },
    );
    await failing.completeNativeSignature(signInput({ documentVersionId: agreement.id, idempotencyKey: "fail2" }));
    const req = await healthy.store.requests.getByIdempotencyKey(MEMBER, "fail2");
    expect(req).not.toBeNull();
    expect(req?.nativeCompletionState).toBe("failed_cleanup_required");
    expect(req?.signingLinkStatus).not.toBe("completed");
    expect(req?.signedPdfRef).toBeTruthy(); // evidence WAS uploaded, but never counts
    // No archive projection presents THIS agreement as a completed record.
    const archived = (await healthy.store.archive.listByMember(MEMBER)).filter(
      (a) => a.documentVersionId === agreement.id,
    );
    expect(archived).toHaveLength(0);
  });

  it("#9 a native signature exists IFF its native request is completed (both a success and a failure)", async () => {
    const { lifecycle, service, store, documentsStore, signatures } = build();
    await consentFirst(lifecycle, service);

    // Success: the signature exists AND the native request is completed.
    const good = await publish(lifecycle, "founding_membership_agreement");
    const okRes = await service.completeNativeSignature(signInput({ documentVersionId: good.id, idempotencyKey: "good" }));
    expect(okRes.ok).toBe(true);
    const goodSig = await documentsStore.getSignature(MEMBER, good.id);
    const goodReq = await store.requests.getByIdempotencyKey(MEMBER, "good");
    expect(goodSig).not.toBeNull();
    expect(goodReq?.nativeCompletionState).toBe("completed");

    // Failure over a separate service+version: NO signature, request not completed.
    const bad = await publish(lifecycle, "privacy_notice");
    const failing = new NativeEsignService(
      {
        store,
        media: new InMemoryEsignMediaProvider(),
        lifecycle,
        signatures,
        pdf: fakePdf,
        commit: failingCommit(documentsStore, store),
      },
      { now: NOW },
    );
    await failing.completeNativeSignature(signInput({ documentVersionId: bad.id, idempotencyKey: "bad" }));
    expect(await documentsStore.getSignature(MEMBER, bad.id)).toBeNull();
    const badReq = await store.requests.getByIdempotencyKey(MEMBER, "bad");
    expect(badReq?.nativeCompletionState).not.toBe("completed");

    // The invariant: EVERY native request holding a completed state has a
    // matching signature, and no signature exists for a non-completed request.
    for (const r of await store.requests.listByMember(MEMBER)) {
      const versionId = r.xeniosDocumentVersionIds[0];
      const sig = await documentsStore.getSignature(MEMBER, versionId);
      if (sig) expect(r.nativeCompletionState).toBe("completed");
      if (r.nativeCompletionState !== "completed") expect(sig).toBeNull();
    }
  });

  it("#10 existing clickwrap (AgreementSignCard) signatures still satisfy the gate; the native-evidence rule does not break them", async () => {
    const { lifecycle, signatures } = build();
    const consent = await publish(lifecycle, "electronic_record_consent");
    const agreement = await publish(lifecycle, "founding_membership_agreement");
    // Sign both through the clickwrap SignatureService.sign() path (no native
    // request, no PDF): this is what AgreementSignCard uses.
    const c = await signatures.sign({
      memberId: MEMBER,
      documentVersionId: consent.id,
      typedLegalName: "Member Test",
      fullDocumentShown: true,
      affirmativeConsent: true,
    });
    const a = await signatures.sign({
      memberId: MEMBER,
      documentVersionId: agreement.id,
      typedLegalName: "Member Test",
      fullDocumentShown: true,
      affirmativeConsent: true,
    });
    expect(c.ok && a.ok).toBe(true);
    const gate = await signatures.requiredAgreementsSatisfied(MEMBER);
    // These two clickwrap-signed categories are NOT blocking (the gate still
    // blocks on the OTHER unpublished required categories, which is expected).
    const blockingCategories = gate.blocking.map((b) => b.category);
    expect(blockingCategories).not.toContain("electronic_record_consent");
    expect(blockingCategories).not.toContain("founding_membership_agreement");
  });
});

describe("NativeEsignService: idempotency intent binding", () => {
  it("reusing one idempotency key for a DIFFERENT document is a conflict, not a replay", async () => {
    const { lifecycle, service } = build();
    await consentFirst(lifecycle, service);
    const a = await publish(lifecycle, "founding_membership_agreement");
    const b = await publish(lifecycle, "privacy_notice");
    const first = await service.completeNativeSignature(signInput({ documentVersionId: a.id, idempotencyKey: "shared" }));
    expect(first.ok).toBe(true);
    // Same key, different document: conflict.
    const clash = await service.completeNativeSignature(signInput({ documentVersionId: b.id, idempotencyKey: "shared" }));
    expect(clash).toMatchObject({ ok: false, code: "idempotency_conflict" });
    // The same key + same document replays cleanly.
    const replay = await service.completeNativeSignature(signInput({ documentVersionId: a.id, idempotencyKey: "shared" }));
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.replayed).toBe(true);
  });
});

describe("validateDrawnPng", () => {
  it("accepts a real PNG", () => {
    expect(validateDrawnPng(`data:image/png;base64,${PNG_1x1}`).ok).toBe(true);
    expect(validateDrawnPng(PNG_1x1).ok).toBe(true);
  });
  it("refuses empty, malformed base64, and non-PNG bytes", () => {
    expect(validateDrawnPng("")).toMatchObject({ ok: false, code: "signature_evidence_required" });
    expect(validateDrawnPng("not!!!base64###")).toMatchObject({ ok: false, code: "signature_invalid" });
    // valid base64 of a non-PNG (JPEG magic + padding to >= 24 bytes)
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]).toString("base64");
    expect(validateDrawnPng(jpeg)).toMatchObject({ ok: false, code: "signature_invalid" });
  });
  it("refuses an oversized payload", () => {
    const huge = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2 * 1024 * 1024)]).toString("base64");
    expect(validateDrawnPng(huge)).toMatchObject({ ok: false, code: "signature_too_large" });
  });
  it("refuses out-of-range dimensions", () => {
    // A PNG header claiming 9000x9000.
    const buf = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    buf.writeUInt32BE(9000, 16);
    buf.writeUInt32BE(9000, 20);
    expect(validateDrawnPng(buf.toString("base64"))).toMatchObject({ ok: false, code: "signature_dimensions" });
  });
});
