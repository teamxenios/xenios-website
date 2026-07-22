// ---------------------------------------------------------------------------
// Persistent store-credit ledger (Track B, wave 17).
//
// This module is the durable, async persistence boundary for member store
// credit, over migration 26's research_store_credit_ledger table. Like the
// commission ledger (commissions-store.ts), APPEND-ONLY IS THE DEFINING
// PROPERTY: every lifecycle event is a NEW row, and no method updates or
// deletes a historical row, matching the database's before-update/delete
// trigger. There is no mutable balance column anywhere; balances are computed
// from the rows every time.
//
// THE ROW-PER-EVENT MODEL. Because the table refuses UPDATE, a credit cannot
// change state in place. The lifecycle is therefore a chain of rows linked by
// reverses_id (the schema's only self-reference):
//
//   issue      -> a new positive row (pending, held, approved, or
//                 fraud_flagged), the ONLY moment an expiry can be written.
//   approve    -> a NEW positive row with state approved whose reverses_id
//                 names the pending or held row it promotes. The pending row
//                 stays forever; being referenced is what retires it.
//   reverse    -> a NEW NEGATIVE row whose reverses_id names the row it
//                 offsets. Offsetting an approved credit writes the negative
//                 row with state approved, because the shared balance function
//                 counts approved rows only and the offset must be visible to
//                 it or the reversed credit would stay spendable. Offsetting a
//                 credit that never approved writes state reversed, which no
//                 balance ever counts.
//
// SPENDABLE VERSUS PENDING. spendableCents delegates to the canonical
// spendableStoreCreditCents (shared/research/distribution.ts), so approved
// rows are the only rows that ever count, and expired rows are excluded first.
// pendingCents counts pending and held rows that no later row references.
// A pending, held, reversed, or fraud_flagged row is NEVER spendable.
//
// REVIEW CAN NEVER BE BOUGHT. Large-order review evaluates the GROSS order
// value, before any credit applies. grossOrderValueForReviewCents makes that
// structural: credit has no parameter in its signature, so a caller cannot
// even pass it. And this store exposes NO API that marks a payment or fraud
// review satisfied; a fraud_flagged credit can only be reversed here, never
// promoted.
//
// KNOWN SCHEMA GAPS (documented, fail closed):
//   1. Migration 26 has no expires_at column. The in-memory store supports an
//      expiry written at issue time; the Supabase store REFUSES to persist a
//      record carrying one, because silently dropping an expiry would make
//      credit immortal. A follow-up migration adding expires_at closes this.
//   2. CLOSED by the Track B fidelity migration
//      (supabase/research-track-b-fidelity.sql): a partial unique index on
//      (reverses_id) where reverses_id is not null makes the one-settlement-
//      per-entry guard durable under concurrency. The application check in
//      buildTransitionRow remains as the friendly first line; the database
//      unique violation (23505) is surfaced as the same StoreCreditEntrySettled
//      error, so two racing approvals can never both insert.
//
// SPENDING. Applied credit must decrement the balance or the same credit is
// reusable on every order. spend() appends a NEGATIVE approved row (the only
// state the shared balance function counts), bounded by the current spendable
// balance, with the consuming order carried in actor_id for audit. The shared
// reason vocabulary has no "spend" member yet, so the row carries
// manual_adjustment (the adjustment-shaped reason) until the shared type grows
// one; the negative amount plus the order reference keep the audit readable.
//
// Building this does NOT enable commerce. The store is an additive seam; the
// wiring that consumes it stays behind the default-false commerce flag.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LedgerEntryState, StoreCreditEntry } from "@shared/research/distribution";
import { spendableStoreCreditCents } from "@shared/research/distribution";
import type { StoreCreditDto } from "@shared/research/commerce-api";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

const STORE_CREDIT_TABLE = "research_store_credit_ledger";
const PG_UNIQUE_VIOLATION = "23505";

export const STORE_CREDIT_STATES: readonly LedgerEntryState[] = [
  "pending",
  "held",
  "approved",
  "reversed",
  "fraud_flagged",
];

export type StoreCreditReason = StoreCreditEntry["reason"];

export const STORE_CREDIT_REASONS: readonly StoreCreditReason[] = [
  "referral_new_member",
  "referral_referrer",
  "service_recovery",
  "manual_adjustment",
];

export type StoreCreditActor = "admin" | "system";

/**
 * One ledger row in domain shape. Extends the shared StoreCreditEntry with the
 * audit fields migration 26 carries (reverses_id, actor_type, actor_id) plus
 * the expiry that only exists at issue time (see schema gap 1).
 */
export interface StoreCreditLedgerRecord extends StoreCreditEntry {
  reversesId: string | null;
  actorType: StoreCreditActor;
  actorId: string | null;
  /** Set at issue time or never. No method exists to set or change it later. */
  expiresAt: string | null;
}

/** Who did it and when, for the approve and reverse transitions. */
export interface StoreCreditAction {
  /** The id of the NEW row being written. */
  id: string;
  actorType: StoreCreditActor;
  actorId: string | null;
  at: Date;
}

export class StoreCreditEntryNotFound extends Error {
  constructor(memberId: string, entryId: string) {
    // The message never says whether the id exists for someone else.
    super(`No store credit entry ${entryId} for member ${memberId}.`);
    this.name = "StoreCreditEntryNotFound";
  }
}

export class StoreCreditEntrySettled extends Error {
  constructor(entryId: string) {
    super(`Store credit entry ${entryId} was already promoted or reversed; a chain settles once.`);
    this.name = "StoreCreditEntrySettled";
  }
}

export class StoreCreditInvalidTransition extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreCreditInvalidTransition";
  }
}

/**
 * The append-only store-credit ledger port. Insert and read only: there is no
 * update, no delete, and no method that mutates a stored row. approve and
 * reverse WRITE NEW ROWS. Every method takes the owning member id as an
 * argument, and no method reads an owner from anywhere else.
 */
export interface StoreCreditLedgerRepository {
  /** Insert one validated row. The only writer, so expiry is fixed at insert. */
  append(record: StoreCreditLedgerRecord): Promise<void>;
  /** Promote a pending or held credit by writing a NEW approved row. */
  approve(memberId: string, entryId: string, action: StoreCreditAction): Promise<StoreCreditLedgerRecord>;
  /** Offset a credit by writing a NEW negative row. Never edits the original. */
  reverse(memberId: string, entryId: string, action: StoreCreditAction): Promise<StoreCreditLedgerRecord>;
  /**
   * Record credit consumed by an order as a NEW negative approved row, so the
   * spendable balance actually decrements when checkout applies it. Bounded by
   * the current spendable balance (fails closed on overdraw). `orderRef` is
   * carried in actor_id so the audit trail names the consuming order.
   */
  spend(memberId: string, amountCents: number, orderRef: string, at: Date): Promise<StoreCreditLedgerRecord>;
  /** Every row for one member, oldest first. Strictly scoped to that member. */
  listForMember(memberId: string): Promise<readonly StoreCreditLedgerRecord[]>;
  /** One row, only if it belongs to the given member. */
  getEntry(memberId: string, entryId: string): Promise<StoreCreditLedgerRecord | null>;
  /** Approved and unexpired only, via the canonical shared function. */
  spendableCents(memberId: string, asOf: Date): Promise<number>;
  /** Pending and held rows no later row has settled. Never spendable. */
  pendingCents(memberId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Pure helpers (fully tested; both store implementations share them)
// ---------------------------------------------------------------------------

/**
 * Large-order review evaluates the GROSS order value: subtotal plus shipping,
 * BEFORE store credit. Credit is deliberately absent from the signature, so a
 * member cannot spend their way under the review threshold (this mirrors the
 * same rule enforced in checkout.ts). Do not add a credit parameter.
 */
export function grossOrderValueForReviewCents(subtotalCents: number, shippingCents: number): number {
  return subtotalCents + shippingCents;
}

function isExpired(record: StoreCreditLedgerRecord, asOf: Date): boolean {
  if (record.expiresAt === null) return false;
  const ms = Date.parse(record.expiresAt);
  return Number.isFinite(ms) && ms <= asOf.getTime();
}

/** Strip the audit fields down to the shared entry shape. */
export function toStoreCreditEntry(record: StoreCreditLedgerRecord): StoreCreditEntry {
  return {
    id: record.id,
    memberId: record.memberId,
    amountCents: record.amountCents,
    state: record.state,
    reason: record.reason,
    createdAt: record.createdAt,
    availableAt: record.availableAt,
  };
}

/**
 * Spendable balance over a member's rows: expired rows drop first, then the
 * canonical shared function counts approved rows only. Reversal offsets carry
 * the original's expiry, so a credit and its offset always expire together.
 */
export function spendableCentsOf(records: readonly StoreCreditLedgerRecord[], asOf: Date): number {
  return spendableStoreCreditCents(records.filter((r) => !isExpired(r, asOf)).map(toStoreCreditEntry));
}

/**
 * Pending balance: pending and held rows that no later row references. A row
 * that was promoted or reversed is retired by being referenced, never by being
 * edited, so this walks the references rather than trusting any state flip.
 */
export function pendingCentsOf(records: readonly StoreCreditLedgerRecord[]): number {
  const referenced = new Set<string>();
  for (const record of records) {
    if (record.reversesId !== null) referenced.add(record.reversesId);
  }
  return records
    .filter((r) => (r.state === "pending" || r.state === "held") && !referenced.has(r.id))
    .reduce((sum, r) => sum + r.amountCents, 0);
}

/** The member-facing DTO the routes surface serves. Spendable is clamped at zero. */
export function storeCreditDtoOf(records: readonly StoreCreditLedgerRecord[], asOf: Date): StoreCreditDto {
  return {
    spendableCents: Math.max(0, spendableCentsOf(records, asOf)),
    pendingCents: pendingCentsOf(records),
    entries: records.map((r) => ({
      amountCents: r.amountCents,
      state: r.state,
      reason: r.reason,
      availableAt: r.availableAt,
    })),
  };
}

/** Convenience for the routes wiring: one member's StoreCreditDto. */
export async function storeCreditViewFor(
  repo: StoreCreditLedgerRepository,
  memberId: string,
  asOf: Date,
): Promise<StoreCreditDto> {
  return storeCreditDtoOf(await repo.listForMember(memberId), asOf);
}

function validateRecord(record: StoreCreditLedgerRecord): void {
  if (!record.id) throw new StoreCreditInvalidTransition("A ledger row needs an id.");
  if (!record.memberId) throw new StoreCreditInvalidTransition("A ledger row needs a member id.");
  if (!Number.isSafeInteger(record.amountCents) || record.amountCents === 0) {
    throw new StoreCreditInvalidTransition("amountCents must be a nonzero safe integer of cents.");
  }
  if (!STORE_CREDIT_STATES.includes(record.state)) {
    throw new StoreCreditInvalidTransition(`Unknown ledger state: ${record.state}.`);
  }
  if (!STORE_CREDIT_REASONS.includes(record.reason)) {
    throw new StoreCreditInvalidTransition(`Unknown ledger reason: ${record.reason}.`);
  }
}

/**
 * The shared approve/reverse logic over an already-loaded, member-scoped list.
 * Returns the NEW row to append; it never touches the original.
 */
function buildTransitionRow(
  records: readonly StoreCreditLedgerRecord[],
  memberId: string,
  entryId: string,
  action: StoreCreditAction,
  kind: "approve" | "reverse",
): StoreCreditLedgerRecord {
  const original = records.find((r) => r.id === entryId) ?? null;
  if (!original || original.memberId !== memberId) throw new StoreCreditEntryNotFound(memberId, entryId);
  if (records.some((r) => r.reversesId === entryId)) throw new StoreCreditEntrySettled(entryId);

  if (kind === "approve") {
    if (original.state !== "pending" && original.state !== "held") {
      // fraud_flagged is deliberately unpromotable: there is no API here that
      // marks a fraud review satisfied. Reverse it or leave it flagged.
      throw new StoreCreditInvalidTransition(
        `Only a pending or held credit can approve; entry ${entryId} is ${original.state}.`,
      );
    }
    return {
      id: action.id,
      memberId,
      amountCents: original.amountCents,
      state: "approved",
      reason: original.reason,
      createdAt: action.at.toISOString(),
      availableAt: null,
      reversesId: original.id,
      actorType: action.actorType,
      actorId: action.actorId,
      // The expiry decided at issue carries through promotion unchanged.
      expiresAt: original.expiresAt,
    };
  }

  if (original.amountCents < 0 || original.state === "reversed") {
    throw new StoreCreditInvalidTransition(
      `Entry ${entryId} is itself a closure row; append a new credit instead of reversing a reversal.`,
    );
  }
  const offsetIsSpendableVisible = original.state === "approved";
  return {
    id: action.id,
    memberId,
    amountCents: -original.amountCents,
    // See the header: an approved credit's offset must be approved so the
    // shared balance function nets it out; anything else records as reversed.
    state: offsetIsSpendableVisible ? "approved" : "reversed",
    reason: original.reason,
    createdAt: action.at.toISOString(),
    availableAt: null,
    reversesId: original.id,
    actorType: action.actorType,
    actorId: action.actorId,
    expiresAt: offsetIsSpendableVisible ? original.expiresAt : null,
  };
}

/**
 * The shared spend logic over an already-loaded, member-scoped list. Returns
 * the NEW negative approved row to append. Fails closed: a non-positive or
 * non-integer amount, or an amount above the CURRENT spendable balance, throws
 * rather than letting a member overdraw. The row carries reversesId null (it
 * settles no chain; it draws down the balance), state approved (the only state
 * the shared balance function counts, so the draw is visible to it), and the
 * consuming order in actorId for audit.
 */
function buildSpendRow(
  records: readonly StoreCreditLedgerRecord[],
  memberId: string,
  amountCents: number,
  orderRef: string,
  at: Date,
): StoreCreditLedgerRecord {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new StoreCreditInvalidTransition("A spend must be a positive integer number of cents.");
  }
  if (!orderRef) {
    throw new StoreCreditInvalidTransition("A spend must name the consuming order.");
  }
  const spendable = spendableCentsOf(records, at);
  if (amountCents > spendable) {
    throw new StoreCreditInvalidTransition(
      `Spend of ${amountCents} cents exceeds the spendable balance of ${spendable} cents.`,
    );
  }
  return {
    id: randomUUID(),
    memberId,
    amountCents: -amountCents,
    state: "approved",
    // The shared reason vocabulary has no "spend" member yet (see the header);
    // the adjustment-shaped reason plus the negative amount and the order
    // reference in actorId keep the row honest and auditable.
    reason: "manual_adjustment",
    createdAt: at.toISOString(),
    availableAt: null,
    reversesId: null,
    actorType: "system",
    actorId: orderRef,
    expiresAt: null,
  };
}

// ---------------------------------------------------------------------------
// Row mapping (migration 26 columns exactly; expires_at has no column yet)
// ---------------------------------------------------------------------------

/** A research_store_credit_ledger row, exactly the columns migration 26 defines. */
export interface StoreCreditRow {
  id: string;
  member_id: string;
  amount_cents: number;
  state: string;
  reason: string;
  available_at: string | null;
  reverses_id: string | null;
  actor_type: string;
  actor_id: string | null;
  created_at: string;
}

const STORE_CREDIT_COLUMNS =
  "id, member_id, amount_cents, state, reason, available_at, reverses_id, actor_type, actor_id, created_at";

export function storeCreditRecordToRow(record: StoreCreditLedgerRecord): StoreCreditRow {
  return {
    id: record.id,
    member_id: record.memberId,
    amount_cents: record.amountCents,
    state: record.state,
    reason: record.reason,
    available_at: record.availableAt,
    reverses_id: record.reversesId,
    actor_type: record.actorType,
    actor_id: record.actorId,
    created_at: record.createdAt,
  };
}

export function storeCreditRowToRecord(row: StoreCreditRow): StoreCreditLedgerRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    amountCents: row.amount_cents,
    state: row.state as LedgerEntryState,
    reason: row.reason as StoreCreditReason,
    createdAt: row.created_at,
    availableAt: row.available_at,
    reversesId: row.reverses_id,
    actorType: (row.actor_type === "admin" ? "admin" : "system") as StoreCreditActor,
    actorId: row.actor_id,
    // No column exists (schema gap 1), so a durable row never carries one.
    expiresAt: null,
  };
}

function compareRecords(a: StoreCreditLedgerRecord, b: StoreCreditLedgerRecord): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ---------------------------------------------------------------------------
// In-memory store: the deterministic double and the unconfigured fallback.
// ---------------------------------------------------------------------------

export function createInMemoryStoreCreditLedgerStore(): StoreCreditLedgerRepository {
  // A plain array, appended to and never spliced, mirroring the append-only table.
  const rows: StoreCreditLedgerRecord[] = [];
  const clone = (r: StoreCreditLedgerRecord): StoreCreditLedgerRecord => ({ ...r });
  const forMember = (memberId: string) => rows.filter((r) => r.memberId === memberId).sort(compareRecords);

  return {
    async append(record) {
      validateRecord(record);
      rows.push(clone(record));
    },
    async approve(memberId, entryId, action) {
      const row = buildTransitionRow(forMember(memberId), memberId, entryId, action, "approve");
      rows.push(clone(row));
      return clone(row);
    },
    async reverse(memberId, entryId, action) {
      const row = buildTransitionRow(forMember(memberId), memberId, entryId, action, "reverse");
      rows.push(clone(row));
      return clone(row);
    },
    async spend(memberId, amountCents, orderRef, at) {
      const row = buildSpendRow(forMember(memberId), memberId, amountCents, orderRef, at);
      rows.push(clone(row));
      return clone(row);
    },
    async listForMember(memberId) {
      return forMember(memberId).map(clone);
    },
    async getEntry(memberId, entryId) {
      const found = rows.find((r) => r.id === entryId && r.memberId === memberId);
      return found ? clone(found) : null;
    },
    async spendableCents(memberId, asOf) {
      return spendableCentsOf(forMember(memberId), asOf);
    },
    async pendingCents(memberId) {
      return pendingCentsOf(forMember(memberId));
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store. Insert and read only; the database trigger would
// refuse an update or delete anyway, and this layer never attempts one.
// ---------------------------------------------------------------------------

export function createSupabaseStoreCreditLedgerStore(
  client: SupabaseClient = getSupabaseAdmin(),
): StoreCreditLedgerRepository {
  async function memberRows(memberId: string): Promise<StoreCreditLedgerRecord[]> {
    const res = await client
      .from(STORE_CREDIT_TABLE)
      .select(STORE_CREDIT_COLUMNS)
      .eq("member_id", memberId)
      .order("created_at", { ascending: true });
    if (res.error) throw new Error(`store credit load failed: ${res.error.message}`);
    return ((res.data ?? []) as StoreCreditRow[]).map(storeCreditRowToRecord).sort(compareRecords);
  }

  async function insertRecord(record: StoreCreditLedgerRecord): Promise<void> {
    if (record.expiresAt !== null) {
      // Schema gap 1: refusing beats silently dropping the expiry, which would
      // make the credit immortal in the durable ledger.
      throw new StoreCreditInvalidTransition(
        "Migration 26 has no expires_at column; an expiring credit cannot be persisted durably yet.",
      );
    }
    const ins = await client.from(STORE_CREDIT_TABLE).insert(storeCreditRecordToRow(record));
    if (ins.error) {
      // The partial unique index on reverses_id is the durable one-settlement
      // guard: two racing approvals (or reverses) of one entry both pass the
      // application check over their stale reads, but only one insert wins.
      // The loser surfaces as the SAME typed error the application check
      // raises, so callers cannot tell the two lines of defense apart.
      if ((ins.error as { code?: string }).code === PG_UNIQUE_VIOLATION && record.reversesId !== null) {
        throw new StoreCreditEntrySettled(record.reversesId);
      }
      throw new Error(`store credit append failed: ${ins.error.message}`);
    }
  }

  return {
    async append(record) {
      validateRecord(record);
      await insertRecord(record);
    },
    async approve(memberId, entryId, action) {
      const row = buildTransitionRow(await memberRows(memberId), memberId, entryId, action, "approve");
      await insertRecord(row);
      return row;
    },
    async reverse(memberId, entryId, action) {
      const row = buildTransitionRow(await memberRows(memberId), memberId, entryId, action, "reverse");
      await insertRecord(row);
      return row;
    },
    async spend(memberId, amountCents, orderRef, at) {
      const row = buildSpendRow(await memberRows(memberId), memberId, amountCents, orderRef, at);
      await insertRecord(row);
      return row;
    },
    async listForMember(memberId) {
      return memberRows(memberId);
    },
    async getEntry(memberId, entryId) {
      // Both filters sit in the query itself, so the row of another member is
      // never even fetched, let alone returned.
      const found = await client
        .from(STORE_CREDIT_TABLE)
        .select(STORE_CREDIT_COLUMNS)
        .eq("id", entryId)
        .eq("member_id", memberId)
        .maybeSingle();
      if (found.error) throw new Error(`store credit entry load failed: ${found.error.message}`);
      const row = found.data as StoreCreditRow | null;
      return row ? storeCreditRowToRecord(row) : null;
    },
    async spendableCents(memberId, asOf) {
      return spendableCentsOf(await memberRows(memberId), asOf);
    },
    async pendingCents(memberId) {
      return pendingCentsOf(await memberRows(memberId));
    },
  };
}

/**
 * The real store when Supabase is configured, else the in-memory reference.
 * Consumed only behind the commerce flag, so an unconfigured deployment keeps
 * failing closed rather than silently persisting.
 */
export function resolveStoreCreditLedgerStore(): StoreCreditLedgerRepository {
  return supabaseConfigured() ? createSupabaseStoreCreditLedgerStore() : createInMemoryStoreCreditLedgerStore();
}
