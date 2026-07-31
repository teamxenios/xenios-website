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
  SENSITIVE_PROFILE_SECTIONS,
} from "@shared/research/member-platform";
import type {
  AssessmentAutosaveRequest,
  AssessmentSubmitRequest,
  BlueprintState,
  BlueprintView,
  DocumentAccessGrant,
  MemberProfileView,
  MonthlyReviewState,
  PlanDocument,
  ProfileSection,
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

export function getXenios30Plan<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/plans/xenios-30`, token);
}

export function acknowledgeXenios30(
  version: string | null,
  token?: string | null,
): Promise<ApiResult<{ ok?: boolean; acknowledgedAt?: string }>> {
  return apiPost<{ ok?: boolean; acknowledgedAt?: string }>(`${BASE}/plans/xenios-30/acknowledge`, { version }, token);
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

export function getDocuments(token?: string | null): Promise<ApiResult<DocumentsResponse>> {
  return apiGet<DocumentsResponse>("/api/research/documents", token);
}

export function requestDocumentAccess(
  documentId: string,
  token?: string | null,
): Promise<ApiResult<{ ok: true; grant: DocumentAccessGrant }>> {
  return apiPost<{ ok: true; grant: DocumentAccessGrant }>(
    `/api/research/documents/${encodeURIComponent(documentId)}/access`,
    {},
    token,
  );
}

export function acknowledgeDocument(
  documentId: string,
  version: number,
  token?: string | null,
): Promise<ApiResult<{ ok: true; acknowledgedAt: string }>> {
  return apiPost<{ ok: true; acknowledgedAt: string }>(
    `/api/research/documents/${encodeURIComponent(documentId)}/acknowledge`,
    { documentId, version },
    token,
  );
}
