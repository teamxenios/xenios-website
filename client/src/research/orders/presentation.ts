// How a canonical order reads to the customer.
//
// Payment and fulfillment are labelled SEPARATELY here, because they answer
// different questions and a single blended label always lies about one of
// them. An order whose money is verified but whose box has not moved is
// "Payment received" plus "Preparing to ship", not one word pretending to
// cover both.
//
// Every label is written for someone who is worried about their money. No
// state is styled as an error unless something is genuinely wrong, and no
// state promises an action the customer cannot see the result of.

import type {
  CanonicalOrderFulfillmentState,
  CanonicalOrderPaymentState,
  CanonicalOrderSourceKind,
  CanonicalOrderView,
} from "@shared/research/orders/canonical-order";
import type { BadgeTone } from "../ui/kit";

export interface StateMeta {
  label: string;
  tone: BadgeTone;
  /** One calm sentence saying what is true and what happens next. */
  note: string;
}

export const PAYMENT_STATE_META: Record<CanonicalOrderPaymentState, StateMeta> = {
  awaiting_payment: {
    label: "Awaiting payment",
    tone: "pending",
    note: "Your order is confirmed at the price shown. It moves to fulfillment once your payment is received and verified by our team.",
  },
  paid: {
    label: "Payment received",
    tone: "success",
    note: "Your payment has been received and verified.",
  },
};

export const FULFILLMENT_STATE_META: Record<CanonicalOrderFulfillmentState, StateMeta> = {
  unfulfilled: {
    label: "Not yet started",
    tone: "neutral",
    note: "Preparation begins once payment is verified.",
  },
  processing: {
    label: "Preparing to ship",
    tone: "info",
    note: "Your order is being prepared. Tracking appears here as soon as it ships.",
  },
  shipped: {
    label: "Shipped",
    tone: "success",
    note: "Your order is on its way.",
  },
  delivered: {
    label: "Delivered",
    tone: "success",
    note: "Your order was delivered.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "neutral",
    note: "This order was cancelled. If you were charged, contact support and we will resolve it.",
  },
  exception: {
    label: "Needs attention",
    tone: "warning",
    note: "Something needs a person to look at it. Our team has been notified; contact support for the current status.",
  },
};

/**
 * How the order came to exist, in the customer's words. The internal id
 * spaces (XRR/XEA/XEC) are never used as labels: a customer should not have
 * to learn our vocabulary to read their own history.
 */
export const SOURCE_KIND_LABELS: Record<CanonicalOrderSourceKind, string> = {
  assisted_request_quote: "Assisted request",
  early_access_placement: "Early Access order",
  early_access_cart_checkout: "Early Access cart",
};

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function formatOrderDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(parsed));
}

/** A one-line product summary for the list row. */
export function productSummary(order: CanonicalOrderView): string {
  if (order.lines.length === 0) return "—";
  const [first] = order.lines;
  const rest = order.lines.length - 1;
  const head = first.quantity > 1 ? `${first.displayName} ×${first.quantity}` : first.displayName;
  return rest === 0 ? head : `${head} + ${rest} more`;
}

/**
 * The support reference a customer should quote. It is the canonical order
 * number and never an internal evidence id.
 */
export function supportReference(order: CanonicalOrderView): string {
  return order.orderNumber;
}
