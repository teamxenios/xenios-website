import { z } from "zod";

export const PUBLIC_LOT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;
const PUBLIC_LOT_CODE_INPUT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

export function normalizePublicLotCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!PUBLIC_LOT_CODE_INPUT_PATTERN.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

const publicText = (max: number) => z.string().trim().min(1).max(max);
const publicInstant = z.string().datetime({ offset: true });
const safeSourceLabel = publicText(160).regex(
  /^[\p{L}\p{N}][\p{L}\p{N} .,&'()®™+\-]{0,159}$/u,
  "sourceLabel must be a human-readable display label without URL or path syntax",
);
const canonicalUuid = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase(), "identifier must be a canonical UUID");

export const publicQualityTestCategorySchema = z.enum([
  "identity",
  "purity",
  "assay_or_content",
  "sterility",
  "endotoxin",
  "microbial",
  "heavy_metals",
  "residual_solvents",
  "other",
]);

export const publicLotStatusSchema = z.enum([
  "released",
  "quarantined",
  "held",
  "documentation_pending",
  "withdrawn",
]);

export const publicLotDocumentStatusSchema = z.enum([
  "available",
  "pending",
  "replaced",
  "withdrawn",
  "expired",
  "missing",
]);

export const publicLotDocumentTypeSchema = z.enum([
  "certificate_of_analysis",
  "identity_report",
  "quality_summary",
  "other",
]);

const publicLotSourceDocumentObjectSchema = z
  .object({
    documentId: canonicalUuid,
    title: publicText(120),
    sourceLabel: safeSourceLabel,
    documentType: publicLotDocumentTypeSchema,
    status: publicLotDocumentStatusSchema,
    statusAsOf: publicInstant,
    issuedAt: publicInstant.nullable(),
    reviewedAt: publicInstant.nullable(),
    metadataApprovedForPublicAt: publicInstant.nullable(),
    metadataApprovalId: canonicalUuid.nullable(),
    downloadApprovedForPublicAt: publicInstant.nullable(),
    downloadApprovalId: canonicalUuid.nullable(),
    testCategories: z.array(publicQualityTestCategorySchema).max(12),
  })
  .strict();

type SourceDocument = z.infer<typeof publicLotSourceDocumentObjectSchema>;
type ApprovalDocument = Omit<SourceDocument, "metadataApprovalId" | "downloadApprovalId"> & {
  metadataApprovalId?: string | null;
  downloadApprovalId?: string | null;
};

function parsedTime(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function validatePublicDocumentApproval(
  document: ApprovalDocument,
  context: z.RefinementCtx,
): void {
  if (new Set(document.testCategories).size !== document.testCategories.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "test categories must be unique",
      path: ["testCategories"],
    });
  }

  const statusAt = parsedTime(document.statusAsOf)!;
  const issuedAt = parsedTime(document.issuedAt);
  const reviewedAt = parsedTime(document.reviewedAt);
  const metadataApprovedAt = parsedTime(document.metadataApprovedForPublicAt);
  const downloadApprovedAt = parsedTime(document.downloadApprovedForPublicAt);

  if (reviewedAt !== null && issuedAt === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "a reviewed document requires an issue date",
      path: ["issuedAt"],
    });
  }
  if (issuedAt !== null && reviewedAt !== null && reviewedAt < issuedAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "reviewedAt cannot predate issuedAt",
      path: ["reviewedAt"],
    });
  }
  if ((issuedAt !== null && statusAt < issuedAt) || (reviewedAt !== null && statusAt < reviewedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "statusAsOf must cover the displayed document revision",
      path: ["statusAsOf"],
    });
  }
  if (metadataApprovedAt !== null && metadataApprovedAt < statusAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "metadata approval cannot predate the displayed status",
      path: ["metadataApprovedForPublicAt"],
    });
  }
  if (downloadApprovedAt !== null && metadataApprovedAt === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "download approval requires metadata approval",
      path: ["metadataApprovedForPublicAt"],
    });
  }
  if (
    "metadataApprovalId" in document
    && (document.metadataApprovalId === null) !== (metadataApprovedAt === null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "metadata approval ID and timestamp must be present or absent together",
      path: ["metadataApprovalId"],
    });
  }
  if (
    "downloadApprovalId" in document
    && (document.downloadApprovalId === null) !== (downloadApprovedAt === null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "download approval ID and timestamp must be present or absent together",
      path: ["downloadApprovalId"],
    });
  }
  if (downloadApprovedAt !== null && metadataApprovedAt !== null && downloadApprovedAt < metadataApprovedAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "download approval cannot predate metadata approval",
      path: ["downloadApprovedForPublicAt"],
    });
  }

  if (document.status === "available") {
    if (issuedAt === null || reviewedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "available documents require issue and review dates",
        path: [issuedAt === null ? "issuedAt" : "reviewedAt"],
      });
    }
    if (metadataApprovedAt === null || downloadApprovedAt === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "available documents require explicit metadata and download approval",
        path: [metadataApprovedAt === null ? "metadataApprovedForPublicAt" : "downloadApprovedForPublicAt"],
      });
    }
    if ("metadataApprovalId" in document && document.metadataApprovalId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "available documents require an immutable metadata approval ID",
        path: ["metadataApprovalId"],
      });
    }
    if ("downloadApprovalId" in document && document.downloadApprovalId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "available documents require an immutable download approval ID",
        path: ["downloadApprovalId"],
      });
    }
  } else if (downloadApprovedAt !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "unavailable documents cannot claim download approval",
      path: ["downloadApprovedForPublicAt"],
    });
  } else if ("downloadApprovalId" in document && document.downloadApprovalId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "unavailable documents cannot retain a download approval ID",
      path: ["downloadApprovalId"],
    });
  }
}

export const publicLotSourceDocumentSchema = publicLotSourceDocumentObjectSchema
  .superRefine(validatePublicDocumentApproval);

const publicLotSourceRecordObjectSchema = z
  .object({
    lotCode: z.string().regex(PUBLIC_LOT_CODE_PATTERN),
    productName: publicText(160),
    variantLabel: publicText(120).nullable(),
    sourceLabel: safeSourceLabel,
    status: publicLotStatusSchema,
    statusAsOf: publicInstant,
    approvedForPublicAt: publicInstant,
    publicationRevisionId: canonicalUuid,
    documents: z.array(publicLotSourceDocumentSchema).max(24),
  })
  .strict();

function validatePublicRecord(
  record: {
    statusAsOf: string;
    approvedForPublicAt: string;
    documents: readonly {
      documentId: string;
      metadataApprovalId?: string | null;
      downloadApprovalId?: string | null;
    }[];
  },
  context: z.RefinementCtx,
): void {
  if (Date.parse(record.approvedForPublicAt) < Date.parse(record.statusAsOf)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "record approval cannot predate the displayed lot status",
      path: ["approvedForPublicAt"],
    });
  }

  const documentIds = new Set<string>();
  const metadataApprovalIds = new Set<string>();
  const downloadApprovalIds = new Set<string>();
  for (const [index, document] of record.documents.entries()) {
    if (documentIds.has(document.documentId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate public documentId",
        path: ["documents", index, "documentId"],
      });
    }
    documentIds.add(document.documentId);
    if (document.metadataApprovalId !== null && document.metadataApprovalId !== undefined) {
      if (metadataApprovalIds.has(document.metadataApprovalId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "metadata approval IDs must be immutable and unique",
          path: ["documents", index, "metadataApprovalId"],
        });
      }
      metadataApprovalIds.add(document.metadataApprovalId);
    }
    if (document.downloadApprovalId !== null && document.downloadApprovalId !== undefined) {
      if (downloadApprovalIds.has(document.downloadApprovalId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "download approval IDs must be immutable and unique",
          path: ["documents", index, "downloadApprovalId"],
        });
      }
      downloadApprovalIds.add(document.downloadApprovalId);
    }
  }
}

export const publicLotSourceRecordSchema = publicLotSourceRecordObjectSchema
  .superRefine(validatePublicRecord);

export function publicLotDocumentPath(lotCode: string, documentId: string): string {
  return `/api/research/quality/lots/${encodeURIComponent(lotCode)}/documents/${encodeURIComponent(documentId)}`;
}

export const publicLotDocumentSchema = publicLotSourceDocumentObjectSchema
  .omit({ metadataApprovalId: true, downloadApprovalId: true })
  .extend({
    metadataApprovedForPublicAt: publicInstant,
    downloadPath: z
      .string()
      .regex(/^\/api\/research\/quality\/lots\/[A-Z0-9._-]+\/documents\/[0-9a-f-]+$/)
      .nullable(),
  })
  .strict()
  .superRefine((document, context) => {
    validatePublicDocumentApproval(document, context);
    if (document.status === "available" && document.downloadPath === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "available documents require a same-origin download path",
        path: ["downloadPath"],
      });
    }
    if (document.status !== "available" && document.downloadPath !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unavailable documents cannot expose a download path",
        path: ["downloadPath"],
      });
    }
  });

export const publicLotRecordSchema = publicLotSourceRecordObjectSchema
  .omit({ publicationRevisionId: true, documents: true })
  .extend({ documents: z.array(publicLotDocumentSchema).max(24) })
  .strict()
  .superRefine((record, context) => {
    validatePublicRecord(record, context);
    for (const [index, document] of record.documents.entries()) {
      if (
        document.downloadPath !== null
        && document.downloadPath !== publicLotDocumentPath(record.lotCode, document.documentId)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "downloadPath must match the exact lot and document",
          path: ["documents", index, "downloadPath"],
        });
      }
    }
  });

export const publicLotApiResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok"), lot: publicLotRecordSchema }).strict(),
  z
    .object({
      kind: z.literal("partial"),
      code: z.literal("quality_source_partial"),
      message: publicText(240),
      incomplete: z.tuple([z.literal("documents")]),
      lot: publicLotRecordSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("not_found"),
      code: z.literal("public_lot_not_found"),
      message: publicText(240),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unavailable"),
      code: z.enum(["quality_source_unavailable", "public_quality_guard_unavailable"]),
      message: publicText(240),
    })
    .strict(),
  z
    .object({
      kind: z.literal("rate_limited"),
      code: z.literal("public_quality_rate_limited"),
      message: publicText(240),
    })
    .strict(),
  z
    .object({
      kind: z.literal("invalid_request"),
      code: z.literal("invalid_lot_code"),
      message: publicText(240),
    })
    .strict(),
]);

export type PublicQualityTestCategory = z.infer<typeof publicQualityTestCategorySchema>;
export type PublicLotStatus = z.infer<typeof publicLotStatusSchema>;
export type PublicLotDocumentStatus = z.infer<typeof publicLotDocumentStatusSchema>;
export type PublicLotDocumentType = z.infer<typeof publicLotDocumentTypeSchema>;
export type PublicLotSourceRecord = z.infer<typeof publicLotSourceRecordSchema>;
export type PublicLotRecord = z.infer<typeof publicLotRecordSchema>;
export type PublicLotApiResponse = z.infer<typeof publicLotApiResponseSchema>;
