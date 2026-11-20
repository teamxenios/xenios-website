import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { describe, expect, it, vi } from "vitest";
import {
  createEarlyAccessShippingSlaSweepAdminRoute,
  startEarlyAccessShippingSlaWorker,
} from "./shipping-sla-composition";
import { createEarlyAccessSupabaseQuery } from "../persistence/production-deps";
import { createEarlyAccessShippingAlertSink } from "./shipping-sla-alerts";
import { SupabaseEarlyAccessShippingSlaStore } from "./supabase-shipping-sla";
import { earlyAccessShippingOverdueEventKey } from "./shipping-sla-monitor";
import { EARLY_ACCESS_INTERNAL_RECIPIENT } from "../hardening-contract";

const CHECKOUT = "XEC-0123456789ABCDEF";
const SHIP_BY = "2026-08-10T12:00:00.000Z";

type Row = { cartCheckoutNumber: string; shipByAt: string; stage: string };

const SHIPPING_RPC = "research_early_access_cart_shipping_commitments_due";
const MISSING_MESSAGE = `Could not find the function public.${SHIPPING_RPC}(p_now) in the schema cache`;
const MISSING_DETAILS = `Searched for the function public.${SHIPPING_RPC} with parameter p_now or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.`;

type FixtureReply =
  | Readonly<{ status: number; body: unknown }>
  | Readonly<{ status: number; text: string }>
  | Readonly<{ reject: Error }>;

/**
 * A REAL supabase-js client whose only fake is `fetch`. The SDK builds the
 * request and parses the response exactly as it does in production, so the
 * boundary is tested against the SDK's actual error shape.
 */
function realSdk(replies: FixtureReply[]) {
  const requests: { url: string; method: string; body: unknown }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    const reply = replies.shift();
    if (reply === undefined) throw new Error("unexpected extra request");
    if ("reject" in reply) throw reply.reject;
    const text = "text" in reply ? reply.text : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status, headers: { "Content-Type": "application/json" } });
  });
  const client = createClient("https://persistence-fixture.example.invalid", "synthetic-service-role-key", {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Match server/supabase.ts: Node 20 needs the installed transport even
    // though an RPC never opens a realtime connection.
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
  return { client, requests, fetch };
}

/** The whole production composition, with only the two edges faked: the RPC
 * result and the outbox insert. Everything between them is the real code. */
function harness(rows: Row[]) {
  const inserted: { eventKey: string; recipient: string; templateKey: string; payload: unknown }[] = [];
  const keys = new Set<string>();
  const store = new SupabaseEarlyAccessShippingSlaStore(async () => rows);
  const alerts = createEarlyAccessShippingAlertSink(async (input) => {
    if (keys.has(input.eventKey)) return "already_queued";
    keys.add(input.eventKey);
    inserted.push({
      eventKey: input.eventKey,
      recipient: input.recipient,
      templateKey: input.templateKey,
      payload: input.payload ?? {},
    });
    return "inserted";
  });
  const worker = startEarlyAccessShippingSlaWorker(
    { store, alerts },
    // A very long interval: every test below drives `sweep()` explicitly, so
    // the timer never fires and the test cannot depend on wall-clock timing.
    { intervalMs: 24 * 60 * 60 * 1000 },
  );
  return { worker, inserted };
}

describe("the 72-hour shipping SLA monitor, composed", () => {
  it("produces NOTHING before the deadline", async () => {
    // The RPC only returns due commitments, but the sweep re-checks the
    // deadline itself, so a work list that somehow included a future one still
    // raises no alert.
    const { worker, inserted } = harness([
      { cartCheckoutNumber: CHECKOUT, shipByAt: SHIP_BY, stage: "processing" },
    ]);
    const result = await worker.sweep(new Date("2026-08-10T11:59:59.000Z"));
    expect(result).toMatchObject({ examined: 1, overdue: 0, alertsEnqueued: 0, failures: 0 });
    expect(inserted).toEqual([]);
    worker.stop();
  });

  it("produces exactly ONE deterministic operational notification after the deadline", async () => {
    const { worker, inserted } = harness([
      { cartCheckoutNumber: CHECKOUT, shipByAt: SHIP_BY, stage: "processing" },
    ]);
    const result = await worker.sweep(new Date("2026-08-10T12:00:01.000Z"));
    expect(result).toMatchObject({ examined: 1, overdue: 1, alertsEnqueued: 1, failures: 0 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.eventKey).toBe(earlyAccessShippingOverdueEventKey(CHECKOUT, SHIP_BY));
    expect(inserted[0]?.templateKey).toBe("ea_shipping_overdue_internal");
    worker.stop();
  });

  it("a REPEATED sweep enqueues nothing and reports nothing new", async () => {
    const { worker, inserted } = harness([
      { cartCheckoutNumber: CHECKOUT, shipByAt: SHIP_BY, stage: "processing" },
    ]);
    const first = await worker.sweep(new Date("2026-08-10T12:00:01.000Z"));
    const second = await worker.sweep(new Date("2026-08-10T13:00:00.000Z"));
    const third = await worker.sweep(new Date("2026-08-11T13:00:00.000Z"));
    expect(first.alertsEnqueued).toBe(1);
    expect(second).toMatchObject({ overdue: 1, alertsEnqueued: 0, failures: 0 });
    expect(third).toMatchObject({ overdue: 1, alertsEnqueued: 0, failures: 0 });
    expect(inserted).toHaveLength(1);
    worker.stop();
  });

  it("a SHIPPED order is never overdue, however late the sweep runs", async () => {
    const { worker, inserted } = harness([
      { cartCheckoutNumber: CHECKOUT, shipByAt: SHIP_BY, stage: "shipped" },
    ]);
    const result = await worker.sweep(new Date("2027-01-01T00:00:00.000Z"));
    expect(result).toMatchObject({ examined: 1, overdue: 0, alertsEnqueued: 0 });
    expect(inserted).toEqual([]);
    worker.stop();
  });

  it("a PART-shipped order past its deadline is still overdue", async () => {
    const { worker, inserted } = harness([
      { cartCheckoutNumber: CHECKOUT, shipByAt: SHIP_BY, stage: "partially_shipped" },
    ]);
    expect(await worker.sweep(new Date("2026-08-10T12:00:01.000Z"))).toMatchObject({ overdue: 1 });
    expect(inserted).toHaveLength(1);
    worker.stop();
  });

  it("carries the checkout number and the two instants, and no customer or supplier fact", async () => {
    const { worker, inserted } = harness([
      { cartCheckoutNumber: CHECKOUT, shipByAt: SHIP_BY, stage: "processing" },
    ]);
    await worker.sweep(new Date("2026-08-10T12:00:01.000Z"));
    expect(inserted[0]?.recipient).toBe(EARLY_ACCESS_INTERNAL_RECIPIENT);
    expect(inserted[0]?.payload).toEqual({
      cartCheckoutNumber: CHECKOUT,
      shipByAt: SHIP_BY,
      overdueAt: "2026-08-10T12:00:01.000Z",
    });
    const serialized = JSON.stringify(inserted[0]?.payload);
    for (const forbidden of ["email", "@", "supplier", "sha256", "invoice", "amount", "eac_"]) {
      expect(serialized).not.toContain(forbidden);
    }
    worker.stop();
  });

  it("HOLDS NO PORT that could settle, ship or change a payment", () => {
    // Structural, not a promise. The sweep is handed exactly two ports; there
    // is no expression in this composition that reaches a settlement store, a
    // checkout store or a fulfilment writer.
    const store = new SupabaseEarlyAccessShippingSlaStore(async () => []);
    const alerts = createEarlyAccessShippingAlertSink(async () => "inserted");
    const deps = { store, alerts };
    expect(Object.keys(deps).sort()).toEqual(["alerts", "store"]);
    expect(Object.keys(store)).toEqual(["query"]);
    expect(Object.keys(alerts)).toEqual(["enqueue"]);
    // The read port exposes exactly one method, and it is a read.
    expect(
      Object.getOwnPropertyNames(SupabaseEarlyAccessShippingSlaStore.prototype).sort(),
    ).toEqual(["constructor", "dueBy"]);
  });

  it("cannot fabricate a fulfilment fact: a work list of none alerts on none", async () => {
    const { worker, inserted } = harness([]);
    expect(await worker.sweep(new Date("2027-01-01T00:00:00.000Z"))).toMatchObject({
      examined: 0,
      overdue: 0,
      alertsEnqueued: 0,
      failures: 0,
    });
    expect(inserted).toEqual([]);
    worker.stop();
  });

  it("counts an unavailable queue as a FAILURE, so an outage cannot read as a clean run", async () => {
    const store = new SupabaseEarlyAccessShippingSlaStore(async () => [
      { cartCheckoutNumber: CHECKOUT, shipByAt: SHIP_BY, stage: "processing" },
    ]);
    const alerts = createEarlyAccessShippingAlertSink(async () => "unavailable");
    const worker = startEarlyAccessShippingSlaWorker({ store, alerts }, { intervalMs: 10_000_000 });
    expect(await worker.sweep(new Date("2026-08-10T12:00:01.000Z"))).toMatchObject({
      overdue: 1,
      alertsEnqueued: 0,
      failures: 1,
    });
    worker.stop();
  });

  it("the timer never holds the process open and can be stopped", () => {
    const unref = vi.fn();
    const timers: unknown[] = [];
    const spy = vi.spyOn(globalThis, "setInterval").mockImplementation(((
      handler: TimerHandler,
      ms?: number,
    ) => {
      const handle = { unref, handler, ms };
      timers.push(handle);
      return handle as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    try {
      const worker = startEarlyAccessShippingSlaWorker(
        {
          store: new SupabaseEarlyAccessShippingSlaStore(async () => []),
          alerts: createEarlyAccessShippingAlertSink(async () => "inserted"),
        },
        { intervalMs: 60_000 },
      );
      expect(unref).toHaveBeenCalledTimes(1);
      expect(timers).toHaveLength(1);
      worker.stop();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("the named-admin manual drain", () => {
  function response() {
    const sent: { status: number; body: unknown }[] = [];
    const headers: Record<string, string> = {};
    return {
      sent,
      headers,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      status(code: number) {
        return {
          json(body: unknown) {
            sent.push({ status: code, body });
          },
        };
      },
    };
  }

  it("refuses an unauthenticated caller and does not sweep", async () => {
    const sweep = vi.fn();
    const route = createEarlyAccessShippingSlaSweepAdminRoute({ worker: { sweep } });
    const res = response();
    await route({ actor: null }, res);
    expect(res.sent).toEqual([{ status: 401, body: { ok: false, code: "UNAUTHORIZED" } }]);
    expect(sweep).not.toHaveBeenCalled();
  });

  it("answers COUNTERS ONLY, naming no order", async () => {
    const summary = { examined: 3, overdue: 1, alertsClaimed: 1, alertsEnqueued: 1, failures: 0 };
    const route = createEarlyAccessShippingSlaSweepAdminRoute({
      worker: { sweep: async () => summary },
    });
    const res = response();
    await route({ actor: { id: "admin@example.com" } }, res);
    expect(res.sent).toEqual([{ status: 200, body: { ok: true, summary } }]);
    expect(JSON.stringify(res.sent)).not.toContain("XEC-");
    expect(res.headers["Cache-Control"]).toBe("no-store, private, max-age=0");
  });

  it("answers 503 without detail when the sweep cannot run", async () => {
    const route = createEarlyAccessShippingSlaSweepAdminRoute({
      worker: {
        sweep: async () => {
          throw new Error("rpc research_early_access_cart_shipping_commitments_due failed");
        },
      },
    });
    const res = response();
    await route({ actor: { id: "admin@example.com" } }, res);
    expect(res.sent).toEqual([{ status: 503, body: { ok: false, code: "UNAVAILABLE" } }]);
    expect(JSON.stringify(res.sent)).not.toContain("rpc");
  });
});

describe("when the shipping commitments reader is not installed", () => {
  const missingReply = Object.freeze({
    status: 404,
    body: Object.freeze({ code: "PGRST202", details: MISSING_DETAILS, hint: null, message: MISSING_MESSAGE }),
  });
  const insideBodyReply = Object.freeze({
    status: 404,
    body: Object.freeze({ code: "42883", details: null, hint: null, message: "function public.research_shipping_helper(timestamp with time zone) does not exist" }),
  });

  function responseRecorder() {
    const sent: { status: number; body: unknown }[] = [];
    return {
      sent,
      setHeader() {},
      status(code: number) {
        return {
          json(body: unknown) {
            sent.push({ status: code, body });
          },
        };
      },
    };
  }

  /** Lets the tick's promise chain finish on real timers. The interval is
   * faked, so the test, not wall-clock time, decides when a tick happens. */
  async function settled(done: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200 && !done(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(done()).toBe(true);
  }

  /** Everything real from the SDK to the admin route; only fetch, the outbox
   * insert and the interval are fakes. */
  function realChain(replies: FixtureReply[]) {
    const sdk = realSdk(replies);
    const store = new SupabaseEarlyAccessShippingSlaStore(createEarlyAccessSupabaseQuery(() => sdk.client));
    const inserted: string[] = [];
    const alerts = createEarlyAccessShippingAlertSink(async (input) => {
      inserted.push(input.eventKey);
      return "inserted";
    });
    const ticks: (() => void)[] = [];
    const intervalSpy = vi.spyOn(globalThis, "setInterval").mockImplementation(((handler: TimerHandler) => {
      ticks.push(handler as () => void);
      return { unref() {} } as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const worker = startEarlyAccessShippingSlaWorker({ store, alerts }, { intervalMs: 60_000 });
    const route = createEarlyAccessShippingSlaSweepAdminRoute({ worker });
    return {
      sdk,
      inserted,
      worker,
      route,
      errorSpy,
      tick: ticks[0]!,
      restore() {
        worker.stop();
        intervalSpy.mockRestore();
        errorSpy.mockRestore();
      },
    };
  }

  it("a tick logs a console.error naming the fixed reason, records nothing, and the worker keeps its timer", async () => {
    const chain = realChain([missingReply]);
    try {
      chain.tick();
      await settled(() => chain.errorSpy.mock.calls.length === 1);
      const logged = chain.errorSpy.mock.calls[0]!.join(" ");
      expect(logged).toBe(
        "[ea-shipping-sla] sweep unavailable: the shipping commitments reader is not installed (shipping_commitments_reader_not_installed)",
      );
      expect(logged).not.toMatch(/schema cache|PGRST202|p_now|2026-/);
      expect(chain.inserted).toEqual([]);
      expect(chain.sdk.requests).toHaveLength(1);
    } finally {
      chain.restore();
    }
  });

  it("the manual drain answers 503 with the fixed reason, never a 200 or zero counts", async () => {
    const chain = realChain([missingReply]);
    try {
      const res = responseRecorder();
      await chain.route({ actor: { id: "admin@example.com" } }, res);
      expect(res.sent).toEqual([{
        status: 503,
        body: { ok: false, code: "UNAVAILABLE", reason: "shipping_commitments_reader_not_installed" },
      }]);
      expect(JSON.stringify(res.sent)).not.toMatch(/examined|summary|schema cache|PGRST/);
    } finally {
      chain.restore();
    }
  });

  it("a missing function INSIDE an installed reader stays an opaque error: generic log, 503 with no reason", async () => {
    const chain = realChain([insideBodyReply, insideBodyReply]);
    try {
      chain.tick();
      await settled(() => chain.errorSpy.mock.calls.length === 1);
      expect(chain.errorSpy.mock.calls[0]).toEqual([
        "[ea-shipping-sla] sweep error:",
        "early-access persistence call failed: research_early_access_cart_shipping_commitments_due",
      ]);
      const res = responseRecorder();
      await chain.route({ actor: { id: "admin@example.com" } }, res);
      expect(res.sent).toEqual([{ status: 503, body: { ok: false, code: "UNAVAILABLE" } }]);
    } finally {
      chain.restore();
    }
  });

  it("recovers on the next sweep once the routine is installed, with no restart", async () => {
    const chain = realChain([
      missingReply,
      { status: 200, body: [{ cartCheckoutNumber: CHECKOUT, shipByAt: "2026-08-10 12:00:00+00", stage: "processing" }] },
    ]);
    try {
      chain.tick();
      await settled(() => chain.errorSpy.mock.calls.length === 1);
      const result = await chain.worker.sweep(new Date("2026-08-10T12:00:01.000Z"));
      expect(result).toMatchObject({ examined: 1, overdue: 1, alertsEnqueued: 1, failures: 0 });
      expect(chain.inserted).toEqual([earlyAccessShippingOverdueEventKey(CHECKOUT, SHIP_BY)]);
      expect(chain.errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      chain.restore();
    }
  });
});
