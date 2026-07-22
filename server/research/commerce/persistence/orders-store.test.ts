import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderRecord } from "../orders";
import {
  createInMemoryOrderStore,
  createSupabaseOrderStore,
  headerRowToOrder,
  lineRowsToOrderLines,
  orderToHeaderRow,
  orderToLineRows,
  orderToStateEventRow,
  resolveFulfillmentOwner,
  type OrderHeaderRow,
  type OrderLineInsert,
  type OrderLineRow,
  type OrderStateEventInsert,
} from "./orders-store";

const NOW = "2026-07-20T00:00:00.000Z";
const LATER = "2026-07-20T01:00:00.000Z";

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    orderId: "ord_1",
    memberId: "mem_1",
    state: "checkout_pending",
    lines: [{ sku: "P001", displayName: "Product One", quantity: 2, lineTotalCents: 19800 }],
    totals: {
      subtotalCents: 19800,
      shippingCents: 1295,
      storeCreditAppliedCents: 0,
      totalCents: 21095,
    },
    providerReference: null,
    lastIdempotencyKey: null,
    reviewTriggers: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("lineRowsToOrderLines", () => {
  it("reads only the four domain columns and drops storage detail", () => {
    const rows: OrderLineRow[] = [
      {
        sku: "P001",
        display_name: "Product One",
        quantity: 2,
        unit_price_cents: 9900,
        line_total_cents: 19800,
        fulfillment_owner: "xenios",
      },
    ];
    expect(lineRowsToOrderLines(rows)).toEqual([
      { sku: "P001", displayName: "Product One", quantity: 2, lineTotalCents: 19800 },
    ]);
  });
});

describe("resolveFulfillmentOwner", () => {
  it("names the single shipment owner when it is unambiguous", () => {
    expect(
      resolveFulfillmentOwner(
        order({ shipments: [{ owner: "mitch", status: "pending", trackingNumber: null, carrier: null }] }),
      ),
    ).toBe("mitch");
  });

  it("falls back to xenios with no shipments or mixed owners", () => {
    expect(resolveFulfillmentOwner(order())).toBe("xenios");
    expect(
      resolveFulfillmentOwner(
        order({
          shipments: [
            { owner: "mitch", status: "pending", trackingNumber: null, carrier: null },
            { owner: "xenios", status: "pending", trackingNumber: null, carrier: null },
          ],
        }),
      ),
    ).toBe("xenios");
  });
});

describe("orderToLineRows", () => {
  it("derives the implied per-unit price and carries the order id and owner", () => {
    const rows = orderToLineRows("ord_9", order());
    expect(rows).toEqual<OrderLineInsert[]>([
      {
        order_id: "ord_9",
        sku: "P001",
        display_name: "Product One",
        quantity: 2,
        unit_price_cents: 9900,
        line_total_cents: 19800,
        fulfillment_owner: "xenios",
      },
    ]);
  });

  it("does not divide by zero on a zero-quantity line", () => {
    const rows = orderToLineRows("ord_9", order({ lines: [{ sku: "X", displayName: "X", quantity: 0, lineTotalCents: 0 }] }));
    expect(rows[0].unit_price_cents).toBe(0);
  });
});

describe("header row mapping round-trip", () => {
  it("maps a record to a header row and back with no amounts", () => {
    const rec = order();
    const headerInsert = orderToHeaderRow(rec);
    // The read row is the insert row plus DB-defaulted columns; the checkout key
    // is a column the domain does not carry, so it reads back null.
    const headerRow: OrderHeaderRow = { ...headerInsert, checkout_idempotency_key: null };
    expect(headerRowToOrder(headerRow, orderToLineRows(rec.orderId, rec))).toEqual(rec);
  });

  it("carries the authorized and captured amounts when present", () => {
    const rec = order({ authorizedAmountCents: 21095, capturedAmountCents: 21095, providerReference: "auth_1" });
    const headerRow: OrderHeaderRow = { ...orderToHeaderRow(rec), checkout_idempotency_key: null };
    const back = headerRowToOrder(headerRow, orderToLineRows(rec.orderId, rec));
    expect(back.authorizedAmountCents).toBe(21095);
    expect(back.capturedAmountCents).toBe(21095);
    expect(back.providerReference).toBe("auth_1");
  });

  it("omits the amount keys when the columns are null", () => {
    const headerRow: OrderHeaderRow = { ...orderToHeaderRow(order()), checkout_idempotency_key: null };
    const back = headerRowToOrder(headerRow, []);
    expect("authorizedAmountCents" in back).toBe(false);
    expect("capturedAmountCents" in back).toBe(false);
  });
});

describe("orderToStateEventRow", () => {
  it("records the from and to states with the neutral system actor", () => {
    const rec = order({ state: "payment_authorized", providerReference: "auth_1", lastIdempotencyKey: "k1" });
    expect(orderToStateEventRow(rec, "checkout_pending")).toEqual<OrderStateEventInsert>({
      order_id: "ord_1",
      from_state: "checkout_pending",
      to_state: "payment_authorized",
      actor_type: "system",
      actor_id: null,
      provider_reference: "auth_1",
      idempotency_key: "k1",
    });
  });
});

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

describe("createInMemoryOrderStore", () => {
  it("returns null before anything is saved", async () => {
    expect(await createInMemoryOrderStore().get("ord_x")).toBeNull();
  });

  it("saves and loads an order and isolates members from each other", async () => {
    const store = createInMemoryOrderStore();
    await store.save(order({ orderId: "ord_1", memberId: "mem_1" }));
    await store.save(order({ orderId: "ord_2", memberId: "mem_2" }));
    expect((await store.get("ord_1"))!.memberId).toBe("mem_1");
    expect(await store.listByMember("mem_1")).toHaveLength(1);
    expect(await store.listByMember("mem_2")).toHaveLength(1);
  });

  it("does not let a caller mutate stored state through a returned reference", async () => {
    const store = createInMemoryOrderStore();
    await store.save(order());
    const loaded = await store.get("ord_1");
    loaded!.lines.push({ sku: "P999", displayName: "X", quantity: 1, lineTotalCents: 1 });
    loaded!.reviewTriggers.push("hacked");
    expect((await store.get("ord_1"))!.lines).toHaveLength(1);
    expect((await store.get("ord_1"))!.reviewTriggers).toHaveLength(0);
  });

  it("finds by the last idempotency key, scoped to the member", async () => {
    const store = createInMemoryOrderStore();
    await store.save(order({ orderId: "ord_1", memberId: "mem_1", lastIdempotencyKey: "key_a" }));
    await store.save(order({ orderId: "ord_2", memberId: "mem_2", lastIdempotencyKey: "key_a" }));
    expect((await store.findByIdempotencyKey("mem_1", "key_a"))!.orderId).toBe("ord_1");
    expect(await store.findByIdempotencyKey("mem_1", "key_missing")).toBeNull();
  });

  it("lists all orders across members for the admin queue", async () => {
    const store = createInMemoryOrderStore([
      order({ orderId: "ord_1", memberId: "mem_1" }),
      order({ orderId: "ord_2", memberId: "mem_2" }),
    ]);
    expect(await store.listAll()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client covering exactly the calls the
 * order store makes across three tables. Orders and lines are backed by plain
 * maps so a save then load round-trips; state events are an append-only array so
 * the ledger behavior can be asserted directly. The maps are exposed for seeding
 * rows the domain cannot write (a checkout_idempotency_key set by checkout).
 */
function fakeSupabase(): {
  client: SupabaseClient;
  orders: Map<string, OrderHeaderRow>;
  lines: Map<string, OrderLineRow[]>;
  events: OrderStateEventInsert[];
  deletes: number;
} {
  const orders = new Map<string, OrderHeaderRow>();
  const lines = new Map<string, OrderLineRow[]>();
  const events: OrderStateEventInsert[] = [];
  const counters = { deletes: 0 };

  function builder(table: string) {
    const state: {
      op: string;
      single: boolean;
      filters: Record<string, unknown>;
      payload?: unknown;
    } = { op: "select", single: false, filters: {} };

    const result = (): { data: unknown; error: null } => {
      if (table === "research_orders") {
        if (state.op === "select") {
          if (state.single) {
            const id = String(state.filters.id);
            return { data: orders.get(id) ?? null, error: null };
          }
          let rows = Array.from(orders.values());
          if (state.filters.member_id !== undefined) {
            rows = rows.filter((r) => r.member_id === state.filters.member_id);
          }
          return { data: rows, error: null };
        }
        if (state.op === "upsert") {
          const row = state.payload as OrderHeaderRow;
          // Merge onto any seeded row so checkout-owned columns survive an upsert.
          const existing = orders.get(row.id);
          orders.set(row.id, { ...(existing ?? {}), ...row } as OrderHeaderRow);
          return { data: null, error: null };
        }
      }
      if (table === "research_order_lines") {
        const orderId = String(state.filters.order_id ?? "");
        if (state.op === "select") return { data: lines.get(orderId) ?? [], error: null };
        if (state.op === "delete") {
          counters.deletes += 1;
          lines.set(orderId, []);
          return { data: null, error: null };
        }
        if (state.op === "insert") {
          const rows = state.payload as OrderLineInsert[];
          for (const r of rows) {
            const arr = lines.get(r.order_id) ?? [];
            arr.push({
              sku: r.sku,
              display_name: r.display_name,
              quantity: r.quantity,
              unit_price_cents: r.unit_price_cents,
              line_total_cents: r.line_total_cents,
              fulfillment_owner: r.fulfillment_owner,
            });
            lines.set(r.order_id, arr);
          }
          return { data: null, error: null };
        }
      }
      if (table === "research_order_state_events") {
        if (state.op === "insert") {
          events.push(state.payload as OrderStateEventInsert);
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    };

    const api: Record<string, unknown> = {};
    Object.assign(api, {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
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
        state.single = true;
        return Promise.resolve(result());
      },
      single() {
        state.single = true;
        return Promise.resolve(result());
      },
      then(onF: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve(result()).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, orders, lines, events, get deletes() { return counters.deletes; } };
}

describe("createSupabaseOrderStore (fake client)", () => {
  it("returns null for an unknown order", async () => {
    const { client } = fakeSupabase();
    expect(await createSupabaseOrderStore(client).get("ord_x")).toBeNull();
  });

  it("saves then loads an order round-trip including its lines", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseOrderStore(client);
    const rec = order({
      lines: [
        { sku: "P001", displayName: "Product One", quantity: 2, lineTotalCents: 19800 },
        { sku: "P002", displayName: "Product Two", quantity: 1, lineTotalCents: 4500 },
      ],
    });
    await store.save(rec);
    expect(await store.get("ord_1")).toEqual(rec);
  });

  it("replaces the lines on save rather than appending", async () => {
    const { client, deletes } = fakeSupabase();
    const store = createSupabaseOrderStore(client);
    await store.save(order({ lines: [{ sku: "P001", displayName: "One", quantity: 1, lineTotalCents: 100 }] }));
    await store.save(order({ lines: [{ sku: "P002", displayName: "Two", quantity: 3, lineTotalCents: 300 }] }));
    const loaded = await store.get("ord_1");
    expect(loaded!.lines).toEqual([{ sku: "P002", displayName: "Two", quantity: 3, lineTotalCents: 300 }]);
  });

  it("keeps two members' orders separate on read", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseOrderStore(client);
    await store.save(order({ orderId: "ord_1", memberId: "mem_1" }));
    await store.save(order({ orderId: "ord_2", memberId: "mem_2" }));
    const forOne = await store.listByMember("mem_1");
    expect(forOne).toHaveLength(1);
    expect(forOne[0].orderId).toBe("ord_1");
    expect(await store.listAll()).toHaveLength(2);
  });

  it("finds by the last idempotency key, scoped to the member", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseOrderStore(client);
    await store.save(order({ orderId: "ord_1", memberId: "mem_1", lastIdempotencyKey: "key_a" }));
    await store.save(order({ orderId: "ord_2", memberId: "mem_2", lastIdempotencyKey: "key_a" }));
    expect((await store.findByIdempotencyKey("mem_1", "key_a"))!.orderId).toBe("ord_1");
    // The same key on another member is never returned across the tenant boundary.
    expect((await store.findByIdempotencyKey("mem_2", "key_a"))!.orderId).toBe("ord_2");
    expect(await store.findByIdempotencyKey("mem_1", "nope")).toBeNull();
  });

  it("finds by the checkout idempotency key column set by checkout", async () => {
    const { client, orders } = fakeSupabase();
    const store = createSupabaseOrderStore(client);
    // Simulate a row the checkout flow created with a checkout key this store did not write.
    orders.set("ord_c", {
      ...orderToHeaderRow(order({ orderId: "ord_c", memberId: "mem_1" })),
      checkout_idempotency_key: "checkout_key",
    } as OrderHeaderRow);
    expect((await store.findByIdempotencyKey("mem_1", "checkout_key"))!.orderId).toBe("ord_c");
  });

  it("appends a state event on each transition and never on an unchanged save", async () => {
    const fake = fakeSupabase();
    const store = createSupabaseOrderStore(fake.client);
    // First save: genesis, one event (from == to as creation marker).
    await store.save(order({ state: "checkout_pending" }));
    expect(fake.events).toHaveLength(1);
    expect(fake.events[0].to_state).toBe("checkout_pending");
    // A save that does not change state records nothing new.
    await store.save(order({ state: "checkout_pending", updatedAt: LATER }));
    expect(fake.events).toHaveLength(1);
    // A real transition appends a second event with the correct from -> to.
    await store.save(order({ state: "payment_authorized", providerReference: "auth_1", updatedAt: LATER }));
    expect(fake.events).toHaveLength(2);
    expect(fake.events[1]).toMatchObject({ from_state: "checkout_pending", to_state: "payment_authorized" });
  });

  it("only ever inserts state events, never updating or deleting the ledger", async () => {
    const fake = fakeSupabase();
    const store = createSupabaseOrderStore(fake.client);
    await store.save(order({ state: "checkout_pending" }));
    await store.save(order({ state: "payment_authorized", providerReference: "auth_1", updatedAt: LATER }));
    await store.save(order({ state: "approved", providerReference: "auth_1", updatedAt: LATER }));
    // The ledger only grows; earlier rows are untouched.
    expect(fake.events.map((e) => e.to_state)).toEqual([
      "checkout_pending",
      "payment_authorized",
      "approved",
    ]);
  });
});
