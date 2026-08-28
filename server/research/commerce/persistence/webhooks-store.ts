// Track B, commerce activation: persistent storage for the webhook surface.
//
// The webhook handler requires one transaction-capable inbox+order store before a
// verified event may have an effect. This module intentionally does NOT pretend
// that the separate order projection and replay observer below provide that
// transaction. They remain compatibility/readiness components only; production
// webhook effects fail closed until a database function or equivalent transaction
// implements WebhookAtomicApplyStore.
//
// Two seams, and they are not symmetric, because wave 1 did not convert them the same
// way:
//
//   1. WebhookOrderStore is ASYNC (get/save return Promises), so it has a real
//      Supabase-backed implementation here, mapping the narrow webhook projection onto
//      research_orders. In-memory reference, Supabase impl, and resolver, exactly like
//      cart-store.ts.
//
//   2. WebhookEventStore and DurableWebhookReplayGuard offer separate observation
//      calls. Even when both are async and backed by a UNIQUE constraint, a check or
//      insert followed by a separate order save has a crash/race window and cannot
//      authorize an effect. The handler never uses these calls as atomic authority.
//
// Nothing here enables commerce. production-deps still fails every stateful surface
// closed. This is additive persistence wiring for a later wave.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderState } from "@shared/research/commerce";
import type {
  InMemoryWebhookAtomicStore,
  WebhookOrder,
  WebhookOrderStore,
  WebhookEventStore,
} from "../webhooks";
import {
  createInMemoryWebhookAtomicStore,
  createInMemoryWebhookEventStore,
} from "../webhooks";
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
): InMemoryWebhookAtomicStore {
  return createInMemoryWebhookAtomicStore(seed);
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
// It is a legacy observer/test seam, not authority for an order effect.
// ---------------------------------------------------------------------------

export {
  createInMemoryWebhookAtomicStore,
  createInMemoryWebhookEventStore,
} from "../webhooks";

export function resolveWebhookEventStore(): WebhookEventStore {
  // The handler deliberately ignores this object for order effects. A production
  // atomic adapter requires schema/RPC work outside this lane's allowed files.
  return createInMemoryWebhookEventStore();
}

// ---------------------------------------------------------------------------
// Durable Supabase replay observer (NOT an atomic apply store).
//
// Whether a (provider,event) row exists is answered by the database and insert
// races collapse under its UNIQUE constraint. This is useful observation, but it
// neither binds the id to a payload digest nor shares a transaction with the order
// write. It therefore MUST NOT be adapted to WebhookAtomicApplyStore and cannot
// make an inbound event orderable on its own.
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
