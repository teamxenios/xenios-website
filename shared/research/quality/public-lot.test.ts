import { describe, expect, it } from "vitest";
import {
  normalizePublicLotCode,
  publicLotApiResponseSchema,
  publicLotDocumentPath,
  publicLotSourceRecordSchema,
} from "./public-lot";

const documentId = "11111111-1111-4111-8111-111111111111";
const publicationRevisionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const metadataApprovalId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const downloadApprovalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceRecord = {
  lotCode: "LOT-ALPHA-01",
  productName: "Reference material alpha",
  variantLabel: "5 mg vial",
  sourceLabel: "Xenios approved quality record",
  status: "released" as const,
  statusAsOf: "2026-08-27T18:00:00.000Z",
  approvedForPublicAt: "2026-08-27T18:05:00.000Z",
  publicationRevisionId,
  documents: [
    {
      documentId,
      title: "Certificate of analysis",
      sourceLabel: "Independent laboratory record",
      documentType: "certificate_of_analysis" as const,
      status: "available" as const,
      statusAsOf: "2026-08-27T18:01:00.000Z",
      issuedAt: "2026-08-26T18:00:00.000Z",
      reviewedAt: "2026-08-27T18:00:00.000Z",
      metadataApprovedForPublicAt: "2026-08-27T18:05:00.000Z",
      metadataApprovalId,
      downloadApprovedForPublicAt: "2026-08-27T18:06:00.000Z",
      downloadApprovalId,
      testCategories: ["identity", "purity"] as const,
    },
  ],
};

const {
  publicationRevisionId: _privatePublicationRevisionId,
  documents: sourceDocuments,
  ...publicRecord
} = sourceRecord;
const publicResponse = {
  kind: "ok" as const,
  lot: {
    ...publicRecord,
    documents: sourceDocuments.map((document) => {
      const {
        metadataApprovalId: _privateMetadataApprovalId,
        downloadApprovalId: _privateDownloadApprovalId,
        ...publicDocument
      } = document;
      return {
        ...publicDocument,
        downloadPath: publicLotDocumentPath(sourceRecord.lotCode, document.documentId),
      };
    }),
  },
};

describe("public exact-lot contract", () => {
  it("normalizes only bounded ASCII lot codes", () => {
    expect(normalizePublicLotCode(" lot-alpha-01 ")).toBe("LOT-ALPHA-01");
    for (const invalid of [
      "ab",
      "LOT/ALPHA",
      "LOT\\ALPHA",
      "../PRIVATE",
      "ＬＯＴ-１",
      "LOT-ΑLPHA",
      "lot-ſample",
      "lot-ıd",
      "lot-straße",
      "LOT\u0000ALPHA",
      `LOT-${"A".repeat(64)}`,
    ]) expect(normalizePublicLotCode(invalid)).toBeNull();
  });

  it("rejects duplicate documents, private fields, and source URLs or storage paths", () => {
    expect(publicLotSourceRecordSchema.safeParse({
      ...sourceRecord,
      documents: [...sourceRecord.documents, sourceRecord.documents[0]],
    }).success).toBe(false);
    expect(publicLotSourceRecordSchema.safeParse({
      ...sourceRecord,
      documents: [
        sourceRecord.documents[0],
        {
          ...sourceRecord.documents[0],
          documentId: "22222222-2222-4222-8222-222222222222",
          metadataApprovalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      ],
    }).success).toBe(false);
    expect(publicLotSourceRecordSchema.safeParse({
      ...sourceRecord,
      documents: [
        sourceRecord.documents[0],
        {
          ...sourceRecord.documents[0],
          documentId: "22222222-2222-4222-8222-222222222222",
          downloadApprovalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        },
      ],
    }).success).toBe(false);
    expect(publicLotSourceRecordSchema.safeParse({
      ...sourceRecord,
      privateStorageKey: "private/coa/lot-alpha.pdf",
    }).success).toBe(false);
    for (const privateField of ["storageKey", "signedUrl", "uploadUrl"]) {
      expect(publicLotSourceRecordSchema.safeParse({
        ...sourceRecord,
        documents: [{ ...sourceRecord.documents[0], [privateField]: "HOSTILE_PRIVATE_MARKER" }],
      }).success).toBe(false);
    }
    for (const sourceLabel of [
      "https://storage.example/private",
      "s3://private-bucket/object",
      "s3:private-bucket/key",
      "arn:aws:s3:::private-bucket/key",
      "/api/private/document",
      "/private",
      "private\\share",
      "private/coa/lot.pdf",
      "lots/11111111-1111-4111-8111-111111111111/coa.pdf",
      "bucket/object.pdf",
      "/tmp/file.pdf",
      "C:/Users/private/coa.pdf",
      "private%2Fcoa%2Flot.pdf",
    ]) {
      expect(publicLotSourceRecordSchema.safeParse({
        ...sourceRecord,
        sourceLabel,
      }).success).toBe(false);
    }
    expect(publicLotSourceRecordSchema.safeParse({
      ...sourceRecord,
      sourceLabel: "TÜV SÜD & Mérieux Quality, Inc. (EU)",
    }).success).toBe(true);
  });

  it("binds publication approval to the displayed record and document revisions", () => {
    const invalidDocuments = [
      { ...sourceRecord.documents[0], metadataApprovedForPublicAt: null },
      { ...sourceRecord.documents[0], metadataApprovalId: null },
      { ...sourceRecord.documents[0], downloadApprovedForPublicAt: null },
      { ...sourceRecord.documents[0], downloadApprovalId: null },
      { ...sourceRecord.documents[0], issuedAt: null },
      { ...sourceRecord.documents[0], reviewedAt: null },
      {
        ...sourceRecord.documents[0],
        status: "pending" as const,
        downloadApprovedForPublicAt: sourceRecord.documents[0].downloadApprovedForPublicAt,
      },
      {
        ...sourceRecord.documents[0],
        statusAsOf: "2026-08-27T18:07:00.000Z",
      },
      {
        ...sourceRecord.documents[0],
        testCategories: ["identity", "identity"],
      },
    ];
    for (const document of invalidDocuments) {
      expect(publicLotSourceRecordSchema.safeParse({
        ...sourceRecord,
        documents: [document],
      }).success).toBe(false);
    }
    expect(publicLotSourceRecordSchema.safeParse({
      ...sourceRecord,
      statusAsOf: "2026-08-27T18:06:00.000Z",
    }).success).toBe(false);
  });

  it("requires public metadata approval and exposes a same-origin path only for available documents", () => {
    expect(publicLotApiResponseSchema.safeParse(publicResponse).success).toBe(true);
    expect(JSON.stringify(publicResponse)).not.toContain("publicationRevisionId");
    expect(JSON.stringify(publicResponse)).not.toContain("metadataApprovalId");
    expect(JSON.stringify(publicResponse)).not.toContain("downloadApprovalId");
    expect(publicLotApiResponseSchema.safeParse({
      ...publicResponse,
      lot: {
        ...publicResponse.lot,
        documents: [{
          ...publicResponse.lot.documents[0],
          downloadPath: "https://storage.example/private",
        }],
      },
    }).success).toBe(false);

    for (const status of ["pending", "replaced", "withdrawn", "expired", "missing"] as const) {
      const approvedMetadataOnly = {
        ...publicResponse.lot.documents[0],
        status,
        downloadApprovedForPublicAt: null,
        downloadPath: null,
      };
      expect(publicLotApiResponseSchema.safeParse({
        ...publicResponse,
        lot: { ...publicResponse.lot, documents: [approvedMetadataOnly] },
      }).success).toBe(true);
      expect(publicLotApiResponseSchema.safeParse({
        ...publicResponse,
        lot: {
          ...publicResponse.lot,
          documents: [{ ...approvedMetadataOnly, downloadPath: publicResponse.lot.documents[0].downloadPath }],
        },
      }).success).toBe(false);
      expect(publicLotApiResponseSchema.safeParse({
        ...publicResponse,
        lot: {
          ...publicResponse.lot,
          documents: [{ ...approvedMetadataOnly, metadataApprovedForPublicAt: null }],
        },
      }).success).toBe(false);
    }

    expect(publicLotApiResponseSchema.safeParse({
      ...publicResponse,
      lot: {
        ...publicResponse.lot,
        documents: [{
          ...publicResponse.lot.documents[0],
          downloadPath: publicLotDocumentPath("LOT-OTHER-01", documentId),
        }],
      },
    }).success).toBe(false);
  });

  it("keeps complete, partial, unavailable, rate-limited, and not-found states distinct", () => {
    expect(publicLotApiResponseSchema.parse(publicResponse).kind).toBe("ok");
    expect(publicLotApiResponseSchema.parse({
      kind: "partial",
      code: "quality_source_partial",
      message: "Only part of the approved source is available.",
      incomplete: ["documents"],
      lot: publicResponse.lot,
    }).kind).toBe("partial");
    expect(publicLotApiResponseSchema.parse({
      kind: "unavailable",
      code: "public_quality_guard_unavailable",
      message: "Public lot verification is temporarily unavailable.",
    }).kind).toBe("unavailable");
    expect(publicLotApiResponseSchema.parse({
      kind: "rate_limited",
      code: "public_quality_rate_limited",
      message: "Public verification is temporarily busy.",
    }).kind).toBe("rate_limited");
    expect(publicLotApiResponseSchema.parse({
      kind: "not_found",
      code: "public_lot_not_found",
      message: "No approved public lot record was found.",
    }).kind).toBe("not_found");
  });
});
