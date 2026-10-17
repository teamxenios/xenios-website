/**
 * The two order projections a human reads. Server only, pure, side effect free.
 *
 * A projection is where a wrong amount does its damage: a customer decides what to send
 * from one, and an admin decides whether the money arrived from the other. Both are
 * built here by explicit construction from the order's money snapshot, so neither can
 * quietly show the pre-discount subtotal as the amount owed.
 *
 * `payableTotalCents` is branded on both, so a later edit that reaches for
 * `orderTotalCents` fails to compile rather than producing a screen that looks right.
 *
 * The customer view carries no customer reference, no actor, and no verification
 * history. The admin view carries no shipping address and no payment destination. Each
 * is built from an allowlist rather than by removing fields from a richer record, so a
 * field added upstream later cannot leak into either by default.
 */

import { earlyAccessPaymentReferenceFor } from "./invoice-service";
import type { EarlyAccessOrder, EarlyAccessOrderStatus } from "./early-access-order";
import type { EarlyAccessCurrency, PayableTotalCents } from "./order-money";
import type {
  EarlyAccessPaymentClassification,
  EarlyAccessPaymentReconciliation,
} from "./payment-reconciliation";
import type { EarlyAccessVerificationEntry } from "./verification-service";

/**
 * What the customer is shown about their own order.
 *
 * Three amounts, and the one that answers "what do I send" is `payableTotalCents`. The
 * subtotal and the discount are shown alongside it so the customer can check the
 * arithmetic rather than take it on trust.
 */
export type EarlyAccessCustomerOrderView = Readonly<{
  orderId: string;
  status: EarlyAccessOrderStatus;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  /** The amount owed. This is the only number a customer should act on. */
  payableTotalCents: PayableTotalCents;
  currency: EarlyAccessCurrency;
  /** Null when nothing was taken off. */
  promotionId: string | null;
  promotionVersion: string | null;
  paymentReference: string;
  placedAt: string;
}>;

export const EARLY_ACCESS_CUSTOMER_ORDER_VIEW_KEYS = [
  "orderId",
  "status",
  "sku",
  "quantity",
  "unitPriceCents",
  "subtotalCents",
  "discountCents",
  "shippingCents",
  "taxCents",
  "payableTotalCents",
  "currency",
  "promotionId",
  "promotionVersion",
  "paymentReference",
  "placedAt",
] as const;

/**
 * Build the customer's view of one order.
 *
 * Takes a validated `EarlyAccessOrder` rather than an unknown, so the money snapshot has
 * already passed its invariant by the time this runs and there is no branch here that
 * could produce a view with an amount the order does not support.
 */
export function buildCustomerOrderView(order: EarlyAccessOrder): EarlyAccessCustomerOrderView {
  return Object.freeze({
    orderId: order.orderId,
    status: order.status,
    sku: order.line.sku,
    quantity: order.line.quantity,
    unitPriceCents: order.line.unitPriceCents,
    subtotalCents: order.money.subtotalCents,
    discountCents: order.money.discountCents,
    shippingCents: order.money.shippingCents,
    taxCents: order.money.taxCents,
    payableTotalCents: order.money.payableTotalCents,
    currency: order.money.currency,
    promotionId: order.money.promotionId,
    promotionVersion: order.money.promotionVersion,
    paymentReference: earlyAccessPaymentReferenceFor(order.orderId),
    placedAt: order.createdAt,
  });
}

/**
 * What an admin is shown when deciding a manual payment.
 *
 * It states the amount owed, what was observed, the variance, and the classification, so
 * the decision is made against an explicit comparison rather than by eye. `approvable`
 * is false for anything but an exact match, and `requiresException` names the cases a
 * human may still accept with a stated reason.
 */
export type EarlyAccessAdminPaymentReview = Readonly<{
  orderId: string;
  customerRef: string;
  status: EarlyAccessOrderStatus;
  sku: string;
  quantity: number;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  payableTotalCents: PayableTotalCents;
  currency: EarlyAccessCurrency;
  promotionId: string | null;
  promotionVersion: string | null;
  /** Null until a payment has been observed at all. */
  observedAmountCents: number | null;
  varianceCents: number | null;
  classification: EarlyAccessPaymentClassification | null;
  approvable: boolean;
  requiresException: boolean;
  /** Every decision already on file for this order, oldest first. */
  decisions: readonly EarlyAccessAdminDecisionLine[];
}>;

/** One prior decision, reduced to what an admin needs to see. */
export type EarlyAccessAdminDecisionLine = Readonly<{
  sequence: number;
  decision: "approve" | "reject";
  actorId: string;
  decidedAt: string;
  amountVerifiedCents: number;
  payableTotalCents: PayableTotalCents;
  classification: EarlyAccessPaymentClassification;
  exceptionId: string | null;
}>;

export const EARLY_ACCESS_ADMIN_PAYMENT_REVIEW_KEYS = [
  "orderId",
  "customerRef",
  "status",
  "sku",
  "quantity",
  "subtotalCents",
  "discountCents",
  "shippingCents",
  "taxCents",
  "payableTotalCents",
  "currency",
  "promotionId",
  "promotionVersion",
  "observedAmountCents",
  "varianceCents",
  "classification",
  "approvable",
  "requiresException",
  "decisions",
] as const;

/**
 * Build the admin review for one order.
 *
 * The reconciliation is optional because an admin opens this screen before any payment
 * has been observed. When there is none, the amount fields are null rather than zero: a
 * zero would read as "they sent nothing", which is a different fact from "nothing has
 * been checked yet".
 */
export function buildAdminPaymentReview(input: {
  readonly order: EarlyAccessOrder;
  readonly reconciliation: EarlyAccessPaymentReconciliation | null;
  readonly decisions: readonly EarlyAccessVerificationEntry[];
}): EarlyAccessAdminPaymentReview {
  const { order, reconciliation } = input;
  return Object.freeze({
    orderId: order.orderId,
    customerRef: order.customerRef,
    status: order.status,
    sku: order.line.sku,
    quantity: order.line.quantity,
    subtotalCents: order.money.subtotalCents,
    discountCents: order.money.discountCents,
    shippingCents: order.money.shippingCents,
    taxCents: order.money.taxCents,
    payableTotalCents: order.money.payableTotalCents,
    currency: order.money.currency,
    promotionId: order.money.promotionId,
    promotionVersion: order.money.promotionVersion,
    observedAmountCents: reconciliation === null ? null : reconciliation.observedAmountCents,
    varianceCents: reconciliation === null ? null : reconciliation.varianceCents,
    classification: reconciliation === null ? null : reconciliation.classification,
    // Nothing is approvable until a payment has actually been compared against the
    // amount owed, so the default here is false rather than true.
    approvable: reconciliation === null ? false : reconciliation.approvable,
    requiresException: reconciliation === null ? false : reconciliation.requiresException,
    decisions: Object.freeze(
      input.decisions.map((entry) =>
        Object.freeze({
          sequence: entry.sequence,
          decision: entry.decision,
          actorId: entry.actorId,
          decidedAt: entry.decidedAt,
          amountVerifiedCents: entry.amountVerifiedCents,
          payableTotalCents: entry.payableTotalCents,
          classification: entry.classification,
          exceptionId: entry.exceptionId,
        }),
      ),
    ),
  });
}
