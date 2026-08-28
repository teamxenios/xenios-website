import type { Express, RequestHandler, Response } from "express";
import { z } from "zod";
import {
  normalizePublicLotCode,
  publicLotDocumentPath,
  publicLotRecordSchema,
  publicLotSourceRecordSchema,
  type PublicLotRecord,
  type PublicLotSourceRecord,
} from "../../../shared/research/quality/public-lot";

export const PUBLIC_QUALITY_DEPENDENCY_TIMEOUT_MS = 1_500;
export const PUBLIC_QUALITY_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const PUBLIC_QUALITY_DOCUMENT_MAX_CHUNKS = 4_096;

export type PublicLotLookupResult =
  | { kind: "available"; record: unknown | null }
  | { kind: "partial"; incomplete: readonly ["documents"]; record: unknown }
  | { kind: "unavailable"; reason: "not_configured" | "dependency_unavailable" };

export type PublicLotDocumentReadResult =
  | {
      kind: "available";
      /** Size from the immutable object revision's trusted metadata. */
      trustedSizeBytes: number;
      /** A lazy stream. Implementations must not pre-buffer the complete object. */
      stream: AsyncIterable<Uint8Array>;
      contentType: "application/pdf";
    }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: "not_configured" | "dependency_unavailable" };

export interface PublicLotSource {
  lookupPublicLot(
    lotCode: string,
    options: { signal: AbortSignal },
  ): Promise<PublicLotLookupResult>;
  /**
   * Atomically re-authorizes every exact publication revision and resolves
   * trusted immutable-object size metadata before exposing a lazy byte stream.
   * Implementations must not pre-buffer the complete object.
   */
  readApprovedPublicDocument(input: {
    lotCode: string;
    documentId: string;
    expectedPublication: {
      lotPublicationRevisionId: string;
      lotApprovedAt: string;
      documentMetadataApprovalId: string;
      metadataApprovedAt: string;
      documentDownloadApprovalId: string;
      downloadApprovedAt: string;
      documentStatusAsOf: string;
    };
    maxBytes: number;
    signal: AbortSignal;
  }): Promise<PublicLotDocumentReadResult>;
}

export type PublicQualityTimeResolution =
  | { kind: "available"; nowMs: number }
  | { kind: "unavailable" };

export interface PublicQualityApiDependencies {
  source: PublicLotSource;
  publicReadGuard: RequestHandler;
  auditPublicRead(event: PublicQualityAuditEvent, signal: AbortSignal): Promise<void>;
  resolveNow(signal: AbortSignal): Promise<PublicQualityTimeResolution>;
  /** Per-authority deadline; a request may perform several sequential bounded calls. */
  dependencyTimeoutMs?: number;
}

export interface PublicQualityAuditEvent {
  action: "lot_lookup" | "document_read";
  outcome: "granted" | "partial" | "not_found" | "unavailable" | "invalid_request";
  lotCode: string | null;
  documentId: string | null;
}

export const PUBLIC_LOT_ROUTE = "/api/research/quality/lots/:lotCode";
export const PUBLIC_LOT_DOCUMENT_ROUTE =
  "/api/research/quality/lots/:lotCode/documents/:documentId";

export class DisabledPublicLotSource implements PublicLotSource {
  async lookupPublicLot(): Promise<PublicLotLookupResult> {
    return { kind: "unavailable", reason: "not_configured" };
  }

  async readApprovedPublicDocument(): Promise<PublicLotDocumentReadResult> {
    return { kind: "unavailable", reason: "not_configured" };
  }
}

const canonicalDocumentIdSchema = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase());

const publicLotLookupResultEnvelopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("available"),
      record: z.record(z.unknown()).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("partial"),
      incomplete: z.tuple([z.literal("documents")]),
      record: z.record(z.unknown()),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unavailable"),
      reason: z.enum(["not_configured", "dependency_unavailable"]),
    })
    .strict(),
]);

const publicLotDocumentReadResultEnvelopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("available"),
      trustedSizeBytes: z.number().int().safe().positive(),
      stream: z.custom<AsyncIterable<Uint8Array>>(
        (value) => typeof value === "object"
          && value !== null
          && typeof (value as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function",
      ),
      contentType: z.literal("application/pdf"),
    })
    .strict(),
  z.object({ kind: z.literal("not_found") }).strict(),
  z
    .object({
      kind: z.literal("unavailable"),
      reason: z.enum(["not_configured", "dependency_unavailable"]),
    })
    .strict(),
]);

const SOURCE_UNAVAILABLE = {
  kind: "unavailable" as const,
  code: "quality_source_unavailable" as const,
  message: "Public lot verification is temporarily unavailable. No lot status has been inferred.",
};

const SOURCE_PARTIAL = {
  code: "quality_source_partial" as const,
  message: "Only part of the approved public record is currently available. No missing fact has been inferred.",
};

const NOT_FOUND = {
  kind: "not_found" as const,
  code: "public_lot_not_found" as const,
  message: "No approved public record was found for that lot code.",
};

type BoundedResult<T> =
  | { kind: "value"; value: T }
  | { kind: "unavailable" };

async function runBounded<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<BoundedResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = Promise.resolve()
    .then(() => operation(controller.signal))
    .then(
      (value): BoundedResult<T> => ({ kind: "value", value }),
      (): BoundedResult<T> => ({ kind: "unavailable" }),
    );
  const timeout = new Promise<BoundedResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "unavailable" });
    }, timeoutMs);
  });
  const result = await Promise.race([work, timeout]);
  if (timer !== undefined) clearTimeout(timer);
  if (result.kind === "unavailable") controller.abort();
  return result;
}

function publicQualityResponseHeaders(res: Response): void {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

function invalidLotCode(res: Response): void {
  res.status(400).json({
    kind: "invalid_request",
    code: "invalid_lot_code",
    message: "Enter the lot code exactly as it appears on the label.",
  });
}

function unavailable(res: Response): void {
  res.status(503).json(SOURCE_UNAVAILABLE);
}

function notFound(res: Response): void {
  res.status(404).json(NOT_FOUND);
}

function documentNotFound(res: Response): void {
  res.status(404).json({
    kind: "not_found",
    code: "public_document_not_found",
    message: "No currently approved public document is available at that exact address.",
  });
}

async function auditPublicRead(
  dependencies: PublicQualityApiDependencies,
  timeoutMs: number,
  event: PublicQualityAuditEvent,
): Promise<boolean> {
  const result = await runBounded(
    timeoutMs,
    (signal) => dependencies.auditPublicRead(event, signal),
  );
  return result.kind === "value";
}

async function authoritativeNow(
  dependencies: PublicQualityApiDependencies,
  timeoutMs: number,
): Promise<number | null> {
  const result = await runBounded(timeoutMs, dependencies.resolveNow);
  if (
    result.kind !== "value"
    || result.value.kind !== "available"
    || !Number.isSafeInteger(result.value.nowMs)
    || result.value.nowMs < 0
  ) return null;
  return result.value.nowMs;
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

function streamFailure(): Error {
  return new Error("public document stream unavailable");
}

function cancelDocumentStream(iterator: AsyncIterator<Uint8Array>): void {
  try {
    if (typeof iterator.return !== "function") return;
    void Promise.resolve(iterator.return()).catch(() => undefined);
  } catch {
    // The request path is already failing closed. Never let hostile cleanup
    // behavior replace the bounded public response or expose provider detail.
  }
}

async function nextDocumentChunk(
  iterator: AsyncIterator<Uint8Array>,
  signal: AbortSignal,
): Promise<IteratorResult<Uint8Array>> {
  if (signal.aborted) throw streamFailure();
  return await new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
    let settled = false;
    let onAbort: () => void = () => undefined;
    const finish = (
      continuation: () => void,
    ) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      continuation();
    };
    onAbort = () => finish(() => reject(streamFailure()));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => iterator.next())
      .then(
        (step) => finish(() => resolve(step)),
        () => finish(() => reject(streamFailure())),
      );
  });
}

async function bufferTrustedDocumentStream(
  read: Extract<PublicLotDocumentReadResult, { kind: "available" }>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  // Refuse the trusted metadata before pulling even one chunk or allocating a
  // response-sized buffer. The stream bound below independently rejects a
  // source that lies about the metadata.
  if (
    !Number.isSafeInteger(read.trustedSizeBytes)
    || read.trustedSizeBytes < 1
    || read.trustedSizeBytes > maxBytes
  ) {
    throw streamFailure();
  }
  if (signal.aborted) throw streamFailure();

  // Allocate before acquiring the iterator so an allocation failure cannot
  // strand a provider stream that would then require cleanup.
  const snapshot = Buffer.alloc(read.trustedSizeBytes);
  let iterator: AsyncIterator<Uint8Array>;
  try {
    iterator = read.stream[Symbol.asyncIterator]();
  } catch {
    throw streamFailure();
  }
  if (!iterator || typeof iterator.next !== "function") throw streamFailure();

  let offset = 0;
  let chunkCount = 0;
  let complete = false;
  try {
    while (true) {
      const step = await nextDocumentChunk(iterator, signal);
      if (
        typeof step !== "object"
        || step === null
        || typeof step.done !== "boolean"
      ) {
        throw streamFailure();
      }
      if (step.done) {
        if (offset !== read.trustedSizeBytes) throw streamFailure();
        complete = true;
        return snapshot;
      }
      const chunk = step.value;
      chunkCount += 1;
      if (
        !(chunk instanceof Uint8Array)
        || chunk.byteLength < 1
        || chunkCount > PUBLIC_QUALITY_DOCUMENT_MAX_CHUNKS
        || chunk.byteLength > read.trustedSizeBytes - offset
      ) {
        throw streamFailure();
      }
      snapshot.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } finally {
    if (!complete) cancelDocumentStream(iterator);
  }
}

function isCurrentlyApproved(record: PublicLotSourceRecord, nowMs: number): boolean {
  const recordTimes = [record.statusAsOf, record.approvedForPublicAt];
  const documentTimes = record.documents.flatMap((document) => [
    document.statusAsOf,
    document.issuedAt,
    document.reviewedAt,
    document.metadataApprovedForPublicAt,
    document.downloadApprovedForPublicAt,
  ]);
  return [...recordTimes, ...documentTimes].every(
    (value) => value === null || Date.parse(value) <= nowMs,
  );
}

async function lookupApprovedRecord(
  dependencies: PublicQualityApiDependencies,
  timeoutMs: number,
  lotCode: string,
  nowMs: number,
) {
  const bounded = await runBounded(
    timeoutMs,
    (signal) => dependencies.source.lookupPublicLot(lotCode, { signal }),
  );
  if (bounded.kind !== "value") {
    return { kind: "unavailable" as const, reason: "dependency_unavailable" as const };
  }
  const parsedLookup = publicLotLookupResultEnvelopeSchema.safeParse(bounded.value);
  if (!parsedLookup.success) {
    return { kind: "unavailable" as const, reason: "dependency_unavailable" as const };
  }
  const lookup = parsedLookup.data;
  if (lookup.kind === "unavailable") return lookup;
  if (lookup.kind === "available" && lookup.record === null) {
    return { kind: "not_found" as const };
  }

  const parsed = publicLotSourceRecordSchema.safeParse(lookup.record);
  if (
    !parsed.success
    || parsed.data.lotCode !== lotCode
    || !isCurrentlyApproved(parsed.data, nowMs)
  ) {
    return { kind: "unavailable" as const, reason: "dependency_unavailable" as const };
  }
  return {
    kind: lookup.kind,
    record: parsed.data,
  } as const;
}

function projectPublicLot(record: PublicLotSourceRecord): PublicLotRecord | null {
  const {
    publicationRevisionId: _privatePublicationRevisionId,
    documents,
    ...publicRecord
  } = record;
  const projected = {
    ...publicRecord,
    documents: documents
      .filter((document) => document.metadataApprovedForPublicAt !== null)
      .map((document) => {
        const {
          metadataApprovalId: _privateMetadataApprovalId,
          downloadApprovalId: _privateDownloadApprovalId,
          ...publicDocument
        } = document;
        return {
          ...publicDocument,
          metadataApprovedForPublicAt: document.metadataApprovedForPublicAt!,
          downloadPath:
            document.status === "available"
              ? publicLotDocumentPath(record.lotCode, document.documentId)
              : null,
        };
      }),
  };
  const parsed = publicLotRecordSchema.safeParse(projected);
  return parsed.success ? parsed.data : null;
}

/**
 * Public, exact-lot quality projection. No in-memory or optimistic source,
 * time, audit, or timeout fallback exists. The integration owner may mount
 * these routes only after constructing the durable authorities represented by
 * the required ports.
 */
export function registerPublicQualityApi(
  app: Express,
  dependencies: PublicQualityApiDependencies,
): void {
  if (!app || typeof app.get !== "function") {
    throw new Error("registerPublicQualityApi: an Express app is required");
  }
  if (!dependencies || typeof dependencies !== "object") {
    throw new Error("registerPublicQualityApi: dependencies are required");
  }
  if (!dependencies.source
    || typeof dependencies.source.lookupPublicLot !== "function"
    || typeof dependencies.source.readApprovedPublicDocument !== "function") {
    throw new Error("registerPublicQualityApi: a constructed public lot source is required");
  }
  if (typeof dependencies.publicReadGuard !== "function") {
    throw new Error("registerPublicQualityApi: a public read guard is required");
  }
  if (typeof dependencies.auditPublicRead !== "function") {
    throw new Error("registerPublicQualityApi: a public read audit sink is required");
  }
  if (typeof dependencies.resolveNow !== "function") {
    throw new Error("registerPublicQualityApi: an authoritative clock is required");
  }
  const timeoutMs = dependencies.dependencyTimeoutMs ?? PUBLIC_QUALITY_DEPENDENCY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error("registerPublicQualityApi: dependencyTimeoutMs must be between 1 and 10000");
  }

  app.get(
    PUBLIC_LOT_ROUTE,
    dependencies.publicReadGuard,
    async (req, res) => {
      publicQualityResponseHeaders(res);
      const lotCode = normalizePublicLotCode(req.params.lotCode);
      if (lotCode === null) {
        const audited = await auditPublicRead(dependencies, timeoutMs, {
          action: "lot_lookup",
          outcome: "invalid_request",
          lotCode: null,
          documentId: null,
        });
        return audited ? invalidLotCode(res) : unavailable(res);
      }

      const nowMs = await authoritativeNow(dependencies, timeoutMs);
      if (nowMs === null) {
        await auditPublicRead(dependencies, timeoutMs, {
          action: "lot_lookup",
          outcome: "unavailable",
          lotCode,
          documentId: null,
        });
        return unavailable(res);
      }

      try {
        const result = await lookupApprovedRecord(dependencies, timeoutMs, lotCode, nowMs);
        if (result.kind === "unavailable") {
          await auditPublicRead(dependencies, timeoutMs, { action: "lot_lookup", outcome: "unavailable", lotCode, documentId: null });
          return unavailable(res);
        }
        if (result.kind === "not_found") {
          const audited = await auditPublicRead(dependencies, timeoutMs, { action: "lot_lookup", outcome: "not_found", lotCode, documentId: null });
          return audited ? notFound(res) : unavailable(res);
        }

        const lot = projectPublicLot(result.record);
        if (lot === null) {
          await auditPublicRead(dependencies, timeoutMs, { action: "lot_lookup", outcome: "unavailable", lotCode, documentId: null });
          return unavailable(res);
        }
        const outcome = result.kind === "partial" ? "partial" : "granted";
        const audited = await auditPublicRead(dependencies, timeoutMs, { action: "lot_lookup", outcome, lotCode, documentId: null });
        if (!audited) return unavailable(res);
        return result.kind === "partial"
          ? res.status(200).json({
            kind: "partial",
            ...SOURCE_PARTIAL,
            incomplete: ["documents"],
            lot,
          })
          : res.status(200).json({ kind: "ok", lot });
      } catch {
        await auditPublicRead(dependencies, timeoutMs, { action: "lot_lookup", outcome: "unavailable", lotCode, documentId: null });
        return unavailable(res);
      }
    },
  );

  app.get(
    PUBLIC_LOT_DOCUMENT_ROUTE,
    dependencies.publicReadGuard,
    async (req, res) => {
      publicQualityResponseHeaders(res);
      const lotCode = normalizePublicLotCode(req.params.lotCode);
      const parsedDocumentId = canonicalDocumentIdSchema.safeParse(req.params.documentId);
      if (lotCode === null || !parsedDocumentId.success) {
        const audited = await auditPublicRead(dependencies, timeoutMs, {
          action: "document_read",
          outcome: "invalid_request",
          lotCode,
          documentId: null,
        });
        return audited ? documentNotFound(res) : unavailable(res);
      }
      const documentId = parsedDocumentId.data;

      const nowMs = await authoritativeNow(dependencies, timeoutMs);
      if (nowMs === null) {
        await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "unavailable", lotCode, documentId });
        return unavailable(res);
      }

      try {
        const lookup = await lookupApprovedRecord(dependencies, timeoutMs, lotCode, nowMs);
        if (lookup.kind === "unavailable") {
          await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "unavailable", lotCode, documentId });
          return unavailable(res);
        }
        if (lookup.kind === "not_found") {
          const audited = await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "not_found", lotCode, documentId });
          return audited ? documentNotFound(res) : unavailable(res);
        }

        const document = lookup.record.documents.find(
          (candidate) => candidate.documentId === documentId,
        );
        if (!document && lookup.kind === "partial") {
          await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "unavailable", lotCode, documentId });
          return unavailable(res);
        }
        if (
          !document
          || document.status !== "available"
          || document.metadataApprovedForPublicAt === null
          || document.metadataApprovalId === null
          || document.downloadApprovedForPublicAt === null
          || document.downloadApprovalId === null
        ) {
          const audited = await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "not_found", lotCode, documentId });
          return audited ? documentNotFound(res) : unavailable(res);
        }
        const expectedPublication = {
          lotPublicationRevisionId: lookup.record.publicationRevisionId,
          lotApprovedAt: lookup.record.approvedForPublicAt,
          documentMetadataApprovalId: document.metadataApprovalId,
          metadataApprovedAt: document.metadataApprovedForPublicAt,
          documentDownloadApprovalId: document.downloadApprovalId,
          downloadApprovedAt: document.downloadApprovedForPublicAt,
          documentStatusAsOf: document.statusAsOf,
        };
        const boundedRead = await runBounded(
          timeoutMs,
          async (signal) => {
            const rawRead = await dependencies.source.readApprovedPublicDocument({
              lotCode,
              documentId,
              expectedPublication,
              maxBytes: PUBLIC_QUALITY_DOCUMENT_MAX_BYTES,
              signal,
            });
            const parsedRead = publicLotDocumentReadResultEnvelopeSchema.safeParse(rawRead);
            if (!parsedRead.success) throw streamFailure();
            if (parsedRead.data.kind !== "available") return parsedRead.data;
            const bytes = await bufferTrustedDocumentStream(
              parsedRead.data,
              PUBLIC_QUALITY_DOCUMENT_MAX_BYTES,
              signal,
            );
            return {
              kind: "available" as const,
              bytes,
              contentType: parsedRead.data.contentType,
            };
          },
        );
        if (boundedRead.kind !== "value") {
          await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "unavailable", lotCode, documentId });
          return unavailable(res);
        }
        const read = boundedRead.value;
        if (read.kind === "unavailable") {
          await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "unavailable", lotCode, documentId });
          return unavailable(res);
        }
        if (read.kind === "not_found") {
          const audited = await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "not_found", lotCode, documentId });
          return audited ? documentNotFound(res) : unavailable(res);
        }
        const pdfBytes = read.bytes;
        if (!isPdf(pdfBytes)) {
          await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "unavailable", lotCode, documentId });
          return unavailable(res);
        }

        const audited = await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "granted", lotCode, documentId });
        if (!audited) return unavailable(res);

        const filename = `${lotCode}-${documentId}.pdf`;
        res.set("Content-Type", "application/pdf");
        res.set("Content-Disposition", `attachment; filename="${filename}"`);
        res.set("Content-Length", String(pdfBytes.byteLength));
        res.set("Content-Security-Policy", "sandbox; default-src 'none'");
        return res.status(200).send(pdfBytes);
      } catch {
        await auditPublicRead(dependencies, timeoutMs, { action: "document_read", outcome: "unavailable", lotCode, documentId });
        return unavailable(res);
      }
    },
  );
}
