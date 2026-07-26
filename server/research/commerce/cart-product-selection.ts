import {
  PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS,
  type AdminProductMedia,
  type AdminProductPrice,
} from "@shared/research/product-admin";
import type {
  CartProductSelection,
  CartProductSelectionFailureCode,
  CartProductSelectionRequest,
  CartProductSelectionResult,
  CartProductSelectionSource,
} from "@shared/research/cart-product-selection";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";

const REQUIRED_DOMAINS = Array.from(
  new Set(PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map(({ domain }) => domain)),
).sort();

function blocked(code: CartProductSelectionFailureCode): CartProductSelectionResult {
  return { ok: false, code };
}

function exactIso(value: string): number | null {
  if (!value.trim()) return null;
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
): CartProductSelectionResult | { price: AdminProductPrice } {
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
    const effectiveAt = exactIso(price.effectiveAt);
    const expiresAt =
      price.expiresAt === null ? null : exactIso(price.expiresAt);
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
  return { price };
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
      !["verified", "not_applicable"].includes(matches[0].currentState)
    ) {
      return blocked("required_inputs_incomplete");
    }
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
      item.blockingKeys.length !== 0
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
  const evaluatedAt = exactIso(request.evaluatedAt);
  if (
    !request.productId.trim() ||
    !request.variantId.trim() ||
    !request.currency.trim() ||
    request.currency !== request.currency.toUpperCase() ||
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
    !inventory.sourceVersion.trim() ||
    exactIso(inventory.evaluatedAt) !== evaluatedAt
  ) {
    return blocked("inventory_unavailable");
  }

  const selection: CartProductSelection = {
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku,
    audience: request.audience,
    price: {
      id: priceResult.price.id,
      amountCents: priceResult.price.amountCents,
      currency: priceResult.price.currency,
      effectiveAt: priceResult.price.effectiveAt,
      expiresAt: priceResult.price.expiresAt,
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
    inventoryEligibility: { ...inventory, state: "eligible" },
    evaluatedAt: request.evaluatedAt,
  };
  return { ok: true, selection };
}
