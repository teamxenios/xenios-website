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
// SPENDABLE VERSUS PENDING. The in-memory reference uses the canonical shared
// approved/unexpired rule. Durable balances come from the complete-ledger RPC,
// including active checkout reservations; a history page is NOT money authority.
// Pending counts pending and held rows that no later row references.
// A pending, held, reversed, or fraud_flagged row is NEVER spendable.
//
// REVIEW CAN NEVER BE BOUGHT. Large-order review evaluates the GROSS order
// value, before any credit applies. grossOrderValueForReviewCents makes that
// structural: credit has no parameter in its signature, so a caller cannot
// even pass it. And this store exposes NO API that marks a payment or fraud
// review satisfied; a fraud_flagged credit can only be reversed here, never
// promoted.
//
// REQUIRED SCHEMA FIDELITY (fail closed):
//   1. The canonical Track B production bundle adds expires_at. Both stores
//      preserve that value in read projections and row mappings. A missing column,
//      missing projection or invalid timestamp must fail, not create immortal
//      credit. This adapter does not install the required schema.
//      New durable expiring-credit writes still refuse until expiry-allocated
//      spending is implemented: a non-expiring debit must not outlive its grant
//      and consume a later unrelated grant. Mapping fidelity is not activation.
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
// balance, with the consuming order carried in actor_id for audit. Durable
// spending is one serialized, order-idempotent RPC, never read-then-insert. The shared
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
const STORE_CREDIT_BALANCE_RPC = "research_store_credit_balance";
const STORE_CREDIT_SPEND_RPC = "research_store_credit_spend";
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
 * the expiry fixed at issue time in the canonical Track B schema.
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

export interface StoreCreditBalanceSnapshot {
  /** Signed approved/unexpired balance after active checkout reservations. */
  spendableCents: number;
  pendingCents: number;
  reservedCents: number;
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
  /** Member-scoped history, oldest first; durable history may be transport-capped. Never balance authority. */
  listForMember(memberId: string): Promise<readonly StoreCreditLedgerRecord[]>;
  /** One row, only if it belongs to the given member. */
  getEntry(memberId: string, entryId: string): Promise<StoreCreditLedgerRecord | null>;
  /** Authoritative approved/unexpired balance, net of active durable reservations. */
  spendableCents(memberId: string, asOf: Date): Promise<number>;
  /** Pending and held rows no later row has settled. Never spendable. */
  pendingCents(memberId: string): Promise<number>;
  /** One authoritative monetary snapshot. Optional for existing repository implementations. */
  balanceSnapshot?(memberId: string, asOf: Date): Promise<StoreCreditBalanceSnapshot>;
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

function expiryMillis(value: string | null): number | null {
  if (value === null) return null;
  const ms = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(ms)) {
    throw new StoreCreditInvalidTransition("Store credit expiry must be a valid timestamp or explicit null.");
  }
  return ms;
}

function isExpired(record: StoreCreditLedgerRecord, asOf: Date): boolean {
  const ms = expiryMillis(record.expiresAt);
  return ms !== null && ms <= asOf.getTime();
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
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new StoreCreditInvalidTransition("Store credit evaluation requires a valid clock.");
  }
  records.forEach(validateRecord);
  const eligible = records.filter((r) => !isExpired(r, asOf));
  // Keep the canonical shared state rule. Refuse a lossy intermediate sum
  // before calling it; a rounded balance cannot authorize a monetary effect.
  checkedCreditSum(eligible.filter((r) => r.state === "approved"));
  return spendableStoreCreditCents(eligible.map(toStoreCreditEntry));
}

function checkedCreditSum(records: readonly StoreCreditLedgerRecord[]): number {
  return records.reduce((sum, record) => {
    const next = sum + record.amountCents;
    if (!Number.isSafeInteger(next)) {
      throw new StoreCreditInvalidTransition("Store credit aggregate exceeds exact integer capacity.");
    }
    return next;
  }, 0);
}

/**
 * Pending balance: pending and held rows that no later row references. A row
 * that was promoted or reversed is retired by being referenced, never by being
 * edited, so this walks the references rather than trusting any state flip.
 */
export function pendingCentsOf(records: readonly StoreCreditLedgerRecord[]): number {
  records.forEach(validateRecord);
  const referenced = new Set<string>();
  for (const record of records) {
    if (record.reversesId !== null) referenced.add(record.reversesId);
  }
  return checkedCreditSum(records
    .filter((r) => (r.state === "pending" || r.state === "held") && !referenced.has(r.id)));
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
  validClock(asOf);
  const [records, balance] = await Promise.all([
    repo.listForMember(memberId),
    repo.balanceSnapshot
      ? repo.balanceSnapshot(memberId, asOf)
      : Promise.all([repo.spendableCents(memberId, asOf), repo.pendingCents(memberId)])
        .then(([spendableCents, pendingCents]) => ({ spendableCents, pendingCents, reservedCents: 0 })),
  ]);
  validateBalance(balance);
  records.forEach(record => {
    validateRecord(record);
    if (record.memberId !== memberId) throw new StoreCreditInvalidTransition("Store credit member projection disagrees.");
  });
  return {
    spendableCents: Math.max(0, balance.spendableCents),
    pendingCents: balance.pendingCents,
    entries: records.map(({ amountCents, state, reason, availableAt }) => ({ amountCents, state, reason, availableAt })),
  };
}

function validClock(at: Date): string {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    throw new StoreCreditInvalidTransition("Store credit evaluation requires a valid clock.");
  }
  return at.toISOString();
}

function validateBalance(balance: StoreCreditBalanceSnapshot): void {
  if (!balance || !Number.isSafeInteger(balance.spendableCents)
    || !Number.isSafeInteger(balance.pendingCents) || !Number.isSafeInteger(balance.reservedCents)
    || balance.reservedCents < 0) {
    throw new StoreCreditInvalidTransition("Store credit balance projection is unavailable or unsafe.");
  }
}

function validateSpendInput(memberId: string, amountCents: number, orderRef: string, at: Date): string {
  if (typeof memberId !== "string" || !memberId.trim()) {
    throw new StoreCreditInvalidTransition("A spend must name the owning member.");
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new StoreCreditInvalidTransition("A spend must be a positive integer number of cents.");
  }
  if (typeof orderRef !== "string" || !orderRef.trim()) {
    throw new StoreCreditInvalidTransition("A spend must name the consuming order.");
  }
  return validClock(at);
}

function validateSpendResult(record: StoreCreditLedgerRecord, memberId: string, amountCents: number, orderRef: string): void {
  validateRecord(record);
  if (record.memberId !== memberId || record.amountCents !== -amountCents || record.state !== "approved"
    || record.reason !== "manual_adjustment" || record.actorType !== "system" || record.actorId !== orderRef
    || record.reversesId !== null || record.availableAt !== null || record.expiresAt !== null) {
    throw new StoreCreditInvalidTransition("Store credit spend projection disagrees with the requested order debit.");
  }
}

function validateRecord(record: StoreCreditLedgerRecord): void {
  expiryMillis(record.expiresAt);
  if (typeof record.id !== "string" || !record.id.trim()) throw new StoreCreditInvalidTransition("A ledger row needs an id.");
  if (typeof record.memberId !== "string" || !record.memberId.trim()) throw new StoreCreditInvalidTransition("A ledger row needs a member id.");
  if (!Number.isSafeInteger(record.amountCents) || record.amountCents === 0) {
    throw new StoreCreditInvalidTransition("amountCents must be a nonzero safe integer of cents.");
  }
  if (!STORE_CREDIT_STATES.includes(record.state)) {
    throw new StoreCreditInvalidTransition(`Unknown ledger state: ${record.state}.`);
  }
  if (!STORE_CREDIT_REASONS.includes(record.reason)) {
    throw new StoreCreditInvalidTransition(`Unknown ledger reason: ${record.reason}.`);
  }
  if (record.actorType !== "admin" && record.actorType !== "system") {
    throw new StoreCreditInvalidTransition("Store credit actor type is not supported.");
  }
  for (const value of [record.reversesId, record.actorId]) {
    if (value !== null && (typeof value !== "string" || !value.trim())) {
      throw new StoreCreditInvalidTransition("Store credit reference must be text or explicit null.");
    }
  }
  if (typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))
    || (record.availableAt !== null && (typeof record.availableAt !== "string" || !Number.isFinite(Date.parse(record.availableAt))))) {
    throw new StoreCreditInvalidTransition("Store credit timestamps are missing or invalid.");
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
  validateSpendInput(memberId, amountCents, orderRef, at);
  const prior = records.filter(record => record.actorId === orderRef);
  if (prior.length > 0) {
    if (prior.length !== 1) throw new StoreCreditInvalidTransition("Store credit order debit is ambiguous.");
    validateSpendResult(prior[0], memberId, amountCents, orderRef);
    return prior[0];
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
// Row mapping (migration 26 plus the canonical Track B expires_at addition)
// ---------------------------------------------------------------------------

/** A research_store_credit_ledger row from the canonical Track B schema. */
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
  expires_at: string | null;
}

const STORE_CREDIT_COLUMNS =
  "id, member_id, amount_cents, state, reason, available_at, reverses_id, actor_type, actor_id, created_at, expires_at";

function singleRpcRow(data: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== "object" || Array.isArray(data[0])) {
    throw new StoreCreditInvalidTransition("Store credit RPC requires exactly one canonical row.");
  }
  const row = data[0] as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(row, key))) {
    throw new StoreCreditInvalidTransition("Store credit RPC row projection disagrees.");
  }
  return row;
}

export function storeCreditRecordToRow(record: StoreCreditLedgerRecord): StoreCreditRow {
  expiryMillis(record.expiresAt);
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
    expires_at: record.expiresAt,
  };
}

export function storeCreditRowToRecord(row: StoreCreditRow): StoreCreditLedgerRecord {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new StoreCreditInvalidTransition("Store credit row projection is unavailable.");
  }
  const record: StoreCreditLedgerRecord = {
    id: row.id,
    memberId: row.member_id,
    amountCents: row.amount_cents,
    state: row.state as LedgerEntryState,
    reason: row.reason as StoreCreditReason,
    createdAt: row.created_at,
    availableAt: row.available_at,
    reversesId: row.reverses_id,
    actorType: row.actor_type as StoreCreditActor,
    actorId: row.actor_id,
    expiresAt: row.expires_at,
  };
  validateRecord(record);
  return record;
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
      if (rows.some(row => row.actorId === orderRef && row.memberId !== memberId)) {
        throw new StoreCreditInvalidTransition("Store credit order debit belongs to a different member.");
      }
      const row = buildSpendRow(forMember(memberId), memberId, amountCents, orderRef, at);
      if (!rows.some(existing => existing.id === row.id)) rows.push(clone(row));
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
    async balanceSnapshot(memberId, asOf) {
      const records = forMember(memberId);
      return { spendableCents: spendableCentsOf(records, asOf), pendingCents: pendingCentsOf(records), reservedCents: 0 };
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
  async function balanceSnapshot(memberId: string, asOf: Date): Promise<StoreCreditBalanceSnapshot> {
    const at = validClock(asOf);
    if (typeof memberId !== "string" || !memberId.trim()) {
      throw new StoreCreditInvalidTransition("A balance requires the owning member.");
    }
    const result = await client.rpc(STORE_CREDIT_BALANCE_RPC, { p_member_id: memberId, p_as_of: at });
    if (result.error) throw new Error(`store credit balance failed: ${result.error.message}`);
    const row = singleRpcRow(result.data, ["spendable_cents", "pending_cents", "reserved_cents"]);
    const balance = {
      spendableCents: row.spendable_cents,
      pendingCents: row.pending_cents,
      reservedCents: row.reserved_cents,
    } as StoreCreditBalanceSnapshot;
    validateBalance(balance);
    return balance;
  }

  async function memberRows(memberId: string): Promise<StoreCreditLedgerRecord[]> {
    // This display/lifecycle history may be limited by the provider's row cap.
    // Never use it to authorize spend or compute the member's monetary totals.
    const res = await client
      .from(STORE_CREDIT_TABLE)
      .select(STORE_CREDIT_COLUMNS)
      .eq("member_id", memberId)
      .order("created_at", { ascending: true });
    if (res.error) throw new Error(`store credit load failed: ${res.error.message}`);
    if (!Array.isArray(res.data)) {
      throw new StoreCreditInvalidTransition("Store credit list projection is unavailable.");
    }
    const records = (res.data as StoreCreditRow[]).map(storeCreditRowToRecord);
    if (records.some((record) => record.memberId !== memberId)) {
      throw new StoreCreditInvalidTransition("Store credit member projection disagrees.");
    }
    return records.sort(compareRecords);
  }

  async function insertRecord(record: StoreCreditLedgerRecord): Promise<void> {
    if (record.expiresAt !== null) {
      throw new StoreCreditInvalidTransition(
        "Expiring credit writes require expiry-allocated spending qualification; no ledger row was written.",
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
      const timestamp = validateSpendInput(memberId, amountCents, orderRef, at);
      const result = await client.rpc(STORE_CREDIT_SPEND_RPC, {
        p_member_id: memberId, p_amount_cents: amountCents, p_order_id: orderRef, p_at: timestamp,
      });
      if (result.error) throw new Error(`store credit spend failed: ${result.error.message}`);
      const row = singleRpcRow(result.data, [...STORE_CREDIT_COLUMNS.split(", "), "spend_order_id"]);
      if (row.spend_order_id !== orderRef) {
        throw new StoreCreditInvalidTransition("Store credit spend order binding disagrees.");
      }
      const record = storeCreditRowToRecord(row as unknown as StoreCreditRow);
      validateSpendResult(record, memberId, amountCents, orderRef);
      // A replay may return the original timestamp/id. A transport failure or
      // invalid result is uncertain, never permission for an insert fallback.
      return record;
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
      if (found.data === null) return null;
      const record = storeCreditRowToRecord(found.data as StoreCreditRow);
      if (record.memberId !== memberId || record.id !== entryId) {
        throw new StoreCreditInvalidTransition("Store credit entry projection disagrees.");
      }
      return record;
    },
    async spendableCents(memberId, asOf) {
      return (await balanceSnapshot(memberId, asOf)).spendableCents;
    },
    async pendingCents(memberId) {
      return (await balanceSnapshot(memberId, new Date())).pendingCents;
    },
    balanceSnapshot,
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
