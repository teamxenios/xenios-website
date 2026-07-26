import { createHash } from "node:crypto";
import { InventoryLedger, type InventoryResult } from "./inventory-ledger";
import {
  roleCan,
  transitionOperations,
  type OperationsActor,
  type OperationsAggregate,
  type OperationsAuditEvent,
} from "./state-machines";

export interface FulfillmentItem {
  itemId: string;
  sku: string;
  displayName: string;
  quantity: number;
}

export interface ShipmentDetails {
  carrier: string;
  service: string;
  tracking: string;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export type FulfillmentExceptionKind =
  | "shortage"
  | "inventory"
  | "address"
  | "carrier"
  | "damage"
  | "quality"
  | "other";
export type ExceptionSeverity = "normal" | "urgent" | "samuel_decision";

export interface FulfillmentException {
  id: string;
  kind: FulfillmentExceptionKind;
  severity: ExceptionSeverity;
  detail: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

export interface FulfillmentNote {
  id: string;
  actorId: string;
  text: string;
  assistanceRequested: boolean;
  escalation: boolean;
  createdAt: string;
}

export interface FulfillmentWorkOrder {
  id: string;
  /** Internal ownership key. Never serialized to the Mitch queue. */
  memberRef: string;
  orderReference: string;
  recipientInitials: string;
  destinationZone: string;
  dueAt: string;
  expectedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: FulfillmentItem[];
  aggregate: OperationsAggregate;
  shipment: ShipmentDetails | null;
  exceptions: FulfillmentException[];
  notes: FulfillmentNote[];
}

export type MitchQueue =
  | "new"
  | "awaiting_acknowledgement"
  | "due_today"
  | "picking"
  | "packed"
  | "label_required"
  | "shipped_today"
  | "exceptions"
  | "inventory_issues"
  | "samuel_decisions";

export interface MitchQueueRow {
  id: string;
  orderReference: string;
  recipientInitials: string;
  destinationZone: string;
  dueAt: string;
  expectedAt: string | null;
  fulfillmentState: string;
  shipmentState: string;
  allocationState: string;
  itemCount: number;
  openExceptionCount: number;
  version: number;
}

export interface MemberOrderTracking {
  orderReference: string;
  fulfillmentState: string;
  shipmentState: string;
  carrier: string | null;
  service: string | null;
  tracking: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
}

export type FulfillmentFailureCode =
  | "forbidden"
  | "not_found"
  | "stale_write"
  | "invalid_input"
  | "invalid_state"
  | "inventory_refused"
  | "idempotency_conflict";

export type FulfillmentResult<T> =
  | { ok: true; value: T; idempotent: boolean }
  | { ok: false; code: FulfillmentFailureCode; message: string; inventory?: InventoryResult<never> };

type CommandRecord = { fingerprint: string; value: unknown };

const keyId = (prefix: string, key: string) =>
  `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 18)}`;
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const copy = <T>(value: T): T => structuredClone(value);

/**
 * Mobile fulfillment application service. It exposes only fulfillment
 * metadata to Mitch: no email, phone, health data, CRM timeline, affiliate
 * data, commission data, or admin controls.
 */
export class FulfillmentService {
  private readonly work = new Map<string, FulfillmentWorkOrder>();
  private readonly commands = new Map<string, CommandRecord>();
  private readonly auditLog: OperationsAuditEvent[] = [];

  constructor(readonly inventory: InventoryLedger) {}

  listAudit(): OperationsAuditEvent[] {
    return copy(this.auditLog);
  }

  get(orderId: string): FulfillmentWorkOrder | null {
    const work = this.work.get(orderId);
    return work ? copy(work) : null;
  }

  trackingForMember(orderId: string, memberRef: string): MemberOrderTracking | null {
    const work = this.work.get(orderId);
    if (!work || work.memberRef !== memberRef) return null;
    return {
      orderReference: work.orderReference,
      fulfillmentState: work.aggregate.states.fulfillment,
      shipmentState: work.aggregate.states.shipment,
      carrier: work.shipment?.carrier ?? null,
      service: work.shipment?.service ?? null,
      tracking: work.shipment?.tracking ?? null,
      shippedAt: work.shipment?.shippedAt ?? null,
      deliveredAt: work.shipment?.deliveredAt ?? null,
      updatedAt: work.updatedAt,
    };
  }

  create(input: {
    id: string;
    memberRef: string;
    orderReference: string;
    recipientInitials: string;
    destinationZone: string;
    dueAt: string;
    items: FulfillmentItem[];
    aggregate: OperationsAggregate;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    const fp = fingerprint({ action: "create", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<FulfillmentWorkOrder>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!["system", "operations_manager"].includes(input.actor.role)) {
      return this.failure("forbidden", "Only operations may create fulfillment work.");
    }
    if (this.work.has(input.id)) return this.failure("idempotency_conflict", "That fulfillment order already exists.");
    if (!input.items.length || input.items.some((item) => !item.itemId || !item.sku || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return this.failure("invalid_input", "At least one valid fulfillment item is required.");
    }
    if (
      !input.memberRef.trim() ||
      !input.recipientInitials.trim() ||
      !input.destinationZone.trim() ||
      Number.isNaN(Date.parse(input.dueAt))
    ) {
      return this.failure("invalid_input", "Member reference, recipient initials, destination zone, and due date are required.");
    }

    let aggregate = copy(input.aggregate);
    const queued = transitionOperations({
      aggregate,
      machine: "fulfillment",
      to: "awaiting_acknowledgement",
      actor: input.actor,
      idempotencyKey: `${input.idempotencyKey}:queue`,
      expectedVersion: aggregate.version,
      occurredAt: input.occurredAt,
    });
    if (!queued.ok) return this.failure("invalid_state", queued.message);
    aggregate = queued.aggregate;
    if (queued.audit) this.auditLog.push(queued.audit);
    const reserved = transitionOperations({
      aggregate,
      machine: "allocation",
      to: "reserved",
      actor: input.actor,
      idempotencyKey: `${input.idempotencyKey}:reserve`,
      expectedVersion: aggregate.version,
      occurredAt: input.occurredAt,
    });
    if (!reserved.ok) return this.failure("invalid_state", reserved.message);
    aggregate = reserved.aggregate;
    if (reserved.audit) this.auditLog.push(reserved.audit);

    const now = input.occurredAt.toISOString();
    const value: FulfillmentWorkOrder = {
      id: input.id,
      memberRef: input.memberRef,
      orderReference: input.orderReference,
      recipientInitials: input.recipientInitials.trim(),
      destinationZone: input.destinationZone.trim(),
      dueAt: new Date(input.dueAt).toISOString(),
      expectedAt: null,
      acknowledgedAt: null,
      createdAt: now,
      updatedAt: now,
      items: copy(input.items),
      aggregate,
      shipment: null,
      exceptions: [],
      notes: [],
    };
    this.work.set(value.id, value);
    return this.store(input.idempotencyKey, fp, value);
  }

  acknowledge(input: {
    orderId: string;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    return this.transition(input, "fulfillment", "acknowledged", (work) => {
      work.acknowledgedAt = input.occurredAt.toISOString();
    });
  }

  setExpectedDate(input: {
    orderId: string;
    expectedVersion: number;
    expectedAt: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    if (!roleCan(input.actor.role, "fulfillment:work")) return this.failure("forbidden", "This role cannot update fulfillment.");
    if (Number.isNaN(Date.parse(input.expectedAt))) return this.failure("invalid_input", "Expected date is invalid.");
    return this.metadataWrite(input, "fulfillment.expected_date", (work) => {
      work.expectedAt = new Date(input.expectedAt).toISOString();
    });
  }

  allocateExact(input: {
    orderId: string;
    itemId: string;
    lotId: string;
    quantity: number;
    expectedLotVersion: number;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    const fp = fingerprint({ action: "allocate_exact", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<FulfillmentWorkOrder>(input.idempotencyKey, fp);
    if (replay) return replay;
    const work = this.work.get(input.orderId);
    if (!work) return this.failure("not_found", "Fulfillment order not found.");
    if (work.aggregate.version !== input.expectedVersion) return this.failure("stale_write", "The fulfillment order changed; reload it.");
    if (!roleCan(input.actor.role, "inventory:move")) return this.failure("forbidden", "This role cannot allocate lots.");
    const item = work.items.find((candidate) => candidate.itemId === input.itemId);
    if (!item || item.quantity !== input.quantity) {
      return this.failure("invalid_input", "Allocation must exactly match an order item quantity.");
    }
    const allocated = this.inventory.allocateExact({
      orderId: input.orderId,
      itemId: input.itemId,
      sku: item.sku,
      lotId: input.lotId,
      quantity: input.quantity,
      expectedLotVersion: input.expectedLotVersion,
      actor: input.actor,
      idempotencyKey: `${input.idempotencyKey}:inventory`,
      occurredAt: input.occurredAt,
    });
    if (!allocated.ok) {
      return { ok: false, code: "inventory_refused", message: allocated.message, inventory: allocated as InventoryResult<never> };
    }

    const allAllocated = work.items.every((required) =>
      this.inventory
        .listAllocations(work.id)
        .some(
          (line) =>
            line.itemId === required.itemId &&
            line.sku === required.sku &&
            line.quantity === required.quantity &&
            line.status === "allocated",
        ),
    );
    if (allAllocated && work.aggregate.states.allocation === "reserved") {
      const moved = transitionOperations({
        aggregate: work.aggregate,
        machine: "allocation",
        to: "allocated",
        actor: input.actor,
        idempotencyKey: `${input.idempotencyKey}:state`,
        expectedVersion: work.aggregate.version,
        occurredAt: input.occurredAt,
      });
      if (!moved.ok) return this.failure("invalid_state", moved.message);
      work.aggregate = moved.aggregate;
      if (moved.audit) this.auditLog.push(moved.audit);
    } else {
      this.bump(work, input.actor, "allocation.exact_lot", input.idempotencyKey, input.occurredAt, {
        itemId: input.itemId,
        lotId: input.lotId,
      });
    }
    work.updatedAt = input.occurredAt.toISOString();
    return this.store(input.idempotencyKey, fp, work);
  }

  beginPicking(input: {
    orderId: string;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    const work = this.work.get(input.orderId);
    if (!work) return this.failure("not_found", "Fulfillment order not found.");
    if (work.aggregate.states.allocation !== "allocated") {
      return this.failure("invalid_state", "Every item needs an exact eligible lot before picking.");
    }
    return this.transition(input, "fulfillment", "picking");
  }

  pack(input: {
    orderId: string;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    const packed = this.transition(input, "fulfillment", "packed");
    if (!packed.ok || packed.idempotent) return packed;
    const work = this.work.get(input.orderId)!;
    const label = transitionOperations({
      aggregate: work.aggregate,
      machine: "fulfillment",
      to: "label_required",
      actor: input.actor,
      idempotencyKey: `${input.idempotencyKey}:label_required`,
      expectedVersion: work.aggregate.version,
      occurredAt: input.occurredAt,
    });
    if (!label.ok) return this.failure("invalid_state", label.message);
    work.aggregate = label.aggregate;
    work.updatedAt = input.occurredAt.toISOString();
    if (label.audit) this.auditLog.push(label.audit);
    const fp = fingerprint({
      action: "fulfillment.packed",
      ...input,
      occurredAt: input.occurredAt.toISOString(),
    });
    return this.store(input.idempotencyKey, fp, work);
  }

  addShippingLabel(input: {
    orderId: string;
    expectedVersion: number;
    carrier: string;
    service: string;
    tracking: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    const fp = fingerprint({ action: "label", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<FulfillmentWorkOrder>(input.idempotencyKey, fp);
    if (replay) return replay;
    const work = this.work.get(input.orderId);
    if (!work) return this.failure("not_found", "Fulfillment order not found.");
    if (work.aggregate.version !== input.expectedVersion) return this.failure("stale_write", "The fulfillment order changed; reload it.");
    if (!roleCan(input.actor.role, "shipments:manage")) return this.failure("forbidden", "This role cannot create labels.");
    if (![input.carrier, input.service, input.tracking].every((value) => value.trim())) {
      return this.failure("invalid_input", "Carrier, service, and tracking are required.");
    }
    if (work.aggregate.states.fulfillment !== "label_required" || work.aggregate.states.shipment !== "not_created") {
      return this.failure("invalid_state", "The order is not ready for a shipping label.");
    }
    let aggregate = work.aggregate;
    for (const [to, suffix] of [["label_required", "required"], ["label_created", "created"]] as const) {
      const moved = transitionOperations({
        aggregate,
        machine: "shipment",
        to,
        actor: input.actor,
        idempotencyKey: `${input.idempotencyKey}:${suffix}`,
        expectedVersion: aggregate.version,
        occurredAt: input.occurredAt,
      });
      if (!moved.ok) return this.failure("invalid_state", moved.message);
      aggregate = moved.aggregate;
      if (moved.audit) this.auditLog.push(moved.audit);
    }
    const ready = transitionOperations({
      aggregate,
      machine: "fulfillment",
      to: "ready_to_ship",
      actor: input.actor,
      idempotencyKey: `${input.idempotencyKey}:ready`,
      expectedVersion: aggregate.version,
      occurredAt: input.occurredAt,
    });
    if (!ready.ok) return this.failure("invalid_state", ready.message);
    if (ready.audit) this.auditLog.push(ready.audit);
    work.aggregate = ready.aggregate;
    work.shipment = {
      carrier: input.carrier.trim(),
      service: input.service.trim(),
      tracking: input.tracking.trim(),
      shippedAt: null,
      deliveredAt: null,
    };
    work.updatedAt = input.occurredAt.toISOString();
    return this.store(input.idempotencyKey, fp, work);
  }

  ship(input: {
    orderId: string;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    const fp = fingerprint({ action: "ship", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<FulfillmentWorkOrder>(input.idempotencyKey, fp);
    if (replay) return replay;
    const work = this.work.get(input.orderId);
    if (!work) return this.failure("not_found", "Fulfillment order not found.");
    if (work.aggregate.version !== input.expectedVersion) return this.failure("stale_write", "The fulfillment order changed; reload it.");
    if (!roleCan(input.actor.role, "shipments:manage")) return this.failure("forbidden", "This role cannot ship orders.");
    if (
      !work.shipment ||
      work.aggregate.states.fulfillment !== "ready_to_ship" ||
      work.aggregate.states.shipment !== "label_created" ||
      work.aggregate.states.allocation !== "allocated"
    ) {
      return this.failure("invalid_state", "A complete exact-lot allocation and shipping label are required.");
    }
    const shippedInventory = this.inventory.shipOrder({
      orderId: work.id,
      requiredItems: work.items.map(({ itemId, sku, quantity }) => ({ itemId, sku, quantity })),
      actor: input.actor,
      idempotencyKey: `${input.idempotencyKey}:inventory`,
      occurredAt: input.occurredAt,
    });
    if (!shippedInventory.ok) {
      return {
        ok: false,
        code: "inventory_refused",
        message: shippedInventory.message,
        inventory: shippedInventory as InventoryResult<never>,
      };
    }
    let aggregate = work.aggregate;
    const shipment = transitionOperations({
      aggregate,
      machine: "shipment",
      to: "in_transit",
      actor: input.actor,
      idempotencyKey: `${input.idempotencyKey}:shipment`,
      expectedVersion: aggregate.version,
      occurredAt: input.occurredAt,
    });
    if (!shipment.ok) return this.failure("invalid_state", shipment.message);
    aggregate = shipment.aggregate;
    if (shipment.audit) this.auditLog.push(shipment.audit);
    const allocation = transitionOperations({
      aggregate,
      machine: "allocation",
      to: "shipped",
      actor: { id: "fulfillment-service", role: "system" },
      idempotencyKey: `${input.idempotencyKey}:allocation`,
      expectedVersion: aggregate.version,
      occurredAt: input.occurredAt,
    });
    if (!allocation.ok) return this.failure("invalid_state", allocation.message);
    aggregate = allocation.aggregate;
    if (allocation.audit) this.auditLog.push(allocation.audit);
    const fulfillment = transitionOperations({
      aggregate,
      machine: "fulfillment",
      to: "shipped",
      actor: input.actor,
      idempotencyKey: `${input.idempotencyKey}:fulfillment`,
      expectedVersion: aggregate.version,
      occurredAt: input.occurredAt,
    });
    if (!fulfillment.ok) return this.failure("invalid_state", fulfillment.message);
    if (fulfillment.audit) this.auditLog.push(fulfillment.audit);
    work.aggregate = fulfillment.aggregate;
    work.shipment.shippedAt = input.occurredAt.toISOString();
    work.updatedAt = input.occurredAt.toISOString();
    return this.store(input.idempotencyKey, fp, work);
  }

  reportException(input: {
    orderId: string;
    expectedVersion: number;
    kind: FulfillmentExceptionKind;
    severity: ExceptionSeverity;
    detail: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    if (!roleCan(input.actor.role, "exceptions:manage")) return this.failure("forbidden", "This role cannot report exceptions.");
    if (!input.detail.trim()) return this.failure("invalid_input", "Exception detail is required.");
    return this.metadataWrite(input, "fulfillment.exception", (work) => {
      work.exceptions.push({
        id: keyId("exc", `${input.orderId}:${input.idempotencyKey}`),
        kind: input.kind,
        severity: input.severity,
        detail: input.detail.trim(),
        status: "open",
        createdAt: input.occurredAt.toISOString(),
        resolvedAt: null,
      });
    });
  }

  resolveException(input: {
    orderId: string;
    exceptionId: string;
    expectedVersion: number;
    resolution: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    if (!roleCan(input.actor.role, "exceptions:manage")) {
      return this.failure("forbidden", "This role cannot resolve fulfillment exceptions.");
    }
    if (!input.resolution.trim()) return this.failure("invalid_input", "A resolution is required.");
    const work = this.work.get(input.orderId);
    if (!work) return this.failure("not_found", "Fulfillment order not found.");
    const exception = work.exceptions.find(
      (candidate) => candidate.id === input.exceptionId && candidate.status === "open",
    );
    if (!exception) return this.failure("not_found", "Open fulfillment exception not found.");
    return this.metadataWrite(input, "fulfillment.exception_resolved", () => {
      exception.status = "resolved";
      exception.resolvedAt = input.occurredAt.toISOString();
    });
  }

  addNote(input: {
    orderId: string;
    expectedVersion: number;
    text: string;
    assistanceRequested?: boolean;
    escalation?: boolean;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): FulfillmentResult<FulfillmentWorkOrder> {
    if (!roleCan(input.actor.role, "fulfillment:work")) return this.failure("forbidden", "This role cannot add fulfillment notes.");
    if (!input.text.trim()) return this.failure("invalid_input", "A note is required.");
    return this.metadataWrite(input, "fulfillment.note", (work) => {
      work.notes.push({
        id: keyId("note", `${input.orderId}:${input.idempotencyKey}`),
        actorId: input.actor.id,
        text: input.text.trim(),
        assistanceRequested: input.assistanceRequested === true,
        escalation: input.escalation === true,
        createdAt: input.occurredAt.toISOString(),
      });
    });
  }

  listMitchQueue(queue: MitchQueue, asOf: Date): MitchQueueRow[] {
    const day = asOf.toISOString().slice(0, 10);
    return Array.from(this.work.values())
      .filter((work) => {
        const fulfillment = work.aggregate.states.fulfillment;
        const open = work.exceptions.filter((exception) => exception.status === "open");
        switch (queue) {
          case "new":
            return work.createdAt.slice(0, 10) === day && fulfillment === "awaiting_acknowledgement";
          case "awaiting_acknowledgement":
            return fulfillment === "awaiting_acknowledgement";
          case "due_today":
            return work.dueAt.slice(0, 10) === day && fulfillment !== "shipped";
          case "picking":
            return fulfillment === "picking";
          case "packed":
            return fulfillment === "packed";
          case "label_required":
            return fulfillment === "label_required";
          case "shipped_today":
            return work.shipment?.shippedAt?.slice(0, 10) === day;
          case "exceptions":
            return open.length > 0;
          case "inventory_issues":
            return open.some((exception) => ["shortage", "inventory", "quality", "damage"].includes(exception.kind));
          case "samuel_decisions":
            return (
              open.some((exception) => exception.severity === "samuel_decision") ||
              work.notes.some((note) => note.escalation)
            );
        }
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .map((work) => ({
        id: work.id,
        orderReference: work.orderReference,
        recipientInitials: work.recipientInitials,
        destinationZone: work.destinationZone,
        dueAt: work.dueAt,
        expectedAt: work.expectedAt,
        fulfillmentState: work.aggregate.states.fulfillment,
        shipmentState: work.aggregate.states.shipment,
        allocationState: work.aggregate.states.allocation,
        itemCount: work.items.reduce((total, item) => total + item.quantity, 0),
        openExceptionCount: work.exceptions.filter((exception) => exception.status === "open").length,
        version: work.aggregate.version,
      }));
  }

  private transition<M extends "fulfillment">(
    input: {
      orderId: string;
      expectedVersion: number;
      actor: OperationsActor;
      idempotencyKey: string;
      occurredAt: Date;
    },
    machine: M,
    to: OperationsAggregate["states"][M],
    after?: (work: FulfillmentWorkOrder) => void,
  ): FulfillmentResult<FulfillmentWorkOrder> {
    const fp = fingerprint({ action: `${machine}.${to}`, ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<FulfillmentWorkOrder>(input.idempotencyKey, fp);
    if (replay) return replay;
    const work = this.work.get(input.orderId);
    if (!work) return this.failure("not_found", "Fulfillment order not found.");
    if (work.aggregate.version !== input.expectedVersion) return this.failure("stale_write", "The fulfillment order changed; reload it.");
    const moved = transitionOperations({
      aggregate: work.aggregate,
      machine,
      to,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      occurredAt: input.occurredAt,
    });
    if (!moved.ok) {
      return this.failure(moved.code === "stale_write" ? "stale_write" : moved.code === "role_not_allowed" ? "forbidden" : "invalid_state", moved.message);
    }
    work.aggregate = moved.aggregate;
    work.updatedAt = input.occurredAt.toISOString();
    after?.(work);
    if (moved.audit) this.auditLog.push(moved.audit);
    return this.store(input.idempotencyKey, fp, work);
  }

  private metadataWrite(
    input: {
      orderId: string;
      expectedVersion: number;
      actor: OperationsActor;
      idempotencyKey: string;
      occurredAt: Date;
    },
    action: string,
    mutate: (work: FulfillmentWorkOrder) => void,
  ): FulfillmentResult<FulfillmentWorkOrder> {
    const fp = fingerprint({ action, ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<FulfillmentWorkOrder>(input.idempotencyKey, fp);
    if (replay) return replay;
    const work = this.work.get(input.orderId);
    if (!work) return this.failure("not_found", "Fulfillment order not found.");
    if (work.aggregate.version !== input.expectedVersion) return this.failure("stale_write", "The fulfillment order changed; reload it.");
    mutate(work);
    this.bump(work, input.actor, action, input.idempotencyKey, input.occurredAt);
    work.updatedAt = input.occurredAt.toISOString();
    return this.store(input.idempotencyKey, fp, work);
  }

  private bump(
    work: FulfillmentWorkOrder,
    actor: OperationsActor,
    action: string,
    idempotencyKey: string,
    occurredAt: Date,
    metadata: Record<string, string | number | boolean | null> = {},
  ): void {
    const fromVersion = work.aggregate.version;
    work.aggregate = {
      ...work.aggregate,
      version: fromVersion + 1,
      appliedCommands: {
        ...work.aggregate.appliedCommands,
        [idempotencyKey]: { fingerprint: fingerprint({ action, actor }), resultingVersion: fromVersion + 1 },
      },
    };
    this.auditLog.push({
      id: keyId("audit", `${work.id}:${idempotencyKey}`),
      aggregateId: work.id,
      aggregateVersion: work.aggregate.version,
      actorId: actor.id,
      actorRole: actor.role,
      action,
      machine: "fulfillment",
      from: work.aggregate.states.fulfillment,
      to: work.aggregate.states.fulfillment,
      idempotencyKey,
      occurredAt: occurredAt.toISOString(),
      metadata,
    });
  }

  private replay<T>(key: string, fp: string): FulfillmentResult<T> | null {
    const prior = this.commands.get(key);
    if (!prior) return null;
    if (prior.fingerprint !== fp) return this.failure("idempotency_conflict", "That key belongs to another fulfillment command.");
    return { ok: true, value: copy(prior.value as T), idempotent: true };
  }

  private store<T>(key: string, fp: string, value: T): FulfillmentResult<T> {
    this.commands.set(key, { fingerprint: fp, value: copy(value) });
    return { ok: true, value: copy(value), idempotent: false };
  }

  private failure(code: FulfillmentFailureCode, message: string): FulfillmentResult<never> {
    return { ok: false, code, message };
  }
}
