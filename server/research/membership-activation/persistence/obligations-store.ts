// Founding membership activation, Domain 2: persistent obligation storage.
//
// The obligation DOMAIN (../obligations.ts) owns the vocabulary and the
// transitions; the services (../activation.ts, ../renewals.ts) reach
// persistence only through the async ObligationsStore port. This module is the
// durable implementation of that port, following the Track B persistence
// exemplars (server/research/commerce/persistence): pure mappers, an in-memory
// reference, a Supabase implementation over an injected client, and a resolver
// that falls back to the in-memory double when Supabase is not configured, so
// nothing half-persists.
//
// One obligation is two shapes on disk (supabase/research-fm-obligations.sql):
//   - research_fm_obligations       one header row (current state). The method
//                                   and agreement snapshots, the member report,
//                                   and the admin verification live as jsonb.
//                                   None of them ever contain receiving
//                                   details; the method snapshot carries a
//                                   label and an opaque instructions ref only.
//   - research_fm_obligation_events an APPEND-ONLY audit trail. This store
//                                   only ever INSERTs and reads it; a database
//                                   trigger blocks update and delete besides.
//
// Money discipline: a header row whose status or type is not in the exact
// vocabulary THROWS on read rather than being cast through or dropped. An
// obligation holds money, so an uninterpretable one must fail loudly, never
// vanish from a review queue.
//
// Building this does NOT enable the founding activation flow. Everything stays
// behind RESEARCH_FOUNDING_ACTIVATION_ENABLED (default false), which the
// surface wave wires.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OBLIGATION_STATUSES,
  OBLIGATION_TYPES,
  AUDIT_ACTOR_TYPES,
  type AuditActorType,
  type AgreementVersionsSnapshot,
  type AdminVerification,
  type BridgePhase,
  BRIDGE_PHASES,
  type MemberPaymentSubmission,
  type ObligationAuditEvent,
  type ObligationRecord,
  type ObligationStatus,
  type ObligationType,
  type PaymentMethodSnapshot,
} from "../obligations";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// The async storage port
// ---------------------------------------------------------------------------

export interface ObligationsStore {
  get(obligationId: string): Promise<ObligationRecord | null>;
  findByHumanRef(humanRef: string): Promise<ObligationRecord | null>;
  /** Upsert the header and append any events not yet persisted. Events already
   * on disk are never rewritten. */
  save(record: ObligationRecord): Promise<void>;
  listByMember(memberId: string): Promise<ObligationRecord[]>;
  /** Admin cross-member read for the review queue and duplicate detection. */
  listAll(): Promise<ObligationRecord[]>;
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

/** A research_fm_obligations row, the columns this store maps. */
export interface ObligationHeaderRow {
  id: string;
  human_ref: string;
  member_id: string;
  type: string;
  expected_amount_cents: number;
  currency: string;
  description: string;
  status: string;
  bridge_phase: string;
  method: PaymentMethodSnapshot;
  agreements: AgreementVersionsSnapshot;
  submission: MemberPaymentSubmission | null;
  verification: AdminVerification | null;
  receiving_account_ref: string | null;
  receipt_ref: string | null;
  created_at: string;
  due_at: string;
  expires_at: string;
}

/** An insertable research_fm_obligation_events row. Append only: there is no
 * update or delete shape because a historical event is never rewritten. */
export interface ObligationEventRow {
  event_id: string;
  obligation_id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  actor_role: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  occurred_at: string;
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

const STATUSES: ReadonlySet<string> = new Set(OBLIGATION_STATUSES);
const TYPES: ReadonlySet<string> = new Set(OBLIGATION_TYPES);
const PHASES: ReadonlySet<string> = new Set(BRIDGE_PHASES);
const ACTORS: ReadonlySet<string> = new Set(AUDIT_ACTOR_TYPES);

/** Map the domain record to an upsertable header row. */
export function obligationToHeaderRow(record: ObligationRecord): ObligationHeaderRow {
  return {
    id: record.obligationId,
    human_ref: record.humanRef,
    member_id: record.memberId,
    type: record.type,
    expected_amount_cents: record.expectedAmountCents,
    currency: record.currency,
    description: record.description,
    status: record.status,
    bridge_phase: record.bridgePhase,
    method: { ...record.method },
    agreements: {
      capturedAt: record.agreements.capturedAt,
      agreements: record.agreements.agreements.map((a) => ({ ...a })),
    },
    submission: record.submission ? { ...record.submission } : null,
    verification: record.verification ? { ...record.verification } : null,
    receiving_account_ref: record.receivingAccountRef,
    receipt_ref: record.receiptRef,
    created_at: record.createdAt,
    due_at: record.dueAt,
    expires_at: record.expiresAt,
  };
}

/**
 * Map a header row plus its event rows to the domain record. A row whose type,
 * status, or bridge phase is outside the exact vocabulary THROWS: this table
 * holds money, so an uninterpretable row fails loudly rather than vanishing
 * or being guessed at.
 */
export function headerRowToObligation(
  row: ObligationHeaderRow,
  eventRows: readonly ObligationEventRow[] = [],
): ObligationRecord {
  if (!STATUSES.has(row.status)) {
    throw new Error(`obligation ${row.id} carries an unknown status: ${row.status}`);
  }
  if (!TYPES.has(row.type)) {
    throw new Error(`obligation ${row.id} carries an unknown type: ${row.type}`);
  }
  if (!PHASES.has(row.bridge_phase)) {
    throw new Error(`obligation ${row.id} carries an unknown bridge phase: ${row.bridge_phase}`);
  }
  return {
    obligationId: row.id,
    humanRef: row.human_ref,
    memberId: row.member_id,
    type: row.type as ObligationType,
    expectedAmountCents: row.expected_amount_cents,
    currency: row.currency,
    description: row.description,
    status: row.status as ObligationStatus,
    bridgePhase: row.bridge_phase as BridgePhase,
    method: { ...row.method },
    agreements: {
      capturedAt: row.agreements.capturedAt,
      agreements: row.agreements.agreements.map((a) => ({ ...a })),
    },
    submission: row.submission ? { ...row.submission } : null,
    verification: row.verification ? { ...row.verification } : null,
    receivingAccountRef: row.receiving_account_ref ?? null,
    receiptRef: row.receipt_ref ?? null,
    createdAt: row.created_at,
    dueAt: row.due_at,
    expiresAt: row.expires_at,
    events: eventRowsToEvents(eventRows),
  };
}

/** Map a domain audit event to its append-only insert row. */
export function eventToRow(event: ObligationAuditEvent): ObligationEventRow {
  return {
    event_id: event.eventId,
    obligation_id: event.obligationId,
    action: event.action,
    actor_type: event.actorType,
    actor_id: event.actorId,
    actor_role: event.actorRole,
    ip_hash: event.ipHash,
    user_agent_hash: event.userAgentHash,
    from_status: event.fromStatus,
    to_status: event.toStatus,
    detail: event.detail,
    occurred_at: event.occurredAt,
  };
}

/** Map persisted event rows back to the domain, in occurrence order. An event
 * row with an unknown actor type or status is dropped rather than guessed;
 * unlike the header it is history, not money, and the checks in the database
 * make such a row nearly impossible anyway. */
export function eventRowsToEvents(rows: readonly ObligationEventRow[]): ObligationAuditEvent[] {
  const out: ObligationAuditEvent[] = [];
  for (const row of [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    if (!ACTORS.has(row.actor_type)) continue;
    if (row.from_status !== null && !STATUSES.has(row.from_status)) continue;
    if (row.to_status !== null && !STATUSES.has(row.to_status)) continue;
    out.push({
      eventId: row.event_id,
      obligationId: row.obligation_id,
      action: row.action,
      actorType: row.actor_type as AuditActorType,
      actorId: row.actor_id ?? null,
      actorRole: row.actor_role ?? null,
      ipHash: row.ip_hash ?? null,
      userAgentHash: row.user_agent_hash ?? null,
      fromStatus: (row.from_status as ObligationStatus | null) ?? null,
      toStatus: (row.to_status as ObligationStatus | null) ?? null,
      detail: row.detail ?? null,
      occurredAt: row.occurred_at,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// In-memory reference. Copies on the way in and out so a caller cannot mutate
// stored state through a held reference.
// ---------------------------------------------------------------------------

function cloneRecord(record: ObligationRecord): ObligationRecord {
  return {
    ...record,
    method: { ...record.method },
    agreements: {
      capturedAt: record.agreements.capturedAt,
      agreements: record.agreements.agreements.map((a) => ({ ...a })),
    },
    submission: record.submission ? { ...record.submission } : null,
    verification: record.verification ? { ...record.verification } : null,
    events: record.events.map((e) => ({ ...e })),
  };
}

export function createInMemoryObligationsStore(
  seed: readonly ObligationRecord[] = [],
): ObligationsStore {
  const rows = new Map<string, ObligationRecord>();
  seed.forEach((record) => rows.set(record.obligationId, cloneRecord(record)));
  const all = (): ObligationRecord[] => Array.from(rows.values()).map(cloneRecord);
  return {
    async get(obligationId) {
      const found = rows.get(obligationId);
      return found ? cloneRecord(found) : null;
    },
    async findByHumanRef(humanRef) {
      const found = Array.from(rows.values()).find((r) => r.humanRef === humanRef);
      return found ? cloneRecord(found) : null;
    },
    async save(record) {
      const prior = rows.get(record.obligationId);
      if (prior) {
        // The trail is append-only even in memory: an event already recorded
        // is kept as recorded, and only genuinely new events are appended.
        const known = new Set(prior.events.map((e) => e.eventId));
        const merged = [
          ...prior.events,
          ...record.events.filter((e) => !known.has(e.eventId)),
        ];
        rows.set(record.obligationId, { ...cloneRecord(record), events: merged.map((e) => ({ ...e })) });
      } else {
        rows.set(record.obligationId, cloneRecord(record));
      }
    },
    async listByMember(memberId) {
      return all().filter((record) => record.memberId === memberId);
    },
    async listAll() {
      return all();
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store. Service-role client, server-only; RLS with no
// policies is the backstop. Member reads are scoped by the member id the port
// passes; listAll is the deliberate admin cross-member path.
// ---------------------------------------------------------------------------

const OBLIGATIONS = "research_fm_obligations";
const EVENTS = "research_fm_obligation_events";

const EVENT_COLS =
  "event_id, obligation_id, action, actor_type, actor_id, actor_role, ip_hash, user_agent_hash, from_status, to_status, detail, occurred_at";

export function createSupabaseObligationsStore(
  client: SupabaseClient = getSupabaseAdmin(),
): ObligationsStore {
  async function loadEvents(obligationId: string): Promise<ObligationEventRow[]> {
    const res = await client.from(EVENTS).select(EVENT_COLS).eq("obligation_id", obligationId);
    if (res.error) throw new Error(`obligation events load failed: ${res.error.message}`);
    return (res.data ?? []) as ObligationEventRow[];
  }

  async function hydrate(header: ObligationHeaderRow): Promise<ObligationRecord> {
    return headerRowToObligation(header, await loadEvents(header.id));
  }

  return {
    async get(obligationId) {
      const res = await client.from(OBLIGATIONS).select("*").eq("id", obligationId).maybeSingle();
      if (res.error) throw new Error(`obligation load failed: ${res.error.message}`);
      if (!res.data) return null;
      return hydrate(res.data as ObligationHeaderRow);
    },

    async findByHumanRef(humanRef) {
      const res = await client.from(OBLIGATIONS).select("*").eq("human_ref", humanRef).maybeSingle();
      if (res.error) throw new Error(`obligation ref lookup failed: ${res.error.message}`);
      if (!res.data) return null;
      return hydrate(res.data as ObligationHeaderRow);
    },

    async save(record) {
      const up = await client.from(OBLIGATIONS).upsert(obligationToHeaderRow(record), { onConflict: "id" });
      if (up.error) throw new Error(`obligation upsert failed: ${up.error.message}`);

      // Append-only events: read what is already on disk, insert only what is
      // new. Never update, never delete; the DB trigger enforces the same.
      const existing = await loadEvents(record.obligationId);
      const known = new Set(existing.map((row) => row.event_id));
      const fresh = record.events.filter((event) => !known.has(event.eventId));
      if (fresh.length > 0) {
        const ins = await client.from(EVENTS).insert(fresh.map(eventToRow));
        if (ins.error) throw new Error(`obligation event insert failed: ${ins.error.message}`);
      }
    },

    async listByMember(memberId) {
      const res = await client.from(OBLIGATIONS).select("*").eq("member_id", memberId);
      if (res.error) throw new Error(`obligation list by member failed: ${res.error.message}`);
      const headers = (res.data ?? []) as ObligationHeaderRow[];
      const out: ObligationRecord[] = [];
      for (const header of headers) out.push(await hydrate(header));
      return out;
    },

    async listAll() {
      const res = await client.from(OBLIGATIONS).select("*");
      if (res.error) throw new Error(`obligation list all failed: ${res.error.message}`);
      const headers = (res.data ?? []) as ObligationHeaderRow[];
      const out: ObligationRecord[] = [];
      for (const header of headers) out.push(await hydrate(header));
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution: durable when Supabase is configured, else the in-memory
// reference so an unconfigured deployment fails closed rather than
// half-persisting.
// ---------------------------------------------------------------------------

export function resolveObligationsStore(): ObligationsStore {
  return supabaseConfigured() ? createSupabaseObligationsStore() : createInMemoryObligationsStore();
}
