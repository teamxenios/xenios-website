import { createHash } from "node:crypto";
import { evaluateLot, type InventoryLot, type LotEvaluation } from "../inventory/lots";
import { roleCan, type OperationsActor } from "./state-machines";

export type InventoryMovementKind =
  | "receipt"
  | "reserve"
  | "allocate"
  | "release"
  | "ship"
  | "return"
  | "damage"
  | "correction"
  | "reconcile";

export interface InventoryMovement {
  id: string;
  kind: InventoryMovementKind;
  lotId: string;
  sku: string;
  quantity: number;
  onHandDelta: number;
  orderId: string | null;
  itemId: string | null;
  actorId: string;
  actorRole: OperationsActor["role"];
  reason: string | null;
  idempotencyKey: string;
  occurredAt: string;
}

export type AllocationStatus = "allocated" | "released" | "shipped";

export interface ExactLotAllocation {
  id: string;
  orderId: string;
  itemId: string;
  sku: string;
  lotId: string;
  quantity: number;
  returnedQuantity: number;
  status: AllocationStatus;
  allocatedAt: string;
  updatedAt: string;
}

export interface VersionedLot {
  lot: InventoryLot;
  version: number;
}

export type InventoryFailureCode =
  | "forbidden"
  | "invalid_quantity"
  | "lot_not_found"
  | "lot_stale"
  | "lot_blocked"
  | "sku_mismatch"
  | "insufficient_available"
  | "allocation_not_found"
  | "allocation_incomplete"
  | "idempotency_conflict"
  | "reason_required"
  | "return_exceeds_shipped";

export type InventoryResult<T> =
  | { ok: true; value: T; idempotent: boolean }
  | { ok: false; code: InventoryFailureCode; message: string; evaluation?: LotEvaluation };

type StoredCommand = { fingerprint: string; value: unknown };

function stableFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableId(prefix: string, key: string): string {
  return `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Inventory is derived from an append-only movement ledger. Reserve and
 * allocate events do not decrement physical stock; only `ship`, `damage`, and
 * signed corrections do. This makes a retry unable to double-decrement.
 */
export class InventoryLedger {
  private readonly lots = new Map<string, VersionedLot>();
  private readonly movementLog: InventoryMovement[] = [];
  private readonly allocations = new Map<string, ExactLotAllocation>();
  private readonly commands = new Map<string, StoredCommand>();

  listMovements(): InventoryMovement[] {
    return clone(this.movementLog);
  }

  listLots(): Array<VersionedLot & { onHand: number; allocated: number; available: number; evaluation: LotEvaluation }> {
    return Array.from(this.lots.values()).map(({ lot, version }) => {
      const onHand = this.onHand(lot.lotId);
      const allocated = this.activeAllocated(lot.lotId);
      const current = { ...lot, quantityAvailable: Math.max(0, onHand - allocated) };
      return {
        lot: clone(current),
        version,
        onHand,
        allocated,
        available: current.quantityAvailable,
        evaluation: evaluateLot(current, new Date()),
      };
    });
  }

  listAllocations(orderId?: string): ExactLotAllocation[] {
    return clone(
      Array.from(this.allocations.values()).filter((allocation) => !orderId || allocation.orderId === orderId),
    );
  }

  getLot(lotId: string): (VersionedLot & { onHand: number; allocated: number; available: number }) | null {
    const stored = this.lots.get(lotId);
    if (!stored) return null;
    const onHand = this.onHand(lotId);
    const allocated = this.activeAllocated(lotId);
    return {
      lot: clone({ ...stored.lot, quantityAvailable: Math.max(0, onHand - allocated) }),
      version: stored.version,
      onHand,
      allocated,
      available: Math.max(0, onHand - allocated),
    };
  }

  registerLot(
    lot: InventoryLot,
    quantity: number,
    actor: OperationsActor,
    idempotencyKey: string,
    occurredAt: Date,
  ): InventoryResult<VersionedLot> {
    const fingerprint = stableFingerprint({ action: "register", lot, quantity, actor });
    const replay = this.replay<VersionedLot>(idempotencyKey, fingerprint);
    if (replay) return replay;
    if (!roleCan(actor.role, "inventory:move")) return this.failure("forbidden", "This role cannot receive inventory.");
    if (!Number.isInteger(quantity) || quantity <= 0) return this.failure("invalid_quantity", "Receipt quantity must be a positive integer.");
    if (this.lots.has(lot.lotId)) return this.failure("idempotency_conflict", "That lot already exists.");

    const stored: VersionedLot = { lot: clone({ ...lot, quantityAvailable: 0 }), version: 1 };
    this.lots.set(lot.lotId, stored);
    this.appendMovement("receipt", lot, quantity, quantity, null, null, actor, null, idempotencyKey, occurredAt);
    return this.store(idempotencyKey, fingerprint, stored);
  }

  allocateExact(input: {
    orderId: string;
    itemId: string;
    sku: string;
    lotId: string;
    quantity: number;
    expectedLotVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): InventoryResult<ExactLotAllocation> {
    const fingerprint = stableFingerprint({ action: "allocate", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<ExactLotAllocation>(input.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "inventory:move")) return this.failure("forbidden", "This role cannot allocate inventory.");
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      return this.failure("invalid_quantity", "Allocation quantity must be a positive integer.");
    }
    const stored = this.lots.get(input.lotId);
    if (!stored) return this.failure("lot_not_found", "The selected lot does not exist.");
    if (stored.version !== input.expectedLotVersion) {
      return this.failure("lot_stale", `Expected lot version ${input.expectedLotVersion}; current version is ${stored.version}.`);
    }
    if (stored.lot.sku !== input.sku) return this.failure("sku_mismatch", "The selected lot does not match the item SKU.");

    const current = this.getLot(input.lotId)!;
    const evaluation = evaluateLot(current.lot, input.occurredAt);
    if (!evaluation.allocatable) {
      return {
        ok: false,
        code: "lot_blocked",
        message: `Lot is not eligible: ${evaluation.blockReasons.join(", ")}.`,
        evaluation,
      };
    }
    if (current.available < input.quantity) {
      return this.failure("insufficient_available", `Only ${current.available} units are available in this lot.`);
    }

    const allocationKey = `${input.orderId}:${input.itemId}`;
    if (this.allocations.has(allocationKey)) {
      return this.failure("idempotency_conflict", "This order item already has an exact-lot allocation.");
    }
    const now = input.occurredAt.toISOString();
    const allocation: ExactLotAllocation = {
      id: stableId("alloc", allocationKey),
      orderId: input.orderId,
      itemId: input.itemId,
      sku: input.sku,
      lotId: input.lotId,
      quantity: input.quantity,
      returnedQuantity: 0,
      status: "allocated",
      allocatedAt: now,
      updatedAt: now,
    };
    this.allocations.set(allocationKey, allocation);
    stored.version += 1;
    this.appendMovement(
      "allocate",
      stored.lot,
      input.quantity,
      0,
      input.orderId,
      input.itemId,
      input.actor,
      null,
      input.idempotencyKey,
      input.occurredAt,
    );
    return this.store(input.idempotencyKey, fingerprint, allocation);
  }

  releaseAllocation(input: {
    orderId: string;
    itemId: string;
    reason: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): InventoryResult<ExactLotAllocation> {
    const fingerprint = stableFingerprint({ action: "release", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<ExactLotAllocation>(input.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "inventory:move")) return this.failure("forbidden", "This role cannot release inventory.");
    if (!input.reason.trim()) return this.failure("reason_required", "A release reason is required.");
    const key = `${input.orderId}:${input.itemId}`;
    const allocation = this.allocations.get(key);
    if (!allocation || allocation.status !== "allocated") {
      return this.failure("allocation_not_found", "No active allocation exists for that item.");
    }
    allocation.status = "released";
    allocation.updatedAt = input.occurredAt.toISOString();
    const lot = this.lots.get(allocation.lotId)!;
    lot.version += 1;
    this.appendMovement(
      "release",
      lot.lot,
      allocation.quantity,
      0,
      input.orderId,
      input.itemId,
      input.actor,
      input.reason.trim(),
      input.idempotencyKey,
      input.occurredAt,
    );
    return this.store(input.idempotencyKey, fingerprint, allocation);
  }

  shipOrder(input: {
    orderId: string;
    requiredItems: Array<{ itemId: string; sku: string; quantity: number }>;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): InventoryResult<ExactLotAllocation[]> {
    const fingerprint = stableFingerprint({ action: "ship", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<ExactLotAllocation[]>(input.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "shipments:manage")) return this.failure("forbidden", "This role cannot ship orders.");

    const selected: ExactLotAllocation[] = [];
    for (const item of input.requiredItems) {
      const allocation = this.allocations.get(`${input.orderId}:${item.itemId}`);
      if (
        !allocation ||
        allocation.status !== "allocated" ||
        allocation.sku !== item.sku ||
        allocation.quantity !== item.quantity
      ) {
        return this.failure("allocation_incomplete", `Item ${item.itemId} is not fully allocated to an exact lot.`);
      }
      const current = this.getLot(allocation.lotId)!;
      const evaluation = evaluateLot({ ...current.lot, quantityAvailable: allocation.quantity }, input.occurredAt);
      if (!evaluation.allocatable) {
        return {
          ok: false,
          code: "lot_blocked",
          message: `Allocated lot ${allocation.lotId} became ineligible: ${evaluation.blockReasons.join(", ")}.`,
          evaluation,
        };
      }
      selected.push(allocation);
    }

    // All validation happens before the first write: shipment is all-or-nothing.
    for (const allocation of selected) {
      allocation.status = "shipped";
      allocation.updatedAt = input.occurredAt.toISOString();
      const lot = this.lots.get(allocation.lotId)!;
      lot.version += 1;
      this.appendMovement(
        "ship",
        lot.lot,
        allocation.quantity,
        -allocation.quantity,
        input.orderId,
        allocation.itemId,
        input.actor,
        null,
        `${input.idempotencyKey}:${allocation.itemId}`,
        input.occurredAt,
      );
    }
    return this.store(input.idempotencyKey, fingerprint, selected);
  }

  returnItem(input: {
    orderId: string;
    itemId: string;
    quantity: number;
    reason: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): InventoryResult<ExactLotAllocation> {
    const fingerprint = stableFingerprint({ action: "return", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<ExactLotAllocation>(input.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "inventory:move")) return this.failure("forbidden", "This role cannot receive returns.");
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      return this.failure("invalid_quantity", "Return quantity must be a positive integer.");
    }
    if (!input.reason.trim()) return this.failure("reason_required", "A return reason is required.");
    const allocation = this.allocations.get(`${input.orderId}:${input.itemId}`);
    if (!allocation || allocation.status !== "shipped") {
      return this.failure("allocation_not_found", "The item does not have a shipped exact-lot allocation.");
    }
    if (allocation.returnedQuantity + input.quantity > allocation.quantity) {
      return this.failure("return_exceeds_shipped", "Return quantity exceeds the quantity shipped.");
    }
    allocation.returnedQuantity += input.quantity;
    allocation.updatedAt = input.occurredAt.toISOString();
    const lot = this.lots.get(allocation.lotId)!;
    lot.version += 1;
    this.appendMovement(
      "return",
      lot.lot,
      input.quantity,
      input.quantity,
      input.orderId,
      input.itemId,
      input.actor,
      input.reason.trim(),
      input.idempotencyKey,
      input.occurredAt,
    );
    return this.store(input.idempotencyKey, fingerprint, allocation);
  }

  recordAdjustment(input: {
    lotId: string;
    kind: "damage" | "correction" | "reconcile";
    quantity: number;
    onHandDelta: number;
    reason: string;
    expectedLotVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): InventoryResult<InventoryMovement> {
    const fingerprint = stableFingerprint({ action: "adjust", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay<InventoryMovement>(input.idempotencyKey, fingerprint);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "inventory:move")) return this.failure("forbidden", "This role cannot adjust inventory.");
    if (!input.reason.trim()) return this.failure("reason_required", "An inventory adjustment needs a reason.");
    if (!Number.isInteger(input.quantity) || input.quantity <= 0 || !Number.isInteger(input.onHandDelta)) {
      return this.failure("invalid_quantity", "Inventory quantities must be whole units.");
    }
    const lot = this.lots.get(input.lotId);
    if (!lot) return this.failure("lot_not_found", "The lot does not exist.");
    if (lot.version !== input.expectedLotVersion) {
      return this.failure("lot_stale", `Expected lot version ${input.expectedLotVersion}; current version is ${lot.version}.`);
    }
    if (input.kind === "damage" && input.onHandDelta !== -input.quantity) {
      return this.failure("invalid_quantity", "Damage must decrement by the damaged quantity.");
    }
    if (this.onHand(input.lotId) + input.onHandDelta < 0) {
      return this.failure("insufficient_available", "The adjustment would make on-hand inventory negative.");
    }
    lot.version += 1;
    const movement = this.appendMovement(
      input.kind,
      lot.lot,
      input.quantity,
      input.onHandDelta,
      null,
      null,
      input.actor,
      input.reason.trim(),
      input.idempotencyKey,
      input.occurredAt,
    );
    return this.store(input.idempotencyKey, fingerprint, movement);
  }

  private onHand(lotId: string): number {
    return this.movementLog
      .filter((movement) => movement.lotId === lotId)
      .reduce((total, movement) => total + movement.onHandDelta, 0);
  }

  private activeAllocated(lotId: string): number {
    return Array.from(this.allocations.values())
      .filter((allocation) => allocation.lotId === lotId && allocation.status === "allocated")
      .reduce((total, allocation) => total + allocation.quantity, 0);
  }

  private appendMovement(
    kind: InventoryMovementKind,
    lot: InventoryLot,
    quantity: number,
    onHandDelta: number,
    orderId: string | null,
    itemId: string | null,
    actor: OperationsActor,
    reason: string | null,
    idempotencyKey: string,
    occurredAt: Date,
  ): InventoryMovement {
    const movement: InventoryMovement = {
      id: stableId("mov", `${lot.lotId}:${idempotencyKey}`),
      kind,
      lotId: lot.lotId,
      sku: lot.sku,
      quantity,
      onHandDelta,
      orderId,
      itemId,
      actorId: actor.id,
      actorRole: actor.role,
      reason,
      idempotencyKey,
      occurredAt: occurredAt.toISOString(),
    };
    this.movementLog.push(movement);
    return movement;
  }

  private replay<T>(key: string, fingerprint: string): InventoryResult<T> | null {
    const prior = this.commands.get(key);
    if (!prior) return null;
    if (prior.fingerprint !== fingerprint) {
      return this.failure("idempotency_conflict", "That idempotency key was used for a different inventory command.");
    }
    return { ok: true, value: clone(prior.value as T), idempotent: true };
  }

  private store<T>(key: string, fingerprint: string, value: T): InventoryResult<T> {
    this.commands.set(key, { fingerprint, value: clone(value) });
    return { ok: true, value: clone(value), idempotent: false };
  }

  private failure(code: InventoryFailureCode, message: string): InventoryResult<never> {
    return { ok: false, code, message };
  }
}
