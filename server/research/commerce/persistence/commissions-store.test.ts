import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommissionLedgerEntry } from "../../partners/commissions";
import {
  chainRowsToEntries,
  commissionEntryToRow,
  createInMemoryCommissionLedgerStore,
  createInMemoryPayoutLedgerStore,
  createSupabaseCommissionLedgerStore,
  createSupabasePayoutLedgerStore,
  DuplicatePayoutAttempt,
  DuplicatePayoutBatch,
  effectiveBasisPoints,
  payoutAttemptRecordToRow,
  payoutAttemptRowToRecord,
  payoutBatchRecordToRow,
  payoutBatchRowToRecord,
  rowToCommissionEntry,
  type CommissionLedgerRow,
  type PayoutAttemptRecord,
  type PayoutBatchRecord,
} from "./commissions-store";

// ---------------------------------------------------------------------------
// Test fixtures: a small commission chain (accrual -> transition -> partial
// reversal -> full reversal), built directly the way the service builds them.
// created_at strictly increases per entry so the reconstructed order is
// unambiguous, exactly as a real caller (which advances asOf) produces.
// ---------------------------------------------------------------------------

function iso(seconds: number): string {
  return new Date(Date.UTC(2026, 6, 1, 0, 0, seconds)).toISOString();
}

const accrual: CommissionLedgerEntry = {
  id: "e1",
  rootId: "e1",
  previousEntryId: null,
  kind: "accrual",
  partnerId: "partner_a",
  orderId: "order_1",
  amountCents: 1000,
  eligibleNetCents: 10000,
  state: "pending",
  actor: "system",
  actorId: null,
  reason: null,
  payoutBatchId: null,
  providerReference: null,
  sourceReference: null,
  createdAt: iso(1),
};

const transition: CommissionLedgerEntry = {
  id: "e2",
  rootId: "e1",
  previousEntryId: "e1",
  kind: "transition",
  partnerId: "partner_a",
  orderId: "order_1",
  amountCents: 0,
  eligibleNetCents: 10000,
  state: "approved",
  actor: "admin",
  actorId: "admin_1",
  reason: null,
  payoutBatchId: null,
  providerReference: null,
  sourceReference: null,
  createdAt: iso(2),
};

const partialReversal: CommissionLedgerEntry = {
  id: "e3",
  rootId: "e1",
  previousEntryId: "e2",
  kind: "reversal",
  partnerId: "partner_a",
  orderId: "order_1",
  amountCents: 400,
  eligibleNetCents: 10000,
  state: "approved", // still live: a partial reversal does not move to reversed
  actor: "system",
  actorId: null,
  reason: "Order order_1 refunded 4000 cents.",
  payoutBatchId: null,
  providerReference: null,
  sourceReference: "refund_1",
  createdAt: iso(3),
};

const fullReversal: CommissionLedgerEntry = {
  id: "e4",
  rootId: "e1",
  previousEntryId: "e3",
  kind: "reversal",
  partnerId: "partner_a",
  orderId: "order_1",
  amountCents: 600,
  eligibleNetCents: 10000,
  state: "reversed",
  actor: "system",
  actorId: null,
  reason: "Order order_1 refunded remaining.",
  payoutBatchId: null,
  providerReference: null,
  sourceReference: "refund_2",
  createdAt: iso(4),
};

// ---------------------------------------------------------------------------
// Pure mappers
// ---------------------------------------------------------------------------

describe("effectiveBasisPoints", () => {
  it("derives the rate implied by the amount and eligible net", () => {
    expect(effectiveBasisPoints(1000, 10000)).toBe(1000); // 10%
    expect(effectiveBasisPoints(0, 10000)).toBe(0); // a transition moves no money
  });

  it("returns 0 when there is no eligible net and clamps to 0..10000", () => {
    expect(effectiveBasisPoints(500, 0)).toBe(0);
    expect(effectiveBasisPoints(20000, 10000)).toBe(10000);
  });
});

describe("commissionEntryToRow", () => {
  it("maps money fields exactly and sets reverses_ledger_id only on a full reversal", () => {
    expect(commissionEntryToRow(accrual)).toMatchObject({
      id: "e1",
      partner_id: "partner_a",
      order_id: "order_1",
      state: "pending",
      eligible_net_cents: 10000,
      amount_cents: 1000,
      basis_points: 1000,
      reverses_ledger_id: null,
      actor_type: "system",
    });
    // a partial reversal keeps the chain live, so it carries no target
    expect(commissionEntryToRow(partialReversal).reverses_ledger_id).toBeNull();
    // a full reversal moves to reversed and links back to the accrual (root)
    expect(commissionEntryToRow(fullReversal).reverses_ledger_id).toBe("e1");
  });
});

describe("chainRowsToEntries", () => {
  it("reconstructs kind, rootId, and previousEntryId from an ordered chain", () => {
    const rows = [accrual, transition, partialReversal, fullReversal].map(commissionEntryToRow);
    const entries = chainRowsToEntries(rows);
    expect(entries.map((e) => e.kind)).toEqual(["accrual", "transition", "reversal", "reversal"]);
    expect(entries.map((e) => e.rootId)).toEqual(["e1", "e1", "e1", "e1"]);
    expect(entries.map((e) => e.previousEntryId)).toEqual([null, "e1", "e2", "e3"]);
  });

  it("round-trips every field the repository contract reads (reason is audit-only, not stored)", () => {
    const rows = [accrual, transition, partialReversal, fullReversal].map(commissionEntryToRow);
    const entries = chainRowsToEntries(rows);
    // reason has no column in migration 26; it is null on reload by design.
    const expected = [accrual, transition, partialReversal, fullReversal].map((e) => ({ ...e, reason: null }));
    expect(entries).toEqual(expected);
  });

  it("returns an empty chain for no rows", () => {
    expect(chainRowsToEntries([])).toEqual([]);
  });

  it("keeps the accrual the accrual when a transition shares its created_at millisecond", () => {
    // The transition's id ("a2") sorts BEFORE the accrual's id ("e1") on the
    // id tiebreak, which is exactly the case position-only derivation misread:
    // the amount-0 transition landed at index 0 as the "accrual" and the real
    // accrual read back as a reversal, zeroing the partner's outstanding.
    const sameMsTransition = { ...transition, id: "a2", createdAt: accrual.createdAt };
    const rows = [sameMsTransition, accrual].map(commissionEntryToRow);
    const entries = chainRowsToEntries(rows);
    expect(entries.map((e) => e.id)).toEqual(["e1", "a2"]);
    expect(entries.map((e) => e.kind)).toEqual(["accrual", "transition"]);
    expect(entries.map((e) => e.rootId)).toEqual(["e1", "e1"]);
    // outstandingOf math over the reconstruction: accrued 1000, reversed 0.
    const accrued = entries.filter((e) => e.kind === "accrual").reduce((s, e) => s + e.amountCents, 0);
    const reversed = entries.filter((e) => e.kind === "reversal").reduce((s, e) => s + e.amountCents, 0);
    expect(accrued).toBe(1000);
    expect(reversed).toBe(0);
  });

  it("keeps a same-millisecond reversal a reversal rather than promoting it to the accrual", () => {
    const sameMsReversal = { ...partialReversal, id: "a3", createdAt: accrual.createdAt, previousEntryId: "e1" };
    const rows = [sameMsReversal, accrual].map(commissionEntryToRow);
    const entries = chainRowsToEntries(rows);
    expect(entries.map((e) => e.kind)).toEqual(["accrual", "reversal"]);
    expect(entries.map((e) => e.rootId)).toEqual(["e1", "e1"]);
  });

  it("falls back to positional derivation for pre-migration rows carrying no kind", () => {
    const rows = [accrual, transition, partialReversal, fullReversal]
      .map(commissionEntryToRow)
      .map((row) => ({ ...row, kind: null }));
    const entries = chainRowsToEntries(rows);
    expect(entries.map((e) => e.kind)).toEqual(["accrual", "transition", "reversal", "reversal"]);
    expect(entries.map((e) => e.rootId)).toEqual(["e1", "e1", "e1", "e1"]);
  });
});

describe("rowToCommissionEntry", () => {
  it("maps a single row given its derived chain fields", () => {
    const row = commissionEntryToRow(accrual);
    expect(rowToCommissionEntry(row, { rootId: "e1", previousEntryId: null, kind: "accrual" })).toEqual({
      ...accrual,
      reason: null,
    });
  });

  it("throws on a state the domain does not define, never guessing on a money row", () => {
    const row: CommissionLedgerRow = { ...commissionEntryToRow(accrual), state: "laundering" };
    expect(() =>
      rowToCommissionEntry(row, { rootId: "e1", previousEntryId: null, kind: "accrual" }),
    ).toThrow(/unknown state/);
    // The chain reconstruction inherits the same refusal: dropping the row
    // silently would shift kind derivation and corrupt balances.
    expect(() => chainRowsToEntries([row])).toThrow(/unknown state/);
  });
});

// ---------------------------------------------------------------------------
// A fake supabase-js fluent client backing rows with plain arrays. It supports
// exactly the calls the stores make (insert / select / eq / order / maybeSingle)
// and it THROWS if update or delete is ever invoked, so the append-only property
// is proven, not assumed. Payout attempts honor the DB UNIQUE (batch_id,
// attempt_no) by returning a 23505 on a duplicate.
// ---------------------------------------------------------------------------

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function fakeSupabase(): {
  client: SupabaseClient;
  tables: Record<string, Record<string, unknown>[]>;
  mutations: { update: number; delete: number };
} {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const mutations = { update: 0, delete: 0 };

  function from(table: string) {
    tables[table] ??= [];
    const rows = tables[table];
    const filters: Array<[string, unknown]> = [];
    let order: { col: string; ascending: boolean } | null = null;

    const selected = (): Record<string, unknown>[] => {
      let out = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
      if (order) {
        const o = order;
        out = [...out].sort((a, b) => cmp(a[o.col], b[o.col]) * (o.ascending ? 1 : -1));
      }
      return out;
    };

    const api: Record<string, unknown> = {
      insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
        const items = Array.isArray(payload) ? payload : [payload];
        for (const item of items) {
          if (table === "research_payout_attempts") {
            const dup = rows.some(
              (r) => r.batch_id === item.batch_id && r.attempt_no === item.attempt_no,
            );
            if (dup) {
              return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
            }
          }
          if (table === "research_payout_batches") {
            // The primary key: a duplicate batch id is a unique violation.
            if (rows.some((r) => r.id === item.id)) {
              return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
            }
          }
          rows.push({ ...item });
        }
        return Promise.resolve({ data: null, error: null });
      },
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return api;
      },
      order(col: string, opts: { ascending: boolean }) {
        order = { col, ascending: opts.ascending };
        return api;
      },
      maybeSingle() {
        return Promise.resolve({ data: selected()[0] ?? null, error: null });
      },
      update() {
        mutations.update++;
        throw new Error("update() must never be called on an append-only ledger");
      },
      delete() {
        mutations.delete++;
        throw new Error("delete() must never be called on an append-only ledger");
      },
      then(onFulfilled: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve({ data: selected(), error: null }).then(onFulfilled);
      },
    };
    return api;
  }

  return { client: { from } as unknown as SupabaseClient, tables, mutations };
}

// ---------------------------------------------------------------------------
// In-memory commission store (the reused reference implementation)
// ---------------------------------------------------------------------------

describe("createInMemoryCommissionLedgerStore", () => {
  it("appends and reads a chain, an accrual lookup, and a partner list", async () => {
    const store = createInMemoryCommissionLedgerStore();
    for (const e of [accrual, transition, partialReversal, fullReversal]) await store.append(e);

    expect((await store.listChain("e1")).map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect((await store.findAccrual("partner_a", "order_1"))?.id).toBe("e1");
    expect((await store.listAccrualsByOrder("order_1")).map((e) => e.id)).toEqual(["e1"]);
    expect((await store.listByPartner("partner_a")).map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect((await store.getEntry("e3"))?.kind).toBe("reversal");
  });
});

// ---------------------------------------------------------------------------
// Supabase commission store against the fake client
// ---------------------------------------------------------------------------

describe("createSupabaseCommissionLedgerStore (fake client)", () => {
  it("appends a chain and reconstructs it identically to the in-memory reference", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCommissionLedgerStore(client);
    for (const e of [accrual, transition, partialReversal, fullReversal]) await store.append(e);

    const chain = await store.listChain("e1");
    expect(chain.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(chain.map((e) => e.kind)).toEqual(["accrual", "transition", "reversal", "reversal"]);
    expect(chain.map((e) => e.previousEntryId)).toEqual([null, "e1", "e2", "e3"]);

    const reference = createInMemoryCommissionLedgerStore();
    for (const e of [accrual, transition, partialReversal, fullReversal]) await reference.append(e);
    const referenceChain = await reference.listChain("e1");
    expect(chain).toEqual(referenceChain.map((e) => ({ ...e, reason: null })));
  });

  it("resolves a chain from any entry id, not only the accrual id", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCommissionLedgerStore(client);
    for (const e of [accrual, transition]) await store.append(e);
    expect((await store.listChain("e2")).map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("finds the accrual and lists accruals for an order", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCommissionLedgerStore(client);
    for (const e of [accrual, transition, partialReversal]) await store.append(e);
    expect((await store.findAccrual("partner_a", "order_1"))?.id).toBe("e1");
    expect(await store.findAccrual("partner_a", "missing")).toBeNull();
    expect((await store.listAccrualsByOrder("order_1")).map((e) => e.id)).toEqual(["e1"]);
  });

  it("isolates one partner's entries from another's", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCommissionLedgerStore(client);
    const other: CommissionLedgerEntry = {
      ...accrual,
      id: "z1",
      rootId: "z1",
      partnerId: "partner_b",
      orderId: "order_2",
      createdAt: iso(9),
    };
    for (const e of [accrual, transition, other]) await store.append(e);
    expect((await store.listByPartner("partner_a")).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect((await store.listByPartner("partner_b")).map((e) => e.id)).toEqual(["z1"]);
  });

  it("returns an empty chain and null entry for unknown ids", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCommissionLedgerStore(client);
    expect(await store.listChain("nope")).toEqual([]);
    expect(await store.getEntry("nope")).toBeNull();
  });

  it("never updates or deletes a historical entry, and exposes no such method", async () => {
    const { client, mutations } = fakeSupabase();
    const store = createSupabaseCommissionLedgerStore(client);
    for (const e of [accrual, transition, partialReversal, fullReversal]) await store.append(e);
    await store.listChain("e1");
    await store.getEntry("e2");
    await store.listByPartner("partner_a");
    expect(mutations.update).toBe(0);
    expect(mutations.delete).toBe(0);
    expect((store as Record<string, unknown>).update).toBeUndefined();
    expect((store as Record<string, unknown>).delete).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Payout ledger mappers
// ---------------------------------------------------------------------------

const batch: PayoutBatchRecord = {
  id: "batch_1",
  partnerId: "partner_a",
  totalCents: 12500,
  state: "built",
  providerName: "disabled",
  providerReference: null,
  excludedReasons: ["below_minimum"],
  builtAt: iso(1),
  settledAt: null,
};

const attempt: PayoutAttemptRecord = {
  id: "attempt_1",
  batchId: "batch_1",
  attemptNo: 1,
  outcome: "disabled",
  providerCode: null,
  attemptedAt: iso(2),
};

describe("payout mappers", () => {
  it("round-trips a batch record through its row", () => {
    expect(payoutBatchRowToRecord(payoutBatchRecordToRow(batch))).toEqual(batch);
  });

  it("round-trips an attempt record through its row", () => {
    expect(payoutAttemptRowToRecord(payoutAttemptRecordToRow(attempt))).toEqual(attempt);
  });

  it("defaults a missing excluded_reasons array to empty on read", () => {
    const row = payoutBatchRecordToRow(batch);
    delete (row as { excluded_reasons?: string[] }).excluded_reasons;
    expect(payoutBatchRowToRecord(row).excludedReasons).toEqual([]);
  });

  it("throws on an unknown batch state or attempt outcome rather than casting through", () => {
    expect(() => payoutBatchRowToRecord({ ...payoutBatchRecordToRow(batch), state: "vanished" })).toThrow(
      /unknown state/,
    );
    expect(() =>
      payoutAttemptRowToRecord({ ...payoutAttemptRecordToRow(attempt), outcome: "maybe" }),
    ).toThrow(/unknown outcome/);
  });
});

// ---------------------------------------------------------------------------
// In-memory payout ledger
// ---------------------------------------------------------------------------

describe("createInMemoryPayoutLedgerStore", () => {
  it("records and reads a batch, scoped to its partner", async () => {
    const store = createInMemoryPayoutLedgerStore();
    await store.recordBatch(batch);
    await store.recordBatch({ ...batch, id: "batch_2", partnerId: "partner_b", builtAt: iso(3) });
    expect((await store.getBatch("batch_1"))?.id).toBe("batch_1");
    expect((await store.listBatchesByPartner("partner_a")).map((b) => b.id)).toEqual(["batch_1"]);
    expect((await store.listBatchesByPartner("partner_b")).map((b) => b.id)).toEqual(["batch_2"]);
  });

  it("appends attempts and rejects a duplicate attempt number for the same batch", async () => {
    const store = createInMemoryPayoutLedgerStore();
    await store.recordBatch(batch);
    await store.recordAttempt(attempt);
    await store.recordAttempt({ ...attempt, id: "attempt_2", attemptNo: 2, outcome: "settled" });
    expect((await store.listAttempts("batch_1")).map((a) => a.attemptNo)).toEqual([1, 2]);
    await expect(store.recordAttempt({ ...attempt, id: "attempt_dup" })).rejects.toBeInstanceOf(
      DuplicatePayoutAttempt,
    );
  });

  it("does not let a caller mutate stored state through a returned reference", async () => {
    const store = createInMemoryPayoutLedgerStore();
    await store.recordBatch(batch);
    const loaded = await store.getBatch("batch_1");
    (loaded!.excludedReasons as string[]).push("tampered");
    expect((await store.getBatch("batch_1"))!.excludedReasons).toEqual(["below_minimum"]);
  });

  it("rejects a duplicate batch id and never overwrites the recorded batch", async () => {
    const store = createInMemoryPayoutLedgerStore();
    await store.recordBatch(batch);
    // The audit finding: this used to silently replace the stored batch, which
    // durable storage (the primary key) would never allow. Now it rejects.
    await expect(store.recordBatch({ ...batch, totalCents: 999999 })).rejects.toBeInstanceOf(
      DuplicatePayoutBatch,
    );
    expect((await store.getBatch("batch_1"))!.totalCents).toBe(12500);
  });
});

// ---------------------------------------------------------------------------
// Supabase payout ledger against the fake client
// ---------------------------------------------------------------------------

describe("createSupabasePayoutLedgerStore (fake client)", () => {
  it("records and reads batches and attempts, scoped correctly", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePayoutLedgerStore(client);
    await store.recordBatch(batch);
    await store.recordBatch({ ...batch, id: "batch_2", partnerId: "partner_b", builtAt: iso(5) });
    await store.recordAttempt(attempt);
    await store.recordAttempt({ ...attempt, id: "attempt_2", attemptNo: 2, outcome: "settled" });

    expect((await store.getBatch("batch_1"))?.totalCents).toBe(12500);
    expect((await store.listBatchesByPartner("partner_a")).map((b) => b.id)).toEqual(["batch_1"]);
    expect((await store.listAttempts("batch_1")).map((a) => a.attemptNo)).toEqual([1, 2]);
  });

  it("surfaces a DB unique violation as a DuplicatePayoutAttempt", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePayoutLedgerStore(client);
    await store.recordBatch(batch);
    await store.recordAttempt(attempt);
    await expect(store.recordAttempt({ ...attempt, id: "attempt_dup" })).rejects.toBeInstanceOf(
      DuplicatePayoutAttempt,
    );
  });

  it("surfaces a duplicate batch id as a DuplicatePayoutBatch, matching the reference", async () => {
    const { client } = fakeSupabase();
    const store = createSupabasePayoutLedgerStore(client);
    await store.recordBatch(batch);
    await expect(store.recordBatch({ ...batch, totalCents: 999999 })).rejects.toBeInstanceOf(
      DuplicatePayoutBatch,
    );
    expect((await store.getBatch("batch_1"))!.totalCents).toBe(12500);
  });

  it("never updates or deletes a batch or attempt, and exposes no such method", async () => {
    const { client, mutations } = fakeSupabase();
    const store = createSupabasePayoutLedgerStore(client);
    await store.recordBatch(batch);
    await store.recordAttempt(attempt);
    await store.getBatch("batch_1");
    await store.listBatchesByPartner("partner_a");
    await store.listAttempts("batch_1");
    expect(mutations.update).toBe(0);
    expect(mutations.delete).toBe(0);
    expect((store as Record<string, unknown>).update).toBeUndefined();
    expect((store as Record<string, unknown>).delete).toBeUndefined();
  });
});
