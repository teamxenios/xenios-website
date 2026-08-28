import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  DisabledPublicLotSource,
  PUBLIC_LOT_DOCUMENT_ROUTE,
  PUBLIC_LOT_ROUTE,
  PUBLIC_QUALITY_DOCUMENT_MAX_BYTES,
  registerPublicQualityApi,
  type PublicLotSource,
  type PublicQualityApiDependencies,
  type PublicQualityAuditEvent,
} from "./public-lot-api";

const NOW = Date.parse("2026-08-28T04:30:00.000Z");
const LOT = "LOT-ALPHA-01";
const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const PUBLICATION_REVISION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const METADATA_APPROVAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOWNLOAD_APPROVAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOOKUP_URL = `/api/research/quality/lots/${LOT}`;
const documentUrl = (id = DOCUMENT_ID) => `${LOOKUP_URL}/documents/${id}`;

const record = {
  lotCode: LOT,
  productName: "Reference material alpha",
  variantLabel: "5 mg vial",
  sourceLabel: "Xenios approved quality record",
  status: "released" as const,
  statusAsOf: "2026-08-27T18:00:00.000Z",
  approvedForPublicAt: "2026-08-27T18:05:00.000Z",
  publicationRevisionId: PUBLICATION_REVISION_ID,
  documents: [{
    documentId: DOCUMENT_ID,
    title: "Certificate of analysis",
    sourceLabel: "Independent laboratory record",
    documentType: "certificate_of_analysis" as const,
    status: "available" as const,
    statusAsOf: "2026-08-27T18:01:00.000Z",
    issuedAt: "2026-08-26T18:00:00.000Z",
    reviewedAt: "2026-08-27T18:00:00.000Z",
    metadataApprovedForPublicAt: "2026-08-27T18:05:00.000Z",
    metadataApprovalId: METADATA_APPROVAL_ID,
    downloadApprovedForPublicAt: "2026-08-27T18:06:00.000Z",
    downloadApprovalId: DOWNLOAD_APPROVAL_ID,
    testCategories: ["identity", "purity"] as const,
  }],
};

const allow: RequestHandler = (_req, _res, next) => next();
const pdfBytes = new TextEncoder().encode("%PDF-1.7\n% public test file");

function buildApp(options: {
  source?: PublicLotSource;
  lookup?: PublicLotSource["lookupPublicLot"];
  read?: PublicLotSource["readApprovedPublicDocument"];
  guard?: RequestHandler;
  audit?: PublicQualityApiDependencies["auditPublicRead"];
  resolveNow?: PublicQualityApiDependencies["resolveNow"];
  timeoutMs?: number;
} = {}) {
  const lookupImplementation: PublicLotSource["lookupPublicLot"] =
    options.lookup ?? (async () => ({ kind: "available", record }));
  const readImplementation: PublicLotSource["readApprovedPublicDocument"] =
    options.read ?? (async () => ({
      kind: "available",
      bytes: pdfBytes,
      contentType: "application/pdf" as const,
    }));
  const lookup = vi.fn(lookupImplementation);
  const read = vi.fn(readImplementation);
  const events: PublicQualityAuditEvent[] = [];
  const audit = vi.fn(options.audit ?? (async (event: PublicQualityAuditEvent) => {
    events.push(event);
  }));
  const resolveNow = vi.fn(options.resolveNow ?? (async () => ({
    kind: "available" as const,
    nowMs: NOW,
  })));
  const app = express();
  registerPublicQualityApi(app, {
    source: options.source ?? { lookupPublicLot: lookup, readApprovedPublicDocument: read },
    publicReadGuard: options.guard ?? allow,
    auditPublicRead: audit,
    resolveNow,
    dependencyTimeoutMs: options.timeoutMs ?? 30,
  });
  return { app, lookup, read, audit, resolveNow, events };
}

function expectNoStore(headers: Record<string, string | undefined>): void {
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers.pragma).toBe("no-cache");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
}

function expectAbortedSignal(signal: AbortSignal | null): void {
  expect(signal).not.toBeNull();
  expect((signal as AbortSignal).aborted).toBe(true);
}

describe("public exact-lot quality API", () => {
  it("pins routes and refuses incomplete authority construction", () => {
    expect(PUBLIC_LOT_ROUTE).toBe("/api/research/quality/lots/:lotCode");
    expect(PUBLIC_LOT_DOCUMENT_ROUTE).toBe("/api/research/quality/lots/:lotCode/documents/:documentId");
    expect(() => registerPublicQualityApi(undefined as never, undefined as never)).toThrow(/Express app/);
    expect(() => registerPublicQualityApi(express(), undefined as never)).toThrow(/dependencies/);
    expect(() => registerPublicQualityApi(express(), {
      source: {} as never,
      publicReadGuard: allow,
      auditPublicRead: async () => undefined,
      resolveNow: async () => ({ kind: "unavailable" }),
    })).toThrow(/constructed public lot source/);
    expect(() => registerPublicQualityApi(express(), {
      source: new DisabledPublicLotSource(),
      publicReadGuard: allow,
      auditPublicRead: async () => undefined,
    } as never)).toThrow(/authoritative clock/);
    expect(() => registerPublicQualityApi(express(), {
      source: new DisabledPublicLotSource(),
      publicReadGuard: allow,
      auditPublicRead: async () => undefined,
      resolveNow: async () => ({ kind: "unavailable" }),
      dependencyTimeoutMs: 0,
    })).toThrow(/dependencyTimeoutMs/);
  });

  it("lets the supplied public-read guard reject without touching source, time, or audit", async () => {
    const blocked: RequestHandler = (_req, res) => res.status(429).json({
      kind: "rate_limited",
      code: "public_quality_rate_limited",
      message: "Public verification is temporarily busy.",
    });
    const harness = buildApp({ guard: blocked });
    const response = await request(harness.app).get(LOOKUP_URL);
    expect(response.status).toBe(429);
    expect(harness.lookup).not.toHaveBeenCalled();
    expect(harness.read).not.toHaveBeenCalled();
    expect(harness.resolveNow).not.toHaveBeenCalled();
    expect(harness.audit).not.toHaveBeenCalled();
  });

  it("rejects malformed inputs without source calls or reflecting hostile text", async () => {
    const harness = buildApp();
    for (const url of [
      "/api/research/quality/lots/ab",
      "/api/research/quality/lots/LOT%5CPRIVATE",
      documentUrl("not-a-uuid"),
      documentUrl("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase()),
    ]) {
      const response = await request(harness.app).get(url);
      expect([400, 404]).toContain(response.status);
      expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|not-a-uuid/i);
      expectNoStore(response.headers);
    }
    expect(harness.lookup).not.toHaveBeenCalled();
    expect(harness.read).not.toHaveBeenCalled();
  });

  it("keeps authoritative not-found distinct from disabled, unavailable, malformed, mismatched, and thrown sources", async () => {
    const missing = buildApp({ lookup: async () => ({ kind: "available", record: null }) });
    expect((await request(missing.app).get(LOOKUP_URL)).status).toBe(404);
    expect(missing.events.at(-1)?.outcome).toBe("not_found");

    const disabled = buildApp({ source: new DisabledPublicLotSource() });
    expect((await request(disabled.app).get(LOOKUP_URL)).status).toBe(503);

    const cases: Array<PublicLotSource["lookupPublicLot"]> = [
      async () => ({ kind: "unavailable", reason: "dependency_unavailable" }),
      async () => ({ kind: "available", record: { ...record, lotCode: "LOT-OTHER-01" } }),
      async () => ({ kind: "available", record: { ...record, storageKey: "HOSTILE_PRIVATE_MARKER" } }),
      async () => ({ kind: "stale", record } as never),
      async () => ({ kind: "available", record, unexpected: "HOSTILE_EXTRA_FIELD" } as never),
      async () => ({ kind: "partial", incomplete: ["documents"], record, unexpected: true } as never),
      async () => ({ kind: "unavailable", reason: "unsupported" } as never),
      async () => { throw new Error("HOSTILE_UPSTREAM_PRIVATE_MARKER"); },
    ];
    for (const lookup of cases) {
      const harness = buildApp({ lookup });
      const response = await request(harness.app).get(LOOKUP_URL);
      expect(response.status).toBe(503);
      expect(response.body.kind).toBe("unavailable");
      expect(JSON.stringify(response.body)).not.toMatch(/HOSTILE|storage|supplier/i);
      expectNoStore(response.headers);
    }
  });

  it("returns complete or partial runtime availability without turning partial emptiness into not-found", async () => {
    const complete = buildApp();
    const completeResponse = await request(complete.app).get(LOOKUP_URL);
    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.kind).toBe("ok");
    expect(complete.events.at(-1)?.outcome).toBe("granted");

    const partial = buildApp({
      lookup: async () => ({ kind: "partial", incomplete: ["documents"] as const, record: { ...record, documents: [] } }),
    });
    const partialResponse = await request(partial.app).get(LOOKUP_URL);
    expect(partialResponse.status).toBe(200);
    expect(partialResponse.body.kind).toBe("partial");
    expect(partialResponse.body.incomplete).toEqual(["documents"]);
    expect(partialResponse.body.lot.documents).toEqual([]);
    expect(partial.events.at(-1)?.outcome).toBe("partial");

    for (const lookup of [
      async () => ({ kind: "partial", record } as never),
      async () => ({ kind: "partial", incomplete: ["status"], record } as never),
    ]) {
      const malformed = buildApp({ lookup });
      const response = await request(malformed.app).get(LOOKUP_URL);
      expect(response.status).toBe(503);
      expect(response.body.kind).toBe("unavailable");
    }
  });

  it("projects only explicitly approved metadata and preserves approved expired/missing states without download paths", async () => {
    const expired = {
      ...record.documents[0],
      documentId: OTHER_DOCUMENT_ID,
      title: "Superseded quality summary",
      status: "expired" as const,
      metadataApprovalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      downloadApprovedForPublicAt: null,
      downloadApprovalId: null,
    };
    const unapproved = {
      ...record.documents[0],
      documentId: "33333333-3333-4333-8333-333333333333",
      title: "HOSTILE_UNAPPROVED_METADATA",
      status: "pending" as const,
      metadataApprovedForPublicAt: null,
      metadataApprovalId: null,
      downloadApprovedForPublicAt: null,
      downloadApprovalId: null,
    };
    const harness = buildApp({
      lookup: async () => ({
        kind: "available",
        record: { ...record, documents: [...record.documents, expired, unapproved] },
      }),
    });
    const response = await request(harness.app).get(LOOKUP_URL);
    expect(response.status).toBe(200);
    expect(response.body.lot.sourceLabel).toBe(record.sourceLabel);
    expect(response.body.lot.documents).toHaveLength(2);
    expect(response.body.lot.documents[0].downloadPath).toBe(documentUrl());
    expect(response.body.lot.documents[1]).toMatchObject({
      status: "expired",
      downloadPath: null,
      sourceLabel: expired.sourceLabel,
    });
    expect(JSON.stringify(response.body)).not.toContain(PUBLICATION_REVISION_ID);
    expect(JSON.stringify(response.body)).not.toContain(METADATA_APPROVAL_ID);
    expect(JSON.stringify(response.body)).not.toContain(DOWNLOAD_APPROVAL_ID);
    expect(JSON.stringify(response.body)).not.toContain("publicationRevisionId");
    expect(JSON.stringify(response.body)).not.toContain("metadataApprovalId");
    expect(JSON.stringify(response.body)).not.toContain("downloadApprovalId");
    expect(JSON.stringify(response.body)).not.toContain("HOSTILE_UNAPPROVED_METADATA");
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|signedUrl|uploadUrl/i);
  });

  it("fails closed when the authoritative clock is missing, malformed, hanging, or any public approval is future-dated", async () => {
    let clockSignal: AbortSignal | null = null;
    const timeCases: Array<PublicQualityApiDependencies["resolveNow"]> = [
      async () => ({ kind: "unavailable" }),
      async () => ({ kind: "available", nowMs: Number.NaN }),
      async (signal) => {
        clockSignal = signal;
        return new Promise(() => undefined);
      },
    ];
    for (const resolveNow of timeCases) {
      const harness = buildApp({ resolveNow, timeoutMs: 5 });
      expect((await request(harness.app).get(LOOKUP_URL)).status).toBe(503);
      expect(harness.lookup).not.toHaveBeenCalled();
    }
    expectAbortedSignal(clockSignal);

    for (const futureRecord of [
      { ...record, approvedForPublicAt: "2099-01-01T00:00:00.000Z" },
      {
        ...record,
        statusAsOf: "2099-01-01T00:00:00.000Z",
        approvedForPublicAt: "2099-01-01T00:00:01.000Z",
      },
      {
        ...record,
        documents: [{
          ...record.documents[0],
          statusAsOf: "2099-01-01T00:00:00.000Z",
          metadataApprovedForPublicAt: "2099-01-01T00:00:01.000Z",
          downloadApprovedForPublicAt: "2099-01-01T00:00:02.000Z",
        }],
      },
      {
        ...record,
        documents: [{
          ...record.documents[0],
          issuedAt: "2099-01-01T00:00:00.000Z",
          reviewedAt: "2099-01-01T00:00:01.000Z",
          statusAsOf: "2099-01-01T00:00:02.000Z",
          metadataApprovedForPublicAt: "2099-01-01T00:00:03.000Z",
          downloadApprovedForPublicAt: "2099-01-01T00:00:04.000Z",
        }],
      },
      {
        ...record,
        documents: [{
          ...record.documents[0],
          reviewedAt: "2099-01-01T00:00:00.000Z",
          statusAsOf: "2099-01-01T00:00:01.000Z",
          metadataApprovedForPublicAt: "2099-01-01T00:00:02.000Z",
          downloadApprovedForPublicAt: "2099-01-01T00:00:03.000Z",
        }],
      },
      {
        ...record,
        documents: [{
          ...record.documents[0],
          status: "pending" as const,
          metadataApprovedForPublicAt: "2099-01-01T00:00:00.000Z",
          downloadApprovedForPublicAt: null,
          downloadApprovalId: null,
        }],
      },
      {
        ...record,
        documents: [{
          ...record.documents[0],
          downloadApprovedForPublicAt: "2099-01-01T00:00:00.000Z",
        }],
      },
    ]) {
      const harness = buildApp({
        lookup: async () => ({ kind: "available", record: futureRecord }),
      });
      expect((await request(harness.app).get(LOOKUP_URL)).status).toBe(503);
    }
  });

  it("does not read bytes for pending, replaced, withdrawn, expired, missing, or foreign documents", async () => {
    for (const status of ["pending", "replaced", "withdrawn", "expired", "missing"] as const) {
      const statusRecord = {
        ...record,
        documents: [{
          ...record.documents[0],
          status,
          downloadApprovedForPublicAt: null,
          downloadApprovalId: null,
        }],
      };
      const harness = buildApp({ lookup: async () => ({ kind: "available", record: statusRecord }) });
      expect((await request(harness.app).get(documentUrl())).status).toBe(404);
      expect(harness.read).not.toHaveBeenCalled();
    }
    const foreign = buildApp();
    expect((await request(foreign.app).get(documentUrl(OTHER_DOCUMENT_ID))).status).toBe(404);
    expect(foreign.read).not.toHaveBeenCalled();
  });

  it("does not turn a missing document in a partial source into authoritative not-found", async () => {
    const harness = buildApp({
      lookup: async () => ({ kind: "partial", incomplete: ["documents"] as const, record: { ...record, documents: [] } }),
    });
    const response = await request(harness.app).get(documentUrl());
    expect(response.status).toBe(503);
    expect(response.body.kind).toBe("unavailable");
    expect(harness.events.at(-1)?.outcome).toBe("unavailable");
    expect(harness.read).not.toHaveBeenCalled();
  });

  it("requires the source to enforce the byte cap and serves only an audited PDF attachment", async () => {
    const harness = buildApp();
    const response = await request(harness.app).get(documentUrl()).buffer(true);
    expect(response.status).toBe(200);
    expect(harness.read).toHaveBeenCalledWith(expect.objectContaining({
      lotCode: LOT,
      documentId: DOCUMENT_ID,
      expectedPublication: {
        lotPublicationRevisionId: PUBLICATION_REVISION_ID,
        lotApprovedAt: record.approvedForPublicAt,
        documentMetadataApprovalId: METADATA_APPROVAL_ID,
        metadataApprovedAt: record.documents[0].metadataApprovedForPublicAt,
        documentDownloadApprovalId: DOWNLOAD_APPROVAL_ID,
        downloadApprovedAt: record.documents[0].downloadApprovedForPublicAt,
        documentStatusAsOf: record.documents[0].statusAsOf,
      },
      maxBytes: PUBLIC_QUALITY_DOCUMENT_MAX_BYTES,
      signal: expect.any(AbortSignal),
    }));
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(response.headers["content-disposition"]).toBe(`attachment; filename="${LOT}-${DOCUMENT_ID}.pdf"`);
    expect(response.headers["content-security-policy"]).toBe("sandbox; default-src 'none'");
    expect(harness.events.at(-1)).toEqual({ action: "document_read", outcome: "granted", lotCode: LOT, documentId: DOCUMENT_ID });
    expectNoStore(response.headers);
  });

  it("snapshots approved PDF bytes before audit so later source mutation cannot change the response", async () => {
    const mutableBytes = new TextEncoder().encode("%PDF-1.7\n% immutable response snapshot");
    const expectedBytes = Buffer.from(mutableBytes);
    let mutatedDuringAudit = false;
    const harness = buildApp({
      read: async () => ({
        kind: "available",
        bytes: mutableBytes,
        contentType: "application/pdf",
      }),
      audit: async (event) => {
        if (event.action === "document_read" && event.outcome === "granted") {
          mutableBytes.fill(0x58);
          mutatedDuringAudit = true;
        }
      },
    });

    const response = await request(harness.app).get(documentUrl()).buffer(true);
    expect(response.status).toBe(200);
    expect(mutatedDuringAudit).toBe(true);
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.equals(expectedBytes)).toBe(true);
  });

  it("keeps missing public bytes distinct from a document-source outage", async () => {
    const missing = buildApp({ read: async () => ({ kind: "not_found" }) });
    const missingResponse = await request(missing.app).get(documentUrl());
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.body.code).toBe("public_document_not_found");
    expect(missingResponse.body.message).not.toMatch(/lot record was found/i);
    expect(missing.events.at(-1)?.outcome).toBe("not_found");

    const outage = buildApp({
      read: async () => ({ kind: "unavailable", reason: "dependency_unavailable" }),
    });
    expect((await request(outage.app).get(documentUrl())).status).toBe(503);
    expect(outage.events.at(-1)?.outcome).toBe("unavailable");
  });

  it("fails closed when atomic publication reauthorization reports a revision mismatch", async () => {
    const reauthorize = vi.fn<PublicLotSource["readApprovedPublicDocument"]>(async (input) => {
      expect(input.expectedPublication).toEqual({
        lotPublicationRevisionId: PUBLICATION_REVISION_ID,
        lotApprovedAt: record.approvedForPublicAt,
        documentMetadataApprovalId: METADATA_APPROVAL_ID,
        metadataApprovedAt: record.documents[0].metadataApprovedForPublicAt,
        documentDownloadApprovalId: DOWNLOAD_APPROVAL_ID,
        downloadApprovedAt: record.documents[0].downloadApprovedForPublicAt,
        documentStatusAsOf: record.documents[0].statusAsOf,
      });
      return { kind: "unavailable", reason: "dependency_unavailable" };
    });
    const harness = buildApp({ read: reauthorize });

    const response = await request(harness.app).get(documentUrl());
    expect(response.status).toBe(503);
    expect(response.body.kind).toBe("unavailable");
    expect(reauthorize).toHaveBeenCalledOnce();
    expect(harness.events.at(-1)?.outcome).toBe("unavailable");
  });

  it("bounds hung source, byte, and audit authorities and aborts their signals", async () => {
    let lookupSignal: AbortSignal | null = null;
    const hungLookup = buildApp({
      timeoutMs: 5,
      lookup: async (_lotCode, options) => {
        lookupSignal = options.signal;
        return new Promise(() => undefined);
      },
    });
    expect((await request(hungLookup.app).get(LOOKUP_URL)).status).toBe(503);
    expectAbortedSignal(lookupSignal);

    let readSignal: AbortSignal | null = null;
    const hungRead = buildApp({
      timeoutMs: 5,
      read: async (input) => {
        readSignal = input.signal;
        return new Promise(() => undefined);
      },
    });
    expect((await request(hungRead.app).get(documentUrl())).status).toBe(503);
    expectAbortedSignal(readSignal);

    let auditSignal: AbortSignal | null = null;
    const hungAudit = buildApp({
      timeoutMs: 5,
      audit: async (_event, signal) => {
        auditSignal = signal;
        return new Promise(() => undefined);
      },
    });
    expect((await request(hungAudit.app).get(LOOKUP_URL)).status).toBe(503);
    expectAbortedSignal(auditSignal);
  });

  it("fails closed for invalid bytes, over-cap bytes, thrown storage, and audit failure", async () => {
    const invalidReads: Array<PublicLotSource["readApprovedPublicDocument"]> = [
      async () => ({ kind: "available", bytes: new Uint8Array(), contentType: "application/pdf" }),
      async () => ({ kind: "available", bytes: new TextEncoder().encode("NOT A PDF"), contentType: "application/pdf" }),
      async () => ({ kind: "available", bytes: new Uint8Array(PUBLIC_QUALITY_DOCUMENT_MAX_BYTES + 1), contentType: "application/pdf" }),
      async () => ({ kind: "stale", bytes: pdfBytes, contentType: "application/pdf" } as never),
      async () => ({ kind: "available", bytes: pdfBytes, contentType: "application/pdf", storageKey: "HOSTILE_EXTRA_FIELD" } as never),
      async () => ({ kind: "not_found", unexpected: true } as never),
      async () => ({ kind: "unavailable", reason: "unsupported" } as never),
      async () => { throw new Error("HOSTILE_STORAGE_ERROR"); },
    ];
    for (const read of invalidReads) {
      const harness = buildApp({ read });
      const response = await request(harness.app).get(documentUrl());
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toMatch(/HOSTILE|storage/i);
    }

    const auditFailure = buildApp({ audit: async () => { throw new Error("audit unavailable"); } });
    expect((await request(auditFailure.app).get(LOOKUP_URL)).status).toBe(503);
    const deniedDocument = await request(auditFailure.app).get(documentUrl());
    expect(deniedDocument.status).toBe(503);
    expect(deniedDocument.headers["content-type"]).toMatch(/^application\/json/);
  });
});
