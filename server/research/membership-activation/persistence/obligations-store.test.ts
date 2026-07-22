import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createInMemoryObligationsStore,
  createSupabaseObligationsStore,
  eventRowsToEvents,
  eventToRow,
  headerRowToObligation,
  obligationToHeaderRow,
  type ObligationEventRow,
  type ObligationHeaderRow,
} from "./obligations-store";
import {
  createObligation,
  recordMemberSubmission,
  transitionObligation,
  type MemberPaymentSubmission,
  type ObligationRecord,
  type PaymentMethodSnapshot,
} from "../obligations";

const NOW = new Date("2026-07-22T00:00:00.000Z");

function method(): PaymentMethodSnapshot {
  return {
    methodId: "method-zelle",
    category: "manual_external_payment",
    label: "Zelle",
    instructionsRef: "enc-instr-1",
    productPurchaseEligible: false,
    capturedAt: NOW.toISOString(),
  };
}

function submission(xeniosRef: string): MemberPaymentSubmission {
  return {
    methodId: "method-zelle",
    amountCents: 5000,
    sentDate: "2026-07-22",
    sentTime: "09:30",
    senderName: "Test Member",
    senderContact: null,
    senderIdentifierMasked: "ending 1234",
    externalRef: "EXT-REF-001",
    xeniosRef,
    note: "sent from the app",
    evidenceRef: "media-ref-1",
    accuracyCertified: true,
    submittedAt: NOW.toISOString(),
  };
}

function record(memberId = "member-1"): ObligationRecord {
  return createObligation({ memberId, type: "activation_50", method: method(), now: NOW });
}

function submittedRecord(memberId = "member-1"): ObligationRecord {
  const base = record(memberId);
  return recordMemberSubmission(
    base,
    submission(base.humanRef),
    { actorType: "member", actorId: memberId, ip: "203.0.113.10", userAgent: "vitest" },
    NOW,
  );
}

// ---------------------------------------------------------------------------
// Pure row mapping
// ---------------------------------------------------------------------------

describe("obligation row mapping", () => {
  it("round-trips a fresh obligation with its events through the mappers", () => {
    const rec = record();
    const back = headerRowToObligation(obligationToHeaderRow(rec), rec.events.map(eventToRow));
    expect(back).toEqual(rec);
  });

  it("round-trips a submitted obligation, snapshots and report intact", () => {
    const rec = submittedRecord();
    const back = headerRowToObligation(obligationToHeaderRow(rec), rec.events.map(eventToRow));
    expect(back).toEqual(rec);
    expect(back.submission?.senderIdentifierMasked).toBe("ending 1234");
    expect(back.method.instructionsRef).toBe("enc-instr-1");
  });

  it("THROWS on an unknown status: money never silently reinterpreted", () => {
    const row: ObligationHeaderRow = { ...obligationToHeaderRow(record()), status: "paid_maybe" };
    expect(() => headerRowToObligation(row)).toThrowError(/unknown status/);
  });

  it("THROWS on an unknown type or bridge phase", () => {
    const badType: ObligationHeaderRow = { ...obligationToHeaderRow(record()), type: "activation_60" };
    expect(() => headerRowToObligation(badType)).toThrowError(/unknown type/);
    const badPhase: ObligationHeaderRow = {
      ...obligationToHeaderRow(record()),
      bridge_phase: "phase_c",
    };
    expect(() => headerRowToObligation(badPhase)).toThrowError(/unknown bridge phase/);
  });

  it("orders events by occurrence and drops a row with an unknown actor type", () => {
    const rec = submittedRecord();
    const rows = rec.events.map(eventToRow);
    // Distinct timestamps so the ordering claim is unambiguous.
    rows[1] = { ...rows[1], occurred_at: "2026-07-22T00:00:01.000Z" };
    const bad: ObligationEventRow = { ...rows[0], event_id: "not-a-domain-event", actor_type: "robot" };
    const events = eventRowsToEvents([rows[1], bad, rows[0]]);
    expect(events.map((e) => e.eventId)).toEqual([rows[0].event_id, rows[1].event_id]);
  });
});

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

describe("createInMemoryObligationsStore", () => {
  it("returns null before anything is saved", async () => {
    const store = createInMemoryObligationsStore();
    expect(await store.get("missing")).toBeNull();
    expect(await store.findByHumanRef("XRM-AAAAAAAA")).toBeNull();
  });

  it("saves, loads, and finds by human reference", async () => {
    const store = createInMemoryObligationsStore();
    const rec = record();
    await store.save(rec);
    expect(await store.get(rec.obligationId)).toEqual(rec);
    expect((await store.findByHumanRef(rec.humanRef))?.obligationId).toBe(rec.obligationId);
  });

  it("scopes listByMember to the owner and listAll across owners", async () => {
    const store = createInMemoryObligationsStore();
    await store.save(record("member-1"));
    await store.save(record("member-2"));
    expect(await store.listByMember("member-1")).toHaveLength(1);
    expect(await store.listAll()).toHaveLength(2);
  });

  it("keeps the event trail append-only: a save can add events, never remove them", async () => {
    const store = createInMemoryObligationsStore();
    const rec = submittedRecord();
    await store.save(rec);
    // A stale caller saving an OLDER copy (fewer events) cannot erase history.
    const stale = { ...rec, events: [] };
    await store.save(stale);
    const loaded = await store.get(rec.obligationId);
    expect(loaded!.events.map((e) => e.eventId)).toEqual(rec.events.map((e) => e.eventId));
  });

  it("does not let a caller mutate stored state through a held reference", async () => {
    const store = createInMemoryObligationsStore();
    const rec = submittedRecord();
    await store.save(rec);
    const loaded = await store.get(rec.obligationId);
    loaded!.submission!.amountCents = 1;
    loaded!.events.pop();
    const reloaded = await store.get(rec.obligationId);
    expect(reloaded!.submission!.amountCents).toBe(5000);
    expect(reloaded!.events).toHaveLength(rec.events.length);
  });
});

// ---------------------------------------------------------------------------
// Supabase-backed store, exercised against a fake client (no network)
// ---------------------------------------------------------------------------

/** A minimal fake of the supabase-js fluent client covering exactly the calls
 * the obligations store makes, recording every operation per table so tests
 * can prove the events table only ever sees selects and inserts. */
function fakeSupabase() {
  const headers = new Map<string, ObligationHeaderRow>();
  const events: ObligationEventRow[] = [];
  const ops: Array<{ table: string; op: string }> = [];

  function builder(table: string) {
    const state: { op: string; filterCol?: string; filterVal?: unknown; payload?: unknown } = {
      op: "select",
    };
    const api: Record<string, unknown> = {};
    const result = (): { data: unknown; error: null } => {
      ops.push({ table, op: state.op });
      if (table === "research_fm_obligations") {
        if (state.op === "select") {
          if (state.filterCol === "id") {
            return { data: headers.get(String(state.filterVal)) ?? null, error: null };
          }
          if (state.filterCol === "human_ref") {
            const hit = Array.from(headers.values()).find((row) => row.human_ref === state.filterVal);
            return { data: hit ?? null, error: null };
          }
          if (state.filterCol === "member_id") {
            return {
              data: Array.from(headers.values()).filter((row) => row.member_id === state.filterVal),
              error: null,
            };
          }
          return { data: Array.from(headers.values()), error: null };
        }
        if (state.op === "upsert") {
          const row = state.payload as ObligationHeaderRow;
          headers.set(row.id, { ...row });
          return { data: null, error: null };
        }
      }
      if (table === "research_fm_obligation_events") {
        if (state.op === "select") {
          return {
            data: events.filter((row) => row.obligation_id === String(state.filterVal)),
            error: null,
          };
        }
        if (state.op === "insert") {
          const rows = state.payload as ObligationEventRow[];
          for (const row of rows) events.push({ ...row });
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    };
    Object.assign(api, {
      select() { return api; },
      eq(col: string, val: unknown) { state.filterCol = col; state.filterVal = val; return api; },
      upsert(payload: unknown) { state.op = "upsert"; state.payload = payload; return api; },
      insert(payload: unknown) { state.op = "insert"; state.payload = payload; return api; },
      maybeSingle() { return Promise.resolve(result()); },
      then(onF: (v: { data: unknown; error: null }) => unknown) {
        return Promise.resolve(result()).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, headers, events, ops };
}

describe("createSupabaseObligationsStore (fake client)", () => {
  it("returns null for a missing obligation", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseObligationsStore(client);
    expect(await store.get("missing")).toBeNull();
  });

  it("saves then loads a full round trip, events included", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseObligationsStore(client);
    const rec = submittedRecord();
    await store.save(rec);
    expect(await store.get(rec.obligationId)).toEqual(rec);
    expect((await store.findByHumanRef(rec.humanRef))?.obligationId).toBe(rec.obligationId);
  });

  it("upserts the header without duplicating, and inserts only NEW events on re-save", async () => {
    const { client, headers, events } = fakeSupabase();
    const store = createSupabaseObligationsStore(client);
    const rec = submittedRecord();
    await store.save(rec);
    expect(events).toHaveLength(rec.events.length);

    // Re-save the identical record: no event duplicates.
    await store.save(rec);
    expect(events).toHaveLength(rec.events.length);
    expect(headers.size).toBe(1);

    // A transition adds exactly its one new event.
    const reviewed = transitionObligation(
      rec,
      "under_review",
      { actorType: "admin", actorId: "admin-1", actorRole: "owner" },
      NOW,
      "review_started",
    );
    await store.save(reviewed);
    expect(events).toHaveLength(rec.events.length + 1);
    expect((await store.get(rec.obligationId))!.status).toBe("under_review");
  });

  it("never updates or deletes the events table (append-only, proven by ops)", async () => {
    const { client, ops } = fakeSupabase();
    const store = createSupabaseObligationsStore(client);
    const rec = submittedRecord();
    await store.save(rec);
    await store.save(
      transitionObligation(rec, "under_review", { actorType: "admin", actorId: "admin-1" }, NOW, "review_started"),
    );
    const eventOps = ops.filter((o) => o.table === "research_fm_obligation_events");
    expect(eventOps.every((o) => o.op === "insert" || o.op === "select")).toBe(true);
    expect(eventOps.some((o) => o.op === "insert")).toBe(true);
  });

  it("scopes listByMember to the owner id from the argument", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseObligationsStore(client);
    await store.save(record("member-1"));
    await store.save(record("member-2"));
    const mine = await store.listByMember("member-1");
    expect(mine).toHaveLength(1);
    expect(mine[0].memberId).toBe("member-1");
    expect(await store.listAll()).toHaveLength(2);
  });

  it("throws loudly when a persisted row carries an unknown status", async () => {
    const { client, headers } = fakeSupabase();
    const store = createSupabaseObligationsStore(client);
    const rec = record();
    await store.save(rec);
    headers.set(rec.obligationId, { ...headers.get(rec.obligationId)!, status: "limbo" });
    await expect(store.get(rec.obligationId)).rejects.toThrowError(/unknown status/);
  });
});
