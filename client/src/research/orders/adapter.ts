// The canonical order-history adapter. Paths live in the shared contract so
// the server descriptor and this client cannot drift apart; nothing here
// re-declares a contract type.

import { apiGet, type ApiResult } from "../lib/api";
import {
  CANONICAL_ORDER_HISTORY_PATH,
  canonicalOrderDetailPath,
  type CanonicalOrderView,
} from "@shared/research/orders/canonical-order";

export type MemberToken = string | null;

export function listCanonicalOrders(
  token: MemberToken,
): Promise<ApiResult<{ orders: CanonicalOrderView[] }>> {
  return apiGet(CANONICAL_ORDER_HISTORY_PATH, token);
}

export function getCanonicalOrder(
  token: MemberToken,
  orderNumber: string,
): Promise<ApiResult<{ order: CanonicalOrderView }>> {
  return apiGet(canonicalOrderDetailPath(orderNumber), token);
}
