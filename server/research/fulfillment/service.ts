import {
  FULFILLMENT_TRANSITIONS,
  SUPPLIER_PERMITTED_ACTIONS,
  type AssignFulfillmentInput,
  type FulfillmentAction,
  type FulfillmentActor,
  type FulfillmentCommandResult,
  type FulfillmentPreparationResult,
  type FulfillmentQueueQuery,
  type FulfillmentState,
  type PrepareFulfillmentOrderInput,
  type TransitionFulfillmentInput,
} from "@shared/research/fulfillment/contracts";
import type { FulfillmentOperationsPort } from "./port";
import { FulfillmentError } from "./errors";
import {
  createFailClosedPaidOrderReleaseGate,
  type PaidOrderReleaseGate,
} from "./release-gate";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9:_./-]{8,200}$/;

/**
 * The transition graph moved to the shared contract so the admin client can
 * drive its buttons and status lists from the same data the server enforces.
 * Re-exported here because this module was its original home.
 */
export { FULFILLMENT_TRANSITIONS };


const SUPPLIER_ACTION_SET: ReadonlySet<FulfillmentAction> =
  new Set<FulfillmentAction>(SUPPLIER_PERMITTED_ACTIONS);

const REASON_REQUIRED_ACTIONS: ReadonlySet<FulfillmentAction> = new Set<FulfillmentAction>([
  "record_exception",
  "record_return",
  "record_replacement",
  "record_refund",
  "record_damage",
  "record_loss",
  "record_recall",
  "cancel",
]);

export function normalizeInstant(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("A normalized timestamp is required.");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("Timestamp must be a normalized millisecond UTC instant.");
  }
  return value;
}

function assertUuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new Error(`${label} must be a UUID.`);
}

function assertActor(actor: FulfillmentActor): void {
  assertUuid(actor.actorId, "actorId");
  if (actor.kind === "supplier") {
    assertUuid(actor.supplierId, "supplierId");
    if (actor.role !== "supplier_operator") {
      throw new Error("Supplier access requires the supplier_operator role.");
    }
    return;
  }
  if (!["super_admin", "operations_admin", "internal_team"].includes(actor.role)) {
    throw new Error("Internal fulfillment role is not authorized.");
  }
}

function assertKey(value: string): void {
  if (!KEY.test(value)) throw new Error("Idempotency key is invalid.");
}

function assertActionAuthority(
  actor: FulfillmentActor,
  action: FulfillmentAction,
): void {
  if (actor.kind === "supplier" && !SUPPLIER_ACTION_SET.has(action)) {
    throw new Error(
      "This fulfillment disposition is an internal decision and is not available to supplier operators.",
    );
  }
}

function assertReason(action: FulfillmentAction, reason: string | undefined): void {
  if (
    REASON_REQUIRED_ACTIONS.has(action) &&
    (!reason || reason.trim().length < 3 || reason.length > 500)
  ) {
    throw new Error("This fulfillment action requires a concise reason.");
  }
}

function assertTransitionMetadata(input: TransitionFulfillmentInput): void {
  if (input.action === "pack" && (!input.labelReference || input.labelReference.trim().length < 3)) {
    throw new Error("Packing requires a label reference.");
  }
  if (
    input.action === "record_tracking" &&
    (!input.labelReference ||
      !input.carrier ||
      !input.service ||
      !input.trackingReference)
  ) {
    throw new Error(
      "Recording tracking requires label, carrier, service, and tracking evidence.",
    );
  }
  if (input.expectedShipAt) normalizeInstant(input.expectedShipAt);
}

export function validateAssignFulfillment(input: AssignFulfillmentInput): void {
  assertActor(input.actor);
  if (input.actor.kind !== "internal") {
    throw new Error("Only internal operations may create supplier assignments.");
  }
  assertUuid(input.supplierId, "supplierId");
  assertUuid(input.supplierOfferId, "supplierOfferId");
  assertUuid(input.fulfillmentOrderId, "fulfillmentOrderId");
  if (input.expectedVersion !== 0) throw new Error("A new assignment must expect version zero.");
  assertKey(input.idempotencyKey);
  normalizeInstant(input.at);
  if (input.allocations.length === 0 || input.allocations.length > 100) {
    throw new Error("At least one bounded exact-lot allocation is required.");
  }
  const allocationIds = new Set<string>();
  for (const allocation of input.allocations) {
    assertUuid(allocation.fulfillmentLineId, "fulfillmentLineId");
    assertUuid(allocation.reservationId, "reservationId");
    assertUuid(allocation.reservationAllocationId, "reservationAllocationId");
    if (allocationIds.has(allocation.reservationAllocationId)) {
      throw new Error("Reservation allocations cannot be reused.");
    }
    allocationIds.add(allocation.reservationAllocationId);
  }
}

export function validatePrepareFulfillmentOrder(
  input: PrepareFulfillmentOrderInput,
): void {
  assertActor(input.actor);
  assertUuid(input.orderId, "orderId");
  assertUuid(input.memberId, "memberId");
  assertUuid(input.reservationId, "reservationId");
  if (input.expectedVersion !== 0) throw new Error("A new fulfillment order must expect version zero.");
  assertKey(input.idempotencyKey);
  normalizeInstant(input.at);
  for (const [label, value] of [
    ["recipient name", input.recipient.name],
    ["address line 1", input.recipient.addressLine1],
    ["city", input.recipient.city],
    ["state", input.recipient.state],
    ["postal code", input.recipient.postalCode],
    ["shipping service", input.shippingService],
  ] as const) {
    if (!value.trim()) throw new Error(`${label} is required.`);
  }
  if (input.recipient.country !== "US" || !/^[A-Z]{2}$/.test(input.recipient.state)) {
    throw new Error("Fulfillment address is outside the supported contract.");
  }
}

export function validateTransitionFulfillment(input: TransitionFulfillmentInput): void {
  assertActor(input.actor);
  assertUuid(input.assignmentId, "assignmentId");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion <= 0) {
    throw new Error("A positive expected version is required.");
  }
  assertKey(input.idempotencyKey);
  normalizeInstant(input.at);
  assertActionAuthority(input.actor, input.action);
  assertReason(input.action, input.reason);
  assertTransitionMetadata(input);
}

export interface FulfillmentServiceDependencies {
  /**
   * Paid-order boundary consulted before any supplier release. Omitting it
   * leaves the fail-closed default in place: every assignment is refused
   * until the composition root wires real paid evidence.
   */
  paidOrderRelease?: PaidOrderReleaseGate;
}

export function createFulfillmentOperationsService(
  port: FulfillmentOperationsPort,
  dependencies: FulfillmentServiceDependencies = {},
): FulfillmentOperationsPort {
  const paidOrderRelease =
    dependencies.paidOrderRelease ?? createFailClosedPaidOrderReleaseGate();
  return {
    async listAssignments(query: FulfillmentQueueQuery) {
      assertActor(query.actor);
      if (
        query.limit !== undefined &&
        (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 200)
      ) {
        throw new Error("Queue limit must be between 1 and 200.");
      }
      return port.listAssignments(query);
    },

    async prepareOrder(input: PrepareFulfillmentOrderInput): Promise<FulfillmentPreparationResult> {
      validatePrepareFulfillmentOrder(input);
      return port.prepareOrder(input);
    },

    async assign(input: AssignFulfillmentInput): Promise<FulfillmentCommandResult> {
      validateAssignFulfillment(input);
      const release = await paidOrderRelease.check(input.fulfillmentOrderId);
      if (!release.releasable) {
        throw new FulfillmentError(
          "UNPAID_ORDER",
          `Unpaid orders never release to a supplier (${release.reason}).`,
        );
      }
      return port.assign(input);
    },

    async transition(input: TransitionFulfillmentInput): Promise<FulfillmentCommandResult> {
      validateTransitionFulfillment(input);
      return port.transition(input);
    },
  };
}
