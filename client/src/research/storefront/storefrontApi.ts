import type { MasterOfferingCatalogQuery, MasterOfferingFamily } from "@shared/research/master-offerings/contract";
import {
  PUBLIC_STOREFRONT_BASE_PATH,
  isPublicStorefrontErrorCode,
  type PublicStorefrontCatalogResponse,
  type PublicStorefrontDetailResponse,
} from "@shared/research/storefront/contract";
import { apiGet, type ApiResult } from "../lib/api";

/**
 * The read adapter for the public storefront. No token, ever: the surface is
 * for signed-out visitors, and the strongest thing the server will say to it
 * is what it says to a viewer who has proven nothing.
 *
 * While the routes are unmounted or the flag is off, `apiGet` normalizes the
 * answers (an HTML shell, a 503 refusal) to `unavailable`, and the surface
 * renders its designed "not open yet" state rather than an empty catalog that
 * reads as "we sell nothing".
 */

export function publicStorefrontCatalogUrl(
  query: MasterOfferingCatalogQuery,
): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.families?.length) params.set("families", query.families.join(","));
  if (query.categories?.length) {
    params.set("categories", query.categories.join(","));
  }
  if (query.sort) params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const search = params.toString();
  return `${PUBLIC_STOREFRONT_BASE_PATH}/catalog${search ? `?${search}` : ""}`;
}

export function publicStorefrontDetailUrl(
  family: MasterOfferingFamily,
  slug: string,
): string {
  return `${PUBLIC_STOREFRONT_BASE_PATH}/products/${encodeURIComponent(
    family,
  )}/${encodeURIComponent(slug)}`;
}

export function getPublicStorefrontCatalog(
  query: MasterOfferingCatalogQuery = {},
): Promise<ApiResult<PublicStorefrontCatalogResponse>> {
  // The public query surface has no display-state filter; a pasted member
  // link that carries one narrows to the rest of its filters rather than
  // failing the whole page.
  const { states: _states, ...rest } = query;
  return apiGet(publicStorefrontCatalogUrl(rest));
}

export function getPublicStorefrontDetail(
  family: MasterOfferingFamily,
  slug: string,
): Promise<ApiResult<PublicStorefrontDetailResponse>> {
  return apiGet(publicStorefrontDetailUrl(family, slug));
}

/** What the public surface may be in. Deliberately small. */
export type PublicStorefrontSurfaceState =
  | "loading"
  | "ok"
  | "closed"
  | "not_found"
  | "unavailable"
  | "error";

export function toPublicStorefrontSurfaceState(
  result: ApiResult<unknown>,
): PublicStorefrontSurfaceState {
  switch (result.kind) {
    case "ok":
      return "ok";
    case "denied":
    case "forbidden":
    case "unauthorized":
      return isPublicStorefrontErrorCode(result.code) &&
        result.code === "storefront_not_found"
        ? "not_found"
        : "unavailable";
    case "unavailable":
      return "unavailable";
    case "error":
      if (result.code === "storefront_not_found") return "not_found";
      if (result.code === "storefront_closed") return "closed";
      return "error";
  }
}

/** Copy for each non-ok state. Customer words, no engineering vocabulary. */
export const PUBLIC_STOREFRONT_STATE_COPY: Readonly<
  Record<
    Exclude<PublicStorefrontSurfaceState, "ok" | "loading">,
    { title: string; body: string }
  >
> = {
  closed: {
    title: "The catalog is not open yet.",
    body: "We are preparing it now. Members can sign in to browse today.",
  },
  not_found: {
    title: "That product is not in the catalog.",
    body: "It may have been renamed. Browse the catalog to find it.",
  },
  unavailable: {
    title: "The catalog is not open yet.",
    body: "We are preparing it now. Members can sign in to browse today.",
  },
  error: {
    title: "The catalog could not be loaded.",
    body: "Please try again.",
  },
};
