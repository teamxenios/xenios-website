import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LotReservation } from "../../inventory/lots";
import {
  allocationLinesToRows,
  createInMemoryReservationStore,
  createSupabaseReservationStore,
  reservationToRow,
  rowToReservation,
  type ReservationAllocationRow,
  type ReservationRow,
} from "./reservations-store";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function reservation(overrides: Partial<LotReservation> = {}): LotReservation {
  return {
    reservationId: "res_1",
    memberId: "mem_1",
    sku: "P001",
    quantity: 5,
    lines: [
      { lotId: "LOT-EARLY", quantity: 3 },
      { lotId: "LOT-LATE", quantity: 2 },
    ],
    status: "held",
    expiresAt: "2026-07-20T00:30:00.000Z",
    createdAt: "2026-07-20T00:00:00.000Z",
    releasedAt: null,
    finalizedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("reservationToRow / rowToReservation", () => {
  it("round-trips a reservation through the row mappers", () => {
    const original = reservation();
    const row = { id: "u1", ...reservationToRow(original) } as ReservationRow;
    const lineRows = allocationLinesToRows("u1", original.lines);
    expect(rowToReservation(row, lineRows)).toEqual(original);
  });

  it("numbers allocation rows by seq so the FEFO order survives storage", () => {
    const rows = allocationLinesToRows("u1", reservation().lines);
    expect(rows).toEqual([
      { reservation_id: "u1", seq: 0, lot_id: "LOT-EARLY", quantity: 3 },
      { reservation_id: "u1", seq: 1, lot_id: "LOT-LATE", quantity: 2 },
    ]);
  });

  it("reorders shuffled line rows by seq on the way back", () => {
    const original = reservation();
    const row = { id: "u1", ...reservationToRow(original) } as ReservationRow;
    const shuffled = [...allocationLinesToRows("u1", original.lines)].reverse();
    expect(rowToReservation(row, shuffled)!.lines).toEqual(original.lines);
  });

  it("drops a row whose status the domain does not define (fails closed)", () => {
    const row = { id: "u1", ...reservationToRow(reservation()), status: "vibes" } as ReservationRow;
    expect(rowToReservation(row, [])).toBeNull();
  });

  it("preserves terminal-state timestamps field for field", () => {
    const released = reservation({
      status: "released",
      releasedAt: "2026-07-20T00:10:00.000Z",
    });
    const row = { id: "u1", ...reservationToRow(released) } as ReservationRow;
    expect(rowToReservation(row, allocationLinesToRows("u1", released.lines))).toEqual(released);
  });
});

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

describe("createInMemoryReservationStore", () => {
  it("returns null / empty before anything is saved", async () => {
    const store = createInMemoryReservationStore();
    expect(await store.get("res_1")).toBeNull();
    expect(await store.listByMember("mem_1")).toEqual([]);
  });

  it("saves, gets, and lists by member", async () => {
    const store = createInMemoryReservationStore();
    await store.save(reservation({ reservationId: "res_1", memberId: "mem_1" }));
    await store.save(reservation({ reservationId: "res_2", memberId: "mem_1", sku: "P002" }));
    await store.save(reservation({ reservationId: "res_3", memberId: "mem_2" }));
    expect(await store.get("res_1")).toEqual(reservation({ reservationId: "res_1" }));
    expect((await store.listByMember("mem_1")).map((r) => r.reservationId).sort()).toEqual([
      "res_1",
      "res_2",
    ]);
    expect((await store.listByMember("mem_2")).map((r) => r.reservationId)).toEqual(["res_3"]);
  });

  it("upserts by reservation id, replacing status and lines together", async () => {
    const store = createInMemoryReservationStore();
    await store.save(reservation());
    await store.save(
      reservation({ status: "released", releasedAt: "2026-07-20T00:10:00.000Z" }),
    );
    const got = await store.get("res_1");
    expect(got!.status).toBe("released");
    expect((await store.listByMember("mem_1")).length).toBe(1);
  });

  it("does not let a caller mutate stored state through a returned reference", async () => {
    const store = createInMemoryReservationStore();
    await store.save(reservation());
    const loaded = await store.get("res_1");
    loaded!.status = "finalized";
    loaded!.lines[0]!.quantity = 999;
    const reread = await store.get("res_1");
    expect(reread!.status).toBe("held");
    expect(reread!.lines[0]!.quantity).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client covering exactly the calls
 * the reservations store makes. Headers are keyed by reservation_id (with a
 * synthetic uuid id) and allocation rows by that uuid, so a save then get/list
 * round-trips, proving the store's query wiring, not just its mapping.
 */
function fakeSupabase(): {
  client: SupabaseClient;
  headers: Map<string, ReservationRow>;
  allocations: Map<string, ReservationAllocationRow[]>;
} {
  const headers = new Map<string, ReservationRow>(); // reservation_id -> row (with id)
  const allocations = new Map<string, ReservationAllocationRow[]>(); // uuid -> rows
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
      if (table === "research_lot_reservations") {
        if (state.op === "upsert") {
          const row = state.payload as ReservationRow;
          const existing = headers.get(row.reservation_id);
          const id = existing?.id ?? `res_uuid_${++idSeq}`;
          headers.set(row.reservation_id, { ...row, id });
          return { data: { id }, error: null };
        }
        if (state.eqCol === "reservation_id") {
          return { data: headers.get(String(state.eqVal)) ?? null, error: null };
        }
        if (state.eqCol === "member_id") {
          return {
            data: [...headers.values()].filter((r) => r.member_id === state.eqVal),
            error: null,
          };
        }
        return { data: null, error: null };
      }
      if (table === "research_lot_reservation_allocations") {
        if (state.op === "insert") {
          for (const row of state.payload as ReservationAllocationRow[]) {
            const existing = allocations.get(row.reservation_id) ?? [];
            existing.push(row);
            allocations.set(row.reservation_id, existing);
          }
          return { data: null, error: null };
        }
        if (state.op === "delete") {
          allocations.delete(String(state.eqVal));
          return { data: null, error: null };
        }
        if (state.inVals) {
          return {
            data: state.inVals.flatMap((u) => allocations.get(String(u)) ?? []),
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
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      delete() {
        state.op = "delete";
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
  return { client, headers, allocations };
}

describe("createSupabaseReservationStore (fake client)", () => {
  it("returns null for a reservation that does not exist", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseReservationStore(client);
    expect(await store.get("MISSING")).toBeNull();
  });

  it("saves then gets a reservation with its lines round-trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseReservationStore(client);
    const original = reservation();
    await store.save(original);
    expect(await store.get("res_1")).toEqual(original);
  });

  it("replaces the allocation lines together on a re-save (no interleaving)", async () => {
    const { client, allocations } = fakeSupabase();
    const store = createSupabaseReservationStore(client);
    await store.save(reservation());
    await store.save(
      reservation({
        status: "released",
        releasedAt: "2026-07-20T00:10:00.000Z",
        lines: [{ lotId: "LOT-EARLY", quantity: 3 }],
      }),
    );
    const got = await store.get("res_1");
    expect(got!.status).toBe("released");
    expect(got!.lines).toEqual([{ lotId: "LOT-EARLY", quantity: 3 }]);
    // Exactly one generation of line rows exists.
    expect([...allocations.values()].flat()).toHaveLength(1);
  });

  it("lists a member's reservations and joins each to its lines", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseReservationStore(client);
    await store.save(reservation({ reservationId: "res_1", memberId: "mem_1" }));
    await store.save(reservation({ reservationId: "res_2", memberId: "mem_1", sku: "P002" }));
    await store.save(reservation({ reservationId: "res_3", memberId: "mem_2" }));
    const mine = await store.listByMember("mem_1");
    expect(mine.map((r) => r.reservationId).sort()).toEqual(["res_1", "res_2"]);
    expect(mine.every((r) => r.lines.length > 0)).toBe(true);
    expect(await store.listByMember("nobody")).toEqual([]);
  });

  it("drops an unknown-status row from listByMember so it can never be settled blind", async () => {
    const { client, headers } = fakeSupabase();
    const store = createSupabaseReservationStore(client);
    await store.save(reservation({ reservationId: "res_1" }));
    await store.save(reservation({ reservationId: "res_2" }));
    headers.set("res_2", { ...headers.get("res_2")!, status: "limbo" });
    expect((await store.listByMember("mem_1")).map((r) => r.reservationId)).toEqual(["res_1"]);
    expect(await store.get("res_2")).toBeNull();
  });
});
