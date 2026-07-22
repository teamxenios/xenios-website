// Founding membership activation, Domain 2: persistent membership periods.
//
// A period is 30 calendar days of coverage funded by exactly one verified
// obligation. Periods are APPEND-ONLY: once written, a period is never updated
// or deleted (a correction would be a new obligation and a new period), so the
// port has no update path at all and the database backs it with a trigger and
// a UNIQUE constraint on the funding obligation. That unique constraint is
// what makes "a duplicate approval cannot extend twice" a database fact, not
// an application promise.
//
// Pattern per the Track B persistence exemplars: pure mappers, an in-memory
// reference, a Supabase implementation over an injected client, and a resolver
// fallback. Building this does NOT enable the flow; everything stays behind
// RESEARCH_FOUNDING_ACTIVATION_ENABLED (default false).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, supabaseConfigured } from "../../../supabase";

// ---------------------------------------------------------------------------
// Domain shape
// ---------------------------------------------------------------------------

export interface MembershipPeriodRecord {
  periodId: string;
  memberId: string;
  /** 1 for the activation period, then 2, 3, ... per renewal. */
  sequence: number;
  startsAt: string;
  endsAt: string;
  /** The verified obligation that paid for this period. Exactly one period
   * may ever exist per funding obligation. */
  fundingObligationId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// The async storage port (append-only: no update, no delete)
// ---------------------------------------------------------------------------

export interface PeriodsStore {
  /** Insert a new period. Throws if the funding obligation already funded one. */
  append(period: MembershipPeriodRecord): Promise<void>;
  get(periodId: string): Promise<MembershipPeriodRecord | null>;
  /** All periods for a member, ordered by sequence ascending. */
  listByMember(memberId: string): Promise<MembershipPeriodRecord[]>;
  /** The member's highest-sequence period, or null before activation. */
  latestForMember(memberId: string): Promise<MembershipPeriodRecord | null>;
  /** The period a given obligation funded, if any (the double-extend guard). */
  findByFundingObligation(obligationId: string): Promise<MembershipPeriodRecord | null>;
}

// ---------------------------------------------------------------------------
// Row shape and pure mappers
// ---------------------------------------------------------------------------

/** A research_fm_membership_periods row. */
export interface PeriodRow {
  id: string;
  member_id: string;
  sequence: number;
  starts_at: string;
  ends_at: string;
  funding_obligation_id: string;
  created_at: string;
}

export function periodToRow(record: MembershipPeriodRecord): PeriodRow {
  return {
    id: record.periodId,
    member_id: record.memberId,
    sequence: record.sequence,
    starts_at: record.startsAt,
    ends_at: record.endsAt,
    funding_obligation_id: record.fundingObligationId,
    created_at: record.createdAt,
  };
}

/** Map a persisted row to the domain record. A period with a non-positive
 * sequence or an end that does not follow its start THROWS: coverage is a
 * money artifact, so a nonsensical row fails loudly rather than being read
 * through. */
export function rowToPeriod(row: PeriodRow): MembershipPeriodRecord {
  if (!Number.isInteger(row.sequence) || row.sequence < 1) {
    throw new Error(`membership period ${row.id} carries an invalid sequence: ${row.sequence}`);
  }
  if (Date.parse(row.ends_at) <= Date.parse(row.starts_at)) {
    throw new Error(`membership period ${row.id} ends before it starts`);
  }
  return {
    periodId: row.id,
    memberId: row.member_id,
    sequence: row.sequence,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    fundingObligationId: row.funding_obligation_id,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

export function createInMemoryPeriodsStore(
  seed: readonly MembershipPeriodRecord[] = [],
): PeriodsStore {
  const rows = new Map<string, MembershipPeriodRecord>();
  const byObligation = new Map<string, string>();
  const admit = (period: MembershipPeriodRecord) => {
    rows.set(period.periodId, { ...period });
    byObligation.set(period.fundingObligationId, period.periodId);
  };
  seed.forEach(admit);
  return {
    async append(period) {
      if (byObligation.has(period.fundingObligationId)) {
        throw new Error(
          `obligation ${period.fundingObligationId} already funded a period; a duplicate approval cannot extend twice`,
        );
      }
      admit(period);
    },
    async get(periodId) {
      const found = rows.get(periodId);
      return found ? { ...found } : null;
    },
    async listByMember(memberId) {
      return Array.from(rows.values())
        .filter((period) => period.memberId === memberId)
        .sort((a, b) => a.sequence - b.sequence)
        .map((period) => ({ ...period }));
    },
    async latestForMember(memberId) {
      const mine = await this.listByMember(memberId);
      return mine.length > 0 ? mine[mine.length - 1] : null;
    },
    async findByFundingObligation(obligationId) {
      const periodId = byObligation.get(obligationId);
      if (!periodId) return null;
      const found = rows.get(periodId);
      return found ? { ...found } : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed store. Insert and select only; the database trigger blocks
// update and delete, and the UNIQUE (funding_obligation_id) constraint makes
// the double-extend impossible under concurrency, not just in this process.
// ---------------------------------------------------------------------------

const PERIODS = "research_fm_membership_periods";

const UNIQUE_VIOLATION = "23505";

export function createSupabasePeriodsStore(
  client: SupabaseClient = getSupabaseAdmin(),
): PeriodsStore {
  return {
    async append(period) {
      const ins = await client.from(PERIODS).insert(periodToRow(period));
      if (ins.error) {
        if ((ins.error as { code?: string }).code === UNIQUE_VIOLATION) {
          throw new Error(
            `obligation ${period.fundingObligationId} already funded a period; a duplicate approval cannot extend twice`,
          );
        }
        throw new Error(`membership period insert failed: ${ins.error.message}`);
      }
    },

    async get(periodId) {
      const res = await client.from(PERIODS).select("*").eq("id", periodId).maybeSingle();
      if (res.error) throw new Error(`membership period load failed: ${res.error.message}`);
      if (!res.data) return null;
      return rowToPeriod(res.data as PeriodRow);
    },

    async listByMember(memberId) {
      const res = await client.from(PERIODS).select("*").eq("member_id", memberId);
      if (res.error) throw new Error(`membership period list failed: ${res.error.message}`);
      const rows = (res.data ?? []) as PeriodRow[];
      return rows.map(rowToPeriod).sort((a, b) => a.sequence - b.sequence);
    },

    async latestForMember(memberId) {
      const mine = await this.listByMember(memberId);
      return mine.length > 0 ? mine[mine.length - 1] : null;
    },

    async findByFundingObligation(obligationId) {
      const res = await client
        .from(PERIODS)
        .select("*")
        .eq("funding_obligation_id", obligationId)
        .maybeSingle();
      if (res.error) throw new Error(`membership period lookup failed: ${res.error.message}`);
      if (!res.data) return null;
      return rowToPeriod(res.data as PeriodRow);
    },
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export function resolvePeriodsStore(): PeriodsStore {
  return supabaseConfigured() ? createSupabasePeriodsStore() : createInMemoryPeriodsStore();
}
