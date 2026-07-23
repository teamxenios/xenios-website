// Track B, commerce activation: persistent lot reservation storage.
//
// The reservation DOMAIN shape (LotReservation) lives in
// server/research/inventory/lots.ts next to the FEFO allocator that produces
// its lines. The SEAM that creates and settles reservations lives in
// server/research/commerce/checkout.ts. This store's only job is to persist
// reservation records and their lot-level allocation lines FAITHFULLY, exactly
// as inventory-store.ts persists lots.
//
// Schema note: migration 21 (supabase/production/research-track-b-commerce.sql)
// defines research_lot_allocations as the append-only ORDER allocation history
// (lot uuid + order uuid + released_at). A reservation is created at checkout
// BEFORE an order row exists and carries member, status, and an expiry, none of
// which that table can store, so reservations get their own pair of tables in
// supabase/research-track-b-fidelity.sql: research_lot_reservations (the
// header) and research_lot_reservation_allocations (the lot-level lines, keyed
// by the business lot_id, which migration 21 declares unique). This store
// aligns exactly with that DDL.
//
// A NOTE ON MUTABILITY: a reservation's status is current state (held ->
// released | finalized) and legitimately mutable; its allocation lines are
// fixed at reserve time and replaced-together on save so the domain array
// order survives, the same pattern research_order_shipments uses.
//
// Nothing here enables commerce. The store is additive; the seam that consumes
// it stays behind the commerce flag.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllocationLine, LotReservation, ReservationStatus } from "../../inventory/lots";
import { RESERVATION_STATUSES } from "../../inventory/lots";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// The async repository port. Save upserts by the business reservation id;
// reads return the full record with its allocation lines in order.
// ---------------------------------------------------------------------------

export interface ReservationRepository {
  get(reservationId: string): Promise<LotReservation | null>;
  save(reservation: LotReservation): Promise<void>;
  /** Every reservation a member holds, for sweepers and operator views. */
  listByMember(memberId: string): Promise<LotReservation[]>;
}

// ---------------------------------------------------------------------------
// Row mapping (pure, fully tested). All row-shape knowledge lives here.
// ---------------------------------------------------------------------------

/** A research_lot_reservations row, only the columns this store reads/writes. */
export interface ReservationRow {
  id?: string; // uuid primary key, present on read, referenced by line rows
  reservation_id: string;
  member_id: string;
  sku: string;
  quantity: number;
  status: string;
  expires_at: string;
  created_at: string;
  released_at: string | null;
  finalized_at: string | null;
}

/** A research_lot_reservation_allocations row. reservation_id is the uuid FK. */
export interface ReservationAllocationRow {
  reservation_id: string;
  seq: number;
  lot_id: string;
  quantity: number;
}

export function reservationToRow(reservation: LotReservation): ReservationRow {
  return {
    reservation_id: reservation.reservationId,
    member_id: reservation.memberId,
    sku: reservation.sku,
    quantity: reservation.quantity,
    status: reservation.status,
    expires_at: reservation.expiresAt,
    created_at: reservation.createdAt,
    released_at: reservation.releasedAt,
    finalized_at: reservation.finalizedAt,
  };
}

export function allocationLinesToRows(
  reservationUuid: string,
  lines: readonly AllocationLine[],
): ReservationAllocationRow[] {
  return lines.map((line, seq) => ({
    reservation_id: reservationUuid,
    seq,
    lot_id: line.lotId,
    quantity: line.quantity,
  }));
}

/**
 * Map a reservation row plus its allocation rows back to the domain shape, or
 * null when the status column carries a value the domain does not define. A
 * dropped reservation cannot be released or finalized through this store, which
 * fails closed: an uninterpretable hold is surfaced by its absence, never
 * half-acted on. Lines are ordered by seq so the FEFO allocation order the
 * service recorded is the order read back.
 */
export function rowToReservation(
  row: ReservationRow,
  lineRows: readonly ReservationAllocationRow[],
): LotReservation | null {
  if (!(RESERVATION_STATUSES as readonly string[]).includes(row.status)) return null;
  const lines = [...lineRows]
    .sort((a, b) => a.seq - b.seq)
    .map((line) => ({ lotId: line.lot_id, quantity: line.quantity }));
  return {
    reservationId: row.reservation_id,
    memberId: row.member_id,
    sku: row.sku,
    quantity: row.quantity,
    status: row.status as ReservationStatus,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    releasedAt: row.released_at,
    finalizedAt: row.finalized_at,
    lines,
  };
}

// ---------------------------------------------------------------------------
// In-memory store: the deterministic double for tests and the fallback when
// Supabase is not configured. Clones both ways so a caller cannot mutate
// stored state by holding a reference.
// ---------------------------------------------------------------------------

function cloneReservation(reservation: LotReservation): LotReservation {
  return { ...reservation, lines: reservation.lines.map((line) => ({ ...line })) };
}

export function createInMemoryReservationStore(): ReservationRepository {
  const reservations = new Map<string, LotReservation>(); // reservation_id -> record

  return {
    async get(reservationId) {
      const found = reservations.get(reservationId);
      return found ? cloneReservation(found) : null;
    },

    async save(reservation) {
      reservations.set(reservation.reservationId, cloneReservation(reservation));
    },

    async listByMember(memberId) {
      return Array.from(reservations.values())
        .filter((r) => r.memberId === memberId)
        .map(cloneReservation);
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store. Service-role client (server-only; RLS is a backstop).
// A save upserts the header row by the business reservation_id, then replaces
// the allocation lines together against the header's uuid (delete + insert,
// the research_order_shipments pattern), so two generations of lines can never
// interleave. Tests exercise this against an injected fake client.
// ---------------------------------------------------------------------------

const RESERVATIONS = "research_lot_reservations";
const ALLOCATIONS = "research_lot_reservation_allocations";

const RESERVATION_COLUMNS =
  "id, reservation_id, member_id, sku, quantity, status, expires_at, created_at, released_at, finalized_at";

export function createSupabaseReservationStore(
  client: SupabaseClient = getSupabaseAdmin(),
): ReservationRepository {
  async function allocationsByReservationUuids(
    uuids: readonly string[],
  ): Promise<Map<string, ReservationAllocationRow[]>> {
    const byUuid = new Map<string, ReservationAllocationRow[]>();
    if (uuids.length === 0) return byUuid;
    const res = await client
      .from(ALLOCATIONS)
      .select("reservation_id, seq, lot_id, quantity")
      .in("reservation_id", uuids as string[]);
    if (res.error) throw new Error(`reservation allocations load failed: ${res.error.message}`);
    for (const row of (res.data ?? []) as ReservationAllocationRow[]) {
      const existing = byUuid.get(row.reservation_id);
      if (existing) existing.push(row);
      else byUuid.set(row.reservation_id, [row]);
    }
    return byUuid;
  }

  return {
    async get(reservationId) {
      const res = await client
        .from(RESERVATIONS)
        .select(RESERVATION_COLUMNS)
        .eq("reservation_id", reservationId)
        .maybeSingle();
      if (res.error) throw new Error(`reservation load failed: ${res.error.message}`);
      if (!res.data) return null;
      const row = res.data as ReservationRow;
      const lines = row.id ? await allocationsByReservationUuids([row.id]) : new Map();
      return rowToReservation(row, row.id ? lines.get(row.id) ?? [] : []);
    },

    async save(reservation) {
      const upserted = await client
        .from(RESERVATIONS)
        .upsert(reservationToRow(reservation), { onConflict: "reservation_id" })
        .select("id")
        .single();
      if (upserted.error) throw new Error(`reservation upsert failed: ${upserted.error.message}`);
      const uuid = (upserted.data as { id: string }).id;

      // Replace-together: the lines are one generation, never a merge of two.
      const del = await client.from(ALLOCATIONS).delete().eq("reservation_id", uuid);
      if (del.error) throw new Error(`reservation allocations delete failed: ${del.error.message}`);
      const lineRows = allocationLinesToRows(uuid, reservation.lines);
      if (lineRows.length > 0) {
        const ins = await client.from(ALLOCATIONS).insert(lineRows);
        if (ins.error) throw new Error(`reservation allocations insert failed: ${ins.error.message}`);
      }
    },

    async listByMember(memberId) {
      const res = await client
        .from(RESERVATIONS)
        .select(RESERVATION_COLUMNS)
        .eq("member_id", memberId);
      if (res.error) throw new Error(`reservations load failed: ${res.error.message}`);
      const rows = (res.data ?? []) as ReservationRow[];
      const uuids = rows.map((r) => r.id).filter((id): id is string => typeof id === "string");
      const lines = await allocationsByReservationUuids(uuids);
      const out: LotReservation[] = [];
      for (const row of rows) {
        const mapped = rowToReservation(row, row.id ? lines.get(row.id) ?? [] : []);
        // A row the guard refuses is dropped: it cannot be settled from here.
        if (mapped) out.push(mapped);
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution: the real store when Supabase is configured, else in-memory.
// ---------------------------------------------------------------------------

export function resolveReservationStore(): ReservationRepository {
  return supabaseConfigured()
    ? createSupabaseReservationStore()
    : createInMemoryReservationStore();
}
