import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignFulfillmentInput,
  FulfillmentAssignmentLine,
  FulfillmentAssignmentView,
  FulfillmentCommandResult,
  FulfillmentPreparationResult,
  FulfillmentQueueQuery,
  PrepareFulfillmentOrderInput,
  TransitionFulfillmentInput,
} from "@shared/research/fulfillment/contracts";
import type { FulfillmentOperationsPort } from "./port";

type Row = Record<string, unknown>;

function requiredString(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Fulfillment persistence returned an invalid ${key}.`);
  }
  return value;
}

function nullableString(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredNumber(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Fulfillment persistence returned an invalid ${key}.`);
  }
  return value;
}

function resultFromRpc(data: unknown): FulfillmentCommandResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Fulfillment command returned an invalid response.");
  }
  const row = data as Row;
  return {
    assignmentId: requiredString(row, "assignmentId"),
    state: requiredString(row, "state") as FulfillmentCommandResult["state"],
    version: requiredNumber(row, "version"),
    idempotentReplay: row.idempotentReplay === true,
  };
}

export function createProductionFulfillmentOperationsPort(
  client: SupabaseClient,
): FulfillmentOperationsPort {
  return {
    async listAssignments(query: FulfillmentQueueQuery): Promise<FulfillmentAssignmentView[]> {
      const { data, error } = await client.rpc(
        "research_fulfillment_list_assignments",
        {
          p_actor_auth_user_id: query.actor.actorId,
          p_supplier_scope_id:
            query.actor.kind === "supplier" ? query.actor.supplierId : null,
          p_states: query.states ?? null,
          p_limit: query.limit ?? 100,
        },
      );
      if (error) throw new Error(`Fulfillment queue unavailable: ${error.message}`);
      if (!Array.isArray(data)) {
        throw new Error("Fulfillment queue returned invalid evidence.");
      }
      return (data as Row[]).map((row) => {
        const recipient = row.recipient as Row;
        const rawLines = Array.isArray(row.lines)
          ? (row.lines as Row[])
          : [];
        const lines: FulfillmentAssignmentLine[] = rawLines.map((line) => {
          return {
            lineId: requiredString(line, "lineId"),
            sku: requiredString(line, "sku"),
            quantity: requiredNumber(line, "quantity"),
            lotId: requiredString(line, "lotId"),
            lotCode: requiredString(line, "lotCode"),
          };
        });
        return {
          assignmentId: requiredString(row, "assignmentId"),
          fulfillmentOrderId: requiredString(row, "fulfillmentOrderId"),
          orderReference: requiredString(row, "orderReference"),
          supplierId: requiredString(row, "supplierId"),
          supplierLabel: requiredString(row, "supplierLabel"),
          state: requiredString(row, "state") as FulfillmentAssignmentView["state"],
          version: requiredNumber(row, "version"),
          expectedShipAt: nullableString(row, "expectedShipAt"),
          recipient: {
            name: requiredString(recipient, "name"),
            addressLine1: requiredString(recipient, "addressLine1"),
            addressLine2: nullableString(recipient, "addressLine2"),
            city: requiredString(recipient, "city"),
            state: requiredString(recipient, "state"),
            postalCode: requiredString(recipient, "postalCode"),
            country: "US",
            phone: nullableString(recipient, "phone"),
          },
          shippingService: requiredString(row, "shippingService"),
          handlingProfile: requiredString(
            row,
            "handlingProfile",
          ) as FulfillmentAssignmentView["handlingProfile"],
          lines,
          labelReference: nullableString(row, "labelReference"),
          carrier: nullableString(row, "carrier"),
          trackingReference: nullableString(row, "trackingReference"),
          updatedAt: requiredString(row, "updatedAt"),
        };
      });
    },

    async prepareOrder(
      _input: PrepareFulfillmentOrderInput,
    ): Promise<FulfillmentPreparationResult> {
      return {
        fulfillmentOrderId: null,
        ready: false,
        reason: "PAID_ORDER_BOUNDARY_REQUIRED",
      };
    },

    async assign(input: AssignFulfillmentInput): Promise<FulfillmentCommandResult> {
      const { data, error } = await client.rpc("research_fulfillment_assign", {
        p_actor_auth_user_id: input.actor.actorId,
        p_supplier_id: input.supplierId,
        p_supplier_offer_id: input.supplierOfferId,
        p_fulfillment_order_id: input.fulfillmentOrderId,
        p_allocations: input.allocations,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_at: input.at,
      });
      if (error) throw new Error(`Fulfillment assignment failed: ${error.message}`);
      return resultFromRpc(data);
    },

    async transition(input: TransitionFulfillmentInput): Promise<FulfillmentCommandResult> {
      const { data, error } = await client.rpc("research_fulfillment_transition", {
        p_actor_auth_user_id: input.actor.actorId,
        p_supplier_scope_id:
          input.actor.kind === "supplier" ? input.actor.supplierId : null,
        p_assignment_id: input.assignmentId,
        p_action: input.action,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_at: input.at,
        p_expected_ship_at: input.expectedShipAt ?? null,
        p_label_reference: input.labelReference ?? null,
        p_carrier: input.carrier ?? null,
        p_service: input.service ?? null,
        p_tracking_reference: input.trackingReference ?? null,
        p_reason: input.reason ?? null,
      });
      if (error) throw new Error(`Fulfillment transition failed: ${error.message}`);
      return resultFromRpc(data);
    },
  };
}
