// xenios research: inventory, lots, and FEFO allocation.
//
// Allocation is FEFO (first expired, first out) rather than FIFO, because for a
// dated material the risk that matters is expiry, not arrival order.
//
// The design rule: a lot must EARN the right to ship. `allocatable` starts false
// and every disposition, document, and date check must pass. A lot with unknown
// data is not allocatable, so missing information can never be mistaken for a
// clean lot.

export type LotDisposition =
  | "available"
  | "allocated"
  | "picked"
  | "packed"
  | "shipped"
  | "quarantined"
  | "quality_hold"
  | "temperature_hold"
  | "damaged"
  | "expired"
  | "recalled"
  | "destroyed";

export const LOT_DISPOSITIONS: readonly LotDisposition[] = [
  "available",
  "allocated",
  "picked",
  "packed",
  "shipped",
  "quarantined",
  "quality_hold",
  "temperature_hold",
  "damaged",
  "expired",
  "recalled",
  "destroyed",
] as const;

export type FulfillmentOwner = "mitch" | "xenios";

export type ExcursionState = "none" | "pending_review" | "cleared" | "rejected";

export interface QualityDocuments {
  /** A certificate of analysis on file for THIS lot, not for the product generally. */
  coaOnFile: boolean;
  identityConfirmed: boolean;
  purityConfirmed: boolean;
  sterilityConfirmed: boolean | null; // null when not applicable to the format
  endotoxinConfirmed: boolean | null;
}

export interface InventoryLot {
  lotId: string;
  sku: string;
  owner: FulfillmentOwner;
  disposition: LotDisposition;
  quantityAvailable: number;

  /**
   * Dates are nullable on purpose. Shelf life must never be invented, so an unknown
   * expiry is null and null blocks allocation rather than defaulting to "fine".
   */
  manufacturedDate: string | null;
  expiryDate: string | null;
  retestDate: string | null;
  shelfLifeSource: "supplier_document" | "coa" | "not_confirmed";

  documents: QualityDocuments;
  excursion: ExcursionState;
  recalled: boolean;
}

export type LotBlockReason =
  | "disposition_not_available"
  | "expired"
  | "expiry_unknown"
  | "retest_overdue"
  | "quarantined"
  | "excursion_pending"
  | "recalled"
  | "damaged"
  | "documentation_missing"
  | "shelf_life_not_confirmed"
  | "no_quantity";

export interface LotEvaluation {
  lotId: string;
  allocatable: boolean;
  blockReasons: LotBlockReason[];
}

const NON_ALLOCATABLE_DISPOSITIONS: ReadonlySet<LotDisposition> = new Set<LotDisposition>([
  "allocated",
  "picked",
  "packed",
  "shipped",
  "quarantined",
  "quality_hold",
  "temperature_hold",
  "damaged",
  "expired",
  "recalled",
  "destroyed",
]);

/** Documentation that must be present before a lot may be allocated. */
function documentationComplete(docs: QualityDocuments): boolean {
  if (!docs.coaOnFile) return false;
  if (!docs.identityConfirmed) return false;
  if (!docs.purityConfirmed) return false;
  // null means not applicable to this format. false means required and absent.
  if (docs.sterilityConfirmed === false) return false;
  if (docs.endotoxinConfirmed === false) return false;
  return true;
}

/**
 * Evaluates one lot against every blocking rule.
 *
 * Accumulates all reasons rather than returning on the first, so an operator sees
 * the complete picture instead of clearing one block at a time.
 *
 * `asOf` is injected rather than read from the clock so this is deterministic and
 * testable, and so a batch allocation evaluates every lot at one instant.
 */
export function evaluateLot(lot: InventoryLot, asOf: Date): LotEvaluation {
  const blockReasons: LotBlockReason[] = [];

  if (lot.quantityAvailable <= 0) blockReasons.push("no_quantity");

  if (NON_ALLOCATABLE_DISPOSITIONS.has(lot.disposition)) {
    // Give the precise reason where one exists, so the message is actionable.
    if (lot.disposition === "quarantined") blockReasons.push("quarantined");
    else if (lot.disposition === "damaged") blockReasons.push("damaged");
    else if (lot.disposition === "expired") blockReasons.push("expired");
    else if (lot.disposition === "recalled") blockReasons.push("recalled");
    else blockReasons.push("disposition_not_available");
  }

  if (lot.recalled && !blockReasons.includes("recalled")) blockReasons.push("recalled");

  // Expiry. Unknown is treated as blocking, never as acceptable.
  if (lot.expiryDate === null) {
    blockReasons.push("expiry_unknown");
  } else if (new Date(lot.expiryDate).getTime() <= asOf.getTime()) {
    if (!blockReasons.includes("expired")) blockReasons.push("expired");
  }

  if (lot.retestDate !== null && new Date(lot.retestDate).getTime() <= asOf.getTime()) {
    blockReasons.push("retest_overdue");
  }

  if (lot.excursion === "pending_review") blockReasons.push("excursion_pending");
  if (lot.excursion === "rejected" && !blockReasons.includes("quarantined")) {
    blockReasons.push("quarantined");
  }

  if (!documentationComplete(lot.documents)) blockReasons.push("documentation_missing");

  if (lot.shelfLifeSource === "not_confirmed") blockReasons.push("shelf_life_not_confirmed");

  return { lotId: lot.lotId, allocatable: blockReasons.length === 0, blockReasons };
}

// ---------------------------------------------------------------------------
// FEFO allocation
// ---------------------------------------------------------------------------

export interface AllocationLine {
  lotId: string;
  quantity: number;
}

export type AllocationResult =
  | { ok: true; lines: AllocationLine[] }
  | {
      ok: false;
      reason: "insufficient_allocatable_stock";
      requested: number;
      allocatable: number;
      /** Why each candidate lot was refused, for the admin queue. */
      rejected: LotEvaluation[];
    };

/**
 * Allocates `quantity` of `sku` across lots, earliest expiry first.
 *
 * Returns all-or-nothing. A partial allocation would silently create an order that
 * cannot be fulfilled, so an under-supplied request fails and reports exactly which
 * lots were refused and why.
 */
export function allocateFefo(
  lots: readonly InventoryLot[],
  sku: string,
  quantity: number,
  asOf: Date,
): AllocationResult {
  const candidates = lots.filter((l) => l.sku === sku);
  const evaluations = candidates.map((l) => ({ lot: l, evaluation: evaluateLot(l, asOf) }));

  const usable = evaluations
    .filter((e) => e.evaluation.allocatable)
    // Earliest expiry first. Every usable lot has a non-null expiry by construction,
    // because expiry_unknown is a blocking reason.
    .sort((a, b) => new Date(a.lot.expiryDate!).getTime() - new Date(b.lot.expiryDate!).getTime());

  const totalAllocatable = usable.reduce((sum, e) => sum + e.lot.quantityAvailable, 0);
  if (quantity <= 0 || totalAllocatable < quantity) {
    return {
      ok: false,
      reason: "insufficient_allocatable_stock",
      requested: quantity,
      allocatable: totalAllocatable,
      rejected: evaluations.filter((e) => !e.evaluation.allocatable).map((e) => e.evaluation),
    };
  }

  const lines: AllocationLine[] = [];
  let remaining = quantity;
  for (const entry of usable) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, entry.lot.quantityAvailable);
    lines.push({ lotId: entry.lot.lotId, quantity: take });
    remaining -= take;
  }
  return { ok: true, lines };
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

/**
 * A reservation moves through exactly three states. `held` is the only state in
 * which the stock decrement is provisional: `released` restores it, `finalized`
 * makes it permanent. There is no path back from either terminal state.
 */
export type ReservationStatus = "held" | "released" | "finalized";

export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "held",
  "released",
  "finalized",
] as const;

/**
 * A lot-level hold created at checkout, one per requested (sku, quantity) line.
 *
 * `lines` is the FEFO allocation the hold pinned: which lots, how much from
 * each, in allocation order. The hold decrements `quantityAvailable` at
 * reserve time (a hold that does not decrement is not a hold under
 * concurrency), so a release must restore exactly these lines and a
 * finalization must restore none of them.
 */
export interface LotReservation {
  reservationId: string;
  memberId: string;
  sku: string;
  quantity: number;
  lines: AllocationLine[];
  status: ReservationStatus;
  /** ISO timestamp after which a still-held reservation may be swept back. */
  expiresAt: string;
  createdAt: string;
  releasedAt: string | null;
  finalizedAt: string | null;
}

/**
 * Whether a reservation's hold has lapsed. Only a HELD reservation can expire:
 * released stock is already back, and finalized stock is already sold, so
 * neither is the sweeper's business.
 */
export function reservationIsExpired(
  reservation: Pick<LotReservation, "status" | "expiresAt">,
  asOf: Date,
): boolean {
  if (reservation.status !== "held") return false;
  return new Date(reservation.expiresAt).getTime() <= asOf.getTime();
}

// ---------------------------------------------------------------------------
// Recall traceability
// ---------------------------------------------------------------------------

export interface ShipmentRecord {
  orderId: string;
  lotId: string;
  memberId: string;
  shippedAt: string;
}

/**
 * Given a recalled lot, returns every order that received it.
 *
 * Traceability runs from the lot, not from the product, because a recall is
 * lot-scoped and recalling an entire SKU would be both wrong and alarming.
 */
export function tracedShipmentsForLot(
  shipments: readonly ShipmentRecord[],
  lotId: string,
): ShipmentRecord[] {
  return shipments.filter((s) => s.lotId === lotId);
}

// ---------------------------------------------------------------------------
// Split fulfillment
// ---------------------------------------------------------------------------

export interface OrderLine {
  sku: string;
  quantity: number;
  owner: FulfillmentOwner;
}

export interface FulfillmentGroup {
  owner: FulfillmentOwner;
  lines: OrderLine[];
}

/**
 * Splits one member order into per-owner fulfillment orders.
 *
 * Founder decision for roughly the first 60 days: Mitch owns peptides and Quantum,
 * xenios owns supplements and everything else. The member still sees ONE order with
 * separate shipments, so this grouping is an internal concern.
 */
export function splitByFulfillmentOwner(lines: readonly OrderLine[]): FulfillmentGroup[] {
  const byOwner = new Map<FulfillmentOwner, OrderLine[]>();
  for (const line of lines) {
    const existing = byOwner.get(line.owner);
    if (existing) existing.push(line);
    else byOwner.set(line.owner, [line]);
  }
  return Array.from(byOwner.entries()).map(([owner, ownerLines]) => ({ owner, lines: ownerLines }));
}
