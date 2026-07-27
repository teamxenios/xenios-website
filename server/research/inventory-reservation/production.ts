import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InventoryReservationAllocation,
  InventoryReservationReceipt,
  InventoryReservationResult,
  InventoryReservationStatus,
  ReserveInventoryInput,
  SettleInventoryReservationInput,
} from "@shared/research/inventory-reservation";
import { INVENTORY_RESERVATION_STATUSES } from "@shared/research/inventory-reservation";
import { getSupabaseAdmin } from "../../supabase";
import type { InventoryReservationPort } from "./port";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;
const MAX_QUANTITY = 100_000_000;

export class InventoryReservationPersistenceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function reject(code: string): never {
  throw new InventoryReservationPersistenceError(code);
}

function isNormalizedInstant(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validateIdentity(value: string, code: string): void {
  if (!UUID.test(value)) reject(code);
}

function validateCommandMetadata(
  memberId: string,
  actorId: string,
  idempotencyKey: string,
  at: string,
): void {
  validateIdentity(memberId, "inventory_reservation_member_invalid");
  validateIdentity(actorId, "inventory_reservation_actor_invalid");
  if (
    idempotencyKey.length < 16 ||
    idempotencyKey.length > 160 ||
    idempotencyKey.trim() !== idempotencyKey
  ) {
    reject("inventory_reservation_idempotency_invalid");
  }
  if (!isNormalizedInstant(at)) reject("inventory_reservation_instant_invalid");
}

function validateReserve(input: ReserveInventoryInput): void {
  validateCommandMetadata(input.memberId, input.actorId, input.idempotencyKey, input.at);
  if (!isNormalizedInstant(input.expiresAt)) {
    reject("inventory_reservation_expiry_invalid");
  }
  if (new Date(input.expiresAt).getTime() <= new Date(input.at).getTime()) {
    reject("inventory_reservation_expiry_invalid");
  }
  if (input.lines.length < 1 || input.lines.length > 100) {
    reject("inventory_reservation_lines_invalid");
  }
  let total = 0;
  for (const line of input.lines) {
    if (!SKU.test(line.sku) || line.sku.trim() !== line.sku) {
      reject("inventory_reservation_sku_invalid");
    }
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY
    ) {
      reject("inventory_reservation_quantity_invalid");
    }
    total += line.quantity;
    if (!Number.isSafeInteger(total) || total > MAX_QUANTITY) {
      reject("inventory_reservation_quantity_invalid");
    }
  }
}

function validateSettlement(input: SettleInventoryReservationInput): void {
  validateCommandMetadata(input.memberId, input.actorId, input.idempotencyKey, input.at);
  if (
    input.reservationIds.length < 1 ||
    input.reservationIds.length > 100 ||
    new Set(input.reservationIds).size !== input.reservationIds.length
  ) {
    reject("inventory_reservation_ids_invalid");
  }
  for (const id of input.reservationIds) {
    validateIdentity(id, "inventory_reservation_ids_invalid");
  }
  if (
    input.reason.trim() !== input.reason ||
    input.reason.length < 3 ||
    input.reason.length > 500
  ) {
    reject("inventory_reservation_reason_invalid");
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function allocation(value: unknown): InventoryReservationAllocation | null {
  const row = object(value);
  if (!row || typeof row.lotId !== "string" || !UUID.test(row.lotId)) return null;
  const quantity = positiveInteger(row.quantity);
  const resultingLotVersion = positiveInteger(row.resultingLotVersion);
  if (quantity === null || resultingLotVersion === null) return null;
  return { lotId: row.lotId, quantity, resultingLotVersion };
}

function receipt(value: unknown): InventoryReservationReceipt | null {
  const row = object(value);
  if (
    !row ||
    typeof row.reservationId !== "string" ||
    !UUID.test(row.reservationId) ||
    typeof row.sku !== "string" ||
    !SKU.test(row.sku) ||
    typeof row.status !== "string" ||
    !(INVENTORY_RESERVATION_STATUSES as readonly string[]).includes(row.status) ||
    typeof row.expiresAt !== "string" ||
    !isNormalizedInstant(row.expiresAt) ||
    !Array.isArray(row.allocations)
  ) {
    return null;
  }
  const quantity = positiveInteger(row.quantity);
  const version = positiveInteger(row.version);
  if (quantity === null || version === null) return null;
  const allocations = row.allocations.map(allocation);
  if (allocations.some((item) => item === null)) return null;
  return {
    reservationId: row.reservationId,
    sku: row.sku,
    quantity,
    status: row.status as InventoryReservationStatus,
    version,
    expiresAt: row.expiresAt,
    allocations: allocations as InventoryReservationAllocation[],
  };
}

function result(
  value: unknown,
  expectedAction: InventoryReservationResult["action"],
): InventoryReservationResult {
  const row = object(value);
  if (
    !row ||
    row.action !== expectedAction ||
    typeof row.idempotentReplay !== "boolean" ||
    !Array.isArray(row.reservations)
  ) {
    reject("inventory_reservation_result_invalid");
  }
  const reservations = row.reservations.map(receipt);
  if (reservations.length < 1 || reservations.some((item) => item === null)) {
    reject("inventory_reservation_result_invalid");
  }
  return {
    action: expectedAction,
    idempotentReplay: row.idempotentReplay,
    reservations: reservations as InventoryReservationReceipt[],
  };
}

type Action = "release" | "finalize" | "expire";

export class SupabaseInventoryReservationPort implements InventoryReservationPort {
  constructor(private readonly db: SupabaseClient = getSupabaseAdmin()) {}

  async reserve(input: ReserveInventoryInput): Promise<InventoryReservationResult> {
    validateReserve(input);
    const response = await this.db.rpc("research_reserve_inventory", {
      p_member_id: input.memberId,
      p_actor_id: input.actorId,
      p_lines: input.lines,
      p_at: input.at,
      p_expires_at: input.expiresAt,
      p_idempotency_key: input.idempotencyKey,
    });
    if (response.error || !response.data) reject("inventory_reservation_rejected");
    return result(response.data, "reserve");
  }

  async release(input: SettleInventoryReservationInput): Promise<InventoryReservationResult> {
    return this.settle("release", "research_release_inventory_reservations", input);
  }

  async finalize(input: SettleInventoryReservationInput): Promise<InventoryReservationResult> {
    return this.settle("finalize", "research_finalize_inventory_reservations", input);
  }

  async expire(input: SettleInventoryReservationInput): Promise<InventoryReservationResult> {
    return this.settle("expire", "research_expire_inventory_reservations", input);
  }

  private async settle(
    action: Action,
    rpc: string,
    input: SettleInventoryReservationInput,
  ): Promise<InventoryReservationResult> {
    validateSettlement(input);
    const response = await this.db.rpc(rpc, {
      p_member_id: input.memberId,
      p_actor_id: input.actorId,
      p_reservation_ids: input.reservationIds,
      p_at: input.at,
      p_idempotency_key: input.idempotencyKey,
      p_reason: input.reason,
    });
    if (response.error || !response.data) reject("inventory_reservation_rejected");
    return result(response.data, action);
  }
}
