import type { EarlyAccessMemberOrderView } from "@shared/research/early-access-member-history";
import { apiGet, type ApiResult } from "../lib/api";
import type { MemberToken } from "./commerce";

const COLLECTION = "/api/research/early-access/member-orders";
const ORDER_NUMBER = /^XEA-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/;

export function isEarlyAccessMemberOrderNumber(value: string): boolean {
  return ORDER_NUMBER.test(value);
}

function requireUsd<T extends { orders?: EarlyAccessMemberOrderView[]; order?: EarlyAccessMemberOrderView }>(
  result: ApiResult<T>,
): ApiResult<T> {
  if (result.kind !== "ok") return result;
  const orders = result.data.orders ?? (result.data.order ? [result.data.order] : []);
  return orders.every((order) => order.currency === "USD")
    ? result
    : { kind: "error", message: "This order currency is not supported on this page." };
}

export async function listEarlyAccessMemberOrders(
  token: MemberToken,
): Promise<ApiResult<{ orders: EarlyAccessMemberOrderView[] }>> {
  return requireUsd(await apiGet(COLLECTION, token));
}

export async function getEarlyAccessMemberOrder(
  token: MemberToken,
  orderNumber: string,
): Promise<ApiResult<{ order: EarlyAccessMemberOrderView }>> {
  if (!isEarlyAccessMemberOrderNumber(orderNumber)) return { kind: "unavailable" };
  return requireUsd(await apiGet(`${COLLECTION}/${encodeURIComponent(orderNumber)}`, token));
}
