/**
 * Member-safe history for legacy single-order Early Access purchases.
 *
 * The legacy placement remains authoritative. This projection intentionally
 * carries no customer handle, supplier identity, release packet, payment
 * evidence, buy cost, margin, address, contact details, or operator notes.
 */

export const EARLY_ACCESS_MEMBER_PAYMENT_STATES = [
  "awaiting_payment",
  "under_review",
  "payment_verified",
  "payment_rejected",
] as const;

export type EarlyAccessMemberPaymentState =
  (typeof EARLY_ACCESS_MEMBER_PAYMENT_STATES)[number];

export const EARLY_ACCESS_MEMBER_FULFILLMENT_STATES = [
  "not_released",
  "supplier_released",
  "packing",
  "fulfilled",
] as const;

export type EarlyAccessMemberFulfillmentState =
  (typeof EARLY_ACCESS_MEMBER_FULFILLMENT_STATES)[number];

export interface EarlyAccessMemberTrackingView {
  carrier: string;
  trackingNumber: string;
  recordedAt: string;
}
export interface EarlyAccessMemberOrderLineView {
  /** Customer-safe SKU already exposed by the legacy owned-order response. */
  sku: string;
  quantity: number;
  lineTotalCents: number;
}

export interface EarlyAccessMemberOrderView {
  source: "early_access_placement";
  orderNumber: string;
  placedAt: string;
  lines: readonly EarlyAccessMemberOrderLineView[];
  totalCents: number;
  currency: string;
  paymentState: EarlyAccessMemberPaymentState;
  fulfillmentState: EarlyAccessMemberFulfillmentState;
  tracking: readonly EarlyAccessMemberTrackingView[];
}
