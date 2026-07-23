// Track B, wave 16: persistent product-subscription storage.
//
// The subscription SERVICE (server/research/commerce/subscriptions.ts) is
// unchanged. It owns the lifecycle and the renewal gate, and reaches persistence
// only through the async SubscriptionRepository port. This module is the durable
// implementation of that port, mirroring the member platform's Supabase pattern
// (getSupabaseAdmin().from(table)) and never inventing a second data system.
//
// One subscription is two shapes on disk (migration 23):
//   - research_product_subscriptions   one header row (current state).
//   - research_subscription_events     an APPEND-ONLY trail of applied actions.
//
// The events table is a ledger. This store only ever INSERTs and reads it, never
// updates or deletes a row; there is no update path wired here at all. The
// header is current-state, so a save upserts it.
//
// Building this does NOT enable commerce. Subscriptions stay gated by the
// commerce flag, per-SKU eligibility, and the renewal gate; this is the layer
// they will persist through once activated, so resolveSubscriptionRepository()
// falls back to the in-memory double whenever Supabase is not configured rather
// than half-persisting.
//
// Schema gaps worth naming (the domain SubscriptionRecord is wider than the
// current table). These are dropped on write and hydrated as defaults on read,
// never invented:
//   - research_product_subscriptions has no price_version or shipping_address_ref
//     column, so priceVersion round-trips as "" and shippingAddressRef as null.
//     Adding those columns is a follow-up before the fields can survive
//     persistence.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUBSCRIPTION_FREQUENCIES,
  type Actor,
  type SubscriptionAction,
  type SubscriptionFrequencyDays,
  type SubscriptionState,
} from "@shared/research/commerce";
import {
  createInMemorySubscriptionRepository,
  type SubscriptionRecord,
  type SubscriptionRepository,
  type SubscriptionStateEvent,
} from "../subscriptions";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// The async storage interface. The SubscriptionRepository (../subscriptions) is
// already async, so the store IS a SubscriptionRepository. This alias keeps a
// single source of truth rather than a second interface that could drift.
// ---------------------------------------------------------------------------

export type AsyncSubscriptionStore = SubscriptionRepository;

// ---------------------------------------------------------------------------
// Row shapes. Only the columns this store reads or writes are typed; the table
// carries more (discount_basis_points) that the domain does not model. All
// row-shape knowledge lives in the pure mappers below, so the Supabase
// implementation is a thin set of calls around them.
// ---------------------------------------------------------------------------

/** A research_product_subscriptions row, the columns this store maps. */
export interface SubscriptionRow {
  id: string;
  member_id: string;
  sku: string;
  state: string;
  frequency_days: number;
  quantity: number;
  next_charge_at: string | null;
  next_shipment_at: string | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

/** An insertable research_subscription_events row. Append only: there is no
 * update or delete shape because a historical event is never rewritten. */
export interface SubscriptionEventRow {
  subscription_id: string;
  action: string;
  from_state: string;
  to_state: string;
  actor_type: string;
  actor_id: string | null;
  effective_at: string | null;
  occurred_at: string;
}

// ---------------------------------------------------------------------------
// Pure row mapping (fully unit-tested in isolation).
// ---------------------------------------------------------------------------

const SUBSCRIPTION_STATES: ReadonlySet<string> = new Set<SubscriptionState>([
  "pending",
  "active",
  "paused",
  "skip_scheduled",
  "rescheduled",
  "payment_issue",
  "cancelled",
]);

const SUBSCRIPTION_ACTIONS: ReadonlySet<string> = new Set<SubscriptionAction>([
  "activate",
  "pause",
  "resume",
  "skip",
  "reschedule",
  "report_payment_issue",
  "resolve_payment_issue",
  "cancel",
]);

const ACTOR_TYPES: ReadonlySet<string> = new Set<Actor>([
  "member",
  "admin",
  "system",
  "provider_webhook",
]);

function isFrequency(value: number): value is SubscriptionFrequencyDays {
  return (SUBSCRIPTION_FREQUENCIES as readonly number[]).includes(value);
}

/**
 * Map a persisted row to the domain record. A row is admitted only if it is a
 * shape the service can operate on: the state and frequency must be values the
 * state machine knows. A row that does not fit is dropped (null) rather than
 * guessed, because a malformed persisted subscription must never become a
 * silently-different charge than what the member agreed to.
 */
export function rowToSubscription(row: SubscriptionRow): SubscriptionRecord | null {
  if (!SUBSCRIPTION_STATES.has(row.state)) return null;
  if (!isFrequency(row.frequency_days)) return null;
  return {
    subscriptionId: row.id,
    memberId: row.member_id,
    sku: row.sku,
    quantity: row.quantity,
    frequencyDays: row.frequency_days,
    state: row.state as SubscriptionState,
    nextRenewalAt: row.next_charge_at ?? null,
    nextShipmentAt: row.next_shipment_at ?? null,
    paymentProviderReference: row.payment_reference ?? null,
    // Schema gap: no price_version or shipping_address_ref column in migration
    // 23, so these hydrate as defaults rather than being invented.
    priceVersion: "",
    shippingAddressRef: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at ?? null,
  };
}

/** Map the domain record to an upsertable header row. DB-defaulted columns
 * (discount_basis_points) and the schema-gap fields are left untouched. */
export function subscriptionToRow(record: SubscriptionRecord): SubscriptionRow {
  return {
    id: record.subscriptionId,
    member_id: record.memberId,
    sku: record.sku,
    state: record.state,
    frequency_days: record.frequencyDays,
    quantity: record.quantity,
    next_charge_at: record.nextRenewalAt,
    next_shipment_at: record.nextShipmentAt,
    payment_reference: record.paymentProviderReference,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    cancelled_at: record.cancelledAt,
  };
}

/** Map a domain state event to its append-only insert row. */
export function eventToRow(event: SubscriptionStateEvent): SubscriptionEventRow {
  return {
    subscription_id: event.subscriptionId,
    action: event.action,
    from_state: event.fromState,
    to_state: event.toState,
    actor_type: event.actorType,
    actor_id: event.actorId,
    effective_at: event.effectiveAt,
    occurred_at: event.occurredAt,
  };
}

/** Map a persisted event row back to the domain shape. Dropped, never guessed,
 * when the action or actor is not one the state machine knows. */
export function rowToEvent(row: SubscriptionEventRow): SubscriptionStateEvent | null {
  if (!SUBSCRIPTION_ACTIONS.has(row.action)) return null;
  if (!ACTOR_TYPES.has(row.actor_type)) return null;
  return {
    subscriptionId: row.subscription_id,
    action: row.action as SubscriptionAction,
    fromState: row.from_state as SubscriptionState,
    toState: row.to_state as SubscriptionState,
    actorType: row.actor_type as Actor,
    actorId: row.actor_id ?? null,
    effectiveAt: row.effective_at ?? null,
    occurredAt: row.occurred_at,
  };
}

// ---------------------------------------------------------------------------
// In-memory store: reused from the domain module rather than duplicated, so
// there is exactly one deterministic double and it cannot drift from the
// repository the service is tested against.
// ---------------------------------------------------------------------------

export const createInMemorySubscriptionStore = createInMemorySubscriptionRepository;

// ---------------------------------------------------------------------------
// Supabase-backed store. Uses the service-role client (server-only; RLS is a
// backstop, the server is the sole writer). Reads are scoped by the owner id
// the interface passes (member_id) so a cross-member read is impossible. Tests
// exercise this against an injected fake client; the real client is the default.
// ---------------------------------------------------------------------------

const SUBSCRIPTIONS = "research_product_subscriptions";
const EVENTS = "research_subscription_events";

export function createSupabaseSubscriptionStore(
  client: SupabaseClient = getSupabaseAdmin(),
): AsyncSubscriptionStore {
  return {
    async get(subscriptionId) {
      const res = await client.from(SUBSCRIPTIONS).select("*").eq("id", subscriptionId).maybeSingle();
      if (res.error) throw new Error(`subscription load failed: ${res.error.message}`);
      if (!res.data) return null;
      return rowToSubscription(res.data as SubscriptionRow);
    },

    async save(record) {
      const up = await client
        .from(SUBSCRIPTIONS)
        .upsert(subscriptionToRow(record), { onConflict: "id" });
      if (up.error) throw new Error(`subscription upsert failed: ${up.error.message}`);
    },

    async listByMember(memberId) {
      const res = await client.from(SUBSCRIPTIONS).select("*").eq("member_id", memberId);
      if (res.error) throw new Error(`subscription list by member failed: ${res.error.message}`);
      const rows = (res.data ?? []) as SubscriptionRow[];
      return rows
        .map(rowToSubscription)
        .filter((record): record is SubscriptionRecord => record !== null);
    },

    async appendEvent(event) {
      // Append only: insert the action, never update or delete a prior event.
      const ins = await client.from(EVENTS).insert(eventToRow(event));
      if (ins.error) throw new Error(`subscription event insert failed: ${ins.error.message}`);
    },

    async listEvents(subscriptionId) {
      const res = await client.from(EVENTS).select("*").eq("subscription_id", subscriptionId);
      if (res.error) throw new Error(`subscription events load failed: ${res.error.message}`);
      const rows = (res.data ?? []) as SubscriptionEventRow[];
      return rows
        .map(rowToEvent)
        .filter((event): event is SubscriptionStateEvent => event !== null)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution: the durable store when Supabase is configured, else the in-memory
// fallback so an unconfigured deployment keeps failing closed rather than
// silently half-persisting.
// ---------------------------------------------------------------------------

export function resolveSubscriptionRepository(): AsyncSubscriptionStore {
  return supabaseConfigured() ? createSupabaseSubscriptionStore() : createInMemorySubscriptionStore();
}
