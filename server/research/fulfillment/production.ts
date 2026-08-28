import type { SupabaseClient } from "@supabase/supabase-js";
import { FULFILLMENT_STATES } from "@shared/research/fulfillment/contracts";
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
import { FulfillmentPersistenceError } from "./errors";

type Row = Record<string, unknown>;
const FULFILLMENT_STATE_SET = new Set<string>(FULFILLMENT_STATES);
const HANDLING_PROFILES = new Set<string>(["ambient", "cold_chain"]);

function invalid(key: string): never {
  throw new FulfillmentPersistenceError(`Fulfillment persistence returned invalid ${key}.`);
}

function requiredRow(value: unknown, key: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(key);
  return value as Row;
}

function requiredString(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 1_000) {
    invalid(key);
  }
  return value;
}

function nullableString(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 1_000) {
    invalid(key);
  }
  return value;
}

function requiredPositiveInteger(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid(key);
  return value;
}

function requiredState(row: Row): FulfillmentCommandResult["state"] {
  const value = requiredString(row, "state");
  if (!FULFILLMENT_STATE_SET.has(value)) invalid("state");
  return value as FulfillmentCommandResult["state"];
}

function requiredHandlingProfile(row: Row): FulfillmentAssignmentView["handlingProfile"] {
  const value = requiredString(row, "handlingProfile");
  if (!HANDLING_PROFILES.has(value)) invalid("handlingProfile");
  return value as FulfillmentAssignmentView["handlingProfile"];
}

function requiredNormalizedInstant(row: Row, key: string): string {
  const value = requiredString(row, key);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid(key);
  return value;
}

function nullableNormalizedInstant(row: Row, key: string): string | null {
  const value = nullableString(row, key);
  if (value === null) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid(key);
  return value;
}

function resultFromRpc(data: unknown): FulfillmentCommandResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new FulfillmentPersistenceError("Fulfillment command returned an invalid response.");
  }
  const row = data as Row;
  if (typeof row.idempotentReplay !== "boolean") invalid("idempotentReplay");
  return {
    assignmentId: requiredString(row, "assignmentId"),
    state: requiredState(row),
    version: requiredPositiveInteger(row, "version"),
    idempotentReplay: row.idempotentReplay,
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
      if (error) throw new FulfillmentPersistenceError("Fulfillment queue unavailable.");
      if (!Array.isArray(data)) {
        throw new FulfillmentPersistenceError("Fulfillment queue returned invalid evidence.");
      }
      const responseLimit = query.limit ?? 100;
      if (data.length > responseLimit) invalid("queue length");
      return data.map((rawRow) => {
        const row = requiredRow(rawRow, "assignment row");
        const recipient = requiredRow(row.recipient, "recipient");
        if (!Array.isArray(row.lines) || row.lines.length === 0 || row.lines.length > 100) {
          invalid("lines");
        }
        const lines: FulfillmentAssignmentLine[] = row.lines.map((rawLine) => {
          const line = requiredRow(rawLine, "line");
          return {
            lineId: requiredString(line, "lineId"),
            sku: requiredString(line, "sku"),
            quantity: requiredPositiveInteger(line, "quantity"),
            lotId: requiredString(line, "lotId"),
            lotCode: requiredString(line, "lotCode"),
          };
        });
        if (requiredString(recipient, "country") !== "US") invalid("country");
        if (!/^[A-Z]{2}$/.test(requiredString(recipient, "state"))) {
          invalid("recipient state");
        }
        return {
          assignmentId: requiredString(row, "assignmentId"),
          fulfillmentOrderId: requiredString(row, "fulfillmentOrderId"),
          orderReference: requiredString(row, "orderReference"),
          supplierId: requiredString(row, "supplierId"),
          supplierLabel: requiredString(row, "supplierLabel"),
          state: requiredState(row),
          version: requiredPositiveInteger(row, "version"),
          expectedShipAt: nullableNormalizedInstant(row, "expectedShipAt"),
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
          handlingProfile: requiredHandlingProfile(row),
          lines,
          labelReference: nullableString(row, "labelReference"),
          carrier: nullableString(row, "carrier"),
          trackingReference: nullableString(row, "trackingReference"),
          updatedAt: requiredNormalizedInstant(row, "updatedAt"),
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
      if (error) throw new FulfillmentPersistenceError("Fulfillment assignment failed.");
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
      if (error) throw new FulfillmentPersistenceError("Fulfillment transition failed.");
      return resultFromRpc(data);
    },
  };
}
