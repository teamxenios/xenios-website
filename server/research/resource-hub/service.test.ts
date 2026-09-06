import { describe, expect, it, vi } from "vitest";
import { RESOURCE_PDF_MAX_BYTES, type ResourceUploadInput } from "@shared/research/resource-hub/contract";
import { createMemoryResourceBytesStore, notConfiguredResourceBytesStore } from "./bytes-store";
import { createResourceHubService, decodePdfNameEscapes, inflatedPdfStreams, sha256Hex, validatePdfUpload } from "./service";
import { ResourceHubConflict, createInMemoryResourceHubStore } from "./store";

// ---------------------------------------------------------------------------
// Fixtures: a real (tiny) PDF, judged by its bytes; a deterministic clock and
// id sequence so every assertion is exact.
// ---------------------------------------------------------------------------

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);
const PDF_WITH_SCRIPT = Buffer.from("%PDF-1.4\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF\n", "latin1");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(overrides: Partial<ResourceUploadInput> = {}): ResourceUploadInput {
  return {
    title: "Partner introduction one-pager",
    purpose: "A one-page introduction a partner may hand to a prospective member.",
    usagePolicy: "external_share",
    audience: ["all_partners"],
    originalFilename: "intro-one-pager.pdf",
    idempotencyKey: "upload-key-0001",
    ...overrides,
  };
}

function file(bytes: Buffer = PDF, contentType = "application/pdf") {
  return { bytes: new Uint8Array(bytes), contentType };
}

function harness() {
  const store = createInMemoryResourceHubStore();
  const bytes = createMemoryResourceBytesStore();
  let tick = 0;
  let ids = 0;
  const service = createResourceHubService({
    store,
    bytes,
    now: () => new Date(Date.UTC(2026, 8, 6, 12, 0, tick++)),
    newId: () => `id-${String(++ids).padStart(4, "0")}`,
  });
  return { store, bytes, service };
}

const ADMIN = "admin@xenios.test";
const REP = { memberId: "member-rep", role: "research_rep" as const, state: "active" as const };
const AFFILIATE = { memberId: "member-aff", role: "affiliate" as const, state: "active" as const };
const SUSPENDED_REP = { memberId: "member-sus", role: "research_rep" as const, state: "suspended" as const };

async function publishOne(h: ReturnType<typeof harness>, input: Partial<ResourceUploadInput> = {}) {
  const created = await h.service.createVersion(ADMIN, upload(input), file());
  if (!created.ok) throw new Error(`fixture upload failed: ${JSON.stringify(created)}`);
  const resourceId = created.resource.resourceId;
  const versionId = created.resource.versions[0]!.versionId;
  const reviewed = await h.service.review(ADMIN, resourceId, versionId, { action: "approve_content", reason: "Reviewed against the brief.", idempotencyKey: "review-rev-1x" });
  if (!reviewed.ok) throw new Error(`fixture review failed: ${JSON.stringify(reviewed)}`);
  const published = await h.service.review(ADMIN, resourceId, versionId, { action: "publish", idempotencyKey: "review-pub-1x" });
  if (!published.ok) throw new Error(`fixture publish failed: ${JSON.stringify(published)}`);
  return { resourceId, versionId };
}

// ---------------------------------------------------------------------------

describe("upload validation judges the bytes (UPL-01..03)", () => {
  it("UPL-01: a non-PDF file declared as PDF is rejected", () => {
    const result = validatePdfUpload({ bytes: PNG, declaredContentType: "application/pdf", originalFilename: "fake.pdf" });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("file does not start with a PDF signature");
  });

  it("UPL-02: a file over the size ceiling is rejected", () => {
    const big = Buffer.alloc(RESOURCE_PDF_MAX_BYTES + 1, 0x20);
    PDF.copy(big, 0);
    const result = validatePdfUpload({ bytes: big, declaredContentType: "application/pdf", originalFilename: "big.pdf" });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("exceeds"))).toBe(true);
  });

  it("UPL-03: active content and unsafe filenames are rejected", () => {
    const scripted = validatePdfUpload({ bytes: PDF_WITH_SCRIPT, declaredContentType: "application/pdf", originalFilename: "ok.pdf" });
    expect(scripted.ok).toBe(false);
    expect(scripted.reasons.join(" ")).toContain("PDF contains active content (/");
    for (const name of ["../escape.pdf", "dir/file.pdf", "file.exe", "file.pdf.exe", "-leading.pdf", "bad\u0000name.pdf"]) {
      expect(validatePdfUpload({ bytes: PDF, declaredContentType: "application/pdf", originalFilename: name }).ok, name).toBe(false);
    }
    expect(validatePdfUpload({ bytes: PDF, declaredContentType: "text/plain", originalFilename: "ok.pdf" }).ok).toBe(false);
    expect(validatePdfUpload({ bytes: PDF, declaredContentType: "application/pdf", originalFilename: "Intro (v2) final.pdf" }).ok).toBe(true);
  });

  it("a rejected upload leaves no row and no bytes behind", async () => {
    const h = harness();
    const result = await h.service.createVersion(ADMIN, upload(), file(PNG));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_resource_upload");
    expect(result.fieldErrors?.file).toBeTruthy();
    expect(h.store.snapshot()).toEqual({ resources: [], versions: [], deliveries: [] });
    expect(h.bytes.keys()).toEqual([]);
  });

  it("a wrong declared content type is a typed rejection, even for real PDF bytes", async () => {
    const h = harness();
    const result = await h.service.createVersion(ADMIN, upload(), file(PDF, "application/octet-stream"));
    expect(result).toMatchObject({ ok: false, code: "invalid_resource_upload" });
    expect(h.store.snapshot().versions).toEqual([]);
  });
});

describe("a valid upload becomes an immutable draft version", () => {
  it("stores hashed bytes under a key that never appears in any projection", async () => {
    const h = harness();
    const result = await h.service.createVersion(ADMIN, upload(), file());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const version = result.resource.versions[0]!;
    expect(version).toMatchObject({ versionNumber: 1, state: "draft", usagePolicy: "external_share", sizeBytes: PDF.byteLength, sha256: sha256Hex(PDF) });
    expect(h.bytes.keys()).toEqual([`resource-library/${result.resource.resourceId}/v1-${version.versionId}.pdf`]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("resource-library/");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain(ADMIN);
    expect(serialized).not.toContain("uploadIdempotencyKey");
  });

  it("is idempotent by upload key: the same key yields the same resource and one version", async () => {
    const h = harness();
    const first = await h.service.createVersion(ADMIN, upload(), file());
    const second = await h.service.createVersion(ADMIN, upload({ title: "A different title with the same key" }), file());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.resource.resourceId).toBe(first.resource.resourceId);
    expect(second.resource.versions).toHaveLength(1);
    expect(h.bytes.keys()).toHaveLength(1);
  });

  it("refuses a new version for an unknown resource", async () => {
    const h = harness();
    const result = await h.service.createVersion(ADMIN, upload({ resourceId: "id-nope" }), file());
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });

  it("answers resource_hub_unavailable when byte storage is not wired", async () => {
    const store = createInMemoryResourceHubStore();
    const service = createResourceHubService({ store, bytes: notConfiguredResourceBytesStore, now: () => new Date(0), newId: () => "x" });
    const result = await service.createVersion(ADMIN, upload(), file());
    expect(result).toMatchObject({ ok: false, code: "resource_hub_unavailable" });
    expect(store.snapshot().versions).toEqual([]);
  });
});

describe("review, publication, and withdrawal are explicit and ordered", () => {
  it("cannot publish before content review is recorded", async () => {
    const h = harness();
    const created = await h.service.createVersion(ADMIN, upload(), file());
    if (!created.ok) throw new Error("fixture");
    const { resourceId } = created.resource;
    const versionId = created.resource.versions[0]!.versionId;
    expect(await h.service.review(ADMIN, resourceId, versionId, { action: "publish", idempotencyKey: "review-pxxxxx" })).toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect(await h.service.review(ADMIN, resourceId, versionId, { action: "request_review", idempotencyKey: "review-rxxxxx" })).toMatchObject({ ok: true });
    expect(await h.service.review(ADMIN, resourceId, versionId, { action: "publish", idempotencyKey: "review-p2xxxx" })).toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect(await h.service.review(ADMIN, resourceId, versionId, { action: "approve_content", idempotencyKey: "review-axxxxx" })).toMatchObject({ ok: false, code: "invalid_resource_metadata" });
    const approved = await h.service.review(ADMIN, resourceId, versionId, { action: "approve_content", reason: "Matches brief.", idempotencyKey: "review-a2xxxx" });
    expect(approved.ok && approved.resource.versions[0]!.reviewedAt).toBeTruthy();
    const published = await h.service.review(ADMIN, resourceId, versionId, { action: "publish", idempotencyKey: "review-p3xxxx" });
    expect(published.ok && published.resource.currentPublishedVersionId).toBe(versionId);
    expect(published.ok && published.resource.versions[0]!.state).toBe("published");
    // Publishing again is idempotent, not a conflict.
    expect(await h.service.review(ADMIN, resourceId, versionId, { action: "publish", idempotencyKey: "review-p4xxxx" })).toMatchObject({ ok: true });
  });

  it("a mismatched resource/version pair is not found", async () => {
    const h = harness();
    const a = await publishOne(h);
    const b = await publishOne(h, { idempotencyKey: "upload-key-0002", title: "Second resource, second key" });
    expect(await h.service.review(ADMIN, a.resourceId, b.versionId, { action: "withdraw", reason: "x", idempotencyKey: "review-wxxxxx" })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("a newer published version supersedes the current one exactly", async () => {
    const h = harness();
    const v1 = await publishOne(h);
    const v2 = await h.service.createVersion(ADMIN, upload({ resourceId: v1.resourceId, idempotencyKey: "upload-key-0002", changeSummary: "Corrected the pricing footnote." }), file());
    if (!v2.ok) throw new Error("fixture");
    const v2Id = v2.resource.versions[1]!.versionId;
    expect(v2.resource.versions[1]).toMatchObject({ versionNumber: 2, state: "draft", supersedesVersionId: v1.versionId, changeSummary: "Corrected the pricing footnote." });
    // Still v1 for partners until v2 is published.
    expect((await h.service.libraryFor(REP)).map((c) => c.versionNumber)).toEqual([1]);
    await h.service.review(ADMIN, v1.resourceId, v2Id, { action: "approve_content", reason: "ok", idempotencyKey: "review-axxxxx" });
    const published = await h.service.review(ADMIN, v1.resourceId, v2Id, { action: "publish", idempotencyKey: "review-pxxxxx" });
    if (!published.ok) throw new Error("fixture");
    expect(published.resource.currentPublishedVersionId).toBe(v2Id);
    expect(published.resource.versions.map((v) => v.state)).toEqual(["superseded", "published"]);
    const cards = await h.service.libraryFor(REP);
    expect(cards.map((c) => [c.versionNumber, c.versionId])).toEqual([[2, v2Id]]);
  });

  it("withdrawal needs a reason, clears the current version, and denies delivery immediately", async () => {
    const h = harness();
    const { resourceId, versionId } = await publishOne(h);
    expect(await h.service.review(ADMIN, resourceId, versionId, { action: "withdraw", idempotencyKey: "review-w0xxxx" })).toMatchObject({ ok: false, code: "invalid_resource_metadata" });
    const withdrawn = await h.service.review(ADMIN, resourceId, versionId, { action: "withdraw", reason: "Superseded pricing.", idempotencyKey: "review-w1xxxx" });
    expect(withdrawn.ok && withdrawn.resource.currentPublishedVersionId).toBeNull();
    expect(withdrawn.ok && withdrawn.resource.versions[0]!.state).toBe("withdrawn");
    expect(await h.service.libraryFor(REP)).toEqual([]);
    const delivery = await h.service.deliverToPartner(REP, resourceId);
    expect(delivery).toEqual({ ok: false, code: "not_found" });
    expect((await h.store.listDeliveries(resourceId)).map((d) => [d.outcome, d.reason])).toEqual([["denied", "not_published"]]);
    // A draft cannot be withdrawn; a withdrawn version stays withdrawn.
    expect(await h.service.review(ADMIN, resourceId, versionId, { action: "withdraw", reason: "again", idempotencyKey: "review-w2xxxx" })).toMatchObject({ ok: true });
  });
});

describe("the partner library is scoped by audience, state, and policy (RES-01..10 subset)", () => {
  it("lists a published resource only to a role in its audience", async () => {
    const h = harness();
    await publishOne(h, { audience: ["research_rep"] });
    const forRep = await h.service.libraryFor(REP);
    expect(forRep).toHaveLength(1);
    expect(forRep[0]).toMatchObject({
      versionNumber: 1,
      usagePolicy: "external_share",
      usageLabel: "Approved to share",
      actions: { read: true, download: true, share: false },
    });
    expect(forRep[0]!.downloadPath).toBe(`/api/research/partner/resources/${forRep[0]!.resourceId}/download`);
    expect(await h.service.libraryFor(AFFILIATE)).toEqual([]);
    expect(await h.service.libraryFor(SUSPENDED_REP)).toEqual([]);
  });

  it("the all-partners wildcard reaches every role, and a private policy never offers share", async () => {
    const h = harness();
    await publishOne(h, { audience: ["all_partners"], usagePolicy: "private" });
    for (const partner of [REP, AFFILIATE]) {
      const cards = await h.service.libraryFor(partner);
      expect(cards).toHaveLength(1);
      expect(cards[0]!.actions).toEqual({ read: true, download: true, share: false });
      expect(cards[0]!.usageLabel).toBe("Private working material");
    }
  });

  it("a draft-policy version can never be published, so it is never listed", async () => {
    const h = harness();
    const created = await h.service.createVersion(ADMIN, upload({ audience: ["all_partners"], usagePolicy: "draft" }), file());
    if (!created.ok) throw new Error("fixture");
    const { resourceId } = created.resource;
    const versionId = created.resource.versions[0]!.versionId;
    await h.service.review(ADMIN, resourceId, versionId, { action: "approve_content", reason: "ok", idempotencyKey: "review-draft-a" });
    const published = await h.service.review(ADMIN, resourceId, versionId, { action: "publish", idempotencyKey: "review-draft-p" });
    expect(published).toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect((await h.service.getAdmin(resourceId))?.currentPublishedVersionId).toBeNull();
    expect(await h.service.libraryFor(REP)).toEqual([]);
    expect(await h.service.libraryFor(AFFILIATE)).toEqual([]);
  });

  it("an unpublished draft is invisible to every partner", async () => {
    const h = harness();
    await h.service.createVersion(ADMIN, upload({ audience: ["all_partners"] }), file());
    expect(await h.service.libraryFor(REP)).toEqual([]);
  });

  it("cards carry no storage key, admin identity, review reason, or idempotency key", async () => {
    const h = harness();
    await publishOne(h);
    const serialized = JSON.stringify(await h.service.libraryFor(REP));
    for (const forbidden of ["storageKey", "resource-library/", ADMIN, "reviewReason", "Reviewed against", "uploadIdempotencyKey", "upload-key"]) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });
});

describe("delivery re-reads entitlement at use time and records every attempt", () => {
  it("delivers the exact published bytes to an entitled partner", async () => {
    const h = harness();
    const { resourceId, versionId } = await publishOne(h, { audience: ["research_rep"] });
    const result = await h.service.deliverToPartner(REP, resourceId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Buffer.from(result.bytes).equals(PDF)).toBe(true);
    expect(result.contentType).toBe("application/pdf");
    expect(result.filename).toBe(`${resourceId}-v1.pdf`);
    expect(await h.store.listDeliveries(resourceId)).toEqual([
      expect.objectContaining({ versionId, memberId: REP.memberId, outcome: "delivered", reason: null }),
    ]);
  });

  it("denies a role outside the audience with 404 semantics and a recorded reason", async () => {
    const h = harness();
    const { resourceId, versionId } = await publishOne(h, { audience: ["research_rep"] });
    expect(await h.service.deliverToPartner(AFFILIATE, resourceId)).toEqual({ ok: false, code: "not_found" });
    expect(await h.service.deliverToPartner(SUSPENDED_REP, resourceId)).toEqual({ ok: false, code: "not_found" });
    expect((await h.store.listDeliveries(resourceId)).map((d) => [d.versionId, d.memberId, d.outcome, d.reason])).toEqual([
      [versionId, AFFILIATE.memberId, "denied", "audience"],
      [versionId, SUSPENDED_REP.memberId, "denied", "audience"],
    ]);
  });

  it("denies by policy at delivery time even if a published version's policy were ever draft", async () => {
    // Publishing a draft-policy version is refused upstream; this proves the
    // delivery door re-reads the policy anyway (defense in depth via the store).
    const h = harness();
    const { resourceId, versionId } = await publishOne(h, { audience: ["all_partners"] });
    await h.store.updateVersion(versionId, { usagePolicy: "draft" });
    expect(await h.service.deliverToPartner(REP, resourceId)).toEqual({ ok: false, code: "not_found" });
    expect((await h.store.listDeliveries(resourceId)).map((d) => d.reason)).toEqual(["policy"]);
    expect(await h.service.libraryFor(REP)).toEqual([]);
  });

  it("an unknown resource is not found; there is no resource to record against", async () => {
    const h = harness();
    expect(await h.service.deliverToPartner(REP, "id-missing")).toEqual({ ok: false, code: "not_found" });
    expect(await h.store.listDeliveries("id-missing")).toEqual([]);
  });

  it("reports unavailable storage as a failed delivery, never as success", async () => {
    const h = harness();
    const { resourceId } = await publishOne(h);
    const dark = createResourceHubService({ store: h.store, bytes: notConfiguredResourceBytesStore, now: () => new Date(0), newId: () => "d" });
    expect(await dark.deliverToPartner(REP, resourceId)).toEqual({ ok: false, code: "resource_hub_unavailable" });
    expect((await h.store.listDeliveries(resourceId)).map((d) => [d.outcome, d.reason])).toEqual([["failed", "storage_unavailable"]]);
  });
});

describe("admin projections", () => {
  it("list and item projections agree and expose validation, never storage keys", async () => {
    const h = harness();
    const { resourceId } = await publishOne(h);
    const list = await h.service.listAdmin();
    const item = await h.service.getAdmin(resourceId);
    expect(list).toEqual([item]);
    expect(item?.versions[0]?.validation).toEqual({ ok: true, reasons: [] });
    expect(JSON.stringify(list)).not.toContain("storageKey");
    expect(await h.service.getAdmin("id-none")).toBeNull();
  });

  it("admin preview streams the version bytes for any validated version", async () => {
    const h = harness();
    const { resourceId, versionId } = await publishOne(h);
    const preview = await h.service.adminBytes(resourceId, versionId);
    expect(preview.ok && Buffer.from(preview.bytes).equals(PDF)).toBe(true);
    expect(await h.service.adminBytes("id-other", versionId)).toEqual({ ok: false, code: "not_found" });
  });
});

describe("store failures cannot become oracles or dead ends", () => {
  it("an unknown resource is not found and writes NO ledger row (the ledger keys on an existing resource)", async () => {
    const h = harness();
    expect(await h.service.deliverToPartner(REP, "id-missing")).toEqual({ ok: false, code: "not_found" });
    expect(h.store.snapshot().deliveries).toEqual([]);
  });

  it("a ledger write failure on a denial still answers the uniform 404", async () => {
    const h = harness();
    const { resourceId } = await publishOne(h, { audience: ["research_rep"] });
    const failing = { ...h.store, recordDelivery: async () => { throw new Error("ledger offline"); } };
    const service = createResourceHubService({ store: failing, bytes: h.bytes, now: () => new Date(0), newId: () => "x" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await service.deliverToPartner(AFFILIATE, resourceId)).toEqual({ ok: false, code: "not_found" });
      // A completed delivery, by contrast, MUST be recorded: refuse rather than deliver unrecorded.
      await expect(service.deliverToPartner(REP, resourceId)).rejects.toThrow(/ledger offline/);
    } finally {
      spy.mockRestore();
    }
  });

  it("publish converges when a published version lost its current pointer (repair path)", async () => {
    const h = harness();
    await publishOne(h);
    // Simulate a store that could not complete the transition on a second
    // resource: its version is "published" but the current pointer was never set.
    const second = await h.service.createVersion(ADMIN, upload({ idempotencyKey: "upload-key-0009", title: "Second resource for the repair test" }), file());
    if (!second.ok) throw new Error("fixture");
    const rid = second.resource.resourceId;
    const vid = second.resource.versions[0]!.versionId;
    await h.service.review(ADMIN, rid, vid, { action: "approve_content", reason: "ok", idempotencyKey: "review-rep-a1" });
    // Publish the version WITHOUT the pointer (state only), as a half-applied transition would leave it.
    await h.store.updateVersion(vid, { state: "published", publishedAt: "2026-09-06T12:00:00.000Z", publishedByAdmin: ADMIN });
    expect((await h.service.getAdmin(rid))?.currentPublishedVersionId).toBeNull();
    expect(await h.service.libraryFor(REP)).toHaveLength(1); // only the first resource
    const repaired = await h.service.review(ADMIN, rid, vid, { action: "publish", idempotencyKey: "review-rep-p1" });
    expect(repaired).toMatchObject({ ok: true, resource: { currentPublishedVersionId: vid } });
    expect(await h.service.libraryFor(REP)).toHaveLength(2);
  });

  it("a version-number race answers a typed conflict, never a 503, and publishes nothing", async () => {
    const h = harness();
    const first = await h.service.createVersion(ADMIN, upload(), file());
    if (!first.ok) throw new Error("fixture");
    const racing = {
      ...h.store,
      async insertVersion() {
        throw new ResourceHubConflict("duplicate version number");
      },
    };
    const service = createResourceHubService({ store: racing, bytes: h.bytes, now: () => new Date(0), newId: () => "id-race" });
    const result = await service.createVersion(ADMIN, upload({ resourceId: first.resource.resourceId, idempotencyKey: "upload-key-0002" }), file());
    expect(result).toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect((await h.service.getAdmin(first.resource.resourceId))?.versions).toHaveLength(1);
  });
});

describe("the active-content scan reads through spelling tricks and compression", () => {
  const { deflateSync } = require("node:zlib") as typeof import("node:zlib");
  function pdfWithFlateStream(inner: string): Buffer {
    const data = deflateSync(Buffer.from(inner, "latin1"));
    return Buffer.concat([
      Buffer.from("%PDF-1.5\n1 0 obj << /Type /ObjStm /Filter /FlateDecode /Length " + data.byteLength + " >>\nstream\n", "latin1"),
      data,
      Buffer.from("\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1"),
    ]);
  }
  const judge = (bytes: Buffer) => validatePdfUpload({ bytes, declaredContentType: "application/pdf", originalFilename: "ok.pdf" });

  it("decodes #xx name escapes before matching markers", () => {
    const escaped = Buffer.from("%PDF-1.4\n1 0 obj << /OpenAction << /S /J#61vaScript /J#53 (app.alert(1)) >> >> endobj\n%%EOF\n", "latin1");
    const result = judge(escaped);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/active content/u);
    expect(decodePdfNameEscapes("/J#61vaScript")).toBe("/JavaScript");
  });

  it("inflates FlateDecode streams (object streams included) and scans inside them", () => {
    const hidden = pdfWithFlateStream("<< /Type /Action /S /JavaScript /JS (app.alert(1)) >>");
    expect(Buffer.from(hidden).toString("latin1")).not.toContain("/JavaScript");
    const result = judge(hidden);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/inside a compressed stream/u);
    const clean = pdfWithFlateStream("<< /Type /Page /Contents 4 0 R >> BT /F1 12 Tf (Hello) Tj ET");
    expect(judge(clean)).toEqual({ ok: true, reasons: [] });
  });

  it("refuses what it cannot read: encrypted files and streams that will not inflate", () => {
    const encrypted = Buffer.from("%PDF-1.4\ntrailer << /Encrypt 5 0 R /Root 1 0 R >>\n%%EOF\n", "latin1");
    expect(judge(encrypted).reasons).toContain("PDF is encrypted; upload an unencrypted file");
    const opaque = Buffer.from("%PDF-1.4\n1 0 obj << /Filter /FlateDecode /Length 9 >>\nstream\nnot-zlib!\nendstream\nendobj\n%%EOF\n", "latin1");
    expect(judge(opaque).reasons.join(" ")).toMatch(/could not be inspected/u);
    expect(inflatedPdfStreams(opaque)).toMatchObject({ opaqueStreams: 1, truncated: false });
  });

  it("names the marker it found so an operator can fix the file", () => {
    const result = judge(Buffer.from("%PDF-1.4\n1 0 obj << /Type /Annot /AA << /E 3 0 R >> >> endobj\n%%EOF\n", "latin1"));
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatch(/\(\/AA:/u);
  });
});

describe("an idempotency key is bound to one file", () => {
  it("replays the same file, but refuses the same key with different bytes or a different name", async () => {
    const h = harness();
    const first = await h.service.createVersion(ADMIN, upload(), file());
    expect(first.ok).toBe(true);
    const replay = await h.service.createVersion(ADMIN, upload({ title: "Different title, same file and key" }), file());
    expect(replay.ok && replay.resource.versions).toHaveLength(1);
    const otherBytes = Buffer.from(PDF.toString("latin1") + "% trailing comment\n", "latin1");
    expect(await h.service.createVersion(ADMIN, upload(), file(otherBytes))).toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect(await h.service.createVersion(ADMIN, upload({ originalFilename: "renamed.pdf" }), file())).toMatchObject({ ok: false, code: "resource_state_conflict" });
    expect((await h.service.listAdmin())[0]!.versions).toHaveLength(1);
    expect(h.bytes.keys()).toHaveLength(1);
  });
});
