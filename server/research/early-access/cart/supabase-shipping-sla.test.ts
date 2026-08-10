import { describe, expect, it } from "vitest";
import { SupabaseEarlyAccessShippingSlaStore } from "./supabase-shipping-sla";
import { EarlyAccessPersistenceError } from "../persistence/executor";

const RPC = "research_early_access_cart_shipping_commitments_due";

function storeOver(rows: unknown, capture?: { call?: { fn: string; args: unknown } }) {
  return new SupabaseEarlyAccessShippingSlaStore(async (call) => {
    if (capture) capture.call = { fn: call.fn, args: call.args };
    return rows;
  });
}

describe("the durable shipping SLA work list", () => {
  it("reads the M64 routine, and nothing else", async () => {
    const capture: { call?: { fn: string; args: unknown } } = {};
    const store = storeOver([], capture);
    await store.dueBy("2026-08-10T12:00:00.000Z");
    expect(capture.call?.fn).toBe(RPC);
    expect(capture.call?.args).toEqual({ p_now: "2026-08-10T12:00:00.000Z" });
  });

  it("forwards the caller's instant rather than reading a clock of its own", async () => {
    const seen: string[] = [];
    const store = new SupabaseEarlyAccessShippingSlaStore(async (call) => {
      seen.push(String((call.args as { p_now: string }).p_now));
      return [];
    });
    await store.dueBy("2020-01-01T00:00:00.000Z");
    await store.dueBy("2030-01-01T00:00:00.000Z");
    expect(seen).toEqual(["2020-01-01T00:00:00.000Z", "2030-01-01T00:00:00.000Z"]);
  });

  it("decodes exactly the three contract fields and normalizes the instant", async () => {
    const store = storeOver([
      {
        cartCheckoutNumber: "XEC-0123456789ABCDEF",
        // Postgres renders timestamptz like this; the shared overdue rule and
        // every other shipByAt in the system are ISO-8601 UTC.
        shipByAt: "2026-08-10 09:00:00+00",
        stage: "processing",
      },
    ]);
    expect(await store.dueBy("2026-08-10T12:00:00.000Z")).toEqual([
      {
        cartCheckoutNumber: "XEC-0123456789ABCDEF",
        shipByAt: "2026-08-10T09:00:00.000Z",
        stage: "processing",
      },
    ]);
  });

  it("accepts every stage a settled checkout can be at", async () => {
    for (const stage of ["processing", "partially_shipped", "shipped"] as const) {
      const store = storeOver([
        { cartCheckoutNumber: "XEC-0123456789ABCDEF", shipByAt: "2026-08-10T09:00:00Z", stage },
      ]);
      expect((await store.dueBy("2026-08-10T12:00:00.000Z"))[0]?.stage).toBe(stage);
    }
  });

  it("REFUSES a malformed row rather than skipping it", async () => {
    // A skipped commitment is an order that silently leaves SLA supervision
    // with nobody told. The sweep must see a failure, not a shorter list.
    const cases: unknown[] = [
      [{ cartCheckoutNumber: "XEC-1", shipByAt: "2026-08-10T09:00:00Z", stage: "checkout_reserved" }],
      [{ cartCheckoutNumber: "XEC-1", shipByAt: "not-a-date", stage: "processing" }],
      [{ cartCheckoutNumber: "", shipByAt: "2026-08-10T09:00:00Z", stage: "processing" }],
      [{ cartCheckoutNumber: "XEC-1", stage: "processing" }],
      [{ cartCheckoutNumber: "XEC-1", shipByAt: "2026-08-10T09:00:00Z" }],
      ["not an object"],
      [null],
    ];
    for (const rows of cases) {
      await expect(storeOver(rows).dueBy("2026-08-10T12:00:00.000Z")).rejects.toBeInstanceOf(
        EarlyAccessPersistenceError,
      );
    }
  });

  it("refuses an answer that is not a list", async () => {
    await expect(storeOver({}).dueBy("2026-08-10T12:00:00.000Z")).rejects.toBeInstanceOf(
      EarlyAccessPersistenceError,
    );
  });

  it("collapses a driver failure into the opaque persistence error", async () => {
    const store = new SupabaseEarlyAccessShippingSlaStore(async () => {
      throw new Error("connection string postgres://user:secret@host/db");
    });
    await expect(store.dueBy("2026-08-10T12:00:00.000Z")).rejects.toThrowError(
      /early-access persistence call failed/,
    );
    await expect(store.dueBy("2026-08-10T12:00:00.000Z")).rejects.not.toThrowError(/secret/);
  });

  it("returns an empty list unchanged, which is the common case", async () => {
    expect(await storeOver([]).dueBy("2026-08-10T12:00:00.000Z")).toEqual([]);
  });
});
