import { createHash } from "node:crypto";
import type { InventoryReservationPort } from "../inventory-reservation/port";
import {
  DEFAULT_RESERVATION_HOLD_MINUTES,
  type ReservationCommandContext,
  type ReservationSeam,
} from "./checkout";

function commandKey(
  action: "reserve" | "release" | "finalize",
  raw: string,
): string {
  return `checkout-${action}-${createHash("sha256").update(raw).digest("hex")}`;
}

function requireCommand(
  memberId: string | undefined,
  command: ReservationCommandContext | undefined,
): { memberId: string; command: ReservationCommandContext } {
  if (!memberId || !command?.actorId || !command.idempotencyKey) {
    throw new Error("inventory_reservation_command_context_missing");
  }
  return { memberId, command };
}

/**
 * Adapts checkout to the deployed atomic DB command boundary. The older
 * direct-lot-decrement seam remains only as a unit-tested legacy reference;
 * production checkout never calls it.
 */
export function inventoryReservationSeamOverPort(
  port: InventoryReservationPort,
  options: {
    holdMinutes?: number;
    now?: () => Date;
  } = {},
): ReservationSeam {
  const holdMinutes =
    options.holdMinutes ?? DEFAULT_RESERVATION_HOLD_MINUTES;
  const now = options.now ?? (() => new Date());
  return {
    async reserve(memberId, lines, asOf, command) {
      const exact = requireCommand(memberId, command);
      try {
        const result = await port.reserve({
          memberId: exact.memberId,
          actorId: exact.command.actorId,
          lines,
          at: asOf.toISOString(),
          expiresAt: new Date(
            asOf.getTime() + holdMinutes * 60 * 1000,
          ).toISOString(),
          idempotencyKey: commandKey("reserve", exact.command.idempotencyKey),
        });
        return {
          ok: true,
          reservationIds: result.reservations.map(
            (reservation) => reservation.reservationId,
          ),
        };
      } catch {
        return { ok: false, refusals: ["insufficient_stock"] };
      }
    },

    async release(reservationIds, memberId, command) {
      if (reservationIds.length === 0) return;
      const exact = requireCommand(memberId, command);
      await port.release({
        memberId: exact.memberId,
        actorId: exact.command.actorId,
        reservationIds,
        at: now().toISOString(),
        idempotencyKey: commandKey("release", exact.command.idempotencyKey),
        reason: "checkout_not_completed",
      });
    },

    async finalize(reservationIds, memberId, command) {
      if (reservationIds.length === 0) return;
      const exact = requireCommand(memberId, command);
      await port.finalize({
        memberId: exact.memberId,
        actorId: exact.command.actorId,
        reservationIds,
        at: now().toISOString(),
        idempotencyKey: commandKey("finalize", exact.command.idempotencyKey),
        reason: "checkout_payment_captured",
      });
    },
  };
}
