import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  InventoryReservationSweepError,
  SupabaseInventoryReservationSweeper,
} from "./sweeper";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const AT = "2026-08-13T16:00:00.000Z";
const MIGRATION = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/20260813160000_research_inventory_reservation_sweeper.sql",
  ),
  "utf8",
);

function dbReturning(data: unknown, error: unknown = null): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  } as unknown as SupabaseClient;
}

describe("expired inventory reservation sweeper", () => {
  it("calls one bounded database drain and returns its audited result", async () => {
    const db = dbReturning({
      action: "expire_sweep",
      claimedCount: 2,
      memberBatchCount: 1,
      reservationIds: [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
    });
    const sweeper = new SupabaseInventoryReservationSweeper(db);

    await expect(
      sweeper.drain({ actorId: ACTOR_ID, at: AT, limit: 25, runKey: "kris-launch-a-sweep-0001" }),
    ).resolves.toEqual({
      action: "expire_sweep",
      claimedCount: 2,
      memberBatchCount: 1,
      reservationIds: [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
    });
    expect(db.rpc).toHaveBeenCalledWith("research_sweep_expired_inventory_reservations", {
      p_actor_id: ACTOR_ID,
      p_at: AT,
      p_limit: 25,
      p_run_key: "kris-launch-a-sweep-0001",
    });
  });

  it.each([
    [{ actorId: "bad", at: AT, limit: 25, runKey: "kris-launch-a-sweep-0001" }],
    [{ actorId: ACTOR_ID, at: "2026-08-13T16:00:00Z", limit: 25, runKey: "kris-launch-a-sweep-0001" }],
    [{ actorId: ACTOR_ID, at: AT, limit: 0, runKey: "kris-launch-a-sweep-0001" }],
    [{ actorId: ACTOR_ID, at: AT, limit: 101, runKey: "kris-launch-a-sweep-0001" }],
    [{ actorId: ACTOR_ID, at: AT, limit: 25, runKey: "short" }],
  ])("refuses malformed drain input before touching the database", async (input) => {
    const db = dbReturning(null);
    const sweeper = new SupabaseInventoryReservationSweeper(db);
    await expect(sweeper.drain(input)).rejects.toBeInstanceOf(InventoryReservationSweepError);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on a database error or malformed receipt", async () => {
    await expect(
      new SupabaseInventoryReservationSweeper(dbReturning(null, { message: "boom" })).drain({
        actorId: ACTOR_ID,
        at: AT,
        limit: 25,
        runKey: "kris-launch-a-sweep-0001",
      }),
    ).rejects.toMatchObject({ code: "inventory_reservation_sweep_rejected" });

    await expect(
      new SupabaseInventoryReservationSweeper(
        dbReturning({ action: "expire_sweep", claimedCount: 1, memberBatchCount: 1, reservationIds: [] }),
      ).drain({ actorId: ACTOR_ID, at: AT, limit: 25, runKey: "kris-launch-a-sweep-0001" }),
    ).rejects.toMatchObject({ code: "inventory_reservation_sweep_result_invalid" });
  });

  it("claims only expired held rows with concurrent-worker skipping", () => {
    expect(MIGRATION).toContain("create or replace function public.research_sweep_expired_inventory_reservations");
    expect(MIGRATION).toMatch(/status = 'held'[\s\S]*expires_at <= p_at/i);
    expect(MIGRATION).toMatch(/order by[\s\S]*limit p_limit[\s\S]*for update skip locked/i);
    expect(MIGRATION).toContain("research_expire_inventory_reservations");
    expect(MIGRATION).toContain("cardinality(v_claimed_ids)");
  });

  it("keeps the drain bounded and service-role only", () => {
    expect(MIGRATION).toContain("p_limit not between 1 and 100");
    expect(MIGRATION).toContain("security definer");
    expect(MIGRATION).toContain("set search_path = pg_catalog");
    expect(MIGRATION).toMatch(/revoke all on function public\.research_sweep_expired_inventory_reservations[\s\S]*from public, anon, authenticated, service_role/i);
    expect(MIGRATION).toMatch(/grant execute on function public\.research_sweep_expired_inventory_reservations[\s\S]*to service_role/i);
  });
});
