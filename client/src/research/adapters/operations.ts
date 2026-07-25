import { apiGet, apiPost, type ApiResult } from "../lib/api";

const ADMIN = "/api/admin/research/operations";
const MITCH = "/api/operations/mitch";

export function getOperationsDashboard<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${ADMIN}/dashboard`, token);
}

export function getMitchQueue<T>(token: string, queue: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${MITCH}/queues/${encodeURIComponent(queue)}`, token);
}

export function getOwnedOrderTracking<T>(token: string, orderId: string): Promise<ApiResult<T>> {
  return apiGet<T>(`/api/research/orders/${encodeURIComponent(orderId)}/tracking`, token);
}

export function postMitchAction<T>(
  token: string,
  orderId: string,
  action: "acknowledge" | "expected-date" | "allocate" | "pick" | "pack" | "label" | "ship" | "exception" | "note",
  body: Record<string, unknown> & { expectedVersion: number; idempotencyKey: string },
): Promise<ApiResult<T>> {
  return apiPost<T>(`${MITCH}/orders/${encodeURIComponent(orderId)}/${action}`, body, token);
}

export function getAffiliateDashboard<T>(token: string): Promise<ApiResult<T>> {
  return apiGet<T>("/api/research/affiliate/dashboard", token);
}

export function createAffiliateLink<T>(
  token: string,
  affiliateId: string,
  campaign: string | null,
  idempotencyKey: string,
): Promise<ApiResult<T>> {
  return apiPost<T>("/api/research/affiliate/links", { affiliateId, campaign, idempotencyKey }, token);
}

export function applyForProfessionalAccount<T>(
  body: Record<string, unknown> & { idempotencyKey: string },
): Promise<ApiResult<T>> {
  return apiPost<T>("/api/research/professional-accounts/apply", body);
}

export function listProfessionalAccounts<T>(token: string, state?: string): Promise<ApiResult<T>> {
  return apiGet<T>(`/api/admin/research/professional-accounts${state ? `?state=${encodeURIComponent(state)}` : ""}`, token);
}

export function listOperationsCrm<T>(token: string, search?: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${ADMIN}/crm${search ? `?search=${encodeURIComponent(search)}` : ""}`, token);
}

export function listOperationsOutbox<T>(token: string, status?: string): Promise<ApiResult<T>> {
  return apiGet<T>(`${ADMIN}/outbox${status ? `?status=${encodeURIComponent(status)}` : ""}`, token);
}
