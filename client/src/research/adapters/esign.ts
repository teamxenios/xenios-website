// ---------------------------------------------------------------------------
// E-signature (OpenSign) API adapter. The member signing lane
// (/api/research/activation/esign/*) and the admin document center
// (/api/admin/research/activation/esign/*) both live here. Bearer discipline
// is the shared one: every function takes an access token and forwards it to
// lib/api, which attaches "Authorization: Bearer <token>". The server decides
// authority on every request; a 401/403/disabled comes back as an honest
// ApiResult for the boundary to render, never invented data.
//
// The signed document and the certificate are NEVER reached by a raw storage
// path. The admin download route mints a short-lived signed URL on demand, and
// the packet .zip is a binary the browser downloads through the authenticated
// admin session. Nothing here echoes a storage ref.
// ---------------------------------------------------------------------------

import { apiGet, apiPost, type ApiResult } from "../lib/api";

const MEMBER_BASE = "/api/research/activation/esign";
const ADMIN_BASE = "/api/admin/research/activation/esign";
const enc = encodeURIComponent;

// ------------------------------- wire types --------------------------------
// Kept local (mirroring adapters/activation.ts): the client owns its own wire
// vocabulary rather than importing server code across the boundary.

/** The signing modes the server accepts. Two of them route through a provider. */
export const SIGNING_MODES = [
  "view_only_public_policy",
  "clickwrap_acceptance",
  "typed_signature",
  "opensign_document",
  "opensign_packet",
] as const;
export type SigningMode = (typeof SIGNING_MODES)[number];

/** The two modes backed by an external e-signature provider (OpenSign). */
export function isProviderBackedMode(mode: SigningMode): boolean {
  return mode === "opensign_document" || mode === "opensign_packet";
}

/** The provider link status the server tracks for a signing request. */
export type SigningLinkStatus =
  | "created"
  | "viewed"
  | "signed"
  | "completed"
  | "declined"
  | "revoked"
  | "expired";

export interface StartEsignSessionInput {
  mode: SigningMode;
  documentVersionIds: string[];
  idempotencyKey: string;
}

/** The session-start response. The signing URL is provider-ephemeral and
 * returned inline; an idempotent replay returns it as null. */
export interface EsignSessionResult {
  ok: boolean;
  requestId: string;
  providerDocumentId: string | null;
  status: SigningLinkStatus;
  signingUrl: string | null;
  idempotentReplay: boolean;
}

/** What a MEMBER sees about one of their signing requests (memberEsignRequestView).
 * The signing URL is not part of this view; it is only ever returned inline
 * from a live session start, so it is optional here and rendered only when the
 * server includes it. */
export interface MemberEsignRequest {
  requestId: string;
  mode: SigningMode;
  status: SigningLinkStatus;
  documentVersionIds: string[];
  signedPdfHash: string | null;
  certificateHash: string | null;
  completedAt: string | null;
  createdAt: string;
  signingUrl?: string | null;
}

export interface MemberEsignDocumentsResult {
  ok: boolean;
  documents: MemberEsignRequest[];
}

/** One entry of a provider event history, if the server includes it. */
export interface EsignProviderEvent {
  eventId: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
}

/** The admin view of a signing request (adminEsignRequestView). No storage ref. */
export interface AdminEsignRequest {
  requestId: string;
  memberId: string;
  mode: SigningMode;
  provider: string;
  providerDocumentId: string | null;
  status: SigningLinkStatus;
  documentVersionIds: string[];
  signedPdfHash: string | null;
  certificateHash: string | null;
  completedAt: string | null;
  createdAt: string;
  /** Present only if the server serializes the provider event history. */
  providerEventLog?: EsignProviderEvent[];
}

/** The admin view of an archive record (adminEsignArchiveView). No storage ref. */
export interface AdminEsignArchive {
  archiveId: string;
  memberId: string;
  packetOrDocumentId: string;
  documentVersionId: string;
  provider: string;
  providerDocumentId: string | null;
  signedPdfHash: string | null;
  certificateHash: string | null;
  xeniosSourceHash: string | null;
  completedAt: string | null;
  archiveStatus: string;
  accessClassification: string;
  createdAt: string;
}

export interface AdminEsignMemberDocuments {
  ok: boolean;
  memberId: string;
  requests: AdminEsignRequest[];
  archive: AdminEsignArchive[];
}

export type EsignDownloadWhich = "signed" | "certificate";

export interface EsignDownloadGrant {
  signedUrl: string;
  expiresAt: string;
}

export interface EsignDownloadResult {
  ok: boolean;
  which: EsignDownloadWhich;
  grant: EsignDownloadGrant;
}

export interface EsignResendResult {
  ok: boolean;
  resent: boolean;
  requestId: string;
}

// --------------------------- native embedded sign --------------------------
// The native lane signs an agreement WITHOUT leaving the activation page: no
// new tab, no redirect, no iframe, no external login. The member reads the
// full published text in the page, checks the required acknowledgments (never
// prechecked), types their legal name, and either types or draws a signature.
// The server stamps the authoritative signedAt; the client never invents one.

/** How the member produced their signature. */
export type NativeSignatureMethod = "typed" | "drawn";

/** The body POSTed to native/sign. Every boolean the server requires to be
 * exactly true (fullDocumentShown, affirmativeConsent, and, when required,
 * separateAcknowledgment) rides as the member's own affirmative act; a
 * defaulted value cannot reach here because the UI never prechecks. */
export interface NativeSignInput {
  documentVersionId: string;
  /** True only because the UI truly rendered the full document text. */
  fullDocumentShown: boolean;
  /** The member's own affirmative acceptance of the specific terms. */
  affirmativeConsent: boolean;
  /** Required for registry-flagged documents (arbitration, release/waiver). */
  separateAcknowledgment?: boolean;
  signatureMethod: NativeSignatureMethod;
  /** The typed legal name; also the rendered signature in the "typed" method. */
  typedLegalName: string;
  /** The drawn signature PNG bytes as base64 (no data URI prefix), or null
   * when the method is "typed". */
  drawnPngBase64: string | null;
  /** Stable per attempt so a retry replays instead of double-signing. */
  idempotencyKey: string;
}

/** The success shape of a native sign. The server is authoritative for
 * signedAt, the request id, and the archive hashes. `replayed` is true when
 * an idempotent retry matched an existing signature. */
export interface NativeSignResult {
  ok: true;
  requestId: string;
  documentVersionId: string;
  signedAt: string;
  replayed: boolean;
  status: SigningLinkStatus;
  signedPdfHash: string | null;
  certificateHash: string | null;
}

// --------------------------------- member ----------------------------------

/** Start (or idempotently replay) a signing session. The signing URL comes
 * back inline; it is never emailed. */
export function startEsignSession(
  token: string | null,
  input: StartEsignSessionInput,
): Promise<ApiResult<EsignSessionResult>> {
  return apiPost<EsignSessionResult>(`${MEMBER_BASE}/session`, input, token);
}

/** The member's own signing requests (required, pending, and completed). */
export function getEsignDocuments(token: string | null): Promise<ApiResult<MemberEsignDocumentsResult>> {
  return apiGet<MemberEsignDocumentsResult>(`${MEMBER_BASE}/documents`, token);
}

/** Sign one agreement natively, in the page. On success the signed copy is
 * archived to the member's document center; a failure comes back as an honest
 * ApiResult (denied with a machine code, or unavailable when the capability is
 * off) for the signer to render, never a fabricated success. */
export function signNativeAgreement(
  token: string | null,
  input: NativeSignInput,
): Promise<ApiResult<NativeSignResult>> {
  return apiPost<NativeSignResult>(`${MEMBER_BASE}/native/sign`, input, token);
}

/** A short-lived signed download URL for the member's OWN signed document or
 * certificate. The server audits the grant before it exists; the storage ref
 * never travels, only an ephemeral signed URL the browser opens. */
export function getMemberEsignDownloadUrl(
  token: string | null,
  requestId: string,
  which: EsignDownloadWhich,
): Promise<ApiResult<EsignDownloadResult>> {
  return apiGet<EsignDownloadResult>(
    `${MEMBER_BASE}/documents/${enc(requestId)}/download?which=${enc(which)}`,
    token,
  );
}

// ---------------------------------- admin ----------------------------------

/** One member's completed signing requests plus their archive. */
export function getEsignMemberDocuments(
  token: string,
  memberId: string,
): Promise<ApiResult<AdminEsignMemberDocuments>> {
  return apiGet<AdminEsignMemberDocuments>(`${ADMIN_BASE}/member/${enc(memberId)}`, token);
}

/** A short-lived signed download URL for the signed document or certificate.
 * The server audits the grant before it exists; the storage ref never travels. */
export function getEsignDownloadUrl(
  token: string,
  requestId: string,
  which: EsignDownloadWhich,
): Promise<ApiResult<EsignDownloadResult>> {
  return apiGet<EsignDownloadResult>(`${ADMIN_BASE}/request/${enc(requestId)}/download?which=${enc(which)}`, token);
}

/** Resend the completion notice for a completed signing request. */
export function esignResendNotification(token: string, requestId: string): Promise<ApiResult<EsignResendResult>> {
  return apiPost<EsignResendResult>(`${ADMIN_BASE}/request/${enc(requestId)}/resend`, {}, token);
}

/** The path to a member's signed packet .zip. This is a binary the browser
 * downloads through the authenticated admin session, not a JSON fetch. The
 * page triggers it with downloadEsignPacket so the bearer token rides along. */
export function esignPacketZipHref(memberId: string): string {
  return `${ADMIN_BASE}/member/${enc(memberId)}/packet.zip`;
}

/**
 * Fetch the member's signed packet .zip as a blob with the admin bearer token
 * and hand it to the browser as a download. Mirrors the auth approach of
 * fetchActivationReconciliationCsv (bearer header, no-store, honest failure):
 * a direct <a href> could not carry the Authorization header, so the bytes are
 * fetched here and offered through an object URL. Returns false on any failure
 * so the page can show an honest note instead of a broken link.
 */
export async function downloadEsignPacket(token: string, memberId: string): Promise<boolean> {
  try {
    const res = await fetch(esignPacketZipHref(memberId), {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("application/zip")) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `member-${memberId}-packet.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
