import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InventoryLot, QualityDocuments } from "../../inventory/lots";
import {
  createInMemoryInventoryLotStore,
  createSupabaseInventoryLotStore,
  inventoryLotToRow,
  lotRowToInventoryLot,
  qualityDocumentsToRow,
  rowToQualityDocuments,
  type LotQualityDocumentRow,
  type LotRow,
} from "./inventory-store";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLEAN_DOCS: QualityDocuments = {
  coaOnFile: true,
  identityConfirmed: true,
  purityConfirmed: true,
  sterilityConfirmed: null,
  endotoxinConfirmed: null,
};

function lot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    lotId: "LOT-1",
    sku: "P001",
    owner: "xenios",
    disposition: "available",
    quantityAvailable: 10,
    manufacturedDate: "2026-01-01",
    expiryDate: "2027-01-01",
    retestDate: null,
    shelfLifeSource: "coa",
    documents: { ...CLEAN_DOCS },
    excursion: "none",
    recalled: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("rowToQualityDocuments", () => {
  it("maps a documents row field for field", () => {
    const row: LotQualityDocumentRow = {
      lot_id: "u1",
      coa_on_file: true,
      identity_confirmed: true,
      purity_confirmed: false,
      sterility_confirmed: false,
      endotoxin_confirmed: null,
    };
    expect(rowToQualityDocuments(row)).toEqual({
      coaOnFile: true,
      identityConfirmed: true,
      purityConfirmed: false,
      sterilityConfirmed: false,
      endotoxinConfirmed: null,
    });
  });

  it("treats a missing documents row as none on file, never as clean", () => {
    expect(rowToQualityDocuments(null)).toEqual({
      coaOnFile: false,
      identityConfirmed: false,
      purityConfirmed: false,
      sterilityConfirmed: null,
      endotoxinConfirmed: null,
    });
  });
});

describe("qualityDocumentsToRow", () => {
  it("maps QualityDocuments to a row keyed by the lot uuid, omitting document_ref", () => {
    expect(qualityDocumentsToRow("u1", CLEAN_DOCS)).toEqual({
      lot_id: "u1",
      coa_on_file: true,
      identity_confirmed: true,
      purity_confirmed: true,
      sterility_confirmed: null,
      endotoxin_confirmed: null,
    });
  });
});

describe("inventoryLotToRow", () => {
  it("maps camelCase fields to snake_case columns and leaves recalled_at null for a live lot", () => {
    expect(inventoryLotToRow(lot(), "2026-07-19T00:00:00.000Z")).toEqual({
      lot_id: "LOT-1",
      sku: "P001",
      owner: "xenios",
      disposition: "available",
      quantity_available: 10,
      manufactured_date: "2026-01-01",
      expiry_date: "2027-01-01",
      retest_date: null,
      shelf_life_source: "coa",
      excursion: "none",
      recalled: false,
      recalled_at: null,
    });
  });

  it("stamps recalled_at from the injected now for a recalled lot (DB constraint)", () => {
    const row = inventoryLotToRow(lot({ recalled: true, disposition: "recalled" }), "2026-07-19T12:00:00.000Z");
    expect(row.recalled).toBe(true);
    expect(row.recalled_at).toBe("2026-07-19T12:00:00.000Z");
  });

  it("preserves a null expiry rather than inventing one", () => {
    const row = inventoryLotToRow(lot({ expiryDate: null }), "2026-07-19T00:00:00.000Z");
    expect(row.expiry_date).toBeNull();
  });
});

describe("lotRowToInventoryLot", () => {
  it("round-trips through the row mappers", () => {
    const original = lot({ retestDate: "2026-12-01" });
    const row = { id: "u1", ...inventoryLotToRow(original, "2026-07-19T00:00:00.000Z") } as LotRow;
    const docRow = qualityDocumentsToRow("u1", original.documents);
    expect(lotRowToInventoryLot(row, docRow)).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

describe("createInMemoryInventoryLotStore", () => {
  it("returns null / empty before anything is saved", async () => {
    const store = createInMemoryInventoryLotStore();
    expect(await store.get("LOT-1")).toBeNull();
    expect(await store.listBySku("P001")).toEqual([]);
  });

  it("saves and gets a lot, and lists lots by sku", async () => {
    const store = createInMemoryInventoryLotStore();
    await store.save(lot({ lotId: "LOT-1", sku: "P001" }));
    await store.save(lot({ lotId: "LOT-2", sku: "P001", expiryDate: "2026-09-01" }));
    await store.save(lot({ lotId: "LOT-3", sku: "P002" }));
    expect(await store.get("LOT-1")).toEqual(lot({ lotId: "LOT-1", sku: "P001" }));
    const p001 = await store.listBySku("P001");
    expect(p001.map((l) => l.lotId).sort()).toEqual(["LOT-1", "LOT-2"]);
    expect((await store.listBySku("P002")).map((l) => l.lotId)).toEqual(["LOT-3"]);
  });

  it("does not let a caller mutate stored state through a returned reference", async () => {
    const store = createInMemoryInventoryLotStore();
    await store.save(lot({ lotId: "LOT-1" }));
    const loaded = await store.get("LOT-1");
    loaded!.quantityAvailable = 999;
    loaded!.documents.coaOnFile = false;
    const reread = await store.get("LOT-1");
    expect(reread!.quantityAvailable).toBe(10);
    expect(reread!.documents.coaOnFile).toBe(true);
  });

  it("reserves stock (negative delta) and releases it (positive delta)", async () => {
    const store = createInMemoryInventoryLotStore();
    await store.save(lot({ lotId: "LOT-1", quantityAvailable: 10 }));
    expect((await store.adjustQuantityAvailable("LOT-1", -3)).quantityAvailable).toBe(7);
    expect((await store.adjustQuantityAvailable("LOT-1", 2)).quantityAvailable).toBe(9);
    expect((await store.get("LOT-1"))!.quantityAvailable).toBe(9);
  });

  it("refuses an adjustment that would drive quantity below zero", async () => {
    const store = createInMemoryInventoryLotStore();
    await store.save(lot({ lotId: "LOT-1", quantityAvailable: 2 }));
    await expect(store.adjustQuantityAvailable("LOT-1", -5)).rejects.toThrow(/negative/);
    expect((await store.get("LOT-1"))!.quantityAvailable).toBe(2);
  });

  it("throws adjusting a lot that does not exist", async () => {
    const store = createInMemoryInventoryLotStore();
    await expect(store.adjustQuantityAvailable("MISSING", 1)).rejects.toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client covering exactly the calls the
 * inventory store makes. Lots are backed by a map keyed by lot_id (with a synthetic
 * uuid id) and documents by that uuid, so a save then get/list round-trips, proving
 * the store's query wiring, not just its mapping.
 */
function fakeSupabase(): {
  client: SupabaseClient;
  lots: Map<string, LotRow>;
  docs: Map<string, LotQualityDocumentRow>;
} {
  const lots = new Map<string, LotRow>(); // lot_id -> row (with id)
  const docs = new Map<string, LotQualityDocumentRow>(); // uuid lot_id -> row
  let idSeq = 0;

  function builder(table: string) {
    const state: {
      op: string;
      eqCol?: string;
      eqVal?: unknown;
      inVals?: unknown[];
      payload?: unknown;
    } = { op: "select" };

    const result = (): { data: unknown; error: null } => {
      if (table === "research_inventory_lots") {
        if (state.op === "upsert") {
          const row = state.payload as LotRow;
          const existing = lots.get(row.lot_id);
          const id = existing?.id ?? `lot_uuid_${++idSeq}`;
          lots.set(row.lot_id, { ...row, id });
          return { data: { id }, error: null };
        }
        if (state.op === "update") {
          const row = lots.get(String(state.eqVal));
          if (row) lots.set(row.lot_id, { ...row, ...(state.payload as Partial<LotRow>) });
          return { data: null, error: null };
        }
        // select
        if (state.eqCol === "sku") {
          return { data: [...lots.values()].filter((r) => r.sku === state.eqVal), error: null };
        }
        if (state.eqCol === "lot_id") {
          return { data: lots.get(String(state.eqVal)) ?? null, error: null };
        }
        return { data: null, error: null };
      }
      if (table === "research_lot_quality_documents") {
        if (state.op === "upsert") {
          const row = state.payload as LotQualityDocumentRow;
          docs.set(row.lot_id, row);
          return { data: null, error: null };
        }
        if (state.op === "select" && state.inVals) {
          return {
            data: state.inVals.map((u) => docs.get(String(u))).filter((r): r is LotQualityDocumentRow => !!r),
            error: null,
          };
        }
        return { data: [], error: null };
      }
      return { data: null, error: null };
    };

    const api: Record<string, unknown> = {};
    Object.assign(api, {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        state.eqCol = col;
        state.eqVal = val;
        return api;
      },
      in(col: string, vals: unknown[]) {
        state.eqCol = col;
        state.inVals = vals;
        return api;
      },
      upsert(payload: unknown) {
        state.op = "upsert";
        state.payload = payload;
        return api;
      },
      update(payload: unknown) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      maybeSingle() {
        return Promise.resolve(result());
      },
      single() {
        return Promise.resolve(result());
      },
      then(onF: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve(result()).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, lots, docs };
}

describe("createSupabaseInventoryLotStore (fake client)", () => {
  it("returns null for a lot that does not exist", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseInventoryLotStore(client);
    expect(await store.get("MISSING")).toBeNull();
  });

  it("saves then gets a lot with its documents round-trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseInventoryLotStore(client, () => "2026-07-19T00:00:00.000Z");
    const original = lot({ lotId: "LOT-1", retestDate: "2026-12-01" });
    await store.save(original);
    expect(await store.get("LOT-1")).toEqual(original);
  });

  it("reads a saved lot with no documents row as none on file, never clean", async () => {
    const { client, docs } = fakeSupabase();
    const store = createSupabaseInventoryLotStore(client, () => "2026-07-19T00:00:00.000Z");
    await store.save(lot({ lotId: "LOT-1" }));
    docs.clear(); // simulate a lot whose documents were never recorded
    const got = await store.get("LOT-1");
    expect(got!.documents).toEqual({
      coaOnFile: false,
      identityConfirmed: false,
      purityConfirmed: false,
      sterilityConfirmed: null,
      endotoxinConfirmed: null,
    });
  });

  it("lists lots by sku and joins each to its documents", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseInventoryLotStore(client, () => "2026-07-19T00:00:00.000Z");
    await store.save(lot({ lotId: "LOT-1", sku: "P001", expiryDate: "2027-01-01" }));
    await store.save(lot({ lotId: "LOT-2", sku: "P001", expiryDate: "2026-09-01" }));
    await store.save(lot({ lotId: "LOT-3", sku: "P002" }));
    const p001 = await store.listBySku("P001");
    expect(p001.map((l) => l.lotId).sort()).toEqual(["LOT-1", "LOT-2"]);
    expect(p001.every((l) => l.documents.coaOnFile)).toBe(true);
    expect((await store.listBySku("P002")).map((l) => l.lotId)).toEqual(["LOT-3"]);
    expect(await store.listBySku("NONE")).toEqual([]);
  });

  it("upserts (replaces) an existing lot rather than duplicating it", async () => {
    const { client, lots } = fakeSupabase();
    const store = createSupabaseInventoryLotStore(client, () => "2026-07-19T00:00:00.000Z");
    await store.save(lot({ lotId: "LOT-1", quantityAvailable: 10 }));
    await store.save(lot({ lotId: "LOT-1", quantityAvailable: 4 }));
    expect(lots.size).toBe(1);
    expect((await store.get("LOT-1"))!.quantityAvailable).toBe(4);
  });

  it("reserves and releases quantity via adjust, returning the updated lot", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseInventoryLotStore(client, () => "2026-07-19T00:00:00.000Z");
    await store.save(lot({ lotId: "LOT-1", quantityAvailable: 10 }));
    expect((await store.adjustQuantityAvailable("LOT-1", -3)).quantityAvailable).toBe(7);
    expect((await store.adjustQuantityAvailable("LOT-1", 5)).quantityAvailable).toBe(12);
    expect((await store.get("LOT-1"))!.quantityAvailable).toBe(12);
  });

  it("refuses an adjustment below zero and leaves stored quantity untouched", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseInventoryLotStore(client, () => "2026-07-19T00:00:00.000Z");
    await store.save(lot({ lotId: "LOT-1", quantityAvailable: 2 }));
    await expect(store.adjustQuantityAvailable("LOT-1", -5)).rejects.toThrow(/negative/);
    expect((await store.get("LOT-1"))!.quantityAvailable).toBe(2);
  });

  it("throws adjusting a lot that does not exist", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseInventoryLotStore(client);
    await expect(store.adjustQuantityAvailable("MISSING", 1)).rejects.toThrow(/not found/);
  });
});
