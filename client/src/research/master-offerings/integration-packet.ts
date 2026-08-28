import {
  MASTER_OFFERING_MAX_CATEGORY_FILTERS,
  isMasterOfferingCategorySlug,
  isMasterOfferingDisplayState,
  isMasterOfferingFamily,
  isMasterOfferingSort,
} from "@shared/research/master-offerings/contract";
import type { MasterOfferingPriceListFormat } from "@shared/research/master-offerings/pricing-contract";
import type {
  MasterOfferingAction,
  MasterOfferingCatalogQuery,
  MasterOfferingDisplayState,
  MasterOfferingFamily,
  MasterOfferingSort,
} from "@shared/research/master-offerings/contract";

const API_BASE = "/api/research/catalog-display/v2";

/**
 * The routed page the full catalog lives at. It is the client path, not the
 * API path, and it is declared here so the card, the route manifest, and the
 * tests all read the same string.
 */
export const FULL_CATALOG_PATH = "/research/member/catalog";

/**
 * The largest page size the catalog API accepts. The server refuses anything
 * larger with an invalid-request refusal rather than clamping it, so a
 * hand-edited link carrying a bigger number is dropped here instead of being
 * turned into a 400 the member would read as a broken catalog. The server
 * stays the authority; this only keeps the browser from asking for something
 * it has already been told is not a request.
 */
export const MASTER_OFFERING_MAX_PAGE_SIZE = 100;

export function masterOfferingCatalogUrl(
  query: MasterOfferingCatalogQuery = {},
): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.families?.length) params.set("families", query.families.join(","));
  if (query.states?.length) params.set("states", query.states.join(","));
  if (query.categories?.length) {
    params.set("categories", query.categories.join(","));
  }
  if (query.sort !== undefined) params.set("sort", query.sort);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  const suffix = params.toString();
  return `${API_BASE}/catalog${suffix ? `?${suffix}` : ""}`;
}

export function masterOfferingDetailUrl(
  family: MasterOfferingFamily,
  slug: string,
): string {
  return `${API_BASE}/products/${encodeURIComponent(family)}/${encodeURIComponent(slug)}`;
}

/**
 * The download URL for the buyer price list. It carries the same closed filters
 * as the catalog and no paging, because a price list is the whole match set or
 * an explicit refusal, never a page of one.
 */
export function masterOfferingPriceListUrl(
  query: MasterOfferingCatalogQuery = {},
  format: MasterOfferingPriceListFormat = "csv",
): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.families?.length) params.set("families", query.families.join(","));
  if (query.states?.length) params.set("states", query.states.join(","));
  if (query.categories?.length) {
    params.set("categories", query.categories.join(","));
  }
  params.set("format", format);
  return `${API_BASE}/price-list?${params.toString()}`;
}

/**
 * Read catalog state out of a browser query string, dropping anything the
 * closed vocabulary does not recognize. A hand-edited URL narrows or clears a
 * filter; it can never widen audience, breadth, or commerce.
 */
export function parseCatalogQueryFromSearch(
  search: string,
): MasterOfferingCatalogQuery {
  const params = new URLSearchParams(search);
  const families = (params.get("families") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isMasterOfferingFamily);
  const states = (params.get("states") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isMasterOfferingDisplayState);
  const categories = (params.get("categories") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(isMasterOfferingCategorySlug)
    .slice(0, MASTER_OFFERING_MAX_CATEGORY_FILTERS);
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  const q = (params.get("q") ?? "").trim().slice(0, 160);
  return {
    ...(q ? { q } : {}),
    ...(families.length ? { families } : {}),
    ...(states.length ? { states } : {}),
    ...(categories.length ? { categories } : {}),
    ...(isMasterOfferingSort(sort) ? { sort } : {}),
    ...(Number.isSafeInteger(page) && page > 0 ? { page } : {}),
    ...(Number.isSafeInteger(pageSize) &&
    pageSize > 0 &&
    pageSize <= MASTER_OFFERING_MAX_PAGE_SIZE
      ? { pageSize }
      : {}),
  };
}

/** Serialize catalog state back into a browser query string. */
export function catalogQueryToSearch(
  query: MasterOfferingCatalogQuery,
): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.families?.length) params.set("families", query.families.join(","));
  if (query.states?.length) params.set("states", query.states.join(","));
  if (query.categories?.length) {
    params.set("categories", query.categories.join(","));
  }
  if (query.sort !== undefined) params.set("sort", query.sort);
  if (query.page !== undefined && query.page > 1) {
    params.set("page", String(query.page));
  }
  // Page size is written only when it is a usable, server-acceptable size. The
  // default is the server's, so an absent pageSize is the honest way to say
  // "whatever the catalog decides", and writing it out would freeze today's
  // default into every shared link.
  if (
    query.pageSize !== undefined &&
    Number.isSafeInteger(query.pageSize) &&
    query.pageSize > 0 &&
    query.pageSize <= MASTER_OFFERING_MAX_PAGE_SIZE
  ) {
    params.set("pageSize", String(query.pageSize));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * The v1 member product page. Kept exactly as it was because the v1 member
 * catalog still links this way. It cannot serve a v2 offering: v2 slugs are
 * family-prefixed (`research-vials-bpc-157`) and are keyed in a different
 * store, so `ProductPage` re-checks the slug and falls quietly to
 * `unavailable`. Use `fullCatalogProductHref` for a v2 offering.
 */
export function memberOfferingDetailHref(slug: string): string {
  return `/research/member/products/${encodeURIComponent(slug)}`;
}

/** The routed page for the full catalog list. */
export function fullCatalogHref(
  query: MasterOfferingCatalogQuery = {},
): string {
  return `${FULL_CATALOG_PATH}${catalogQueryToSearch(query)}`;
}

/**
 * The routed page for one v2 offering.
 *
 * Both segments are load bearing. The v2 detail API is
 * `/products/:family/:slug`, and the detail surface needs both, so a link that
 * carried only the slug could not restore the view it points at.
 */
export function fullCatalogProductHref(
  family: MasterOfferingFamily,
  slug: string,
): string {
  return `${FULL_CATALOG_PATH}/${encodeURIComponent(family)}/${encodeURIComponent(slug)}`;
}

/**
 * Adapter shape only. The values must come from the final accepted quantity
 * authority after rebase; this packet deliberately defines no 1/20 constants.
 */
export interface AcceptedExactVariantQuantityCapability {
  source: "accepted_quantity_policy";
  productId: string;
  variantId: string;
  minimum: number;
  maximum: number;
  aggregateMaximum: number;
  sourceVersion: string;
}

export type PurchaseQuantityControl =
  | { visible: false }
  | {
      visible: true;
      minimum: number;
      maximum: number;
      aggregateMaximum: number;
      sourceVersion: string;
    };

function validCapability(
  value: AcceptedExactVariantQuantityCapability | null,
): value is AcceptedExactVariantQuantityCapability {
  return (
    value !== null &&
    typeof value === "object" &&
    value.source === "accepted_quantity_policy" &&
    typeof value.productId === "string" &&
    value.productId.trim() !== "" &&
    typeof value.variantId === "string" &&
    value.variantId.trim() !== "" &&
    Number.isSafeInteger(value.minimum) &&
    value.minimum > 0 &&
    Number.isSafeInteger(value.maximum) &&
    value.maximum >= value.minimum &&
    Number.isSafeInteger(value.aggregateMaximum) &&
    value.aggregateMaximum >= value.maximum &&
    typeof value.sourceVersion === "string" &&
    value.sourceVersion.trim() !== ""
  );
}

/** Planning and request actions can never produce a purchase quantity control. */
export function purchaseQuantityControl(
  action: MasterOfferingAction,
  capability: AcceptedExactVariantQuantityCapability | null,
): PurchaseQuantityControl {
  if (
    action.kind !== "add_to_cart" ||
    !validCapability(capability) ||
    capability.productId !== action.productId ||
    capability.variantId !== action.variantId
  ) {
    return { visible: false };
  }
  return {
    visible: true,
    minimum: capability.minimum,
    maximum: capability.maximum,
    aggregateMaximum: capability.aggregateMaximum,
    sourceVersion: capability.sourceVersion,
  };
}

export const MASTER_OFFERING_FILTER_STATES: readonly MasterOfferingDisplayState[] = [
  "available_now",
  "available_this_week",
  "request_access",
  "approval_required",
  "temporarily_unavailable",
  "coming_soon",
  "care_pathway",
  "planned",
  "unavailable",
];
