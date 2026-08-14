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
 * THE SERVER ROUTES ARE MOUNTED. The sibling lane landed its route table at
 * /api/research/kris-launch-a/v1 (GET /catalog and GET /products/:slug, the
 * only two paths the research wall admits for this surface), and this base is
 * the one constant edit that packet always promised: every request below
 * carries it, and `catalog-routes.test.tsx` holds every URL to it, so a
 * drifting base fails a test rather than silently returning the SPA shell.
 */
export const KRIS_API_BASE = "/api/research/kris-launch-a/v1";

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
  return `${KRIS_API_BASE}/catalog${suffix ? `?${suffix}` : ""}`;
}

/**
 * The mounted detail route addresses an item by slug alone: every slug in the
 * artifact is unique and the dataset reader refuses a duplicate, so the slug
 * is a complete address. The family still matters to the BROWSER (the routed
 * page path keeps both segments so a deep link restores its place in the
 * catalog), which is why this builder keeps its two-argument shape: hrefs and
 * callers are unchanged, and only the API path composed here loses the
 * family segment.
 */
export function krisDetailUrl(family: KrisFamily, slug: string): string {
  void family;
  return `${KRIS_API_BASE}/products/${encodeURIComponent(slug)}`;
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
