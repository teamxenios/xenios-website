import { randomBytes } from "node:crypto";

import {
  BuyerOrderRequestSchema,
  type BuyerCatalogVariant,
  type BuyerIdentity,
  type BuyerOrderRequestInput,
  type BuyerOrderRequestRecord,
  type BuyerRequestCommit,
  type BuyerRequestReceipt,
  type ResolvedBuyerLine,
} from "@shared/research/buyer-commerce";
import { EARLY_ACCESS_MAX_QUANTITY } from "@shared/research/early-access-quantity";
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

  // Two independent gates. Product Control must authorize THIS exact variant,
  // and the quantity must stay inside both its exact limit and the accepted
  // release-wide authority. At this base the latter is 20, so 21-50 can only
  // become direct after the separate Q50 lane changes accepted authority.
  const exactLimit = variant.directQuantityLimit ?? 0;
  const acceptedLimit = Math.min(exactLimit, EARLY_ACCESS_MAX_QUANTITY);
  const direct =
    variant.directPurchaseAuthorized &&
    acceptedLimit >= 1 &&
    line.requestedQuantity <= acceptedLimit;

  return Object.freeze({
    ...base,
    disposition: direct
      ? ("direct_cart_eligible" as const)
      : ("manual_early_access_request" as const),
    ...(direct
      ? {}
      : {
          reason:
            !variant.directPurchaseAuthorized || acceptedLimit < 1
              ? ("PRODUCT_CONTROL_REVIEW_REQUIRED" as const)
              : line.requestedQuantity > acceptedLimit
              ? ("QUANTITY_REQUIRES_MANUAL_REVIEW" as const)
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
  return Object.freeze({
    requestRef: record.requestRef,
    customerRef: record.customerRef,
    status: "submitted_for_review" as const,
    replayed,
    lines: Object.freeze([...record.resolvedLines]),
    createdAt: record.createdAt,
    nextStep:
      "Xenios Research will confirm availability, final pricing, payment, and fulfillment. Keep this request reference to claim the order history to an account later.",
  });
}

export async function submitBuyerRequest(
  dependencies: BuyerCommerceDependencies,
  raw: unknown,
): Promise<BuyerRequestReceipt> {
  // `parse`, rather than coercion: quantities and every nested object must
  // already have the contract's exact shape.
  const payload = BuyerOrderRequestSchema.parse(raw);
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
  await dependencies.audit.record({
    event: "research.buyer_request.created",
    orderNumber: candidate.requestRef,
    actor: candidate.customerRef,
    at: createdAt,
    detail: {
      lineCount: resolvedLines.length,
      directEligible: counts("direct_cart_eligible"),
      manualReview: counts("manual_early_access_request"),
      carePathway: counts("care_pathway"),
      unavailable: counts("unavailable"),
    },
  });
  await dependencies.notifications.notify(candidate);
  return receipt(candidate, false);
}
