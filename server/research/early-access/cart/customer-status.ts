import type {
  EarlyAccessCartCheckout,
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import {
  cartCustomerPayloadIsClean,
  earlyAccessIsOverdue,
  isEarlyAccessOrderStage,
  type EarlyAccessFulfilmentView,
  type EarlyAccessOrderStage,
} from "@shared/research/early-access-hardening";

export const EARLY_ACCESS_SHIPPING_EXPECTATION =
  "Expected to ship within 72 hours after payment verification." as const;

type CustomerChildOrder = Omit<
  EarlyAccessCartCheckoutRecord["children"][number],
  "supplierId" | "supplierSku"
>;

export type EarlyAccessCustomerCheckout = Omit<EarlyAccessCartCheckout, "children"> &
  Readonly<{ children: readonly CustomerChildOrder[] }>;

type CustomerChildRelease = Readonly<{
  releaseId: string;
  cartCheckoutNumber: string;
  orderNumber: string;
  quantity: number;
  releasedAt: string;
  shippedAt: string | null;
  tracking: readonly string[];
}>;

export type EarlyAccessCustomerCartStatus = Readonly<{
  checkout: EarlyAccessCustomerCheckout;
  payment: EarlyAccessCartStatus["payment"] &
    Readonly<{ paymentVerifiedAt: string | null }>;
  receipt: EarlyAccessCartStatus["receipt"];
  fulfilment: Readonly<{
    released: boolean;
    childOrders: readonly CustomerChildRelease[];
    stage: EarlyAccessOrderStage;
    paymentVerifiedAt: string | null;
    shipByAt: string | null;
    timezone: "UTC";
    overdue: boolean;
    lines: EarlyAccessFulfilmentView["lines"];
  }>;
  shippingExpectation: typeof EARLY_ACCESS_SHIPPING_EXPECTATION;
}>;

function exactInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString() === value ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function customerCheckoutView(
  checkout: EarlyAccessCartCheckoutRecord | EarlyAccessCartCheckout,
): EarlyAccessCustomerCheckout {
  const projected = Object.freeze({
    cartCheckoutNumber: checkout.cartCheckoutNumber,
    contact: Object.freeze({ ...checkout.contact }),
    shipTo: Object.freeze({ ...checkout.shipTo }),
    children: Object.freeze(
      checkout.children.map((child) =>
        Object.freeze({
          orderNumber: child.orderNumber,
          productId: child.productId,
          variantId: child.variantId,
          sku: child.sku,
          quantity: child.quantity,
          unitPriceCents: child.unitPriceCents,
          subtotalCents: child.subtotalCents,
          discountCents: child.discountCents,
          payableCents: child.payableCents,
        }),
      ),
    ),
    invoice: Object.freeze({
      ...checkout.invoice,
      lines: Object.freeze(checkout.invoice.lines.map((line) => Object.freeze({ ...line }))),
    }),
    paymentState: checkout.paymentState,
    placedAt: checkout.placedAt,
  });
  if (!cartCustomerPayloadIsClean(projected)) {
    throw new Error("early access customer checkout projection contains forbidden fields");
  }
  return projected;
}

function stageOf(
  status: EarlyAccessCartStatus,
  releases: readonly CustomerChildRelease[],
): EarlyAccessOrderStage {
  const rawFulfilment = record(status.fulfilment);
  const explicit = rawFulfilment?.stage;
  if (isEarlyAccessOrderStage(explicit)) return explicit;

  if (releases.length > 0 && releases.every((release) => release.shippedAt !== null)) {
    return "shipped";
  }
  if (releases.some((release) => release.shippedAt !== null)) return "partially_shipped";
  if (status.fulfilment.released) return "processing";
  if (status.payment.paid || status.payment.state === "payment_verified") {
    return "payment_verified";
  }
  if (status.payment.state === "under_review" || status.payment.externalProofCount > 0) {
    return "payment_review_required";
  }
  return "checkout_reserved";
}

/**
 * Project by naming every customer field. Never spread a database/RPC status
 * object into a response: M62 intentionally has richer admin-only projections.
 */
export function projectEarlyAccessCustomerCartStatus(
  status: EarlyAccessCartStatus,
  nowIso: string,
): EarlyAccessCustomerCartStatus {
  const releases = Object.freeze(
    status.fulfilment.childOrders.map((release) =>
      Object.freeze({
        releaseId: release.releaseId,
        cartCheckoutNumber: release.cartCheckoutNumber,
        orderNumber: release.orderNumber,
        quantity: release.quantity,
        releasedAt: release.releasedAt,
        shippedAt: release.shippedAt,
        tracking: Object.freeze([...release.tracking]),
      }),
    ),
  );
  const raw = record(status);
  const rawPayment = record(raw?.payment);
  const rawFulfilment = record(raw?.fulfilment);
  const paymentVerifiedAt = exactInstant(
    rawFulfilment?.paymentVerifiedAt ?? rawPayment?.paymentVerifiedAt,
  );
  const shipByAt = exactInstant(rawFulfilment?.shipByAt);
  const stage = stageOf(status, releases);
  const projected: EarlyAccessCustomerCartStatus = Object.freeze({
    checkout: customerCheckoutView(status.checkout),
    payment: Object.freeze({
      state: status.payment.state,
      paid: status.payment.paid,
      externalProofCount: status.payment.externalProofCount,
      paymentVerifiedAt,
    }),
    receipt: status.receipt === null ? null : Object.freeze({ ...status.receipt }),
    fulfilment: Object.freeze({
      released: status.fulfilment.released,
      childOrders: releases,
      stage,
      paymentVerifiedAt,
      shipByAt,
      timezone: "UTC" as const,
      overdue: earlyAccessIsOverdue({ stage, shipByAt, nowIso }),
      lines: Object.freeze(
        releases.map((release) =>
          Object.freeze({
            orderNumber: release.orderNumber,
            quantity: release.quantity,
            shippedAt: release.shippedAt,
            tracking: release.tracking,
          }),
        ),
      ),
    }),
    shippingExpectation: EARLY_ACCESS_SHIPPING_EXPECTATION,
  });
  if (!cartCustomerPayloadIsClean(projected)) {
    throw new Error("early access customer status projection contains forbidden fields");
  }
  return projected;
}
