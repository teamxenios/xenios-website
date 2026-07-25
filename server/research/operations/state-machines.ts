import { createHash } from "node:crypto";

/**
 * Operations deliberately has its own narrow roles. `mitch` is a logistics
 * operator, never an alias for an administrator.
 */
export type OperationsRole =
  | "admin"
  | "operations_manager"
  | "finance"
  | "mitch"
  | "logistics"
  | "affiliate"
  | "professional"
  | "system"
  | "provider";

export type OperationsPermission =
  | "operations:read"
  | "orders:transition"
  | "fulfillment:work"
  | "inventory:move"
  | "shipments:manage"
  | "exceptions:manage"
  | "crm:read"
  | "crm:write"
  | "affiliate:self"
  | "affiliate:review"
  | "commissions:manage"
  | "payouts:manage"
  | "professional:review"
  | "audit:read";

const ROLE_PERMISSIONS: Readonly<Record<OperationsRole, ReadonlySet<OperationsPermission>>> = {
  admin: new Set<OperationsPermission>([
    "operations:read",
    "orders:transition",
    "exceptions:manage",
    "crm:read",
    "crm:write",
    "affiliate:review",
    "commissions:manage",
    "payouts:manage",
    "professional:review",
    "audit:read",
  ]),
  operations_manager: new Set<OperationsPermission>([
    "operations:read",
    "orders:transition",
    "fulfillment:work",
    "inventory:move",
    "shipments:manage",
    "exceptions:manage",
    "crm:read",
    "crm:write",
    "affiliate:review",
    "commissions:manage",
    "professional:review",
    "audit:read",
  ]),
  finance: new Set<OperationsPermission>(["operations:read", "commissions:manage", "payouts:manage", "audit:read"]),
  mitch: new Set<OperationsPermission>([
    "operations:read",
    "fulfillment:work",
    "inventory:move",
    "shipments:manage",
    "exceptions:manage",
  ]),
  logistics: new Set<OperationsPermission>([
    "operations:read",
    "fulfillment:work",
    "inventory:move",
    "shipments:manage",
    "exceptions:manage",
  ]),
  affiliate: new Set<OperationsPermission>(["affiliate:self"]),
  professional: new Set(),
  system: new Set<OperationsPermission>([
    "operations:read",
    "orders:transition",
    "fulfillment:work",
    "inventory:move",
    "shipments:manage",
    "exceptions:manage",
    "crm:write",
    "affiliate:review",
    "commissions:manage",
    "payouts:manage",
    "professional:review",
    "audit:read",
  ]),
  provider: new Set<OperationsPermission>(["orders:transition", "shipments:manage"]),
};

export function roleCan(role: OperationsRole, permission: OperationsPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export type PaymentState =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "chargeback";
export type OperationsOrderState =
  | "new"
  | "confirmed"
  | "processing"
  | "complete"
  | "cancelled"
  | "returned";
export type FulfillmentState =
  | "new"
  | "awaiting_acknowledgement"
  | "acknowledged"
  | "picking"
  | "packed"
  | "label_required"
  | "ready_to_ship"
  | "shipped"
  | "exception"
  | "returned";
export type ShipmentState =
  | "not_created"
  | "label_required"
  | "label_created"
  | "in_transit"
  | "delivered"
  | "exception"
  | "return_requested"
  | "returned";
export type AllocationState = "unallocated" | "reserved" | "allocated" | "released" | "shipped";

export type MachineState = {
  payment: PaymentState;
  order: OperationsOrderState;
  fulfillment: FulfillmentState;
  shipment: ShipmentState;
  allocation: AllocationState;
};

export type MachineName = keyof MachineState;

export interface OperationsActor {
  id: string;
  role: OperationsRole;
}

export interface AppliedCommand {
  fingerprint: string;
  resultingVersion: number;
}

export interface OperationsAggregate {
  id: string;
  version: number;
  states: MachineState;
  appliedCommands: Record<string, AppliedCommand>;
}

export interface OperationsAuditEvent {
  id: string;
  aggregateId: string;
  aggregateVersion: number;
  actorId: string;
  actorRole: OperationsRole;
  action: string;
  machine: MachineName;
  from: string;
  to: string;
  idempotencyKey: string;
  occurredAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

type StateFor<M extends MachineName> = MachineState[M];

type Rule<M extends MachineName> = {
  from: StateFor<M>;
  to: StateFor<M>;
  roles: readonly OperationsRole[];
  permission: OperationsPermission;
};

const PAYMENT_RULES: readonly Rule<"payment">[] = [
  { from: "pending", to: "authorized", roles: ["system", "provider"], permission: "orders:transition" },
  { from: "pending", to: "failed", roles: ["system", "provider"], permission: "orders:transition" },
  { from: "authorized", to: "captured", roles: ["system", "provider"], permission: "orders:transition" },
  { from: "authorized", to: "failed", roles: ["system", "provider"], permission: "orders:transition" },
  { from: "captured", to: "refunded", roles: ["system", "provider"], permission: "orders:transition" },
  { from: "captured", to: "chargeback", roles: ["system", "provider"], permission: "orders:transition" },
] as const;

const ORDER_RULES: readonly Rule<"order">[] = [
  { from: "new", to: "confirmed", roles: ["admin", "operations_manager", "system"], permission: "orders:transition" },
  { from: "new", to: "cancelled", roles: ["admin", "operations_manager", "system"], permission: "orders:transition" },
  { from: "confirmed", to: "processing", roles: ["admin", "operations_manager", "system"], permission: "orders:transition" },
  { from: "confirmed", to: "cancelled", roles: ["admin", "operations_manager", "system"], permission: "orders:transition" },
  { from: "processing", to: "complete", roles: ["operations_manager", "system"], permission: "orders:transition" },
  { from: "processing", to: "cancelled", roles: ["admin", "operations_manager"], permission: "orders:transition" },
  { from: "complete", to: "returned", roles: ["operations_manager", "system"], permission: "orders:transition" },
] as const;

const FULFILLMENT_RULES: readonly Rule<"fulfillment">[] = [
  { from: "new", to: "awaiting_acknowledgement", roles: ["operations_manager", "system"], permission: "fulfillment:work" },
  { from: "awaiting_acknowledgement", to: "acknowledged", roles: ["mitch", "logistics"], permission: "fulfillment:work" },
  { from: "acknowledged", to: "picking", roles: ["mitch", "logistics"], permission: "fulfillment:work" },
  { from: "picking", to: "packed", roles: ["mitch", "logistics"], permission: "fulfillment:work" },
  { from: "packed", to: "label_required", roles: ["mitch", "logistics"], permission: "fulfillment:work" },
  { from: "label_required", to: "ready_to_ship", roles: ["mitch", "logistics", "system"], permission: "fulfillment:work" },
  { from: "ready_to_ship", to: "shipped", roles: ["mitch", "logistics", "system"], permission: "fulfillment:work" },
  { from: "shipped", to: "returned", roles: ["operations_manager", "system"], permission: "fulfillment:work" },
  ...(["new", "awaiting_acknowledgement", "acknowledged", "picking", "packed", "label_required", "ready_to_ship"] as const).map(
    (from) => ({
      from,
      to: "exception" as const,
      roles: ["mitch", "logistics", "operations_manager"] as const,
      permission: "exceptions:manage" as const,
    }),
  ),
  { from: "exception", to: "picking", roles: ["operations_manager"], permission: "exceptions:manage" },
  { from: "exception", to: "packed", roles: ["operations_manager"], permission: "exceptions:manage" },
] as const;

const SHIPMENT_RULES: readonly Rule<"shipment">[] = [
  { from: "not_created", to: "label_required", roles: ["mitch", "logistics", "system"], permission: "shipments:manage" },
  { from: "label_required", to: "label_created", roles: ["mitch", "logistics", "system"], permission: "shipments:manage" },
  { from: "label_created", to: "in_transit", roles: ["mitch", "logistics", "system", "provider"], permission: "shipments:manage" },
  { from: "in_transit", to: "delivered", roles: ["system", "provider"], permission: "shipments:manage" },
  { from: "in_transit", to: "exception", roles: ["system", "provider"], permission: "shipments:manage" },
  { from: "delivered", to: "return_requested", roles: ["operations_manager", "system"], permission: "shipments:manage" },
  { from: "return_requested", to: "returned", roles: ["operations_manager", "system", "provider"], permission: "shipments:manage" },
] as const;

const ALLOCATION_RULES: readonly Rule<"allocation">[] = [
  { from: "unallocated", to: "reserved", roles: ["operations_manager", "system"], permission: "inventory:move" },
  { from: "reserved", to: "allocated", roles: ["mitch", "logistics", "system"], permission: "inventory:move" },
  { from: "reserved", to: "released", roles: ["mitch", "logistics", "operations_manager", "system"], permission: "inventory:move" },
  { from: "allocated", to: "released", roles: ["mitch", "logistics", "operations_manager", "system"], permission: "inventory:move" },
  { from: "allocated", to: "shipped", roles: ["system"], permission: "inventory:move" },
] as const;

const RULES: { [M in MachineName]: readonly Rule<M>[] } = {
  payment: PAYMENT_RULES,
  order: ORDER_RULES,
  fulfillment: FULFILLMENT_RULES,
  shipment: SHIPMENT_RULES,
  allocation: ALLOCATION_RULES,
};

export interface TransitionInput<M extends MachineName> {
  aggregate: OperationsAggregate;
  machine: M;
  to: StateFor<M>;
  actor: OperationsActor;
  idempotencyKey: string;
  expectedVersion: number;
  occurredAt: Date;
  metadata?: Record<string, string | number | boolean | null>;
}

export type TransitionFailureCode =
  | "idempotency_key_required"
  | "idempotency_conflict"
  | "stale_write"
  | "transition_not_allowed"
  | "role_not_allowed";

export type TransitionResult =
  | {
      ok: true;
      aggregate: OperationsAggregate;
      audit: OperationsAuditEvent | null;
      idempotent: boolean;
    }
  | { ok: false; code: TransitionFailureCode; message: string };

function fingerprint(machine: MachineName, to: string, actor: OperationsActor): string {
  return createHash("sha256")
    .update(JSON.stringify({ machine, to, actorId: actor.id, role: actor.role }))
    .digest("hex");
}

function auditId(aggregateId: string, idempotencyKey: string): string {
  return createHash("sha256").update(`${aggregateId}:${idempotencyKey}`).digest("hex").slice(0, 24);
}

/**
 * The single state transition authority for operations. It never updates more
 * than the requested machine, rejects stale versions, absorbs identical
 * retries, and returns the immutable audit event alongside the new snapshot.
 */
export function transitionOperations<M extends MachineName>(input: TransitionInput<M>): TransitionResult {
  const key = input.idempotencyKey.trim();
  if (!key) {
    return { ok: false, code: "idempotency_key_required", message: "An idempotency key is required." };
  }

  const from = input.aggregate.states[input.machine];
  const commandFingerprint = fingerprint(input.machine, input.to, input.actor);
  const applied = input.aggregate.appliedCommands[key];
  if (applied) {
    if (applied.fingerprint !== commandFingerprint) {
      return { ok: false, code: "idempotency_conflict", message: "That idempotency key was used for another command." };
    }
    return { ok: true, aggregate: input.aggregate, audit: null, idempotent: true };
  }

  if (input.expectedVersion !== input.aggregate.version) {
    return {
      ok: false,
      code: "stale_write",
      message: `Expected version ${input.expectedVersion}; current version is ${input.aggregate.version}.`,
    };
  }

  const rules = RULES[input.machine] as readonly Rule<M>[];
  const rule = rules.find((candidate) => candidate.from === from && candidate.to === input.to);
  if (!rule) {
    return {
      ok: false,
      code: "transition_not_allowed",
      message: `No ${input.machine} transition from ${from} to ${input.to}.`,
    };
  }

  if (!rule.roles.includes(input.actor.role) || !roleCan(input.actor.role, rule.permission)) {
    return {
      ok: false,
      code: "role_not_allowed",
      message: `${input.actor.role} may not move ${input.machine} from ${from} to ${input.to}.`,
    };
  }

  const nextVersion = input.aggregate.version + 1;
  const next: OperationsAggregate = {
    ...input.aggregate,
    version: nextVersion,
    states: { ...input.aggregate.states, [input.machine]: input.to },
    appliedCommands: {
      ...input.aggregate.appliedCommands,
      [key]: { fingerprint: commandFingerprint, resultingVersion: nextVersion },
    },
  };
  const audit: OperationsAuditEvent = {
    id: auditId(input.aggregate.id, key),
    aggregateId: input.aggregate.id,
    aggregateVersion: nextVersion,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: `${input.machine}.${input.to}`,
    machine: input.machine,
    from,
    to: input.to,
    idempotencyKey: key,
    occurredAt: input.occurredAt.toISOString(),
    metadata: { ...(input.metadata ?? {}) },
  };
  return { ok: true, aggregate: next, audit, idempotent: false };
}

export function newOperationsAggregate(id: string): OperationsAggregate {
  return {
    id,
    version: 0,
    states: {
      payment: "pending",
      order: "new",
      fulfillment: "new",
      shipment: "not_created",
      allocation: "unallocated",
    },
    appliedCommands: {},
  };
}
