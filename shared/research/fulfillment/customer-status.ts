import type {
  FulfillmentAssignmentView,
  FulfillmentState,
} from "./contracts";

/**
 * Customer-safe fulfillment statuses. This projection is the ONLY shape the
 * customer surface may render. It never exposes supplier identity, lots,
 * internal exception reasons, handling economics, or any other party's data.
 */
export const CUSTOMER_FULFILLMENT_STATUSES = [
  "preparing",
  "packing",
  "tracking_created",
  "shipped",
  "delivered",
  "attention_required",
  "return_in_progress",
  "replacement_in_progress",
  "refund_in_progress",
  "recalled",
  "cancelled",
] as const;

export type CustomerFulfillmentStatus =
  (typeof CUSTOMER_FULFILLMENT_STATUSES)[number];

const STATE_TO_CUSTOMER_STATUS: Readonly<
  Record<FulfillmentState, CustomerFulfillmentStatus>
> = {
  assigned: "preparing",
  acknowledged: "preparing",
  picking: "packing",
  packed: "packing",
  tracking_created: "tracking_created",
  shipped: "shipped",
  delivered: "delivered",
  exception: "attention_required",
  returned: "return_in_progress",
  replacement: "replacement_in_progress",
  refunded: "refund_in_progress",
  damaged: "attention_required",
  lost: "attention_required",
  recalled: "recalled",
  cancelled: "cancelled",
};

/**
 * States in which the customer may see carrier and tracking details. A
 * tracking reference recorded earlier in the pipeline is withheld until the
 * assignment actually reaches a tracking-bearing state, and `tracking_created`
 * is deliberately distinct from `shipped`: a label or tracking number existing
 * NEVER presents as "shipped" to the customer.
 */
const TRACKING_VISIBLE_STATES: ReadonlySet<FulfillmentState> = new Set<FulfillmentState>([
  "tracking_created",
  "shipped",
  "delivered",
  "returned",
]);

export const CUSTOMER_STATUS_LABELS: Readonly<
  Record<CustomerFulfillmentStatus, string>
> = {
  preparing: "Order received and being prepared",
  packing: "Being packed",
  tracking_created: "Shipping label created - awaiting carrier pickup",
  shipped: "Shipped",
  delivered: "Delivered",
  attention_required: "Needs attention - our team is on it",
  return_in_progress: "Return in progress",
  replacement_in_progress: "Replacement in progress",
  refund_in_progress: "Refund in progress",
  recalled: "Recalled - our team will contact you",
  cancelled: "Cancelled",
};

export interface CustomerFulfillmentStatusView {
  orderReference: string;
  status: CustomerFulfillmentStatus;
  statusLabel: string;
  shipped: boolean;
  carrier: string | null;
  trackingReference: string | null;
  expectedShipAt: string | null;
  updatedAt: string;
}

export function projectCustomerFulfillmentStatus(
  view: FulfillmentAssignmentView,
): CustomerFulfillmentStatusView {
  const status = STATE_TO_CUSTOMER_STATUS[view.state];
  const trackingVisible = TRACKING_VISIBLE_STATES.has(view.state);
  return Object.freeze({
    orderReference: view.orderReference,
    status,
    statusLabel: CUSTOMER_STATUS_LABELS[status],
    shipped: view.state === "shipped" || view.state === "delivered",
    carrier: trackingVisible ? view.carrier : null,
    trackingReference: trackingVisible ? view.trackingReference : null,
    expectedShipAt: view.expectedShipAt,
    updatedAt: view.updatedAt,
  });
}
