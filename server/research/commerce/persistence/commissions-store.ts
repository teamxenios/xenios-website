// ---------------------------------------------------------------------------
// Persistent commission and payout ledgers (Track B, commerce activation).
//
// This module is the durable, async persistence boundary for two append-only
// ledgers that today live only in per-process memory:
//
//   1. The COMMISSION ledger (server/research/partners/commissions.ts). Its
//      CommissionLedgerRepository interface is already async, so this file
//      implements that EXACT interface (imported, never redeclared): an
//      in-memory reference (reused, not reinvented), a Supabase-backed store,
//      and a resolver that picks one.
//
//   2. The PAYOUT ledger and runs (research_payout_batches +
//      research_payout_attempts). payout.ts declares no repository, so this file
//      defines a small append-only port for it, the same way idempotency-store
//      defines its own port.
//
// APPEND-ONLY IS THE DEFINING PROPERTY (mirrors migration 26). A correction is a
// NEW row that references the original, never an edit. Neither store exposes an
// update or a delete of a historical money row, so no caller (and no bug) can
// rewrite ledger history through this layer. The database enforces the same rule
// with a before-update/delete trigger on research_commission_ledger.
//
// Building this does NOT enable commerce. The stores are additive seams; the
// bridge that wires them behind the commerce flag is a later, separate step.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommissionState } from "@shared/research/distribution";
import {
  InMemoryCommissionLedgerRepository,
  type CommissionEntryKind,
  type CommissionLedgerEntry,
  type CommissionLedgerRepository,
} from "../../partners/commissions";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ===========================================================================
// COMMISSION LEDGER
// ===========================================================================

const COMMISSION_TABLE = "research_commission_ledger";

/**
 * A research_commission_ledger row, exactly the columns migration 26 defines.
 * Every column is present so the mapping below is total and auditable.
 */
export interface CommissionLedgerRow {
  id: string;
  partner_id: string;
  order_id: string;
  state: string;
  eligible_net_cents: number;
  basis_points: number;
  amount_cents: number;
  reverses_ledger_id: string | null;
  source_reference: string | null;
  payout_batch_id: string | null;
  payout_reference: string | null;
  actor_type: string;
  actor_id: string | null;
  created_at: string;
}

/**
 * The effective commission rate implied by a row's own truthful amounts.
 *
 * migration 26 requires basis_points NOT NULL, but the evolved
 * CommissionLedgerEntry no longer carries the rate (it stores the resulting
 * amount instead). Rather than invent a rate, this derives the rate that the
 * stored amount and eligible net already imply, so basis_points can never
 * contradict amount_cents. It is a denormalized read of the truth, not a new
 * fact. A transition row moves no money, so its effective rate is 0, which is
 * honest. The domain never reads basis_points back, so this affects no behavior.
 */
export function effectiveBasisPoints(amountCents: number, eligibleNetCents: number): number {
  if (eligibleNetCents <= 0) return 0;
  const bp = Math.round((amountCents * 10000) / eligibleNetCents);
  return Math.max(0, Math.min(10000, bp));
}

/**
 * Map a domain entry to an insertable row.
 *
 * KNOWN SCHEMA GAP: migration 26 has no column for `kind`, `rootId`,
 * `previousEntryId`, or `reason`. The first three are reconstructed losslessly
 * on read (see chainRowsToEntries), so nothing is lost there. `reason` (free
 * text, audit-only, never read by the repository contract) is NOT persisted by
 * this schema; a follow-up migration adding a `reason text` column would close
 * that fidelity gap. No money value is dropped: amounts, states, and references
 * all map exactly.
 */
export function commissionEntryToRow(entry: CommissionLedgerEntry): CommissionLedgerRow {
  return {
    id: entry.id,
    partner_id: entry.partnerId,
    order_id: entry.orderId,
    state: entry.state,
    eligible_net_cents: entry.eligibleNetCents,
    basis_points: effectiveBasisPoints(entry.amountCents, entry.eligibleNetCents),
    amount_cents: entry.amountCents,
    // The DB constraint allows reverses_ledger_id only when state is 'reversed'
    // (a full reversal). A partial reversal keeps the chain live, so it carries
    // no target here; kind is still recovered from position + amount on read.
    reverses_ledger_id: entry.kind === "reversal" && entry.state === "reversed" ? entry.rootId : null,
    source_reference: entry.sourceReference,
    payout_batch_id: entry.payoutBatchId,
    payout_reference: entry.providerReference,
    actor_type: entry.actor,
    actor_id: entry.actorId,
    created_at: entry.createdAt,
  };
}

/**
 * Map one row back to a domain entry, given the chain-derived fields the schema
 * does not store directly.
 */
export function rowToCommissionEntry(
  row: CommissionLedgerRow,
  derived: { rootId: string; previousEntryId: string | null; kind: CommissionEntryKind },
): CommissionLedgerEntry {
  return {
    id: row.id,
    rootId: derived.rootId,
    previousEntryId: derived.previousEntryId,
    kind: derived.kind,
    partnerId: row.partner_id,
    orderId: row.order_id,
    amountCents: row.amount_cents,
    eligibleNetCents: row.eligible_net_cents,
    state: row.state as CommissionState,
    actor: (row.actor_type === "admin" ? "admin" : "system") as "admin" | "system",
    actorId: row.actor_id,
    // Not carried by migration 26 (see commissionEntryToRow). Never read by the
    // repository contract, so this null does not change ledger behavior.
    reason: null,
    payoutBatchId: row.payout_batch_id,
    providerReference: row.payout_reference,
    sourceReference: row.source_reference,
    createdAt: row.created_at,
  };
}

/** Oldest first, deterministic. Callers advance the clock, so created_at is monotonic per chain. */
function compareCommissionRows(a: CommissionLedgerRow, b: CommissionLedgerRow): number {
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Reconstruct a whole chain of entries from its rows.
 *
 * The chain is every row sharing (partner_id, order_id): one order pays one
 * partner and there is at most one accrual per (partner, order), so this set is
 * exactly one chain. Ordered oldest first, the first row is the accrual, and
 * each later row is a reversal when it moves money (amount > 0) or a transition
 * when it does not (amount = 0). rootId is the accrual's id; previousEntryId is
 * the immediately preceding row. This is the exact inverse of how the service
 * writes a chain, so the round trip is lossless for every field the contract
 * reads.
 */
export function chainRowsToEntries(rows: readonly CommissionLedgerRow[]): CommissionLedgerEntry[] {
  const sorted = [...rows].sort(compareCommissionRows);
  if (sorted.length === 0) return [];
  const rootId = sorted[0].id;
  return sorted.map((row, index) => {
    let kind: CommissionEntryKind;
    if (index === 0) kind = "accrual";
    else if (row.amount_cents > 0) kind = "reversal";
    else kind = "transition";
    return rowToCommissionEntry(row, {
      rootId,
      previousEntryId: index === 0 ? null : sorted[index - 1].id,
      kind,
    });
  });
}

/**
 * The in-memory reference. It reuses InMemoryCommissionLedgerRepository from the
 * service rather than growing a second implementation that could drift from the
 * proven one. This is the safe default while the commerce tables are not
 * provisioned, and the double used by tests.
 */
export function createInMemoryCommissionLedgerStore(): CommissionLedgerRepository {
  return new InMemoryCommissionLedgerRepository();
}

/**
 * The Supabase-backed store. Implements the same CommissionLedgerRepository
 * contract: append (insert only) plus reads. There is deliberately no update and
 * no delete method, so this store cannot edit a historical entry, matching the
 * database trigger. Exercised in tests against an injected fake client.
 */
export function createSupabaseCommissionLedgerStore(
  client: SupabaseClient = getSupabaseAdmin(),
): CommissionLedgerRepository {
  async function rowById(entryId: string): Promise<CommissionLedgerRow | null> {
    const found = await client
      .from(COMMISSION_TABLE)
      .select(
        "id, partner_id, order_id, state, eligible_net_cents, basis_points, amount_cents, reverses_ledger_id, source_reference, payout_batch_id, payout_reference, actor_type, actor_id, created_at",
      )
      .eq("id", entryId)
      .maybeSingle();
    if (found.error) throw new Error(`commission entry load failed: ${found.error.message}`);
    return (found.data as CommissionLedgerRow | null) ?? null;
  }

  async function chainRowsFor(partnerId: string, orderId: string): Promise<CommissionLedgerRow[]> {
    const res = await client
      .from(COMMISSION_TABLE)
      .select(
        "id, partner_id, order_id, state, eligible_net_cents, basis_points, amount_cents, reverses_ledger_id, source_reference, payout_batch_id, payout_reference, actor_type, actor_id, created_at",
      )
      .eq("partner_id", partnerId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (res.error) throw new Error(`commission chain load failed: ${res.error.message}`);
    return ((res.data ?? []) as CommissionLedgerRow[]).slice();
  }

  return {
    async append(entry) {
      const ins = await client.from(COMMISSION_TABLE).insert(commissionEntryToRow(entry));
      if (ins.error) throw new Error(`commission append failed: ${ins.error.message}`);
    },

    async getEntry(entryId) {
      const row = await rowById(entryId);
      if (!row) return null;
      const chain = chainRowsToEntries(await chainRowsFor(row.partner_id, row.order_id));
      return chain.find((e) => e.id === entryId) ?? null;
    },

    async listChain(rootId) {
      // rootId is an accrual id, but resolving through the row's (partner, order)
      // means any entry id in the chain would also resolve the same chain.
      const root = await rowById(rootId);
      if (!root) return [];
      return chainRowsToEntries(await chainRowsFor(root.partner_id, root.order_id));
    },

    async listByPartner(partnerId) {
      const res = await client
        .from(COMMISSION_TABLE)
        .select(
          "id, partner_id, order_id, state, eligible_net_cents, basis_points, amount_cents, reverses_ledger_id, source_reference, payout_batch_id, payout_reference, actor_type, actor_id, created_at",
        )
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: true });
      if (res.error) throw new Error(`commission partner load failed: ${res.error.message}`);
      const rows = ((res.data ?? []) as CommissionLedgerRow[]).slice();

      // Group into chains by order_id, reconstruct each, then flatten oldest
      // first. balanceFor regroups by rootId, so the derived rootId is what
      // matters, not the flat order.
      const byOrder = new Map<string, CommissionLedgerRow[]>();
      for (const row of rows) {
        const bucket = byOrder.get(row.order_id);
        if (bucket) bucket.push(row);
        else byOrder.set(row.order_id, [row]);
      }
      const entries: CommissionLedgerEntry[] = [];
      byOrder.forEach((chainRows) => {
        chainRowsToEntries(chainRows).forEach((e) => entries.push(e));
      });
      entries.sort((a, b) => {
        if (a.createdAt < b.createdAt) return -1;
        if (a.createdAt > b.createdAt) return 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      return entries;
    },

    async listAccrualsByOrder(orderId) {
      const res = await client
        .from(COMMISSION_TABLE)
        .select(
          "id, partner_id, order_id, state, eligible_net_cents, basis_points, amount_cents, reverses_ledger_id, source_reference, payout_batch_id, payout_reference, actor_type, actor_id, created_at",
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (res.error) throw new Error(`commission order load failed: ${res.error.message}`);
      const rows = ((res.data ?? []) as CommissionLedgerRow[]).slice();

      // The accrual is the earliest row of each (partner, order) chain.
      const byPartner = new Map<string, CommissionLedgerRow[]>();
      for (const row of rows) {
        const bucket = byPartner.get(row.partner_id);
        if (bucket) bucket.push(row);
        else byPartner.set(row.partner_id, [row]);
      }
      const accruals: CommissionLedgerEntry[] = [];
      byPartner.forEach((chainRows) => {
        const first = [...chainRows].sort(compareCommissionRows)[0];
        accruals.push(rowToCommissionEntry(first, { rootId: first.id, previousEntryId: null, kind: "accrual" }));
      });
      accruals.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      return accruals;
    },

    async findAccrual(partnerId, orderId) {
      const chain = await chainRowsFor(partnerId, orderId);
      if (chain.length === 0) return null;
      const first = [...chain].sort(compareCommissionRows)[0];
      return rowToCommissionEntry(first, { rootId: first.id, previousEntryId: null, kind: "accrual" });
    },
  };
}

/**
 * The real commission store when Supabase is configured, else the in-memory
 * reference. The bridge that consumes this stays behind the commerce flag, so an
 * unconfigured deployment keeps failing closed rather than silently persisting.
 */
export function resolveCommissionLedgerStore(): CommissionLedgerRepository {
  return supabaseConfigured() ? createSupabaseCommissionLedgerStore() : createInMemoryCommissionLedgerStore();
}

// ===========================================================================
// PAYOUT LEDGER AND RUNS
// ===========================================================================
//
// payout.ts declares no repository, so the append-only port for the payout
// tables lives here (the same pattern idempotency-store uses for its own port).
//
// A payout run is a batch that was built (research_payout_batches) plus the
// append-only log of what happened each time it was attempted
// (research_payout_attempts). This store offers ONLY insert and read: a batch
// row is the immutable record of what was built, and every later event (a
// submit, a settlement, a failure) is a NEW attempt row, never an edit of the
// batch. That keeps the money history append-only, so a batch is never mutated
// after the fact through this layer.

const PAYOUT_BATCHES_TABLE = "research_payout_batches";
const PAYOUT_ATTEMPTS_TABLE = "research_payout_attempts";

export type PayoutBatchState = "built" | "submitted" | "settled" | "failed" | "cancelled";
export type PayoutAttemptOutcome =
  | "disabled"
  | "misconfigured"
  | "rejected"
  | "retryable"
  | "permanent_failure"
  | "settled";

export interface PayoutBatchRecord {
  id: string;
  partnerId: string;
  totalCents: number;
  state: PayoutBatchState;
  providerName: string;
  providerReference: string | null;
  excludedReasons: readonly string[];
  builtAt: string;
  settledAt: string | null;
}

export interface PayoutAttemptRecord {
  id: string;
  batchId: string;
  attemptNo: number;
  outcome: PayoutAttemptOutcome;
  providerCode: string | null;
  attemptedAt: string;
}

/** A research_payout_batches row, exactly the columns migration 26 defines. */
export interface PayoutBatchRow {
  id: string;
  partner_id: string;
  total_cents: number;
  state: string;
  provider_name: string;
  provider_reference: string | null;
  excluded_reasons: string[];
  built_at: string;
  settled_at: string | null;
}

/** A research_payout_attempts row, exactly the columns migration 26 defines. */
export interface PayoutAttemptRow {
  id: string;
  batch_id: string;
  attempt_no: number;
  outcome: string;
  provider_code: string | null;
  attempted_at: string;
}

export function payoutBatchRecordToRow(batch: PayoutBatchRecord): PayoutBatchRow {
  return {
    id: batch.id,
    partner_id: batch.partnerId,
    total_cents: batch.totalCents,
    state: batch.state,
    provider_name: batch.providerName,
    provider_reference: batch.providerReference,
    excluded_reasons: [...batch.excludedReasons],
    built_at: batch.builtAt,
    settled_at: batch.settledAt,
  };
}

export function payoutBatchRowToRecord(row: PayoutBatchRow): PayoutBatchRecord {
  return {
    id: row.id,
    partnerId: row.partner_id,
    totalCents: row.total_cents,
    state: row.state as PayoutBatchState,
    providerName: row.provider_name,
    providerReference: row.provider_reference,
    excludedReasons: [...(row.excluded_reasons ?? [])],
    builtAt: row.built_at,
    settledAt: row.settled_at,
  };
}

export function payoutAttemptRecordToRow(attempt: PayoutAttemptRecord): PayoutAttemptRow {
  return {
    id: attempt.id,
    batch_id: attempt.batchId,
    attempt_no: attempt.attemptNo,
    outcome: attempt.outcome,
    provider_code: attempt.providerCode,
    attempted_at: attempt.attemptedAt,
  };
}

export function payoutAttemptRowToRecord(row: PayoutAttemptRow): PayoutAttemptRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    attemptNo: row.attempt_no,
    outcome: row.outcome as PayoutAttemptOutcome,
    providerCode: row.provider_code,
    attemptedAt: row.attempted_at,
  };
}

/**
 * The append-only payout ledger port. Insert and read only: no method updates or
 * deletes a batch, and no method rewrites an attempt. A retry is a new attempt
 * with the next attempt_no, which the DB keeps unique per batch.
 */
export interface PayoutLedgerRepository {
  recordBatch(batch: PayoutBatchRecord): Promise<void>;
  getBatch(batchId: string): Promise<PayoutBatchRecord | null>;
  /** Batches for one partner, oldest first. Scoped strictly to the given partner. */
  listBatchesByPartner(partnerId: string): Promise<readonly PayoutBatchRecord[]>;
  recordAttempt(attempt: PayoutAttemptRecord): Promise<void>;
  /** Attempts for one batch, by attempt number. */
  listAttempts(batchId: string): Promise<readonly PayoutAttemptRecord[]>;
}

/** Raised when a duplicate attempt number is recorded for a batch. */
export class DuplicatePayoutAttempt extends Error {
  constructor(batchId: string, attemptNo: number) {
    super(`Attempt ${attemptNo} already exists for payout batch ${batchId}.`);
    this.name = "DuplicatePayoutAttempt";
  }
}

/**
 * In-memory reference. Correct within one process and the double used by tests.
 * It models the DB's UNIQUE (batch_id, attempt_no) so duplicate attempts fail
 * the same way they would durably. Copies on the way in and out.
 */
export function createInMemoryPayoutLedgerStore(): PayoutLedgerRepository {
  const batches = new Map<string, PayoutBatchRecord>();
  const attempts: PayoutAttemptRecord[] = [];
  const cloneBatch = (b: PayoutBatchRecord): PayoutBatchRecord => ({ ...b, excludedReasons: [...b.excludedReasons] });
  const cloneAttempt = (a: PayoutAttemptRecord): PayoutAttemptRecord => ({ ...a });

  return {
    async recordBatch(batch) {
      batches.set(batch.id, cloneBatch(batch));
    },
    async getBatch(batchId) {
      const batch = batches.get(batchId);
      return batch ? cloneBatch(batch) : null;
    },
    async listBatchesByPartner(partnerId) {
      return attemptsSortedBatches(batches, partnerId).map(cloneBatch);
    },
    async recordAttempt(attempt) {
      if (attempts.some((a) => a.batchId === attempt.batchId && a.attemptNo === attempt.attemptNo)) {
        throw new DuplicatePayoutAttempt(attempt.batchId, attempt.attemptNo);
      }
      attempts.push(cloneAttempt(attempt));
    },
    async listAttempts(batchId) {
      return attempts
        .filter((a) => a.batchId === batchId)
        .sort((a, b) => a.attemptNo - b.attemptNo)
        .map(cloneAttempt);
    },
  };
}

function attemptsSortedBatches(batches: Map<string, PayoutBatchRecord>, partnerId: string): PayoutBatchRecord[] {
  const out: PayoutBatchRecord[] = [];
  batches.forEach((b) => {
    if (b.partnerId === partnerId) out.push(b);
  });
  out.sort((a, b) => (a.builtAt < b.builtAt ? -1 : a.builtAt > b.builtAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

const PG_UNIQUE_VIOLATION = "23505";

/**
 * Supabase-backed payout ledger. Insert and read only, no update or delete, so a
 * built batch and a recorded attempt are immutable through this layer. Duplicate
 * attempt protection comes from the DB UNIQUE (batch_id, attempt_no) constraint,
 * not an application check.
 */
export function createSupabasePayoutLedgerStore(
  client: SupabaseClient = getSupabaseAdmin(),
): PayoutLedgerRepository {
  return {
    async recordBatch(batch) {
      const ins = await client.from(PAYOUT_BATCHES_TABLE).insert(payoutBatchRecordToRow(batch));
      if (ins.error) throw new Error(`payout batch record failed: ${ins.error.message}`);
    },

    async getBatch(batchId) {
      const found = await client
        .from(PAYOUT_BATCHES_TABLE)
        .select(
          "id, partner_id, total_cents, state, provider_name, provider_reference, excluded_reasons, built_at, settled_at",
        )
        .eq("id", batchId)
        .maybeSingle();
      if (found.error) throw new Error(`payout batch load failed: ${found.error.message}`);
      const row = found.data as PayoutBatchRow | null;
      return row ? payoutBatchRowToRecord(row) : null;
    },

    async listBatchesByPartner(partnerId) {
      const res = await client
        .from(PAYOUT_BATCHES_TABLE)
        .select(
          "id, partner_id, total_cents, state, provider_name, provider_reference, excluded_reasons, built_at, settled_at",
        )
        .eq("partner_id", partnerId)
        .order("built_at", { ascending: true });
      if (res.error) throw new Error(`payout batch list failed: ${res.error.message}`);
      return ((res.data ?? []) as PayoutBatchRow[]).map(payoutBatchRowToRecord);
    },

    async recordAttempt(attempt) {
      const ins = await client.from(PAYOUT_ATTEMPTS_TABLE).insert(payoutAttemptRecordToRow(attempt));
      if (ins.error) {
        if (ins.error.code === PG_UNIQUE_VIOLATION) {
          throw new DuplicatePayoutAttempt(attempt.batchId, attempt.attemptNo);
        }
        throw new Error(`payout attempt record failed: ${ins.error.message}`);
      }
    },

    async listAttempts(batchId) {
      const res = await client
        .from(PAYOUT_ATTEMPTS_TABLE)
        .select("id, batch_id, attempt_no, outcome, provider_code, attempted_at")
        .eq("batch_id", batchId)
        .order("attempt_no", { ascending: true });
      if (res.error) throw new Error(`payout attempt list failed: ${res.error.message}`);
      return ((res.data ?? []) as PayoutAttemptRow[]).map(payoutAttemptRowToRecord);
    },
  };
}

/**
 * The real payout ledger when Supabase is configured, else the in-memory
 * reference. Consumed only behind the commerce flag, so an unconfigured
 * deployment keeps failing closed.
 */
export function resolvePayoutLedgerStore(): PayoutLedgerRepository {
  return supabaseConfigured() ? createSupabasePayoutLedgerStore() : createInMemoryPayoutLedgerStore();
}
