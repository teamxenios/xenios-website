import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimOrderView, ClaimRecord } from "../refunds";
import {
  claimRecordToRow,
  claimRowToRecord,
  createInMemoryClaimOrderRepository,
  createInMemoryClaimRepository,
  createSupabaseClaimOrderRepository,
  createSupabaseClaimRepository,
  orderRowToView,
  orderViewToUpdateRow,
  type ClaimOrderLineRow,
  type ClaimOrderRow,
  type ClaimRow,
} from "./claims-store";

// ---------------------------------------------------------------------------
// A claim record fixture, complete so mapping round-trips are exact.
// ---------------------------------------------------------------------------

function aClaim(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
  return {
    claimId: "clm_1",
    orderId: "ord_1",
    memberId: "mem_1",
    sku: "P001",
    lotId: "LOT-9",
    reason: "damaged",
    state: "submitted",
    resolution: null,
    evidenceRefs: ["ref-a", "ref-b"],
    submittedAt: "2026-07-20T00:00:00.000Z",
    reviewedBy: null,
    notes: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

function aClaimRow(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: "clm_1",
    order_id: "ord_1",
    member_id: "mem_1",
    sku: "P001",
    lot_id: "LOT-9",
    reason: "damaged",
    state: "submitted",
    resolution: null,
    evidence_refs: ["ref-a", "ref-b"],
    reviewed_by: null,
    submitted_at: "2026-07-20T00:00:00.000Z",
    notes: "",
    ...overrides,
  };
}

describe("claimRowToRecord", () => {
  it("maps a submitted claim row", () => {
    expect(claimRowToRecord(aClaimRow())).toEqual(aClaim());
  });

  it("defaults a null lot, null evidence, null resolution, and null notes safely", () => {
    const row = aClaimRow({
      id: "clm_2",
      order_id: "ord_2",
      member_id: "mem_2",
      sku: "P002",
      lot_id: null,
      reason: "lost",
      state: "resolved",
      resolution: "refund",
      evidence_refs: null,
      reviewed_by: "admin_7",
      submitted_at: "2026-07-19T00:00:00.000Z",
      notes: null, // a row predating the fidelity migration
    });
    expect(claimRowToRecord(row)).toEqual({
      claimId: "clm_2",
      orderId: "ord_2",
      memberId: "mem_2",
      sku: "P002",
      lotId: null,
      reason: "lost",
      state: "resolved",
      resolution: "refund",
      evidenceRefs: [],
      submittedAt: "2026-07-19T00:00:00.000Z",
      reviewedBy: "admin_7",
      notes: "",
    });
  });

  it("drops a row with an unknown reason, state, or resolution rather than guessing", () => {
    expect(claimRowToRecord(aClaimRow({ reason: "buyer_remorse" }))).toBeNull();
    expect(claimRowToRecord(aClaimRow({ state: "escalated_to_legal" }))).toBeNull();
    expect(claimRowToRecord(aClaimRow({ resolution: "store_credit" }))).toBeNull();
  });
});

describe("claimRecordToRow", () => {
  it("projects the persistable columns including notes (fidelity migration column)", () => {
    const record = aClaim({ notes: "operator only detail", resolution: "replacement", state: "approved", reviewedBy: "admin_3" });
    expect(claimRecordToRow(record)).toEqual({
      id: "clm_1",
      order_id: "ord_1",
      member_id: "mem_1",
      sku: "P001",
      lot_id: "LOT-9",
      reason: "damaged",
      state: "approved",
      resolution: "replacement",
      evidence_refs: ["ref-a", "ref-b"],
      reviewed_by: "admin_3",
      submitted_at: "2026-07-20T00:00:00.000Z",
      notes: "operator only detail",
    });
  });

  it("round-trips a record through row and back exactly, notes included", () => {
    const record = aClaim({ notes: "lost in transit" });
    expect(claimRowToRecord(claimRecordToRow(record))).toEqual(record);
  });
});

describe("orderRowToView", () => {
  it("maps money, treats a null capture as zero, and nulls every line lot", () => {
    const row: ClaimOrderRow = {
      id: "ord_1",
      member_id: "mem_1",
      state: "delivered",
      captured_amount_cents: 5000,
      payment_reference: "pi_abc",
      refunded_cents: 0,
      last_idempotency_key: null,
    };
    const lines: ClaimOrderLineRow[] = [{ sku: "P001" }, { sku: "P002" }];
    expect(orderRowToView(row, lines)).toEqual({
      orderId: "ord_1",
      memberId: "mem_1",
      state: "delivered",
      capturedAmountCents: 5000,
      paymentReference: "pi_abc",
      refundedCents: 0,
      lines: [
        { sku: "P001", lotId: null },
        { sku: "P002", lotId: null },
      ],
      lastAppliedIdempotencyKey: undefined,
    });
  });

  it("carries a null capture as zero and a present idempotency key through", () => {
    const row: ClaimOrderRow = {
      id: "ord_2",
      member_id: "mem_2",
      state: "payment_captured",
      captured_amount_cents: null,
      payment_reference: null,
      refunded_cents: 0,
      last_idempotency_key: "key-1",
    };
    const view = orderRowToView(row, []);
    expect(view.capturedAmountCents).toBe(0);
    expect(view.paymentReference).toBeNull();
    expect(view.lastAppliedIdempotencyKey).toBe("key-1");
    expect(view.lines).toEqual([]);
  });
});

describe("orderViewToUpdateRow", () => {
  it("projects only the refund-touched columns", () => {
    const view: ClaimOrderView = {
      orderId: "ord_1",
      memberId: "mem_1",
      state: "refunded",
      capturedAmountCents: 5000,
      paymentReference: "pi_abc",
      refundedCents: 5000,
      lines: [{ sku: "P001", lotId: null }],
      lastAppliedIdempotencyKey: "key-9",
    };
    expect(orderViewToUpdateRow(view)).toEqual({
      state: "refunded",
      refunded_cents: 5000,
      last_idempotency_key: "key-9",
    });
  });

  it("nulls a missing idempotency key", () => {
    const view: ClaimOrderView = {
      orderId: "ord_1",
      memberId: "mem_1",
      state: "delivered",
      capturedAmountCents: 5000,
      paymentReference: "pi_abc",
      refundedCents: 0,
      lines: [],
    };
    expect(orderViewToUpdateRow(view).last_idempotency_key).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A fake supabase-js fluent client, backing exactly the four tables and the
// exact calls these two repositories make. No network. Rows are plain maps so a
// save then load round-trips, proving query wiring, not just mapping.
// ---------------------------------------------------------------------------

interface FakeDb {
  claims: Map<string, ClaimRow & { updated_at?: string }>;
  refundKeys: Map<string, { scope: string; refund_reference: string }>;
  orders: Map<string, ClaimOrderRow & { updated_at?: string }>;
  orderLines: Map<string, ClaimOrderLineRow[]>; // order_id -> lines
}

function fakeSupabase(seed: Partial<FakeDb> = {}): { client: SupabaseClient; db: FakeDb } {
  const db: FakeDb = {
    claims: seed.claims ?? new Map(),
    refundKeys: seed.refundKeys ?? new Map(),
    orders: seed.orders ?? new Map(),
    orderLines: seed.orderLines ?? new Map(),
  };

  function builder(table: string) {
    const state: {
      op: "select" | "insert" | "upsert" | "update";
      eqs: Array<{ col: string; val: unknown }>;
      notIn?: { col: string; values: string[] };
      payload?: unknown;
    } = { op: "select", eqs: [] };

    const api: Record<string, unknown> = {};

    const rows = (): unknown[] => {
      if (table === CLAIMS) return Array.from(db.claims.values());
      if (table === REFUND_KEYS) return Array.from(db.refundKeys.values());
      if (table === ORDERS) return Array.from(db.orders.values());
      if (table === ORDER_LINES) {
        const orderId = String(state.eqs.find((e) => e.col === "order_id")?.val ?? "");
        return db.orderLines.get(orderId) ?? [];
      }
      return [];
    };

    const matches = (row: Record<string, unknown>): boolean => {
      for (const e of state.eqs) {
        // The order-lines bucket is already scoped by rows(); its rows do not
        // carry order_id, so an eq on an absent column is not re-applied.
        if (!(e.col in row)) continue;
        if (row[e.col] !== e.val) return false;
      }
      if (state.notIn && state.notIn.values.includes(String(row[state.notIn.col]))) return false;
      return true;
    };

    const runWrite = (): { error: { code?: string; message?: string } | null } => {
      if (state.op === "insert" && table === REFUND_KEYS) {
        const p = state.payload as { scope: string; refund_reference: string };
        if (db.refundKeys.has(p.scope)) return { error: { code: "23505", message: "duplicate key" } };
        db.refundKeys.set(p.scope, { scope: p.scope, refund_reference: p.refund_reference });
        return { error: null };
      }
      if (state.op === "upsert" && table === CLAIMS) {
        const p = state.payload as ClaimRow & { updated_at?: string };
        db.claims.set(p.id, { ...p });
        return { error: null };
      }
      if (state.op === "update" && table === ORDERS) {
        const id = String(state.eqs.find((e) => e.col === "id")?.val ?? "");
        const existing = db.orders.get(id);
        if (existing) db.orders.set(id, { ...existing, ...(state.payload as object) });
        return { error: null };
      }
      return { error: null };
    };

    const readList = (): { data: unknown[]; error: null } => ({
      data: rows().filter((r) => matches(r as Record<string, unknown>)),
      error: null,
    });

    const readOne = (): { data: unknown; error: null } => {
      const found = rows().filter((r) => matches(r as Record<string, unknown>));
      return { data: found.length > 0 ? found[0] : null, error: null };
    };

    Object.assign(api, {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        state.eqs.push({ col, val });
        return api;
      },
      not(col: string, op: string, val: string) {
        if (op === "in") {
          const values = val.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim());
          state.notIn = { col, values };
        }
        return api;
      },
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
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
        return Promise.resolve(readOne());
      },
      single() {
        return Promise.resolve(readOne());
      },
      then(onF: (v: unknown) => unknown) {
        // A terminal await. A write op settles its mutation; a read returns a list.
        const value = state.op === "select" ? readList() : runWrite();
        return Promise.resolve(value).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, db };
}

const CLAIMS = "research_claims";
const REFUND_KEYS = "research_refund_keys";
const ORDERS = "research_orders";
const ORDER_LINES = "research_order_lines";

// ---------------------------------------------------------------------------
// Supabase-backed ClaimRepository against the fake client
// ---------------------------------------------------------------------------

describe("createSupabaseClaimRepository (fake client)", () => {
  it("returns null for an unknown claim", async () => {
    const { client } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    expect(await repo.get("nope")).toBeNull();
  });

  it("saves then loads a claim round-trip EXACTLY, matching the in-memory reference", async () => {
    const { client } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    const record = aClaim({ notes: "member detail", lotId: "LOT-9", reviewedBy: "admin_2" });
    await repo.save(record);

    const reference = createInMemoryClaimRepository();
    await reference.save(record);

    // The fidelity migration adds the notes column, so the Supabase round trip
    // now matches the in-memory reference field for field, notes included.
    expect(await repo.get("clm_1")).toEqual(record);
    expect(await repo.get("clm_1")).toEqual(await reference.get("clm_1"));
  });

  it("get drops a stored row that carries an unknown enum value (drop, never guess)", async () => {
    const { client, db } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    await repo.save(aClaim());
    db.claims.set("clm_1", { ...db.claims.get("clm_1")!, state: "escalated_to_legal" });
    expect(await repo.get("clm_1")).toBeNull();
  });

  it("lists drop an unknown-enum row while keeping the valid rows", async () => {
    const { client, db } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    await repo.save(aClaim({ claimId: "clm_ok" }));
    await repo.save(aClaim({ claimId: "clm_bad" }));
    db.claims.set("clm_bad", { ...db.claims.get("clm_bad")!, reason: "buyer_remorse" });
    expect((await repo.listByMember("mem_1")).map((c) => c.claimId)).toEqual(["clm_ok"]);
    expect((await repo.listByOrder("ord_1")).map((c) => c.claimId)).toEqual(["clm_ok"]);
    expect((await repo.listOpen()).map((c) => c.claimId)).toEqual(["clm_ok"]);
  });

  it("save updates an existing claim in place rather than duplicating", async () => {
    const { client, db } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    await repo.save(aClaim());
    await repo.save(aClaim({ state: "approved", reviewedBy: "admin_1" }));
    expect(db.claims.size).toBe(1);
    expect((await repo.get("clm_1"))!.state).toBe("approved");
  });

  it("lists a member's claims and never crosses to another member", async () => {
    const { client } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    await repo.save(aClaim({ claimId: "clm_1", memberId: "mem_1" }));
    await repo.save(aClaim({ claimId: "clm_2", memberId: "mem_2", orderId: "ord_2" }));
    const forMember1 = await repo.listByMember("mem_1");
    expect(forMember1.map((c) => c.claimId)).toEqual(["clm_1"]);
  });

  it("lists claims by order", async () => {
    const { client } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    await repo.save(aClaim({ claimId: "clm_1", orderId: "ord_1" }));
    await repo.save(aClaim({ claimId: "clm_2", orderId: "ord_2" }));
    expect((await repo.listByOrder("ord_1")).map((c) => c.claimId)).toEqual(["clm_1"]);
  });

  it("listOpen excludes resolved and declined claims", async () => {
    const { client } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    await repo.save(aClaim({ claimId: "clm_open", state: "under_review" }));
    await repo.save(aClaim({ claimId: "clm_done", state: "resolved" }));
    await repo.save(aClaim({ claimId: "clm_no", state: "declined" }));
    expect((await repo.listOpen()).map((c) => c.claimId)).toEqual(["clm_open"]);
  });
});

// ---------------------------------------------------------------------------
// Refund keys: the append-only, no-double-refund ledger
// ---------------------------------------------------------------------------

describe("refund keys (append-only)", () => {
  it("reports a key absent then present after it is recorded", async () => {
    const { client } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    expect(await repo.hasRefundKey("clm_1:key")).toBe(false);
    await repo.recordRefundKey("clm_1:key", "re_123");
    expect(await repo.hasRefundKey("clm_1:key")).toBe(true);
  });

  it("absorbs a duplicate record as a no-op (the DB unique constraint, not an app check)", async () => {
    const { client, db } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    await repo.recordRefundKey("clm_1:key", "re_123");
    // A concurrent second record of the same scope must not throw and must not
    // overwrite the first reference.
    await expect(repo.recordRefundKey("clm_1:key", "re_999")).resolves.toBeUndefined();
    expect(db.refundKeys.get("clm_1:key")!.refund_reference).toBe("re_123");
  });

  it("exposes no update or delete path on the ledger", () => {
    const { client } = fakeSupabase();
    const repo = createSupabaseClaimRepository(client);
    expect((repo as unknown as Record<string, unknown>).deleteRefundKey).toBeUndefined();
    expect((repo as unknown as Record<string, unknown>).updateRefundKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed ClaimOrderRepository against the fake client
// ---------------------------------------------------------------------------

function seedOrder(over: Partial<ClaimOrderRow> = {}): ClaimOrderRow {
  return {
    id: "ord_1",
    member_id: "mem_1",
    state: "delivered",
    captured_amount_cents: 5000,
    payment_reference: "pi_abc",
    refunded_cents: 0,
    last_idempotency_key: null,
    ...over,
  };
}

describe("createSupabaseClaimOrderRepository (fake client)", () => {
  it("returns null for an unknown order", async () => {
    const { client } = fakeSupabase();
    const repo = createSupabaseClaimOrderRepository(client);
    expect(await repo.get("nope")).toBeNull();
  });

  it("reads an order with its lines into a view", async () => {
    const orders = new Map([["ord_1", seedOrder()]]);
    const orderLines = new Map([["ord_1", [{ sku: "P001" }, { sku: "P002" }]]]);
    const { client } = fakeSupabase({ orders, orderLines });
    const repo = createSupabaseClaimOrderRepository(client);
    const view = await repo.get("ord_1");
    expect(view).toEqual({
      orderId: "ord_1",
      memberId: "mem_1",
      state: "delivered",
      capturedAmountCents: 5000,
      paymentReference: "pi_abc",
      refundedCents: 0,
      lines: [
        { sku: "P001", lotId: null },
        { sku: "P002", lotId: null },
      ],
      lastAppliedIdempotencyKey: undefined,
    });
  });

  it("save writes back only the refund-touched columns and leaves the capture untouched", async () => {
    const orders = new Map([["ord_1", seedOrder()]]);
    const { client, db } = fakeSupabase({ orders });
    const repo = createSupabaseClaimOrderRepository(client);
    const view = await repo.get("ord_1");
    view!.state = "refunded";
    view!.refundedCents = 5000;
    view!.lastAppliedIdempotencyKey = "key-9";
    await repo.save(view!);
    const row = db.orders.get("ord_1")!;
    expect(row.state).toBe("refunded");
    expect(row.refunded_cents).toBe(5000);
    expect(row.last_idempotency_key).toBe("key-9");
    // The capture and provider reference are not this path's to change.
    expect(row.captured_amount_cents).toBe(5000);
    expect(row.payment_reference).toBe("pi_abc");
  });
});

// ---------------------------------------------------------------------------
// Resolvers fall back to the in-memory reference when Supabase is unconfigured.
// (SUPABASE_URL / SERVICE_ROLE_KEY are absent in the test environment.)
// ---------------------------------------------------------------------------

describe("in-memory references (re-exported)", () => {
  it("createInMemoryClaimRepository saves and loads a claim", async () => {
    const repo = createInMemoryClaimRepository();
    await repo.save(aClaim({ notes: "kept in memory" }));
    expect((await repo.get("clm_1"))!.notes).toBe("kept in memory");
  });

  it("createInMemoryClaimOrderRepository saves and loads an order view", async () => {
    const repo = createInMemoryClaimOrderRepository();
    const view: ClaimOrderView = {
      orderId: "ord_1",
      memberId: "mem_1",
      state: "delivered",
      capturedAmountCents: 5000,
      paymentReference: "pi_abc",
      refundedCents: 0,
      lines: [],
    };
    await repo.save(view);
    expect(await repo.get("ord_1")).toEqual(view);
  });
});
