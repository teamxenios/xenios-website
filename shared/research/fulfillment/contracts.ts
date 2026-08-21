export const FULFILLMENT_STATES = [
  "assigned",
  "acknowledged",
  "picking",
  "packed",
  "tracking_created",
  "shipped",
  "delivered",
  "exception",
  "returned",
  "replacement",
  "refunded",
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
  "record_tracking",
  "ship",
  "deliver",
  "record_exception",
  "record_return",
  "record_replacement",
  "record_refund",
  "record_damage",
  "record_loss",
  "record_recall",
  "cancel",
] as const;

export type FulfillmentAction = (typeof FULFILLMENT_ACTIONS)[number];

/**
 * Actions a supplier operator may perform on their own assignment. Everything
 * else (cancellation, recall, return/damage/loss dispositions, replacement and
 * refund dispositions) is an internal authority decision.
 *
 * `record_refund` and `record_replacement` record a fulfillment DISPOSITION
 * only. Money movement stays owned by the canonical payment/claims systems;
 * nothing in this module mutates a payment.
 */
export const SUPPLIER_PERMITTED_ACTIONS = [
  "acknowledge",
  "start_picking",
  "pack",
  "record_tracking",
  "ship",
  "deliver",
  "record_exception",
] as const satisfies readonly FulfillmentAction[];

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

/**
 * The minimum operational pipeline is
 * assigned -> acknowledged -> picking -> packed -> tracking_created ->
 * shipped -> delivered.
 *
 * `shipped` is reachable ONLY from `tracking_created`: recording a tracking
 * reference is its own audited step and never implies carrier possession.
 * Recovery from `exception` also has to pass back through the evidence-bearing
 * steps rather than jumping straight to `shipped`.
 *
 * `replacement` and `refunded` are fulfillment dispositions recorded after a
 * failed outcome; they move no money and issue no replacement stock by
 * themselves. Replacement stock ships as a NEW assignment.
 */
export const FULFILLMENT_TRANSITIONS: Readonly<
  Record<FulfillmentState, Partial<Record<FulfillmentAction, FulfillmentState>>>
> = {
  assigned: {
    acknowledge: "acknowledged",
    record_exception: "exception",
    cancel: "cancelled",
    record_recall: "recalled",
  },
  acknowledged: {
    start_picking: "picking",
    record_exception: "exception",
    cancel: "cancelled",
    record_recall: "recalled",
  },
  picking: {
    pack: "packed",
    record_exception: "exception",
    record_damage: "damaged",
    record_loss: "lost",
    record_recall: "recalled",
  },
  packed: {
    record_tracking: "tracking_created",
    record_exception: "exception",
    record_damage: "damaged",
    record_loss: "lost",
    record_recall: "recalled",
  },
  tracking_created: {
    ship: "shipped",
    record_exception: "exception",
    cancel: "cancelled",
    record_damage: "damaged",
    record_loss: "lost",
    record_recall: "recalled",
  },
  shipped: {
    deliver: "delivered",
    record_exception: "exception",
    record_return: "returned",
    record_damage: "damaged",
    record_loss: "lost",
    record_recall: "recalled",
  },
  delivered: {
    record_return: "returned",
    record_damage: "damaged",
    record_loss: "lost",
    record_recall: "recalled",
  },
  exception: {
    start_picking: "picking",
    pack: "packed",
    record_tracking: "tracking_created",
    cancel: "cancelled",
    record_return: "returned",
    record_replacement: "replacement",
    record_refund: "refunded",
    record_damage: "damaged",
    record_loss: "lost",
    record_recall: "recalled",
  },
  returned: {
    record_replacement: "replacement",
    record_refund: "refunded",
  },
  damaged: {
    record_replacement: "replacement",
    record_refund: "refunded",
  },
  lost: {
    record_replacement: "replacement",
    record_refund: "refunded",
  },
  recalled: {
    record_replacement: "replacement",
    record_refund: "refunded",
  },
  cancelled: {
    record_refund: "refunded",
  },
  replacement: {},
  refunded: {},
};

/**
 * Actions available from each state. Client surfaces MUST drive their buttons
 * and status lists from this graph rather than restating the state list: three
 * separate hardcoded copies had already drifted, and the admin queue silently
 * dropped every assignment in a state it had not been taught about.
 */
export function fulfillmentActionsFor(
  state: FulfillmentState,
): FulfillmentAction[] {
  return Object.keys(FULFILLMENT_TRANSITIONS[state]) as FulfillmentAction[];
}

/** A state with no remaining fulfillment action. */
export function isTerminalFulfillmentState(state: FulfillmentState): boolean {
  return fulfillmentActionsFor(state).length === 0;
}

export interface FulfillmentAssignmentLine {
  lineId: string;
  sku: string;
  quantity: number;
  lotId: string;
  lotCode: string;
}

/**
 * Minimum-necessary partner projection. It intentionally excludes member id,
 * email, health data, assessment data, affiliate attribution, commission and
 * margin economics, payment data, prior-order history, and internal notes.
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
