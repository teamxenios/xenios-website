// The canonical Xenios order: the ONE durable record a legitimate paid or
// accepted transaction becomes, and the record a customer's order history
// renders from.
//
// Three id spaces already exist upstream of this file: XRR- (an assisted
// research request), XEA- (an Early Access single-product placement) and XEC-
// (an Early Access cart checkout). None of those is an order. A request is a
// conversation, a placement is an intent to pay, a checkout is a basket that
// was submitted. Each becomes an order at exactly one moment: canonical
// conversion, performed server-side by an admin or the system on real
// evidence. This file is the wire vocabulary for the result of that moment.
//
// Two rules shape the shapes here.
//
// First, payment state and fulfillment state are SEPARATE fields. The member
// commerce lane collapses both into one fourteen-state machine, which is right
// for driving transitions but wrong for telling a customer what is true: "has
// my money arrived" and "has my box shipped" are different questions with
// independently truthful answers.
//
// Second, every state listed here is one the domain can actually produce from
// evidence. There is no "paid" a client can assert, no "shipped" without a
// recorded fulfillment event, and no state that exists only to look complete.

import type { Api } from "../commerce-api";

// ---------------------------------------------------------------------------
// Sources: what a canonical order can be converted FROM.
// ---------------------------------------------------------------------------

export const CANONICAL_ORDER_SOURCE_KINDS = [
  /** An XRR- assisted request whose quote was accepted (and possibly paid). */
  "assisted_request_quote",
  /** An XEA- Early Access single-product placement with verified payment. */
  "early_access_placement",
  /** An XEC- Early Access cart checkout that settled. */
  "early_access_cart_checkout",
] as const;

export type CanonicalOrderSourceKind = (typeof CANONICAL_ORDER_SOURCE_KINDS)[number];

/**
 * The source transaction ref must carry the prefix of the id space it claims
 * to come from, so a conversion cannot launder one family's identifier
 * through another family's kind.
 */
export const CANONICAL_ORDER_SOURCE_PREFIXES: Readonly<Record<CanonicalOrderSourceKind, string>> =
  Object.freeze({
    assisted_request_quote: "XRR-",
    early_access_placement: "XEA-",
    early_access_cart_checkout: "XEC-",
  });

// ---------------------------------------------------------------------------
// State vocabularies. Small on purpose.
// ---------------------------------------------------------------------------

/**
 * `paid` is reachable only through payment evidence naming who verified what
 * and when. `awaiting_payment` is the honest state of an accepted quote whose
 * money has not yet been verified. There is deliberately no client-assertable
 * state and no "refunded" that nothing in the domain can yet produce.
 */
export const CANONICAL_ORDER_PAYMENT_STATES = ["awaiting_payment", "paid"] as const;

export type CanonicalOrderPaymentState = (typeof CANONICAL_ORDER_PAYMENT_STATES)[number];

export const CANONICAL_ORDER_FULFILLMENT_STATES = [
  "unfulfilled",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "exception",
] as const;

export type CanonicalOrderFulfillmentState =
  (typeof CANONICAL_ORDER_FULFILLMENT_STATES)[number];

// ---------------------------------------------------------------------------
// The customer-facing view. An allowlist projection, never a spread.
// ---------------------------------------------------------------------------

export interface CanonicalOrderLineView {
  sku: string;
  displayName: string;
  quantity: number;
  /** Integer minor units: the authorized price, computed server-side. */
  unitPriceCents: number;
  /** Integer minor units: unitPriceCents * quantity, computed server-side. */
  lineTotalCents: number;
}

export interface CanonicalOrderTrackingView {
  trackingNumber: string;
  carrier: string | null;
}

export interface CanonicalOrderSourceView {
  kind: CanonicalOrderSourceKind;
  /** The transaction the order was converted from (XRR-/XEA-/XEC-). */
  sourceRef: string;
  /** The originating request, when the source descends from one. */
  requestRef: string | null;
  /** The accepted quote, when acceptance is part of the order's evidence. */
  quoteRef: string | null;
}

/**
 * What a customer sees. Contains NO attribution, NO verifier identity, NO
 * evidence ids and NO internal actor names: those are operator data, and this
 * type not carrying the fields is the mechanism that keeps them off the wire.
 */
export interface CanonicalOrderView {
  orderNumber: string;
  /** When the source transaction was placed or accepted. */
  placedAt: string;
  /** When canonical conversion occurred. */
  convertedAt: string;
  currency: "usd";
  lines: CanonicalOrderLineView[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  paymentState: CanonicalOrderPaymentState;
  fulfillmentState: CanonicalOrderFulfillmentState;
  /** Present only when a recorded fulfillment event carried tracking. */
  tracking: CanonicalOrderTrackingView | null;
  source: CanonicalOrderSourceView;
  organizationRef: string | null;
}

export type CanonicalOrderListResponse = Api<{ orders: CanonicalOrderView[] }>;
export type CanonicalOrderDetailResponse = Api<{ order: CanonicalOrderView }>;

// ---------------------------------------------------------------------------
// Identity.
// ---------------------------------------------------------------------------

export const CANONICAL_ORDER_NUMBER_PREFIX = "XO-";

/**
 * XO- plus sixteen Crockford base32 characters (no I, L, O or U), eighty bits
 * derived deterministically from the source transaction so the same source
 * can only ever mint the same number.
 */
const CANONICAL_ORDER_NUMBER_PATTERN = /^XO-[0-9A-HJKMNP-TV-Z]{16}$/;

export function isCanonicalOrderNumber(value: string): boolean {
  return typeof value === "string" && CANONICAL_ORDER_NUMBER_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Routes. Spelled once, here, for both the server descriptor and the client.
// ---------------------------------------------------------------------------

export const CANONICAL_ORDER_HISTORY_PATH = "/api/research/order-history";

export function canonicalOrderDetailPath(orderNumber: string): string {
  return `${CANONICAL_ORDER_HISTORY_PATH}/${encodeURIComponent(orderNumber)}`;
}
