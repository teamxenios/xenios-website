// Commerce adapter: the single home for the member commerce endpoints
// (catalog waitlist, orders, subscriptions). Pages import these functions
// instead of spelling URL strings inline, so a path change happens in one
// place. Behavior is identical to the previous inline calls: every function
// returns the same ApiResult envelope from lib/api, and payload types stay
// with the pages (passed as the generic parameter) because each page owns
// its own normalization.
//
// Note: the member catalog itself (products list, product detail) comes from
// useResearch() in core, not from these paths; this adapter covers only the
// direct fetch paths the member commerce pages call.

import { apiGet, apiPost, type ApiResult } from "../lib/api";

const BASE = "/api/research/member";

export const commercePaths = {
  waitlist: `${BASE}/waitlist`,
  orders: `${BASE}/orders`,
  order: (orderId: string) => `${BASE}/orders/${encodeURIComponent(orderId)}`,
  subscriptions: `${BASE}/subscriptions`,
  subscriptionAction: (subId: string, action: string) =>
    `${BASE}/subscriptions/${encodeURIComponent(subId)}/${action}`,
} as const;

/** Join the waitlist for a product that is not yet orderable. */
export function joinWaitlist(
  slug: string,
  token?: string | null,
): Promise<ApiResult<{ ok: boolean }>> {
  return apiPost<{ ok: boolean }>(commercePaths.waitlist, { slug }, token);
}

/** Fetch the member's order history. */
export function fetchOrders<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(commercePaths.orders, token);
}

/** Fetch one order by id. */
export function fetchOrder<T>(orderId: string, token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(commercePaths.order(orderId), token);
}

/** Fetch the member's subscriptions. */
export function fetchSubscriptions<T>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(commercePaths.subscriptions, token);
}

/** Run a subscription change (pause, resume, cancel, reschedule, ...). */
export function subscriptionAction<T>(
  subId: string,
  action: string,
  body: unknown,
  token?: string | null,
): Promise<ApiResult<T>> {
  return apiPost<T>(commercePaths.subscriptionAction(subId, action), body, token);
}
