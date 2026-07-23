import { describe, expect, it } from "vitest";
import { EsignService, TemplateSourceDrift, type IngestCompletedFn } from "./signing";
import type { EsignMediaPort, EsignProvider, EsignTemplateSpec } from "./contracts";
import {
  DocumentLifecycle,
  sha256Hex,
  type DocumentVersionRecord,
} from "../documents";
import { SignatureService } from "../signatures";
import { createInMemoryDocumentsStore, type DocumentsStore } from "../persistence/documents-store";
import { createInMemoryEsignStore } from "./persistence/esign-store";

const NOW = "2026-07-22T12:00:00.000Z";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function baseVersion(id: string, content: string): DocumentVersionRecord {
  return {
    id,
    category: "founding_membership_agreement",
    title: "Founding Membership Agreement",
    semver: "1.0.0",
    status: "published",
    effectiveDate: "2026-07-22",
    publishedAt: NOW,
    jurisdiction: "US",
    content,
    contentHash: sha256Hex(content),
    downloadRef: null,
    requirement: "required",
    activationStep: "activation_agreements",
    reacceptanceRequired: false,
    requiresSeparateAcknowledgment: false,
    supersededVersionId: null,
    publisher: "counsel-ops",
    counselReview: "approved",
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function publishVersion(store: DocumentsStore, id: string, content: string): Promise<DocumentVersionRecord> {
  const rec = baseVersion(id, content);
  await store.insertVersion(rec);
  return rec;
}

async function draftVersion(store: DocumentsStore, id: string, content: string): Promise<DocumentVersionRecord> {
  const rec: DocumentVersionRecord = {
    ...baseVersion(id, content),
    status: "draft",
    publishedAt: null,
    effectiveDate: null,
    publisher: null,
    counselReview: "not_reviewed",
  };
  await store.insertVersion(rec);
  return rec;
}

function fakeProvider() {
  const counts = { provisionTemplate: 0, createSigningSession: 0, fetchCompletedFile: 0 };
  let docCounter = 0;
  const provider: EsignProvider = {
    name: "opensign",
    isLive: true,
    async provisionTemplate(spec) {
      counts.provisionTemplate += 1;
      return {
        ok: true,
        value: { providerTemplateId: `ptid_${spec.templateKey}`, providerTemplateVersion: "1" },
      };
    },
    async createSigningSession() {
      counts.createSigningSession += 1;
      docCounter += 1;
      return {
        ok: true,
        value: {
          providerDocumentId: `pdoc_${docCounter}`,
          signingUrl: `https://sign.example/${docCounter}`,
          expiresAt: null,
        },
      };
    },
    async fetchCompletedFile(input) {
      counts.fetchCompletedFile += 1;
      return { ok: true, value: { bytes: Buffer.from(`bytes:${input.fileUrl}`), contentType: "application/pdf" } };
    },
    verifyWebhook() {
      return { ok: false, code: "malformed" };
    },
  };
  return { provider, counts };
}

function fakeMedia() {
  const puts: Array<{ storagePath: string; bytes: Buffer; contentType: string }> = [];
  const media: EsignMediaPort = {
    async putObject(input) {
      puts.push(input);
      return { ok: true, value: { storagePath: input.storagePath, bytesWritten: input.bytes.length } };
    },
    async createAccessUrl(input) {
      return { ok: true, value: { signedUrl: `https://dl.example/${input.storagePath}`, expiresAt: NOW } };
    },
    async getObject() {
      return { ok: true, value: { bytes: Buffer.from("x"), contentType: "application/pdf" } };
    },
  };
  return { media, puts };
}

function makeService(options: { ingestCompleted?: IngestCompletedFn } = {}) {
  const docStore = createInMemoryDocumentsStore();
  const esignStore = createInMemoryEsignStore();
  const lifecycle = new DocumentLifecycle(docStore, { now: () => new Date(NOW) });
  const signatures = new SignatureService(docStore, { now: () => new Date(NOW) });
  const { provider, counts } = fakeProvider();
  const { media, puts } = fakeMedia();
  let idCounter = 0;
  const service = new EsignService({
    store: esignStore,
    provider,
    media,
    lifecycle,
    signatures,
    now: () => new Date(NOW),
    newId: () => `req_${(idCounter += 1)}`,
    ingestCompleted: options.ingestCompleted,
  });
  return { service, docStore, esignStore, lifecycle, signatures, provider, counts, media, puts };
}

function specFor(
  mode: EsignTemplateSpec["mode"],
  versions: DocumentVersionRecord[],
): EsignTemplateSpec {
  const documents = versions.map((v) => ({
    xeniosDocumentVersionId: v.id,
    category: v.category,
    title: v.title,
    sourceContentHash: v.contentHash,
    widgets: [],
  }));
  return { templateKey: "ignored-recomputed", title: "spec", mode, documents };
}

// ---------------------------------------------------------------------------
// deterministicTemplateKey
// ---------------------------------------------------------------------------

describe("deterministicTemplateKey", () => {
  it("is stable and order-independent for the same versions and hashes", () => {
    const { service } = makeService();
    const a = service.deterministicTemplateKey("opensign_document", ["v1", "v2"], ["h1", "h2"]);
    const b = service.deterministicTemplateKey("opensign_document", ["v2", "v1"], ["h2", "h1"]);
    expect(a).toBe(b);
    expect(a.startsWith("tmpl_")).toBe(true);
  });

  it("produces a NEW key when a source hash drifts", () => {
    const { service } = makeService();
    const a = service.deterministicTemplateKey("opensign_document", ["v1", "v2"], ["h1", "h2"]);
    const drifted = service.deterministicTemplateKey("opensign_document", ["v1", "v2"], ["h1", "h9"]);
    expect(drifted).not.toBe(a);
  });
});

// ---------------------------------------------------------------------------
// provisionTemplate
// ---------------------------------------------------------------------------

describe("provisionTemplate", () => {
  it("provisions once then returns the same mapping idempotently", async () => {
    const { service, docStore, counts } = makeService();
    const v1 = await publishVersion(docStore, "ver-1", "content one");

    const first = await service.provisionTemplate(specFor("opensign_document", [v1]));
    const second = await service.provisionTemplate(specFor("opensign_document", [v1]));

    expect(first.templateKey).toBe(second.templateKey);
    expect(first.provisioningStatus).toBe("provisioned");
    expect(counts.provisionTemplate).toBe(1); // never re-provisioned
  });

  it("refuses (TemplateSourceDrift) when a spec hash does not match the published version", async () => {
    const { service, docStore } = makeService();
    const v1 = await publishVersion(docStore, "ver-1", "content one");
    const spec = specFor("opensign_document", [v1]);
    const drifted: EsignTemplateSpec = {
      ...spec,
      documents: [{ ...spec.documents[0], sourceContentHash: "not-the-published-hash" }],
    };
    await expect(service.provisionTemplate(drifted)).rejects.toBeInstanceOf(TemplateSourceDrift);
  });

  it("marks a stale same-mode+versions mapping drifted and provisions a new one", async () => {
    const { service, docStore, esignStore } = makeService();
    const v1 = await publishVersion(docStore, "ver-1", "content one");

    const oldKey = service.deterministicTemplateKey("opensign_document", ["ver-1"], ["OLD_HASH"]);
    await esignStore.templates.upsert({
      templateKey: oldKey,
      provider: "opensign",
      providerTemplateId: "old-ptid",
      providerTemplateVersion: "1",
      mode: "opensign_document",
      xeniosDocumentVersionIds: ["ver-1"],
      sourceContentHashes: ["OLD_HASH"],
      provisioningStatus: "provisioned",
      createdAt: NOW,
      updatedAt: NOW,
    });

    const mapping = await service.provisionTemplate(specFor("opensign_document", [v1]));
    expect(mapping.templateKey).not.toBe(oldKey);
    expect(mapping.provisioningStatus).toBe("provisioned");
    expect((await esignStore.templates.getByKey(oldKey))!.provisioningStatus).toBe("drifted");
  });
});

// ---------------------------------------------------------------------------
// createSigningSession
// ---------------------------------------------------------------------------

describe("createSigningSession", () => {
  it("is idempotent on (member, idempotencyKey): one provider document, provider called once", async () => {
    const { service, docStore, counts } = makeService();
    await publishVersion(docStore, "ver-1", "content one");

    const input = {
      memberId: "m1",
      signerEmail: "m1@example.com",
      mode: "opensign_document" as const,
      xeniosDocumentVersionIds: ["ver-1"],
      idempotencyKey: "idem-1",
    };
    const first = await service.createSigningSession(input);
    const second = await service.createSigningSession(input);
    if (!first.ok || !second.ok) throw new Error("expected both sessions ok");

    expect(first.request.providerDocumentId).toBe(second.request.providerDocumentId);
    expect(second.idempotentReplay).toBe(true);
    expect(counts.createSigningSession).toBe(1);
    expect(first.signingUrl).not.toBeNull();
  });

  it("refuses an unpublished version", async () => {
    const { service, docStore } = makeService();
    await draftVersion(docStore, "ver-draft", "draft content");
    const result = await service.createSigningSession({
      memberId: "m1",
      signerEmail: "m1@example.com",
      mode: "opensign_document",
      xeniosDocumentVersionIds: ["ver-draft"],
      idempotencyKey: "idem-2",
    });
    expect(result).toEqual({ ok: false, code: "version_not_published" });
  });

  it("refuses a mode that does not route through a provider", async () => {
    const { service, docStore } = makeService();
    await publishVersion(docStore, "ver-1", "content one");
    const result = await service.createSigningSession({
      memberId: "m1",
      signerEmail: "m1@example.com",
      mode: "clickwrap_acceptance",
      xeniosDocumentVersionIds: ["ver-1"],
      idempotencyKey: "idem-3",
    });
    expect(result).toEqual({ ok: false, code: "mode_not_provider_backed" });
  });
});

// ---------------------------------------------------------------------------
// processWebhookEvent
// ---------------------------------------------------------------------------

describe("processWebhookEvent", () => {
  async function withSession(options: { ingestCompleted?: IngestCompletedFn } = {}) {
    const ctx = makeService(options);
    await publishVersion(ctx.docStore, "ver-1", "content one");
    const created = await ctx.service.createSigningSession({
      memberId: "m1",
      signerEmail: "m1@example.com",
      mode: "opensign_document",
      xeniosDocumentVersionIds: ["ver-1"],
      idempotencyKey: "idem-1",
    });
    if (!created.ok) throw new Error("expected session ok");
    return { ...ctx, providerDocumentId: created.request.providerDocumentId! };
  }

  it("denies an unknown provider document", async () => {
    const { service } = makeService();
    const result = await service.processWebhookEvent({
      eventId: "e1",
      type: "viewed",
      providerDocumentId: "nope",
      occurredAt: NOW,
    });
    expect(result).toEqual({ ok: false, code: "unknown_document" });
  });

  it("advances status on viewed then signed", async () => {
    const { service, esignStore, providerDocumentId } = await withSession();

    const viewed = await service.processWebhookEvent({
      eventId: "e-view",
      type: "viewed",
      providerDocumentId,
      occurredAt: NOW,
    });
    expect(viewed).toMatchObject({ ok: true, applied: true, status: "viewed" });
    expect((await esignStore.requests.getByProviderDocumentId(providerDocumentId))!.viewedAt).toBe(NOW);

    const signed = await service.processWebhookEvent({
      eventId: "e-sign",
      type: "signed",
      providerDocumentId,
      occurredAt: NOW,
    });
    expect(signed).toMatchObject({ ok: true, applied: true, status: "signed" });
    expect((await esignStore.requests.getByProviderDocumentId(providerDocumentId))!.signedAt).toBe(NOW);
  });

  it("treats a duplicate event id as a no-op replay", async () => {
    const { service, providerDocumentId } = await withSession();
    const first = await service.processWebhookEvent({
      eventId: "dup",
      type: "viewed",
      providerDocumentId,
      occurredAt: NOW,
    });
    expect(first).toMatchObject({ applied: true });
    const second = await service.processWebhookEvent({
      eventId: "dup",
      type: "viewed",
      providerDocumentId,
      occurredAt: NOW,
    });
    expect(second).toMatchObject({ ok: true, applied: false, status: "viewed" });
  });

  it("processes completion server-side: fetches, ingests, stores refs+hashes, returns completed versions", async () => {
    const { service, esignStore, providerDocumentId, counts, puts } = await withSession();

    const result = await service.processWebhookEvent({
      eventId: "e-complete",
      type: "completed",
      providerDocumentId,
      signedFileUrl: "https://provider.example/signed.pdf",
      certificateUrl: "https://provider.example/cert.pdf",
      occurredAt: NOW,
    });
    expect(result).toEqual({
      ok: true,
      applied: true,
      status: "completed",
      completedVersionIds: ["ver-1"],
    });
    expect(counts.fetchCompletedFile).toBe(2); // signed pdf + certificate

    const stored = (await esignStore.requests.getByProviderDocumentId(providerDocumentId))!;
    expect(stored.signingLinkStatus).toBe("completed");
    expect(stored.completedAt).toBe(NOW);
    expect(stored.signedPdfRef).toBe("esign/m1/" + providerDocumentId + "/signed.pdf");
    expect(stored.certificateRef).toBe("esign/m1/" + providerDocumentId + "/certificate.pdf");
    expect(stored.signedPdfHash).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(stored.certificateHash).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(stored.xeniosAcceptanceEventIds).toEqual(["esign:e-complete:ver-1"]);
    expect(puts).toHaveLength(2); // default ingest stored both files through media
  });

  it("uses an injected ingestCompleted callback instead of media when provided", async () => {
    const ingestCompleted: IngestCompletedFn = async () => ({
      signedPdfRef: "custom/signed",
      signedPdfHash: "a".repeat(64),
      certificateRef: "custom/cert",
      certificateHash: "b".repeat(64),
    });
    const { service, esignStore, providerDocumentId, puts } = await withSession({ ingestCompleted });

    const result = await service.processWebhookEvent({
      eventId: "e-complete",
      type: "completed",
      providerDocumentId,
      signedFileUrl: "https://provider.example/signed.pdf",
      occurredAt: NOW,
    });
    expect(result).toMatchObject({ ok: true, applied: true, status: "completed" });
    const stored = (await esignStore.requests.getByProviderDocumentId(providerDocumentId))!;
    expect(stored.signedPdfRef).toBe("custom/signed");
    expect(stored.certificateRef).toBe("custom/cert");
    expect(puts).toHaveLength(0); // media untouched, the injected ingest ran
  });

  it("refuses a completion that carries no signed file url", async () => {
    const { service, providerDocumentId } = await withSession();
    const result = await service.processWebhookEvent({
      eventId: "e-complete",
      type: "completed",
      providerDocumentId,
      occurredAt: NOW,
    });
    expect(result).toEqual({ ok: false, code: "unverified_completion" });
  });

  it("a redirect with no webhook never advances the request (still created)", async () => {
    const { esignStore, providerDocumentId } = await withSession();
    // No processWebhookEvent call: a browser redirect is not proof of completion.
    const stored = (await esignStore.requests.getByProviderDocumentId(providerDocumentId))!;
    expect(stored.signingLinkStatus).toBe("created");
    expect(stored.completedAt).toBeNull();
  });
});
