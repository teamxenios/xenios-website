// Member API adapters. One exported function per /api/research/member/*
// endpoint used by the member pages (tracker endpoints live in tracker.ts).
// Each function owns its URL and body shape and returns the shared ApiResult
// envelope from lib/api, so pages never inline endpoint strings. Payload
// types that belong to a page stay in that page and are supplied through the
// generic parameter; fixed response shapes are typed here. No behavior
// change: these are the exact calls the pages previously made inline.

import { apiGet, apiPost, type ApiResult } from "../lib/api";

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

export function getProfile<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/profile`, token);
}

// --- Assessment ------------------------------------------------------------

export function getAssessment<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/assessment`, token);
}

export function submitAssessment(
  body: { mode: string; answers: unknown },
  token?: string | null,
): Promise<ApiResult<{ ok?: boolean }>> {
  return apiPost<{ ok?: boolean }>(`${BASE}/assessment`, body, token);
}

// --- Blueprint -------------------------------------------------------------

export function getBlueprint<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/blueprint`, token);
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

export function getXenios90Plan<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/plans/xenios-90`, token);
}

// --- Documents -------------------------------------------------------------

export function getDocuments<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/documents`, token);
}
