import {
  isKrisChannel,
  isKrisFamily,
  isKrisSort,
  type KrisCatalogQuery,
  type KrisChannel,
  type KrisFamily,
} from "@shared/research/kris-launch-a/contract";

/**
 * Every URL this surface builds, in one file.
 *
 * The mounted server contract lives in `server/research/kris-launch-a/routes.ts`.
 * Keep the version in this one constant: the catalog builder and the detail
 * builder below both derive their URL from it, and the route-parity test reads
 * the server source so a future drift fails before the browser quietly receives
 * the SPA shell.
 */
export const KRIS_API_BASE = "/api/research/kris-launch-a/v1";

/** Exact mounted read paths; exported so route drift is a compile-time break. */
export const KRIS_CATALOG_API_PATH = `${KRIS_API_BASE}/catalog`;
export const KRIS_PRODUCT_API_PREFIX = `${KRIS_API_BASE}/products`;

/** The routed page the Launch A catalog lives at (a client path, not an API path). */
export const KRIS_CATALOG_PATH = "/research/member/kris-catalog";

/**
 * The largest page size the browser will ask for.
 *
 * The server is the authority. Until its ceiling is published this matches the
 * v2 catalog's (100), and a hand-edited link asking for more is dropped here
 * rather than turned into a refusal the member would read as a broken catalog.
 */
export const KRIS_MAX_PAGE_SIZE = 100;

/** The page sizes the control offers. All inside the ceiling above. */
export const KRIS_PAGE_SIZES: readonly number[] = [24, 48, 96];

/** The longest search string that is sent. Longer input is trimmed, not refused. */
export const KRIS_MAX_QUERY_LENGTH = 160;

function toSearchParams(query: KrisCatalogQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.families?.length) params.set("families", query.families.join(","));
  if (query.channels?.length) params.set("channels", query.channels.join(","));
  if (query.sort !== undefined) params.set("sort", query.sort);
  return params;
}

export function krisCatalogUrl(query: KrisCatalogQuery = {}): string {
  const params = toSearchParams(query);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  const suffix = params.toString();
  return `${KRIS_CATALOG_API_PATH}${suffix ? `?${suffix}` : ""}`;
}

/**
 * The browser route carries family and slug for navigation and validation, but
 * the mounted API addresses a detail by its globally unique slug. Keep the
 * family parameter in this boundary so callers use the same typed handoff as
 * `krisItemHref`; it is deliberately not sent as authority to the server.
 */
export function krisDetailUrl(_family: KrisFamily, slug: string): string {
  return `${KRIS_PRODUCT_API_PREFIX}/${encodeURIComponent(slug)}`;
}

/**
 * Read catalog state out of a browser query string, dropping anything the
 * closed vocabulary does not recognize. A hand-edited or stale link can narrow
 * the catalog; it can never widen it, and it can never name a filter, a sort or
 * a page size the contract does not have.
 */
export function parseKrisQueryFromSearch(search: string): KrisCatalogQuery {
  const params = new URLSearchParams(search);
  const families = (params.get("families") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isKrisFamily);
  const channels = (params.get("channels") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isKrisChannel);
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  const q = (params.get("q") ?? "").trim().slice(0, KRIS_MAX_QUERY_LENGTH);
  return {
    ...(q ? { q } : {}),
    ...(families.length ? { families } : {}),
    ...(channels.length ? { channels } : {}),
    ...(isKrisSort(sort) ? { sort } : {}),
    ...(Number.isSafeInteger(page) && page > 0 ? { page } : {}),
    ...(Number.isSafeInteger(pageSize) &&
    pageSize > 0 &&
    pageSize <= KRIS_MAX_PAGE_SIZE
      ? { pageSize }
      : {}),
  };
}

/** Serialize catalog state back into a browser query string. */
export function krisQueryToSearch(query: KrisCatalogQuery): string {
  const params = toSearchParams(query);
  if (query.page !== undefined && query.page > 1) {
    params.set("page", String(query.page));
  }
  // Page size is written only when it is a usable, server-acceptable size. The
  // default belongs to the server, so an absent pageSize is the honest way to
  // say "whatever the catalog decides", and writing it out would freeze today's
  // default into every shared link.
  if (
    query.pageSize !== undefined &&
    Number.isSafeInteger(query.pageSize) &&
    query.pageSize > 0 &&
    query.pageSize <= KRIS_MAX_PAGE_SIZE
  ) {
    params.set("pageSize", String(query.pageSize));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/** The routed page for the Launch A catalog list. */
export function krisCatalogHref(query: KrisCatalogQuery = {}): string {
  return `${KRIS_CATALOG_PATH}${krisQueryToSearch(query)}`;
}

/** The routed page for one Launch A item. Family and slug, like the API. */
export function krisItemHref(family: KrisFamily, slug: string): string {
  return `${KRIS_CATALOG_PATH}/${encodeURIComponent(family)}/${encodeURIComponent(slug)}`;
}

export type { KrisCatalogQuery, KrisChannel, KrisFamily };
