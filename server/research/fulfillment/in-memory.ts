import type {
  AssignFulfillmentInput,
  FulfillmentAssignmentLine,
  FulfillmentAssignmentView,
  FulfillmentCommandResult,
  FulfillmentPreparationResult,
  FulfillmentQueueQuery,
  FulfillmentState,
  PrepareFulfillmentOrderInput,
  TransitionFulfillmentInput,
} from "@shared/research/fulfillment/contracts";
import type { FulfillmentOperationsPort } from "./port";
import { FULFILLMENT_TRANSITIONS } from "./service";
import { FulfillmentError } from "./errors";

/**
 * Deterministic in-memory implementation of the fulfillment port. It exists
 * for tests and for pre-production composition; it mirrors the production
 * database rules (paid-order boundary, optimistic versions, idempotent
 * replay, supplier scoping) so behavior verified here transfers.
 */

export interface SeededFulfillmentOrder {
  fulfillmentOrderId: string;
  orderReference: string;
  memberId: string;
  paid: boolean;
  recipient: FulfillmentAssignmentView["recipient"];
  shippingService: string;
  handlingProfile: FulfillmentAssignmentView["handlingProfile"];
  expectedShipAt?: string | null;
  lines: FulfillmentAssignmentLine[];
}

export interface SeededSupplier {
  supplierId: string;
  supplierLabel: string;
  operatorActorIds?: string[];
}

interface AssignmentRecord {
  view: FulfillmentAssignmentView;
  memberId: string;
}

interface CommandMemo {
  commandHash: string;
  result: FulfillmentCommandResult;
}

function commandHash(value: unknown): string {
  return JSON.stringify(value);
}

export interface InMemoryFulfillmentStore extends FulfillmentOperationsPort {
  seedSupplier(supplier: SeededSupplier): void;
  seedFulfillmentOrder(order: SeededFulfillmentOrder): void;
  markOrderPaid(fulfillmentOrderId: string): void;
  /** Customer-scope read: only the owning member may resolve the assignment. */
  findAssignmentForMember(
    memberId: string,
    orderReference: string,
  ): Promise<FulfillmentAssignmentView | null>;
  /** Paid-evidence lookup shaped for the service release gate. */
  isOrderPaid(fulfillmentOrderId: string): Promise<boolean>;
}

export function createInMemoryFulfillmentStore(): InMemoryFulfillmentStore {
  const suppliers = new Map<string, SeededSupplier>();
  const orders = new Map<string, SeededFulfillmentOrder>();
  const assignments = new Map<string, AssignmentRecord>();
  const assignedOrderIds = new Set<string>();
  const memos = new Map<string, CommandMemo>();

  function remember(
    scope: string,
    key: string,
    hash: string,
    compute: () => FulfillmentCommandResult,
  ): FulfillmentCommandResult {
    const memoKey = `${scope}:${key}`;
    const existing = memos.get(memoKey);
    if (existing) {
      if (existing.commandHash !== hash) {
        throw new FulfillmentError(
          "IDEMPOTENCY_REUSED",
          "This idempotency key was already used for a different command.",
        );
      }
      return { ...existing.result, idempotentReplay: true };
    }
    const result = compute();
    memos.set(memoKey, { commandHash: hash, result });
    return result;
  }

  return {
    seedSupplier(supplier) {
      suppliers.set(supplier.supplierId, supplier);
    },

    seedFulfillmentOrder(order) {
      orders.set(order.fulfillmentOrderId, order);
    },

    markOrderPaid(fulfillmentOrderId) {
      const order = orders.get(fulfillmentOrderId);
      if (!order) {
        throw new FulfillmentError("NOT_FOUND", "Unknown fulfillment order.");
      }
      orders.set(fulfillmentOrderId, { ...order, paid: true });
    },

    async isOrderPaid(fulfillmentOrderId) {
      return orders.get(fulfillmentOrderId)?.paid === true;
    },

    async listAssignments(
      query: FulfillmentQueueQuery,
    ): Promise<FulfillmentAssignmentView[]> {
      const states = query.states ? new Set<FulfillmentState>(query.states) : null;
      const limit = query.limit ?? 100;
      const rows: FulfillmentAssignmentView[] = [];
      for (const record of Array.from(assignments.values())) {
        if (
          query.actor.kind === "supplier" &&
          record.view.supplierId !== query.actor.supplierId
        ) {
          continue;
        }
        if (states && !states.has(record.view.state)) continue;
        rows.push(structuredClone(record.view));
        if (rows.length >= limit) break;
      }
      return rows;
    },

    async prepareOrder(
      _input: PrepareFulfillmentOrderInput,
    ): Promise<FulfillmentPreparationResult> {
      // Order intake stays owned by the canonical paid-order authority; this
      // port only fulfills orders seeded from it.
      return {
        fulfillmentOrderId: null,
        ready: false,
        reason: "PAID_ORDER_BOUNDARY_REQUIRED",
      };
    },

    async assign(input: AssignFulfillmentInput): Promise<FulfillmentCommandResult> {
      const hash = commandHash({
        supplierId: input.supplierId,
        supplierOfferId: input.supplierOfferId,
        fulfillmentOrderId: input.fulfillmentOrderId,
        allocations: input.allocations,
      });
      return remember("assign", input.idempotencyKey, hash, () => {
        const order = orders.get(input.fulfillmentOrderId);
        if (!order) {
          throw new FulfillmentError("NOT_FOUND", "Unknown fulfillment order.");
        }
        // Defense in depth: mirrors the production paid-order trigger even
        // though the service-level gate already refused unpaid releases.
        if (!order.paid) {
          throw new FulfillmentError(
            "UNPAID_ORDER",
            "Unpaid orders never release to a supplier.",
          );
        }
        const supplier = suppliers.get(input.supplierId);
        if (!supplier) {
          throw new FulfillmentError("NOT_FOUND", "Unknown supplier.");
        }
        if (assignedOrderIds.has(input.fulfillmentOrderId)) {
          throw new FulfillmentError(
            "ALREADY_ASSIGNED",
            "This fulfillment order already has a supplier assignment.",
          );
        }
        const assignmentId = `00000000-0000-4000-8${String(assignments.size + 1).padStart(3, "0")}-${String(assignments.size + 1).padStart(12, "0")}`;
        const view: FulfillmentAssignmentView = {
          assignmentId,
          fulfillmentOrderId: input.fulfillmentOrderId,
          orderReference: order.orderReference,
          supplierId: supplier.supplierId,
          supplierLabel: supplier.supplierLabel,
          state: "assigned",
          version: 1,
          expectedShipAt: order.expectedShipAt ?? null,
          recipient: structuredClone(order.recipient),
          shippingService: order.shippingService,
          handlingProfile: order.handlingProfile,
          lines: structuredClone(order.lines),
          labelReference: null,
          carrier: null,
          trackingReference: null,
          updatedAt: input.at,
        };
        assignments.set(assignmentId, { view, memberId: order.memberId });
        assignedOrderIds.add(input.fulfillmentOrderId);
        return {
          assignmentId,
          state: "assigned" as const,
          version: 1,
          idempotentReplay: false,
        };
      });
    },

    async transition(
      input: TransitionFulfillmentInput,
    ): Promise<FulfillmentCommandResult> {
      const hash = commandHash({
        assignmentId: input.assignmentId,
        action: input.action,
        expectedVersion: input.expectedVersion,
      });
      return remember("transition", input.idempotencyKey, hash, () => {
        const record = assignments.get(input.assignmentId);
        if (!record) {
          throw new FulfillmentError("NOT_FOUND", "Unknown fulfillment assignment.");
        }
        if (
          input.actor.kind === "supplier" &&
          record.view.supplierId !== input.actor.supplierId
        ) {
          // Cross-supplier probes read as not-found so assignment ids leak
          // nothing about other suppliers' work.
          throw new FulfillmentError("NOT_FOUND", "Unknown fulfillment assignment.");
        }
        if (record.view.version !== input.expectedVersion) {
          throw new FulfillmentError(
            "VERSION_CONFLICT",
            "The assignment changed since it was read; refresh and retry.",
          );
        }
        const next = FULFILLMENT_TRANSITIONS[record.view.state][input.action];
        if (!next) {
          throw new FulfillmentError(
            "INVALID_TRANSITION",
            `Action ${input.action} is not valid from state ${record.view.state}.`,
          );
        }
        const view = record.view;
        view.state = next;
        view.version += 1;
        view.updatedAt = input.at;
        if (input.expectedShipAt) view.expectedShipAt = input.expectedShipAt;
        if (input.action === "pack" && input.labelReference) {
          view.labelReference = input.labelReference;
        }
        if (input.action === "record_tracking") {
          view.labelReference = input.labelReference ?? view.labelReference;
          view.carrier = input.carrier ?? null;
          view.shippingService = input.service ?? view.shippingService;
          view.trackingReference = input.trackingReference ?? null;
        }
        return {
          assignmentId: view.assignmentId,
          state: view.state,
          version: view.version,
          idempotentReplay: false,
        };
      });
    },

    async findAssignmentForMember(memberId, orderReference) {
      for (const record of Array.from(assignments.values())) {
        if (
          record.memberId === memberId &&
          record.view.orderReference === orderReference
        ) {
          return structuredClone(record.view);
        }
      }
      return null;
    },
  };
}
