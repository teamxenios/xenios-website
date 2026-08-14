import { describe, expect, it } from "vitest";

import { SupabaseEarlyAccessCommerceStore } from "./commerce-store";
import { EarlyAccessPersistenceError, type EarlyAccessPersistenceCall } from "./executor";
import type { EarlyAccessPlacement } from "../routes/store";

/**
 * Coverage for `placementsForCustomers`, the M67 member order-history read.
 *
 * The executor is scripted, so these run with no database. The adapter's
 * contract is narrow: forward the caller's handles to exactly one named
 * routine, hand back each row verbatim and frozen, and treat anything that is
 * not an array of objects as an infrastructure failure rather than a guess.
 * Domain-shape validation is deliberately NOT this adapter's job; the rows
 * round-trip through jsonb and the decorator above applies the ownership rule
 * again.
 */

type Script = Record<string, (call: EarlyAccessPersistenceCall) => unknown>;

function storeWith(script: Script, calls?: EarlyAccessPersistenceCall[]) {
  return new SupabaseEarlyAccessCommerceStore({
    query: async (call) => {
      calls?.push(call);
      const handler = script[call.fn];
      if (!handler) throw new Error(`unscripted call: ${call.fn}`);
      return handler(call);
    },
  });
}

const PRIMARY_REF = "eac_d80e62ad2039e515b943d4d7cb6c2e32";
const ALIAS_REF = "eac_11111111111111111111111111111111";

const placementA = {
  orderNumber: "XEA-1",
  idempotencyKey: "key-1",
  customerRef: PRIMARY_REF,
} as unknown as EarlyAccessPlacement;
const placementB = {
  orderNumber: "XEA-2",
  idempotencyKey: "key-2",
  customerRef: ALIAS_REF,
} as unknown as EarlyAccessPlacement;

describe("placementsForCustomers: the happy path", () => {
  it("issues exactly one named RPC carrying the refs array", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const store = storeWith(
      { research_early_access_placements_for_customers: () => [placementA, placementB] },
      calls,
    );

    await store.placementsForCustomers([PRIMARY_REF, ALIAS_REF]);

    expect(calls).toEqual([
      {
        fn: "research_early_access_placements_for_customers",
        args: { p_customer_refs: [PRIMARY_REF, ALIAS_REF] },
      },
    ]);
  });

  it("returns each row verbatim, with the list and every row frozen", async () => {
    const store = storeWith({
      research_early_access_placements_for_customers: () => [placementA, placementB],
    });

    const result = await store.placementsForCustomers([PRIMARY_REF, ALIAS_REF]);

    expect(result).toEqual([placementA, placementB]);
    expect(Object.isFrozen(result)).toBe(true);
    for (const row of result) expect(Object.isFrozen(row)).toBe(true);
  });

  it("maps an empty answer to an empty list", async () => {
    const store = storeWith({
      research_early_access_placements_for_customers: () => [],
    });
    expect(await store.placementsForCustomers([PRIMARY_REF])).toEqual([]);
  });
});

describe("placementsForCustomers: empty input never touches the database", () => {
  it("answers [] for an empty refs list without issuing a query", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const store = storeWith({}, calls);

    const result = await store.placementsForCustomers([]);

    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(calls).toEqual([]);
  });

  it("answers [] when every ref filters out, without issuing a query", async () => {
    // Empty strings and non-strings are stripped before the RPC. When
    // nothing survives, an unfiltered routine call would mean "all
    // placements", so the adapter refuses to make it.
    const calls: EarlyAccessPersistenceCall[] = [];
    const store = storeWith({}, calls);

    const result = await store.placementsForCustomers(["", 42, null] as unknown as string[]);

    expect(result).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("forwards only the surviving string refs when the input is mixed", async () => {
    const calls: EarlyAccessPersistenceCall[] = [];
    const store = storeWith(
      { research_early_access_placements_for_customers: () => [] },
      calls,
    );

    await store.placementsForCustomers(["", PRIMARY_REF, 42, ALIAS_REF] as unknown as string[]);

    expect(calls[0]?.args).toEqual({ p_customer_refs: [PRIMARY_REF, ALIAS_REF] });
  });
});

describe("placementsForCustomers: a malformed answer is an error, never a guess", () => {
  it("propagates a query failure as the opaque persistence error", async () => {
    const store = storeWith({
      research_early_access_placements_for_customers: () => {
        throw new Error("connection refused");
      },
    });

    await expect(store.placementsForCustomers([PRIMARY_REF])).rejects.toBeInstanceOf(
      EarlyAccessPersistenceError,
    );
  });

  it("refuses a non-array payload", async () => {
    for (const answer of [null, "rows", { rows: [placementA] }]) {
      const store = storeWith({
        research_early_access_placements_for_customers: () => answer,
      });
      await expect(store.placementsForCustomers([PRIMARY_REF])).rejects.toBeInstanceOf(
        EarlyAccessPersistenceError,
      );
    }
  });

  it("refuses an entry that is not a plain object", async () => {
    // A row that is a string, null, or a nested array cannot be a placement
    // record. The whole read fails rather than dropping the row, because a
    // partial order history reads as "those orders do not exist".
    for (const badEntry of ["XEA-1", null, [placementA]]) {
      const store = storeWith({
        research_early_access_placements_for_customers: () => [placementA, badEntry],
      });
      await expect(store.placementsForCustomers([PRIMARY_REF])).rejects.toBeInstanceOf(
        EarlyAccessPersistenceError,
      );
    }
  });

  it("passes an object row through verbatim even when fields are missing", async () => {
    // Pinning the actual contract: the adapter checks array-of-objects and
    // nothing else. Domain fields round-trip through jsonb unvalidated here,
    // and the ownership rule above re-checks what it renders.
    const skeleton = { orderNumber: "XEA-3" };
    const store = storeWith({
      research_early_access_placements_for_customers: () => [skeleton],
    });

    const result = await store.placementsForCustomers([PRIMARY_REF]);

    expect(result).toEqual([skeleton]);
  });
});
