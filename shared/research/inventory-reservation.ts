export const INVENTORY_RESERVATION_STATUSES = [
  "held",
  "released",
  "finalized",
  "expired",
] as const;

export type InventoryReservationStatus =
  (typeof INVENTORY_RESERVATION_STATUSES)[number];

export type InventoryReservationLineInput = {
  sku: string;
  quantity: number;
};

export type InventoryReservationAllocation = {
  lotId: string;
  quantity: number;
  resultingLotVersion: number;
};

export type InventoryReservationReceipt = {
  reservationId: string;
  sku: string;
  quantity: number;
  status: InventoryReservationStatus;
  version: number;
  expiresAt: string;
  allocations: InventoryReservationAllocation[];
};

export type InventoryReservationResult = {
  action: "reserve" | "release" | "finalize" | "expire";
  idempotentReplay: boolean;
  reservations: InventoryReservationReceipt[];
};

export type ReserveInventoryInput = {
  memberId: string;
  actorId: string;
  lines: readonly InventoryReservationLineInput[];
  at: string;
  expiresAt: string;
  idempotencyKey: string;
};

export type SettleInventoryReservationInput = {
  memberId: string;
  actorId: string;
  reservationIds: readonly string[];
  at: string;
  idempotencyKey: string;
  reason: string;
};
