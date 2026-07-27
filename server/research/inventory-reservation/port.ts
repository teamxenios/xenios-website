import type {
  InventoryReservationResult,
  ReserveInventoryInput,
  SettleInventoryReservationInput,
} from "@shared/research/inventory-reservation";

/**
 * Server-only inventory hold boundary. Authenticated composition supplies the
 * member and actor identities; no route is registered by this unit.
 */
export interface InventoryReservationPort {
  reserve(input: ReserveInventoryInput): Promise<InventoryReservationResult>;
  release(input: SettleInventoryReservationInput): Promise<InventoryReservationResult>;
  finalize(input: SettleInventoryReservationInput): Promise<InventoryReservationResult>;
  expire(input: SettleInventoryReservationInput): Promise<InventoryReservationResult>;
}
