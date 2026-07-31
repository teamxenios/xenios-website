// Member API adapters. One exported function per /api/research/member/*
// endpoint used by the member pages (tracker endpoints live in tracker.ts).
// Each function owns its URL and body shape and returns the shared ApiResult
// envelope from lib/api, so pages never inline endpoint strings. Payload
// types that belong to a page stay in that page and are supplied through the
// generic parameter; fixed response shapes are typed here. No behavior
// change: these are the exact calls the pages previously made inline.

import { apiGet, apiPost, type ApiResult } from "../lib/api";
import {
  PROFILE_SECTION_KEYS,
  PLAN_DOCUMENT_TYPES,
  SENSITIVE_PROFILE_SECTIONS,
} from "@shared/research/member-platform";
import type {
  AssessmentAutosaveRequest,
  AssessmentSubmitRequest,
  BlueprintState,
  BlueprintView,
  DocumentAccessGrant,
  DocumentAccessRequest,
  MemberProfileView,
  MonthlyReviewState,
  PlanPublicationState,
  PlanDocument,
  ProfileSection,
  Xenios30Plan,
  Xenios90Plan,
} from "@shared/research/member-platform";

const BASE = "/api/research/member";

// --- Dashboard -------------------------------------------------------------

export function getMemberOverview<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/overview`, token);
}

// --- Membership ------------------------------------------------------------

export function getMembership<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/membership`, token);
}

export function cancelMembership(token?: string | null): Promise<ApiResult<{ ok: boolean; message?: string }>> {
  return apiPost<{ ok: boolean; message?: string }>(`${BASE}/cancel`, { confirm: true }, token);
}

// --- Security --------------------------------------------------------------

export function getSecuritySessions<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/security/sessions`, token);
}

// --- Privacy controls ------------------------------------------------------

export type PrivacyRequestResult = { ok: boolean; message?: string };

export function getPrivacySummary<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/privacy/summary`, token);
}

export function requestPrivacyExport(token?: string | null): Promise<ApiResult<PrivacyRequestResult>> {
  return apiPost<PrivacyRequestResult>(`${BASE}/privacy/export`, {}, token);
}

export function requestPrivacyCorrection(
  detail: string,
  token?: string | null,
): Promise<ApiResult<PrivacyRequestResult>> {
  return apiPost<PrivacyRequestResult>(`${BASE}/privacy/correction`, { detail }, token);
}

export function requestPrivacyDeletion(token?: string | null): Promise<ApiResult<PrivacyRequestResult>> {
  return apiPost<PrivacyRequestResult>(`${BASE}/privacy/deletion`, {}, token);
}

// --- Profile ---------------------------------------------------------------

export type ProfileResponse = { ok: true; profile: MemberProfileView };
export type SensitiveProfileResponse = { ok: true; sections: ProfileSection[] };

const PROFILE_KEYS = new Set<string>(PROFILE_SECTION_KEYS);
const SENSITIVE_PROFILE_KEYS = new Set<string>(SENSITIVE_PROFILE_SECTIONS);
const PROFILE_ERROR = "The profile response was incomplete.";
const PROFILE_LOAD_ERROR = "We could not load your profile. Please try again.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isDisplayPrimitive(value: unknown): boolean {
  return typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value))
    || typeof value === "boolean"
    || value === null;
}

function isProfileSection(value: unknown, sensitive: boolean): value is ProfileSection {
  if (!isPlainObject(value) || !hasExactKeys(value, ["key", "schemaVersion", "data", "updatedAt"])) return false;
  if (typeof value.key !== "string" || !PROFILE_KEYS.has(value.key)) return false;
  if (SENSITIVE_PROFILE_KEYS.has(value.key) !== sensitive) return false;
  if (!Number.isInteger(value.schemaVersion) || (value.schemaVersion as number) <= 0) return false;
  if (!isPlainObject(value.data) || !Object.values(value.data).every(isDisplayPrimitive)) return false;
  return isCanonicalUtcTimestamp(value.updatedAt);
}

function hasUniqueSections(sections: unknown[], sensitive: boolean): sections is ProfileSection[] {
  if (!sections.every((section) => isProfileSection(section, sensitive))) return false;
  return new Set(sections.map((section) => section.key)).size === sections.length;
}

function isProfileResponse(value: unknown): value is ProfileResponse {
  if (!isPlainObject(value) || !hasExactKeys(value, ["ok", "profile"]) || value.ok !== true) return false;
  const profile = value.profile;
  if (!isPlainObject(profile) || !hasExactKeys(profile, ["memberId", "sections", "completeness"])) return false;
  if (typeof profile.memberId !== "string" || profile.memberId.trim().length === 0) return false;
  if (!Array.isArray(profile.sections) || !hasUniqueSections(profile.sections, false)) return false;
  const completeness = profile.completeness;
  if (!isPlainObject(completeness) || !hasExactKeys(completeness, ["completedSections", "totalSections"])) return false;
  const completed = completeness.completedSections;
  const total = completeness.totalSections;
  return Number.isInteger(completed) && Number.isInteger(total)
    && (completed as number) >= 0
    && (total as number) >= 0
    && (completed as number) <= (total as number);
}

function isSensitiveProfileResponse(value: unknown): value is SensitiveProfileResponse {
  return isPlainObject(value)
    && hasExactKeys(value, ["ok", "sections"])
    && value.ok === true
    && Array.isArray(value.sections)
    && hasUniqueSections(value.sections, true);
}

function validateProfileResult<T>(
  result: ApiResult<T>,
  validate: (value: unknown) => boolean,
): ApiResult<T> {
  if (result.kind === "error") return { kind: "error", message: PROFILE_LOAD_ERROR };
  if (result.kind !== "ok") return result;
  return validate(result.data) ? result : { kind: "error", message: PROFILE_ERROR };
}

export async function getProfile(token?: string | null): Promise<ApiResult<ProfileResponse>> {
  const result = await apiGet<ProfileResponse>("/api/research/profile", token);
  return validateProfileResult(result, isProfileResponse);
}

export async function getSensitiveProfile(token?: string | null): Promise<ApiResult<SensitiveProfileResponse>> {
  const result = await apiGet<SensitiveProfileResponse>("/api/research/profile/sensitive", token);
  return validateProfileResult(result, isSensitiveProfileResponse);
}

// --- Assessment ------------------------------------------------------------

export function getAssessment<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>("/api/research/assessment", token);
}

export function getAssessmentMode<T>(
  mode: "initial" | "monthly_check_in",
  token?: string | null,
): Promise<ApiResult<T>> {
  return apiGet<T>(`/api/research/assessment?mode=${encodeURIComponent(mode)}`, token);
}

export function saveAssessment(
  body: AssessmentAutosaveRequest,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; lastSavedAt: string; revision: number }>> {
  return apiPost<{ ok: boolean; lastSavedAt: string; revision: number }>(
    "/api/research/assessment/responses",
    body,
    token,
  );
}

export function submitAssessment(
  body: AssessmentSubmitRequest,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; blueprintState?: string }>> {
  return apiPost<{ ok: boolean; blueprintState?: string }>("/api/research/assessment/submit", body, token);
}

export type AgreementView = {
  key: string;
  version: string;
  title: string;
  status: "draft" | "published";
  effectiveDate: string | null;
  content: string | null;
  contentHash: string;
  acceptedVersion: string | null;
  reacceptanceNeeded: boolean;
};

export function getResearchAgreements(
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; agreements: AgreementView[] }>> {
  return apiGet<{ ok: boolean; agreements: AgreementView[] }>("/api/research/agreements", token);
}

export function decideResearchAgreement(
  key: "XR-MEM-012",
  version: string,
  decision: "accepted" | "declined",
  contentHash: string,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; agreements: AgreementView[] }>> {
  return apiPost<{ ok: boolean; agreements: AgreementView[] }>(
    "/api/research/agreements",
    { decisions: [{ key, version, decision, contentHash }] },
    token,
  );
}

export function acceptResearchAgreement(
  key: "XR-MEM-012",
  version: string,
  contentHash: string,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; agreements: AgreementView[] }>> {
  return decideResearchAgreement(key, version, "accepted", contentHash, token);
}

export function withdrawResearchAgreement(
  key: "XR-MEM-012",
  token?: string | null,
): Promise<ApiResult<{ ok: boolean; agreements: AgreementView[] }>> {
  return apiPost<{ ok: boolean; agreements: AgreementView[] }>(
    `/api/research/agreements/${key}/withdraw`,
    {},
    token,
  );
}

// --- Blueprint -------------------------------------------------------------

export type BlueprintResponse = {
  ok: true;
  blueprint: BlueprintView | null;
  state: BlueprintState;
  memberVisibleMessage?: string | null;
};

export function getBlueprint(token?: string | null): Promise<ApiResult<BlueprintResponse>> {
  return apiGet<BlueprintResponse>("/api/research/blueprint", token);
}

// --- Plans (xenios 30 and xenios 90) ---------------------------------------

export type Xenios30Response = {
  ok: true;
  current: Xenios30Plan | null;
  history: Array<{ planId: string; monthLabel: string; state: PlanPublicationState }>;
};

export function getXenios30Plan(token?: string | null): Promise<ApiResult<Xenios30Response>> {
  return apiGet<Xenios30Response>("/api/research/plans/xenios30", token);
}

export function acknowledgeXenios30(
  planId: string,
  token?: string | null,
): Promise<ApiResult<{ ok: true; acknowledgedAt: string }>> {
  return apiPost<{ ok: true; acknowledgedAt: string }>(
    `/api/research/plans/xenios30/${encodeURIComponent(planId)}/acknowledge`,
    {},
    token,
  );
}

export type Xenios90Response = {
  ok: true;
  plan: Xenios90Plan | null;
  review: MonthlyReviewState;
};

export function getXenios90Plan(token?: string | null): Promise<ApiResult<Xenios90Response>> {
  return apiGet<Xenios90Response>("/api/research/plans/xenios90", token);
}

// --- Documents -------------------------------------------------------------

export type DocumentsResponse = { ok: true; documents: PlanDocument[] };

type DocumentAccessResponse = { ok: true; grant: DocumentAccessGrant };
type DocumentAcknowledgeResponse = { ok: true; acknowledgedAt: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DOCUMENT_ERROR = "The documents response was incomplete.";

const plain = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
};
const bounded = (value: unknown, max: number) => typeof value === "string" && value.length > 0
  && value.length <= max && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const canonicalTimestamp = (value: unknown): value is string => typeof value === "string" && ISO.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
export const isCanonicalDocumentId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

function validDocumentGrant(value: unknown, expectedId: string): value is DocumentAccessGrant {
  if (!plain(value) || !exact(value, ["documentId", "signedUrl", "expiresAt"]) || value.documentId !== expectedId
    || !isCanonicalDocumentId(expectedId) || !canonicalTimestamp(value.expiresAt) || typeof value.signedUrl !== "string") return false;
  const match = value.signedUrl.match(/^\/api\/research\/documents\/([0-9a-f-]{36})\/download\?exp=(\d+)&sig=([A-Za-z0-9_-]{43})$/);
  if (!match || match[1] !== expectedId) return false;
  const parsedExp = Number(match[2]);
  const expires = Date.parse(value.expiresAt);
  return Number.isSafeInteger(parsedExp) && String(parsedExp) === match[2] && parsedExp === expires;
}

function validDocument(value: unknown): value is PlanDocument {
  if (!plain(value) || !exact(value, ["documentId", "type", "title", "version", "templateVersion", "checksumSha256", "status", "supersedesDocumentId", "reviewedBy", "publishedAt", "acknowledgedAt"])) return false;
  return isCanonicalDocumentId(value.documentId)
    && PLAN_DOCUMENT_TYPES.includes(value.type as (typeof PLAN_DOCUMENT_TYPES)[number])
    && bounded(value.title, 200)
    && Number.isSafeInteger(value.version) && (value.version as number) > 0
    && bounded(value.templateVersion, 50)
    && typeof value.checksumSha256 === "string" && /^[0-9a-f]{64}$/.test(value.checksumSha256)
    && (value.status === "current" || value.status === "archived")
    && (value.supersedesDocumentId === null || isCanonicalDocumentId(value.supersedesDocumentId))
    && (value.reviewedBy === null || bounded(value.reviewedBy, 200))
    && canonicalTimestamp(value.publishedAt)
    && (value.acknowledgedAt === null || canonicalTimestamp(value.acknowledgedAt));
}

function fixedFailure<T>(result: ApiResult<unknown>, message: string): ApiResult<T> {
  if (result.kind === "ok") return { kind: "error", message };
  if (result.kind === "error") return { kind: "error", message };
  return result as ApiResult<T>;
}

export async function getDocuments(token?: string | null): Promise<ApiResult<DocumentsResponse>> {
  const result = await apiGet<unknown>("/api/research/documents", token);
  if (result.kind !== "ok") return fixedFailure(result, "We could not load your documents. Please try again.");
  const value = result.data;
  if (!plain(value) || !exact(value, ["ok", "documents"]) || value.ok !== true || !Array.isArray(value.documents)
    || !value.documents.every(validDocument)) return { kind: "error", message: DOCUMENT_ERROR };
  const ids = value.documents.map((document) => document.documentId);
  if (new Set(ids).size !== ids.length) return { kind: "error", message: DOCUMENT_ERROR };
  return { kind: "ok", data: value as DocumentsResponse };
}

export function requestDocumentAccess(
  documentId: string,
  token?: string | null,
): Promise<ApiResult<DocumentAccessResponse>> {
  if (!isCanonicalDocumentId(documentId)) return Promise.resolve({ kind: "error", message: "The private document could not be opened." });
  const body: DocumentAccessRequest = {};
  return apiPost<unknown>(`/api/research/documents/${documentId}/access`, body, token).then((result) => {
    if (result.kind !== "ok") return fixedFailure<DocumentAccessResponse>(result, "The private document could not be opened.");
    const value = result.data;
    if (!plain(value) || !exact(value, ["ok", "grant"]) || value.ok !== true || !validDocumentGrant(value.grant, documentId)) return { kind: "error", message: "The private document could not be opened." };
    return { kind: "ok", data: value as DocumentAccessResponse };
  });
}

export function acknowledgeDocument(
  documentId: string,
  version: number,
  token?: string | null,
): Promise<ApiResult<DocumentAcknowledgeResponse>> {
  if (!isCanonicalDocumentId(documentId) || !Number.isSafeInteger(version) || version <= 0) return Promise.resolve({ kind: "error", message: "The document could not be acknowledged." });
  return apiPost<unknown>(
    `/api/research/documents/${documentId}/acknowledge`,
    { documentId, version },
    token,
  ).then((result) => {
    if (result.kind !== "ok") return fixedFailure<DocumentAcknowledgeResponse>(result, "The document could not be acknowledged.");
    const value = result.data;
    if (!plain(value) || !exact(value, ["ok", "acknowledgedAt"]) || value.ok !== true || !canonicalTimestamp(value.acknowledgedAt)) return { kind: "error", message: "The document could not be acknowledged." };
    return { kind: "ok", data: value as DocumentAcknowledgeResponse };
  });
}

export async function fetchDocumentBlob(grant: DocumentAccessGrant, token?: string | null): Promise<ApiResult<Blob>> {
  if (!validDocumentGrant(grant, grant?.documentId)) return { kind: "error", message: "The private document could not be opened." };
  if (!token || token.trim() !== token || /[\r\n]/.test(token)) return { kind: "unauthorized" };
  try {
    const response = await fetch(grant.signedUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return { kind: "error", message: "The private document could not be opened." };
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (!cacheControl.split(",").some((directive) => directive.trim().toLowerCase() === "no-store")) return { kind: "error", message: "The private document could not be opened." };
    return { kind: "ok", data: await response.blob() };
  } catch {
    return { kind: "error", message: "The private document could not be opened." };
  }
}
