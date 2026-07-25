import { describe, expect, it } from "vitest";
import {
  BIOMARKER_STATES,
  BiomarkerService,
  DisabledBiomarkerUploadProvider,
  MemoryBiomarkerStore,
  SUPERPOWER_RESEARCH_BOUNDARY,
  SuperpowerOfferRepository,
  canTransitionBiomarkerState,
  type BiomarkerUploadProvider,
} from "./diagnostics";
import {
  MemoryProductDiagnosticEmailStore,
  PRODUCT_DIAGNOSTIC_EMAIL_EVENTS,
  ProductDiagnosticEmailService,
  RESEARCH_EMAIL_FROM,
  RESEARCH_EMAIL_REPLY_TO,
} from "./communications";
import {
  STORAGE_ACCESSORY_BOUNDARY,
  STORAGE_AND_ORGANIZATION_ACCESSORIES,
  SUPPORT_CENTER_CATEGORIES,
} from "./support-and-storage";

describe("Superpower Diagnostics", () => {
  it("has a truthful Coming Soon state with no affiliate link until enabled", () => {
    const repository = new SuperpowerOfferRepository();
    expect(repository.readPublic()).toMatchObject({
      status: "coming_soon",
      affiliateUrl: null,
      priceCents: null,
      researchBoundary: SUPERPOWER_RESEARCH_BOUNDARY,
    });
  });

  it("requires an explicit enabled HTTPS affiliate configuration", async () => {
    const repository = new SuperpowerOfferRepository();
    await expect(
      repository.update(
        { affiliate: { enabled: true, url: "http://example.com" } },
        "admin@example.com",
        "2026-07-25T12:00:00.000Z",
      ),
    ).rejects.toThrow("HTTPS");
    await repository.update(
      {
        status: "available",
        affiliate: { enabled: true, url: "https://partner.example/offer" },
        priceCents: 24900,
        priceEffectiveDate: "2026-08-01",
        lastVerificationDate: "2026-07-31",
        collectionMethod: "Partner collection site",
        availability: "Eligible US locations",
      },
      "admin@example.com",
      "2026-07-31T12:00:00.000Z",
    );
    expect(repository.readPublic().affiliateUrl).toBe(
      "https://partner.example/offer",
    );
  });
});

describe("Biomarker Center", () => {
  it("defines every requested state and controlled transitions", () => {
    expect(BIOMARKER_STATES).toHaveLength(11);
    expect(canTransitionBiomarkerState("not_started", "test_ordered")).toBe(true);
    expect(canTransitionBiomarkerState("not_started", "qualified_review_complete")).toBe(
      false,
    );
  });

  it("requires consent and private upload availability", async () => {
    const service = new BiomarkerService(
      new MemoryBiomarkerStore(),
      new DisabledBiomarkerUploadProvider(),
    );
    await expect(
      service.createReportUpload({
        memberId: "member_1",
        activeMember: true,
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 200,
        consentAccepted: false,
        consentVersion: "biomarker-upload-v1",
      }),
    ).resolves.toEqual({ ok: false, code: "consent_required" });
    await expect(
      service.createReportUpload({
        memberId: "member_1",
        activeMember: true,
        filename: "report.pdf",
        contentType: "application/pdf",
        sizeBytes: 200,
        consentAccepted: true,
        consentVersion: "biomarker-upload-v1",
      }),
    ).resolves.toEqual({ ok: false, code: "private_upload_unavailable" });
  });

  it("partitions a successful private upload by a hash, never raw member id", async () => {
    const provider: BiomarkerUploadProvider = {
      async createPrivateUpload(input) {
        expect(input.storageKey).not.toContain("member_private_1");
        expect(input.expiresInSeconds).toBe(600);
        return {
          ok: true,
          uploadUrl: "https://signed.example/upload",
          expiresAt: "2026-07-25T12:10:00.000Z",
        };
      },
      async verifyPrivateUpload(input) {
        expect(input.storageKey).not.toContain("member_private_1");
        return { ok: true };
      },
    };
    const store = new MemoryBiomarkerStore();
    const service = new BiomarkerService(
      store,
      provider,
      () => new Date("2026-07-25T12:00:00.000Z"),
    );
    const result = await service.createReportUpload({
      memberId: "member_private_1",
      activeMember: true,
      filename: "../../report.pdf",
      contentType: "application/pdf",
      sizeBytes: 200,
      consentAccepted: true,
      consentVersion: "biomarker-upload-v1",
    });
    expect(result).toMatchObject({
      ok: true,
      record: { state: "not_started", reportFilename: null },
    });
    if (!result.ok) throw new Error("expected upload grant");
    expect(store.pendingUploads.get(result.uploadId)).toMatchObject({
      state: "pending",
      filename: "report.pdf",
    });
    expect(store.records.get("member_private_1")).toMatchObject({
      state: "not_started",
      reportStorageKey: null,
    });

    const confirmed = await service.confirmReportUpload({
      memberId: "member_private_1",
      activeMember: true,
      uploadId: result.uploadId,
    });
    expect(confirmed).toMatchObject({
      ok: true,
      record: { state: "report_uploaded", reportFilename: "report.pdf" },
    });
    expect(store.pendingUploads.size).toBe(0);
    expect(JSON.stringify(result)).not.toContain("interpretation");
  });

  it("does not overwrite a prior report when a later upload is abandoned", async () => {
    const provider: BiomarkerUploadProvider = {
      async createPrivateUpload() {
        return {
          ok: true,
          uploadUrl: "https://signed.example/upload",
          expiresAt: "2026-07-25T12:10:00.000Z",
        };
      },
      async verifyPrivateUpload() {
        return { ok: true };
      },
    };
    const store = new MemoryBiomarkerStore();
    store.records.set("member_1", {
      biomarkerRecordId: "record_1",
      memberId: "member_1",
      state: "report_uploaded",
      partnerReference: null,
      reportStorageKey: "biomarker-reports/existing.pdf",
      reportFilename: "existing.pdf",
      consentVersion: "v1",
      consentedAt: "2026-07-24T12:00:00.000Z",
      updatedAt: "2026-07-24T12:00:00.000Z",
    });
    const service = new BiomarkerService(store, provider);
    const pending = await service.createReportUpload({
      memberId: "member_1",
      activeMember: true,
      filename: "replacement.pdf",
      contentType: "application/pdf",
      sizeBytes: 200,
      consentAccepted: true,
      consentVersion: "v2",
    });
    expect(pending.ok).toBe(true);
    expect(await store.get("member_1")).toMatchObject({
      reportStorageKey: "biomarker-reports/existing.pdf",
      reportFilename: "existing.pdf",
    });
  });

  it("refuses confirmation when private object verification fails", async () => {
    const provider: BiomarkerUploadProvider = {
      async createPrivateUpload() {
        return {
          ok: true,
          uploadUrl: "https://signed.example/upload",
          expiresAt: "2026-07-25T12:10:00.000Z",
        };
      },
      async verifyPrivateUpload() {
        return { ok: false, code: "object_missing" };
      },
    };
    const store = new MemoryBiomarkerStore();
    const service = new BiomarkerService(store, provider);
    const pending = await service.createReportUpload({
      memberId: "member_1",
      activeMember: true,
      filename: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: 200,
      consentAccepted: true,
      consentVersion: "v1",
    });
    if (!pending.ok) throw new Error("expected upload grant");
    await expect(
      service.confirmReportUpload({
        memberId: "member_1",
        activeMember: true,
        uploadId: pending.uploadId,
      }),
    ).resolves.toEqual({ ok: false, code: "upload_not_verified" });
    expect(await store.get("member_1")).toMatchObject({
      state: "not_started",
      reportStorageKey: null,
    });
  });
});

describe("communications, storage, and support", () => {
  it("builds every requested idempotent email with the required identity", async () => {
    const store = new MemoryProductDiagnosticEmailStore();
    const service = new ProductDiagnosticEmailService(
      store,
      () => new Date("2026-07-25T12:00:00.000Z"),
    );
    for (const eventType of PRODUCT_DIAGNOSTIC_EMAIL_EVENTS) {
      const key = `event:${eventType}:1`;
      const first = await service.createIntent({
        eventKey: key,
        eventType,
        recipient: "member@example.com",
        payload: {
          firstName: "Sam",
          memberAreaUrl: "https://xeniostechnology.com/research/member",
          diagnosis: "must-not-leak",
          laboratoryResult: "must-not-leak",
        },
      });
      const duplicate = await service.createIntent({
        eventKey: key,
        eventType,
        recipient: "member@example.com",
        payload: {},
      });
      expect(first.created).toBe(true);
      expect(duplicate.created).toBe(false);
      expect(first.intent.from).toBe(RESEARCH_EMAIL_FROM);
      expect(first.intent.replyTo).toBe(RESEARCH_EMAIL_REPLY_TO);
      expect(JSON.stringify(first.intent)).not.toContain("must-not-leak");
    }
    expect(store.intents.size).toBe(10);
  });

  it("contains the exact single Support Center taxonomy", () => {
    expect(SUPPORT_CENTER_CATEGORIES).toHaveLength(18);
    expect(SUPPORT_CENTER_CATEGORIES).toContain("Clinician-guided pathway interest");
    expect(SUPPORT_CENTER_CATEGORIES).toContain("Accessibility");
  });

  it("contains only neutral storage and organization accessories", () => {
    expect(STORAGE_AND_ORGANIZATION_ACCESSORIES).toEqual([
      "Refrigerator thermometer",
      "Temperature logger",
      "Opaque organizer",
      "Lockable container",
      "Tamper-evident bag",
      "Labels",
      "Document organizer",
      "Inventory tray",
      "Insulated transport pouch",
      "Approved cool pack",
    ]);
    expect(STORAGE_ACCESSORY_BOUNDARY).toContain(
      "not human administration supplies",
    );
  });
});
