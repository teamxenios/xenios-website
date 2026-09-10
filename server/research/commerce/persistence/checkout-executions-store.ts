// Persistent storage for durable checkout executions and the payment webhook
// inbox, over the candidate migration
// supabase/candidates/20260909150000_research_checkout_executions.sql.
//
// Two implementations behind the coordinator's port
// (CanonicalCheckoutExecutionStore) plus the webhook processor's lookups and
// inbox:
//   - the in-memory reference, correct within one process, for tests and for
//     compositions where Supabase is not configured;
//   - the Supabase-backed store, whose transitions are the database functions
//     (version compare-and-swap inside Postgres), so two instances retrying the
//     same execution cannot both own an external effect. The commit functions
//     move the canonical order, reservations and store credit in ONE database
//     transaction; this adapter never composes those writes itself.
//
// Nothing here enables commerce or mounts the coordinator; the resolver still
// returns Disabled for the live provider until the composition is qualified.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CheckoutExecutionPhase, CheckoutExecutionRecord, ProviderExecutionResult } from "@shared/research/durable-checkout-execution";
import type { ReservationSeam } from "../checkout";
import type { CanonicalCheckoutExecutionStore } from "../durable-checkout-executor";
import type { OrderRepository } from "../orders";
import type { WebhookExecutionInbox, WebhookExecutionInboxEvent, WebhookExecutionLookup } from "../webhook-execution-processor";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// Row mapping (pure). All row-shape knowledge lives here.
// ---------------------------------------------------------------------------

export interface CheckoutExecutionRow {
  id: string;
  member_id: string;
  request_key: string;
  request_body_sha256: string;
  order_id: string;
  phase: string;
  version: number;
  provider_reference: string | null;
  amount_cents: number;
  currency: string;
  payment_method_reference: string;
  quote_fingerprint: string;
  price_version: string | null;
  authorization_key: string;
  capture_key: string;
  cancel_key: string;
  reservation_ids: string[];
  last_provider_result: unknown;
  authorization_first_attempted_at: string | null;
  local_commit_failure?: string | null;
  created_at: string;
  updated_at?: string;
  committed_at?: string | null;
  settled_at: string | null;
}

export const CHECKOUT_EXECUTION_PHASES: readonly CheckoutExecutionPhase[] = [
  "reserved",
  "authorizing",
  "action_required",
  "authorized",
  "capturing",
  "captured",
  "committed",
  "cancelling",
  "cancelled",
  "reconciliation_required",
];

/** What creation binds beyond the coordinator's record: the exact request and the approved price version. */
export interface CheckoutExecutionCreate extends CheckoutExecutionRecord {
  requestBodySha256: string;
  priceVersion: string | null;
}

export function requestBodySha256(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body), "utf8").digest("hex");
}

export function rowToExecution(row: CheckoutExecutionRow): CheckoutExecutionRecord | null {
  if (!(CHECKOUT_EXECUTION_PHASES as readonly string[]).includes(row.phase)) return null;
  if (row.currency !== "usd") return null;
  return {
    executionId: row.id,
    requestKey: row.request_key,
    phase: row.phase as CheckoutExecutionPhase,
    version: Number(row.version),
    providerReference: row.provider_reference,
    orderId: row.order_id,
    memberId: row.member_id,
    amountCents: Number(row.amount_cents),
    currency: "usd",
    paymentMethodReference: row.payment_method_reference,
    quoteFingerprint: row.quote_fingerprint,
    authorizationKey: row.authorization_key,
    captureKey: row.capture_key,
    cancelKey: row.cancel_key,
    reservationIds: [...(row.reservation_ids ?? [])],
    createdAt: row.created_at,
    authorizationAttemptedAt: row.authorization_first_attempted_at ?? null,
    settledAt: row.settled_at ?? null,
    lastProviderResult: ((row as { last_provider_result?: unknown }).last_provider_result as ProviderExecutionResult | null | undefined) ?? null,
  };
}

export function executionToInsertRow(record: CheckoutExecutionCreate): Omit<CheckoutExecutionRow, "updated_at" | "committed_at" | "last_provider_result" | "local_commit_failure"> {
  return {
    id: record.executionId,
    member_id: record.memberId,
    request_key: record.requestKey,
    request_body_sha256: record.requestBodySha256,
    order_id: record.orderId,
    phase: record.phase,
    version: record.version,
    provider_reference: record.providerReference,
    amount_cents: record.amountCents,
    currency: record.currency,
    payment_method_reference: record.paymentMethodReference,
    quote_fingerprint: record.quoteFingerprint,
    price_version: record.priceVersion,
    authorization_key: record.authorizationKey,
    capture_key: record.captureKey,
    cancel_key: record.cancelKey,
    reservation_ids: [...record.reservationIds],
    authorization_first_attempted_at: record.authorizationAttemptedAt,
    settled_at: record.settledAt,
    created_at: record.createdAt,
  };
}

/** A creation that lost a race on (member, request key), or reused a request key with other details. */
export class CheckoutExecutionConflict extends Error {
  constructor(readonly code: "request_key_reused" | "duplicate_execution") {
    super(`checkout execution conflict: ${code}`);
    this.name = "CheckoutExecutionConflict";
  }
}

export interface CheckoutExecutionRepository extends CanonicalCheckoutExecutionStore, WebhookExecutionLookup {
  /**
   * Persist the recoverable intent BEFORE any external effect. Idempotent for
   * the exact same request: the existing record is returned. The same request
   * key with a different body digest, order or money is a conflict.
   */
  create(record: CheckoutExecutionCreate): Promise<CheckoutExecutionRecord>;
  /** Whether a retry carries the exact request the execution was created for. */
  verifyRequest(memberId: string, requestKey: string, requestBodySha256: string): Promise<"match" | "conflict" | "missing">;
}

const PHASE_FOR_RESULT: Record<ProviderExecutionResult["kind"], CheckoutExecutionPhase> = {
  authorized: "authorized",
  captured: "captured",
  action_required: "action_required",
  cancelled: "cancelled",
  refused: "reconciliation_required",
  unknown: "reconciliation_required",
};

// ---------------------------------------------------------------------------
// In-memory reference. Same transition semantics as the SQL functions, minus
// the canonical order/reservation/credit effects, which the SQL commit owns.
// ---------------------------------------------------------------------------

/**
 * The canonical effects the SQL commit functions perform in the same
 * transaction as the execution transition. The in-memory reference applies
 * them through these seams (not atomically: a test double, never production)
 * so a connected local journey shows the customer-visible order outcome and
 * the hold settlement exactly as the database will.
 */
export interface InMemoryCheckoutExecutionEffects {
  orders?: Pick<OrderRepository, "get" | "save">;
  inventory?: Pick<ReservationSeam, "release" | "finalize">;
}

/**
 * An order-level violation of the commit's preconditions. The SQL function
 * RAISES for these (aborting the transaction and changing nothing), so the
 * reference throws too; only a reservation-set failure parks the execution in
 * reconciliation_required with the capture evidence retained.
 */
export class CheckoutCommitPrecondition extends Error {}

const CAPTURABLE_ORDER_STATES = ["checkout_pending", "payment_authorized", "manual_review", "approved", "payment_captured"];

export function createInMemoryCheckoutExecutionStore(options: { now?: () => Date; effects?: InMemoryCheckoutExecutionEffects } = {}): CheckoutExecutionRepository & { snapshot(): CheckoutExecutionRecord[] } {
  const rows = new Map<string, CheckoutExecutionCreate>();
  const now = options.now ?? (() => new Date());
  const effects = options.effects ?? {};
  // Mirrors research_checkout_execution_commit_captured's order and reservation writes.
  const applyCaptured = async (record: CheckoutExecutionCreate) => {
    if (effects.orders) {
      const order = await effects.orders.get(record.orderId);
      // The SQL commit's order preconditions, in the same order, each raising.
      if (!order || order.memberId !== record.memberId) throw new CheckoutCommitPrecondition(`execution ${record.executionId} names an order that is not the member's`);
      if (order.totals.totalCents !== record.amountCents) {
        throw new CheckoutCommitPrecondition(`order total ${order.totals.totalCents} does not match captured amount ${record.amountCents}`);
      }
      if (order.providerReference !== null && order.providerReference !== record.providerReference) {
        throw new CheckoutCommitPrecondition(`order ${record.orderId} already carries another payment reference`);
      }
      if (!CAPTURABLE_ORDER_STATES.includes(order.state)) {
        throw new CheckoutCommitPrecondition(`order ${record.orderId} cannot be captured from ${order.state}`);
      }
      if (order.state !== "payment_captured") {
        await effects.orders.save({
          ...order,
          state: "payment_captured",
          providerReference: record.providerReference,
          authorizedAmountCents: order.authorizedAmountCents ?? record.amountCents,
          capturedAmountCents: record.amountCents,
          lastIdempotencyKey: record.captureKey,
          updatedAt: now().toISOString(),
        });
      }
    }
    if (effects.inventory && record.reservationIds.length > 0) await effects.inventory.finalize(record.reservationIds);
  };
  // Mirrors research_checkout_execution_commit_cancelled's order and reservation writes.
  const applyCancelled = async (record: CheckoutExecutionCreate) => {
    // The SQL requires POSITIVE zero-capture evidence before any local
    // settlement: absent evidence raises there, so it raises here too. A
    // cancellation that cannot point at a provider answer saying nothing was
    // taken is not a cancellation anyone may act on.
    const evidence = record.lastProviderResult;
    if (!evidence || evidence.kind !== "cancelled" || evidence.capturedAmountCents !== 0) {
      throw new CheckoutCommitPrecondition(`execution ${record.executionId} lacks zero-capture evidence`);
    }
    if (effects.orders) {
      const order = await effects.orders.get(record.orderId);
      if (!order || order.memberId !== record.memberId) throw new CheckoutCommitPrecondition(`execution ${record.executionId} names an order that is not the member's`);
      if (["checkout_pending", "payment_authorized", "manual_review", "approved"].includes(order.state)) {
        await effects.orders.save({ ...order, state: "cancelled", lastIdempotencyKey: record.cancelKey, updatedAt: now().toISOString() });
      } else if (order.state !== "cancelled") {
        throw new CheckoutCommitPrecondition(`order ${record.orderId} cannot be cancelled from ${order.state}`);
      }
    }
    if (effects.inventory && record.reservationIds.length > 0) await effects.inventory.release(record.reservationIds);
  };
  const clone = (r: CheckoutExecutionCreate): CheckoutExecutionRecord => {
    const { requestBodySha256: _digest, priceVersion: _price, ...record } = r;
    return { ...record, reservationIds: [...record.reservationIds] };
  };
  const cas = (executionId: string, expected: number, next: (current: CheckoutExecutionCreate) => Partial<CheckoutExecutionCreate> | null) => {
    const current = rows.get(executionId);
    if (!current || current.version !== expected) return null;
    const patch = next(current);
    if (patch === null) return null;
    const updated = { ...current, ...patch, version: expected + 1 };
    rows.set(executionId, updated);
    return clone(updated);
  };
  return {
    authority: "canonical_checkout_transaction_v1",
    async create(record) {
      for (const existing of rows.values()) {
        if (existing.memberId === record.memberId && existing.requestKey === record.requestKey) {
          // Changed details under the same key are a reuse; the same request
          // bound to another freshly minted order is a duplicate submission
          // that must fold into the existing execution.
          if (existing.requestBodySha256 !== record.requestBodySha256 || existing.amountCents !== record.amountCents) {
            throw new CheckoutExecutionConflict("request_key_reused");
          }
          if (existing.orderId !== record.orderId || existing.executionId !== record.executionId) throw new CheckoutExecutionConflict("duplicate_execution");
          return clone(existing);
        }
        if (existing.executionId === record.executionId) throw new CheckoutExecutionConflict("duplicate_execution");
      }
      rows.set(record.executionId, { ...record, reservationIds: [...record.reservationIds] });
      return clone(rows.get(record.executionId)!);
    },
    async getForMember(memberId, requestKey) {
      for (const r of rows.values()) if (r.memberId === memberId && r.requestKey === requestKey) return clone(r);
      return null;
    },
    async verifyRequest(memberId, requestKey, digest) {
      for (const r of rows.values()) {
        if (r.memberId === memberId && r.requestKey === requestKey) return r.requestBodySha256 === digest ? "match" : "conflict";
      }
      return "missing";
    },
    async findByProviderReference(reference) {
      for (const r of rows.values()) if (r.providerReference === reference) return clone(r);
      return null;
    },
    async findByOrder(orderId) {
      for (const r of rows.values()) if (r.orderId === orderId) return clone(r);
      return null;
    },
    async claim(executionId, expected, phase) {
      if (!["authorizing", "capturing", "cancelling"].includes(phase)) throw new Error(`${phase} is not a claimable phase`);
      return cas(executionId, expected, (current) => ({
        phase,
        // The first authorizing claim is the first attempt; later claims never move it.
        authorizationAttemptedAt: phase === "authorizing" ? (current.authorizationAttemptedAt ?? now().toISOString()) : current.authorizationAttemptedAt,
      }));
    },
    async recordProvider(executionId, expected, result) {
      return cas(executionId, expected, (current) => {
        const reference = "providerReference" in result ? result.providerReference : null;
        if (current.providerReference !== null && reference !== null && reference !== current.providerReference) return null;
        return { phase: PHASE_FOR_RESULT[result.kind], providerReference: current.providerReference ?? reference, lastProviderResult: result };
      });
    },
    async commitCaptured(executionId, expected) {
      const current = rows.get(executionId);
      if (current?.phase === "committed" && current.version === expected) return clone(current);
      if (!current || current.version !== expected) return null;
      if (current.phase !== "captured" || current.providerReference === null) throw new Error(`execution ${executionId} is ${current.phase} without capture evidence`);
      // The SQL commit records a failed local commit as reconciliation_required
      // while keeping the capture evidence; the reference does the same.
      try {
        await applyCaptured(current);
      } catch (error) {
        // An order-level violation raises, exactly as the SQL does: nothing is
        // written and the execution keeps its captured evidence for an operator.
        if (error instanceof CheckoutCommitPrecondition) throw error;
        // A reservation-set failure parks the execution and keeps the evidence.
        return cas(executionId, expected, () => ({ phase: "reconciliation_required" }));
      }
      return cas(executionId, expected, () => ({ phase: "committed" }));
    },
    async commitCancelled(executionId, expected) {
      const current = rows.get(executionId);
      if (current?.phase === "cancelled" && current.settledAt !== null && current.version === expected) return clone(current);
      if (!current || current.version !== expected) return null;
      if (current.phase !== "cancelled") throw new Error(`execution ${executionId} is ${current.phase}, not cancelled`);
      await applyCancelled(current);
      return cas(executionId, expected, () => ({ settledAt: now().toISOString() }));
    },
    snapshot: () => [...rows.values()].map(clone),
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store. Service-role client; every transition is a database
// function so the compare-and-swap happens inside Postgres.
// ---------------------------------------------------------------------------

const EXECUTIONS = "research_checkout_executions";
const INBOX = "research_payment_webhook_inbox";
const EXECUTION_COLUMNS =
  "id, member_id, request_key, request_body_sha256, order_id, phase, version, provider_reference, amount_cents, currency, payment_method_reference, quote_fingerprint, price_version, authorization_key, capture_key, cancel_key, reservation_ids, last_provider_result, created_at, updated_at, committed_at, settled_at";
const UNIQUE_VIOLATION = "23505";

type Row = Record<string, unknown>;
type ProviderError = { message: string; code?: string } | null;

/** The slice of the Supabase client this store uses; injected for tests. */
export interface CheckoutExecutionClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): { maybeSingle(): Promise<{ data: Row | null; error: ProviderError }> };
        maybeSingle(): Promise<{ data: Row | null; error: ProviderError }>;
        order(column: string, options: { ascending: boolean }): { limit(count: number): Promise<{ data: Row[] | null; error: ProviderError }> };
      };
    };
    insert(row: Row): Promise<{ error: ProviderError }>;
    update(patch: Row): { eq(column: string, value: unknown): { eq(column: string, value: unknown): Promise<{ error: ProviderError }> } };
  };
  rpc(fn: string, args: Row): Promise<{ data: Row[] | Row | null; error: ProviderError }>;
}

function firstRow(data: Row[] | Row | null): Row | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

export function createSupabaseCheckoutExecutionStore(client: () => CheckoutExecutionClient = () => getSupabaseAdmin() as unknown as CheckoutExecutionClient): CheckoutExecutionRepository {
  const fail = (what: string, error: ProviderError) => new Error(`checkout execution ${what} failed: ${error?.message ?? "unknown"}`);
  const mapped = (what: string, row: Row | null): CheckoutExecutionRecord | null => {
    if (!row) return null;
    const record = rowToExecution(row as unknown as CheckoutExecutionRow);
    if (!record) throw new Error(`checkout execution ${what} returned an uninterpretable row`);
    return record;
  };
  async function transition(fn: string, args: Row): Promise<CheckoutExecutionRecord | null> {
    const result = await client().rpc(fn, args);
    if (result.error) throw fail(fn, result.error);
    return mapped(fn, firstRow(result.data));
  }
  return {
    authority: "canonical_checkout_transaction_v1",
    async create(record) {
      const insert = await client().from(EXECUTIONS).insert(executionToInsertRow(record));
      if (!insert.error) return { ...record, reservationIds: [...record.reservationIds] };
      if (insert.error.code !== UNIQUE_VIOLATION) throw fail("create", insert.error);
      // The (member, request key) row exists: the same exact request replays it; anything else conflicts.
      const existing = await client().from(EXECUTIONS).select(EXECUTION_COLUMNS).eq("member_id", record.memberId).eq("request_key", record.requestKey).maybeSingle();
      if (existing.error) throw fail("create read-back", existing.error);
      const row = existing.data as unknown as CheckoutExecutionRow | null;
      if (!row) throw new CheckoutExecutionConflict("duplicate_execution");
      if (row.request_body_sha256 !== record.requestBodySha256 || Number(row.amount_cents) !== record.amountCents) {
        throw new CheckoutExecutionConflict("request_key_reused");
      }
      if (row.order_id !== record.orderId || row.id !== record.executionId) throw new CheckoutExecutionConflict("duplicate_execution");
      return mapped("create", row as unknown as Row)!;
    },
    async getForMember(memberId, requestKey) {
      const result = await client().from(EXECUTIONS).select(EXECUTION_COLUMNS).eq("member_id", memberId).eq("request_key", requestKey).maybeSingle();
      if (result.error) throw fail("read", result.error);
      return mapped("read", result.data);
    },
    async verifyRequest(memberId, requestKey, digest) {
      const result = await client().from(EXECUTIONS).select("request_body_sha256").eq("member_id", memberId).eq("request_key", requestKey).maybeSingle();
      if (result.error) throw fail("request verification", result.error);
      if (!result.data) return "missing";
      return (result.data as { request_body_sha256?: unknown }).request_body_sha256 === digest ? "match" : "conflict";
    },
    async findByProviderReference(reference) {
      const result = await client().from(EXECUTIONS).select(EXECUTION_COLUMNS).eq("provider_reference", reference).maybeSingle();
      if (result.error) throw fail("reference lookup", result.error);
      return mapped("reference lookup", result.data);
    },
    async findByOrder(orderId) {
      const result = await client().from(EXECUTIONS).select(EXECUTION_COLUMNS).eq("order_id", orderId).order("created_at", { ascending: false }).limit(1);
      if (result.error) throw fail("order lookup", result.error);
      return mapped("order lookup", (result.data ?? [])[0] ?? null);
    },
    claim: (executionId, expectedVersion, phase) =>
      transition("research_checkout_execution_claim", { p_execution_id: executionId, p_expected_version: expectedVersion, p_phase: phase }),
    recordProvider: (executionId, expectedVersion, result) =>
      transition("research_checkout_execution_record_provider", { p_execution_id: executionId, p_expected_version: expectedVersion, p_result: result }),
    commitCaptured: (executionId, expectedVersion) =>
      transition("research_checkout_execution_commit_captured", { p_execution_id: executionId, p_expected_version: expectedVersion, p_at: new Date().toISOString() }),
    commitCancelled: (executionId, expectedVersion) =>
      transition("research_checkout_execution_commit_cancelled", { p_execution_id: executionId, p_expected_version: expectedVersion, p_at: new Date().toISOString() }),
  };
}

/** Durable webhook receipt over research_payment_webhook_inbox: claim by primary key, terminal-state updates only. */
export function createSupabaseWebhookExecutionInbox(client: () => CheckoutExecutionClient = () => getSupabaseAdmin() as unknown as CheckoutExecutionClient): WebhookExecutionInbox {
  const fail = (what: string, error: ProviderError) => new Error(`webhook inbox ${what} failed: ${error?.message ?? "unknown"}`);
  return {
    async claim(event: WebhookExecutionInboxEvent) {
      const insert = await client().from(INBOX).insert({
        provider_name: event.providerName,
        event_id: event.eventId,
        event_type: event.eventType,
        payload_sha256: event.payloadSha256,
        state: "processing",
        received_at: event.receivedAt.toISOString(),
      });
      if (!insert.error) return { state: "new" };
      if (insert.error.code !== UNIQUE_VIOLATION) throw fail("claim", insert.error);
      const existing = await client().from(INBOX).select("payload_sha256, state, outcome").eq("provider_name", event.providerName).eq("event_id", event.eventId).maybeSingle();
      if (existing.error) throw fail("claim read-back", existing.error);
      const row = existing.data as { payload_sha256: string; state: string; outcome: string | null } | null;
      if (!row) throw fail("claim read-back", { message: "row vanished after unique violation" });
      if (row.payload_sha256 !== event.payloadSha256) return { state: "conflict" };
      if (row.state === "processing") return { state: "processing" };
      return { state: "processed", outcome: row.outcome ?? row.state };
    },
    async complete(providerName, eventId, outcome, executionId) {
      const result = await client().from(INBOX).update({ state: "processed", outcome, execution_id: executionId, completed_at: new Date().toISOString() }).eq("provider_name", providerName).eq("event_id", eventId);
      if (result.error) throw fail("complete", result.error);
    },
    async isolate(providerName, eventId, reason, executionId) {
      const result = await client().from(INBOX).update({ state: "isolated", outcome: "isolated", reason, execution_id: executionId, completed_at: new Date().toISOString() }).eq("provider_name", providerName).eq("event_id", eventId);
      if (result.error) throw fail("isolate", result.error);
    },
  };
}

export function resolveCheckoutExecutionStore(): CheckoutExecutionRepository {
  return supabaseConfigured() ? createSupabaseCheckoutExecutionStore() : createInMemoryCheckoutExecutionStore();
}
