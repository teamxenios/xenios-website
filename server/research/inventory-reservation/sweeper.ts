import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../../supabase";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NORMALIZED_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type InventoryReservationSweepInput = Readonly<{
  actorId: string;
  at: string;
  limit: number;
  runKey: string;
}>;

export type InventoryReservationSweepResult = Readonly<{
  action: "expire_sweep";
  claimedCount: number;
  memberBatchCount: number;
  reservationIds: readonly string[];
}>;

export interface InventoryReservationSweeper {
  drain(input: InventoryReservationSweepInput): Promise<InventoryReservationSweepResult>;
}

export class InventoryReservationSweepError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function fail(code: string): never {
  throw new InventoryReservationSweepError(code);
}

function validInstant(value: string): boolean {
  if (!NORMALIZED_INSTANT.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validateInput(input: InventoryReservationSweepInput): void {
  if (!UUID.test(input.actorId)) fail("inventory_reservation_sweep_actor_invalid");
  if (!validInstant(input.at)) fail("inventory_reservation_sweep_instant_invalid");
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
    fail("inventory_reservation_sweep_limit_invalid");
  }
  if (
    input.runKey.length < 16 ||
    input.runKey.length > 160 ||
    input.runKey.trim() !== input.runKey
  ) {
    fail("inventory_reservation_sweep_run_key_invalid");
  }
}

function parseResult(value: unknown): InventoryReservationSweepResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("inventory_reservation_sweep_result_invalid");
  }
  const row = value as Record<string, unknown>;
  if (
    row.action !== "expire_sweep" ||
    typeof row.claimedCount !== "number" ||
    !Number.isSafeInteger(row.claimedCount) ||
    row.claimedCount < 0 ||
    row.claimedCount > 100 ||
    typeof row.memberBatchCount !== "number" ||
    !Number.isSafeInteger(row.memberBatchCount) ||
    row.memberBatchCount < 0 ||
    row.memberBatchCount > row.claimedCount ||
    !Array.isArray(row.reservationIds) ||
    row.reservationIds.length !== row.claimedCount ||
    row.reservationIds.some((id) => typeof id !== "string" || !UUID.test(id)) ||
    new Set(row.reservationIds).size !== row.reservationIds.length
  ) {
    fail("inventory_reservation_sweep_result_invalid");
  }
  return {
    action: "expire_sweep",
    claimedCount: row.claimedCount,
    memberBatchCount: row.memberBatchCount,
    reservationIds: row.reservationIds as string[],
  };
}

export class SupabaseInventoryReservationSweeper implements InventoryReservationSweeper {
  constructor(private readonly db: SupabaseClient = getSupabaseAdmin()) {}

  async drain(input: InventoryReservationSweepInput): Promise<InventoryReservationSweepResult> {
    validateInput(input);
    const response = await this.db.rpc("research_sweep_expired_inventory_reservations", {
      p_actor_id: input.actorId,
      p_at: input.at,
      p_limit: input.limit,
      p_run_key: input.runKey,
    });
    if (response.error || response.data === null) {
      fail("inventory_reservation_sweep_rejected");
    }
    return parseResult(response.data);
  }
}
