import {
  CUSTOMER_PRICE_AUDIENCES,
  isValidCartPriceSnapshot,
  type CartPriceSnapshot,
  type CustomerPriceAudience,
} from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import {
  isRuntimeAuthorizedAudience,
  SKU_RESOLVE_FAILURE_REASONS,
  type CartBindingRejectionReason,
} from "../pricing/cart-price-binding";
import type { ServerAuthorizedAudience } from "../pricing/authoritative-price-resolver";
import type {
  CanonicalCartPriceAuthorityPort,
  ProductControlQuantityLimitFact,
  ProductControlQuantityLimitPort,
} from "./authority-port";

const MAX_CART_LINES = 100;
const SKU = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_SOURCE_VERSION = /^[-A-Za-z0-9._:]{1,128}$/;
const CART_BINDING_REJECTION_REASONS = new Set<CartBindingRejectionReason>([
  ...SKU_RESOLVE_FAILURE_REASONS,
  "quantity_invalid",
  "line_total_overflow",
]);

export type PeptideCartRecoveryAction =
  | "correct_request"
  | "merge_duplicate_line"
  | "adjust_quantity"
  | "reauthenticate"
  | "remove_unavailable_item"
  | "request_access"
  | "retry_later"
  | "review_updated_price";

export type PeptideCartRejectionCode =
  | "invalid_request"
  | "invalid_timestamp"
  | "wrong_currency"
  | "wrong_audience"
  | "duplicate_sku"
  | "quantity_invalid"
  | "quantity_policy_unavailable"
  | "price_unavailable"
  | "price_ambiguous"
  | "calculation_overflow"
  | "authority_unavailable";

const RECOVERY_BY_REJECTION: Readonly<
  Record<PeptideCartRejectionCode, PeptideCartRecoveryAction>
> = Object.freeze({
  invalid_request: "correct_request",
  invalid_timestamp: "correct_request",
  wrong_currency: "correct_request",
  wrong_audience: "reauthenticate",
  duplicate_sku: "merge_duplicate_line",
  quantity_invalid: "adjust_quantity",
  quantity_policy_unavailable: "retry_later",
  price_unavailable: "remove_unavailable_item",
  price_ambiguous: "request_access",
  calculation_overflow: "adjust_quantity",
  authority_unavailable: "retry_later",
});

export interface AcceptedPriceFingerprint {
  priceId: string;
  version: number;
  audience: CustomerPriceAudience;
  currency: "USD";
  effectiveAt: string;
  expiresAt: string | null;
}

export interface PeptideCartLineRequest {
  sku: string;
  quantity: number;
  acceptedPrice?: AcceptedPriceFingerprint;
}

export interface PeptideCartProjectionRequest {
  evaluatedAt: string;
  currency: "USD";
  lines: readonly PeptideCartLineRequest[];
}

export interface ProjectedPeptideCartLine {
  productId: string;
  variantId: string;
  sku: string;
  displayName: string;
  quantity: number;
  priceId: string;
  priceVersion: number;
  audience: CustomerPriceAudience;
  currency: "USD";
  unitAmountCents: number;
  lineTotalCents: number;
  effectiveAt: string;
  expiresAt: string | null;
  pricedAt: string;
  quantityLimit: ProductControlQuantityLimitFact;
}

interface ProjectionBase {
  authorityScope: "price_and_quantity_only";
  currency: "USD";
  audience: CustomerPriceAudience;
  evaluatedAt: string;
  lines: readonly ProjectedPeptideCartLine[];
  subtotalCents: number;
}

export interface PeptideCartProjected extends ProjectionBase {
  state: "projected";
}

export interface PeptideCartRepriceRequired extends ProjectionBase {
  state: "reprice_required";
  recovery: "review_updated_price";
  repricedSkus: readonly string[];
}

export interface PeptideCartRejected {
  state: "rejected";
  code: PeptideCartRejectionCode;
  recovery: PeptideCartRecoveryAction;
  lineIndex?: number;
  sku?: string;
  authorityReason?: CartBindingRejectionReason;
}

export type PeptideCartTransactionProjection =
  | PeptideCartProjected
  | PeptideCartRepriceRequired
  | PeptideCartRejected;

export interface PeptideCartTransactionContext {
  authenticatedAudience: ServerAuthorizedAudience;
}

export interface PeptideCartTransactionDeps {
  priceAuthority: CanonicalCartPriceAuthorityPort;
  quantityLimits: ProductControlQuantityLimitPort;
}

type PreflightSuccess = {
  ok: true;
  request: PeptideCartProjectionRequest;
  audience: CustomerPriceAudience;
  evaluatedAtMillis: number;
};

type PreflightResult = PreflightSuccess | { ok: false; rejection: PeptideCartRejected };

function rejected(
  code: PeptideCartRejectionCode,
  details: Pick<
    PeptideCartRejected,
    "lineIndex" | "sku" | "authorityReason"
  > = {},
): PeptideCartRejected {
  return {
    state: "rejected",
    code,
    recovery: RECOVERY_BY_REJECTION[code],
    ...details,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isCanonicalTimestamp(value: unknown): value is string {
  return typeof value === "string" && parseProductControlTimestamp(value) !== null;
}

function isCartBindingRejectionReason(
  value: unknown,
): value is CartBindingRejectionReason {
  return (
    typeof value === "string" &&
    CART_BINDING_REJECTION_REASONS.has(value as CartBindingRejectionReason)
  );
}

function validateFingerprint(
  value: unknown,
  audience: CustomerPriceAudience,
): { ok: true; value: AcceptedPriceFingerprint } | { ok: false; code: PeptideCartRejectionCode } {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "priceId",
      "version",
      "audience",
      "currency",
      "effectiveAt",
      "expiresAt",
    ]) ||
    typeof value.priceId !== "string" ||
    !UUID.test(value.priceId) ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1 ||
    !(CUSTOMER_PRICE_AUDIENCES as readonly unknown[]).includes(value.audience) ||
    !isCanonicalTimestamp(value.effectiveAt) ||
    !(value.expiresAt === null || isCanonicalTimestamp(value.expiresAt))
  ) {
    return { ok: false, code: "invalid_request" };
  }
  if (value.currency !== "USD") return { ok: false, code: "wrong_currency" };
  if (value.audience !== audience) return { ok: false, code: "wrong_audience" };
  return { ok: true, value: value as unknown as AcceptedPriceFingerprint };
}

function preflight(
  value: unknown,
  context: PeptideCartTransactionContext,
): PreflightResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["evaluatedAt", "currency", "lines"]) ||
    !Array.isArray(value.lines) ||
    value.lines.length < 1 ||
    value.lines.length > MAX_CART_LINES
  ) {
    return { ok: false, rejection: rejected("invalid_request") };
  }
  if (!isCanonicalTimestamp(value.evaluatedAt)) {
    return { ok: false, rejection: rejected("invalid_timestamp") };
  }
  if (value.currency !== "USD") {
    return { ok: false, rejection: rejected("wrong_currency") };
  }

  const evaluatedAtMillis = parseProductControlTimestamp(value.evaluatedAt);
  if (
    evaluatedAtMillis === null ||
    !isRuntimeAuthorizedAudience(
      context.authenticatedAudience,
      evaluatedAtMillis,
    ) ||
    context.authenticatedAudience.evaluatedAt !== value.evaluatedAt
  ) {
    return { ok: false, rejection: rejected("wrong_audience") };
  }
  const audience = context.authenticatedAudience.audience;
  const seenSkus = new Set<string>();
  const lines: PeptideCartLineRequest[] = [];

  for (let index = 0; index < value.lines.length; index += 1) {
    const line = value.lines[index];
    if (
      !isRecord(line) ||
      !hasExactKeys(line, ["sku", "quantity"], ["acceptedPrice"]) ||
      typeof line.sku !== "string" ||
      !SKU.test(line.sku) ||
      !Number.isSafeInteger(line.quantity) ||
      (line.quantity as number) < 1
    ) {
      return {
        ok: false,
        rejection: rejected("invalid_request", { lineIndex: index }),
      };
    }
    if (seenSkus.has(line.sku)) {
      return {
        ok: false,
        rejection: rejected("duplicate_sku", {
          lineIndex: index,
          sku: line.sku,
        }),
      };
    }
    seenSkus.add(line.sku);

    let acceptedPrice: AcceptedPriceFingerprint | undefined;
    if (Object.hasOwn(line, "acceptedPrice")) {
      const fingerprint = validateFingerprint(line.acceptedPrice, audience);
      if (!fingerprint.ok) {
        return {
          ok: false,
          rejection: rejected(fingerprint.code, {
            lineIndex: index,
            sku: line.sku,
          }),
        };
      }
      acceptedPrice = fingerprint.value;
    }
    lines.push({
      sku: line.sku,
      quantity: line.quantity as number,
      ...(acceptedPrice === undefined ? {} : { acceptedPrice }),
    });
  }

  return {
    ok: true,
    request: {
      evaluatedAt: value.evaluatedAt,
      currency: "USD",
      lines,
    },
    audience,
    evaluatedAtMillis,
  };
}

function parseQuantityLimits(
  value: unknown,
  skus: readonly string[],
  evaluatedAtMillis: number,
): Map<string, ProductControlQuantityLimitFact> | null {
  if (!Array.isArray(value) || value.length !== skus.length) return null;
  const requested = new Set(skus);
  const parsed = new Map<string, ProductControlQuantityLimitFact>();

  for (const fact of value) {
    if (
      !isRecord(fact) ||
      !hasExactKeys(fact, [
        "sku",
        "minQuantity",
        "maxQuantity",
        "increment",
        "sourceVersion",
        "effectiveAt",
        "expiresAt",
      ]) ||
      typeof fact.sku !== "string" ||
      !requested.has(fact.sku) ||
      parsed.has(fact.sku) ||
      !Number.isSafeInteger(fact.minQuantity) ||
      (fact.minQuantity as number) < 1 ||
      !Number.isSafeInteger(fact.maxQuantity) ||
      (fact.maxQuantity as number) < (fact.minQuantity as number) ||
      !Number.isSafeInteger(fact.increment) ||
      (fact.increment as number) < 1 ||
      typeof fact.sourceVersion !== "string" ||
      !OPAQUE_SOURCE_VERSION.test(fact.sourceVersion) ||
      !isCanonicalTimestamp(fact.effectiveAt) ||
      !(fact.expiresAt === null || isCanonicalTimestamp(fact.expiresAt))
    ) {
      return null;
    }
    const effectiveAt = parseProductControlTimestamp(fact.effectiveAt);
    const expiresAt =
      fact.expiresAt === null
        ? null
        : parseProductControlTimestamp(fact.expiresAt);
    if (
      effectiveAt === null ||
      effectiveAt > evaluatedAtMillis ||
      (expiresAt !== null && expiresAt <= evaluatedAtMillis)
    ) {
      return null;
    }
    parsed.set(
      fact.sku,
      Object.freeze({
        sku: fact.sku,
        minQuantity: fact.minQuantity as number,
        maxQuantity: fact.maxQuantity as number,
        increment: fact.increment as number,
        sourceVersion: fact.sourceVersion,
        effectiveAt: fact.effectiveAt,
        expiresAt: fact.expiresAt,
      }),
    );
  }
  return parsed.size === requested.size ? parsed : null;
}

function mapAuthorityReason(
  reason: CartBindingRejectionReason,
): PeptideCartRejectionCode {
  switch (reason) {
    case "invalid_instant":
      return "invalid_timestamp";
    case "wrong_currency":
      return "wrong_currency";
    case "wrong_audience":
    case "audience_unauthorized":
      return "wrong_audience";
    case "quantity_invalid":
      return "quantity_invalid";
    case "line_total_overflow":
      return "calculation_overflow";
    case "price_ambiguous":
      return "price_ambiguous";
    case "sku_unknown":
    case "price_missing":
    case "price_inactive":
    case "price_future":
    case "price_expired":
    case "price_unapproved":
    case "product_inactive":
    case "variant_inactive":
    case "variant_unapproved":
    case "member_ineligible":
      return "price_unavailable";
    default:
      return "authority_unavailable";
  }
}

function isCanonicalSnapshot(
  value: unknown,
  line: PeptideCartLineRequest,
  audience: CustomerPriceAudience,
  evaluatedAt: string,
  evaluatedAtMillis: number,
): value is CartPriceSnapshot {
  if (!isValidCartPriceSnapshot(value)) return false;
  const effectiveAt = parseProductControlTimestamp(value.effectiveAt);
  const expiresAt =
    value.expiresAt === null
      ? null
      : parseProductControlTimestamp(value.expiresAt);
  return (
    value.sku === line.sku &&
    value.quantity === line.quantity &&
    value.audience === audience &&
    value.currency === "USD" &&
    value.pricedAt === evaluatedAt &&
    parseProductControlTimestamp(value.pricedAt) === evaluatedAtMillis &&
    effectiveAt !== null &&
    effectiveAt <= evaluatedAtMillis &&
    (expiresAt === null || expiresAt > evaluatedAtMillis) &&
    UUID.test(value.priceId)
  );
}

function fingerprintMatches(
  fingerprint: AcceptedPriceFingerprint,
  snapshot: CartPriceSnapshot,
): boolean {
  return (
    fingerprint.priceId === snapshot.priceId &&
    fingerprint.version === snapshot.priceVersion &&
    fingerprint.audience === snapshot.audience &&
    fingerprint.currency === snapshot.currency &&
    fingerprint.effectiveAt === snapshot.effectiveAt &&
    fingerprint.expiresAt === snapshot.expiresAt
  );
}

function projectLine(
  snapshot: CartPriceSnapshot,
  quantityLimit: ProductControlQuantityLimitFact,
): ProjectedPeptideCartLine {
  return Object.freeze({
    productId: snapshot.productId,
    variantId: snapshot.variantId,
    sku: snapshot.sku,
    displayName: snapshot.displayName,
    quantity: snapshot.quantity,
    priceId: snapshot.priceId,
    priceVersion: snapshot.priceVersion,
    audience: snapshot.audience,
    currency: snapshot.currency,
    unitAmountCents: snapshot.unitAmountCents,
    lineTotalCents: snapshot.lineTotalCents,
    effectiveAt: snapshot.effectiveAt,
    expiresAt: snapshot.expiresAt,
    pricedAt: snapshot.pricedAt,
    quantityLimit,
  });
}

/**
 * Build a server-authoritative price/quantity projection for a peptide cart.
 * This result is deliberately not checkout authorization: inventory,
 * documentation, media, payment, reservation, and fulfillment remain separate
 * mandatory gates. Client prices and totals are not accepted input fields.
 */
export async function projectPeptideCartTransaction(
  requestValue: unknown,
  context: PeptideCartTransactionContext,
  deps: PeptideCartTransactionDeps,
): Promise<PeptideCartTransactionProjection> {
  const checked = preflight(requestValue, context);
  if (!checked.ok) return checked.rejection;

  const { request, audience, evaluatedAtMillis } = checked;
  let rawLimits: unknown;
  try {
    rawLimits = await deps.quantityLimits.resolveQuantityLimits({
      skus: request.lines.map((line) => line.sku),
      audience,
      evaluatedAt: request.evaluatedAt,
    });
  } catch {
    return rejected("quantity_policy_unavailable");
  }
  const limits = parseQuantityLimits(
    rawLimits,
    request.lines.map((line) => line.sku),
    evaluatedAtMillis,
  );
  if (limits === null) return rejected("quantity_policy_unavailable");

  for (let index = 0; index < request.lines.length; index += 1) {
    const line = request.lines[index];
    const limit = limits.get(line.sku)!;
    if (
      line.quantity < limit.minQuantity ||
      line.quantity > limit.maxQuantity ||
      (line.quantity - limit.minQuantity) % limit.increment !== 0
    ) {
      return rejected("quantity_invalid", {
        lineIndex: index,
        sku: line.sku,
      });
    }
  }

  const projectedLines: ProjectedPeptideCartLine[] = [];
  const repricedSkus: string[] = [];
  let subtotalCents = 0;

  for (let index = 0; index < request.lines.length; index += 1) {
    const line = request.lines[index];
    const limit = limits.get(line.sku)!;
    let rawBinding: unknown;
    try {
      rawBinding = await deps.priceAuthority.bind({
        sku: line.sku,
        quantity: line.quantity,
        authenticatedAudience: context.authenticatedAudience,
        currency: "USD",
        at: request.evaluatedAt,
      });
    } catch {
      return rejected("authority_unavailable", {
        lineIndex: index,
        sku: line.sku,
      });
    }
    if (!isRecord(rawBinding) || typeof rawBinding.state !== "string") {
      return rejected("authority_unavailable", {
        lineIndex: index,
        sku: line.sku,
      });
    }
    if (rawBinding.state === "rejected") {
      if (!isCartBindingRejectionReason(rawBinding.reason)) {
        return rejected("authority_unavailable", {
          lineIndex: index,
          sku: line.sku,
        });
      }
      const reason = rawBinding.reason;
      return rejected(mapAuthorityReason(reason), {
        lineIndex: index,
        sku: line.sku,
        authorityReason: reason,
      });
    }
    if (
      rawBinding.state !== "bound" ||
      !isCanonicalSnapshot(
        rawBinding.snapshot,
        line,
        audience,
        request.evaluatedAt,
        evaluatedAtMillis,
      )
    ) {
      return rejected("authority_unavailable", {
        lineIndex: index,
        sku: line.sku,
      });
    }

    const snapshot = rawBinding.snapshot;
    const nextSubtotal = subtotalCents + snapshot.lineTotalCents;
    if (!Number.isSafeInteger(nextSubtotal) || nextSubtotal <= 0) {
      return rejected("calculation_overflow", {
        lineIndex: index,
        sku: line.sku,
      });
    }
    subtotalCents = nextSubtotal;
    projectedLines.push(projectLine(snapshot, limit));
    if (
      line.acceptedPrice !== undefined &&
      !fingerprintMatches(line.acceptedPrice, snapshot)
    ) {
      repricedSkus.push(line.sku);
    }
  }

  const base: ProjectionBase = Object.freeze({
    authorityScope: "price_and_quantity_only",
    currency: "USD",
    audience,
    evaluatedAt: request.evaluatedAt,
    lines: Object.freeze(projectedLines),
    subtotalCents,
  });
  if (repricedSkus.length > 0) {
    return Object.freeze({
      ...base,
      state: "reprice_required",
      recovery: "review_updated_price",
      repricedSkus: Object.freeze(repricedSkus),
    });
  }
  return Object.freeze({ ...base, state: "projected" });
}
