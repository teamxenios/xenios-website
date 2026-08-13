import { randomBytes } from "node:crypto";

import {
  BuyerOrderRequestSchema,
  BUYER_REQUEST_MAX_QUANTITY,
  type BuyerCatalogVariant,
  type BuyerIdentity,
  type BuyerOrderRequestInput,
  type BuyerOrderRequestRecord,
  type BuyerRequestCommit,
  type BuyerRequestReceipt,
  type ResolvedBuyerLine,
} from "@shared/research/buyer-commerce";
import { readPlainRecord } from "../early-access/commerce/input-guards";
import type { EarlyAccessAuditSink } from "../early-access/routes/ports";

export interface BuyerIdentityPort {
  upsert(input: BuyerIdentity & { now: string }): Promise<{ customerRef: string }>;
}

export interface BuyerCatalogPort {
  variants(input: Readonly<{ customerRef: string; at: Date }>): Promise<readonly BuyerCatalogVariant[]>;
}

/** Integration binds this to the existing order/request persistence transaction. */
export interface BuyerOrderRequestPort {
  commit(record: BuyerOrderRequestRecord): Promise<BuyerRequestCommit>;
}

export interface BuyerNotificationPort {
  notify(record: BuyerOrderRequestRecord): Promise<Readonly<{
    customerQueued: boolean;
    operationsQueued: boolean;
  }>>;
}

export interface BuyerCommerceDependencies {
  identity: BuyerIdentityPort;
  catalog: BuyerCatalogPort;
  requests: BuyerOrderRequestPort;
  audit: EarlyAccessAuditSink;
  notifications: BuyerNotificationPort;
  clock?: () => Date;
  newRequestRef?: () => string;
}

export class BuyerRequestConflictError extends Error {
  constructor() {
    super("The idempotency key is already bound to a different buyer request.");
  }
}

function readEnvelope(
  input: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const allowed = [...requiredKeys, ...optionalKeys];
    const keys = Reflect.ownKeys(input);
    if (
      keys.some((key) => typeof key !== "string" || !allowed.includes(key)) ||
      requiredKeys.some((key) => !keys.includes(key))
    ) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(input) as Record<
      string,
      PropertyDescriptor | undefined
    >;
    const detached: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of allowed) {
      const descriptor = descriptors[key];
      if (descriptor === undefined) continue;
      if (!("value" in descriptor) || descriptor.enumerable !== true) return null;
      detached[key] = descriptor.value;
    }
    return detached;
  } catch {
    return null;
  }
}

function readLines(input: unknown, maxLength: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input) as Record<
      string,
      PropertyDescriptor | undefined
    >;
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maxLength) return null;
    if (Reflect.ownKeys(input).length !== length + 1) return null;
    const detached: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return null;
      detached.push(descriptor.value);
    }
    return detached;
  } catch {
    return null;
  }
}

/**
 * Detach an untrusted request without invoking accessors or accepting exotic
 * prototypes. Express JSON normally produces plain data, but the service is a
 * reusable boundary and must remain fail-closed when called directly.
 */
export function parseBuyerOrderRequest(raw: unknown): BuyerOrderRequestInput {
  // The envelope readers are intentionally shallow. Calling structuredClone
  // before nested descriptors are checked can execute a hostile nested getter.
  const request = readEnvelope(
    raw,
    ["identity", "shipping", "lines", "idempotencyKey"],
    ["billing", "notes", "requestedInvoice", "source"],
  );
  if (request === null) return BuyerOrderRequestSchema.parse(null);

  const identity = readPlainRecord(
    request.identity,
    ["firstName", "lastName", "email"],
    ["phone", "company"],
  );
  const shipping = readPlainRecord(
    request.shipping,
    ["line1", "city", "region", "postalCode"],
    ["line2", "country"],
  );
  const billing = request.billing === undefined
    ? undefined
    : readPlainRecord(
        request.billing,
        ["line1", "city", "region", "postalCode"],
        ["line2", "country"],
      );
  const lines = readLines(request.lines, 250);
  if (identity === null || shipping === null || billing === null || lines === null) {
    return BuyerOrderRequestSchema.parse(null);
  }
  const detachedLines = lines.map((line) =>
    readPlainRecord(line, ["offeringId", "variantId", "requestedQuantity"]),
  );
  if (detachedLines.some((line) => line === null)) {
    return BuyerOrderRequestSchema.parse(null);
  }

  return BuyerOrderRequestSchema.parse({
    ...request,
    identity,
    shipping,
    ...(billing === undefined ? {} : { billing }),
    lines: detachedLines,
  });
}

function requestRef(): string {
  return `XBR-${randomBytes(10).toString("hex").toUpperCase()}`;
}

function resolveLine(
  line: BuyerOrderRequestInput["lines"][number],
  variants: readonly BuyerCatalogVariant[],
): ResolvedBuyerLine {
  const matches = variants.filter(
    (variant) => variant.variantId === line.variantId && variant.offeringId === line.offeringId,
  );
  if (matches.length !== 1) {
    return Object.freeze({
      ...line,
      productName: "Unknown variant",
      disposition: "unavailable" as const,
      currency: "USD",
      directQuantityLimit: null,
      reason: "VARIANT_NOT_FOUND" as const,
    });
  }

  const variant = matches[0]!;
  const base = {
    ...line,
    sku: variant.sku,
    productName: variant.productName,
    ...(variant.strengthLabel ? { strengthLabel: variant.strengthLabel } : {}),
    ...(variant.displayPriceCents === undefined
      ? {}
      : { displayPriceCents: variant.displayPriceCents }),
    currency: variant.currency,
    directQuantityLimit: variant.directQuantityLimit,
  };

  if (variant.carePathway) {
    return Object.freeze({
      ...base,
      disposition: "care_pathway" as const,
      reason: "CARE_PATHWAY_REQUIRED" as const,
    });
  }

  // Product Control and durable release authority must authorize THIS exact
  // variant. The global normal-order band is 1..50; a narrower explicit limit
  // fails closed into the existing order-request path and is not classified as
  // a quantity-based review rule.
  const exactLimit = variant.directQuantityLimit ?? 0;
  const acceptedLimit = Math.min(exactLimit, BUYER_REQUEST_MAX_QUANTITY);
  const direct =
    variant.directPurchaseAuthorized &&
    acceptedLimit >= 1 &&
    line.requestedQuantity <= acceptedLimit;

  return Object.freeze({
    ...base,
    disposition: direct
      ? ("direct_cart_eligible" as const)
      : ("order_request" as const),
    ...(direct
      ? {}
      : {
          reason:
            !variant.directPurchaseAuthorized || acceptedLimit < 1
              ? ("PRODUCT_CONTROL_REVIEW_REQUIRED" as const)
              : line.requestedQuantity > acceptedLimit
              ? ("DIRECT_AUTHORITY_UNAVAILABLE" as const)
              : ("PRODUCT_CONTROL_REVIEW_REQUIRED" as const),
        }),
  });
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(",")}}`;
}

function receipt(record: BuyerOrderRequestRecord, replayed: boolean): BuyerRequestReceipt {
  const directCount = record.resolvedLines.filter(
    (line) => line.disposition === "direct_cart_eligible",
  ).length;
  const directNextStep =
    "Direct-eligible lines may continue through the existing cart, where current price, stock, agreements, shipping, and Product Control authority are checked again.";
  const followUp =
    "Xenios Research will follow up on lines that use the order-request or Care pathway.";
  return Object.freeze({
    requestRef: record.requestRef,
    customerRef: record.customerRef,
    status: "request_received" as const,
    replayed,
    lines: Object.freeze([...record.resolvedLines]),
    createdAt: record.createdAt,
    nextStep: [
      directCount > 0 ? directNextStep : followUp,
      directCount > 0 && directCount < record.resolvedLines.length ? followUp : "",
      "Keep this request reference to claim the order history to an account later.",
    ].filter(Boolean).join(" "),
  });
}

export async function submitBuyerRequest(
  dependencies: BuyerCommerceDependencies,
  raw: unknown,
): Promise<BuyerRequestReceipt> {
  // `parse`, rather than coercion: quantities and every nested object must
  // already have the contract's exact shape. The detached reader additionally
  // refuses accessors, proxies, prototype pollution, and sparse arrays.
  const payload = parseBuyerOrderRequest(raw);
  const now = (dependencies.clock ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Buyer commerce clock returned an invalid instant.");
  }
  const createdAt = now.toISOString();
  const customer = await dependencies.identity.upsert({ ...payload.identity, now: createdAt });
  const variants = await dependencies.catalog.variants({ customerRef: customer.customerRef, at: now });
  const resolvedLines = Object.freeze(payload.lines.map((line) => resolveLine(line, variants)));
  const candidate: BuyerOrderRequestRecord = Object.freeze({
    requestRef: (dependencies.newRequestRef ?? requestRef)(),
    customerRef: customer.customerRef,
    idempotencyKey: payload.idempotencyKey,
    payload,
    resolvedLines,
    createdAt,
  });

  const committed = await dependencies.requests.commit(candidate);
  if (!committed.committed) {
    const sameRequest =
      committed.record.customerRef === candidate.customerRef &&
      canonical(committed.record.payload) === canonical(candidate.payload);
    if (!sameRequest) throw new BuyerRequestConflictError();
    return receipt(committed.record, true);
  }

  const counts = (disposition: ResolvedBuyerLine["disposition"]) =>
    resolvedLines.filter((line) => line.disposition === disposition).length;
  // The request is already durable. Existing Early Access routes deliberately
  // keep audit/outbox projection failures from changing the customer's answer;
  // returning a 500 here would invite a new idempotency key and a duplicate.
  // Both projections are attempted independently so one outage cannot suppress
  // the other.
  await Promise.allSettled([
    dependencies.audit.record({
      event: "research.buyer_request.created",
      orderNumber: candidate.requestRef,
      actor: candidate.customerRef,
      at: createdAt,
      detail: {
        lineCount: resolvedLines.length,
        directEligible: counts("direct_cart_eligible"),
        orderRequest: counts("order_request"),
        carePathway: counts("care_pathway"),
        unavailable: counts("unavailable"),
      },
    }),
    dependencies.notifications.notify(candidate),
  ]);
  return receipt(candidate, false);
}
