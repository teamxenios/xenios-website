import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type {
  InventoryReservationResult,
  ReserveInventoryInput,
  SettleInventoryReservationInput,
} from "@shared/research/inventory-reservation";
import {
  InventoryReservationPersistenceError,
  SupabaseInventoryReservationPort,
} from "./production";

const MEMBER = "10000000-0000-4000-8000-000000000001";
const ACTOR = "10000000-0000-4000-8000-000000000002";
const RESERVATION = "10000000-0000-4000-8000-000000000003";
const LOT = "10000000-0000-4000-8000-000000000004";
const AT = "2026-07-27T18:00:00.000Z";
const EXPIRES = "2026-07-27T18:30:00.000Z";

function result(
  action: InventoryReservationResult["action"] = "reserve",
): InventoryReservationResult {
  return {
    action,
    idempotentReplay: false,
    reservations: [
      {
        reservationId: RESERVATION,
        sku: "SKU-ONE",
        quantity: 3,
        status:
          action === "reserve"
            ? "held"
            : action === "expire"
              ? "expired"
              : action === "finalize"
                ? "finalized"
                : "released",
        version: action === "reserve" ? 1 : 2,
        expiresAt: EXPIRES,
        allocations: [{ lotId: LOT, quantity: 3, resultingLotVersion: 4 }],
      },
    ],
  };
}

function client(
  response: { data: unknown; error: { message: string } | null },
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): SupabaseClient {
  return {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(response);
    },
  } as unknown as SupabaseClient;
}

function reserveInput(
  overrides: Partial<ReserveInventoryInput> = {},
): ReserveInventoryInput {
  return {
    memberId: MEMBER,
    actorId: ACTOR,
    lines: [{ sku: "SKU-ONE", quantity: 3 }],
    at: AT,
    expiresAt: EXPIRES,
    idempotencyKey: "reserve-command-0001",
    ...overrides,
  };
}

function settlementInput(
  overrides: Partial<SettleInventoryReservationInput> = {},
): SettleInventoryReservationInput {
  return {
    memberId: MEMBER,
    actorId: ACTOR,
    reservationIds: [RESERVATION],
    at: AT,
    idempotencyKey: "settle-command-0001",
    reason: "Checkout composition released the hold",
    ...overrides,
  };
}

describe("SupabaseInventoryReservationPort", () => {
  it("passes the server-authoritative reserve command to the sole reviewed RPC", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const port = new SupabaseInventoryReservationPort(
      client({ data: result(), error: null }, calls),
    );
    await expect(port.reserve(reserveInput())).resolves.toEqual(result());
    expect(calls).toEqual([
      {
        name: "research_reserve_inventory",
        args: {
          p_member_id: MEMBER,
          p_actor_id: ACTOR,
          p_lines: [{ sku: "SKU-ONE", quantity: 3 }],
          p_at: AT,
          p_expires_at: EXPIRES,
          p_idempotency_key: "reserve-command-0001",
        },
      },
    ]);
  });

  it.each([
    ["release", "research_release_inventory_reservations"],
    ["finalize", "research_finalize_inventory_reservations"],
    ["expire", "research_expire_inventory_reservations"],
  ] as const)("uses only the reviewed %s command", async (action, rpc) => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const port = new SupabaseInventoryReservationPort(
      client({ data: result(action), error: null }, calls),
    );
    await expect(port[action](settlementInput())).resolves.toEqual(result(action));
    expect(calls[0]).toEqual({
      name: rpc,
      args: {
        p_member_id: MEMBER,
        p_actor_id: ACTOR,
        p_reservation_ids: [RESERVATION],
        p_at: AT,
        p_idempotency_key: "settle-command-0001",
        p_reason: "Checkout composition released the hold",
      },
    });
  });

  it("rejects malformed identity, instant, TTL, quantity, and key inputs before RPC", async () => {
    const invalid: ReserveInventoryInput[] = [
      reserveInput({ memberId: "member-from-body" }),
      reserveInput({ actorId: "operator@example.com" }),
      reserveInput({ at: "2026-07-27T18:00:00Z" }),
      reserveInput({ expiresAt: AT }),
      reserveInput({ lines: [] }),
      reserveInput({ lines: [{ sku: " SKU-ONE", quantity: 1 }] }),
      reserveInput({ lines: [{ sku: "SKU-ONE", quantity: 0 }] }),
      reserveInput({ lines: [{ sku: "SKU-ONE", quantity: 100_000_001 }] }),
      reserveInput({ idempotencyKey: "short" }),
    ];
    for (const input of invalid) {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const port = new SupabaseInventoryReservationPort(
        client({ data: result(), error: null }, calls),
      );
      await expect(port.reserve(input)).rejects.toBeInstanceOf(
        InventoryReservationPersistenceError,
      );
      expect(calls).toEqual([]);
    }
  });

  it("rejects duplicate, malformed, and cross-shape settlement inputs before RPC", async () => {
    const invalid: SettleInventoryReservationInput[] = [
      settlementInput({ reservationIds: [] }),
      settlementInput({ reservationIds: [RESERVATION, RESERVATION] }),
      settlementInput({ reservationIds: ["reservation-one"] }),
      settlementInput({ reason: "no" }),
      settlementInput({ reason: " trailing " }),
      settlementInput({ at: "2026-07-27T18:00:00+00:00" }),
    ];
    for (const input of invalid) {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const port = new SupabaseInventoryReservationPort(
        client({ data: result("release"), error: null }, calls),
      );
      await expect(port.release(input)).rejects.toBeInstanceOf(
        InventoryReservationPersistenceError,
      );
      expect(calls).toEqual([]);
    }
  });

  it("fails closed on database errors and malformed receipts", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rejected = new SupabaseInventoryReservationPort(
      client({ data: null, error: { message: "sensitive database detail" } }, calls),
    );
    await expect(rejected.reserve(reserveInput())).rejects.toMatchObject({
      code: "inventory_reservation_rejected",
    });

    const malformed = new SupabaseInventoryReservationPort(
      client(
        {
          data: {
            ...result(),
            reservations: [{ ...result().reservations[0], allocations: [] }],
          },
          error: null,
        },
        [],
      ),
    );
    await expect(malformed.reserve(reserveInput())).resolves.toMatchObject({
      action: "reserve",
    });

    const leaking = new SupabaseInventoryReservationPort(
      client(
        {
          data: {
            ...result(),
            reservations: [
              {
                ...result().reservations[0],
                reservationId: "not-an-opaque-uuid",
              },
            ],
          },
          error: null,
        },
        [],
      ),
    );
    await expect(leaking.reserve(reserveInput())).rejects.toMatchObject({
      code: "inventory_reservation_result_invalid",
    });
  });

  it("accepts bounded duplicate-SKU property cases for database consolidation", async () => {
    for (let seed = 1; seed <= 64; seed += 1) {
      const left = (seed % 97) + 1;
      const right = ((seed * 13) % 89) + 1;
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const port = new SupabaseInventoryReservationPort(
        client({ data: result(), error: null }, calls),
      );
      await port.reserve(
        reserveInput({
          lines: [
            { sku: "SKU-ONE", quantity: left },
            { sku: "SKU-ONE", quantity: right },
          ],
          idempotencyKey: `reserve-property-${String(seed).padStart(4, "0")}`,
        }),
      );
      expect(calls[0]?.args.p_lines).toEqual([
        { sku: "SKU-ONE", quantity: left },
        { sku: "SKU-ONE", quantity: right },
      ]);
    }
  });
});
