import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import * as engine from "./receipt-repair";
import {
  createReceiptRepairPreview,
  RECEIPT_PREVIEW_ORIGIN,
  RECEIPT_PREVIEW_ORDER_PATH,
  ReceiptPreviewFailure,
  type ReceiptPreviewInput,
  type ReceiptPreviewReadClient,
  type ReceiptPreviewReadQuery,
} from "./receipt-repair-production";

const MEMBER = "00000000-0000-4000-8000-000000000001";
const ORDER = "00000000-0000-4000-8000-000000000002";
const EXECUTION = "00000000-0000-4000-8000-000000000003";
const SECOND_MEMBER = "00000000-0000-4000-8000-000000000004";
const SECOND_ORDER = "00000000-0000-4000-8000-000000000005";
const SECOND_EXECUTION = "00000000-0000-4000-8000-000000000006";
const AT = "2026-09-10T10:00:00.123456+00:00";
const CUTOFF = new Date("2026-09-10T00:00:00Z");
const EMAIL = "customer@receipt.fixture.invalid";
const PROVIDER = "pi_local_receipt_preview";
const execution = (overrides: Record<string, unknown> = {}) => ({ id: EXECUTION, member_id: MEMBER, order_id: ORDER,
  phase: "committed", amount_cents: 600, currency: "usd", provider_reference: PROVIDER, committed_at: AT, ...overrides });
const order = (overrides: Record<string, unknown> = {}) => ({ id: ORDER, member_id: MEMBER, state: "payment_captured",
  payment_reference: PROVIDER, captured_amount_cents: 600, refunded_cents: 0, ...overrides });
const member = (overrides: Record<string, unknown> = {}) => ({ id: MEMBER, email: EMAIL, ...overrides });
const event = (overrides: Record<string, unknown> = {}) => ({ event_key: engine.receiptEventKey(ORDER),
  event_type: engine.RECEIPT_EVENT_TYPE, template_key: engine.RECEIPT_TEMPLATE_KEY, recipient: EMAIL,
  payload: engine.receiptPayload({ orderId: ORDER, amountCents: 600 }, `${RECEIPT_PREVIEW_ORIGIN}${RECEIPT_PREVIEW_ORDER_PATH}${ORDER}`),
  ...overrides });
type Reply = { data: unknown; error: unknown };
type Trace = { table: string; columns: string; equals: Array<[string, string]>;
  orders: Array<[string, { ascending: boolean; nullsFirst?: boolean }]>; filter: string | null; limit: number | null };

// This double implements SELECT vocabulary only. It cannot connect, insert,
// update, call an RPC, send mail, or read any environment credentials.
function recordingClient(answer: (trace: Trace) => unknown | Promise<unknown>) {
  const calls: Trace[] = [];
  const client: ReceiptPreviewReadClient = {
    from(table) {
      return { select(columns) {
        const trace: Trace = { table, columns, equals: [], orders: [], filter: null, limit: null }; calls.push(trace);
        const query: ReceiptPreviewReadQuery = {
          eq(column, value) { trace.equals.push([column, value]); return query; },
          or(filter) { trace.filter = filter; return query; },
          order(column, options) { trace.orders.push([column, options]); return query; },
          limit(value) { trace.limit = value; return query; },
          then(onfulfilled, onrejected) {
            return Promise.resolve().then(() => answer(trace) as Reply).then(onfulfilled, onrejected);
          },
        };
        return query;
      } };
    },
  };
  return { client, calls };
}
type Fixture = { executions?: unknown[]; orders?: unknown[]; members?: unknown[]; events?: unknown[] };
function fixture(data: Fixture = {}) {
  const tables: Record<string, unknown[]> = { research_checkout_executions: data.executions ?? [execution()],
    research_orders: data.orders ?? [order()], research_members: data.members ?? [member()], research_notification_outbox: data.events ?? [] };
  return recordingClient(trace => ({ data: tables[trace.table], error: null }));
}
function preview(client: ReceiptPreviewReadClient, override: Partial<ReceiptPreviewInput> = {}) {
  return createReceiptRepairPreview({ client, eligibleAfter: CUTOFF, siteOrigin: RECEIPT_PREVIEW_ORIGIN, ...override });
}
function without<T extends Record<string, unknown>>(value: T, key: string) {
  const result: Record<string, unknown> = { ...value }; delete result[key]; return result;
}
function safeCounts(report: unknown) {
  expect(Object.keys(report as object).sort()).toEqual(["alreadyPresent", "beforeCutoff", "considered", "cursor", "mode", "previewed", "queued", "refused"].sort());
  const serialized = JSON.stringify(report);
  for (const privateValue of [EMAIL, PROVIDER, ORDER, MEMBER, "totalCents", "payload", "refunded_cents", "private database details"]) {
    expect(serialized).not.toContain(privateValue);
  }
}
afterEach(() => vi.restoreAllMocks());

describe("receipt preview authority and safe output", () => {
  it("constructs without reading and runs one preview pass with read-only vocabulary", async () => {
    const h = fixture(); const operation = preview(h.client); expect(h.calls).toEqual([]);
    const report = await operation.repair();
    expect(report).toEqual({ mode: "preview", considered: 1, previewed: 1, alreadyPresent: 0, beforeCutoff: 0, refused: 0, queued: 0, cursor: null });
    safeCounts(report);
    expect(h.calls).toEqual([
      { table: "research_checkout_executions", columns: "id,member_id,order_id,phase,amount_cents,currency,provider_reference,committed_at",
        equals: [["phase", "committed"]], orders: [["committed_at", { ascending: true, nullsFirst: true }], ["id", { ascending: true }]], filter: null, limit: 50 },
      { table: "research_orders", columns: "id,member_id,state,payment_reference,captured_amount_cents,refunded_cents", equals: [["id", ORDER]], orders: [], filter: null, limit: 2 },
      { table: "research_members", columns: "id,email", equals: [["id", MEMBER]], orders: [], filter: null, limit: 2 },
      { table: "research_notification_outbox", columns: "event_key,event_type,template_key,recipient,payload", equals: [["event_key", engine.receiptEventKey(ORDER)]], orders: [], filter: null, limit: 2 },
    ]);
  });
  it.each(["queue", "QUEUE", "Queue", "", null, true])("refuses non-preview mode %s before reading", mode => {
    const h = fixture(); expect(() => preview(h.client, { mode: mode as never })).toThrow("preview_only"); expect(h.calls).toEqual([]);
  });
  it.each([undefined, null, "2026-09-10", new Date("invalid")])("requires an explicit valid Date cutoff (%s)", eligibleAfter => {
    const h = fixture(); expect(() => preview(h.client, { eligibleAfter: eligibleAfter as never })).toThrow("invalid_cutoff"); expect(h.calls).toEqual([]);
  });
  it.each(["http://xeniostechnology.com", "https://xeniostechnology.com/", "https://xeniostechnology.com/research",
    "https://xeniostechnology.com?redirect=elsewhere", "https://xeniostechnology.com#fragment", "https://xeniostechnology.com:443",
    "https://account@xeniostechnology.com", "https://xeniostechnology.com.fixture.invalid", "https://fixture.invalid"])("requires the canonical origin (%s)", siteOrigin => {
    const h = fixture(); expect(() => preview(h.client, { siteOrigin })).toThrow("invalid_origin"); expect(h.calls).toEqual([]);
  });
  it("clones the cutoff instead of observing later caller mutation", async () => {
    const h = fixture(); const mutable = new Date(CUTOFF); const operation = preview(h.client, { eligibleAfter: mutable });
    mutable.setUTCFullYear(2099); expect((await operation.repair()).previewed).toBe(1);
  });
  it("does not read identity or outbox for records before the explicit cutoff", async () => {
    const h = fixture(); const report = await preview(h.client, { eligibleAfter: new Date("2026-09-11T00:00:00Z") }).repair();
    expect(report).toMatchObject({ beforeCutoff: 1, previewed: 0, refused: 0 }); expect(h.calls).toHaveLength(1); safeCounts(report);
  });
  it("rejects an unexpected enqueue attempt even if the engine catches its refusal", async () => {
    vi.spyOn(engine, "createReceiptRepair").mockImplementation(deps => ({ async repair() {
      await deps.enqueueOnce({ eventKey: "synthetic", eventType: "synthetic", templateKey: "synthetic", recipient: EMAIL, payload: {} }).catch(() => undefined);
      return { considered: 0, queued: 0, alreadyPresent: 0, previewed: 0, refused: [], entries: [], cursor: null };
    } }));
    const h = fixture(); await expect(preview(h.client).repair()).rejects.toThrow("preview_write_forbidden"); expect(h.calls).toEqual([]);
  });
});

describe("bounded, exact-microsecond keyset pagination", () => {
  it.each([0, -1, 201, 1.5, NaN, Infinity, "2", null])("refuses malformed limit %s before reading", async limit => {
    const h = fixture(); await expect(preview(h.client).repair({ limit: limit as never })).rejects.toThrow("invalid_limit"); expect(h.calls).toEqual([]);
  });
  it.each([null, [], { mode: "queue" }, { unknown: true }].map(options => ({ options })))("refuses malformed options %j before reading", async ({ options }) => {
    const h = fixture(); await expect(preview(h.client).repair(options as never)).rejects.toThrow("invalid_options"); expect(h.calls).toEqual([]);
  });
  it.each([
    { committedAt: AT }, { executionId: EXECUTION }, { committedAt: AT, executionId: "invalid" },
    { committedAt: AT, executionId: EXECUTION, extra: true },
    { committedAt: "2026-02-30T10:00:00Z", executionId: EXECUTION },
    { committedAt: "2026-09-10T10:00:60Z", executionId: EXECUTION },
    { committedAt: "2026-09-10T10:00:00.1234567Z", executionId: EXECUTION },
    { committedAt: "2026-09-10T10:00:00+14:01", executionId: EXECUTION },
    { committedAt: "2026-09-10T10:00:00Z,id.gt.anything", executionId: EXECUTION },
  ])("refuses malformed cursor %j without reading", async cursor => {
    const h = fixture(); await expect(preview(h.client).repair({ cursor: cursor as never })).rejects.toThrow("invalid_cursor"); expect(h.calls).toEqual([]);
  });
  it("passes the unrounded cursor literal and returns the exact last position", async () => {
    const h = fixture(); const cursor = { committedAt: "2026-09-10T10:00:00.123455+00:00", executionId: SECOND_EXECUTION };
    const report = await preview(h.client).repair({ limit: 1, cursor });
    expect(h.calls[0]!.filter).toBe(`committed_at.gt.${cursor.committedAt},and(committed_at.eq.${cursor.committedAt},id.gt.${cursor.executionId})`);
    expect(report.cursor).toEqual({ committedAt: AT, executionId: EXECUTION });
    expect(report.previewed).toBe(1); safeCounts(report);
  });
  it("orders distinct microseconds correctly even when UUID order descends within one millisecond", async () => {
    const h = fixture({ executions: [execution({ id: SECOND_EXECUTION, committed_at: "2026-09-10T10:00:00.123455Z" }),
      execution({ id: EXECUTION, order_id: SECOND_ORDER })], orders: [] });
    const report = await preview(h.client).repair({ limit: 2 });
    expect(report.considered).toBe(2); expect(report.refused).toBe(2); expect(report.cursor).toEqual({ committedAt: AT, executionId: EXECUTION });
  });
  it("compares equivalent offset timestamps by instant, then UUID", async () => {
    const h = fixture(); const cursor = { committedAt: "2026-09-10T15:30:00.123456+05:30", executionId: MEMBER };
    expect((await preview(h.client).repair({ limit: 1, cursor })).previewed).toBe(1);
    expect(h.calls[0]!.filter).toContain(cursor.committedAt);
  });
  it.each([
    [execution(), execution({ id: SECOND_EXECUTION, order_id: SECOND_ORDER, committed_at: "2026-09-10T10:00:00.123455Z" })],
    [execution({ id: SECOND_EXECUTION }), execution({ order_id: SECOND_ORDER })],
    [execution(), execution({ order_id: SECOND_ORDER })],
    [execution(), execution({ id: SECOND_EXECUTION })],
  ].map(executions => ({ executions })))("refuses unordered or duplicate source rows rather than dropping them", async ({ executions }) => {
    const h = fixture({ executions }); await expect(preview(h.client).repair()).rejects.toThrow("source_order_invalid"); expect(h.calls).toHaveLength(1);
  });
  it("refuses a row at or before the requested cursor", async () => {
    const h = fixture(); await expect(preview(h.client).repair({ cursor: { committedAt: AT, executionId: EXECUTION } })).rejects.toThrow("source_order_invalid");
    expect(h.calls).toHaveLength(1);
  });
  it("refuses oversized responses", async () => {
    const h = fixture({ executions: [execution(), execution({ id: SECOND_EXECUTION, order_id: SECOND_ORDER })] });
    await expect(preview(h.client).repair({ limit: 1 })).rejects.toThrow("source_projection_invalid"); expect(h.calls).toHaveLength(1);
  });
  it("reports a confirmed empty page without a cursor or downstream reads", async () => {
    const h = fixture({ executions: [] }); const report = await preview(h.client).repair();
    expect(report).toMatchObject({ considered: 0, cursor: null, queued: 0, refused: 0 }); expect(h.calls).toHaveLength(1);
  });
});

describe("committed source projection fails closed", () => {
  const invalidExecutions = [without(execution(), "amount_cents"), execution({ extra: true }), execution({ id: "not-a-uuid" }),
    execution({ member_id: null }), execution({ order_id: "" }), execution({ phase: "captured" }), execution({ currency: "cad" }),
    execution({ amount_cents: "600" }), execution({ amount_cents: null }), execution({ amount_cents: -1 }), execution({ amount_cents: 0 }),
    execution({ amount_cents: 0.5 }), execution({ amount_cents: Number.MAX_SAFE_INTEGER + 1 }), execution({ amount_cents: NaN }),
    execution({ provider_reference: null }), execution({ provider_reference: "" }), execution({ provider_reference: " has-padding " }),
    execution({ committed_at: null }), execution({ committed_at: "2026-02-30T10:00:00Z" }), execution({ committed_at: "not-a-date" })];
  it.each(invalidExecutions)("refuses a malformed committed row", async malformed => {
    const h = fixture({ executions: [malformed] }); await expect(preview(h.client).repair()).rejects.toThrow("source_projection_invalid"); expect(h.calls).toHaveLength(1);
  });
  it.each([null, {}, { data: null, error: null }, { data: {}, error: null }, { data: [] }, { data: [], error: { message: "private database details" } }])(
    "does not treat an unavailable discovery response as an empty page", async response => {
      const h = recordingClient(() => response);
      await expect(preview(h.client).repair()).rejects.toThrow("source_read_failed"); expect(h.calls).toHaveLength(1);
    });
  it("masks a thrown discovery error", async () => {
    const h = recordingClient(() => { throw new Error(`private database details ${EMAIL}`); });
    await expect(preview(h.client).repair()).rejects.toEqual(new ReceiptPreviewFailure("source_read_failed"));
  });
});

describe("canonical order and recipient binding", () => {
  it.each([order({ id: SECOND_ORDER }), order({ member_id: SECOND_MEMBER }), without(order(), "refunded_cents"),
    without(order(), "captured_amount_cents"), order({ state: "invented" }), order({ captured_amount_cents: "600" }),
    order({ refunded_cents: NaN }), order({ refunded_cents: -1 }), order({ refunded_cents: 601 }),
    order({ captured_amount_cents: Number.MAX_SAFE_INTEGER + 1 }), order({ extra: true })])("refuses malformed/wrong-owner order facts without reading identity", async malformed => {
    const h = fixture({ orders: [malformed] }); const report = await preview(h.client).repair();
    expect(report).toMatchObject({ refused: 1, previewed: 0, queued: 0 }); expect(h.calls).toHaveLength(2); safeCounts(report);
  });
  it.each([[], [order(), order()]].map(orders => ({ orders })))("refuses missing or duplicate orders", async ({ orders }) => {
    const h = fixture({ orders }); expect((await preview(h.client).repair()).refused).toBe(1); expect(h.calls).toHaveLength(2);
  });
  it.each([order({ refunded_cents: null }), order({ captured_amount_cents: null }), order({ refunded_cents: 100 }),
    order({ payment_reference: "pi_other_synthetic" }), order({ captured_amount_cents: 599 }),
    order({ state: "checkout_pending", captured_amount_cents: null }), order({ state: "cancelled" })])("preserves engine refusal for uncaptured/refunded/unverifiable orders", async canonical => {
    const h = fixture({ orders: [canonical] }); const report = await preview(h.client).repair();
    expect(report).toMatchObject({ refused: 1, previewed: 0 }); expect(h.calls).toHaveLength(2); safeCounts(report);
  });
  it.each(["processing", "partially_fulfilled", "fulfilled", "delivered"])("still previews paid order state %s", async state => {
    const h = fixture({ orders: [order({ state })] }); expect((await preview(h.client).repair()).previewed).toBe(1);
  });
  it.each([member({ id: SECOND_MEMBER }), member({ email: null }), member({ email: "not-an-address" }),
    member({ email: "customer\n@fixture.invalid" }), without(member(), "id"), member({ extra: true })])("refuses malformed/foreign canonical recipient without reading outbox", async malformed => {
    const h = fixture({ members: [malformed] }); const report = await preview(h.client).repair();
    expect(report).toMatchObject({ refused: 1, previewed: 0 }); expect(h.calls).toHaveLength(3); safeCounts(report);
  });
  it.each([[], [member(), member()]].map(members => ({ members })))("refuses missing or duplicate canonical members", async ({ members }) => {
    const h = fixture({ members }); expect((await preview(h.client).repair()).refused).toBe(1); expect(h.calls).toHaveLength(3);
  });
});

describe("exact existing outbox record, never delivery or new enqueue", () => {
  it("counts only a fully matching stored receipt as already present", async () => {
    const h = fixture({ events: [event()] }); const report = await preview(h.client).repair();
    expect(report).toMatchObject({ alreadyPresent: 1, previewed: 0, refused: 0, queued: 0 }); expect(h.calls).toHaveLength(4); safeCounts(report);
  });
  const basePayload = event().payload;
  it.each([event({ event_key: engine.receiptEventKey(SECOND_ORDER) }), event({ event_type: "another_type" }),
    event({ template_key: "another_template" }), event({ recipient: "other@receipt.fixture.invalid" }), event({ payload: null }),
    event({ payload: { ...basePayload, orderReference: SECOND_ORDER } }), event({ payload: { ...basePayload, totalCents: 601 } }),
    event({ payload: { ...basePayload, totalCents: "600" } }), event({ payload: { ...basePayload, totalFormatted: "$7.00" } }),
    event({ payload: { ...basePayload, orderUrl: "https://fixture.invalid/another-order" } }),
    event({ payload: { ...basePayload, token: "synthetic-private-value" } }), without(event(), "recipient"), event({ extra: true })])(
    "refuses any mismatched or malformed stored receipt", async malformed => {
      const h = fixture({ events: [malformed] }); const report = await preview(h.client).repair();
      expect(report).toMatchObject({ alreadyPresent: 0, previewed: 0, refused: 1, queued: 0 }); safeCounts(report);
    });
  it("does not choose among duplicate event-key rows", async () => {
    const h = fixture({ events: [event(), event()] }); expect((await preview(h.client).repair()).refused).toBe(1);
  });
  it.each(["research_orders", "research_members", "research_notification_outbox"])("reports %s read failure without exposing errors", async failedTable => {
    const h = recordingClient(trace => {
      if (trace.table === failedTable) throw new Error(`private database details ${EMAIL} ${PROVIDER}`);
      const tables = { research_checkout_executions: [execution()], research_orders: [order()], research_members: [member()], research_notification_outbox: [] };
      return { data: tables[trace.table as keyof typeof tables], error: null };
    });
    const report = await preview(h.client).repair(); expect(report).toMatchObject({ refused: 1, queued: 0, previewed: 0 }); safeCounts(report);
  });
});

describe("independent one-pass identity bindings", () => {
  it("continues after one unreadable order without losing another preview", async () => {
    const second = execution({ id: SECOND_EXECUTION, order_id: SECOND_ORDER });
    const h = recordingClient(trace => {
      if (trace.table === "research_checkout_executions") return { data: [execution(), second], error: null };
      if (trace.table === "research_orders" && trace.equals[0]![1] === ORDER) throw new Error("private database details");
      if (trace.table === "research_orders") return { data: [order({ id: SECOND_ORDER })], error: null };
      if (trace.table === "research_members") return { data: [member()], error: null };
      return { data: [], error: null };
    });
    expect(await preview(h.client).repair()).toMatchObject({ considered: 2, refused: 1, previewed: 1, queued: 0 });
  });
  it("keeps overlapping previews isolated even when the earlier order read completes last", async () => {
    let releaseFirst!: (value: Reply) => void;
    const firstOrder = new Promise<Reply>(resolve => { releaseFirst = resolve; });
    let firstOrderStarted!: () => void;
    const firstRead = new Promise<void>(resolve => { firstOrderStarted = resolve; });
    let discoveries = 0;
    const h = recordingClient(trace => {
      if (trace.table === "research_checkout_executions") return { data: [discoveries++ === 0 ? execution()
        : execution({ id: SECOND_EXECUTION, order_id: SECOND_ORDER, member_id: SECOND_MEMBER })], error: null };
      if (trace.table === "research_orders" && trace.equals[0]![1] === ORDER) { firstOrderStarted(); return firstOrder; }
      if (trace.table === "research_orders") return { data: [order({ id: SECOND_ORDER, member_id: SECOND_MEMBER })], error: null };
      if (trace.table === "research_members") return { data: [member({ id: trace.equals[0]![1] })], error: null };
      return { data: [], error: null };
    });
    const operation = preview(h.client); const first = operation.repair(); await firstRead;
    expect(await operation.repair()).toMatchObject({ previewed: 1, refused: 0 });
    releaseFirst({ data: [order()], error: null }); expect(await first).toMatchObject({ previewed: 1, refused: 0 });
    expect(h.calls.filter(call => call.table === "research_notification_outbox").map(call => call.equals[0]![1]))
      .toEqual([engine.receiptEventKey(SECOND_ORDER), engine.receiptEventKey(ORDER)]);
  });
});

describe("installed Supabase SDK read contract (synthetic fetch only)", () => {
  it("encodes a complete preview through actual SDK query builders without network, Auth, RPC or writes", async () => {
    const origin = "https://receipt-sdk.fixture.invalid";
    const cursor = { committedAt: "2026-09-10T10:00:00.123455+00:00", executionId: SECOND_EXECUTION };
    const expected = [
      { path: "/rest/v1/research_checkout_executions", params: [
        ["select", "id,member_id,order_id,phase,amount_cents,currency,provider_reference,committed_at"],
        ["phase", "eq.committed"], ["order", "committed_at.asc.nullsfirst,id.asc"],
        ["or", `(committed_at.gt.${cursor.committedAt},and(committed_at.eq.${cursor.committedAt},id.gt.${cursor.executionId}))`],
        ["limit", "1"],
      ], data: [execution()] },
      { path: "/rest/v1/research_orders", params: [["select", "id,member_id,state,payment_reference,captured_amount_cents,refunded_cents"],
        ["id", `eq.${ORDER}`], ["limit", "2"]], data: [order()] },
      { path: "/rest/v1/research_members", params: [["select", "id,email"], ["id", `eq.${MEMBER}`], ["limit", "2"]], data: [member()] },
      { path: "/rest/v1/research_notification_outbox", params: [["select", "event_key,event_type,template_key,recipient,payload"],
        ["event_key", `eq.${engine.receiptEventKey(ORDER)}`], ["limit", "2"]], data: [] },
    ];
    const requests: string[] = [];
    let socketAttempts = 0;
    const fallbackFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("unconfigured network forbidden"); });
    // Node20 has no built-in WebSocket. This structural transport refuses even
    // construction, so an accidental Realtime subscription cannot open a socket.
    class NoNetworkSocket {
      readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSING = 2; readonly CLOSED = 3;
      readonly readyState = 3; readonly url = ""; readonly protocol = "";
      onopen = null; onmessage = null; onclose = null; onerror = null;
      constructor() { socketAttempts += 1; throw new Error("socket forbidden"); }
      close() { throw new Error("socket forbidden"); }
      send() { throw new Error("socket forbidden"); }
      addEventListener() { throw new Error("socket forbidden"); }
      removeEventListener() { throw new Error("socket forbidden"); }
    }
    const syntheticFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init); const url = new URL(request.url);
      const next = expected[requests.length];
      expect(request.method).toBe("GET"); expect(url.origin).toBe(origin);
      expect(next, "unexpected SDK request, including Auth or RPC, is forbidden").toBeDefined();
      expect(url.pathname).toBe(next!.path);
      expect(request.body).toBeNull();
      const exactUrl = new URL(next!.path, origin);
      for (const [key, value] of next!.params) exactUrl.searchParams.set(key!, value!);
      // Compare the actual encoded URL, not only our adapter's method names.
      expect(url.href).toBe(exactUrl.href);
      requests.push(url.href);
      return new Response(JSON.stringify(next!.data), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const actual = createClient(origin, "fixture-only", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: syntheticFetch }, realtime: { transport: NoNetworkSocket, fetch: syntheticFetch },
    });
    // This is deliberately a checked assignment, not an `any`/unknown cast.
    const readClient: ReceiptPreviewReadClient = actual;
    const report = await preview(readClient).repair({ limit: 1, cursor });
    expect(report).toEqual({ mode: "preview", considered: 1, previewed: 1, alreadyPresent: 0, beforeCutoff: 0,
      refused: 0, queued: 0, cursor: { committedAt: AT, executionId: EXECUTION } });
    expect(requests).toHaveLength(4);
    expect(requests[0]).toContain(".123455%2B00%3A00");
    expect(requests.every(url => new URL(url).pathname.startsWith("/rest/v1/research_"))).toBe(true);
    expect(fallbackFetch).not.toHaveBeenCalled(); expect(socketAttempts).toBe(0);
    safeCounts(report);
  });
});
