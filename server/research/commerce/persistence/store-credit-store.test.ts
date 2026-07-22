import { describe, expect, it } from "vitest";
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
      ["append", "approve", "getEntry", "listForMember", "pendingCents", "reverse", "spend", "spendableCents"].sort(),
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

  it("round-trips a record through the migration 26 row mapping", () => {
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
    expect("expires_at" in row).toBe(false); // schema gap 1: no such column
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
 * maybeSingle. Rows live in a plain array so behavior round-trips.
 */
function fakeSupabase(): { client: SupabaseClient; rows: StoreCreditRow[] } {
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

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, rows };
}

describe("createSupabaseStoreCreditLedgerStore (fake client)", () => {
  it("appends, lists, and computes balances through the real query wiring", async () => {
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

  it("records a spend durably and refuses an overdraw", async () => {
    const { client, rows } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    await store.append(record({ id: "a", state: "approved", amountCents: 1500 }));
    const spent = await store.spend("mem_a", 1000, "ord_9", NOW);
    expect(spent.amountCents).toBe(-1000);
    expect(rows.find((r) => r.id === spent.id)).toMatchObject({ amount_cents: -1000, actor_id: "ord_9" });
    expect(await store.spendableCents("mem_a", NOW)).toBe(500);
    await expect(store.spend("mem_a", 501, "ord_10", NOW)).rejects.toThrow(StoreCreditInvalidTransition);
  });

  it("refuses to persist an expiring credit the schema cannot hold (fail closed)", async () => {
    const { client, rows } = fakeSupabase();
    const store = createSupabaseStoreCreditLedgerStore(client);
    await expect(
      store.append(record({ id: "e", expiresAt: "2026-12-01T00:00:00.000Z" })),
    ).rejects.toThrow(StoreCreditInvalidTransition);
    expect(rows).toEqual([]); // nothing was written
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
