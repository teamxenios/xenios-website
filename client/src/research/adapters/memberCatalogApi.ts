import type {
  MemberCatalog,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import { apiGet, type ApiResult } from "../lib/api";

const BASE = "/api/research/member/products";

export function getMemberCatalog(
  token: string | null,
): Promise<ApiResult<{ ok: true; catalog: MemberCatalog }>> {
  return apiGet(BASE, token);
}

export function getMemberProductDetail(
  token: string | null,
  slug: string,
): Promise<ApiResult<{ ok: true; product: MemberProductDetail }>> {
  return apiGet(`${BASE}/${encodeURIComponent(slug)}`, token);
}
