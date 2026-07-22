// Track B, wave 1: persistent refund and claim storage.
//
// The refund SERVICE (server/research/commerce/refunds.ts) is unchanged here.
// Persistence is the async boundary beneath it: this module implements the two
// repository ports the service declares (ClaimRepository and ClaimOrderRepository)
// against Supabase, mirroring the member platform's pattern
// (getSupabaseAdmin().from(table)) and never inventing a second data system.
//
// Two invariants shape the file.
//
// First, refund keys are an APPEND-ONLY ledger. A recorded (scope -> refund
// reference) row is never updated or deleted, and the store exposes no method
// that could. That is what stops a replayed refund from issuing a second one.
// The database backstops it with a primary key on `scope`.
//
// Second, tenant isolation. Every member-scoped read filters by the member id the
// interface passes in and by nothing else. The store never widens a read across
// owners and never sources an owner id from anywhere but the method argument.
//
// Nothing here enables commerce. The store is additive: production-deps still
// fails every stateful surface closed until the async wiring lands in a later wave.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderState } from "@shared/research/commerce";
import type { ClaimReason } from "@shared/research/commerce-api";
import {
  createInMemoryClaimOrderRepository,
  createInMemoryClaimRepository,
  type ClaimOrderRepository,
  type ClaimOrderView,
  type ClaimRecord,
  type ClaimRepository,
  type ClaimResolution,
  type ClaimState,
} from "../refunds";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// Table names and the columns each read projects.
// ---------------------------------------------------------------------------

const CLAIMS = "research_claims";
const REFUND_KEYS = "research_refund_keys";
const ORDERS = "research_orders";
const ORDER_LINES = "research_order_lines";

const CLAIM_COLS =
  "id, order_id, member_id, sku, lot_id, reason, state, resolution, evidence_refs, reviewed_by, submitted_at";
const ORDER_COLS =
  "id, member_id, state, captured_amount_cents, payment_reference, refunded_cents, last_idempotency_key";

// PostgREST unique-violation code, surfaced when a refund key is recorded twice.
const UNIQUE_VIOLATION = "23505";

// ---------------------------------------------------------------------------
// Row shapes (only the columns these repositories touch) and pure mappers.
// All row-shape knowledge lives here, so the Supabase implementations below are
// a thin set of calls around these functions, and the mapping is unit-tested in
// isolation exactly like cart-store's lineRowsToStoredCart.
// ---------------------------------------------------------------------------

/** A research_claims row, only the columns the refund service needs. */
export interface ClaimRow {
  id: string;
  order_id: string;
  member_id: string;
  sku: string;
  lot_id: string | null;
  reason: string;
  state: string;
  resolution: string | null;
  evidence_refs: string[] | null;
  reviewed_by: string | null;
  submitted_at: string;
}

/**
 * Map a persisted claim row to a ClaimRecord.
 *
 * SCHEMA GAP, noted on purpose: research_claims has no column for the claim's
 * operator `notes` (the member's submitted detail, or a reviewer note). It cannot
 * be persisted here, so a record read back from Supabase carries notes as "". The
 * wire DTO never exposed notes (see toClaimDto), so this changes no client-facing
 * behavior, but an admin listing open claims loses the note text. Adding a `notes
 * text` column to research_claims (a migration, out of this file's scope) is the
 * fix; until then the in-memory reference keeps notes and the Supabase store does
 * not.
 */
export function claimRowToRecord(row: ClaimRow): ClaimRecord {
  return {
    claimId: row.id,
    orderId: row.order_id,
    memberId: row.member_id,
    sku: row.sku,
    lotId: row.lot_id ?? null,
    reason: row.reason as ClaimReason,
    state: row.state as ClaimState,
    resolution: (row.resolution ?? null) as ClaimResolution,
    evidenceRefs: row.evidence_refs ?? [],
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by ?? null,
    notes: "",
  };
}

/**
 * Map a ClaimRecord to an insertable/upsertable research_claims row. Pure and
 * deterministic (no clock): the impl adds updated_at at write time so this stays
 * testable. `notes` has no destination column and is intentionally dropped (see
 * claimRowToRecord).
 */
export function claimRecordToRow(record: ClaimRecord): ClaimRow {
  return {
    id: record.claimId,
    order_id: record.orderId,
    member_id: record.memberId,
    sku: record.sku,
    lot_id: record.lotId,
    reason: record.reason,
    state: record.state,
    resolution: record.resolution,
    evidence_refs: record.evidenceRefs.slice(),
    reviewed_by: record.reviewedBy,
    submitted_at: record.submittedAt,
  };
}

/** A research_orders row, only the columns the claim/refund view needs. */
export interface ClaimOrderRow {
  id: string;
  member_id: string;
  state: string;
  captured_amount_cents: number | null;
  payment_reference: string | null;
  refunded_cents: number;
  last_idempotency_key: string | null;
}

/** A research_order_lines row. The table has no lot column (see below). */
export interface ClaimOrderLineRow {
  sku: string;
}

/**
 * Map an order row plus its line rows to the ClaimOrderView the refund service
 * reads.
 *
 * `capturedAmountCents` is null in the schema until a capture lands; the view
 * treats "nothing captured" as 0 so the refundable arithmetic in the service is
 * well defined. `lastAppliedIdempotencyKey` is optional on the view, so a null
 * column maps to undefined rather than null.
 *
 * SCHEMA NOTE: research_order_lines carries no lot_id (a unit's lot lives in
 * research_lot_allocations, a separate concern), so every line's lotId is null
 * from this view. The refund service uses lotId only to stamp the claim, and it
 * never restocks a lot, so a null lot is correct and inert here.
 */
export function orderRowToView(row: ClaimOrderRow, lines: readonly ClaimOrderLineRow[]): ClaimOrderView {
  return {
    orderId: row.id,
    memberId: row.member_id,
    state: row.state as OrderState,
    capturedAmountCents: row.captured_amount_cents ?? 0,
    paymentReference: row.payment_reference ?? null,
    refundedCents: row.refunded_cents,
    lines: lines.map((l) => ({ sku: l.sku, lotId: null })),
    lastAppliedIdempotencyKey: row.last_idempotency_key ?? undefined,
  };
}

/**
 * Map a ClaimOrderView back to the subset of research_orders columns the refund
 * flow changes: the state advance to `refunded`, the accumulated refunded total,
 * and the last money idempotency key. It never writes payment_reference or the
 * captured amount, which the capture set and a refund does not touch, so the
 * paid-needs-provider-reference constraint is never at risk from this path. Pure
 * (the impl adds updated_at at write time).
 */
export function orderViewToUpdateRow(view: ClaimOrderView): {
  state: string;
  refunded_cents: number;
  last_idempotency_key: string | null;
} {
  return {
    state: view.state,
    refunded_cents: view.refundedCents,
    last_idempotency_key: view.lastAppliedIdempotencyKey ?? null,
  };
}

// ---------------------------------------------------------------------------
// In-memory references. The service module already ships correct in-memory
// doubles for both ports, so they are reused rather than re-implemented here,
// keeping a single source of truth for the reference behavior. Re-exported so
// the resolvers and tests have one import site.
// ---------------------------------------------------------------------------

export { createInMemoryClaimRepository, createInMemoryClaimOrderRepository };

// ---------------------------------------------------------------------------
// Supabase-backed ClaimRepository. Uses the service-role client (server-only;
// RLS is a backstop, the server is the sole writer). Tested against an injected
// fake client; the real client is the default.
// ---------------------------------------------------------------------------

export function createSupabaseClaimRepository(client: SupabaseClient = getSupabaseAdmin()): ClaimRepository {
  return {
    async get(claimId) {
      const res = await client.from(CLAIMS).select(CLAIM_COLS).eq("id", claimId).maybeSingle();
      if (res.error) throw new Error(`claim load failed: ${res.error.message}`);
      return res.data ? claimRowToRecord(res.data as ClaimRow) : null;
    },

    async save(claim) {
      const row = { ...claimRecordToRow(claim), updated_at: new Date().toISOString() };
      const res = await client.from(CLAIMS).upsert(row, { onConflict: "id" });
      if (res.error) throw new Error(`claim save failed: ${res.error.message}`);
    },

    async listByMember(memberId) {
      // Tenant scope: the member id is the only filter, taken from the argument.
      const res = await client.from(CLAIMS).select(CLAIM_COLS).eq("member_id", memberId);
      if (res.error) throw new Error(`claims by member failed: ${res.error.message}`);
      return ((res.data ?? []) as ClaimRow[]).map(claimRowToRecord);
    },

    async listByOrder(orderId) {
      const res = await client.from(CLAIMS).select(CLAIM_COLS).eq("order_id", orderId);
      if (res.error) throw new Error(`claims by order failed: ${res.error.message}`);
      return ((res.data ?? []) as ClaimRow[]).map(claimRowToRecord);
    },

    async listOpen() {
      // Admin-wide (no tenant scope, by contract): every claim not yet resolved
      // or declined. The DB is the source of truth for "closed".
      const res = await client.from(CLAIMS).select(CLAIM_COLS).not("state", "in", "(resolved,declined)");
      if (res.error) throw new Error(`open claims failed: ${res.error.message}`);
      return ((res.data ?? []) as ClaimRow[]).map(claimRowToRecord);
    },

    async hasRefundKey(scope) {
      const res = await client.from(REFUND_KEYS).select("scope").eq("scope", scope).maybeSingle();
      if (res.error) throw new Error(`refund key lookup failed: ${res.error.message}`);
      return res.data !== null && res.data !== undefined;
    },

    async recordRefundKey(scope, refundReference) {
      // Append-only. The insert is the write, and a duplicate scope is a unique
      // violation the DB raises, not an app check: a concurrent second record of
      // the same key is absorbed as a no-op so the ledger never double-writes and
      // no refund can move twice. There is deliberately no update or delete path.
      const res = await client.from(REFUND_KEYS).insert({ scope, refund_reference: refundReference }).select();
      if (res.error && res.error.code !== UNIQUE_VIOLATION) {
        throw new Error(`refund key record failed: ${res.error.message ?? res.error.code ?? "unknown"}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed ClaimOrderRepository. The refund flow's window onto an order:
// read the money-and-state slice, write back only the columns a refund changes.
// ---------------------------------------------------------------------------

export function createSupabaseClaimOrderRepository(
  client: SupabaseClient = getSupabaseAdmin(),
): ClaimOrderRepository {
  return {
    async get(orderId) {
      const order = await client.from(ORDERS).select(ORDER_COLS).eq("id", orderId).maybeSingle();
      if (order.error) throw new Error(`order load failed: ${order.error.message}`);
      if (!order.data) return null;
      const lines = await client.from(ORDER_LINES).select("sku").eq("order_id", orderId);
      if (lines.error) throw new Error(`order lines load failed: ${lines.error.message}`);
      return orderRowToView(order.data as ClaimOrderRow, (lines.data ?? []) as ClaimOrderLineRow[]);
    },

    async save(order) {
      // An order always exists before a claim references it, so this is an UPDATE
      // by id of the refund-touched columns. It never inserts an order and never
      // rewrites the line rows, which this view does not own.
      const patch = { ...orderViewToUpdateRow(order), updated_at: new Date().toISOString() };
      const res = await client.from(ORDERS).update(patch).eq("id", order.orderId);
      if (res.error) throw new Error(`order save failed: ${res.error.message}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution: the real store when Supabase is configured, else the in-memory
// reference. The wiring that consumes these stays behind the commerce flag, so
// an unconfigured deployment keeps failing closed rather than silently persisting.
// ---------------------------------------------------------------------------

export function resolveClaimRepository(): ClaimRepository {
  return supabaseConfigured() ? createSupabaseClaimRepository() : createInMemoryClaimRepository();
}

export function resolveClaimOrderRepository(): ClaimOrderRepository {
  return supabaseConfigured() ? createSupabaseClaimOrderRepository() : createInMemoryClaimOrderRepository();
}
