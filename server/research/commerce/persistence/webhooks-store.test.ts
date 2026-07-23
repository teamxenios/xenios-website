import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookOrder } from "../webhooks";
import {
  createInMemoryWebhookEventStore,
  createInMemoryWebhookOrderStore,
  createSupabaseWebhookOrderStore,
  createSupabaseWebhookReplayGuard,
  rowToWebhookOrder,
  webhookEventToRow,
  webhookOrderToRowUpdate,
  type WebhookOrderRow,
} from "./webhooks-store";

const AT = new Date("2026-07-21T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Pure order mapping
// ---------------------------------------------------------------------------

describe("rowToWebhookOrder", () => {
  it("maps an approved, uncaptured order and omits an absent idempotency key", () => {
    const row: WebhookOrderRow = {
      id: "ord_1",
      state: "approved",
      payment_reference: "auth_1",
      captured_amount_cents: null,
      last_idempotency_key: null,
    };
    expect(rowToWebhookOrder(row)).toEqual({
      orderId: "ord_1",
      state: "approved",
      paymentReference: "auth_1",
      captured: false,
    });
  });

  it("derives captured from a post-capture state even with no capture amount stored", () => {
    const row: WebhookOrderRow = {
      id: "ord_2",
      state: "fulfilled",
      payment_reference: "auth_2",
      captured_amount_cents: null,
      last_idempotency_key: "evt_9",
    };
    const order = rowToWebhookOrder(row);
    expect(order.captured).toBe(true);
    expect(order.lastWebhookEventId).toBe("evt_9");
  });

  it("treats a recorded capture amount as captured regardless of state label", () => {
    const row: WebhookOrderRow = {
      id: "ord_3",
      state: "payment_captured",
      payment_reference: "auth_3",
      captured_amount_cents: 5000,
      last_idempotency_key: null,
    };
    expect(rowToWebhookOrder(row).captured).toBe(true);
  });
});

describe("webhookOrderToRowUpdate", () => {
  it("writes only state, payment reference, and the transition idempotency key", () => {
    const order: WebhookOrder = {
      orderId: "ord_1",
      state: "payment_captured",
      paymentReference: "auth_1",
      captured: true,
      lastWebhookEventId: "evt_1",
    };
    expect(webhookOrderToRowUpdate(order)).toEqual({
      state: "payment_captured",
      payment_reference: "auth_1",
      last_idempotency_key: "evt_1",
    });
  });

  it("nulls an absent idempotency key rather than writing undefined", () => {
    const order: WebhookOrder = {
      orderId: "ord_1",
      state: "approved",
      paymentReference: null,
      captured: false,
    };
    expect(webhookOrderToRowUpdate(order).last_idempotency_key).toBeNull();
  });
});

describe("webhookEventToRow", () => {
  it("maps a seen event to a durable row with an ISO timestamp", () => {
    expect(webhookEventToRow("stripe", "evt_1", "payment.captured", AT)).toEqual({
      provider_name: "stripe",
      event_id: "evt_1",
      event_type: "payment.captured",
      received_at: AT.toISOString(),
    });
  });
});

// ---------------------------------------------------------------------------
// In-memory order store
// ---------------------------------------------------------------------------

describe("createInMemoryWebhookOrderStore", () => {
  it("returns undefined for an unknown order", async () => {
    const store = createInMemoryWebhookOrderStore();
    expect(await store.get("nope")).toBeUndefined();
  });

  it("saves then gets an order faithfully, round-tripping every field", async () => {
    const store = createInMemoryWebhookOrderStore();
    const order: WebhookOrder = {
      orderId: "ord_1",
      state: "payment_captured",
      paymentReference: "auth_1",
      captured: true,
      lastWebhookEventId: "evt_1",
    };
    await store.save(order);
    expect(await store.get("ord_1")).toEqual(order);
  });

  it("seeds an initial order and does not leak a mutable reference", async () => {
    const store = createInMemoryWebhookOrderStore([
      { orderId: "ord_1", state: "approved", paymentReference: "auth_1", captured: false },
    ]);
    const loaded = (await store.get("ord_1"))!;
    loaded.state = "refunded";
    expect((await store.get("ord_1"))!.state).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// A fake supabase-js client backing research_orders and the webhook events table
// with plain collections, covering exactly the fluent calls the stores make. No
// network. Filters accumulate so a two-eq lookup (provider_name, event_id) matches
// on both, and a duplicate insert returns the DB unique-violation code.
// ---------------------------------------------------------------------------

function fakeSupabase(): {
  client: SupabaseClient;
  orders: Map<string, WebhookOrderRow>;
  events: Array<{ provider_name: string; event_id: string; event_type: string; received_at: string }>;
} {
  const orders = new Map<string, WebhookOrderRow>();
  const events: Array<{ provider_name: string; event_id: string; event_type: string; received_at: string }> = [];

  function builder(table: string) {
    const state: { op: string; filters: Record<string, unknown>; payload?: unknown } = {
      op: "select",
      filters: {},
    };
    const api: Record<string, unknown> = {};
    const matches = (row: Record<string, unknown>): boolean =>
      Object.entries(state.filters).every(([col, val]) => row[col] === val);

    const result = (): { data: unknown; error: { code?: string; message?: string } | null } => {
      if (table === "research_orders") {
        if (state.op === "select") {
          const row = [...orders.values()].find((r) => matches(r as unknown as Record<string, unknown>)) ?? null;
          return { data: row, error: null };
        }
        if (state.op === "update") {
          for (const row of orders.values()) {
            if (matches(row as unknown as Record<string, unknown>)) Object.assign(row, state.payload);
          }
          return { data: null, error: null };
        }
      }
      if (table === "research_provider_webhook_events") {
        if (state.op === "select") {
          const row = events.find((e) => matches(e as unknown as Record<string, unknown>)) ?? null;
          return { data: row, error: null };
        }
        if (state.op === "insert") {
          const r = state.payload as { provider_name: string; event_id: string; event_type: string; received_at: string };
          const duplicate = events.some((e) => e.provider_name === r.provider_name && e.event_id === r.event_id);
          if (duplicate) return { data: null, error: { code: "23505" } };
          events.push(r);
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    };

    Object.assign(api, {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return api;
      },
      insert(payload: unknown) {
        state.op = "insert";
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
      then(onF: (v: ReturnType<typeof result>) => unknown) {
        return Promise.resolve(result()).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, orders, events };
}

// ---------------------------------------------------------------------------
// Supabase-backed order store (fake client)
// ---------------------------------------------------------------------------

describe("createSupabaseWebhookOrderStore (fake client)", () => {
  it("returns undefined for an order that does not exist", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseWebhookOrderStore(client);
    expect(await store.get("ord_x")).toBeUndefined();
  });

  it("reads a seeded order as its narrow projection", async () => {
    const { client, orders } = fakeSupabase();
    orders.set("ord_1", {
      id: "ord_1",
      state: "approved",
      payment_reference: "auth_1",
      captured_amount_cents: null,
      last_idempotency_key: null,
    });
    const store = createSupabaseWebhookOrderStore(client);
    expect(await store.get("ord_1")).toEqual({
      orderId: "ord_1",
      state: "approved",
      paymentReference: "auth_1",
      captured: false,
    });
  });

  it("advances an order through save and reads the captured projection back", async () => {
    const { client, orders } = fakeSupabase();
    orders.set("ord_1", {
      id: "ord_1",
      state: "approved",
      payment_reference: "auth_1",
      captured_amount_cents: null,
      last_idempotency_key: null,
    });
    const store = createSupabaseWebhookOrderStore(client);

    await store.save({
      orderId: "ord_1",
      state: "payment_captured",
      paymentReference: "auth_1",
      captured: true,
      lastWebhookEventId: "evt_1",
    });

    const reloaded = (await store.get("ord_1"))!;
    expect(reloaded.state).toBe("payment_captured");
    expect(reloaded.captured).toBe(true);
    expect(reloaded.lastWebhookEventId).toBe("evt_1");
    // The narrow save never invents a capture amount it does not know.
    expect(orders.get("ord_1")!.captured_amount_cents).toBeNull();
  });

  it("scopes a save to the single addressed order and touches no other", async () => {
    const { client, orders } = fakeSupabase();
    orders.set("ord_1", {
      id: "ord_1",
      state: "approved",
      payment_reference: "auth_1",
      captured_amount_cents: null,
      last_idempotency_key: null,
    });
    orders.set("ord_2", {
      id: "ord_2",
      state: "approved",
      payment_reference: "auth_2",
      captured_amount_cents: null,
      last_idempotency_key: null,
    });
    const store = createSupabaseWebhookOrderStore(client);

    await store.save({
      orderId: "ord_1",
      state: "payment_captured",
      paymentReference: "auth_1",
      captured: true,
      lastWebhookEventId: "evt_1",
    });

    expect(orders.get("ord_2")!.state).toBe("approved");
    expect(orders.get("ord_2")!.last_idempotency_key).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// In-memory event reference (the current sync interface)
// ---------------------------------------------------------------------------

describe("createInMemoryWebhookEventStore reference", () => {
  it("records then reports an event as seen, scoped per provider", () => {
    const store = createInMemoryWebhookEventStore();
    store.record("provider_a", "evt_1", AT);
    expect(store.seen("provider_a", "evt_1")).toBe(true);
    expect(store.seen("provider_b", "evt_1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Durable Supabase replay guard (fake client), the DB-UNIQUE replay protection
// ---------------------------------------------------------------------------

describe("createSupabaseWebhookReplayGuard (fake client)", () => {
  it("reports an unseen event as not seen, then seen after it is recorded", async () => {
    const { client } = fakeSupabase();
    const guard = createSupabaseWebhookReplayGuard(client);

    expect(await guard.seen("stripe", "evt_1")).toBe(false);
    await guard.record("stripe", "evt_1", "payment.captured", AT);
    expect(await guard.seen("stripe", "evt_1")).toBe(true);
  });

  it("scopes events per provider so two providers cannot suppress each other", async () => {
    const { client } = fakeSupabase();
    const guard = createSupabaseWebhookReplayGuard(client);

    await guard.record("provider_a", "evt_1", "payment.captured", AT);
    expect(await guard.seen("provider_a", "evt_1")).toBe(true);
    expect(await guard.seen("provider_b", "evt_1")).toBe(false);
  });

  it("absorbs a racing duplicate record via the unique constraint, keeping one row", async () => {
    const { client, events } = fakeSupabase();
    const guard = createSupabaseWebhookReplayGuard(client);

    await guard.record("stripe", "evt_1", "payment.captured", AT);
    // A second delivery of the same event does not raise and does not add a row.
    await expect(guard.record("stripe", "evt_1", "payment.captured", AT)).resolves.toBeUndefined();
    expect(events.filter((e) => e.event_id === "evt_1")).toHaveLength(1);
  });
});
