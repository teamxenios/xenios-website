import crypto from "crypto";
import zlib from "zlib";
import type { PartnerRole, PartnerState } from "@shared/research/distribution";
import {
  RESOURCE_AUDIENCE_ALL_PARTNERS,
  RESOURCE_PDF_MAX_BYTES,
  RESOURCE_USAGE_POLICY_LABELS,
  partnerActionsFor,
  partnerResourceDownloadPath,
  type ResourceAdminDto,
  type ResourceCardDto,
  type ResourceHubDenial,
  type ResourceUploadInput,
  type ResourceVersionAdminDto,
  type ResourceVersionReviewInput,
} from "@shared/research/resource-hub/contract";
import { isResourceStoreNotConfigured, type ResourceBytesStore } from "./bytes-store";
import { isResourceHubConflict, type ResourceHubStore, type ResourceRow, type ResourceVersionRow } from "./store";

// ---------------------------------------------------------------------------
// The Resource Hub service. Every decision that matters is made here, once:
// what an upload must look like, how a version moves between states, who may
// receive a published version, and what a partner is told. Storage keys,
// admin identities, and review reasons never leave this module in a partner
// shape.
// ---------------------------------------------------------------------------

export interface ResourceHubServiceDeps {
  store: ResourceHubStore;
  bytes: ResourceBytesStore;
  now: () => Date;
  /** Opaque, unguessable ids; injected so tests are deterministic. */
  newId: () => string;
}

export interface PartnerAudienceContext {
  memberId: string;
  role: PartnerRole;
  state: PartnerState;
}

export type AdminResult = { ok: true; resource: ResourceAdminDto } | ResourceHubDenial;

export type DeliveryResult =
  | { ok: true; bytes: Uint8Array; contentType: string; filename: string }
  | { ok: false; code: "not_found" | "resource_hub_unavailable" };

/** Partner states that can receive nothing, whatever the audience says. */
const BLOCKED_PARTNER_STATES: ReadonlySet<PartnerState> = new Set(["suspended", "terminated"]);

const PDF_MAGIC = "%PDF-";
/** Names of PDF features that execute or open something. V1 refuses them outright. */
const ACTIVE_CONTENT_MARKERS = ["/JavaScript", "/JS ", "/JS(", "/JS<", "/JS/", "/Launch", "/AA ", "/AA<", "/AA/", "/EmbeddedFile", "/RichMedia"];
/**
 * /OpenAction is benign when it is a bare destination array ("[3 0 R /Fit]":
 * open at page 3) and only dangerous when it carries an action dictionary or
 * points at one through an indirect reference (which cannot be judged without
 * a full parse, so it is refused conservatively).
 */
const OPEN_ACTION_WITH_ACTION = /\/OpenAction\s*(?:<<|\d+\s+\d+\s+R\b)/u;

/**
 * Text inside PDF string literals "(...)" is data (what a page prints), not
 * structure. Blanking it before the marker scan keeps a brochure that prints
 * "Route /AA 12" from being refused, while a real "/JS (code)" key survives
 * because the key precedes the literal. Nesting and backslash escapes follow
 * the PDF grammar; an unterminated literal blanks to the end of the text.
 */
export function stripPdfStringLiterals(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (ch === "\\") {
      out += ch + (text[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch !== "(") {
      out += ch;
      i += 1;
      continue;
    }
    // Skip the literal, honouring nesting and escapes.
    let depth = 1;
    i += 1;
    while (i < n && depth > 0) {
      const c = text[i]!;
      if (c === "\\") i += 2;
      else {
        if (c === "(") depth += 1;
        else if (c === ")") depth -= 1;
        i += 1;
      }
    }
    out += "()";
  }
  return out;
}
/** Bounds for the inflated-stream scan: a decompression bomb must not become a memory problem. */
const MAX_INFLATED_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_INFLATED_TOTAL_BYTES = 48 * 1024 * 1024;
const MAX_SCANNED_STREAMS = 4000;

/**
 * PDF names may spell any byte as #xx ("/J#61vaScript"). Decoding the escapes
 * before the marker scan means a marker cannot hide behind its own spelling.
 */
export function decodePdfNameEscapes(text: string): string {
  return text.replace(/#([0-9A-Fa-f]{2})/gu, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * The latin1 text of every FlateDecode stream the file carries, inflated within
 * bounds. Object streams (/ObjStm) and compressed dictionaries are streams too,
 * so a marker inside them is scanned the same way as one in plain text.
 * A stream that will not inflate is reported so the caller can refuse a file it
 * cannot judge.
 */
export function inflatedPdfStreams(bytes: Uint8Array): { text: string; opaqueStreams: number; truncated: boolean } {
  const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: string[] = [];
  let opaqueStreams = 0;
  let truncated = false;
  let total = 0;
  let cursor = 0;
  let scanned = 0;
  while (scanned < MAX_SCANNED_STREAMS) {
    const start = raw.indexOf("stream", cursor, "latin1");
    if (start < 0) break;
    scanned += 1;
    // "endstream" contains "stream" too; skip those hits.
    if (start >= 3 && raw.toString("latin1", start - 3, start) === "end") {
      cursor = start + 6;
      continue;
    }
    let dataStart = start + 6;
    if (raw[dataStart] === 0x0d) dataStart += 1;
    if (raw[dataStart] === 0x0a) dataStart += 1;
    const end = raw.indexOf("endstream", dataStart, "latin1");
    if (end < 0) break;
    const dictionary = raw.toString("latin1", Math.max(0, start - 600), start);
    cursor = end + 9;
    if (!/\/FlateDecode/u.test(decodePdfNameEscapes(dictionary))) continue;
    if (total >= MAX_INFLATED_TOTAL_BYTES) {
      truncated = true;
      break;
    }
    try {
      const inflated = zlib.inflateSync(raw.subarray(dataStart, end), { maxOutputLength: MAX_INFLATED_STREAM_BYTES });
      total += inflated.byteLength;
      parts.push(inflated.toString("latin1"));
    } catch {
      opaqueStreams += 1;
    }
  }
  return { text: parts.join("\n"), opaqueStreams, truncated };
}

function findActiveContentMarker(text: string): string | null {
  const decoded = stripPdfStringLiterals(decodePdfNameEscapes(text));
  for (const marker of ACTIVE_CONTENT_MARKERS) if (decoded.includes(marker)) return marker.trim();
  if (OPEN_ACTION_WITH_ACTION.test(decoded)) return "/OpenAction";
  return null;
}

// ---------------------------------------------------------------------------
// Upload validation: the file is judged by its bytes, never by its name alone.
// ---------------------------------------------------------------------------

export interface UploadValidation {
  ok: boolean;
  reasons: string[];
}

export function validatePdfUpload(input: {
  bytes: Uint8Array;
  declaredContentType: string;
  originalFilename: string;
}): UploadValidation {
  const reasons: string[] = [];
  if (input.declaredContentType !== "application/pdf") reasons.push("content type must be application/pdf");
  if (input.bytes.byteLength === 0) reasons.push("file is empty");
  if (input.bytes.byteLength > RESOURCE_PDF_MAX_BYTES) reasons.push(`file exceeds ${RESOURCE_PDF_MAX_BYTES} bytes`);
  const head = Buffer.from(input.bytes.subarray(0, PDF_MAGIC.length)).toString("latin1");
  if (head !== PDF_MAGIC) reasons.push("file does not start with a PDF signature");
  const name = input.originalFilename;
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.pdf$/iu.test(name) || name.includes("..") || /[\\/]/u.test(name)) {
    reasons.push("filename must be a simple name ending in .pdf");
  }
  if (/[\u0000-\u001f\u007f]/u.test(name)) reasons.push("filename contains control characters");
  if (head === PDF_MAGIC && input.bytes.byteLength <= RESOURCE_PDF_MAX_BYTES) {
    // Bounded scan of the raw bytes AND of every inflated FlateDecode stream
    // (object streams included), with name escapes decoded first. This is a
    // first-line filter against scripts, launch actions, and embedded files,
    // not a sandbox: a file the scan cannot read (encrypted, or a stream that
    // will not inflate) is refused rather than trusted.
    const text = Buffer.from(input.bytes).toString("latin1");
    if (/\/Encrypt\b/u.test(decodePdfNameEscapes(text))) reasons.push("PDF is encrypted; upload an unencrypted file");
    const marker = findActiveContentMarker(text);
    if (marker) reasons.push(`PDF contains active content (${marker}: scripts, launch actions, or embedded files are not accepted)`);
    else {
      const streams = inflatedPdfStreams(input.bytes);
      const inner = findActiveContentMarker(streams.text);
      if (inner) reasons.push(`PDF contains active content inside a compressed stream (${inner})`);
      if (streams.opaqueStreams > 0) reasons.push(`PDF has ${streams.opaqueStreams} compressed stream(s) that could not be inspected`);
      if (streams.truncated) reasons.push("PDF has more compressed content than can be inspected");
    }
  }
  return { ok: reasons.length === 0, reasons };
}

export function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** The raw file as the transport delivered it; judged by its bytes, never by its name. */
export interface UploadedFile {
  bytes: Uint8Array;
  contentType: string;
}

// ---------------------------------------------------------------------------
// Projections: explicit construction only.
// ---------------------------------------------------------------------------

function toVersionAdminDto(v: ResourceVersionRow): ResourceVersionAdminDto {
  return {
    versionId: v.versionId,
    versionNumber: v.versionNumber,
    state: v.state,
    usagePolicy: v.usagePolicy,
    audience: [...v.audience],
    sizeBytes: v.sizeBytes,
    sha256: v.sha256,
    originalFilename: v.originalFilename,
    contentType: v.contentType,
    validation: { ok: v.validationOk, reasons: [...v.validationReasons] },
    uploadedAt: v.uploadedAt,
    reviewedAt: v.reviewedAt,
    publishedAt: v.publishedAt,
    withdrawnAt: v.withdrawnAt,
    supersedesVersionId: v.supersedesVersionId,
    changeSummary: v.changeSummary,
  };
}

function toResourceAdminDto(resource: ResourceRow, versions: readonly ResourceVersionRow[]): ResourceAdminDto {
  return {
    resourceId: resource.resourceId,
    title: resource.title,
    purpose: resource.purpose,
    kind: resource.kind,
    createdAt: resource.createdAt,
    currentPublishedVersionId: resource.currentPublishedVersionId,
    versions: versions.map(toVersionAdminDto),
  };
}

function toCard(resource: ResourceRow, version: ResourceVersionRow): ResourceCardDto {
  const actions = partnerActionsFor(version.usagePolicy);
  return {
    resourceId: resource.resourceId,
    versionId: version.versionId,
    title: resource.title,
    purpose: resource.purpose,
    kind: resource.kind,
    versionNumber: version.versionNumber,
    usagePolicy: version.usagePolicy,
    usageLabel: RESOURCE_USAGE_POLICY_LABELS[version.usagePolicy],
    audience: [...version.audience],
    publishedAt: version.publishedAt ?? version.uploadedAt,
    reviewedAt: version.reviewedAt,
    sizeBytes: version.sizeBytes,
    sha256: version.sha256,
    actions,
    downloadPath: actions.download ? partnerResourceDownloadPath(resource.resourceId) : null,
  };
}

function audienceAllows(version: ResourceVersionRow, partner: { role: PartnerRole; state: PartnerState }): boolean {
  if (BLOCKED_PARTNER_STATES.has(partner.state)) return false;
  if (version.usagePolicy === "draft") return false;
  return version.audience.includes(RESOURCE_AUDIENCE_ALL_PARTNERS) || version.audience.includes(partner.role);
}

function denial(code: ResourceHubDenial["code"], message: string, fieldErrors?: Record<string, string[]>): ResourceHubDenial {
  return { ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

export function createResourceHubService(deps: ResourceHubServiceDeps) {
  const iso = () => deps.now().toISOString();

  async function projection(resourceId: string): Promise<ResourceAdminDto | null> {
    const resource = await deps.store.getResource(resourceId);
    if (!resource) return null;
    return toResourceAdminDto(resource, await deps.store.listVersions(resourceId));
  }

  async function guardUnavailable<T>(work: () => Promise<T>): Promise<T | ResourceHubDenial> {
    try {
      return await work();
    } catch (error) {
      if (isResourceStoreNotConfigured(error)) {
        return denial("resource_hub_unavailable", "Resource storage is not wired in this environment.");
      }
      throw error;
    }
  }

  return {
    /** Admin: create a resource (first version) or a new immutable version of one. */
    async createVersion(actorAdmin: string, input: ResourceUploadInput, file: UploadedFile): Promise<AdminResult> {
      return guardUnavailable(async () => {
        const bytes = file.bytes;
        const existing = await deps.store.findVersionByUploadKey(input.idempotencyKey);
        if (existing) {
          // A replay is only a replay when it carries the same file. The same
          // key with different bytes or a different filename is a reused key,
          // and answering "success" with the earlier version would swallow the
          // operator's new file silently.
          if (existing.sha256 !== sha256Hex(bytes) || existing.originalFilename !== input.originalFilename) {
            return denial("resource_state_conflict", "This upload key was already used for a different file. Start a new upload.");
          }
          const view = await projection(existing.resourceId);
          return view ? { ok: true as const, resource: view } : denial("not_found", "Resource not found.");
        }
        const validation = validatePdfUpload({
          bytes,
          declaredContentType: file.contentType,
          originalFilename: input.originalFilename,
        });
        const at = iso();
        let resource: ResourceRow | null = null;
        let versionNumber = 1;
        if (input.resourceId) {
          resource = await deps.store.getResource(input.resourceId);
          if (!resource) return denial("not_found", "Resource not found.");
          const versions = await deps.store.listVersions(resource.resourceId);
          versionNumber = versions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
        }
        if (!validation.ok) {
          // A rejected upload leaves no object and no row: nothing to quarantine
          // durably, nothing that could later be published by mistake.
          return denial("invalid_resource_upload", "The file was rejected.", { file: validation.reasons });
        }
        const resourceId = resource?.resourceId ?? deps.newId();
        const versionId = deps.newId();
        const storageKey = `resource-library/${resourceId}/v${versionNumber}-${versionId}.pdf`;
        // Bytes first, then the row; a failed write leaves nothing publishable.
        await deps.bytes.put(storageKey, { bytes, contentType: "application/pdf" });
        if (!resource) {
          resource = {
            resourceId,
            title: input.title,
            purpose: input.purpose,
            kind: "pdf",
            createdAt: at,
            createdByAdmin: actorAdmin,
            currentPublishedVersionId: null,
          };
          await deps.store.insertResource(resource);
        }
        const current = resource.currentPublishedVersionId;
        try {
          await deps.store.insertVersion({
            versionId,
            resourceId,
            versionNumber,
          state: "draft",
          usagePolicy: input.usagePolicy,
          audience: [...input.audience],
          sizeBytes: bytes.byteLength,
          sha256: sha256Hex(bytes),
          originalFilename: input.originalFilename,
          contentType: "application/pdf",
          storageKey,
          validationOk: true,
          validationReasons: [],
          uploadedAt: at,
          uploadedByAdmin: actorAdmin,
          reviewedAt: null,
          reviewedByAdmin: null,
          reviewReason: null,
          publishedAt: null,
          publishedByAdmin: null,
          withdrawnAt: null,
          withdrawnByAdmin: null,
          withdrawReason: null,
            supersedesVersionId: current,
            changeSummary: input.changeSummary ?? null,
            uploadIdempotencyKey: input.idempotencyKey,
          });
        } catch (error) {
          if (isResourceHubConflict(error)) {
            // Two admins uploaded to the same resource at once (or reused a
            // key): the loser gets a typed conflict, never a 503. The already
            // written object is keyed by this unique version id, so it can
            // never be served; it is orphaned, not published.
            const winner = await deps.store.findVersionByUploadKey(input.idempotencyKey);
            if (winner) {
              const view = await projection(winner.resourceId);
              if (view) return { ok: true as const, resource: view };
            }
            return denial("resource_state_conflict", "Another version was uploaded to this resource at the same time. Reload and try again.");
          }
          throw error;
        }
        const view = await projection(resourceId);
        return view ? { ok: true as const, resource: view } : denial("not_found", "Resource not found.");
      });
    },

    /** Admin: move one version through review, publication, or withdrawal. Idempotent by state. */
    async review(
      actorAdmin: string,
      resourceId: string,
      versionId: string,
      input: ResourceVersionReviewInput,
    ): Promise<AdminResult> {
      return guardUnavailable(async () => {
        const resource = await deps.store.getResource(resourceId);
        const version = await deps.store.getVersion(versionId);
        if (!resource || !version || version.resourceId !== resourceId) return denial("not_found", "Resource version not found.");
        const at = iso();
        const done = async () => {
          const view = await projection(resourceId);
          return view ? { ok: true as const, resource: view } : denial("not_found", "Resource not found.");
        };
        switch (input.action) {
          case "request_review": {
            if (version.state === "in_review") return done();
            if (version.state !== "draft") return denial("resource_state_conflict", `A ${version.state} version cannot be sent for review.`);
            await deps.store.updateVersion(versionId, { state: "in_review" });
            return done();
          }
          case "approve_content": {
            if (!input.reason) return denial("invalid_resource_metadata", "A review reason is required.", { reason: ["required"] });
            if (version.reviewedAt && version.state === "in_review") return done();
            if (version.state !== "draft" && version.state !== "in_review") {
              return denial("resource_state_conflict", `A ${version.state} version cannot be approved.`);
            }
            await deps.store.updateVersion(versionId, {
              state: "in_review",
              reviewedAt: at,
              reviewedByAdmin: actorAdmin,
              reviewReason: input.reason,
            });
            return done();
          }
          case "publish": {
            if (version.state === "published" && resource.currentPublishedVersionId === versionId) return done();
            if (version.state === "published") {
              // Repair path: a published version that is not current (a store
              // that could not complete a transition, or a stale pointer).
              // Re-running publish converges instead of dead-ending in a conflict.
              await deps.store.publishVersion({ resourceId, versionId, actorAdmin, at });
              return done();
            }
            if (version.state !== "in_review") return denial("resource_state_conflict", `A ${version.state} version cannot be published.`);
            if (!version.reviewedAt) return denial("resource_state_conflict", "Content review must be recorded before publishing.");
            if (!version.validationOk) return denial("resource_state_conflict", "A version that failed validation cannot be published.");
            if (version.usagePolicy === "draft") {
              return denial(
                "resource_state_conflict",
                `A version labelled "${RESOURCE_USAGE_POLICY_LABELS.draft}" cannot be published; upload a version with its final usage policy.`,
              );
            }
            // One atomic store transition: published + current + previous superseded.
            await deps.store.publishVersion({ resourceId, versionId, actorAdmin, at });
            return done();
          }
          case "withdraw": {
            if (!input.reason) return denial("invalid_resource_metadata", "A withdrawal reason is required.", { reason: ["required"] });
            if (version.state === "withdrawn") return done();
            if (version.state !== "published" && version.state !== "superseded") {
              return denial("resource_state_conflict", `A ${version.state} version cannot be withdrawn.`);
            }
            // One atomic store transition: withdrawn + current pointer cleared.
            await deps.store.withdrawVersion({ resourceId, versionId, actorAdmin, at, reason: input.reason });
            return done();
          }
        }
      });
    },

    async listAdmin(): Promise<ResourceAdminDto[]> {
      const resources = await deps.store.listResources();
      const out: ResourceAdminDto[] = [];
      for (const resource of resources) out.push(toResourceAdminDto(resource, await deps.store.listVersions(resource.resourceId)));
      return out;
    },

    async getAdmin(resourceId: string): Promise<ResourceAdminDto | null> {
      return projection(resourceId);
    },

    /** Admin preview bytes for any validated version (quarantined versions never reach storage). */
    async adminBytes(resourceId: string, versionId: string): Promise<DeliveryResult> {
      const version = await deps.store.getVersion(versionId);
      if (!version || version.resourceId !== resourceId) return { ok: false, code: "not_found" };
      try {
        const stored = await deps.bytes.get(version.storageKey);
        if (!stored) return { ok: false, code: "not_found" };
        return { ok: true, bytes: stored.bytes, contentType: stored.contentType, filename: `${version.resourceId}-v${version.versionNumber}.pdf` };
      } catch (error) {
        if (isResourceStoreNotConfigured(error)) return { ok: false, code: "resource_hub_unavailable" };
        throw error;
      }
    },

    /** Partner-facing library: only current published versions whose audience includes this partner. */
    async libraryFor(partner: { role: PartnerRole; state: PartnerState }): Promise<ResourceCardDto[]> {
      const published = await deps.store.listPublished();
      return published.filter(({ version }) => audienceAllows(version, partner)).map(({ resource, version }) => toCard(resource, version));
    },

    /**
     * Partner-facing delivery. Entitlement is re-read here, at use time, from the
     * store: the resource must exist, have a current published version, include
     * the partner's role in its audience, and carry a policy that allows download.
     * Every request is recorded; only a completed byte read is "delivered".
     */
    async deliverToPartner(partner: PartnerAudienceContext, resourceId: string): Promise<DeliveryResult> {
      const requestedAt = iso();
      // A completed delivery MUST be recorded (a failed ledger write refuses the
      // delivery); a denial is recorded best-effort, because a ledger hiccup
      // must never turn a uniform 404 into a distinguishable 503.
      const record = async (versionId: string | null, outcome: "delivered" | "denied" | "failed", reason: string | null) => {
        await deps.store.recordDelivery({ deliveryId: deps.newId(), resourceId, versionId, memberId: partner.memberId, requestedAt, outcome, reason });
      };
      const recordDenial = async (versionId: string | null, outcome: "denied" | "failed", reason: string) => {
        try {
          await record(versionId, outcome, reason);
        } catch (error) {
          console.error("[resource-hub] delivery denial not recorded:", error instanceof Error ? error.message : "unknown");
        }
      };
      const resource = await deps.store.getResource(resourceId);
      if (!resource) {
        // Nothing to record against: the ledger keys on an existing resource,
        // and an unknown id must answer exactly like a resource the caller may
        // not see.
        return { ok: false, code: "not_found" };
      }
      const version = resource.currentPublishedVersionId ? await deps.store.getVersion(resource.currentPublishedVersionId) : null;
      if (!version || version.state !== "published") {
        await recordDenial(version?.versionId ?? null, "denied", "not_published");
        return { ok: false, code: "not_found" };
      }
      // Policy first: a draft-policy version is never deliverable, whoever asks.
      if (!partnerActionsFor(version.usagePolicy).download) {
        await recordDenial(version.versionId, "denied", "policy");
        return { ok: false, code: "not_found" };
      }
      if (!audienceAllows(version, partner)) {
        await recordDenial(version.versionId, "denied", "audience");
        return { ok: false, code: "not_found" };
      }
      let stored: Awaited<ReturnType<ResourceBytesStore["get"]>>;
      try {
        stored = await deps.bytes.get(version.storageKey);
      } catch (error) {
        const unavailable = isResourceStoreNotConfigured(error);
        await recordDenial(version.versionId, "failed", unavailable ? "storage_unavailable" : "storage_error");
        if (unavailable) return { ok: false, code: "resource_hub_unavailable" };
        throw error;
      }
      if (!stored) {
        await recordDenial(version.versionId, "failed", "bytes_missing");
        return { ok: false, code: "not_found" };
      }
      await record(version.versionId, "delivered", null);
      // The filename carries the resource id and version, never the title.
      return { ok: true, bytes: stored.bytes, contentType: stored.contentType, filename: `${resource.resourceId}-v${version.versionNumber}.pdf` };
    },
  };
}

export type ResourceHubService = ReturnType<typeof createResourceHubService>;
