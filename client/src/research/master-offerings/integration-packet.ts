import type {
  MasterOfferingAction,
  MasterOfferingCatalogQuery,
  MasterOfferingDisplayState,
  MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";

const API_BASE = "/api/research/catalog-display/v2";

export function masterOfferingCatalogUrl(
  query: MasterOfferingCatalogQuery = {},
): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.families?.length) params.set("families", query.families.join(","));
  if (query.states?.length) params.set("states", query.states.join(","));
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

export function memberOfferingDetailHref(slug: string): string {
  return `/research/member/products/${encodeURIComponent(slug)}`;
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
    value.source === "accepted_quantity_policy" &&
    Number.isSafeInteger(value.minimum) &&
    value.minimum > 0 &&
    Number.isSafeInteger(value.maximum) &&
    value.maximum >= value.minimum &&
    Number.isSafeInteger(value.aggregateMaximum) &&
    value.aggregateMaximum >= value.maximum &&
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
