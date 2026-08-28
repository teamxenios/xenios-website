/**
 * Buyer-facing catalog discovery contract.
 *
 * This is an additive presentation boundary. It does not adapt workbook rows,
 * supplier notes, demand, partner requests, or activation records. A producer
 * must publish each field explicitly; missing or malformed evidence fails
 * closed in `parseCatalogDiscoveryItem`.
 */

export const CATALOG_DISCOVERY_STATUSES = [
  "live",
  "request_only",
  "provider_required",
  "documentation_pending",
  "held",
  "unavailable",
  "unknown",
] as const;

export type CatalogDiscoveryStatus =
  (typeof CATALOG_DISCOVERY_STATUSES)[number];

export const CATALOG_DISCOVERY_STATUS_LABELS: Readonly<
  Record<CatalogDiscoveryStatus, string>
> = {
  live: "Live",
  request_only: "Request only",
  provider_required: "Provider required",
  documentation_pending: "Documentation pending",
  held: "Temporarily held",
  unavailable: "Currently unavailable",
  unknown: "Status unknown",
};

export const CATALOG_DISCOVERY_ACCESS_PATHS = [
  "direct_order",
  "request_availability",
  "care",
  "availability_list",
  "none",
  "unknown",
] as const;

export type CatalogDiscoveryAccessPath =
  (typeof CATALOG_DISCOVERY_ACCESS_PATHS)[number];

export const CATALOG_DISCOVERY_ACCESS_PATH_LABELS: Readonly<
  Record<CatalogDiscoveryAccessPath, string>
> = {
  direct_order: "Direct order",
  request_availability: "Request availability",
  care: "Continue through Care",
  availability_list: "Availability list",
  none: "No current access path",
  unknown: "Access path unknown",
};

export interface CatalogDiscoveryFacetValue {
  /** Stable, URL-safe authority-owned key. */
  key: string;
  /** Approved member-facing label. */
  label: string;
}

export interface CatalogDiscoveryImage {
  href: string;
  altText: string;
  /** Explicit intrinsic dimensions from the media presentation authority. */
  width: number;
  height: number;
}

export type CatalogDiscoveryActionKind =
  | "request_order"
  | "request_availability"
  | "continue_care"
  | "join_availability_list";

export const CATALOG_DISCOVERY_ACTION_LABELS: Readonly<
  Record<CatalogDiscoveryActionKind, string>
> = {
  request_order: "Request Order",
  request_availability: "Request Availability",
  continue_care: "Continue through Care",
  join_availability_list: "Join Availability List",
};

export interface CatalogDiscoveryActionDto {
  kind: CatalogDiscoveryActionKind;
  /** Internal Research path; the presentation never follows it automatically. */
  href: string;
}

/**
 * A presentation command, not a commerce command. The surface emits it to its
 * owner and performs no fetch, cart mutation, order, or navigation itself.
 */
export interface CatalogDiscoveryAction {
  kind: CatalogDiscoveryActionKind;
  label: string;
  href: string;
  productId: string;
  variantId: string;
}

export type CatalogDiscoverySavedInterest =
  | {
      availability: "available";
      state: "not_saved";
      revision: number;
    }
  | {
      availability: "available";
      state: "saved";
      interestId: string;
      revision: number;
      recordedAt: string;
    }
  | { availability: "unavailable" };

/** Exact additive DTO a future authority-owned producer must publish. */
export interface CatalogDiscoveryItemDto {
  productId: string;
  variantId: string;
  displayName: string;
  variantLabel: string;
  category: CatalogDiscoveryFacetValue;
  strength: CatalogDiscoveryFacetValue | null;
  form: CatalogDiscoveryFacetValue | null;
  status: CatalogDiscoveryStatus;
  statusExplanation: string | null;
  accessPath: CatalogDiscoveryAccessPath;
  detailHref: string | null;
  image: CatalogDiscoveryImage | null;
  action: CatalogDiscoveryActionDto | null;
  savedInterest: CatalogDiscoverySavedInterest;
}

export type CatalogDiscoverySavedInterestCommand =
  | {
      kind: "save_interest";
      productId: string;
      variantId: string;
      expectedRevision: number;
    }
  | {
      kind: "remove_saved_interest";
      productId: string;
      variantId: string;
      interestId: string;
      expectedRevision: number;
    };

/**
 * Runtime-safe projection consumed by the catalog presentation. Every facet
 * comes from an explicit DTO field; labels are never parsed for strength/form.
 */
export interface CatalogDiscoveryItem {
  productId: string;
  variantId: string;
  displayName: string;
  variantLabel: string;
  category: CatalogDiscoveryFacetValue;
  strength: CatalogDiscoveryFacetValue | null;
  form: CatalogDiscoveryFacetValue | null;
  status: CatalogDiscoveryStatus;
  statusExplanation: string | null;
  accessPath: CatalogDiscoveryAccessPath;
  detailHref: string | null;
  image: CatalogDiscoveryImage | null;
  action: CatalogDiscoveryAction | null;
  savedInterest: CatalogDiscoverySavedInterest;
}

export interface CatalogDiscoveryProjection {
  items: readonly CatalogDiscoveryItem[];
  /** Rows rejected because even their public identity was not safe to show. */
  rejectedCount: number;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
export const CATALOG_DISCOVERY_FACET_KEY_PATTERN =
  /^[a-z0-9][a-z0-9-]{0,63}$/;
const CANONICAL_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  return value.length > 0 && value.length <= maximum ? value : null;
}

function identity(value: unknown): string | null {
  const candidate = exactText(value, 128);
  return candidate && ID_PATTERN.test(candidate) ? candidate : null;
}

function isCatalogDiscoveryStatus(
  value: unknown,
): value is CatalogDiscoveryStatus {
  return (
    typeof value === "string" &&
    (CATALOG_DISCOVERY_STATUSES as readonly string[]).includes(value)
  );
}

function isCatalogDiscoveryAccessPath(
  value: unknown,
): value is CatalogDiscoveryAccessPath {
  return (
    typeof value === "string" &&
    (CATALOG_DISCOVERY_ACCESS_PATHS as readonly string[]).includes(value)
  );
}

function accessPathForStatus(
  status: CatalogDiscoveryStatus,
  value: unknown,
): CatalogDiscoveryAccessPath {
  if (!isCatalogDiscoveryAccessPath(value)) return "unknown";
  const expected: Readonly<
    Record<CatalogDiscoveryStatus, CatalogDiscoveryAccessPath>
  > = {
    live: "direct_order",
    request_only: "request_availability",
    provider_required: "care",
    documentation_pending: "availability_list",
    held: "none",
    unavailable: "none",
    unknown: "unknown",
  };
  return value === expected[status] ? value : "unknown";
}

function facet(value: unknown): CatalogDiscoveryFacetValue | null {
  const source = record(value);
  if (!source) return null;
  const key = exactText(source.key, 64);
  const label = exactText(source.label, 120);
  return key && label && CATALOG_DISCOVERY_FACET_KEY_PATTERN.test(key)
    ? { key, label }
    : null;
}

function safeResearchHref(value: unknown): string | null {
  const href = exactText(value, 500);
  return href &&
    /^\/research(?:\/|$)/.test(href) &&
    !href.startsWith("//") &&
    !/[\\\s]/.test(href)
    ? href
    : null;
}

function safeImageHref(value: unknown): string | null {
  const href = exactText(value, 1_000);
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && !url.username && !url.password
      ? href
      : null;
  } catch {
    return null;
  }
}

function image(value: unknown): CatalogDiscoveryImage | null {
  const source = record(value);
  if (!source) return null;
  const href = safeImageHref(source.href);
  const altText = exactText(source.altText, 300);
  const width = source.width;
  const height = source.height;
  return href &&
    altText &&
    Number.isSafeInteger(width) &&
    Number(width) > 0 &&
    Number(width) <= 16_384 &&
    Number.isSafeInteger(height) &&
    Number(height) > 0 &&
    Number(height) <= 16_384
    ? { href, altText, width: Number(width), height: Number(height) }
    : null;
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_INSTANT.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function savedInterest(value: unknown): CatalogDiscoverySavedInterest {
  const source = record(value);
  if (!source || source.availability !== "available") {
    return { availability: "unavailable" };
  }
  const revision = source.revision;
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) {
    return { availability: "unavailable" };
  }
  if (source.state === "not_saved") {
    return {
      availability: "available",
      state: "not_saved",
      revision: Number(revision),
    };
  }
  const interestId = identity(source.interestId);
  const recordedAt = source.recordedAt;
  if (
    source.state === "saved" &&
    interestId &&
    canonicalInstant(recordedAt)
  ) {
    return {
      availability: "available",
      state: "saved",
      interestId,
      revision: Number(revision),
      recordedAt,
    };
  }
  return { availability: "unavailable" };
}

function compatibleAction(
  value: unknown,
  status: CatalogDiscoveryStatus,
  accessPath: CatalogDiscoveryAccessPath,
  productId: string,
  variantId: string,
): CatalogDiscoveryAction | null {
  const source = record(value);
  if (!source) return null;
  const href = safeResearchHref(source.href);
  if (!href) return null;

  const compatibility: Partial<
    Record<
      CatalogDiscoveryStatus,
      [CatalogDiscoveryAccessPath, CatalogDiscoveryActionKind]
    >
  > = {
    live: ["direct_order", "request_order"],
    request_only: ["request_availability", "request_availability"],
    provider_required: ["care", "continue_care"],
    documentation_pending: ["availability_list", "join_availability_list"],
  };
  const allowed = compatibility[status];
  if (!allowed || accessPath !== allowed[0] || source.kind !== allowed[1]) {
    return null;
  }
  return {
    kind: allowed[1],
    label: CATALOG_DISCOVERY_ACTION_LABELS[allowed[1]],
    href,
    productId,
    variantId,
  };
}

/**
 * Parse one untrusted DTO row. Missing/malformed status and access-path fields
 * stay displayable only as `unknown`; they never borrow meaning from any other
 * field on the row. Invalid public identity rejects the row entirely.
 */
export function parseCatalogDiscoveryItem(
  value: unknown,
): CatalogDiscoveryItem | null {
  const source = record(value);
  if (!source) return null;
  const productId = identity(source.productId);
  const variantId = identity(source.variantId);
  const displayName = exactText(source.displayName, 180);
  const variantLabel = exactText(source.variantLabel, 180);
  const category = facet(source.category);
  if (!productId || !variantId || !displayName || !variantLabel || !category) {
    return null;
  }

  const status = isCatalogDiscoveryStatus(source.status)
    ? source.status
    : "unknown";
  const accessPath = accessPathForStatus(status, source.accessPath);
  const explanation = exactText(source.statusExplanation, 500);

  return {
    productId,
    variantId,
    displayName,
    variantLabel,
    category,
    strength: facet(source.strength),
    form: facet(source.form),
    status,
    statusExplanation: explanation,
    accessPath,
    detailHref: safeResearchHref(source.detailHref),
    image: image(source.image),
    action: compatibleAction(
      source.action,
      status,
      accessPath,
      productId,
      variantId,
    ),
    savedInterest: savedInterest(source.savedInterest),
  };
}

export function parseCatalogDiscoveryProjection(
  values: readonly unknown[],
): CatalogDiscoveryProjection {
  const items: CatalogDiscoveryItem[] = [];
  let rejectedCount = 0;
  for (const value of values) {
    const parsed = parseCatalogDiscoveryItem(value);
    if (parsed) items.push(parsed);
    else rejectedCount += 1;
  }
  return { items, rejectedCount };
}

export function savedInterestCommand(
  item: CatalogDiscoveryItem,
): CatalogDiscoverySavedInterestCommand | null {
  const evidence = item.savedInterest;
  if (evidence.availability !== "available") return null;
  return evidence.state === "saved"
    ? {
        kind: "remove_saved_interest",
        productId: item.productId,
        variantId: item.variantId,
        interestId: evidence.interestId,
        expectedRevision: evidence.revision,
      }
    : {
        kind: "save_interest",
        productId: item.productId,
        variantId: item.variantId,
        expectedRevision: evidence.revision,
      };
}
