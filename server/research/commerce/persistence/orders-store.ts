// Track B, commerce activation: persistent order storage.
//
// The order SERVICE (server/research/commerce/orders.ts) is unchanged. It owns
// the lifecycle (authorize, hold for review, approve, capture, cancel, fulfil)
// and reaches persistence only through the async OrderRepository port. This
// module is the durable implementation of that port, mirroring the member
// platform's Supabase pattern (getSupabaseAdmin().from(table)) and never
// inventing a second data system.
//
// One order is three shapes on disk:
//   - research_orders            one header row (current state).
//   - research_order_lines       its line items (replaced together on save).
//   - research_order_state_events  an APPEND-ONLY trail of state transitions.
//
// The state-events table is a ledger. This store only ever INSERTs and reads
// it, never updates or deletes a row, and the database enforces the same by
// having no update path wired here. The header and its lines are current-state,
// not a ledger, so a save replaces the lines and upserts the header.
//
// Building this does NOT enable commerce. Transactions stay gated by the
// commerce flag and per-SKU eligibility; this is the layer they will persist
// through once activated, so resolveOrderRepository() falls back to an in-memory
// double whenever Supabase is not configured rather than half-persisting.
//
// Schema gaps worth naming (the domain OrderRecord is wider than the current
// three tables). These are inserted best-effort or dropped, never invented:
//   - research_order_lines requires unit_price_cents and fulfillment_owner, which
//     OrderLineRecord does not carry. unit_price_cents is derived from the line
//     total and quantity (the implied per-unit price, not read back into the
//     domain). fulfillment_owner is taken from the order's shipment owner when it
//     is unambiguous, else it falls back to "xenios"; neither column is read back.
//   - research_orders has no column for shipments, approvedBy, approvedAt,
//     cancellationReason, or authorizationReleaseFailed, so those optional
//     OrderRecord fields are not persisted by this schema version and come back
//     absent after a round trip. Adding those columns (or a metadata jsonb) is a
//     follow-up before those fields can survive persistence.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderState } from "@shared/research/commerce";
import type {
  OrderLineRecord,
  OrderRecord,
  OrderRepository,
} from "../orders";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// The async storage interface. The OrderRepository (../orders) is already async
// (every method returns a Promise), so the store IS an OrderRepository. This
// alias keeps a single source of truth rather than a second interface that could
// drift from the service's declared contract.
// ---------------------------------------------------------------------------

export type AsyncOrderStore = OrderRepository;

// ---------------------------------------------------------------------------
// Row shapes. Only the columns this store reads or writes are typed; the tables
// carry more (refunded_cents, placed_at, checkout defaults) that the domain
// does not model. All row-shape knowledge lives in the pure mappers below, so
// the Supabase implementation is a thin set of calls around them.
// ---------------------------------------------------------------------------

/** A research_orders row, the columns this store maps. */
export interface OrderHeaderRow {
  id: string;
  member_id: string;
  state: string;
  subtotal_cents: number;
  shipping_cents: number;
  store_credit_applied_cents: number;
  total_cents: number;
  authorized_amount_cents: number | null;
  captured_amount_cents: number | null;
  payment_reference: string | null;
  /** Client-supplied checkout key, written by the checkout flow, read here. */
  checkout_idempotency_key: string | null;
  last_idempotency_key: string | null;
  review_triggers: string[] | null;
  created_at: string;
  updated_at: string;
}

/** An insertable research_orders row. Narrower than the read row on purpose: it
 * carries only what the domain OrderRecord can supply, leaving DB-defaulted and
 * checkout-owned columns untouched. */
export interface OrderHeaderInsert {
  id: string;
  member_id: string;
  state: string;
  subtotal_cents: number;
  shipping_cents: number;
  store_credit_applied_cents: number;
  total_cents: number;
  authorized_amount_cents: number | null;
  captured_amount_cents: number | null;
  payment_reference: string | null;
  last_idempotency_key: string | null;
  review_triggers: string[];
  created_at: string;
  updated_at: string;
}

/** A research_order_lines row, the columns this store maps. */
export interface OrderLineRow {
  sku: string;
  display_name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  fulfillment_owner: string;
}

/** An insertable research_order_lines row, scoped to its order. */
export interface OrderLineInsert extends OrderLineRow {
  order_id: string;
}

/** An insertable research_order_state_events row. Append only: there is no
 * update or delete shape because a historical event is never rewritten. */
export interface OrderStateEventInsert {
  order_id: string;
  from_state: string;
  to_state: string;
  actor_type: string;
  actor_id: string | null;
  provider_reference: string | null;
  idempotency_key: string | null;
}

// ---------------------------------------------------------------------------
// Pure row mapping (fully unit-tested in isolation).
// ---------------------------------------------------------------------------

/** Map persisted line rows to the domain lines. Only the four columns the
 * domain models are read; unit_price_cents and fulfillment_owner are storage
 * detail and are not surfaced back into OrderLineRecord. */
export function lineRowsToOrderLines(rows: readonly OrderLineRow[]): OrderLineRecord[] {
  return rows.map((row) => ({
    sku: row.sku,
    displayName: row.display_name,
    quantity: row.quantity,
    lineTotalCents: row.line_total_cents,
  }));
}

/**
 * The order's fulfilment owner for a line, when it can be told without guessing.
 * An order that ships from a single owner names that owner; a mixed or unknown
 * order has no per-line owner in the domain, so it falls back to "xenios" (the
 * house owner). The column is never read back into the domain, so this fallback
 * is a NOT NULL filler, not a business assertion.
 */
export function resolveFulfillmentOwner(order: OrderRecord): "mitch" | "xenios" {
  const owners = new Set((order.shipments ?? []).map((s) => s.owner));
  if (owners.size === 1) {
    return owners.values().next().value as "mitch" | "xenios";
  }
  return "xenios";
}

/** Map the domain lines to insertable rows for an order id. unit_price_cents is
 * the implied per-unit price (line total over quantity), never read from a
 * client and never surfaced back. */
export function orderToLineRows(orderId: string, order: OrderRecord): OrderLineInsert[] {
  const owner = resolveFulfillmentOwner(order);
  return order.lines.map((line) => ({
    order_id: orderId,
    sku: line.sku,
    display_name: line.displayName,
    quantity: line.quantity,
    unit_price_cents: line.quantity > 0 ? Math.round(line.lineTotalCents / line.quantity) : 0,
    line_total_cents: line.lineTotalCents,
    fulfillment_owner: owner,
  }));
}

/** Map a header row plus its line rows to the domain OrderRecord. Optional
 * amount columns are omitted from the record when null, so a round trip matches
 * the in-memory reference under a value comparison. */
export function headerRowToOrder(row: OrderHeaderRow, lineRows: readonly OrderLineRow[]): OrderRecord {
  const record: OrderRecord = {
    orderId: row.id,
    memberId: row.member_id,
    state: row.state as OrderState,
    lines: lineRowsToOrderLines(lineRows),
    totals: {
      subtotalCents: row.subtotal_cents,
      shippingCents: row.shipping_cents,
      storeCreditAppliedCents: row.store_credit_applied_cents,
      totalCents: row.total_cents,
    },
    providerReference: row.payment_reference ?? null,
    lastIdempotencyKey: row.last_idempotency_key ?? null,
    reviewTriggers: row.review_triggers ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.authorized_amount_cents !== null && row.authorized_amount_cents !== undefined) {
    record.authorizedAmountCents = row.authorized_amount_cents;
  }
  if (row.captured_amount_cents !== null && row.captured_amount_cents !== undefined) {
    record.capturedAmountCents = row.captured_amount_cents;
  }
  return record;
}

/** Map the domain OrderRecord to an insertable header row. Checkout-owned
 * (checkout_idempotency_key) and DB-defaulted (refunded_cents, placed_at)
 * columns are left untouched rather than fabricated here. */
export function orderToHeaderRow(order: OrderRecord): OrderHeaderInsert {
  return {
    id: order.orderId,
    member_id: order.memberId,
    state: order.state,
    subtotal_cents: order.totals.subtotalCents,
    shipping_cents: order.totals.shippingCents,
    store_credit_applied_cents: order.totals.storeCreditAppliedCents,
    total_cents: order.totals.totalCents,
    authorized_amount_cents: order.authorizedAmountCents ?? null,
    captured_amount_cents: order.capturedAmountCents ?? null,
    payment_reference: order.providerReference,
    last_idempotency_key: order.lastIdempotencyKey,
    review_triggers: order.reviewTriggers,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };
}

/**
 * Build the append-only state-event row for a transition into the order's
 * current state. The OrderRepository.save signature does not carry the actor
 * that caused the transition, so actor_type records "system" (the neutral
 * actor) and actor_id is null; the provider reference and idempotency key are
 * taken from the record. This trail is history, never read back into the domain.
 */
export function orderToStateEventRow(order: OrderRecord, fromState: string): OrderStateEventInsert {
  return {
    order_id: order.orderId,
    from_state: fromState,
    to_state: order.state,
    actor_type: "system",
    actor_id: null,
    provider_reference: order.providerReference,
    idempotency_key: order.lastIdempotencyKey,
  };
}

// ---------------------------------------------------------------------------
// In-memory store: the deterministic double for tests and the fallback when
// Supabase is not configured. Copies on the way in and out so a caller cannot
// mutate stored state through a held reference.
// ---------------------------------------------------------------------------

function cloneOrder(order: OrderRecord): OrderRecord {
  return {
    ...order,
    lines: order.lines.map((line) => ({ ...line })),
    totals: { ...order.totals },
    reviewTriggers: [...order.reviewTriggers],
    shipments: order.shipments ? order.shipments.map((s) => ({ ...s })) : order.shipments,
  };
}

export function createInMemoryOrderStore(seed: readonly OrderRecord[] = []): AsyncOrderStore {
  const rows = new Map<string, OrderRecord>();
  seed.forEach((order) => rows.set(order.orderId, cloneOrder(order)));
  const all = (): OrderRecord[] => Array.from(rows.values()).map(cloneOrder);
  return {
    async get(orderId) {
      const found = rows.get(orderId);
      return found ? cloneOrder(found) : null;
    },
    async save(order) {
      rows.set(order.orderId, cloneOrder(order));
    },
    async listByMember(memberId) {
      return all().filter((order) => order.memberId === memberId);
    },
    async findByIdempotencyKey(memberId, key) {
      const hit = all().find((order) => order.memberId === memberId && order.lastIdempotencyKey === key);
      return hit ?? null;
    },
    async listAll() {
      return all();
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store. Uses the service-role client (server-only; RLS is a
// backstop, the server is the sole writer). Reads are scoped by the owner id the
// interface passes (member_id) so a cross-member read is impossible; listAll is
// the one deliberate admin cross-member path (the review queue has no single
// member). Tests exercise this against an injected fake client; the real client
// is the default.
// ---------------------------------------------------------------------------

const ORDERS = "research_orders";
const LINES = "research_order_lines";
const EVENTS = "research_order_state_events";

export function createSupabaseOrderStore(
  client: SupabaseClient = getSupabaseAdmin(),
): AsyncOrderStore {
  async function loadLines(orderId: string): Promise<OrderLineRow[]> {
    const res = await client
      .from(LINES)
      .select("sku, display_name, quantity, unit_price_cents, line_total_cents, fulfillment_owner")
      .eq("order_id", orderId);
    if (res.error) throw new Error(`order lines load failed: ${res.error.message}`);
    return (res.data ?? []) as OrderLineRow[];
  }

  async function hydrate(header: OrderHeaderRow): Promise<OrderRecord> {
    return headerRowToOrder(header, await loadLines(header.id));
  }

  return {
    async get(orderId) {
      const res = await client.from(ORDERS).select("*").eq("id", orderId).maybeSingle();
      if (res.error) throw new Error(`order load failed: ${res.error.message}`);
      if (!res.data) return null;
      return hydrate(res.data as OrderHeaderRow);
    },

    async save(order) {
      // The prior state is read first so the append-only trail records the real
      // from -> to transition. A save that does not change state records nothing.
      const prior = await client.from(ORDERS).select("state").eq("id", order.orderId).maybeSingle();
      if (prior.error) throw new Error(`order state read failed: ${prior.error.message}`);
      const priorState = prior.data ? (prior.data as { state: string }).state : null;

      const up = await client.from(ORDERS).upsert(orderToHeaderRow(order), { onConflict: "id" });
      if (up.error) throw new Error(`order upsert failed: ${up.error.message}`);

      // Lines are current-state, not a ledger, so they are replaced together.
      const del = await client.from(LINES).delete().eq("order_id", order.orderId);
      if (del.error) throw new Error(`order lines clear failed: ${del.error.message}`);
      const lineRows = orderToLineRows(order.orderId, order);
      if (lineRows.length > 0) {
        const ins = await client.from(LINES).insert(lineRows);
        if (ins.error) throw new Error(`order lines insert failed: ${ins.error.message}`);
      }

      // Append-only: insert the transition, never update or delete a prior event.
      if (priorState === null || priorState !== order.state) {
        const ev = await client
          .from(EVENTS)
          .insert(orderToStateEventRow(order, priorState ?? order.state));
        if (ev.error) throw new Error(`order state event insert failed: ${ev.error.message}`);
      }
    },

    async listByMember(memberId) {
      const res = await client.from(ORDERS).select("*").eq("member_id", memberId);
      if (res.error) throw new Error(`order list by member failed: ${res.error.message}`);
      const headers = (res.data ?? []) as OrderHeaderRow[];
      const out: OrderRecord[] = [];
      for (const header of headers) out.push(await hydrate(header));
      return out;
    },

    async findByIdempotencyKey(memberId, key) {
      // Scoped to the member first, so a matching key on another member's order
      // is never returned. The match then honors both the checkout key and the
      // last-applied key columns.
      const res = await client.from(ORDERS).select("*").eq("member_id", memberId);
      if (res.error) throw new Error(`order idempotency lookup failed: ${res.error.message}`);
      const headers = (res.data ?? []) as OrderHeaderRow[];
      const match = headers.find(
        (header) => header.last_idempotency_key === key || header.checkout_idempotency_key === key,
      );
      return match ? hydrate(match) : null;
    },

    async listAll() {
      const res = await client.from(ORDERS).select("*");
      if (res.error) throw new Error(`order list all failed: ${res.error.message}`);
      const headers = (res.data ?? []) as OrderHeaderRow[];
      const out: OrderRecord[] = [];
      for (const header of headers) out.push(await hydrate(header));
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution: the durable store when Supabase is configured, else the in-memory
// fallback so an unconfigured deployment keeps failing closed rather than
// silently half-persisting.
// ---------------------------------------------------------------------------

export function resolveOrderRepository(): AsyncOrderStore {
  return supabaseConfigured() ? createSupabaseOrderStore() : createInMemoryOrderStore();
}
