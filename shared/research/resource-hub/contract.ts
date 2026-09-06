import { z } from "zod";
import { PARTNER_ROLES, type PartnerRole } from "../distribution";

// ---------------------------------------------------------------------------
// Xenios Resource Hub: the shared contract for Xenios-PUBLISHED materials.
//
// This is the opposite direction from research_content_assets (which holds
// content a PARTNER submitted for review). A resource is authored or approved
// by Xenios, carries immutable versions, an audience, and a usage policy, and
// is delivered to an authorized signed-in person through the server. Nothing
// in this contract carries a storage path, a signed storage URL, an admin
// email, or review notes: partner-visible shapes are built by explicit
// construction, never by filtering a wider row.
// ---------------------------------------------------------------------------

/** Four usage labels. Access to a version never implies permission to forward it. */
export const RESOURCE_USAGE_POLICIES = [
  /** This exact version may be shared externally for its stated purpose. */
  "external_share",
  /** Read/download only as granted; no external share action is ever offered. */
  "private",
  /** Supports onboarding or internal work; not a prospect-facing document. */
  "training",
  /** Not available as approved material; admin or assigned reviewer only. */
  "draft",
] as const;
export type ResourceUsagePolicy = (typeof RESOURCE_USAGE_POLICIES)[number];

export const RESOURCE_USAGE_POLICY_LABELS: Readonly<Record<ResourceUsagePolicy, string>> = {
  external_share: "Approved to share",
  private: "Private working material",
  training: "Training or internal use",
  draft: "Draft / review required",
};

/** Lifecycle of one immutable version. Bytes never change after upload. */
export const RESOURCE_VERSION_STATES = [
  "quarantined", // uploaded, validation not yet passed or failed
  "draft", // validated, metadata editable, not visible to any audience
  "in_review", // content review requested
  "published", // the current version an audience may receive
  "superseded", // replaced by a newer published version; bytes remain auditable
  "withdrawn", // pulled; denies ordinary delivery immediately
] as const;
export type ResourceVersionState = (typeof RESOURCE_VERSION_STATES)[number];

/**
 * Who may receive a published version. V1 audiences are the partner roles the
 * distribution contract already defines plus one "all partners" wildcard.
 * A recruiter audience is added by the recruiter slice, never by string.
 */
export const RESOURCE_AUDIENCE_ALL_PARTNERS = "all_partners" as const;
export type ResourceAudience = PartnerRole | typeof RESOURCE_AUDIENCE_ALL_PARTNERS;
export const RESOURCE_AUDIENCES = [RESOURCE_AUDIENCE_ALL_PARTNERS, ...PARTNER_ROLES] as const;

export const RESOURCE_KINDS = ["pdf"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** V1 accepts PDF only; other formats need their own explicit format policy. */
export const RESOURCE_PDF_MAX_BYTES = 15 * 1024 * 1024;
export const RESOURCE_TITLE_MAX = 160;
export const RESOURCE_PURPOSE_MAX = 400;
export const RESOURCE_CHANGE_SUMMARY_MAX = 400;

/** What a signed-in partner may do with one version; each action is independent. */
export interface ResourceActions {
  read: boolean;
  download: boolean;
  share: boolean;
}

/** A card in the partner-facing library. No storage key, no admin identity. */
export interface ResourceCardDto {
  resourceId: string;
  versionId: string;
  title: string;
  /** Plain-language intended use, e.g. "Send this to someone considering becoming an affiliate." */
  purpose: string;
  kind: ResourceKind;
  versionNumber: number;
  usagePolicy: ResourceUsagePolicy;
  usageLabel: string;
  audience: readonly ResourceAudience[];
  publishedAt: string;
  reviewedAt: string | null;
  sizeBytes: number;
  sha256: string;
  actions: ResourceActions;
  /** Server-authorized application path; the client never sees a storage URL. */
  downloadPath: string | null;
}

export interface ResourceLibraryResponse {
  ok: true;
  resources: ResourceCardDto[];
  asOf: string;
}

/** Admin-facing projection of a resource with every version and its state. */
export interface ResourceVersionAdminDto {
  versionId: string;
  versionNumber: number;
  state: ResourceVersionState;
  usagePolicy: ResourceUsagePolicy;
  audience: readonly ResourceAudience[];
  sizeBytes: number;
  sha256: string;
  originalFilename: string;
  contentType: "application/pdf";
  validation: { ok: boolean; reasons: readonly string[] };
  uploadedAt: string;
  reviewedAt: string | null;
  publishedAt: string | null;
  withdrawnAt: string | null;
  supersedesVersionId: string | null;
  changeSummary: string | null;
}

export interface ResourceAdminDto {
  resourceId: string;
  title: string;
  purpose: string;
  kind: ResourceKind;
  createdAt: string;
  currentPublishedVersionId: string | null;
  versions: ResourceVersionAdminDto[];
}

export interface ResourceAdminListResponse {
  ok: true;
  resources: ResourceAdminDto[];
}

export interface ResourceAdminItemResponse {
  ok: true;
  resource: ResourceAdminDto;
}

export interface ResourceHubDenial {
  ok: false;
  code:
    | "unauthorized"
    | "forbidden"
    | "not_found"
    | "invalid_resource_upload"
    | "invalid_resource_metadata"
    | "resource_state_conflict"
    | "resource_hub_unavailable";
  message: string;
  fieldErrors?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Admin upload transport.
//
// The PDF travels as the RAW request body (Content-Type: application/pdf), so
// the server's global JSON body limit never applies to it, and the metadata
// travels in one ASCII request header as base64url-encoded UTF-8 JSON (the
// same shape as Dropbox's content-upload `Dropbox-API-Arg` header). One
// request, atomic: a rejected upload writes no row and no object. The bytes
// are judged on the server (magic bytes, size, active content) before any
// row or object is written; the header is bounded and parsed with zod.
// ---------------------------------------------------------------------------

export const RESOURCE_UPLOAD_CONTENT_TYPE = "application/pdf";
export const RESOURCE_UPLOAD_METADATA_HEADER = "x-xenios-resource-upload";
/** Decoded JSON bytes ceiling for the metadata header; well under Node's 16 KB header limit. */
export const RESOURCE_UPLOAD_METADATA_MAX_BYTES = 4096;

const audienceSchema = z.array(z.enum(RESOURCE_AUDIENCES)).min(1).max(RESOURCE_AUDIENCES.length);

export const resourceUploadSchema = z
  .object({
    title: z.string().trim().min(3).max(RESOURCE_TITLE_MAX),
    purpose: z.string().trim().min(10).max(RESOURCE_PURPOSE_MAX),
    usagePolicy: z.enum(RESOURCE_USAGE_POLICIES),
    audience: audienceSchema,
    originalFilename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.pdf$/iu, "Filename must be a simple name ending in .pdf"),
    /** Present when uploading a new version of an existing resource. */
    resourceId: z.string().uuid().optional(),
    changeSummary: z.string().trim().max(RESOURCE_CHANGE_SUMMARY_MAX).optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .strict();
export type ResourceUploadInput = z.infer<typeof resourceUploadSchema>;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) return null;
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Client side: the metadata header value for one upload request. */
export function encodeResourceUploadMetadata(input: ResourceUploadInput): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(input)));
}

/**
 * Server side: the header value back to an UNVALIDATED JSON value, or null
 * when the header is missing, oversized, or not base64url JSON. The caller
 * still runs resourceUploadSchema over the result.
 */
export function decodeResourceUploadMetadata(header: string | undefined | null): unknown | null {
  if (typeof header !== "string" || header.length === 0) return null;
  if (header.length > Math.ceil((RESOURCE_UPLOAD_METADATA_MAX_BYTES * 4) / 3) + 4) return null;
  const bytes = base64UrlDecode(header.trim());
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > RESOURCE_UPLOAD_METADATA_MAX_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Actions that must carry a recorded reason. */
export const RESOURCE_REVIEW_ACTIONS_REQUIRING_REASON = ["approve_content", "withdraw"] as const;

export const resourceVersionReviewSchema = z
  .object({
    action: z.enum(["request_review", "approve_content", "publish", "withdraw"]),
    /** Required for approve_content and withdraw; recorded, never shown to partners. */
    reason: z.string().trim().min(3).max(400).optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((RESOURCE_REVIEW_ACTIONS_REQUIRING_REASON as readonly string[]).includes(value.action) && !value.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: `A reason is required to ${value.action.replace("_", " ")}.` });
    }
  });
export type ResourceVersionReviewInput = z.infer<typeof resourceVersionReviewSchema>;

// ---------------------------------------------------------------------------
// Paths. Literal strings so the release route census can see every door.
// ---------------------------------------------------------------------------

export const RESOURCE_HUB_PARTNER_LIBRARY_PATH = "/api/research/partner/resources";
export const RESOURCE_HUB_PARTNER_DOWNLOAD_PATH = "/api/research/partner/resources/:resourceId/download";
export const RESOURCE_HUB_ADMIN_LIST_PATH = "/api/admin/research/resource-hub/resources";
export const RESOURCE_HUB_ADMIN_UPLOAD_PATH = "/api/admin/research/resource-hub/resources";
export const RESOURCE_HUB_ADMIN_ITEM_PATH = "/api/admin/research/resource-hub/resources/:resourceId";
export const RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH =
  "/api/admin/research/resource-hub/resources/:resourceId/versions/:versionId/review";
export const RESOURCE_HUB_ADMIN_VERSION_DOWNLOAD_PATH =
  "/api/admin/research/resource-hub/resources/:resourceId/versions/:versionId/download";

export function partnerResourceDownloadPath(resourceId: string): string {
  return RESOURCE_HUB_PARTNER_DOWNLOAD_PATH.replace(":resourceId", encodeURIComponent(resourceId));
}

export function adminResourceItemPath(resourceId: string): string {
  return RESOURCE_HUB_ADMIN_ITEM_PATH.replace(":resourceId", encodeURIComponent(resourceId));
}

export function adminResourceVersionReviewPath(resourceId: string, versionId: string): string {
  return RESOURCE_HUB_ADMIN_VERSION_REVIEW_PATH.replace(":resourceId", encodeURIComponent(resourceId)).replace(
    ":versionId",
    encodeURIComponent(versionId),
  );
}

export function adminResourceVersionDownloadPath(resourceId: string, versionId: string): string {
  return RESOURCE_HUB_ADMIN_VERSION_DOWNLOAD_PATH.replace(":resourceId", encodeURIComponent(resourceId)).replace(
    ":versionId",
    encodeURIComponent(versionId),
  );
}

/** The actions a partner may take, derived from policy alone; V1 offers no external share action yet. */
export function partnerActionsFor(policy: ResourceUsagePolicy): ResourceActions {
  switch (policy) {
    case "external_share":
      return { read: true, download: true, share: false };
    case "private":
      return { read: true, download: true, share: false };
    case "training":
      return { read: true, download: true, share: false };
    case "draft":
      return { read: false, download: false, share: false };
  }
}
