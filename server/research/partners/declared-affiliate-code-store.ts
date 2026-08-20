// xenios research: durable storage for the customer-declared affiliate code.
//
// Append + read only, mirroring the attribution touch store: a claim and a
// manual match are historical facts, so this seam carries no update and no
// delete method, and the candidate table backs the same rule by granting
// service_role INSERT and SELECT alone.
//
// THE CALLER MUST NEVER LET A FAILURE HERE REACH THE CUSTOMER. The founder's
// rule is that an unusable — or unstorable — code never stops an order, so
// `recordCapture` below swallows its own storage faults and reports whether
// the claim was recorded, instead of throwing into a submit path.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  captureEventFor,
  projectDeclaredAffiliateCode,
  type DeclaredAffiliateCodeEvent,
  type DeclaredAffiliateCodeProjection,
} from "./declared-affiliate-code";
import { getSupabaseAdmin, supabaseConfigured } from "../../supabase";

const DECLARED_CODES = "research_affiliate_declared_codes";

/** PostgREST unique violation: the one-capture-per-request index firing. */
const UNIQUE_VIOLATION = "23505";

export interface AsyncDeclaredAffiliateCodeStore {
  /** Append one event. A duplicate capture is a no-op, not an error. */
  append(event: DeclaredAffiliateCodeEvent): Promise<void>;
  /** Every event for one request, for the projection to walk. */
  eventsFor(requestRef: string): Promise<DeclaredAffiliateCodeEvent[]>;
}

export function createInMemoryDeclaredAffiliateCodeStore(): AsyncDeclaredAffiliateCodeStore {
  const byRequest = new Map<string, DeclaredAffiliateCodeEvent[]>();
  return {
    async append(event) {
      const existing = byRequest.get(event.requestRef) ?? [];
      // The durable index allows one capture per request; the reference
      // rejects a second one identically, so the two cannot disagree.
      if (
        event.kind === "captured" &&
        existing.some((candidate) => candidate.kind === "captured")
      ) {
        return;
      }
      existing.push(event);
      byRequest.set(event.requestRef, existing);
    },
    async eventsFor(requestRef) {
      return (byRequest.get(requestRef) ?? []).map((event) => ({ ...event }));
    },
  };
}

/** A research_affiliate_declared_codes row, exactly the columns an event needs. */
interface DeclaredCodeRow {
  request_ref: string;
  kind: string;
  raw_code: string | null;
  match_key: string | null;
  invalid_reason: string | null;
  partner_id: string | null;
  actor_admin_id: string | null;
  note: string | null;
  occurred_at: string;
}

const ROW_COLUMNS =
  "request_ref, kind, raw_code, match_key, invalid_reason, partner_id, actor_admin_id, note, occurred_at";

function eventToRow(event: DeclaredAffiliateCodeEvent): DeclaredCodeRow {
  const base = {
    request_ref: event.requestRef,
    kind: event.kind,
    raw_code: null as string | null,
    match_key: null as string | null,
    invalid_reason: null as string | null,
    partner_id: null as string | null,
    actor_admin_id: null as string | null,
    note: null as string | null,
    occurred_at: event.occurredAt,
  };
  // Explicit construction per kind, so a field added to one event variant
  // later cannot reach a column it does not belong in.
  if (event.kind === "captured") {
    return {
      ...base,
      raw_code: event.rawCode,
      match_key: event.matchKey,
      invalid_reason: event.invalidReason,
    };
  }
  if (event.kind === "matched") {
    return {
      ...base,
      partner_id: event.partnerId,
      actor_admin_id: event.matchedByAdminId,
      note: event.note,
    };
  }
  return { ...base, actor_admin_id: event.clearedByAdminId, note: event.note };
}

/**
 * Map a row back to an event, or null when the row is not a shape this version
 * writes — the same "drop, do not guess" discipline the partners-store channel
 * guards apply, so a foreign row can never masquerade as a customer's claim.
 */
export function declaredCodeRowToEvent(
  row: DeclaredCodeRow,
): DeclaredAffiliateCodeEvent | null {
  if (row.kind === "captured") {
    const usable = row.raw_code !== null && row.match_key !== null;
    const refused = row.raw_code === null && row.match_key === null && row.invalid_reason !== null;
    if (!usable && !refused) return null;
    if (
      row.invalid_reason !== null &&
      row.invalid_reason !== "address_shaped" &&
      row.invalid_reason !== "no_matchable_characters"
    ) {
      return null;
    }
    return {
      kind: "captured",
      requestRef: row.request_ref,
      rawCode: row.raw_code,
      matchKey: row.match_key,
      invalidReason: row.invalid_reason as
        | "address_shaped"
        | "no_matchable_characters"
        | null,
      occurredAt: row.occurred_at,
    };
  }
  if (row.kind === "matched") {
    if (row.partner_id === null || row.actor_admin_id === null) return null;
    return {
      kind: "matched",
      requestRef: row.request_ref,
      partnerId: row.partner_id,
      matchedByAdminId: row.actor_admin_id,
      note: row.note,
      occurredAt: row.occurred_at,
    };
  }
  if (row.kind === "match_cleared") {
    if (row.actor_admin_id === null) return null;
    return {
      kind: "match_cleared",
      requestRef: row.request_ref,
      clearedByAdminId: row.actor_admin_id,
      note: row.note,
      occurredAt: row.occurred_at,
    };
  }
  return null;
}

export function createSupabaseDeclaredAffiliateCodeStore(
  client: SupabaseClient = getSupabaseAdmin(),
): AsyncDeclaredAffiliateCodeStore {
  return {
    async append(event) {
      const ins = await client.from(DECLARED_CODES).insert(eventToRow(event));
      if (ins.error) {
        // A second capture for the same request is a replay of the same
        // submit, not a new claim. The index refusing it is the correct
        // outcome, so it is success from the caller's point of view.
        if (ins.error.code === UNIQUE_VIOLATION && event.kind === "captured") return;
        throw new Error(`declared affiliate code insert failed: ${ins.error.message}`);
      }
    },

    async eventsFor(requestRef) {
      const rows = await client
        .from(DECLARED_CODES)
        .select(ROW_COLUMNS)
        .eq("request_ref", requestRef)
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true });
      if (rows.error) {
        throw new Error(`declared affiliate code load failed: ${rows.error.message}`);
      }
      const events: DeclaredAffiliateCodeEvent[] = [];
      for (const row of (rows.data ?? []) as unknown as DeclaredCodeRow[]) {
        const event = declaredCodeRowToEvent(row);
        if (event) events.push(event);
      }
      return events;
    },
  };
}

export function resolveDeclaredAffiliateCodeStore(): AsyncDeclaredAffiliateCodeStore {
  return supabaseConfigured()
    ? createSupabaseDeclaredAffiliateCodeStore()
    : createInMemoryDeclaredAffiliateCodeStore();
}

// ---------------------------------------------------------------------------
// The two operations a caller actually performs
// ---------------------------------------------------------------------------

/**
 * Capture whatever the customer typed, for one request.
 *
 * Returns true when a claim was recorded, false when there was nothing to
 * record OR when the store could not record it. **It never throws**: the
 * submit path that calls this must not gain a failure mode because someone
 * typed oddly or because this table is not deployed yet. A false answer means
 * "no claim is on file", which is exactly what the admin projection will then
 * report, so a silent storage fault is visible as an absence rather than as a
 * fabricated code.
 */
export async function recordDeclaredAffiliateCode(
  store: Pick<AsyncDeclaredAffiliateCodeStore, "append">,
  requestRef: string,
  rawInput: unknown,
  occurredAt: Date,
): Promise<boolean> {
  const event = captureEventFor(requestRef, rawInput, occurredAt);
  if (event === null) return false;
  try {
    await store.append(event);
    return true;
  } catch {
    return false;
  }
}

/**
 * The admin-facing projection for one request. An unreadable store answers the
 * empty projection rather than throwing, so one missing table cannot take down
 * an admin screen that shows many other facts.
 */
export async function declaredAffiliateCodeFor(
  store: Pick<AsyncDeclaredAffiliateCodeStore, "eventsFor">,
  requestRef: string,
): Promise<DeclaredAffiliateCodeProjection> {
  try {
    return projectDeclaredAffiliateCode(await store.eventsFor(requestRef));
  } catch {
    return projectDeclaredAffiliateCode([]);
  }
}
