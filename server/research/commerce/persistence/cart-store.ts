// Track B, wave 1: persistent cart storage.
//
// The cart SERVICE (server/research/commerce/cart.ts) is synchronous and proven,
// and it is not changed here. Persistence is an async boundary layered beneath
// it: load the member's stored cart, run the sync service, save the result. This
// module is that async boundary for the cart, mirroring the member platform's
// Supabase pattern (getSupabaseAdmin().from(table)) and never inventing a second
// data system.
//
// Nothing here enables commerce. The store is additive: production-deps still
// fails every stateful surface closed until the async load-operate-save bridge
// is wired behind the commerce flag in a later wave.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionFrequencyDays } from "@shared/research/commerce";
import { SUBSCRIPTION_FREQUENCIES } from "@shared/research/commerce";
import type { StoredCart, StoredCartLine } from "../cart";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// The async storage interface. The bridge (later wave) loads through this,
// runs the sync CartService against an in-memory repository, then saves back.
// ---------------------------------------------------------------------------

export interface AsyncCartStore {
  load(memberId: string): Promise<StoredCart | null>;
  save(memberId: string, cart: StoredCart): Promise<void>;
}

// ---------------------------------------------------------------------------
// Row mapping (pure, fully tested). All row-shape knowledge lives here, so the
// Supabase implementation below is a thin set of calls around these functions.
// ---------------------------------------------------------------------------

/** A research_cart_lines row, only the columns the cart needs. */
export interface CartLineRow {
  sku: string;
  quantity: number;
  purchase_mode: string;
  subscription_frequency_days: number | null;
}

function isFrequency(value: number | null): value is SubscriptionFrequencyDays {
  return value !== null && (SUBSCRIPTION_FREQUENCIES as readonly number[]).includes(value);
}

/**
 * Map persisted line rows to a StoredCart. A row is admitted only if it is a
 * shape the service can evaluate: a subscription line must carry a valid
 * frequency, and a one_time line must not. A row that does not fit is dropped
 * rather than guessed, because a malformed persisted line must never become a
 * silently-different order than what the member built.
 */
export function lineRowsToStoredCart(rows: readonly CartLineRow[]): StoredCart {
  const lines: StoredCartLine[] = [];
  for (const row of rows) {
    if (row.purchase_mode === "subscription") {
      if (!isFrequency(row.subscription_frequency_days)) continue;
      lines.push({
        sku: row.sku,
        quantity: row.quantity,
        purchaseMode: "subscription",
        subscriptionFrequencyDays: row.subscription_frequency_days,
      });
    } else if (row.purchase_mode === "one_time") {
      lines.push({ sku: row.sku, quantity: row.quantity, purchaseMode: "one_time" });
    }
    // Any other purchase_mode is not a shape this system writes; drop it.
  }
  return { lines };
}

/** Map a StoredCart to insertable research_cart_lines rows for a cart id. */
export function storedCartToLineRows(
  cartId: string,
  cart: StoredCart,
): Array<{
  cart_id: string;
  sku: string;
  quantity: number;
  purchase_mode: string;
  subscription_frequency_days: number | null;
}> {
  return cart.lines.map((line) => ({
    cart_id: cartId,
    sku: line.sku,
    quantity: line.quantity,
    purchase_mode: line.purchaseMode,
    subscription_frequency_days:
      line.purchaseMode === "subscription" && line.subscriptionFrequencyDays !== undefined
        ? line.subscriptionFrequencyDays
        : null,
  }));
}

// ---------------------------------------------------------------------------
// In-memory store: the deterministic double for tests and for the bridge's
// fallback when Supabase is not configured. Copies on the way in and out so a
// caller cannot mutate stored state by holding a reference.
// ---------------------------------------------------------------------------

export function createInMemoryCartStore(): AsyncCartStore {
  const carts = new Map<string, StoredCart>();
  const clone = (cart: StoredCart): StoredCart => ({ lines: cart.lines.map((l) => ({ ...l })) });
  return {
    async load(memberId) {
      const cart = carts.get(memberId);
      return cart ? clone(cart) : null;
    },
    async save(memberId, cart) {
      carts.set(memberId, clone(cart));
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store. Uses the service-role client (server-only; RLS is a
// backstop, the server is the sole writer). A save replaces the member's lines
// atomically enough for a cart: upsert the cart row, then swap its lines. Tests
// exercise this against an injected fake client; the real client is the default.
// ---------------------------------------------------------------------------

const CARTS = "research_carts";
const LINES = "research_cart_lines";

export function createSupabaseCartStore(
  client: SupabaseClient = getSupabaseAdmin(),
): AsyncCartStore {
  async function cartIdFor(memberId: string, createIfMissing: boolean): Promise<string | null> {
    const found = await client.from(CARTS).select("id").eq("member_id", memberId).maybeSingle();
    if (found.error) throw new Error(`cart load failed: ${found.error.message}`);
    if (found.data) return (found.data as { id: string }).id;
    if (!createIfMissing) return null;
    const created = await client
      .from(CARTS)
      .upsert({ member_id: memberId }, { onConflict: "member_id" })
      .select("id")
      .single();
    if (created.error) throw new Error(`cart upsert failed: ${created.error.message}`);
    return (created.data as { id: string }).id;
  }

  return {
    async load(memberId) {
      const cartId = await cartIdFor(memberId, false);
      if (cartId === null) return null;
      const lines = await client
        .from(LINES)
        .select("sku, quantity, purchase_mode, subscription_frequency_days")
        .eq("cart_id", cartId);
      if (lines.error) throw new Error(`cart lines load failed: ${lines.error.message}`);
      return lineRowsToStoredCart((lines.data ?? []) as CartLineRow[]);
    },

    async save(memberId, cart) {
      const cartId = await cartIdFor(memberId, true);
      if (cartId === null) throw new Error("cart id could not be resolved for save");
      const del = await client.from(LINES).delete().eq("cart_id", cartId);
      if (del.error) throw new Error(`cart lines clear failed: ${del.error.message}`);
      const rows = storedCartToLineRows(cartId, cart);
      if (rows.length > 0) {
        const ins = await client.from(LINES).insert(rows);
        if (ins.error) throw new Error(`cart lines insert failed: ${ins.error.message}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution: the real store when Supabase is configured, else the in-memory
// fallback. The bridge that consumes this stays behind the commerce flag, so an
// unconfigured deployment keeps failing closed rather than silently persisting.
// ---------------------------------------------------------------------------

export function resolveCartStore(): AsyncCartStore {
  return supabaseConfigured() ? createSupabaseCartStore() : createInMemoryCartStore();
}
