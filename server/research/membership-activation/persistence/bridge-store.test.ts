import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultBridgeSettings, requestBridgeExtension, type BridgeAuditEvent } from "../bridge";
import {
  BridgeAuditEventDuplicate,
  bridgeAuditEventRowToRecord,
  bridgeAuditEventToRow,
  bridgeSettingsRowToRecord,
  bridgeSettingsToRow,
  createInMemoryBridgeStore,
  createSupabaseBridgeStore,
  type BridgeAuditEventRow,
  type BridgeSettingsRow,
} from "./bridge-store";

const TZ = "America/Chicago";
const NOW = new Date("2026-07-22T12:00:00.000Z");

const settings = () => defaultBridgeSettings("2026-07-20T05:00:00.000Z", TZ);

const event = (eventId = "evt_1", at = NOW.toISOString()): BridgeAuditEvent => ({
  eventId,
  kind: "bridge_extension",
  actorId: "admin_samuel",
  reason: "Replacement provider slipped",
  at,
  detail: { previousEndAt: "2026-08-03T05:00:00.000Z", newEndAt: "2026-08-07T05:00:00.000Z" },
});

// ---------------------------------------------------------------------------
// Pure mappers
// ---------------------------------------------------------------------------

describe("bridge row mappers", () => {
  it("round-trips settings through the single fixed-id row", () => {
    const s = settings();
    const row = bridgeSettingsToRow(s);
    expect(row.id).toBe("bridge");
    expect(bridgeSettingsRowToRecord(row)).toEqual(s);
  });

  it("round-trips an audit event and defaults an absent detail to empty", () => {
    const e = event();
    expect(bridgeAuditEventRowToRecord(bridgeAuditEventToRow(e))).toEqual(e);
    const bare = { ...bridgeAuditEventToRow(e), detail: undefined } as unknown as BridgeAuditEventRow;
    expect(bridgeAuditEventRowToRecord(bare).detail).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// In-memory reference
// ---------------------------------------------------------------------------

describe("createInMemoryBridgeStore", () => {
  it("reads null before any configuration (fails closed: no bridge)", async () => {
    const store = createInMemoryBridgeStore();
    expect(await store.getSettings()).toBeNull();
  });

  it("saves and reads back the one settings row", async () => {
    const store = createInMemoryBridgeStore();
    await store.saveSettings(settings());
    expect(await store.getSettings()).toEqual(settings());
    // Upsert semantics: a second save replaces.
    const extended = requestBridgeExtension(settings(), {
      eventId: "evt_1",
      actorId: "admin_samuel",
      reason: "Slipped",
      expiresAt: "2026-08-07T05:00:00.000Z",
      now: NOW,
    });
    await store.saveSettings(extended.settings);
    expect((await store.getSettings())?.administratorExtensionExpiresAt).toBe("2026-08-07T05:00:00.000Z");
  });

  it("appends audit events exactly once and lists them oldest first", async () => {
    const store = createInMemoryBridgeStore();
    await store.appendAuditEvent(event("evt_2", "2026-07-23T00:00:00.000Z"));
    await store.appendAuditEvent(event("evt_1", "2026-07-22T00:00:00.000Z"));
    await expect(store.appendAuditEvent(event("evt_1"))).rejects.toThrow(BridgeAuditEventDuplicate);
    const trail = await store.listAuditEvents();
    expect(trail.map((e) => e.eventId)).toEqual(["evt_1", "evt_2"]);
  });

  it("the port exposes no way to change or delete history", async () => {
    const store = createInMemoryBridgeStore();
    expect(Object.keys(store).sort()).toEqual([
      "appendAuditEvent",
      "getSettings",
      "listAuditEvents",
      "saveSettings",
    ]);
    // Mutating a listed clone does not touch the stored trail.
    await store.appendAuditEvent(event("evt_1"));
    const [listed] = await store.listAuditEvents();
    (listed.detail as Record<string, unknown>).newEndAt = "tampered";
    expect((await store.listAuditEvents())[0].detail.newEndAt).toBe("2026-08-07T05:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// A fake supabase-js client backing the two tables. No network.
// ---------------------------------------------------------------------------

function fakeSupabase(): {
  client: SupabaseClient;
  settingsRows: Map<string, BridgeSettingsRow>;
  auditRows: BridgeAuditEventRow[];
} {
  const settingsRows = new Map<string, BridgeSettingsRow>();
  const auditRows: BridgeAuditEventRow[] = [];

  function builder(table: string) {
    const state: { op: string; filters: Record<string, unknown>; payload?: unknown } = {
      op: "select",
      filters: {},
    };
    const api: Record<string, unknown> = {};
    const matches = (row: Record<string, unknown>): boolean =>
      Object.entries(state.filters).every(([col, val]) => row[col] === val);

    const result = (): { data: unknown; error: { code?: string; message?: string } | null } => {
      if (table === "research_fm_bridge_settings") {
        if (state.op === "upsert") {
          const row = state.payload as BridgeSettingsRow;
          settingsRows.set(row.id, { ...row });
          return { data: null, error: null };
        }
        const rows = [...settingsRows.values()].filter((r) => matches(r as unknown as Record<string, unknown>));
        return { data: rows, error: null };
      }
      if (table === "research_fm_bridge_audit_events") {
        if (state.op === "insert") {
          const row = state.payload as BridgeAuditEventRow;
          if (auditRows.some((e) => e.event_id === row.event_id)) {
            return { data: null, error: { code: "23505", message: "duplicate" } };
          }
          auditRows.push({ ...row });
          return { data: null, error: null };
        }
        return { data: auditRows.filter((e) => matches(e as unknown as Record<string, unknown>)), error: null };
      }
      return { data: null, error: { message: `no such table ${table}` } };
    };

    Object.assign(api, {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return api;
      },
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      upsert(payload: unknown) {
        state.op = "upsert";
        state.payload = payload;
        return api;
      },
      maybeSingle() {
        const r = result();
        const data = Array.isArray(r.data) ? ((r.data[0] as unknown) ?? null) : r.data;
        return Promise.resolve({ data, error: r.error });
      },
      then(onF: (v: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve(result()).then(onF);
      },
    });
    return api;
  }

  const client = { from: (table: string) => builder(table) } as unknown as SupabaseClient;
  return { client, settingsRows, auditRows };
}

describe("createSupabaseBridgeStore (fake client)", () => {
  it("upserts the fixed-id settings row and reads it back", async () => {
    const { client, settingsRows } = fakeSupabase();
    const store = createSupabaseBridgeStore(client);
    expect(await store.getSettings()).toBeNull();
    await store.saveSettings(settings());
    expect(settingsRows.get("bridge")?.timezone).toBe(TZ);
    expect(await store.getSettings()).toEqual(settings());
  });

  it("appends audit events; a duplicate event id hits the DB unique code", async () => {
    const { client, auditRows } = fakeSupabase();
    const store = createSupabaseBridgeStore(client);
    await store.appendAuditEvent(event("evt_1", "2026-07-22T00:00:00.000Z"));
    await store.appendAuditEvent(event("evt_2", "2026-07-23T00:00:00.000Z"));
    await expect(store.appendAuditEvent(event("evt_1"))).rejects.toThrow(BridgeAuditEventDuplicate);
    expect(auditRows).toHaveLength(2);
    expect((await store.listAuditEvents()).map((e) => e.eventId)).toEqual(["evt_1", "evt_2"]);
  });

  it("reads are defensive when the tables are not provisioned; writes stay loud", async () => {
    const throwing = {
      from: () => {
        throw new Error("relation does not exist");
      },
    } as unknown as SupabaseClient;
    const store = createSupabaseBridgeStore(throwing);
    expect(await store.getSettings()).toBeNull();
    expect(await store.listAuditEvents()).toEqual([]);
    await expect(store.saveSettings(settings())).rejects.toThrow();
    await expect(store.appendAuditEvent(event())).rejects.toThrow();
  });
});
