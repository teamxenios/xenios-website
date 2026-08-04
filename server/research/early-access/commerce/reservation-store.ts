/**
 * The persistence port for availability reservations and their expiry
 * exceptions.
 *
 * `reservation.ts` stays PURE: it decides what a reservation is, whether it
 * holds at an instant, and what an expiry requires. This port is where those
 * decisions become durable. The durable adapter (FABLE-DURABLE, migration 53)
 * implements this interface over SQL; the in-memory implementation below is
 * for tests and explicitly-labeled local development, never for production
 * with the feature enabled.
 *
 * Two properties the adapter must keep:
 *
 * 1. Inserts are idempotent by id. `insert` answers false on a replay rather
 *    than throwing, so a retried request cannot create a second hold for the
 *    same reservation id. The durable adapter backs this with a unique
 *    constraint, not application logic.
 * 2. Expiry exceptions are APPEND-ONLY. There is no update and no delete,
 *    because the exception exists to make a lapsed hold with money in hand
 *    impossible to overlook; a mutable row is a row someone can quiet.
 *
 * Expiry itself is deliberately NOT stored as truth. `reservationHoldsAt`
 * derives it from the clock, so a store that was down at the expiry instant
 * cannot answer "still held".
 */

import type {
  EarlyAccessReservation,
  EarlyAccessReservationExpiryException,
} from "./reservation";

export interface EarlyAccessReservationStore {
  /**
   * Persist a NEW reservation. Answers false when the reservation id already
   * exists, which callers treat as an idempotent replay, never an error.
   */
  insert(reservation: EarlyAccessReservation): Promise<boolean>;

  byId(reservationId: string): Promise<EarlyAccessReservation | null>;

  /**
   * The reservation attached to one order draft, or null. An order draft holds
   * at most one reservation; a second insert for the same draft is refused.
   */
  byOrderDraft(orderDraftId: string): Promise<EarlyAccessReservation | null>;

  /**
   * Persist a status transition the PURE module produced (consumed, released,
   * expired). Answers false when the reservation does not exist. The store
   * never invents a transition of its own.
   */
  update(reservation: EarlyAccessReservation): Promise<boolean>;

  /**
   * Reservations recorded "active" for one exact unit. Callers still derive
   * real validity with `reservationHoldsAt`, because a stored "active" says
   * nothing about the clock.
   */
  activeForUnit(
    productId: string,
    variantId: string,
  ): Promise<readonly EarlyAccessReservation[]>;

  /**
   * Append one expiry exception. Answers false when the exception id already
   * exists. There is no way to edit or remove one.
   */
  recordExpiryException(
    exception: EarlyAccessReservationExpiryException,
  ): Promise<boolean>;

  /** Every recorded exception, oldest first. The admin queue reads this. */
  expiryExceptions(): Promise<readonly EarlyAccessReservationExpiryException[]>;
}

/** Test and labeled-local-development store. Not for production. */
export class InMemoryEarlyAccessReservationStore implements EarlyAccessReservationStore {
  private readonly reservations = new Map<string, EarlyAccessReservation>();
  private readonly byDraft = new Map<string, string>();
  private readonly exceptions: EarlyAccessReservationExpiryException[] = [];
  private readonly exceptionIds = new Set<string>();

  async insert(reservation: EarlyAccessReservation): Promise<boolean> {
    if (this.reservations.has(reservation.reservationId)) return false;
    if (this.byDraft.has(reservation.orderDraftId)) return false;
    this.reservations.set(reservation.reservationId, reservation);
    this.byDraft.set(reservation.orderDraftId, reservation.reservationId);
    return true;
  }

  async byId(reservationId: string): Promise<EarlyAccessReservation | null> {
    return this.reservations.get(reservationId) ?? null;
  }

  async byOrderDraft(orderDraftId: string): Promise<EarlyAccessReservation | null> {
    const id = this.byDraft.get(orderDraftId);
    if (id === undefined) return null;
    return this.reservations.get(id) ?? null;
  }

  async update(reservation: EarlyAccessReservation): Promise<boolean> {
    if (!this.reservations.has(reservation.reservationId)) return false;
    this.reservations.set(reservation.reservationId, reservation);
    return true;
  }

  async activeForUnit(
    productId: string,
    variantId: string,
  ): Promise<readonly EarlyAccessReservation[]> {
    return Array.from(this.reservations.values()).filter(
      (reservation) =>
        reservation.status === "active" &&
        reservation.productId === productId &&
        reservation.variantId === variantId,
    );
  }

  async recordExpiryException(
    exception: EarlyAccessReservationExpiryException,
  ): Promise<boolean> {
    if (this.exceptionIds.has(exception.exceptionId)) return false;
    this.exceptionIds.add(exception.exceptionId);
    this.exceptions.push(exception);
    return true;
  }

  async expiryExceptions(): Promise<readonly EarlyAccessReservationExpiryException[]> {
    return [...this.exceptions];
  }
}
