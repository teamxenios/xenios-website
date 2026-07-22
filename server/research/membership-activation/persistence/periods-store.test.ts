import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createInMemoryPeriodsStore,
  createSupabasePeriodsStore,
  periodToRow,
  rowToPeriod,
  type MembershipPeriodRecord,
  type PeriodRow,
} from "./periods-store";

const NOW = "2026-07-22T00:00:00.000Z";
const END = "2026-08-21T00:00:00.000Z";

function period(overrides: Partial<MembershipPeriodRecord> = {}): MembershipPeriodRecord {
  return {
    periodId: "0f5b3a1c-0000-4000-8000-000000000101",
    memberId: "member-1",
    sequence: 1,
    startsAt: NOW,
    endsAt: END,
    fundingObligationId: "0f5b3a1c-0000-4000-8000-000000000201",
    createdAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("period row mapping", () => {
  it("round-trips a period through the mappers", () => {
    const rec = period();
    expect(rowToPeriod(periodToRow(rec))).toEqual(rec);
  });

  it("THROWS on a non-positive sequence: coverage is money, never guessed", () => {
    const row: PeriodRow = { ...periodToRow(period()), sequence: 0 };
    expect(() => rowToPeriod(row)).toThrowError(/invalid sequence/);
  });

  it("THROWS when a period ends before it starts", () => {
    const row: PeriodRow = { ...periodToRow(period()), ends_at: "2026-07-01T00:00:00.000Z" };
    expect(() => rowToPeriod(row)).toThrowError(/ends before it starts/);
  });
});

// ---------------------------------------------------------------------------
// In-memory reference (append-only)
// ---------------------------------------------------------------------------

describe("createInMemoryPeriodsStore", () => {
  it("appends and reads back, sorted by sequence", async () => {
    const store = createInMemoryPeriodsStore();
    await store.append(period({ periodId: "p2", sequence: 2, fundingObligationId: "o2" }));
    await store.append(period({ periodId: "p1", sequence: 1, fundingObligationId: "o1" }));
    const mine = await store.listByMember("member-1");
    expect(mine.map((p) => p.sequence)).toEqual([1, 2]);
    expect((await store.latestForMember("member-1"))?.periodId).toBe("p2");
    expect(await store.latestForMember("member-9")).toBeNull();
  });

  it("refuses a second period for the same funding obligation", async () => {
    const store = createInMemoryPeriodsStore();
    await store.append(period({ periodId: "p1", fundingObligationId: "o1" }));
    await expect(
      store.append(period({ periodId: "p2", sequence: 2, fundingObligationId: "o1" })),
    ).rejects.toThrowError(/cannot extend twice/);
  });

  it("finds the period an obligation funded", async () => {
    const store = createInMemoryPeriodsStore();
    await store.append(period({ periodId: "p1", fundingObligationId: "o1" }));
    expect((await store.findByFundingObligation("o1"))?.periodId).toBe("p1");
    expect(await store.findByFundingObligation("o9")).toBeNull();
  });

  it("does not let a caller mutate stored state through a held reference", async () => {
    const store = createInMemoryPeriodsStore();
    await store.append(period({ periodId: "p1" }));
    const loaded = await store.get("p1");
    loaded!.endsAt = "2099-01-01T00:00:00.000Z";
    expect((await store.get("p1"))!.endsAt).toBe(END);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/** Minimal fake of the supabase-js fluent client for the periods table. It
 * enforces the funding-obligation uniqueness the way Postgres would (error
 * code 23505) and records operations so append-only is provable. */
function fakeSupabase() {
  const rows = new Map<string, PeriodRow>();
  const ops: Array<{ op: string }> = [];

  function builder(_table: string) {
    const state: { op: string; filterCol?: string; filterVal?: unknown; payload?: unknown } = {
      op: "select",
    };
    const api: Record<string, unknown> = {};
    const result = (): { data: unknown; error: { code?: string; message: string } | null } => {
      ops.push({ op: state.op });
      if (state.op === "insert") {
        const row = state.payload as PeriodRow;
        const clash = Array.from(rows.values()).some(
          (existing) => existing.funding_obligation_id === row.funding_obligation_id,
        );
        if (clash) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        rows.set(row.id, { ...row });
        return { data: null, error: null };
      }
      if (state.filterCol === "id") {
        return { data: rows.get(String(state.filterVal)) ?? null, error: null };
      }
      if (state.filterCol === "member_id") {
        return {
          data: Array.from(rows.values()).filter((row) => row.member_id === state.filterVal),
          error: null,
        };
      }
      if (state.filterCol === "funding_obligation_id") {
        const hit = Array.from(rows.values()).find(
          (row) => row.funding_obligation_id === state.filterVal,
        );
        return { data: hit ?? null, error: null };
      }
      return { data: Array.from(rows.values()), error: null };
    };
    Object.assign(api, {
      select() { return api; },
      eq(col: string, val: unknown) { state.filterCol = col; state.filterVal = val; return api; },
      insert(payload: unknown) { state.op = "insert"; state.payload = payload; return api; },
      maybeSingle() { return Promise.resolve(result()); },
      then(onF: (v: unknown) => unknown) { return Promise.resolve(result()).then(onF); },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, rows, ops };
}

describe("createSupabasePeriodsStore (fake client)", () => {
  it("appends then loads a round trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePeriodsStore(client);
    const rec = period();
    await store.append(rec);
    expect(await store.get(rec.periodId)).toEqual(rec);
    expect((await store.findByFundingObligation(rec.fundingObligationId))?.periodId).toBe(rec.periodId);
  });

  it("maps the database uniqueness violation to the double-extend refusal", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePeriodsStore(client);
    await store.append(period({ periodId: "p1", fundingObligationId: "o1" }));
    await expect(
      store.append(period({ periodId: "p2", sequence: 2, fundingObligationId: "o1" })),
    ).rejects.toThrowError(/cannot extend twice/);
  });

  it("lists a member's periods sorted by sequence and scopes to the owner", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePeriodsStore(client);
    await store.append(period({ periodId: "p2", sequence: 2, fundingObligationId: "o2" }));
    await store.append(period({ periodId: "p1", sequence: 1, fundingObligationId: "o1" }));
    await store.append(
      period({ periodId: "p9", memberId: "member-2", sequence: 1, fundingObligationId: "o9" }),
    );
    const mine = await store.listByMember("member-1");
    expect(mine.map((p) => p.periodId)).toEqual(["p1", "p2"]);
    expect((await store.latestForMember("member-1"))?.periodId).toBe("p2");
  });

  it("only ever inserts and selects: there is no update or delete path at all", async () => {
    const { client, ops } = fakeSupabase();
    const store = createSupabasePeriodsStore(client);
    await store.append(period());
    await store.get(period().periodId);
    await store.listByMember("member-1");
    expect(ops.every((o) => o.op === "insert" || o.op === "select")).toBe(true);
  });

  it("throws loudly on a nonsensical persisted row", async () => {
    const { client, rows } = fakeSupabase();
    const store = createSupabasePeriodsStore(client);
    const rec = period();
    await store.append(rec);
    rows.set(rec.periodId, { ...rows.get(rec.periodId)!, sequence: -1 });
    await expect(store.get(rec.periodId)).rejects.toThrowError(/invalid sequence/);
  });
});
