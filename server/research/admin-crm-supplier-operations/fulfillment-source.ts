import { z } from "zod";
import { FULFILLMENT_STATES, type FulfillmentActor, type FulfillmentState } from "@shared/research/fulfillment/contracts";
import type { FulfillmentItem, SupplierAssignmentItem } from "@shared/research/admin-crm-supplier-operations";
import type { FulfillmentOrderLineagePort, InternalFulfillmentActor } from "@shared/research/supplier/fulfillment-lineage";
import type { FulfillmentOperationsPort } from "../fulfillment/port";
import type { AdminOperationsReadResult, AdminOperationsSourceReader } from "./composite-repository";

const uuid = z.string().uuid().refine(value => value === value.toLowerCase());
const label = z.string().min(1).max(200).regex(/\S/u);
const instant = z.string().refine(value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const actorSchema = z.object({
  actorId: uuid,
  kind: z.literal("internal"),
  role: z.enum(["super_admin", "operations_admin", "internal_team"]),
});
// Project only fields consumed by the existing CRM. Addresses, phone, lot
// documents, prices, affiliate/member/clinical fields are not copied or logged.
const assignmentSchema = z.object({
  assignmentId: uuid,
  fulfillmentOrderId: uuid,
  orderReference: label,
  supplierId: uuid,
  supplierLabel: label,
  state: z.enum(FULFILLMENT_STATES),
  version: z.number().int().positive().safe(),
  expectedShipAt: instant.nullable(),
  lines: z.array(z.object({ lineId: uuid })).min(1).max(100),
  carrier: label.nullable(),
  trackingReference: label.nullable(),
  updatedAt: instant,
});
const lineageSchema = z.object({
  actorId: uuid,
  rows: z.array(z.object({
    fulfillmentOrderId: uuid,
    orderId: uuid,
    orderReference: label,
  }).strict()).max(200),
}).strict();

// This source contributes already-created assignments currently in work or
// transit. Pre-assignment proposals and terminal history belong to their own
// canonical readers; partial never claims that those records do not exist.
const currentAssignmentStates: ReadonlySet<FulfillmentState> = new Set([
  "assigned", "acknowledged", "picking", "packed", "tracking_created", "shipped", "exception",
]);

export interface CanonicalFulfillmentSourceDependencies {
  fulfillment?: Pick<FulfillmentOperationsPort, "listAssignments">;
  lineage?: FulfillmentOrderLineagePort;
  /** Existing server authorization: never resolve roles from request/profile metadata. */
  resolveActor?(verifiedActorId: string): Promise<FulfillmentActor | null> | FulfillmentActor | null;
  now?(): string;
  /** The canonical queue is bounded; even fewer returned rows never prove completeness. */
  limit?: number;
}

export interface CanonicalFulfillmentSources {
  supplierAssignments: AdminOperationsSourceReader<"supplierAssignments">;
  fulfillment: AdminOperationsSourceReader<"fulfillment">;
}

type Batch = {
  supplierAssignments: AdminOperationsReadResult<SupplierAssignmentItem>;
  fulfillment: AdminOperationsReadResult<FulfillmentItem>;
};

/** Read adapters only. No store, command, API mount, role grant or shipping action. */
export function createCanonicalFulfillmentSources(
  dependencies: CanonicalFulfillmentSourceDependencies = {},
): CanonicalFulfillmentSources {
  const limit = dependencies.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("Fulfillment source limit must be between 1 and 200.");
  }
  const clock = dependencies.now ?? (() => new Date().toISOString());
  // Coalesce the composite repository's concurrent source reads, not completed
  // snapshots. A later read rechecks current authority and obtains new facts.
  const pending = new Map<string, Promise<Batch>>();

  async function readBatch(actorId: string): Promise<Batch> {
    const checkedAt = instant.parse(clock());
    const unavailable = (): Batch => ({
      supplierAssignments: { availability: "unavailable", checkedAt, items: null },
      fulfillment: { availability: "unavailable", checkedAt, items: null },
    });
    if (!uuid.safeParse(actorId).success || !dependencies.fulfillment || !dependencies.lineage || !dependencies.resolveActor) {
      return unavailable();
    }
    try {
      const resolved = actorSchema.safeParse(await dependencies.resolveActor(actorId));
      if (!resolved.success || resolved.data.actorId !== actorId) return unavailable();
      const actor: InternalFulfillmentActor = Object.freeze(resolved.data);
      const raw = await dependencies.fulfillment.listAssignments({ actor, limit });
      const rows = z.array(assignmentSchema).max(limit).parse(raw);
      const assignmentIds = new Set(rows.map(row => row.assignmentId));
      const orderIds = new Set(rows.map(row => row.fulfillmentOrderId));
      if (assignmentIds.size !== rows.length || orderIds.size !== rows.length) return unavailable();
      if (rows.some(row => new Set(row.lines.map(line => line.lineId)).size !== row.lines.length)) return unavailable();

      const lineage = lineageSchema.parse(await dependencies.lineage.read(actor, Object.freeze([...orderIds])));
      if (lineage.actorId !== actorId || lineage.rows.length !== orderIds.size) return unavailable();
      const byOrder = new Map(lineage.rows.map(row => [row.fulfillmentOrderId, row]));
      if (byOrder.size !== lineage.rows.length || lineage.rows.some(row => !orderIds.has(row.fulfillmentOrderId))) return unavailable();
      if (rows.some(row => byOrder.get(row.fulfillmentOrderId)?.orderReference !== row.orderReference)) return unavailable();

      // A resolver/lineage await must not allow a revoked or replaced actor to
      // publish a previously authorized snapshot. Storage remains authoritative.
      const current = actorSchema.safeParse(await dependencies.resolveActor(actorId));
      if (!current.success || current.data.actorId !== actorId || current.data.role !== actor.role) return unavailable();

      const supplierAssignments: SupplierAssignmentItem[] = rows
        .filter(row => currentAssignmentStates.has(row.state))
        .map(row => ({
          assignmentId: row.assignmentId,
          orderId: byOrder.get(row.fulfillmentOrderId)!.orderId,
          orderReference: row.orderReference,
          supplierId: row.supplierId,
          supplierLabel: row.supplierLabel,
          state: "assigned",
          lineCount: row.lines.length,
          targetShipAt: row.expectedShipAt,
          updatedAt: row.updatedAt,
        }));
      const fulfillment: FulfillmentItem[] = rows.map(row => ({
        fulfillmentId: row.fulfillmentOrderId,
        orderId: byOrder.get(row.fulfillmentOrderId)!.orderId,
        orderReference: row.orderReference,
        supplierLabel: row.supplierLabel,
        state: row.state,
        carrier: row.carrier,
        trackingNumber: row.trackingReference,
        // The queue has updatedAt, not the time tracking was recorded. Do not
        // relabel a later packing/shipping/update time as carrier evidence.
        lastTrackingAt: null,
        targetShipAt: row.expectedShipAt,
      }));
      return {
        supplierAssignments: { availability: "partial", checkedAt, items: supplierAssignments },
        fulfillment: { availability: "partial", checkedAt, items: fulfillment },
      };
    } catch {
      // Never return upstream exceptions, recipients, private data or raw query evidence.
      return unavailable();
    }
  }

  function batch(actorId: string): Promise<Batch> {
    const existing = pending.get(actorId);
    if (existing) return existing;
    const read = readBatch(actorId);
    pending.set(actorId, read);
    const clear = () => { if (pending.get(actorId) === read) pending.delete(actorId); };
    void read.then(clear, clear);
    return read;
  }
  return {
    supplierAssignments: { read: async actorId => (await batch(actorId)).supplierAssignments },
    fulfillment: { read: async actorId => (await batch(actorId)).fulfillment },
  };
}
