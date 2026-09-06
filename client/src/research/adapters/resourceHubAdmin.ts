// ---------------------------------------------------------------------------
// Resource Hub admin adapter (/admin/research/resource-hub). Every
// /api/admin/research/resource-hub/* path the admin page touches lives here,
// spelled by the shared contract, with the admin bearer forwarded on every
// call. Reads go through the one envelope in lib/api. Writes keep the same
// ApiResult kinds but carry the server's per-field errors through, because
// an upload denial is only useful to an operator when it names the field.
// Nothing here invents a resource, a version, or a success.
// ---------------------------------------------------------------------------

import {
  RESOURCE_HUB_ADMIN_LIST_PATH,
  RESOURCE_HUB_ADMIN_UPLOAD_PATH,
  RESOURCE_UPLOAD_CONTENT_TYPE,
  RESOURCE_UPLOAD_METADATA_HEADER,
  adminResourceItemPath,
  adminResourceVersionDownloadPath,
  adminResourceVersionReviewPath,
  encodeResourceUploadMetadata,
  type ResourceAdminItemResponse,
  type ResourceAdminListResponse,
  type ResourceUploadInput,
  type ResourceVersionReviewInput,
} from "@shared/research/resource-hub/contract";
import { apiGet, type ApiResult } from "../lib/api";
import { parseAttachmentFilename, type ResourceDownloadResult } from "./partner";

export { adminResourceVersionDownloadPath };

/** ApiResult, widened so a denial can carry the server's per-field errors. */
export type ResourceHubWriteResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized"; code?: string }
  | { kind: "forbidden"; code?: string; message?: string }
  | { kind: "denied"; code: string; message?: string; fieldErrors?: Record<string, string[]> }
  | { kind: "unavailable" }
  | { kind: "error"; code?: string; message: string };

export function listResourceHubResources(token: string): Promise<ApiResult<ResourceAdminListResponse>> {
  return apiGet(RESOURCE_HUB_ADMIN_LIST_PATH, token);
}

export function getResourceHubResource(
  token: string,
  resourceId: string,
): Promise<ApiResult<ResourceAdminItemResponse>> {
  return apiGet(adminResourceItemPath(resourceId), token);
}

// The PDF is the raw request body (Content-Type: application/pdf) so the
// server's global JSON body limit never applies to it; the metadata rides in
// the one bounded header the contract names. One request, atomic on the
// server. The metadata is validated by the caller against the shared schema
// before it gets here; the bytes are judged only by the server.
export function uploadResourceHubVersion(
  token: string,
  input: ResourceUploadInput,
  file: Blob,
): Promise<ResourceHubWriteResult<ResourceAdminItemResponse>> {
  return post<ResourceAdminItemResponse>(
    RESOURCE_HUB_ADMIN_UPLOAD_PATH,
    token,
    {
      headers: {
        "Content-Type": RESOURCE_UPLOAD_CONTENT_TYPE,
        [RESOURCE_UPLOAD_METADATA_HEADER]: encodeResourceUploadMetadata(input),
      },
      body: file,
    },
    { tooLargeMessage: "The file is larger than the server accepts." },
  );
}

export function reviewResourceHubVersion(
  token: string,
  resourceId: string,
  versionId: string,
  input: ResourceVersionReviewInput,
): Promise<ResourceHubWriteResult<ResourceAdminItemResponse>> {
  return postJson<ResourceAdminItemResponse>(adminResourceVersionReviewPath(resourceId, versionId), input, token);
}

// The admin preview of one exact version: server-streamed bytes behind the
// admin bearer, never a storage URL. Same outcome vocabulary as the partner
// download so both pages render the same honest states.
export async function downloadResourceHubVersion(
  token: string,
  resourceId: string,
  versionId: string,
): Promise<ResourceDownloadResult> {
  try {
    const res = await fetch(adminResourceVersionDownloadPath(resourceId, versionId), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) return { kind: "unauthorized" };
    if (res.status === 403) return { kind: "forbidden" };
    if (res.status === 404 || res.status === 501 || res.status === 503) return { kind: "unavailable" };
    if (!res.ok) return { kind: "error", message: "The download did not complete. Please try again." };
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/pdf")) {
      return { kind: "error", message: "The server did not return a PDF for this version." };
    }
    const blob = await res.blob();
    return { kind: "ok", blob, filename: parseAttachmentFilename(res.headers.get("content-disposition")) };
  } catch {
    return { kind: "error", message: "The connection failed before the download completed. Please try again." };
  }
}

function fieldErrorsOf(value: unknown): Record<string, string[]> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(messages)) {
      const strings = messages.filter((m): m is string => typeof m === "string");
      if (strings.length) out[field] = strings;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

// A JSON write: the body is the serialized input, as lib/api would send it.
function postJson<T>(path: string, body: unknown, token: string): Promise<ResourceHubWriteResult<T>> {
  return post<T>(path, token, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface PostOptions {
  /**
   * When set, an HTTP 413 whose body carries no machine code is reported as
   * an upload denial with this message, so the operator hears "too large"
   * rather than "something went wrong". Only the raw-body upload sets it.
   */
  tooLargeMessage?: string;
}

// Mirrors lib/api's request() discipline (same-origin, no-store, bearer,
// status-to-kind mapping, HTML-200 means unpublished) and adds only one
// thing: the denial envelope's fieldErrors survive the mapping. The body and
// its content type are the caller's, so the same mapping serves a JSON write
// and the raw-PDF upload.
async function post<T>(
  path: string,
  token: string,
  init: { headers: Record<string, string>; body: BodyInit },
  options: PostOptions = {},
): Promise<ResourceHubWriteResult<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { ...init.headers, Authorization: "Bearer " + token },
      body: init.body,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const parsed: unknown = contentType.includes("application/json") ? await res.json().catch(() => null) : null;
    const envelope = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const code = typeof envelope?.code === "string" ? envelope.code : undefined;
    const message = typeof envelope?.message === "string" ? envelope.message : undefined;
    if (res.status === 401) return { kind: "unauthorized", code };
    if (res.status === 403) {
      if (code) return { kind: "denied", code, message, fieldErrors: fieldErrorsOf(envelope?.fieldErrors) };
      return { kind: "forbidden", message };
    }
    if (res.status === 404 || res.status === 501 || res.status === 503) {
      // A 404 with a machine code is the server saying "no such resource",
      // which an operator needs to see; a bare 404 is an unmounted route.
      if (res.status === 404 && code === "not_found") return { kind: "denied", code, message };
      return { kind: "unavailable" };
    }
    if (res.status === 413) {
      // Payload too large. The route answers with the upload denial envelope;
      // a proxy or body-limit layer in front of it answers with no JSON at
      // all, and that silence still means "too large", not "unknown error".
      if (envelope && code) return { kind: "denied", code, message, fieldErrors: fieldErrorsOf(envelope.fieldErrors) };
      if (options.tooLargeMessage) {
        return { kind: "denied", code: "invalid_resource_upload", message: message ?? options.tooLargeMessage };
      }
    }
    if (res.ok && !contentType.includes("application/json")) return { kind: "unavailable" };
    if (envelope && envelope.ok === false && code) {
      return { kind: "denied", code, message, fieldErrors: fieldErrorsOf(envelope.fieldErrors) };
    }
    if (!res.ok || parsed === null) {
      return { kind: "error", code, message: message ?? "Something went wrong. Please try again." };
    }
    return { kind: "ok", data: parsed as T };
  } catch {
    return { kind: "error", message: "The connection failed. Please try again." };
  }
}
