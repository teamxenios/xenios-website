// Track B, commerce activation: persistent storage for the webhook surface.
//
// The webhook HANDLER (server/research/commerce/webhooks.ts) is unchanged. It owns
// the order of operations that make inbound provider events safe (verify, then check
// replay, then record, then apply). This module is only the persistence beneath it:
// the order projection the handler reads and advances, and the durable replay guard
// that remembers which provider events were already seen.
//
// Two seams, and they are not symmetric, because wave 1 did not convert them the same
// way:
//
//   1. WebhookOrderStore is ASYNC (get/save return Promises), so it has a real
//      Supabase-backed implementation here, mapping the narrow webhook projection onto
//      research_orders. In-memory reference, Supabase impl, and resolver, exactly like
//      cart-store.ts.
//
//   2. WebhookEventStore is still SYNCHRONOUS (seen returns boolean, record returns
//      void), and its record signature carries no event_type, while the durable table
//      research_provider_webhook_events requires one. A durable replay check must await
//      the database, so it cannot satisfy a synchronous interface. The durable guard
//      below (createSupabaseWebhookReplayGuard) is therefore the ready async component,
//      correct against the DB UNIQUE (provider_name, event_id) constraint, waiting for
//      the event-store interface in webhooks.ts to be async-converted the way the order
//      store already was. Until then resolveWebhookEventStore returns the in-memory
//      reference, the only thing that validly implements the current sync interface.
//
// Nothing here enables commerce. production-deps still fails every stateful surface
// closed. This is additive persistence wiring for a later wave.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderState } from "@shared/research/commerce";
import type { WebhookOrder, WebhookOrderStore, WebhookEventStore } from "../webhooks";
import { createInMemoryWebhookEventStore } from "../webhooks";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// Order projection mapping (pure, fully tested). The webhook reads a deliberately
// narrow slice of research_orders: no member id, no total, no lines, because a
// webhook has no business reading them. All row-shape knowledge lives here.
// ---------------------------------------------------------------------------

/** The research_orders columns the webhook projection reads or writes. */
export interface WebhookOrderRow {
  id: string;
  state: OrderState;
  payment_reference: string | null;
  captured_amount_cents: number | null;
  last_idempotency_key: string | null;
}

/**
 * The states an order can only reach once payment has been captured. `captured` is a
 * projection of the state machine (an order cannot be processing, fulfilled, delivered,
 * refunded, or replaced without a prior capture), so it is derived rather than stored in
 * a column of its own. A recorded captured_amount_cents is an even stronger signal, so
 * either one being present means captured. The webhook itself only ever produces
 * payment_captured, which is in this set, so a captured order round-trips faithfully
 * through save then get without this layer fabricating a monetary amount it does not know.
 */
const CAPTURED_STATES: ReadonlySet<OrderState> = new Set<OrderState>([
  "payment_captured",
  "processing",
  "partially_fulfilled",
  "fulfilled",
  "delivered",
  "refunded",
  "replaced",
]);

/** Map a research_orders projection row to the narrow WebhookOrder. */
export function rowToWebhookOrder(row: WebhookOrderRow): WebhookOrder {
  const order: WebhookOrder = {
    orderId: row.id,
    state: row.state,
    paymentReference: row.payment_reference,
    captured: row.captured_amount_cents !== null || CAPTURED_STATES.has(row.state),
  };
  // lastWebhookEventId is the order's last applied transition idempotency key, the same
  // column (last_idempotency_key) that member and admin transitions use. Absent stays
  // absent rather than becoming an empty string.
  if (row.last_idempotency_key !== null) {
    order.lastWebhookEventId = row.last_idempotency_key;
  }
  return order;
}

/**
 * Map a WebhookOrder to the columns save is allowed to write. Deliberately narrow: a
 * webhook advances state, moves the payment reference forward, and stamps the
 * transition idempotency key. It never writes a member id, a total, or a capture
 * amount (the capture amount is owned by the payment path, not by this projection).
 */
export function webhookOrderToRowUpdate(order: WebhookOrder): {
  state: OrderState;
  payment_reference: string | null;
  last_idempotency_key: string | null;
} {
  return {
    state: order.state,
    payment_reference: order.paymentReference,
    last_idempotency_key: order.lastWebhookEventId ?? null,
  };
}

// ---------------------------------------------------------------------------
// In-memory order store: the deterministic double for tests and the fallback when
// Supabase is not configured. Clones on the way in and out so a caller cannot mutate
// stored state through a returned reference. Faithful to the full WebhookOrder shape.
// ---------------------------------------------------------------------------

export function createInMemoryWebhookOrderStore(
  seed: readonly WebhookOrder[] = [],
): WebhookOrderStore {
  const rows = new Map<string, WebhookOrder>();
  const clone = (order: WebhookOrder): WebhookOrder => ({ ...order });
  for (const order of seed) rows.set(order.orderId, clone(order));

  return {
    async get(orderId) {
      const row = rows.get(orderId);
      return row ? clone(row) : undefined;
    },
    async save(order) {
      rows.set(order.orderId, clone(order));
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed order store. Uses the service-role client (server-only; RLS is a
// backstop, the server is the sole writer). A webhook never creates an order (checkout
// does), so save is a narrow UPDATE keyed by the order id the interface passes, never a
// cross-owner read. Tests exercise this against an injected fake client; the real client
// is the default.
// ---------------------------------------------------------------------------

const ORDERS = "research_orders";
const ORDER_COLUMNS = "id, state, payment_reference, captured_amount_cents, last_idempotency_key";

export function createSupabaseWebhookOrderStore(
  client: SupabaseClient = getSupabaseAdmin(),
): WebhookOrderStore {
  return {
    async get(orderId) {
      const found = await client
        .from(ORDERS)
        .select(ORDER_COLUMNS)
        .eq("id", orderId)
        .maybeSingle();
      if (found.error) throw new Error(`webhook order load failed: ${found.error.message}`);
      if (!found.data) return undefined;
      return rowToWebhookOrder(found.data as WebhookOrderRow);
    },

    async save(order) {
      const update = await client
        .from(ORDERS)
        .update(webhookOrderToRowUpdate(order))
        .eq("id", order.orderId);
      if (update.error) throw new Error(`webhook order save failed: ${update.error.message}`);
    },
  };
}

export function resolveWebhookOrderStore(): WebhookOrderStore {
  return supabaseConfigured()
    ? createSupabaseWebhookOrderStore()
    : createInMemoryWebhookOrderStore();
}

// ---------------------------------------------------------------------------
// Event replay guard.
//
// The in-memory reference (createInMemoryWebhookEventStore) already lives in
// webhooks.ts and is re-exported here so callers have one persistence import surface.
// resolveWebhookEventStore returns it, because it is the only implementation that
// validly satisfies the current SYNCHRONOUS WebhookEventStore interface.
// ---------------------------------------------------------------------------

export { createInMemoryWebhookEventStore } from "../webhooks";

export function resolveWebhookEventStore(): WebhookEventStore {
  // A Supabase-backed event store cannot be returned here: WebhookEventStore is
  // synchronous, and a durable seen/record must await the database. The async durable
  // guard below is the replacement, ready for when this interface is async-converted.
  return createInMemoryWebhookEventStore();
}

// ---------------------------------------------------------------------------
// Durable Supabase replay guard.
//
// This is the real provider replay protection: whether a (provider, event) was already
// seen is answered by the DATABASE, and recording an event relies on the UNIQUE
// (provider_name, event_id) constraint on research_provider_webhook_events, not on an
// application check, exactly like idempotency-store.ts. A racing double-record collapses
// to one row rather than raising, so at-least-once delivery cannot double-apply an event.
//
// Its signature is async and carries the event_type the durable table requires, so it
// cannot back the current sync, event_type-less WebhookEventStore interface. It is the
// ready component for the wiring wave that async-converts that interface (the same
// conversion wave 1 applied to the order store); it is not wired into the running
// handler here, so nothing changes behavior by adding it.
// ---------------------------------------------------------------------------

const WEBHOOK_EVENTS = "research_provider_webhook_events";
const UNIQUE_VIOLATION = "23505";

export interface DurableWebhookReplayGuard {
  seen(providerName: string, eventId: string): Promise<boolean>;
  record(providerName: string, eventId: string, eventType: string, at: Date): Promise<void>;
}

/** Map a seen provider event to an insertable research_provider_webhook_events row. */
export function webhookEventToRow(
  providerName: string,
  eventId: string,
  eventType: string,
  at: Date,
): {
  provider_name: string;
  event_id: string;
  event_type: string;
  received_at: string;
} {
  return {
    provider_name: providerName,
    event_id: eventId,
    event_type: eventType,
    received_at: at.toISOString(),
  };
}

export function createSupabaseWebhookReplayGuard(
  client: SupabaseClient = getSupabaseAdmin(),
): DurableWebhookReplayGuard {
  return {
    async seen(providerName, eventId) {
      const found = await client
        .from(WEBHOOK_EVENTS)
        .select("event_id")
        .eq("provider_name", providerName)
        .eq("event_id", eventId)
        .maybeSingle();
      if (found.error) throw new Error(`webhook event lookup failed: ${found.error.message}`);
      return found.data !== null && found.data !== undefined;
    },

    async record(providerName, eventId, eventType, at) {
      const inserted = await client
        .from(WEBHOOK_EVENTS)
        .insert(webhookEventToRow(providerName, eventId, eventType, at))
        .select();
      // The UNIQUE (provider_name, event_id) constraint is the replay guard. A duplicate
      // is the guard doing its job, not a failure to report, so it is absorbed. Any other
      // error is real and raised.
      if (inserted.error && inserted.error.code !== UNIQUE_VIOLATION) {
        throw new Error(`webhook event record failed: ${inserted.error.code ?? "unknown"}`);
      }
    },
  };
}
