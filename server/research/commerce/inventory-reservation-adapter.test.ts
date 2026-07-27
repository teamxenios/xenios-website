import { describe, expect, it, vi } from "vitest";
import type { InventoryReservationPort } from "../inventory-reservation/port";
import { inventoryReservationSeamOverPort } from "./inventory-reservation-adapter";

const memberId = "11111111-1111-4111-8111-111111111111";
const reservationId = "22222222-2222-4222-8222-222222222222";
const command = {
  actorId: memberId,
  idempotencyKey: "checkout-command-key-123",
};

function port(): InventoryReservationPort {
  return {
    reserve: vi.fn(async (input) => ({
      action: "reserve",
      idempotentReplay: false,
      reservations: [
        {
          reservationId,
          sku: input.lines[0].sku,
          quantity: input.lines[0].quantity,
          status: "held",
          version: 1,
          expiresAt: input.expiresAt,
          allocations: [
            {
              lotId: "33333333-3333-4333-8333-333333333333",
              quantity: input.lines[0].quantity,
              resultingLotVersion: 2,
            },
          ],
        },
      ],
    })),
    release: vi.fn(async (input) => ({
      action: "release",
      idempotentReplay: false,
      reservations: [
        {
          reservationId,
          sku: "SKU-1",
          quantity: 1,
          status: "released",
          version: 2,
          expiresAt: "2026-07-27T20:30:00.000Z",
          allocations: [],
        },
      ],
    })),
    finalize: vi.fn(async () => ({
      action: "finalize",
      idempotentReplay: false,
      reservations: [
        {
          reservationId,
          sku: "SKU-1",
          quantity: 1,
          status: "finalized",
          version: 2,
          expiresAt: "2026-07-27T20:30:00.000Z",
          allocations: [],
        },
      ],
    })),
    expire: vi.fn(),
  };
}

describe("checkout atomic inventory reservation adapter", () => {
  it("uses fixed command metadata and exact hold expiry", async () => {
    const atomic = port();
    const seam = inventoryReservationSeamOverPort(atomic, {
      now: () => new Date("2026-07-27T20:05:00.000Z"),
    });
    await expect(
      seam.reserve(
        memberId,
        [{ sku: "SKU-1", quantity: 2 }],
        new Date("2026-07-27T20:00:00.000Z"),
        command,
      ),
    ).resolves.toEqual({ ok: true, reservationIds: [reservationId] });
    expect(atomic.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId,
        actorId: memberId,
        lines: [{ sku: "SKU-1", quantity: 2 }],
        at: "2026-07-27T20:00:00.000Z",
        expiresAt: "2026-07-27T20:30:00.000Z",
        idempotencyKey: expect.stringMatching(/^checkout-reserve-[a-f0-9]{64}$/),
      }),
    );
  });

  it("settles only through the port with action-scoped idempotency", async () => {
    const atomic = port();
    const seam = inventoryReservationSeamOverPort(atomic, {
      now: () => new Date("2026-07-27T20:05:00.000Z"),
    });
    await seam.release([reservationId], memberId, command);
    await seam.finalize([reservationId], memberId, command);
    expect(atomic.release).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId,
        actorId: memberId,
        reservationIds: [reservationId],
        reason: "checkout_not_completed",
        idempotencyKey: expect.stringMatching(/^checkout-release-[a-f0-9]{64}$/),
      }),
    );
    expect(atomic.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "checkout_payment_captured",
        idempotencyKey: expect.stringMatching(/^checkout-finalize-[a-f0-9]{64}$/),
      }),
    );
  });

  it("fails closed when the atomic command rejects", async () => {
    const atomic = port();
    vi.mocked(atomic.reserve).mockRejectedValueOnce(new Error("conflict"));
    const seam = inventoryReservationSeamOverPort(atomic);
    await expect(
      seam.reserve(
        memberId,
        [{ sku: "SKU-1", quantity: 1 }],
        new Date("2026-07-27T20:00:00.000Z"),
        command,
      ),
    ).resolves.toEqual({
      ok: false,
      refusals: ["insufficient_stock"],
    });
  });
});
