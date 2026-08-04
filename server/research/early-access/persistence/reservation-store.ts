import type {
  EarlyAccessReservation,
  EarlyAccessReservationExpiryException,
} from "../commerce/reservation";
import type { EarlyAccessReservationStore } from "../commerce/reservation-store";
import {
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "./executor";

/**
 * The durable `EarlyAccessReservationStore` (migration 53).
 *
 * The two properties the port names live in the DATABASE here: insert
 * idempotence by reservation id and the one-reservation-per-order-draft rule
 * are unique constraints whose violation answers false, and expiry exceptions
 * are append-only by trigger, with no update or delete path for anyone.
 * Expiry itself stays clock-derived by the caller via `reservationHoldsAt`;
 * this adapter never interprets the stored status as validity.
 */

const RPC = {
  insert: "research_early_access_reservation_insert",
  update: "research_early_access_reservation_update",
  byId: "research_early_access_reservation_by_id",
  byDraft: "research_early_access_reservation_by_draft",
  activeForUnit: "research_early_access_reservations_active_for_unit",
  recordExpiryException: "research_early_access_reservation_record_expiry_exception",
  expiryExceptions: "research_early_access_reservation_expiry_exceptions",
} as const;

export class SupabaseEarlyAccessReservationStore implements EarlyAccessReservationStore {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async insert(reservation: EarlyAccessReservation): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.insert,
      args: { p_record: reservation },
    });
    return raw === true;
  }

  async byId(reservationId: string): Promise<EarlyAccessReservation | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.byId,
      args: { p_reservation_id: reservationId },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(expectObject(RPC.byId, raw)) as EarlyAccessReservation);
  }

  async byOrderDraft(orderDraftId: string): Promise<EarlyAccessReservation | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.byDraft,
      args: { p_order_draft_id: orderDraftId },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(expectObject(RPC.byDraft, raw)) as EarlyAccessReservation);
  }

  async update(reservation: EarlyAccessReservation): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.update,
      args: { p_record: reservation },
    });
    return raw === true;
  }

  async activeForUnit(
    productId: string,
    variantId: string,
  ): Promise<readonly EarlyAccessReservation[]> {
    const raw = expectArray(
      RPC.activeForUnit,
      await runEarlyAccessCall(this.query, {
        fn: RPC.activeForUnit,
        args: { p_product_id: productId, p_variant_id: variantId },
      }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(expectObject(RPC.activeForUnit, entry)) as EarlyAccessReservation,
      ),
    );
  }

  async recordExpiryException(
    exception: EarlyAccessReservationExpiryException,
  ): Promise<boolean> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.recordExpiryException,
      args: { p_record: exception },
    });
    return raw === true;
  }

  async expiryExceptions(): Promise<readonly EarlyAccessReservationExpiryException[]> {
    const raw = expectArray(
      RPC.expiryExceptions,
      await runEarlyAccessCall(this.query, { fn: RPC.expiryExceptions, args: {} }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(
            expectObject(RPC.expiryExceptions, entry),
          ) as unknown as EarlyAccessReservationExpiryException,
      ),
    );
  }
}
