// ---------------------------------------------------------------------------
// Admin operations API adapter (pages/adminx/*). Every /api/admin/research/*
// path the operations family touches lives HERE, plus the shared
// /api/research/capabilities registry read. Bearer discipline is the one from
// pages/adminx/auth.ts, unchanged: every function takes the admin access
// token explicitly and forwards it to lib/api, which attaches
// "Authorization: Bearer <token>"; the SERVER decides authority on every
// request, and a 401/403 comes back as an honest ApiResult for the boundary
// to render (never invented data, never client-side authority).
// ---------------------------------------------------------------------------

import { apiGet, apiPost, type ApiResult } from "../lib/api";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../lib/capabilities";

// The shape useAdminResource loads through. Loaders with parameters are bound
// in the page (module-level or useCallback on the parameter) so identity only
// changes when the parameter does.
export type AdminLoader<T> = (token: string) => Promise<ApiResult<T>>;

const BASE = "/api/admin/research";
const enc = encodeURIComponent;

// --------------------------------- reads -----------------------------------

export function listApplications<T>(token: string, queue: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/applications?queue=${enc(queue)}`, token);
}

export function getApplication<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/applications/${enc(id)}`, token);
}

export function getSystemStatus<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/system-status`, token);
}

export function listReferralFraud<T>(token: string, status: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/referral-fraud?status=${enc(status)}`, token);
}

export function listAuditEvents<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/audit`, token);
}

export function listFulfillment<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/fulfillment`, token);
}

export function listGuides<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/guides`, token);
}

export function getGuide<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/guides/${enc(id)}`, token);
}

export function listInventory<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/inventory`, token);
}

export function listMembers<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/members`, token);
}

export function getMember<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/members/${enc(id)}`, token);
}

// status may be "" (all orders); the query parameter is always present, which
// matches the previous page behavior exactly.
export function listOrders<T>(token: string, status: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/orders?status=${enc(status)}`, token);
}

export function getOrder<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/orders/${enc(id)}`, token);
}

export function listPartners<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/partners`, token);
}

export function getPartner<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/partners/${enc(id)}`, token);
}

export function listPlans<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/plans`, token);
}

export function getPlan<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/plans/${enc(id)}`, token);
}

export function listPrivacyRequests<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/privacy/requests`, token);
}

export function listProducts<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/products`, token);
}

export function getProduct<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/products/${enc(id)}`, token);
}

// status may be "" (all questions), matching the previous page behavior.
export function listQuestions<T>(token: string, status: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/questions?status=${enc(status)}`, token);
}

export function getQuestion<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/questions/${enc(id)}`, token);
}

// No status filter means the bare outbox path (no empty query string), which
// matches the previous page behavior exactly.
export function listOutbox<T>(token: string, status?: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/outbox${status ? `?status=${enc(status)}` : ""}`, token);
}

// -------------------------------- actions ----------------------------------

// The application review verbs (approve, decline, request-information, and
// friends) share one URL shape; the page supplies the verb it already knows.
export function postApplicationAction<T>(
  token: string,
  id: string,
  action: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/applications/${enc(id)}/${action}`, body, token);
}

export function reportReferralFraud<T>(token: string, body: unknown): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/referral-fraud/report`, body, token);
}

export function actOnReferralFlag<T>(token: string, flagId: string, body: unknown): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/referral-fraud/${enc(flagId)}/action`, body, token);
}

export function replyToQuestion<T>(token: string, id: string, body: unknown): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/questions/${enc(id)}/reply`, body, token);
}

export function runOutbox<T>(token: string): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/outbox/run`, {}, token);
}

export function retryOutboxItem<T>(token: string, id: string): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/outbox/${enc(id)}/retry`, {}, token);
}

export function sendTestEmail<T>(token: string, body: unknown): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/test-email`, body, token);
}

// ------------------------- capability registry read -------------------------
// GET /api/research/capabilities via the shared lib, which owns the cache and
// the honest pending fallback (an absent registry means every capability
// reports pending, never enabled by assumption). The admin token rides along
// so the server can include admin detail.

export function getResearchCapabilities(token: string): Promise<Map<ResearchCapability, CapabilityStatus>> {
  return fetchCapabilities(token);
}
