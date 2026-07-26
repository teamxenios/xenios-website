import {
  PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS,
  type AdminProductMedia,
  type AdminProductPrice,
} from "@shared/research/product-admin";
import type {
  CartAudienceEligibility,
  CartProductSelection,
  CartProductSelectionFailureCode,
  CartProductSelectionRequest,
  CartProductSelectionResult,
  CartProductSelectionSource,
} from "@shared/research/cart-product-selection";
import { CART_PURCHASE_AUDIENCES } from "@shared/research/cart-product-selection";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";

const REQUIRED_DOMAINS = Array.from(
  new Set(PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map(({ domain }) => domain)),
).sort();

function blocked(code: CartProductSelectionFailureCode): CartProductSelectionResult {
  return { ok: false, code };
}

function strictTimestamp(value: string): number | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (match === null) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return null;
  }

  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function exactOne<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): { value: T | null; count: number } {
  const matches = values.filter(predicate);
  return { value: matches.length === 1 ? matches[0] : null, count: matches.length };
}

function activePrice(
  prices: readonly AdminProductPrice[],
  request: CartProductSelectionRequest,
  evaluatedAt: number,
):
  | CartProductSelectionResult
  | {
      price: AdminProductPrice;
      effectiveAt: number;
      expiresAt: number | null;
    } {
  const identityMatches = prices.filter(
    (price) =>
      price.productId === request.productId &&
      price.variantId === request.variantId &&
      price.audience === request.audience,
  );
  if (identityMatches.length === 0) return blocked("price_missing");

  const currencyMatches = identityMatches.filter(
    (price) => price.currency === request.currency,
  );
  if (currencyMatches.length === 0) return blocked("price_currency_mismatch");

  const approved = currencyMatches.filter(
    (price) => price.status === "active" && Boolean(price.approvedBy),
  );
  if (approved.length === 0) return blocked("price_unapproved");

  const current = approved.filter((price) => {
    const effectiveAt = strictTimestamp(price.effectiveAt);
    const expiresAt =
      price.expiresAt === null ? null : strictTimestamp(price.expiresAt);
    return (
      effectiveAt !== null &&
      effectiveAt <= evaluatedAt &&
      (price.expiresAt === null ||
        (expiresAt !== null && expiresAt > evaluatedAt))
    );
  });
  if (current.length === 0) return blocked("price_stale");
  if (current.length !== 1) return blocked("price_ambiguous");

  const price = current[0];
  if (
    !price.id.trim() ||
    !Number.isSafeInteger(price.amountCents) ||
    price.amountCents < 0 ||
    !Number.isInteger(price.version) ||
    price.version <= 0
  ) {
    return blocked("price_unapproved");
  }
  return {
    price,
    effectiveAt: strictTimestamp(price.effectiveAt)!,
    expiresAt:
      price.expiresAt === null ? null : strictTimestamp(price.expiresAt)!,
  };
}

function approvedPrimaryMedia(
  media: readonly AdminProductMedia[],
  productId: string,
): CartProductSelectionResult | { media: AdminProductMedia } {
  const primary = media.filter(
    (item) => item.productId === productId && item.kind === "primary_image",
  );
  if (primary.length === 0) return blocked("media_missing");
  const approved = primary.filter(
    (item) =>
      item.state === "approved" &&
      Boolean(item.approvedBy) &&
      Boolean(item.id.trim()) &&
      Boolean(item.altText.trim()),
  );
  if (approved.length === 0) return blocked("media_unapproved");
  if (approved.length !== 1) return blocked("media_ambiguous");
  return { media: approved[0] };
}

function exactRequiredInputs(
  values: readonly RequiredInput[],
  productId: string,
):
  | CartProductSelectionResult
  | { inputs: RequiredInput[] } {
  const active = values.filter(
    (input) =>
      input.recordId === productId && input.currentState !== "superseded",
  );

  const inputs: RequiredInput[] = [];
  const ids = new Set<string>();
  for (const binding of PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS) {
    const matches = active.filter(
      (input) =>
        input.key === binding.key &&
        input.domain === binding.domain &&
        input.recordType === binding.recordType &&
        input.recordId === productId,
    );
    if (
      matches.length !== 1 ||
      !["verified", "not_applicable"].includes(matches[0].currentState) ||
      !matches[0].id.trim() ||
      !Number.isInteger(matches[0].version) ||
      matches[0].version <= 0 ||
      ids.has(matches[0].id)
    ) {
      return blocked("required_inputs_incomplete");
    }
    ids.add(matches[0].id);
    inputs.push(matches[0]);
  }

  if (active.length !== PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.length) {
    return blocked("required_inputs_incomplete");
  }
  return { inputs };
}

function exactDomainReadiness(
  values: readonly DomainReadiness[],
): CartProductSelectionResult | { domains: DomainReadiness[] } {
  const domains: DomainReadiness[] = [];
  for (const domain of REQUIRED_DOMAINS) {
    const match = exactOne(values, (item) => item.domain === domain);
    const item = match.value;
    if (
      match.count !== 1 ||
      item === null ||
      item.manifestApproved !== true ||
      item.softwareComplete !== true ||
      item.publicEnabled !== true ||
      item.launchStatus !== "public_enabled" ||
      item.realInputsRequired !== false ||
      !Number.isInteger(item.expectedInputCount) ||
      item.expectedInputCount <= 0 ||
      item.actualInputCount !== item.expectedInputCount ||
      item.blockingInputCount !== 0 ||
      item.blockingKeys.length !== 0 ||
      !item.domain.trim() ||
      !Number.isInteger(item.version) ||
      item.version <= 0
    ) {
      return blocked("readiness_incomplete");
    }
    domains.push(item);
  }
  return { domains };
}

export function selectCartProduct(
  request: CartProductSelectionRequest,
  source: CartProductSelectionSource,
): CartProductSelectionResult {
  const evaluatedAt = strictTimestamp(request.evaluatedAt);
  if (
    !request.productId.trim() ||
    !request.variantId.trim() ||
    !request.currency.trim() ||
    request.currency !== request.currency.toUpperCase() ||
    !(CART_PURCHASE_AUDIENCES as readonly string[]).includes(
      request.audience,
    ) ||
    evaluatedAt === null
  ) {
    return blocked("invalid_request");
  }

  const productMatch = exactOne(
    source.products,
    (product) => product.id === request.productId,
  );
  if (productMatch.count === 0) return blocked("product_missing");
  if (productMatch.count !== 1) return blocked("product_ambiguous");
  const product = productMatch.value!;
  if (product.status !== "published") return blocked("product_not_published");
  if (!product.active) return blocked("product_inactive");
  if (product.visibility === "hidden") return blocked("product_hidden");
  if (product.commerceApproval !== "approved") {
    return blocked("product_commerce_unapproved");
  }
  if (!["in_stock", "low_stock"].includes(product.availability)) {
    return blocked("product_unavailable");
  }

  const audienceEligibility: CartAudienceEligibility | null =
    source.audienceEligibility;
  if (audienceEligibility === null) {
    return blocked("audience_eligibility_missing");
  }
  if (audienceEligibility.audience !== request.audience) {
    return blocked("audience_identity_mismatch");
  }
  if (
    audienceEligibility.state !== "authorized" ||
    !audienceEligibility.sourceVersion.trim() ||
    strictTimestamp(audienceEligibility.evaluatedAt) !== evaluatedAt
  ) {
    return blocked("audience_unauthorized");
  }

  const variantMatch = exactOne(
    source.variants,
    (variant) => variant.id === request.variantId,
  );
  if (variantMatch.count === 0) return blocked("variant_missing");
  if (variantMatch.count !== 1) return blocked("variant_ambiguous");
  const variant = variantMatch.value!;
  if (variant.productId !== product.id) return blocked("variant_product_mismatch");
  if (variant.status !== "approved") return blocked("variant_unapproved");
  if (!variant.active) return blocked("variant_inactive");
  if (request.audience === "member" && !variant.memberEligible) {
    return blocked("member_variant_ineligible");
  }
  if (!variant.sku.trim()) return blocked("variant_sku_missing");

  const priceResult = activePrice(source.prices, request, evaluatedAt);
  if ("ok" in priceResult) return priceResult;
  const mediaResult = approvedPrimaryMedia(source.media, product.id);
  if ("ok" in mediaResult) return mediaResult;
  const inputResult = exactRequiredInputs(source.requiredInputs, product.id);
  if ("ok" in inputResult) return inputResult;
  const readinessResult = exactDomainReadiness(source.readiness);
  if ("ok" in readinessResult) return readinessResult;

  const inventory = source.inventoryEligibility;
  if (inventory === null) return blocked("inventory_eligibility_missing");
  if (
    inventory.productId !== product.id ||
    inventory.variantId !== variant.id
  ) {
    return blocked("inventory_identity_mismatch");
  }
  if (
    inventory.state !== "eligible" ||
    inventory.reason !== null ||
    !inventory.sourceVersion.trim() ||
    strictTimestamp(inventory.evaluatedAt) !== evaluatedAt
  ) {
    return blocked("inventory_unavailable");
  }

  const selection: CartProductSelection = {
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku,
    audience: request.audience,
    audienceEligibility: {
      audience: audienceEligibility.audience,
      state: "authorized",
      sourceVersion: audienceEligibility.sourceVersion,
      evaluatedAt: new Date(evaluatedAt).toISOString(),
    },
    price: {
      id: priceResult.price.id,
      amountCents: priceResult.price.amountCents,
      currency: priceResult.price.currency,
      effectiveAt: new Date(priceResult.effectiveAt).toISOString(),
      expiresAt:
        priceResult.expiresAt === null
          ? null
          : new Date(priceResult.expiresAt).toISOString(),
      version: priceResult.price.version,
    },
    media: {
      id: mediaResult.media.id,
      kind: "primary_image",
      altText: mediaResult.media.altText,
    },
    canonicalReadiness: {
      ready: true,
      verifiedInputCount: inputResult.inputs.length,
      inputVersions: inputResult.inputs
        .map(({ id, version }) => ({ id, version }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      domainVersions: readinessResult.domains
        .map(({ domain, version }) => ({ domain, version }))
        .sort((a, b) => a.domain.localeCompare(b.domain)),
    },
    inventoryEligibility: {
      productId: inventory.productId,
      variantId: inventory.variantId,
      state: "eligible",
      sourceVersion: inventory.sourceVersion,
      evaluatedAt: new Date(evaluatedAt).toISOString(),
    },
    evaluatedAt: new Date(evaluatedAt).toISOString(),
  };
  return { ok: true, selection };
}
