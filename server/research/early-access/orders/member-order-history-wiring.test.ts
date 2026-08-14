// The production wiring of the member order-history read (M67).
//
// The decorator, the binding directory, and the commerce store were each built
// and tested, and the feature still shipped inert once: the wiring field was
// optional and only tests ever supplied it, so every real deployment ran the
// undecorated orders service. The production composition now rides the Early
// Access persistence build (server/index.ts passes build.orderHistory into
// buildCommerceDependencies), so this file pins the fact that closes the gap
// for good: the durable persistence build actually carries the read pair, and
// the non-durable builds actually do not.

import { describe, expect, it } from "vitest";
import { buildEarlyAccessPersistence } from "../persistence/production-deps";

/** A query runner that must never be reached: construction only, no calls. */
const UNREACHABLE_QUERY = () => {
  throw new Error("no persistence call belongs in a wiring test");
};

/** The smallest environment the persistence decision reads as durable. */
const DURABLE_ENV = Object.freeze({
  NODE_ENV: "production",
  RESEARCH_EARLY_ACCESS_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-shape-only",
  RESEARCH_EARLY_ACCESS_OWNER_ID: "3f2f0e5a-9d1c-4b8e-a6d0-1c2b3a4d5e6f",
});

describe("the durable persistence build carries the order-history read pair", () => {
  it("supplies orderHistory with both reads in a durable environment", () => {
    const build = buildEarlyAccessPersistence({ ...DURABLE_ENV }, UNREACHABLE_QUERY);
    expect(build.mode).toBe("durable");
    expect(build.orderHistory).toBeDefined();
    expect(typeof build.orderHistory?.bindings.customerRefsFor).toBe("function");
    expect(typeof build.orderHistory?.store.placementsForCustomers).toBe("function");
  });

  it("omits orderHistory when production has no Supabase, the refused mode", () => {
    const build = buildEarlyAccessPersistence(
      { ...DURABLE_ENV, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
      UNREACHABLE_QUERY,
    );
    expect(build.mode).toBe("refused");
    expect(build.orderHistory).toBeUndefined();
  });

  it("omits orderHistory in local development without Supabase, the memory mode", () => {
    const build = buildEarlyAccessPersistence({ NODE_ENV: "development" }, UNREACHABLE_QUERY);
    expect(build.mode).toBe("memory");
    expect(build.orderHistory).toBeUndefined();
  });
});
