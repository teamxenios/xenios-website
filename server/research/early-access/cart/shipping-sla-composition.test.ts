import { describe, expect, it, vi } from "vitest";
import {
  createEarlyAccessShippingSlaSweepAdminRoute,
  startEarlyAccessShippingSlaWorker,
} from "./shipping-sla-composition";
import { createEarlyAccessShippingAlertSink } from "./shipping-sla-alerts";
import { SupabaseEarlyAccessShippingSlaStore } from "./supabase-shipping-sla";
import { earlyAccessShippingOverdueEventKey } from "./shipping-sla-monitor";
import { EARLY_ACCESS_INTERNAL_RECIPIENT } from "../hardening-contract";

const CHECKOUT = "XEC-0123456789ABCDEF";
const SHIP_BY = "2026-08-10T12:00:00.000Z";

type Row = { cartCheckoutNumber: string; shipByAt: string; stage: string };

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
