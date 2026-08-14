// The production wiring of the member order-history read (M67).
//
// The decorator, the binding directory, and the commerce store were each built
// and tested, and the feature still shipped inert: `earlyAccessOrderHistory`
// was an OPTIONAL wiring field that only tests ever supplied, so every real
// deployment ran the undecorated orders service. This file pins the two facts
// that close that gap for good:
//
//   1. `buildEarlyAccessOrderHistory` yields the read pair exactly when the
//      Early Access persistence decision is durable, and null otherwise.
//   2. `defaultWiring()`, the object production spreads into every
//      `buildCommerceDependencies()` call, actually carries the field in a
//      durable environment. This is the assertion that would have failed
//      before the fix.

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEarlyAccessOrderHistory } from "../persistence/production-deps";
import { defaultWiring } from "../../commerce/production-deps";

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

describe("buildEarlyAccessOrderHistory", () => {
  it("supplies the read pair in a durable environment", () => {
    const deps = buildEarlyAccessOrderHistory({ ...DURABLE_ENV }, UNREACHABLE_QUERY);
    expect(deps).not.toBeNull();
    expect(typeof deps?.bindings.customerRefsFor).toBe("function");
    expect(typeof deps?.store.placementsForCustomers).toBe("function");
  });

  it("returns null when production has no Supabase, the refused mode", () => {
    const env = { ...DURABLE_ENV, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
    expect(buildEarlyAccessOrderHistory(env, UNREACHABLE_QUERY)).toBeNull();
  });

  it("returns null when the Early Access flag is off, the memory mode", () => {
    const env = { NODE_ENV: "development" };
    expect(buildEarlyAccessOrderHistory(env, UNREACHABLE_QUERY)).toBeNull();
  });
});

describe("the production wiring carries the order-history field", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaultWiring supplies earlyAccessOrderHistory in a durable environment", () => {
    for (const [key, value] of Object.entries(DURABLE_ENV)) {
      vi.stubEnv(key, value);
    }
    const wiring = defaultWiring();
    expect(wiring.earlyAccessOrderHistory).toBeDefined();
    expect(typeof wiring.earlyAccessOrderHistory?.bindings.customerRefsFor).toBe("function");
    expect(typeof wiring.earlyAccessOrderHistory?.store.placementsForCustomers).toBe("function");
  });

  it("defaultWiring leaves the field absent when persistence is not durable", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEARCH_EARLY_ACCESS_ENABLED", "true");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(defaultWiring().earlyAccessOrderHistory).toBeUndefined();
  });
});
