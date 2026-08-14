import {
  KRIS_CHANNELS,
  KRIS_CHANNEL_LABELS,
  KRIS_FAMILIES,
  KRIS_FAMILY_LABELS,
  isKrisChannel,
  isKrisFamily,
  isKrisPriceProfile,
  isKrisPurchaseMode,
  isKrisSort,
  type KrisAccessPolicy,
  type KrisCatalogDetailView,
  type KrisCatalogErrorResponse,
  type KrisCatalogFacets,
  type KrisCatalogItemView,
  type KrisCatalogPage,
  type KrisCatalogQuery,
  type KrisFamily,
  type KrisLegacyOrderSelection,
  type KrisPathwayView,
  type KrisPriceView,
} from "@shared/research/kris-launch-a/contract";
import { EARLY_ACCESS_MAX_QUANTITY } from "@shared/research/early-access-quantity";
import { apiGet, type ApiResult } from "../lib/api";
import {
  KRIS_MAX_PAGE_SIZE,
  krisCatalogUrl,
  krisDetailUrl,
} from "./integration-packet";

/**
 * The read adapter for the private Kris catalog.
 *
 * A 200 is not trusted merely because it is JSON. Both success surfaces are
 * projected field by field through the complete browser contract, so a partial
 * envelope, a malformed nested authority, or a private field added to the
 * server record cannot silently become client state.
 */

type UnknownRecord = Record<string, unknown>;

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,191}$/;
const CURRENCY = /^[A-Z]{3}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function nullableNonBlank(value: unknown): string | null | undefined {
  return value === null ? null : (nonBlank(value) ?? undefined);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) {
    return false;
  }
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function stringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(nonBlank);
  return values.every((entry): entry is string => entry !== null)
    ? values
    : null;
}

function parsePrice(value: unknown): KrisPriceView | null {
  const candidate = record(value);
  if (candidate === null) return null;
  if (candidate.state === "pending") {
    return candidate.display === "Price pending"
      ? { state: "pending", display: "Price pending" }
      : null;
  }
  if (candidate.state !== "priced") return null;
  const amountCents = positiveInteger(candidate.amountCents);
  const currency = nonBlank(candidate.currency);
  const display = nonBlank(candidate.display);
  const basis = nonBlank(candidate.basis);
  if (
    amountCents === null ||
    currency === null ||
    !CURRENCY.test(currency) ||
    display === null ||
    display !== `$${(amountCents / 100).toFixed(2)}` ||
    basis === null
  ) {
    return null;
  }
  return { state: "priced", amountCents, currency, display, basis };
}

function parseAccess(
  value: unknown,
  channel: KrisCatalogItemView["channel"],
): KrisAccessPolicy | null {
  const candidate = record(value);
  const statusLabel = nonBlank(candidate?.statusLabel);
  const notices = stringList(candidate?.notices);
  if (
    candidate === null ||
    candidate.channel !== channel ||
    statusLabel === null ||
    notices === null ||
    candidate.purchasable !== false
  ) {
    return null;
  }
  return { channel, statusLabel, notices, purchasable: false };
}

function parseLegacyOrder(
  value: unknown,
): KrisLegacyOrderSelection | null | undefined {
  if (value === null) return null;
  const candidate = record(value);
  const productId = nonBlank(candidate?.productId);
  const variantId = nonBlank(candidate?.variantId);
  const unitPriceCents = positiveInteger(candidate?.unitPriceCents);
  const currency = nonBlank(candidate?.currency);
  const quantityLimit = positiveInteger(candidate?.quantityLimit);
  const evaluatedAt = nonBlank(candidate?.evaluatedAt);
  if (
    candidate === null ||
    productId === null ||
    !SAFE_IDENTIFIER.test(productId) ||
    variantId === null ||
    !SAFE_IDENTIFIER.test(variantId) ||
    unitPriceCents === null ||
    currency === null ||
    !CURRENCY.test(currency) ||
    quantityLimit === null ||
    quantityLimit > EARLY_ACCESS_MAX_QUANTITY ||
    !isCanonicalTimestamp(evaluatedAt)
  ) {
    return undefined;
  }
  return {
    productId,
    variantId,
    unitPriceCents,
    currency,
    quantityLimit,
    evaluatedAt,
  };
}

function parsePathway(
  value: unknown,
  purchaseMode: KrisCatalogItemView["purchaseMode"],
): KrisPathwayView | null | undefined {
  if (purchaseMode === "direct_eligible") {
    return value === null ? null : undefined;
  }
  const candidate = record(value);
  const request = record(candidate?.request);
  const headline = nonBlank(candidate?.headline);
  const explanation = nonBlank(candidate?.explanation);
  const label = nonBlank(request?.label);
  const subject = nonBlank(request?.subject);
  if (
    candidate === null ||
    candidate.kind !== purchaseMode ||
    headline === null ||
    explanation === null ||
    request === null ||
    label === null ||
    subject === null
  ) {
    return undefined;
  }
  return {
    kind: purchaseMode,
    headline,
    explanation,
    request: { label, subject },
  };
}

function parseItem(value: unknown): KrisCatalogItemView | null {
  const candidate = record(value);
  if (candidate === null) return null;

  const id = nonBlank(candidate.id);
  const slug = nonBlank(candidate.slug);
  const displayName = nonBlank(candidate.displayName);
  const specification = nonBlank(candidate.specification);
  const format = stringValue(candidate.format);
  const packBasis = stringValue(candidate.packBasis);
  const suppliedNote = stringValue(candidate.suppliedNote);
  const dosageForm = nullableNonBlank(candidate.dosageForm);
  const moq = candidate.moq === null ? null : positiveInteger(candidate.moq);
  const family = candidate.family;
  const channel = candidate.channel;
  const purchaseMode = candidate.purchaseMode;
  if (
    id === null ||
    !SAFE_IDENTIFIER.test(id) ||
    slug === null ||
    !SAFE_SLUG.test(slug) ||
    displayName === null ||
    specification === null ||
    format === null ||
    packBasis === null ||
    suppliedNote === null ||
    dosageForm === undefined ||
    (moq === null && candidate.moq !== null) ||
    !isKrisFamily(family) ||
    candidate.familyLabel !== KRIS_FAMILY_LABELS[family] ||
    !isKrisChannel(channel) ||
    candidate.channelLabel !== KRIS_CHANNEL_LABELS[channel] ||
    !isKrisPurchaseMode(purchaseMode) ||
    typeof candidate.canBuyNow !== "boolean"
  ) {
    return null;
  }

  const price = parsePrice(candidate.price);
  const access = parseAccess(candidate.access, channel);
  const legacyOrder = parseLegacyOrder(candidate.legacyOrder);
  const pathway = parsePathway(candidate.pathway, purchaseMode);
  if (
    price === null ||
    access === null ||
    legacyOrder === undefined ||
    pathway === undefined
  ) {
    return null;
  }

  const mayBuy = purchaseMode === "direct_eligible" && legacyOrder !== null;
  if (
    candidate.canBuyNow !== mayBuy ||
    (price.state === "pending") !== (purchaseMode === "price_pending") ||
    (purchaseMode !== "direct_eligible" && legacyOrder !== null) ||
    (legacyOrder !== null &&
      (price.state !== "priced" ||
        legacyOrder.unitPriceCents !== price.amountCents ||
        legacyOrder.currency !== price.currency))
  ) {
    return null;
  }

  return {
    id,
    slug,
    displayName,
    specification,
    family,
    familyLabel: KRIS_FAMILY_LABELS[family],
    channel,
    channelLabel: KRIS_CHANNEL_LABELS[channel],
    format,
    packBasis,
    moq,
    dosageForm,
    price,
    access,
    purchaseMode,
    legacyOrder,
    canBuyNow: candidate.canBuyNow,
    pathway,
    suppliedNote,
  };
}

function parseFacetBucket(
  value: unknown,
  vocabulary: "family" | "channel",
  expectedValue: string,
): KrisCatalogFacets["families"][number] | null {
  const candidate = record(value);
  const count = nonNegativeInteger(candidate?.count);
  const facetValue = candidate?.value;
  if (candidate === null || count === null || facetValue !== expectedValue) {
    return null;
  }
  const expectedLabel =
    vocabulary === "family" && isKrisFamily(facetValue)
      ? KRIS_FAMILY_LABELS[facetValue]
      : vocabulary === "channel" && isKrisChannel(facetValue)
        ? KRIS_CHANNEL_LABELS[facetValue]
        : null;
  return expectedLabel !== null && candidate.label === expectedLabel
    ? { value: facetValue, label: expectedLabel, count }
    : null;
}

function parseFacets(value: unknown): KrisCatalogFacets | null {
  const candidate = record(value);
  const familyValues = candidate?.families;
  const channelValues = candidate?.channels;
  if (
    candidate === null ||
    !Array.isArray(familyValues) ||
    familyValues.length !== KRIS_FAMILIES.length ||
    !Array.isArray(channelValues) ||
    channelValues.length !== KRIS_CHANNELS.length
  ) {
    return null;
  }
  const families = KRIS_FAMILIES.map((value, index) =>
    parseFacetBucket(familyValues[index], "family", value),
  );
  const channels = KRIS_CHANNELS.map((value, index) =>
    parseFacetBucket(channelValues[index], "channel", value),
  );
  return families.every(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  ) &&
    channels.every(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    )
    ? { families, channels }
    : null;
}

function parseCatalogPage(value: unknown): KrisCatalogPage | null {
  const candidate = record(value);
  if (candidate === null || candidate.ok !== true) return null;
  const page = positiveInteger(candidate.page);
  const pageSize = positiveInteger(candidate.pageSize);
  const total = nonNegativeInteger(candidate.total);
  const totalPages = nonNegativeInteger(candidate.totalPages);
  const facets = parseFacets(candidate.facets);
  if (
    !isKrisPriceProfile(candidate.profile) ||
    page === null ||
    pageSize === null ||
    pageSize > KRIS_MAX_PAGE_SIZE ||
    total === null ||
    totalPages === null ||
    !isKrisSort(candidate.sort) ||
    facets === null ||
    !Array.isArray(candidate.items)
  ) {
    return null;
  }
  const items = candidate.items.map(parseItem);
  if (
    !items.every((entry): entry is KrisCatalogItemView => entry !== null) ||
    totalPages !== (total === 0 ? 0 : Math.ceil(total / pageSize)) ||
    items.length !==
      Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize))
  ) {
    return null;
  }
  return {
    ok: true,
    profile: candidate.profile,
    page,
    pageSize,
    total,
    totalPages,
    sort: candidate.sort,
    facets,
    items,
  };
}

interface KrisCatalogDetailResponse {
  ok: true;
  profile: KrisCatalogPage["profile"];
  product: KrisCatalogDetailView;
}

function parseDetailResponse(value: unknown): KrisCatalogDetailResponse | null {
  const candidate = record(value);
  if (
    candidate === null ||
    candidate.ok !== true ||
    !isKrisPriceProfile(candidate.profile)
  ) {
    return null;
  }
  const item = parseItem(candidate.product);
  const product = record(candidate.product);
  const disclosures = stringList(product?.disclosures);
  return item !== null && disclosures !== null
    ? {
        ok: true,
        profile: candidate.profile,
        product: { ...item, disclosures },
      }
    : null;
}

function errorCode(value: unknown): string | undefined {
  const candidate = record(value);
  return candidate?.ok === false && typeof candidate.code === "string"
    ? candidate.code
    : undefined;
}

function errorMessage(value: unknown): string | undefined {
  const candidate = record(value);
  return typeof candidate?.message === "string" ? candidate.message : undefined;
}

/**
 * Detail needs one local exception to the shared client: a mounted 404 with
 * `kris_catalog_not_found` is a real empty address, while generic API 404s are
 * intentionally treated as unpublished/unavailable. No other consumer's 404
 * behavior changes.
 */
async function getKrisDetailEnvelope(
  path: string,
  token: string | null,
): Promise<ApiResult<unknown>> {
  try {
    const response = await fetch(path, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;
    const code = errorCode(body);
    const message = errorMessage(body);

    if (response.status === 401) {
      return code === "kris_catalog_not_found"
        ? { kind: "unauthorized" }
        : { kind: "unauthorized", code };
    }
    if (response.status === 403) {
      if (code === "kris_catalog_not_found") {
        return { kind: "forbidden", message };
      }
      return code === undefined
        ? { kind: "forbidden", message }
        : { kind: "denied", code, message };
    }
    if (response.status === 404) {
      return code === "kris_catalog_not_found"
        ? { kind: "denied", code, message }
        : { kind: "unavailable" };
    }
    if (response.status === 501 || response.status === 503) {
      return { kind: "unavailable" };
    }
    if (response.ok && !contentType.includes("application/json")) {
      return { kind: "unavailable" };
    }
    // This machine code has meaning only on the mounted detail route's 404.
    // A contradictory success/error status must not render an honest missing
    // address for a response the server contract never emits.
    if (code === "kris_catalog_not_found") {
      return response.ok
        ? { kind: "unavailable" }
        : {
            kind: "error",
            message: message ?? "Something went wrong. Please try again.",
          };
    }
    if (code !== undefined) return { kind: "denied", code, message };
    if (!response.ok || body === null) {
      return {
        kind: "error",
        message: message ?? "Something went wrong. Please try again.",
      };
    }
    return { kind: "ok", data: body };
  } catch {
    return {
      kind: "error",
      message: "The connection failed. Please try again.",
    };
  }
}

export async function getKrisCatalog(
  token: string | null,
  query: KrisCatalogQuery = {},
): Promise<ApiResult<KrisCatalogPage>> {
  const result = await apiGet<unknown>(krisCatalogUrl(query), token);
  if (result.kind !== "ok") return result;
  const page = parseCatalogPage(result.data);
  return page === null ? { kind: "unavailable" } : { kind: "ok", data: page };
}

export async function getKrisDetail(
  token: string | null,
  family: KrisFamily,
  slug: string,
): Promise<ApiResult<KrisCatalogDetailView>> {
  const result = await getKrisDetailEnvelope(
    krisDetailUrl(family, slug),
    token,
  );
  if (result.kind !== "ok") return result;
  const response = parseDetailResponse(result.data);
  if (
    response === null ||
    response.product.slug !== slug ||
    response.product.family !== family
  ) {
    return { kind: "unavailable" };
  }
  return { kind: "ok", data: response.product };
}

/**
 * What a Launch A surface may be in.
 *
 * `unavailable` and an empty result set are different states with different
 * copy and different recovery. A signed-in member outside the launch scope is
 * also restricted, not signed out.
 */
export type KrisSurfaceState =
  | "loading"
  | "ok"
  | "unauthorized"
  | "restricted"
  | "not_found"
  | "unavailable"
  | "error";

const STATE_BY_CODE: Readonly<
  Record<KrisCatalogErrorResponse["code"], KrisSurfaceState>
> = {
  kris_catalog_disabled: "unavailable",
  kris_catalog_auth_required: "unauthorized",
  kris_catalog_forbidden: "restricted",
  kris_catalog_invalid_request: "error",
  kris_catalog_not_found: "not_found",
  kris_catalog_unavailable: "unavailable",
};

function isKrisErrorCode(
  value: string | undefined,
): value is KrisCatalogErrorResponse["code"] {
  return (
    value !== undefined &&
    Object.prototype.hasOwnProperty.call(STATE_BY_CODE, value)
  );
}

/** Map a machine response to presentation state without parsing prose. */
export function toKrisSurfaceState(
  result: ApiResult<unknown>,
): KrisSurfaceState {
  switch (result.kind) {
    case "ok":
      return "ok";
    case "unauthorized":
      return isKrisErrorCode(result.code)
        ? STATE_BY_CODE[result.code]
        : "unauthorized";
    case "denied":
    case "forbidden":
      return isKrisErrorCode(result.code)
        ? STATE_BY_CODE[result.code]
        : "restricted";
    case "unavailable":
      return "unavailable";
    case "error":
      return isKrisErrorCode(result.code)
        ? STATE_BY_CODE[result.code]
        : "error";
  }
}

/** Copy for each non-ok state. Neutral, and never blames the member. */
export const KRIS_STATE_COPY: Readonly<
  Record<
    Exclude<KrisSurfaceState, "ok" | "loading">,
    { title: string; body: string }
  >
> = {
  unauthorized: {
    title: "Please sign in to view this catalog.",
    body: "This catalog and its prices are private to your account.",
  },
  restricted: {
    title: "This catalog is not open to your account yet.",
    body: "Nothing is wrong with your account. Your access is being set up.",
  },
  not_found: {
    title: "That item is not in this catalog.",
    body: "It may have been renamed. Search the catalog to find it.",
  },
  unavailable: {
    title: "This catalog is not available right now.",
    body: "It is being prepared, and no items are missing from it. Please try again shortly.",
  },
  error: {
    title: "The catalog could not be loaded.",
    body: "Please try again.",
  },
};

/** Empty filters are not an API failure and get a different recovery action. */
export const KRIS_EMPTY_RESULT_COPY = {
  title: "Nothing matches these filters.",
  body: "Clear the search, or widen the family and access filters.",
} as const;
