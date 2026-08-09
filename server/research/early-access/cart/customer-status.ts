import type {
  EarlyAccessCartCheckout,
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartLineQuote,
  EarlyAccessCartQuote,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import {
  EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS,
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

// ---------------------------------------------------------------------------
// The quote, projected for the customer
// ---------------------------------------------------------------------------

/**
 * THE QUOTE IS THE FIRST SURFACE A CUSTOMER TOUCHES, AND IT WAS THE LAST ONE
 * STILL DISCLOSING SUPPLIER IDENTITY.
 *
 * `quoteEarlyAccessCart` resolves a supplier route per line and must keep it:
 * the stored quote is what `checkout-service.ts` reads to build each child
 * order, so removing the fields from the quote itself would break fulfilment.
 * The disclosure was never in the calculation, it was in returning the internal
 * result straight down the wire. So the fix is here, at the wire, exactly where
 * `customerCheckoutView` already sits for the checkout.
 *
 * BUILT, NOT FILTERED, for the same reason as the checkout view: a deny list
 * has to be updated every time the line grows a field, and the update that gets
 * forgotten is the leak. A new field on `EarlyAccessCartLineQuote` is invisible
 * to the customer until somebody deliberately names it here.
 */
type CustomerQuoteLine = Omit<EarlyAccessCartLineQuote, "supplierId" | "supplierSku">;

export type EarlyAccessCustomerQuote = Omit<EarlyAccessCartQuote, "lines"> &
  Readonly<{ lines: readonly CustomerQuoteLine[] }>;

/**
 * The two forbidden-list keys the QUOTE surface must still carry, and why.
 *
 * `EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS` lists `quoteId` and `intentHash`
 * because on a CHECKOUT or STATUS response they are ownership handles that
 * disclose an internal binding. On the QUOTE response they are the opposite:
 * they are the contract token the client is REQUIRED to echo back, since
 * `EarlyAccessCartCheckoutRequest` is exactly `{quoteId, idempotencyKey,
 * expectedIntentHash}`. Strip them and no customer can ever check out.
 *
 * They are named here, as a closed two-entry list, rather than by loosening the
 * shared predicate, so the exception applies to this one surface and a reader
 * can see the whole of it in one place. `intentHash` binds the customer, every
 * line, the contact and the destination WITHOUT echoing any of them, so
 * returning it discloses nothing about anyone.
 */
export const EARLY_ACCESS_CUSTOMER_QUOTE_CONTRACT_TOKENS = Object.freeze([
  "quoteId",
  "intentHash",
] as const);

export function customerQuoteView(quote: EarlyAccessCartQuote): EarlyAccessCustomerQuote {
  const projected: EarlyAccessCustomerQuote = Object.freeze({
    quoteId: quote.quoteId,
    currency: quote.currency,
    lines: Object.freeze(
      quote.lines.map((line) =>
        Object.freeze({
          productId: line.productId,
          variantId: line.variantId,
          displayName: line.displayName,
          strength: line.strength,
          sku: line.sku,
          quantity: line.quantity,
          currency: line.currency,
          unitPriceCents: line.unitPriceCents,
          subtotalCents: line.subtotalCents,
          discountCents: line.discountCents,
          payableCents: line.payableCents,
          promotionId: line.promotionId,
          promotionVersion: line.promotionVersion,
          promotionLabel: line.promotionLabel,
        }),
      ),
    ),
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    shippingCents: quote.shippingCents,
    taxCents: quote.taxCents,
    payableTotalCents: quote.payableTotalCents,
    intentHash: quote.intentHash,
    quotedAt: quote.quotedAt,
    expiresAt: quote.expiresAt,
  });

  // The lines carry no contract token, so the SHARED deep predicate applies to
  // them unchanged. This is the check that actually catches a supplier field,
  // including one nested inside a future sub-object.
  if (!cartCustomerPayloadIsClean(projected.lines)) {
    throw new Error("early access customer quote lines contain forbidden fields");
  }

  // And at the top level, nothing forbidden survives except the two contract
  // tokens named above. Computed from the shared list rather than restated, so
  // a key added to the contract is enforced here without an edit.
  const leaked = Object.keys(projected).filter(
    (key) =>
      (EARLY_ACCESS_CART_FORBIDDEN_CUSTOMER_KEYS as readonly string[]).includes(key) &&
      !(EARLY_ACCESS_CUSTOMER_QUOTE_CONTRACT_TOKENS as readonly string[]).includes(key),
  );
  if (leaked.length > 0) {
    throw new Error(
      `early access customer quote projection contains forbidden fields: ${leaked.join(", ")}`,
    );
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
