// Track B, commerce activation: persistent inventory lot storage.
//
// The inventory MODULE (server/research/inventory/lots.ts) is pure logic: FEFO
// allocation, per-lot evaluation, and recall traceability over readonly
// InventoryLot values. It holds no state and reaches no database. That module
// carries THE RULE: a lot must EARN the right to ship, and unknown data is never
// acceptable data. This persistence layer does not touch that rule. The store's
// only job is to persist lot rows and their reservations FAITHFULLY, so the
// allocatable gate in lots.ts always evaluates the true stored state.
//
// lots.ts exposes no repository seam (it takes lots as arguments), so this file
// declares the async InventoryLotRepository consistent with the InventoryLot type
// it exports. When the load-operate-save bridge is wired in a later wave, it will
// read lots through this port, run the pure allocateFefo/evaluateLot against them,
// and persist the reservation result back.
//
// Nothing here enables commerce. The store is additive and stays behind the
// commerce flag until a later wave wires it in.
//
// A NOTE ON TENANCY: inventory lots are global stock keyed by sku, not member
// property, so there is no member/partner tenant scope to isolate here. `owner`
// on a lot is a fulfillment owner (mitch or xenios), an attribute persisted
// faithfully, never an access-control boundary. Reads are by sku or lot id.
//
// A NOTE ON MUTABILITY: quantity_available is current-state inventory, legitimately
// mutable (like a cart's lines), NOT an append-only ledger. A reservation lowers it
// and a release raises it. The append-only allocation/shipment history lives in
// separate tables (research_lot_allocations, research_lot_shipments) and belongs to
// the service layer, out of scope for this store.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExcursionState,
  FulfillmentOwner,
  InventoryLot,
  LotDisposition,
  QualityDocuments,
} from "../../inventory/lots";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// The async repository port. lots.ts has no store seam of its own, so this is
// the source of truth for the persistence shape. It is consistent with the
// InventoryLot type: list the lots for a sku (FEFO reads these), get one lot,
// save a lot with its quality documents, and adjust a lot's available quantity
// when stock is reserved (negative delta) or released (positive delta).
// ---------------------------------------------------------------------------

export interface InventoryLotRepository {
  /** Every lot for a sku. FEFO allocation evaluates and orders these. */
  listBySku(sku: string): Promise<InventoryLot[]>;
  /** One lot by its business lot id, or null if there is no such lot. */
  get(lotId: string): Promise<InventoryLot | null>;
  /** Upsert a lot row and its quality documents, keyed by the business lot id. */
  save(lot: InventoryLot): Promise<void>;
  /**
   * Reserve (negative delta) or release (positive delta) available quantity for a
   * lot, returning the updated lot. Refuses to drive quantity below zero so a
   * reservation can never persist more stock committed than exists.
   */
  adjustQuantityAvailable(lotId: string, delta: number): Promise<InventoryLot>;
}

// ---------------------------------------------------------------------------
// Row mapping (pure, fully tested). All row-shape knowledge lives here, so the
// Supabase implementation is a thin set of calls around these functions.
// ---------------------------------------------------------------------------

/** A research_inventory_lots row, only the columns this store reads or writes. */
export interface LotRow {
  id?: string; // uuid primary key, present on read, referenced by document rows
  lot_id: string;
  sku: string;
  owner: string;
  disposition: string;
  quantity_available: number;
  manufactured_date: string | null;
  expiry_date: string | null;
  retest_date: string | null;
  shelf_life_source: string;
  excursion: string;
  recalled: boolean;
  recalled_at: string | null;
}

/** A research_lot_quality_documents row. lot_id here is the lots.id uuid FK. */
export interface LotQualityDocumentRow {
  lot_id: string;
  coa_on_file: boolean;
  identity_confirmed: boolean;
  purity_confirmed: boolean;
  sterility_confirmed: boolean | null;
  endotoxin_confirmed: boolean | null;
}

/**
 * Map a documents row to QualityDocuments. A missing row is NOT treated as a clean
 * lot: absent documents means the lot has none on file, so every required flag reads
 * false and the applicability tri-states read null. That keeps the canon rule intact,
 * an undocumented lot is not allocatable, never mistaken for a documented one.
 */
export function rowToQualityDocuments(row: LotQualityDocumentRow | null): QualityDocuments {
  if (row === null) {
    return {
      coaOnFile: false,
      identityConfirmed: false,
      purityConfirmed: false,
      sterilityConfirmed: null,
      endotoxinConfirmed: null,
    };
  }
  return {
    coaOnFile: row.coa_on_file,
    identityConfirmed: row.identity_confirmed,
    purityConfirmed: row.purity_confirmed,
    sterilityConfirmed: row.sterility_confirmed,
    endotoxinConfirmed: row.endotoxin_confirmed,
  };
}

/**
 * Map QualityDocuments to an insertable documents row for a lot's uuid. document_ref
 * is deliberately omitted: the domain model does not carry it, so the store never
 * writes over an operator-recorded reference with a guessed value.
 */
export function qualityDocumentsToRow(
  lotUuid: string,
  docs: QualityDocuments,
): LotQualityDocumentRow {
  return {
    lot_id: lotUuid,
    coa_on_file: docs.coaOnFile,
    identity_confirmed: docs.identityConfirmed,
    purity_confirmed: docs.purityConfirmed,
    sterility_confirmed: docs.sterilityConfirmed,
    endotoxin_confirmed: docs.endotoxinConfirmed,
  };
}

/** Map a lot row plus its documents row to a full InventoryLot. */
export function lotRowToInventoryLot(
  row: LotRow,
  docRow: LotQualityDocumentRow | null,
): InventoryLot {
  return {
    lotId: row.lot_id,
    sku: row.sku,
    owner: row.owner as FulfillmentOwner,
    disposition: row.disposition as LotDisposition,
    quantityAvailable: row.quantity_available,
    manufacturedDate: row.manufactured_date,
    expiryDate: row.expiry_date,
    retestDate: row.retest_date,
    shelfLifeSource: row.shelf_life_source as InventoryLot["shelfLifeSource"],
    documents: rowToQualityDocuments(docRow),
    excursion: row.excursion as ExcursionState,
    recalled: row.recalled,
  };
}

/**
 * Map an InventoryLot to an upsertable lot row keyed by lot_id. `now` is injected so
 * the mapper stays pure and deterministic. recalled_at is set to `now` for a recalled
 * lot and null otherwise, satisfying the DB constraint that a recalled lot carries a
 * date. The uuid id is left to the database.
 */
export function inventoryLotToRow(lot: InventoryLot, now: string): LotRow {
  return {
    lot_id: lot.lotId,
    sku: lot.sku,
    owner: lot.owner,
    disposition: lot.disposition,
    quantity_available: lot.quantityAvailable,
    manufactured_date: lot.manufacturedDate,
    expiry_date: lot.expiryDate,
    retest_date: lot.retestDate,
    shelf_life_source: lot.shelfLifeSource,
    excursion: lot.excursion,
    recalled: lot.recalled,
    recalled_at: lot.recalled ? now : null,
  };
}

// ---------------------------------------------------------------------------
// In-memory store: the deterministic double for tests and the fallback when
// Supabase is not configured. Clones on the way in and out so a caller cannot
// mutate stored state by holding a reference.
// ---------------------------------------------------------------------------

function cloneLot(lot: InventoryLot): InventoryLot {
  return { ...lot, documents: { ...lot.documents } };
}

export function createInMemoryInventoryLotStore(): InventoryLotRepository {
  const lots = new Map<string, InventoryLot>(); // lot_id -> lot

  return {
    async listBySku(sku) {
      return Array.from(lots.values())
        .filter((lot) => lot.sku === sku)
        .map(cloneLot);
    },

    async get(lotId) {
      const lot = lots.get(lotId);
      return lot ? cloneLot(lot) : null;
    },

    async save(lot) {
      lots.set(lot.lotId, cloneLot(lot));
    },

    async adjustQuantityAvailable(lotId, delta) {
      const lot = lots.get(lotId);
      if (!lot) throw new Error(`lot not found: ${lotId}`);
      const next = lot.quantityAvailable + delta;
      if (next < 0) {
        throw new Error(`quantity adjustment for ${lotId} would go negative: ${next}`);
      }
      const updated = cloneLot(lot);
      updated.quantityAvailable = next;
      lots.set(lotId, updated);
      return cloneLot(updated);
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store. Uses the service-role client (server-only; RLS is a
// backstop, the server is the sole writer). A save upserts the lot row by its
// business lot_id, then upserts the one quality-documents row against the lot's
// uuid. Reads join lots to their documents in a second query keyed by uuid.
// Tests exercise this against an injected fake client; the real client is the
// default.
// ---------------------------------------------------------------------------

const LOTS = "research_inventory_lots";
const DOCS = "research_lot_quality_documents";

export function createSupabaseInventoryLotStore(
  client: SupabaseClient = getSupabaseAdmin(),
  now: () => string = () => new Date().toISOString(),
): InventoryLotRepository {
  async function documentsByLotUuids(
    uuids: readonly string[],
  ): Promise<Map<string, LotQualityDocumentRow>> {
    const byUuid = new Map<string, LotQualityDocumentRow>();
    if (uuids.length === 0) return byUuid;
    const res = await client
      .from(DOCS)
      .select(
        "lot_id, coa_on_file, identity_confirmed, purity_confirmed, sterility_confirmed, endotoxin_confirmed",
      )
      .in("lot_id", uuids as string[]);
    if (res.error) throw new Error(`lot documents load failed: ${res.error.message}`);
    for (const row of (res.data ?? []) as LotQualityDocumentRow[]) {
      byUuid.set(row.lot_id, row);
    }
    return byUuid;
  }

  const LOT_COLUMNS =
    "id, lot_id, sku, owner, disposition, quantity_available, manufactured_date, expiry_date, retest_date, shelf_life_source, excursion, recalled, recalled_at";

  return {
    async listBySku(sku) {
      const res = await client.from(LOTS).select(LOT_COLUMNS).eq("sku", sku);
      if (res.error) throw new Error(`lots load failed: ${res.error.message}`);
      const rows = (res.data ?? []) as LotRow[];
      const uuids = rows.map((r) => r.id).filter((id): id is string => typeof id === "string");
      const docs = await documentsByLotUuids(uuids);
      return rows.map((row) =>
        lotRowToInventoryLot(row, row.id ? docs.get(row.id) ?? null : null),
      );
    },

    async get(lotId) {
      const res = await client.from(LOTS).select(LOT_COLUMNS).eq("lot_id", lotId).maybeSingle();
      if (res.error) throw new Error(`lot load failed: ${res.error.message}`);
      if (!res.data) return null;
      const row = res.data as LotRow;
      const docs = row.id ? await documentsByLotUuids([row.id]) : new Map();
      return lotRowToInventoryLot(row, row.id ? docs.get(row.id) ?? null : null);
    },

    async save(lot) {
      const lotRow = inventoryLotToRow(lot, now());
      const upserted = await client
        .from(LOTS)
        .upsert(lotRow, { onConflict: "lot_id" })
        .select("id")
        .single();
      if (upserted.error) throw new Error(`lot upsert failed: ${upserted.error.message}`);
      const lotUuid = (upserted.data as { id: string }).id;
      const docRow = qualityDocumentsToRow(lotUuid, lot.documents);
      const docRes = await client.from(DOCS).upsert(docRow, { onConflict: "lot_id" });
      if (docRes.error) throw new Error(`lot documents upsert failed: ${docRes.error.message}`);
    },

    async adjustQuantityAvailable(lotId, delta) {
      const current = await client
        .from(LOTS)
        .select("quantity_available")
        .eq("lot_id", lotId)
        .maybeSingle();
      if (current.error) throw new Error(`lot quantity load failed: ${current.error.message}`);
      if (!current.data) throw new Error(`lot not found: ${lotId}`);
      const next = (current.data as { quantity_available: number }).quantity_available + delta;
      if (next < 0) {
        throw new Error(`quantity adjustment for ${lotId} would go negative: ${next}`);
      }
      const updated = await client
        .from(LOTS)
        .update({ quantity_available: next })
        .eq("lot_id", lotId);
      if (updated.error) throw new Error(`lot quantity update failed: ${updated.error.message}`);
      const reread = await this.get(lotId);
      if (reread === null) throw new Error(`lot vanished during adjustment: ${lotId}`);
      return reread;
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution: the real store when Supabase is configured, else the in-memory
// fallback. The bridge that consumes this stays behind the commerce flag, so an
// unconfigured deployment keeps failing closed rather than silently persisting.
// ---------------------------------------------------------------------------

export function resolveInventoryLotStore(): InventoryLotRepository {
  return supabaseConfigured()
    ? createSupabaseInventoryLotStore()
    : createInMemoryInventoryLotStore();
}
