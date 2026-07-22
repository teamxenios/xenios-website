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
import type { AdminCommerceQueuesDto } from "@shared/research/commerce-api";

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

// Frozen surface (docs/research-commerce/API_CONTRACTS_COMMERCE.md): the
// commerce operations queues (large-order review, claims, supplier fact
// blocks, quarantined lots, partner review, commission disputes).
export function getCommerceQueues(token: string): Promise<ApiResult<{ queues: AdminCommerceQueuesDto }>> {
  return apiGet(`${BASE}/commerce/queues`, token);
}

// The open member claims, as the admin claim workflow sees them.
export function listAdminClaims<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${BASE}/claims`, token);
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

/**
 * The real answer endpoint (POST /api/admin/research/questions/:id/answer).
 * The wire shape is the server's answerSchema exactly: answerText plus the
 * status the answer moves the question into. There is no "/reply" route on
 * the server; the old name pointed at one that never existed.
 */
export interface AdminQuestionAnswer {
  answerText: string;
  status: "answer_ready" | "more_information_needed";
}

export function answerQuestion<T>(token: string, id: string, body: AdminQuestionAnswer): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/questions/${enc(id)}/answer`, body, token);
}

// ----------------------- claim review and resolution ------------------------
// The admin claim workflow (POST /api/admin/research/claims/:claimId/...).
// Wire decisions come from the server's CLAIM_REVIEW_WIRE_DECISIONS; anything
// else is refused at the boundary, so the type here lists exactly those four.

export type AdminClaimReviewDecision = "under_review" | "information_requested" | "approved" | "declined";

export function reviewClaim<T>(
  token: string,
  claimId: string,
  decision: AdminClaimReviewDecision,
  note?: string,
): Promise<ApiResult<T>> {
  return apiPost<T>(
    `${BASE}/claims/${enc(claimId)}/review`,
    { decision, ...(note !== undefined ? { note } : {}) },
    token,
  );
}

/**
 * Money moves only through this call, and only with a positive integer amount
 * in cents plus an idempotency key, so a retried click can never refund twice.
 * The server additionally requires the claim to be approved first.
 */
export function refundClaim<T>(
  token: string,
  claimId: string,
  amountCents: number,
  idempotencyKey: string,
): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/claims/${enc(claimId)}/refund`, { amountCents, idempotencyKey }, token);
}

/** Resolves an approved claim with a replacement shipment instead of money. */
export function resolveClaimWithReplacement<T>(token: string, claimId: string): Promise<ApiResult<T>> {
  return apiPost<T>(`${BASE}/claims/${enc(claimId)}/replacement`, {}, token);
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
