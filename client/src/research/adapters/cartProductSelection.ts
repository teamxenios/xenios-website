import {
  CART_PURCHASE_AUDIENCES,
  CART_PRODUCT_SELECTION_FAILURE_CODES,
  type CartProductSelection,
  type CartProductSelectionFailureCode,
  type CartProductSelectionResult,
} from "@shared/research/cart-product-selection";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIso(value: unknown): value is string {
  if (
    !isText(value) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function validVersionRefs(
  value: unknown,
  identity: "id" | "domain",
): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const identities = new Set<string>();
  for (const item of value) {
    if (
      !isObject(item) ||
      !isText(item[identity]) ||
      !Number.isInteger(item.version) ||
      Number(item.version) <= 0 ||
      identities.has(item[identity] as string)
    ) {
      return false;
    }
    identities.add(item[identity] as string);
  }
  return true;
}

function validSelection(value: unknown): value is CartProductSelection {
  if (!isObject(value)) return false;
  const price = value.price;
  const media = value.media;
  const readiness = value.canonicalReadiness;
  const audienceEligibility = value.audienceEligibility;
  const inventory = value.inventoryEligibility;
  if (
    !isText(value.productId) ||
    !isText(value.variantId) ||
    !isText(value.sku) ||
    !isText(value.audience) ||
    !(CART_PURCHASE_AUDIENCES as readonly string[]).includes(value.audience) ||
    !isIso(value.evaluatedAt) ||
    !isObject(price) ||
    !isObject(media) ||
    !isObject(readiness) ||
    !isObject(audienceEligibility) ||
    !isObject(inventory)
  ) {
    return false;
  }
  if (
    !isText(price.id) ||
    !Number.isSafeInteger(price.amountCents) ||
    Number(price.amountCents) < 0 ||
    !isText(price.currency) ||
    price.currency !== price.currency.toUpperCase() ||
    !isIso(price.effectiveAt) ||
    !(price.expiresAt === null || isIso(price.expiresAt)) ||
    !Number.isInteger(price.version) ||
    Number(price.version) <= 0
  ) {
    return false;
  }
  if (
    !isText(media.id) ||
    media.kind !== "primary_image" ||
    !isText(media.altText)
  ) {
    return false;
  }
  if (
    audienceEligibility.state !== "authorized" ||
    audienceEligibility.audience !== value.audience ||
    !isText(audienceEligibility.sourceVersion) ||
    !isIso(audienceEligibility.evaluatedAt) ||
    audienceEligibility.evaluatedAt !== value.evaluatedAt
  ) {
    return false;
  }
  const evaluatedAt = Date.parse(value.evaluatedAt);
  const effectiveAt = Date.parse(price.effectiveAt as string);
  const expiresAt =
    price.expiresAt === null ? null : Date.parse(price.expiresAt as string);
  if (
    effectiveAt > evaluatedAt ||
    (expiresAt !== null && expiresAt <= evaluatedAt)
  ) {
    return false;
  }
  if (
    readiness.ready !== true ||
    !Number.isInteger(readiness.verifiedInputCount) ||
    Number(readiness.verifiedInputCount) <= 0 ||
    Number(readiness.verifiedInputCount) !==
      (Array.isArray(readiness.inputVersions)
        ? readiness.inputVersions.length
        : -1) ||
    !validVersionRefs(readiness.inputVersions, "id") ||
    !validVersionRefs(readiness.domainVersions, "domain")
  ) {
    return false;
  }
  if (
    inventory.state !== "eligible" ||
    "reason" in inventory ||
    inventory.productId !== value.productId ||
    inventory.variantId !== value.variantId ||
    !isText(inventory.sourceVersion) ||
    !isIso(inventory.evaluatedAt) ||
    inventory.evaluatedAt !== value.evaluatedAt
  ) {
    return false;
  }
  return true;
}

function browserSafeSelection(
  selection: CartProductSelection,
): CartProductSelection {
  return {
    productId: selection.productId,
    variantId: selection.variantId,
    sku: selection.sku,
    audience: selection.audience,
    audienceEligibility: {
      audience: selection.audienceEligibility.audience,
      state: "authorized",
      sourceVersion: selection.audienceEligibility.sourceVersion,
      evaluatedAt: selection.audienceEligibility.evaluatedAt,
    },
    price: {
      id: selection.price.id,
      amountCents: selection.price.amountCents,
      currency: selection.price.currency,
      effectiveAt: selection.price.effectiveAt,
      expiresAt: selection.price.expiresAt,
      version: selection.price.version,
    },
    media: {
      id: selection.media.id,
      kind: "primary_image",
      altText: selection.media.altText,
    },
    canonicalReadiness: {
      ready: true,
      verifiedInputCount: selection.canonicalReadiness.verifiedInputCount,
      inputVersions: selection.canonicalReadiness.inputVersions.map(
        ({ id, version }) => ({ id, version }),
      ),
      domainVersions: selection.canonicalReadiness.domainVersions.map(
        ({ domain, version }) => ({ domain, version }),
      ),
    },
    inventoryEligibility: {
      productId: selection.inventoryEligibility.productId,
      variantId: selection.inventoryEligibility.variantId,
      state: "eligible",
      sourceVersion: selection.inventoryEligibility.sourceVersion,
      evaluatedAt: selection.inventoryEligibility.evaluatedAt,
    },
    evaluatedAt: selection.evaluatedAt,
  };
}

/**
 * Route-free client boundary. It accepts only the server-selected projection
 * and fails closed without attempting to read Product Control or inventory.
 */
export function adaptCartProductSelection(
  value: unknown,
): CartProductSelectionResult {
  if (!isObject(value) || typeof value.ok !== "boolean") {
    return { ok: false, code: "invalid_projection" };
  }
  if (value.ok === false) {
    return typeof value.code === "string" &&
      (CART_PRODUCT_SELECTION_FAILURE_CODES as readonly string[]).includes(
        value.code,
      )
      ? {
          ok: false,
          code: value.code as CartProductSelectionFailureCode,
        }
      : { ok: false, code: "invalid_projection" };
  }
  return validSelection(value.selection)
    ? { ok: true, selection: browserSafeSelection(value.selection) }
    : { ok: false, code: "invalid_projection" };
}
