// Member API adapters. One exported function per /api/research/member/*
// endpoint used by the member pages (tracker endpoints live in tracker.ts).
// Each function owns its URL and body shape and returns the shared ApiResult
// envelope from lib/api, so pages never inline endpoint strings. Payload
// types that belong to a page stay in that page and are supplied through the
// generic parameter; fixed response shapes are typed here. No behavior
// change: these are the exact calls the pages previously made inline.

import { apiGet, apiPost, type ApiResult } from "../lib/api";
import type {
  AssessmentAutosaveRequest,
  AssessmentSubmitRequest,
} from "@shared/research/member-platform";

const BASE = "/api/research/member";

// The member surface is served from TWO mount points, and conflating them is
// the single largest source of dead pages in this section.
//
// BASE ("/api/research/member") hosts the member-account routes: overview,
// membership, catalog, claim, me, product-requests, security, privacy.
//
// PLATFORM ("/api/research") hosts the member-PLATFORM routes registered by
// registerMemberPlatformApi: profile, blueprint, plans and documents. Those
// backends are built, guarded and tested, but every client call reached them
// through BASE, so each one 404'd and its page degraded to a permanent pending
// state. Profile, Blueprint, Xenios 30, Xenios 90 and Documents all looked
// unbuilt while their servers were working. Verified against the actual route
// strings in server/research/: /api/research/profile, /api/research/blueprint,
// /api/research/plans/xenios30, /api/research/plans/xenios90 (no hyphen in
// either plan path) and /api/research/documents.
//
// Do not "simplify" these back onto BASE.
const PLATFORM = "/api/research";

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
  return apiGet<T>(`${PLATFORM}/profile`, token);
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

export function getBlueprint<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${PLATFORM}/blueprint`, token);
}

// --- Plans (xenios 30 and xenios 90) ---------------------------------------

export function getXenios30Plan<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${PLATFORM}/plans/xenios30`, token);
}

// The server identifies the plan by PATH PARAMETER and ignores the body
// (server/research/plans.ts:639 reads req.params.planId). The previous
// signature posted a `version` in the body to a URL with no planId segment, so
// the route never matched and the member was always told "Acknowledgment is
// not open yet" even with a published plan in front of them.
export function acknowledgeXenios30(
  planId: string,
  token?: string | null,
): Promise<ApiResult<{ ok?: boolean; acknowledgedAt?: string }>> {
  return apiPost<{ ok?: boolean; acknowledgedAt?: string }>(
    `${PLATFORM}/plans/xenios30/${encodeURIComponent(planId)}/acknowledge`,
    {},
    token,
  );
}

export function getXenios90Plan<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${PLATFORM}/plans/xenios90`, token);
}

// --- Documents -------------------------------------------------------------

export function getDocuments<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(`${PLATFORM}/documents`, token);
}
