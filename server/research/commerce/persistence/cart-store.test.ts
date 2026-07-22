import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredCart } from "../cart";
import {
  createInMemoryCartStore,
  createSupabaseCartStore,
  lineRowsToStoredCart,
  storedCartToLineRows,
  type CartLineRow,
} from "./cart-store";

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("lineRowsToStoredCart", () => {
  it("maps a one_time and a valid subscription line", () => {
    const rows: CartLineRow[] = [
      { sku: "P001", quantity: 2, purchase_mode: "one_time", subscription_frequency_days: null },
      { sku: "P002", quantity: 1, purchase_mode: "subscription", subscription_frequency_days: 30 },
    ];
    expect(lineRowsToStoredCart(rows)).toEqual({
      lines: [
        { sku: "P001", quantity: 2, purchaseMode: "one_time" },
        { sku: "P002", quantity: 1, purchaseMode: "subscription", subscriptionFrequencyDays: 30 },
      ],
    });
  });

  it("drops a subscription row with an invalid or missing frequency rather than guessing", () => {
    const rows: CartLineRow[] = [
      { sku: "P003", quantity: 1, purchase_mode: "subscription", subscription_frequency_days: 45 },
      { sku: "P004", quantity: 1, purchase_mode: "subscription", subscription_frequency_days: null },
    ];
    expect(lineRowsToStoredCart(rows).lines).toEqual([]);
  });

  it("drops a row with an unknown purchase_mode", () => {
    const rows: CartLineRow[] = [
      { sku: "P005", quantity: 1, purchase_mode: "rental", subscription_frequency_days: null },
    ];
    expect(lineRowsToStoredCart(rows).lines).toEqual([]);
  });
});

describe("storedCartToLineRows", () => {
  it("carries a subscription frequency and nulls it for one_time", () => {
    const cart: StoredCart = {
      lines: [
        { sku: "P001", quantity: 2, purchaseMode: "one_time" },
        { sku: "P002", quantity: 1, purchaseMode: "subscription", subscriptionFrequencyDays: 60 },
      ],
    };
    expect(storedCartToLineRows("cart-1", cart)).toEqual([
      { cart_id: "cart-1", sku: "P001", quantity: 2, purchase_mode: "one_time", subscription_frequency_days: null },
      { cart_id: "cart-1", sku: "P002", quantity: 1, purchase_mode: "subscription", subscription_frequency_days: 60 },
    ]);
  });

  it("round-trips through the mapping functions", () => {
    const cart: StoredCart = {
      lines: [
        { sku: "P006", quantity: 3, purchaseMode: "one_time" },
        { sku: "P007", quantity: 1, purchaseMode: "subscription", subscriptionFrequencyDays: 90 },
      ],
    };
    const rows = storedCartToLineRows("c", cart).map((r) => ({
      sku: r.sku,
      quantity: r.quantity,
      purchase_mode: r.purchase_mode,
      subscription_frequency_days: r.subscription_frequency_days,
    }));
    expect(lineRowsToStoredCart(rows)).toEqual(cart);
  });
});

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

describe("createInMemoryCartStore", () => {
  it("returns null before anything is saved", async () => {
    const store = createInMemoryCartStore();
    expect(await store.load("mem_1")).toBeNull();
  });

  it("saves and loads a cart, and isolates members from each other", async () => {
    const store = createInMemoryCartStore();
    await store.save("mem_1", { lines: [{ sku: "P001", quantity: 2, purchaseMode: "one_time" }] });
    await store.save("mem_2", { lines: [{ sku: "P002", quantity: 1, purchaseMode: "one_time" }] });
    expect(await store.load("mem_1")).toEqual({ lines: [{ sku: "P001", quantity: 2, purchaseMode: "one_time" }] });
    expect(await store.load("mem_2")).toEqual({ lines: [{ sku: "P002", quantity: 1, purchaseMode: "one_time" }] });
  });

  it("does not let a caller mutate stored state through a returned reference", async () => {
    const store = createInMemoryCartStore();
    await store.save("mem_1", { lines: [{ sku: "P001", quantity: 1, purchaseMode: "one_time" }] });
    const loaded = await store.load("mem_1");
    loaded!.lines.push({ sku: "P999", quantity: 99, purchaseMode: "one_time" });
    expect((await store.load("mem_1"))!.lines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/**
 * A minimal fake of the supabase-js fluent client covering exactly the calls the
 * cart store makes. It backs carts and lines with plain maps so a save then load
 * round-trips, proving the store's query wiring, not just its mapping.
 */
function fakeSupabase(): { client: SupabaseClient; carts: Map<string, string>; lines: Map<string, CartLineRow[]> } {
  const carts = new Map<string, string>(); // member_id -> cart id
  const lines = new Map<string, CartLineRow[]>(); // cart id -> rows
  let idSeq = 0;

  function builder(table: string) {
    const state: { op: string; filterCol?: string; filterVal?: unknown; payload?: unknown; onConflict?: string } = { op: "select" };
    const api: Record<string, unknown> = {};
    const result = (): { data: unknown; error: null } => {
      if (table === "research_carts") {
        if (state.op === "select") {
          const memberId = String(state.filterVal);
          const id = carts.get(memberId);
          return { data: id ? { id } : null, error: null };
        }
        if (state.op === "upsert") {
          const memberId = (state.payload as { member_id: string }).member_id;
          let id = carts.get(memberId);
          if (!id) {
            id = `cart_${++idSeq}`;
            carts.set(memberId, id);
            lines.set(id, []);
          }
          return { data: { id }, error: null };
        }
      }
      if (table === "research_cart_lines") {
        const cartId = String(state.filterVal ?? "");
        if (state.op === "select") return { data: lines.get(cartId) ?? [], error: null };
        if (state.op === "delete") {
          lines.set(cartId, []);
          return { data: null, error: null };
        }
        if (state.op === "insert") {
          const rows = state.payload as Array<CartLineRow & { cart_id: string }>;
          for (const r of rows) {
            const arr = lines.get(r.cart_id) ?? [];
            arr.push({ sku: r.sku, quantity: r.quantity, purchase_mode: r.purchase_mode, subscription_frequency_days: r.subscription_frequency_days });
            lines.set(r.cart_id, arr);
          }
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    };
    Object.assign(api, {
      select() { return api; },
      eq(col: string, val: unknown) { state.filterCol = col; state.filterVal = val; return api; },
      upsert(payload: unknown, opts?: { onConflict?: string }) { state.op = "upsert"; state.payload = payload; state.onConflict = opts?.onConflict; return api; },
      insert(payload: unknown) { state.op = "insert"; state.payload = payload; return api; },
      delete() { state.op = "delete"; return api; },
      maybeSingle() { return Promise.resolve(result()); },
      single() { return Promise.resolve(result()); },
      then(onF: (v: { data: unknown; error: null }) => unknown) { return Promise.resolve(result()).then(onF); },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, carts, lines };
}

describe("createSupabaseCartStore (fake client)", () => {
  it("returns null for a member with no cart", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCartStore(client);
    expect(await store.load("mem_x")).toBeNull();
  });

  it("saves then loads a cart round-trip", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCartStore(client);
    const cart: StoredCart = {
      lines: [
        { sku: "P001", quantity: 2, purchaseMode: "one_time" },
        { sku: "P002", quantity: 1, purchaseMode: "subscription", subscriptionFrequencyDays: 30 },
      ],
    };
    await store.save("mem_1", cart);
    expect(await store.load("mem_1")).toEqual(cart);
  });

  it("replaces lines on save rather than appending", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCartStore(client);
    await store.save("mem_1", { lines: [{ sku: "P001", quantity: 1, purchaseMode: "one_time" }] });
    await store.save("mem_1", { lines: [{ sku: "P002", quantity: 5, purchaseMode: "one_time" }] });
    expect(await store.load("mem_1")).toEqual({ lines: [{ sku: "P002", quantity: 5, purchaseMode: "one_time" }] });
  });

  it("keeps two members' carts separate", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseCartStore(client);
    await store.save("mem_1", { lines: [{ sku: "P001", quantity: 1, purchaseMode: "one_time" }] });
    await store.save("mem_2", { lines: [{ sku: "P002", quantity: 2, purchaseMode: "one_time" }] });
    expect(await store.load("mem_1")).toEqual({ lines: [{ sku: "P001", quantity: 1, purchaseMode: "one_time" }] });
    expect(await store.load("mem_2")).toEqual({ lines: [{ sku: "P002", quantity: 2, purchaseMode: "one_time" }] });
  });
});
