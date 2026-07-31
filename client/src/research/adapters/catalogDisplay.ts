import type {
  CatalogDisplayListResponse,
  CatalogDisplayDetailResponse,
  CatalogDisplayLane,
} from "@shared/research/catalog-display/contract";
import { apiGet, type ApiResult } from "../lib/api";

// The client fetch adapter for the catalog-display read surface
// (server/research/catalog-display/routes.ts). Same shape as
// memberCatalogApi.ts: token in, ApiResult out, closed handling everywhere.
// The server derives audience and breadth from the authenticated request; the
// client sends nothing but the member's own Bearer token, so there is nothing
// here a caller could tamper with.

const BASE = "/api/research/catalog-display";

export function getCatalogDisplay(
  token: string | null,
): Promise<ApiResult<CatalogDisplayListResponse>> {
  return apiGet(`${BASE}/catalog`, token);
}

export function getCatalogDisplayProduct(
  token: string | null,
  lane: CatalogDisplayLane,
  slug: string,
): Promise<ApiResult<CatalogDisplayDetailResponse>> {
  return apiGet(
    `${BASE}/products/${encodeURIComponent(lane)}/${encodeURIComponent(slug)}`,
    token,
  );
}
