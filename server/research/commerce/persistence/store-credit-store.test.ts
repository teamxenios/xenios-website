import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createInMemoryStoreCreditLedgerStore,
  createSupabaseStoreCreditLedgerStore,
  grossOrderValueForReviewCents,
  pendingCentsOf,
  spendableCentsOf,
  storeCreditDtoOf,
  storeCreditRecordToRow,
  storeCreditRowToRecord,
  storeCreditViewFor,
  StoreCreditEntryNotFound,
  StoreCreditEntrySettled,
  StoreCreditInvalidTransition,
  type StoreCreditLedgerRecord,
  type StoreCreditLedgerRepository,
  type StoreCreditRow,
} from "./store-credit-store";

const T0 = "2026-07-01T00:00:00.000Z";
const NOW = new Date("2026-07-22T00:00:00.000Z");

let seq = 0;
function record(overrides: Partial<StoreCreditLedgerRecord> = {}): StoreCreditLedgerRecord {
  return {
    id: `sc_${++seq}`,
    memberId: "mem_a",
    amountCents: 1000,
    state: "approved",
    reason: "referral_referrer",
    createdAt: T0,
    availableAt: null,
    reversesId: null,
    actorType: "system",
    actorId: null,
    expiresAt: null,
    ...overrides,
  };
}

function action(id: string, at: Date = NOW) {
  return { id, actorType: "admin" as const, actorId: "samuel", at };
}

// ---------------------------------------------------------------------------
// The append-only shape itself
// ---------------------------------------------------------------------------

describe("append-only surface", () => {
  it("exposes no update, delete, or balance-mutating method on the repository", () => {
    const store = createInMemoryStoreCreditLedgerStore();
    const methods = Object.keys(store);
    expect(methods.sort()).toEqual(
      ["append", "approve", "balanceSnapshot", "getEntry", "listForMember", "pendingCents", "reverse", "spend", "spendableCents"].sort(),
    );
    for (const name of methods) {
      expect(name).not.toMatch(/update|delete|remove|set|clear/i);
    }
  });

  it("keeps every historical row after approval and reversal (nothing edited, nothing gone)", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    const pending = record({ id: "sc_p", state: "pending" });
    await store.append(pending);
    await store.approve("mem_a", "sc_p", action("sc_ap"));
    await store.reverse("mem_a", "sc_ap", action("sc_rev"));

    const rows = await store.listForMember("mem_a");
    expect(rows.map((r) => r.id)).toEqual(["sc_p", "sc_ap", "sc_rev"]);
    // The original pending row is byte-for-byte untouched.
    expect(rows.find((r) => r.id === "sc_p")).toEqual(pending);
  });

  it("refuses a zero or unsafe amount and an unknown state or reason", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await expect(store.append(record({ amountCents: 0 }))).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.append(record({ amountCents: 10.5 }))).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.append(record({ state: "spent" as never }))).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.append(record({ reason: "bonus" as never }))).rejects.toThrow(StoreCreditInvalidTransition);
  });
});

// ---------------------------------------------------------------------------
// Pending versus spendable
// ---------------------------------------------------------------------------

describe("pending is never spendable", () => {
  it("counts only approved rows toward spendable", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "a", state: "pending", amountCents: 1000 }));
    await store.append(record({ id: "b", state: "held", amountCents: 1500 }));
    await store.append(record({ id: "c", state: "fraud_flagged", amountCents: 2000 }));
    await store.append(record({ id: "d", state: "approved", amountCents: 700 }));

    expect(await store.spendableCents("mem_a", NOW)).toBe(700);
    expect(await store.pendingCents("mem_a")).toBe(2500); // pending + held; never fraud_flagged
  });

  it("moves a credit from pending to spendable only through an approval row", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "p", state: "pending", amountCents: 1000 }));
    expect(await store.spendableCents("mem_a", NOW)).toBe(0);

    const promoted = await store.approve("mem_a", "p", action("ap"));
    expect(promoted.state).toBe("approved");
    expect(promoted.reversesId).toBe("p");
    expect(await store.spendableCents("mem_a", NOW)).toBe(1000);
    // The promoted original no longer counts as pending.
    expect(await store.pendingCents("mem_a")).toBe(0);
  });

  it("refuses to promote a fraud_flagged credit (no API marks fraud review satisfied)", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "f", state: "fraud_flagged" }));
    await expect(store.approve("mem_a", "f", action("x"))).rejects.toThrow(StoreCreditInvalidTransition);
  });
});

// ---------------------------------------------------------------------------
// Reversal as a new row
// ---------------------------------------------------------------------------

describe("reversal writes a new negative row", () => {
  it("offsets an approved credit with a new approved negative row, netting spendable to zero", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "a", state: "approved", amountCents: 1000 }));
    const offset = await store.reverse("mem_a", "a", action("r"));

    expect(offset).toMatchObject({
      id: "r",
      amountCents: -1000,
      state: "approved",
      reversesId: "a",
      actorType: "admin",
      actorId: "samuel",
    });
    expect(await store.spendableCents("mem_a", NOW)).toBe(0);
    expect((await store.listForMember("mem_a")).length).toBe(2); // both rows remain
  });

  it("closes a pending credit with a reversed-state row that never touches spendable", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "p", state: "pending", amountCents: 500 }));
    const offset = await store.reverse("mem_a", "p", action("r"));

    expect(offset.state).toBe("reversed");
    expect(offset.amountCents).toBe(-500);
    expect(await store.spendableCents("mem_a", NOW)).toBe(0);
    expect(await store.pendingCents("mem_a")).toBe(0);
  });

  it("settles a chain exactly once: a second reversal or a reverse-after-approve throws", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "a", state: "approved" }));
    await store.reverse("mem_a", "a", action("r1"));
    await expect(store.reverse("mem_a", "a", action("r2"))).rejects.toThrow(StoreCreditEntrySettled);

    await store.append(record({ id: "p", state: "pending" }));
    await store.approve("mem_a", "p", action("ap"));
    await expect(store.approve("mem_a", "p", action("ap2"))).rejects.toThrow(StoreCreditEntrySettled);
    await expect(store.reverse("mem_a", "p", action("r3"))).rejects.toThrow(StoreCreditEntrySettled);
  });

  it("refuses to reverse a reversal; a correction is a new credit instead", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "a", state: "approved" }));
    await store.reverse("mem_a", "a", action("r"));
    await expect(store.reverse("mem_a", "r", action("rr"))).rejects.toThrow(StoreCreditInvalidTransition);
  });
});

// ---------------------------------------------------------------------------
// Spending draws the balance down
// ---------------------------------------------------------------------------

describe("spend decrements the spendable balance", () => {
  it("replays the exact same order debit without a second row or a second balance charge", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ amountCents: 1000 }));
    const first = await store.spend("mem_a", 1000, "ord_repeat", NOW);
    const replay = await store.spend("mem_a", 1000, "ord_repeat", new Date("2026-07-23T00:00:00.000Z"));
    expect(replay).toEqual(first);
    expect(await store.listForMember("mem_a")).toHaveLength(2);
    await expect(store.spend("mem_a", 999, "ord_repeat", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    expect(await store.listForMember("mem_a")).toHaveLength(2);
  });

  it("does not replay another member's order row or an ambiguous/noncanonical local debit", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ amountCents: 1000 }));
    await store.append(record({ memberId: "mem_b", amountCents: -100, actorId: "ord_repeat", reason: "manual_adjustment" }));
    await expect(store.spend("mem_a", 100, "ord_repeat", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    expect(await store.spendableCents("mem_a", NOW)).toBe(1000);
    await store.append(record({ amountCents: 100, actorId: "ord_bad" }));
    await expect(store.spend("mem_a", 100, "ord_bad", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    await store.append(record({ amountCents: -100, actorId: "ord_duplicate", reason: "manual_adjustment" }));
    await store.append(record({ amountCents: -100, actorId: "ord_duplicate", reason: "manual_adjustment" }));
    await expect(store.spend("mem_a", 100, "ord_duplicate", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
  });

  it("appends a negative approved row naming the consuming order, so credit is not reusable", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "a", state: "approved", amountCents: 2500 }));

    const spent = await store.spend("mem_a", 2500, "ord_1", NOW);
    expect(spent).toMatchObject({
      amountCents: -2500,
      state: "approved",
      reversesId: null,
      actorType: "system",
      actorId: "ord_1",
    });
    expect(await store.spendableCents("mem_a", NOW)).toBe(0);
    // The next order sees nothing left to apply. The credit was consumed once.
    await expect(store.spend("mem_a", 2500, "ord_2", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
  });

  it("refuses an overdraw, a non-positive amount, and a spend without an order reference", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "a", state: "approved", amountCents: 1000 }));
    await expect(store.spend("mem_a", 1001, "ord_1", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.spend("mem_a", 0, "ord_1", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.spend("mem_a", -5, "ord_1", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.spend("mem_a", 100, "", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    expect(await store.spendableCents("mem_a", NOW)).toBe(1000); // nothing was written
  });

  it("counts only approved credit toward what may be spent", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "p", state: "pending", amountCents: 5000 }));
    await expect(store.spend("mem_a", 100, "ord_1", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe("tenant isolation", () => {
  it("scopes every read to the member argument", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "a", memberId: "mem_a", amountCents: 1000 }));
    await store.append(record({ id: "b", memberId: "mem_b", amountCents: 9999 }));

    expect((await store.listForMember("mem_a")).map((r) => r.id)).toEqual(["a"]);
    expect(await store.spendableCents("mem_a", NOW)).toBe(1000);
    expect(await store.getEntry("mem_a", "b")).toBeNull(); // another member's row is invisible
  });

  it("refuses to approve or reverse another member's entry", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    await store.append(record({ id: "b", memberId: "mem_b", state: "pending" }));
    await expect(store.approve("mem_a", "b", action("x"))).rejects.toThrow(StoreCreditEntryNotFound);
    await expect(store.reverse("mem_a", "b", action("y"))).rejects.toThrow(StoreCreditEntryNotFound);
    // And the row is still untouched for its real owner.
    expect((await store.listForMember("mem_b")).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Expiry, fixed at issue time
// ---------------------------------------------------------------------------

describe("expiry", () => {
  it("excludes an expired approved credit from spendable, and its offset expires with it", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    const expiry = "2026-07-10T00:00:00.000Z";
    await store.append(record({ id: "e", state: "approved", amountCents: 1000, expiresAt: expiry }));

    expect(await store.spendableCents("mem_a", new Date("2026-07-05T00:00:00.000Z"))).toBe(1000);
    expect(await store.spendableCents("mem_a", NOW)).toBe(0); // past expiry

    // A reversal offset copies the expiry so the pair can never go negative.
    const offset = await store.reverse("mem_a", "e", action("r"));
    expect(offset.expiresAt).toBe(expiry);
    expect(await store.spendableCents("mem_a", NOW)).toBe(0);
  });

  it("offers no method to set or extend an expiry after issue", () => {
    const store = createInMemoryStoreCreditLedgerStore();
    expect(Object.keys(store).filter((k) => /expir/i.test(k))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Review can never be bought
// ---------------------------------------------------------------------------

describe("gross order value for review", () => {
  it("evaluates subtotal plus shipping and cannot even receive a credit amount", () => {
    expect(grossOrderValueForReviewCents(48000, 2500)).toBe(50500);
    // The signature is the guarantee: two parameters, no credit.
    expect(grossOrderValueForReviewCents.length).toBe(2);
  });

  it("exposes no API that marks a payment or fraud review satisfied", () => {
    const store = createInMemoryStoreCreditLedgerStore();
    for (const name of Object.keys(store)) {
      expect(name).not.toMatch(/review|fraud|satisf|waive/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Pure helpers and the DTO
// ---------------------------------------------------------------------------

describe("storeCreditDtoOf", () => {
  it.each([null, undefined, "1000", Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "refuses an uninterpretable ledger amount in raw projections and local arithmetic: %s", async amount => {
      const { client, rows } = fakeSupabase();
      rows.push({ ...storeCreditRecordToRow(record()), amount_cents: amount } as StoreCreditRow);
      const store = createSupabaseStoreCreditLedgerStore(client);
      await expect(store.listForMember("mem_a")).rejects.toThrow(StoreCreditInvalidTransition);
      await expect(store.getEntry("mem_a", rows[0].id)).rejects.toThrow(StoreCreditInvalidTransition);
      expect(() => storeCreditDtoOf([record({ amountCents: amount as number })], NOW)).toThrow(StoreCreditInvalidTransition);
      expect(rows).toHaveLength(1);
    },
  );

  it.each(["approved", "pending", "held"] as const)("refuses an overflowing %s aggregate", state => {
    const records = [record({ state, amountCents: Number.MAX_SAFE_INTEGER }), record({ state, amountCents: 1 })];
    expect(() => storeCreditDtoOf(records, NOW)).toThrow(StoreCreditInvalidTransition);
  });

  it("does not make an expired credit usable when the evaluation clock is invalid", () => {
    const records = [record({ expiresAt: "2026-07-01T00:00:00.000Z" })];
    expect(() => spendableCentsOf(records, new Date("invalid"))).toThrow(StoreCreditInvalidTransition);
  });

  it.each([
    { state: "unknown" }, { reason: "unknown" }, { actor_type: "unknown" },
    { reverses_id: undefined }, { actor_id: undefined }, { available_at: undefined }, { created_at: "invalid" },
  ])("refuses an incomplete or unknown durable projection %j", override => {
    const row = { ...storeCreditRecordToRow(record()), ...override } as StoreCreditRow;
    expect(() => storeCreditRowToRecord(row)).toThrow(StoreCreditInvalidTransition);
  });

  it("builds the member DTO with clamped spendable, pending, and allowlisted entry fields", () => {
    const records = [
      record({ id: "a", state: "approved", amountCents: 700 }),
      record({ id: "b", state: "pending", amountCents: 300, availableAt: "2026-08-01T00:00:00.000Z" }),
    ];
    expect(storeCreditDtoOf(records, NOW)).toEqual({
      spendableCents: 700,
      pendingCents: 300,
      entries: [
        { amountCents: 700, state: "approved", reason: "referral_referrer", availableAt: null },
        { amountCents: 300, state: "pending", reason: "referral_referrer", availableAt: "2026-08-01T00:00:00.000Z" },
      ],
    });
  });

  it("round-trips a record through the canonical Track B row mapping", () => {
    const original = record({
      id: "rt",
      state: "held",
      amountCents: 1500,
      availableAt: "2026-08-01T00:00:00.000Z",
      reversesId: "prior",
      actorType: "admin",
      actorId: "samuel",
    });
    const row = storeCreditRecordToRow(original);
    expect(row).toMatchObject({ member_id: "mem_a", amount_cents: 1500, reverses_id: "prior" });
    expect(row.expires_at).toBeNull();
    expect(storeCreditRowToRecord(row)).toEqual(original);
  });

  it("keeps helper math consistent between pendingCentsOf and spendableCentsOf", () => {
    const records = [
      record({ id: "p", state: "pending", amountCents: 400 }),
      record({ id: "ap", state: "approved", amountCents: 400, reversesId: "p" }),
    ];
    expect(pendingCentsOf(records)).toBe(0); // promoted, so no longer pending
    expect(spendableCentsOf(records, NOW)).toBe(400); // counted exactly once
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client covering exactly the calls
 * the store-credit store makes: insert, and select with eq filters, order, and
 * maybeSingle, plus the two RPCs. The RPC simulation below is deliberately
 * local-only: it proves adapter vocabulary/results, not PostgreSQL serialization.
 * Rows live in a plain array so behavior round-trips.
 */
function fakeSupabase() {
  const rows: StoreCreditRow[] = [];

  function builder(table: string) {
    const filters: Array<{ col: string; val: unknown }> = [];
    let op: "select" | "insert" = "select";
    let payload: unknown = null;
    const api: Record<string, unknown> = {};
    const matches = () =>
      rows.filter((r) => filters.every((f) => (r as unknown as Record<string, unknown>)[f.col] === f.val));
    const result = (): { data: unknown; error: { message: string; code?: string } | null } => {
      if (table !== "research_store_credit_ledger") {
        return { data: null, error: { message: `relation ${table} does not exist` } };
      }
      if (op === "insert") {
        const row = { ...(payload as StoreCreditRow) };
        // Models the fidelity migration's partial unique index on reverses_id:
        // a second settlement row for the same entry is a unique violation.
        if (row.reverses_id !== null && rows.some((r) => r.reverses_id === row.reverses_id)) {
          return { data: null, error: { message: "duplicate key", code: "23505" } };
        }
        rows.push(row);
        return { data: null, error: null };
      }
      return { data: matches(), error: null };
    };
    Object.assign(api, {
      select() { return api; },
      eq(col: string, val: unknown) { filters.push({ col, val }); return api; },
      order() { return api; },
      insert(p: unknown) { op = "insert"; payload = p; return api; },
      maybeSingle() {
        const r = result();
        const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return Promise.resolve({ data, error: r.error });
      },
      then(onF: (v: { data: unknown; error: { message: string } | null }) => unknown) {
        return Promise.resolve(result()).then(onF);
      },
    });
    return api;
  }

  const rpc = vi.fn(async (name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> => {
    try {
      const scoped = rows.filter(row => row.member_id === args.p_member_id).map(storeCreditRowToRecord);
      if (name === "research_store_credit_balance") {
        return { data: [{ spendable_cents: spendableCentsOf(scoped, new Date(args.p_as_of as string)),
          pending_cents: pendingCentsOf(scoped), reserved_cents: 0 }], error: null };
      }
      if (name === "research_store_credit_spend") {
        const memory = createInMemoryStoreCreditLedgerStore();
        for (const row of scoped) await memory.append(row);
        const debit = await memory.spend(args.p_member_id as string, args.p_amount_cents as number,
          args.p_order_id as string, new Date(args.p_at as string));
        const row = storeCreditRecordToRow(debit);
        if (!rows.some(existing => existing.id === row.id)) rows.push(row);
        return { data: [{ ...row, spend_order_id: args.p_order_id }], error: null };
      }
      return { data: null, error: { message: "unknown RPC" } };
    } catch {
      return { data: null, error: { message: "synthetic RPC refusal" } };
    }
  });
  const from = vi.fn((table: string) => builder(table));
  const client = { from, rpc } as unknown as SupabaseClient;
  return { client, rows, rpc, from };
}

describe("createSupabaseStoreCreditLedgerStore (fake client)", () => {
  it("does not interpret a payload-less history read as an empty history", async () => {
    const query = { select() { return this; }, eq() { return this; }, order() { return Promise.resolve({ data: null, error: null }); } };
    const store = createSupabaseStoreCreditLedgerStore({ from: () => query } as unknown as SupabaseClient);
    await expect(store.listForMember("mem_a")).rejects.toThrow(StoreCreditInvalidTransition);
  });

  it("refuses a wrong-member row even if the persistence transport ignored the member filter", async () => {
    const row = storeCreditRecordToRow(record({ memberId: "mem_b" }));
    const query = { select() { return this; }, eq() { return this; },
      order() { return Promise.resolve({ data: [row], error: null }); },
      maybeSingle() { return Promise.resolve({ data: row, error: null }); } };
    const store = createSupabaseStoreCreditLedgerStore({ from: () => query } as unknown as SupabaseClient);
    await expect(store.listForMember("mem_a")).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.getEntry("mem_a", row.id)).rejects.toThrow(StoreCreditInvalidTransition);
  });

  it("appends/lists through table queries and obtains balances through the RPC wiring", async () => {
    const { client } = fakeSupabase();
    const store: StoreCreditLedgerRepository = createSupabaseStoreCreditLedgerStore(client);
    await store.append(record({ id: "a", state: "approved", amountCents: 1000 }));
    await store.append(record({ id: "p", state: "pending", amountCents: 250 }));
    await store.append(record({ id: "z", memberId: "mem_b", state: "approved", amountCents: 9999 }));

    expect((await store.listForMember("mem_a")).map((r) => r.id)).toEqual(["a", "p"]);
    expect(await store.spendableCents("mem_a", NOW)).toBe(1000);
    expect(await store.pendingCents("mem_a")).toBe(250);
    expect(await store.getEntry("mem_a", "z")).toBeNull(); // isolation lives in the query
  });

  it("promotes and reverses by inserting new rows, and settles a chain once", async () => {
    const { client, rows } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    await store.append(record({ id: "p", state: "pending", amountCents: 1000 }));
    await store.approve("mem_a", "p", action("ap", new Date("2026-07-21T00:00:00.000Z")));
    await store.reverse("mem_a", "ap", action("rv"));

    expect(rows.map((r) => r.id)).toEqual(["p", "ap", "rv"]); // three inserts, zero edits
    expect(rows.find((r) => r.id === "rv")).toMatchObject({ amount_cents: -1000, reverses_id: "ap" });
    expect(await store.spendableCents("mem_a", NOW)).toBe(0);
    await expect(store.reverse("mem_a", "p", action("again"))).rejects.toThrow(StoreCreditEntrySettled);
  });

  it("surfaces the database unique violation on a racing second settlement as StoreCreditEntrySettled", async () => {
    const { client, rows } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    await store.append(record({ id: "p", state: "pending", amountCents: 1000 }));
    // Two settlement rows for one entry, as two racing approvals would insert
    // after both passed the application check over their stale reads. The
    // append path skips the application check entirely, so what refuses the
    // second row here is the database unique index alone.
    await store.append(record({ id: "ap1", state: "approved", amountCents: 1000, reversesId: "p" }));
    await expect(
      store.append(record({ id: "ap2", state: "approved", amountCents: 1000, reversesId: "p" })),
    ).rejects.toThrow(StoreCreditEntrySettled);
    expect(rows.map((r) => r.id)).toEqual(["p", "ap1"]); // the loser wrote nothing
    expect(await store.spendableCents("mem_a", NOW)).toBe(1000); // never doubled
  });

  it("accepts the synthetic RPC debit and propagates its overdraw refusal", async () => {
    const { client, rows } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    await store.append(record({ id: "a", state: "approved", amountCents: 1500 }));
    const spent = await store.spend("mem_a", 1000, "ord_9", NOW);
    expect(spent.amountCents).toBe(-1000);
    expect(rows.find((r) => r.id === spent.id)).toMatchObject({ amount_cents: -1000, actor_id: "ord_9" });
    expect(await store.spendableCents("mem_a", NOW)).toBe(500);
    await expect(store.spend("mem_a", 501, "ord_10", NOW)).rejects.toThrow("store credit spend failed");
  });

  it("reads an existing durable expiry without silently making the grant non-expiring", async () => {
    const { client, rows } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    const expiry = "2026-12-01T00:00:00.000Z";
    const original = record({ id: "e", state: "approved", expiresAt: expiry });
    rows.push(storeCreditRecordToRow(original));
    expect(await store.getEntry("mem_a", "e")).toEqual(original);
    expect(await store.spendableCents("mem_a", new Date(expiry))).toBe(0);
    expect(await store.spendableCents("mem_a", NOW)).toBe(1000);
    expect(storeCreditRowToRecord(storeCreditRecordToRow(original))).toEqual(original);
  });

  it("retains refusal of new durable expiring credits until allocated spending is qualified", async () => {
    const { client, rows } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    await expect(store.append(record({ id: "new-expiring", expiresAt: "2026-12-01T00:00:00.000Z" })))
      .rejects.toThrow("expiry-allocated spending qualification");
    expect(rows).toEqual([]);
  });

  it.each([undefined, "not-a-date", "infinity", 123])("rejects missing or invalid durable expiry %s", async value => {
    const { client, rows } = fakeSupabase();
    rows.push({ ...storeCreditRecordToRow(record({ state: "approved" })), expires_at: value } as StoreCreditRow);
    const store = createSupabaseStoreCreditLedgerStore(client);
    await expect(store.listForMember("mem_a")).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.getEntry("mem_a", rows[0].id)).rejects.toThrow(StoreCreditInvalidTransition);
  });

  it("refuses invalid expiry before making an insert", async () => {
    const { client, rows } = fakeSupabase();
    await expect(createSupabaseStoreCreditLedgerStore(client).append(record({ expiresAt: "invalid" })))
      .rejects.toThrow(StoreCreditInvalidTransition);
    expect(rows).toEqual([]);
  });

  it("propagates a missing expiry-column failure instead of falling back to an incomplete projection", async () => {
    const columns: string[] = [];
    const result = { data: null, error: { code: "42703", message: "column expires_at does not exist" } };
    const query = { select(value: string) { columns.push(value); return this; }, eq() { return this; },
      order() { return Promise.resolve(result); } };
    const store = createSupabaseStoreCreditLedgerStore({ from: () => query } as unknown as SupabaseClient);
    await expect(store.listForMember("mem_a")).rejects.toThrow("store credit load failed");
    expect(columns).toHaveLength(1);
    expect(columns[0]).toContain("expires_at");
  });

  it("serves the routes view shape through storeCreditViewFor", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    await store.append(record({ id: "a", state: "approved", amountCents: 1000 }));
    const dto = await storeCreditViewFor(store, "mem_a", NOW);
    expect(dto).toEqual({
      spendableCents: 1000,
      pendingCents: 0,
      entries: [{ amountCents: 1000, state: "approved", reason: "referral_referrer", availableAt: null }],
    });
  });
});

describe("authoritative complete-balance RPC boundary", () => {
  const balanceRow = { spendable_cents: 123, pending_cents: -25, reserved_cents: 77 };
  const memberId = "10000000-0000-4000-8000-000000000001";

  it("uses exact RPC vocabulary and no history query for either monetary read", async () => {
    const { client, rpc, from } = fakeSupabase();
    rpc.mockResolvedValue({ data: [balanceRow], error: null });
    const store = createSupabaseStoreCreditLedgerStore(client);
    expect(await store.spendableCents(memberId, NOW)).toBe(123);
    expect(await store.pendingCents(memberId)).toBe(-25);
    expect(rpc.mock.calls[0]).toEqual(["research_store_credit_balance", { p_member_id: memberId, p_as_of: NOW.toISOString() }]);
    expect(rpc.mock.calls[1][0]).toBe("research_store_credit_balance");
    expect(Object.keys(rpc.mock.calls[1][1]).sort()).toEqual(["p_as_of", "p_member_id"]);
    expect(rpc.mock.calls[1][1].p_member_id).toBe(memberId);
    expect(Number.isFinite(Date.parse(rpc.mock.calls[1][1].p_as_of as string))).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it("uses one balance snapshot even when history is incomplete and contradicts the authoritative totals", async () => {
    const { client, rows, rpc, from } = fakeSupabase();
    rows.push(storeCreditRecordToRow(record({ amountCents: 9000 })));
    rpc.mockResolvedValue({ data: [balanceRow], error: null });
    const dto = await storeCreditViewFor(createSupabaseStoreCreditLedgerStore(client), "mem_a", NOW);
    expect(dto).toEqual({ spendableCents: 123, pendingCents: -25,
      entries: [{ amountCents: 9000, state: "approved", reason: "referral_referrer", availableAt: null }] });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("research_store_credit_balance", { p_member_id: "mem_a", p_as_of: NOW.toISOString() });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("keeps signed safe-integer boundaries and clamps only the display's negative spendable total", async () => {
    const { client, rpc } = fakeSupabase();
    rpc.mockResolvedValue({ data: [{ spendable_cents: Number.MIN_SAFE_INTEGER,
      pending_cents: Number.MAX_SAFE_INTEGER, reserved_cents: Number.MAX_SAFE_INTEGER }], error: null });
    const store = createSupabaseStoreCreditLedgerStore(client);
    expect(await store.balanceSnapshot!(memberId, NOW)).toEqual({ spendableCents: Number.MIN_SAFE_INTEGER,
      pendingCents: Number.MAX_SAFE_INTEGER, reservedCents: Number.MAX_SAFE_INTEGER });
    expect(await storeCreditViewFor(store, memberId, NOW)).toEqual({ spendableCents: 0, pendingCents: Number.MAX_SAFE_INTEGER, entries: [] });
  });

  it.each([
    null, undefined, {}, [], [null], [[balanceRow]], [balanceRow, balanceRow], balanceRow,
    [{ spendable_cents: 0, pending_cents: 0 }], [{ ...balanceRow, unexpected: true }],
  ])("refuses unavailable, duplicate or differently shaped balance responses (%#)", async data => {
    const { client, rpc, from } = fakeSupabase();
    rpc.mockResolvedValue({ data, error: null });
    const store = createSupabaseStoreCreditLedgerStore(client);
    await expect(store.spendableCents(memberId, NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.pendingCents(memberId)).rejects.toThrow(StoreCreditInvalidTransition);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(["spendable_cents", "pending_cents", "reserved_cents"] as const)(
    "refuses nonnumeric, missing, fractional and unsafe %s without coercion", async field => {
      const { client, rpc, from } = fakeSupabase();
      const store = createSupabaseStoreCreditLedgerStore(client);
      for (const value of [null, undefined, "123", 123n, true, Number.NaN, Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1]) {
        rpc.mockResolvedValue({ data: [{ ...balanceRow, [field]: value }], error: null });
        await expect(store.balanceSnapshot!(memberId, NOW)).rejects.toThrow(StoreCreditInvalidTransition);
      }
      expect(from).not.toHaveBeenCalled();
    },
  );

  it("refuses negative reservations and an invalid evaluation clock", async () => {
    const { client, rpc, from } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    rpc.mockResolvedValue({ data: [{ ...balanceRow, reserved_cents: -1 }], error: null });
    await expect(store.spendableCents(memberId, NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    rpc.mockClear();
    await expect(store.spendableCents(memberId, new Date("invalid"))).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.spendableCents(" ", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("never falls back to history or individual balance methods after a snapshot failure", async () => {
    const { client, rows, rpc } = fakeSupabase();
    rows.push(storeCreditRecordToRow(record({ amountCents: 9000 })));
    rpc.mockResolvedValue({ data: null, error: { message: "function not available" } });
    const store = createSupabaseStoreCreditLedgerStore(client);
    const spendable = vi.spyOn(store, "spendableCents");
    const pending = vi.spyOn(store, "pendingCents");
    await expect(storeCreditViewFor(store, "mem_a", NOW)).rejects.toThrow("store credit balance failed");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(spendable).not.toHaveBeenCalled();
    expect(pending).not.toHaveBeenCalled();
  });

  it("preserves a legacy repository port through its monetary methods, never the history sum", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    delete store.balanceSnapshot;
    await store.append(record({ amountCents: 9000 }));
    const spendable = vi.spyOn(store, "spendableCents").mockResolvedValue(150);
    const pending = vi.spyOn(store, "pendingCents").mockResolvedValue(-10);
    expect(await storeCreditViewFor(store, "mem_a", NOW)).toMatchObject({ spendableCents: 150, pendingCents: -10 });
    expect(spendable).toHaveBeenCalledExactlyOnceWith("mem_a", NOW);
    expect(pending).toHaveBeenCalledExactlyOnceWith("mem_a");
    spendable.mockResolvedValue(Number.NaN);
    await expect(storeCreditViewFor(store, "mem_a", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
  });

  it("still rejects wrong-owner display entries even alongside a valid monetary snapshot", async () => {
    const store = createInMemoryStoreCreditLedgerStore();
    vi.spyOn(store, "listForMember").mockResolvedValue([record({ memberId: "mem_b" })]);
    await expect(storeCreditViewFor(store, "mem_a", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
  });
});

describe("serialized spend RPC boundary", () => {
  const memberId = "10000000-0000-4000-8000-000000000001";
  const orderId = "20000000-0000-4000-8000-000000000001";
  const debit = () => ({ ...storeCreditRecordToRow(record({ id: "30000000-0000-4000-8000-000000000001",
    memberId, amountCents: -100, actorId: orderId, reason: "manual_adjustment" })), spend_order_id: orderId });

  it("sends only the exact RPC arguments and accepts original identity/time on an idempotent replay", async () => {
    const { client, rpc, from } = fakeSupabase();
    const row = debit();
    rpc.mockResolvedValue({ data: [row], error: null });
    const store = createSupabaseStoreCreditLedgerStore(client);
    const first = await store.spend(memberId, 100, orderId, NOW);
    const later = new Date("2026-07-23T00:00:00.000Z");
    expect(await store.spend(memberId, 100, orderId, later)).toEqual(first);
    expect(first).toEqual(storeCreditRowToRecord(row));
    expect(rpc.mock.calls).toEqual([
      ["research_store_credit_spend", { p_member_id: memberId, p_amount_cents: 100, p_order_id: orderId, p_at: NOW.toISOString() }],
      ["research_store_credit_spend", { p_member_id: memberId, p_amount_cents: 100, p_order_id: orderId, p_at: later.toISOString() }],
    ]);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([null, undefined, {}, [], [null], [[]], [debit(), debit()], debit()])(
    "refuses missing, duplicate or incorrectly shaped spend results (%#)", async data => {
      const { client, rpc, from } = fakeSupabase();
      rpc.mockResolvedValue({ data, error: null });
      await expect(createSupabaseStoreCreditLedgerStore(client).spend(memberId, 100, orderId, NOW))
        .rejects.toThrow(StoreCreditInvalidTransition);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(from).not.toHaveBeenCalled();
    },
  );

  it.each([
    { member_id: "other-member" }, { amount_cents: -99 }, { amount_cents: 100 }, { amount_cents: 0 },
    { amount_cents: "-100" }, { amount_cents: null }, { amount_cents: undefined }, { amount_cents: Number.NaN },
    { amount_cents: Number.MAX_SAFE_INTEGER + 1 }, { amount_cents: Number.MIN_SAFE_INTEGER - 1 },
    { state: "pending" }, { state: "held" }, { state: "fraud_flagged" }, { state: "reversed" }, { state: "unknown" },
    { reason: "service_recovery" }, { reason: "unknown" }, { actor_type: "admin" }, { actor_type: "unknown" },
    { actor_id: "other-order" }, { actor_id: null }, { actor_id: undefined },
    { spend_order_id: "other-order" }, { spend_order_id: null }, { spend_order_id: undefined },
    { expires_at: NOW.toISOString() }, { expires_at: "invalid" }, { expires_at: undefined },
    { reverses_id: "other-row" }, { reverses_id: undefined }, { available_at: NOW.toISOString() }, { available_at: undefined },
    { id: "" }, { id: undefined }, { created_at: "invalid" }, { created_at: undefined }, { unexpected: true },
  ])("rejects a noncanonical or mismatched debit projection (%#)", async override => {
    const { client, rpc, from } = fakeSupabase();
    rpc.mockResolvedValue({ data: [{ ...debit(), ...override }], error: null });
    await expect(createSupabaseStoreCreditLedgerStore(client).spend(memberId, 100, orderId, NOW))
      .rejects.toThrow(StoreCreditInvalidTransition);
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses every omitted field from the full canonical ledger response", async () => {
    const { client, rpc, from } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    for (const key of Object.keys(debit())) {
      const row = { ...debit() } as unknown as Record<string, unknown>;
      delete row[key];
      rpc.mockResolvedValue({ data: [row], error: null });
      await expect(store.spend(memberId, 100, orderId, NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses invalid spending input before any RPC or table call", async () => {
    const { client, rpc, from } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    for (const amount of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(store.spend(memberId, amount, orderId, NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    }
    await expect(store.spend(" ", 100, orderId, NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.spend(memberId, 100, " ", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
    await expect(store.spend(memberId, 100, orderId, new Date("invalid"))).rejects.toThrow(StoreCreditInvalidTransition);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it.each(["research_store_credit_balance", "research_store_credit_spend"])(
    "propagates database/transport uncertainty without table fallback or an automatic retry: %s", async name => {
      const { client, rpc, from } = fakeSupabase();
      const store = createSupabaseStoreCreditLedgerStore(client);
      const invoke = () => name === "research_store_credit_spend"
        ? store.spend(memberId, 100, orderId, NOW) : store.spendableCents(memberId, NOW);
      rpc.mockResolvedValueOnce({ data: [debit()], error: { message: "request outcome unknown" } });
      await expect(invoke()).rejects.toThrow(/store credit (balance|spend) failed/);
      expect(rpc).toHaveBeenCalledTimes(1);
      rpc.mockRejectedValueOnce(new Error("connection lost"));
      await expect(invoke()).rejects.toThrow("connection lost");
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(from).not.toHaveBeenCalled();
    },
  );
});
