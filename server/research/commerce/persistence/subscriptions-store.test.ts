import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionRecord, SubscriptionStateEvent } from "../subscriptions";
import {
  createInMemorySubscriptionStore,
  createSupabaseSubscriptionStore,
  eventToRow,
  rowToEvent,
  rowToSubscription,
  subscriptionToRow,
  type SubscriptionEventRow,
  type SubscriptionRow,
} from "./subscriptions-store";

const NOW = "2026-07-20T00:00:00.000Z";

function record(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    subscriptionId: "0f5b3a1c-0000-4000-8000-000000000001",
    memberId: "member-1",
    sku: "P001",
    quantity: 2,
    frequencyDays: 30,
    state: "active",
    nextRenewalAt: "2026-08-19T00:00:00.000Z",
    nextShipmentAt: "2026-08-19T00:00:00.000Z",
    paymentProviderReference: "pm_ref_1",
    priceVersion: "",
    shippingAddressRef: null,
    createdAt: NOW,
    updatedAt: NOW,
    cancelledAt: null,
    ...overrides,
  };
}

function event(overrides: Partial<SubscriptionStateEvent> = {}): SubscriptionStateEvent {
  return {
    subscriptionId: "0f5b3a1c-0000-4000-8000-000000000001",
    action: "pause",
    fromState: "active",
    toState: "paused",
    actorType: "member",
    actorId: null,
    effectiveAt: null,
    occurredAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("subscription row mapping", () => {
  it("round-trips a record through the mappers", () => {
    const rec = record();
    expect(rowToSubscription(subscriptionToRow(rec))).toEqual(rec);
  });

  it("round-trips a cancelled record with a cleared schedule", () => {
    const rec = record({
      state: "cancelled",
      nextRenewalAt: null,
      nextShipmentAt: null,
      cancelledAt: NOW,
      paymentProviderReference: null,
    });
    expect(rowToSubscription(subscriptionToRow(rec))).toEqual(rec);
  });

  it("drops a row with a frequency the state machine does not know", () => {
    const row: SubscriptionRow = { ...subscriptionToRow(record()), frequency_days: 45 };
    expect(rowToSubscription(row)).toBeNull();
  });

  it("drops a row with an unknown state rather than guessing", () => {
    const row: SubscriptionRow = { ...subscriptionToRow(record()), state: "hibernating" };
    expect(rowToSubscription(row)).toBeNull();
  });
});

describe("event row mapping", () => {
  it("round-trips an event through the mappers", () => {
    const ev = event({ effectiveAt: "2026-09-01T00:00:00.000Z", actorId: "admin-1" });
    expect(rowToEvent(eventToRow(ev))).toEqual(ev);
  });

  it("drops an event row with an unknown action or actor", () => {
    const badAction: SubscriptionEventRow = { ...eventToRow(event()), action: "renewed" };
    expect(rowToEvent(badAction)).toBeNull();
    const badActor: SubscriptionEventRow = { ...eventToRow(event()), actor_type: "robot" };
    expect(rowToEvent(badActor)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// In-memory store (the reused domain double)
// ---------------------------------------------------------------------------

describe("createInMemorySubscriptionStore", () => {
  it("returns null before anything is saved", async () => {
    const store = createInMemorySubscriptionStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("saves, loads, and scopes listByMember to the owner", async () => {
    const store = createInMemorySubscriptionStore();
    await store.save(record({ subscriptionId: "s1", memberId: "member-1" }));
    await store.save(record({ subscriptionId: "s2", memberId: "member-2" }));

    expect((await store.get("s1"))!.memberId).toBe("member-1");
    const mine = await store.listByMember("member-1");
    expect(mine).toHaveLength(1);
    expect(mine[0].subscriptionId).toBe("s1");
  });

  it("appends events and lists them per subscription", async () => {
    const store = createInMemorySubscriptionStore();
    await store.appendEvent(event({ subscriptionId: "s1", action: "activate" }));
    await store.appendEvent(event({ subscriptionId: "s1", action: "pause" }));
    await store.appendEvent(event({ subscriptionId: "s2", action: "cancel" }));

    const events = await store.listEvents("s1");
    expect(events.map((e) => e.action)).toEqual(["activate", "pause"]);
  });

  it("does not let a caller mutate stored events through a returned reference", async () => {
    const store = createInMemorySubscriptionStore();
    await store.appendEvent(event({ subscriptionId: "s1" }));
    const events = await store.listEvents("s1");
    events[0].toState = "cancelled";
    expect((await store.listEvents("s1"))[0].toState).toBe("paused");
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client covering exactly the calls the
 * subscription store makes. It backs the header table with a map and the events
 * table with an append-only array, and it records every operation per table so a
 * test can prove the events table only ever sees inserts.
 */
function fakeSupabase(): {
  client: SupabaseClient;
  subscriptions: Map<string, SubscriptionRow>;
  events: SubscriptionEventRow[];
  ops: Array<{ table: string; op: string }>;
} {
  const subscriptions = new Map<string, SubscriptionRow>();
  const events: SubscriptionEventRow[] = [];
  const ops: Array<{ table: string; op: string }> = [];

  function builder(table: string) {
    const state: { op: string; filterCol?: string; filterVal?: unknown; payload?: unknown } = {
      op: "select",
    };
    const api: Record<string, unknown> = {};
    const result = (): { data: unknown; error: null } => {
      ops.push({ table, op: state.op });
      if (table === "research_product_subscriptions") {
        if (state.op === "select") {
          if (state.filterCol === "id") {
            return { data: subscriptions.get(String(state.filterVal)) ?? null, error: null };
          }
          const rows = Array.from(subscriptions.values()).filter(
            (row) => row.member_id === String(state.filterVal),
          );
          return { data: rows, error: null };
        }
        if (state.op === "upsert") {
          const row = state.payload as SubscriptionRow;
          subscriptions.set(row.id, { ...row });
          return { data: null, error: null };
        }
      }
      if (table === "research_subscription_events") {
        if (state.op === "select") {
          return {
            data: events.filter((row) => row.subscription_id === String(state.filterVal)),
            error: null,
          };
        }
        if (state.op === "insert") {
          events.push({ ...(state.payload as SubscriptionEventRow) });
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    };
    Object.assign(api, {
      select() { return api; },
      eq(col: string, val: unknown) { state.filterCol = col; state.filterVal = val; return api; },
      upsert(payload: unknown) { state.op = "upsert"; state.payload = payload; return api; },
      insert(payload: unknown) { state.op = "insert"; state.payload = payload; return api; },
      maybeSingle() { return Promise.resolve(result()); },
      then(onF: (v: { data: unknown; error: null }) => unknown) { return Promise.resolve(result()).then(onF); },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, subscriptions, events, ops };
}

describe("createSupabaseSubscriptionStore (fake client)", () => {
  it("returns null for a missing subscription", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseSubscriptionStore(client);
    expect(await store.get("missing")).toBeNull();
  });

  it("saves then loads a subscription round-trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseSubscriptionStore(client);
    const rec = record();
    await store.save(rec);
    expect(await store.get(rec.subscriptionId)).toEqual(rec);
  });

  it("documents the schema gap: priceVersion and shippingAddressRef do not survive", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseSubscriptionStore(client);
    const rec = record({ priceVersion: "2026-07", shippingAddressRef: "addr_1" });
    await store.save(rec);
    const loaded = await store.get(rec.subscriptionId);
    // Migration 23 has no columns for these; they hydrate as defaults, never invented.
    expect(loaded!.priceVersion).toBe("");
    expect(loaded!.shippingAddressRef).toBeNull();
  });

  it("updates the header in place on a second save (upsert, not duplicate)", async () => {
    const { client, subscriptions } = fakeSupabase();
    const store = createSupabaseSubscriptionStore(client);
    const rec = record();
    await store.save(rec);
    await store.save({ ...rec, state: "paused" });
    expect(subscriptions.size).toBe(1);
    expect((await store.get(rec.subscriptionId))!.state).toBe("paused");
  });

  it("scopes listByMember to the owner id from the argument", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseSubscriptionStore(client);
    await store.save(record({ subscriptionId: "s1", memberId: "member-1" }));
    await store.save(record({ subscriptionId: "s2", memberId: "member-2" }));

    const mine = await store.listByMember("member-1");
    expect(mine).toHaveLength(1);
    expect(mine[0].subscriptionId).toBe("s1");
  });

  it("drops a malformed persisted row rather than guessing", async () => {
    const { client, subscriptions } = fakeSupabase();
    const store = createSupabaseSubscriptionStore(client);
    const good = subscriptionToRow(record({ subscriptionId: "s1" }));
    const bad: SubscriptionRow = {
      ...subscriptionToRow(record({ subscriptionId: "s2" })),
      frequency_days: 45,
    };
    subscriptions.set(good.id, good);
    subscriptions.set(bad.id, bad);

    expect(await store.get("s2")).toBeNull();
    const listed = await store.listByMember("member-1");
    expect(listed.map((r) => r.subscriptionId)).toEqual(["s1"]);
  });

  it("appends events, lists them in occurrence order, and never updates or deletes", async () => {
    const { client, ops } = fakeSupabase();
    const store = createSupabaseSubscriptionStore(client);
    await store.appendEvent(
      event({ action: "pause", occurredAt: "2026-07-21T00:00:00.000Z" }),
    );
    await store.appendEvent(
      event({ action: "activate", fromState: "pending", toState: "active", occurredAt: NOW }),
    );

    const events = await store.listEvents("0f5b3a1c-0000-4000-8000-000000000001");
    expect(events.map((e) => e.action)).toEqual(["activate", "pause"]);

    // The ledger property, proven against the recorded operations: the events
    // table only ever receives inserts and selects.
    const eventOps = ops.filter((o) => o.table === "research_subscription_events");
    expect(eventOps.every((o) => o.op === "insert" || o.op === "select")).toBe(true);
    expect(eventOps.some((o) => o.op === "insert")).toBe(true);
  });
});
