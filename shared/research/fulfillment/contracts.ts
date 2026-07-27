export const FULFILLMENT_STATES = [
  "assigned",
  "acknowledged",
  "picking",
  "packed",
  "shipped",
  "delivered",
  "exception",
  "returned",
  "damaged",
  "lost",
  "recalled",
  "cancelled",
] as const;

export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

export const FULFILLMENT_ACTIONS = [
  "acknowledge",
  "start_picking",
  "pack",
  "ship",
  "deliver",
  "record_exception",
  "record_return",
  "record_damage",
  "record_loss",
  "record_recall",
  "cancel",
] as const;

export type FulfillmentAction = (typeof FULFILLMENT_ACTIONS)[number];

export type FulfillmentActor =
  | {
      actorId: string;
      kind: "internal";
      role: "super_admin" | "operations_admin" | "internal_team";
      supplierId?: never;
    }
  | {
      actorId: string;
      kind: "supplier";
      role: "supplier_operator";
      supplierId: string;
    };

export interface FulfillmentAssignmentLine {
  lineId: string;
  sku: string;
  quantity: number;
  lotId: string;
  lotCode: string;
}

/**
 * Minimum-necessary partner projection. It intentionally excludes member id,
 * email, health data, assessment data, affiliate attribution, payment data,
 * prior-order history, and internal notes.
 */
export interface FulfillmentAssignmentView {
  assignmentId: string;
  fulfillmentOrderId: string;
  orderReference: string;
  supplierId: string;
  supplierLabel: string;
  state: FulfillmentState;
  version: number;
  expectedShipAt: string | null;
  recipient: {
    name: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
    phone: string | null;
  };
  shippingService: string;
  handlingProfile: "ambient" | "cold_chain";
  lines: FulfillmentAssignmentLine[];
  labelReference: string | null;
  carrier: string | null;
  trackingReference: string | null;
  updatedAt: string;
}

export interface AssignFulfillmentInput {
  actor: FulfillmentActor;
  supplierId: string;
  supplierOfferId: string;
  fulfillmentOrderId: string;
  allocations: Array<{
    fulfillmentLineId: string;
    reservationId: string;
    reservationAllocationId: string;
  }>;
  expectedVersion: 0;
  idempotencyKey: string;
  at: string;
}

export interface PrepareFulfillmentOrderInput {
  actor: Extract<FulfillmentActor, { kind: "internal" }>;
  orderId: string;
  memberId: string;
  reservationId: string;
  recipient: FulfillmentAssignmentView["recipient"];
  shippingService: string;
  handlingProfile: FulfillmentAssignmentView["handlingProfile"];
  expectedVersion: 0;
  idempotencyKey: string;
  at: string;
}

export interface FulfillmentPreparationResult {
  fulfillmentOrderId: string | null;
  ready: false;
  reason: "PAID_ORDER_BOUNDARY_REQUIRED";
}

export interface TransitionFulfillmentInput {
  actor: FulfillmentActor;
  assignmentId: string;
  action: FulfillmentAction;
  expectedVersion: number;
  idempotencyKey: string;
  at: string;
  expectedShipAt?: string;
  labelReference?: string;
  carrier?: string;
  service?: string;
  trackingReference?: string;
  reason?: string;
}

export interface FulfillmentCommandResult {
  assignmentId: string;
  state: FulfillmentState;
  version: number;
  idempotentReplay: boolean;
}

export interface FulfillmentQueueQuery {
  actor: FulfillmentActor;
  states?: FulfillmentState[];
  limit?: number;
}
