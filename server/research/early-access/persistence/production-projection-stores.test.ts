import { describe, expect, it } from "vitest";

import { buildEarlyAccessPersistence } from "./production-deps";
import {
  MigrationTolerantUnitHoldRegistry,
  SupabaseSupplierConfirmationStore,
} from "./ops-stores";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import { InMemoryUnitHoldRegistry } from "../ops/unit-holds";
import type { EarlyAccessPersistenceCall } from "./executor";

/**
 * THE TWO PROJECTION-TIME STORES PRODUCTION FORGOT.
 *
 * WHAT HAPPENED
 *
 * The live catalogue served 22 visible units with 0 purchasable and 22 held,
 * to a customer who had redeemed a verification link and accepted the policy,
 * with 44 active supplier confirmations sitting in the database.
 *
 * `buildEarlyAccessPersistence` composed ten durable ports and omitted two:
 * `supplierConfirmations` and `holds`. Those two are not commerce ports like
 * the others; they are read at PROJECTION time by the declared-facts reader to
 * answer "has a named human confirmed supply for this exact unit" and "is this
 * unit under a prohibition". Because they were absent, `register.ts` took its
 * fallbacks, and the live process asked an EMPTY in-memory store about supply
 * the database had recorded 44 times.
 *
 * An unconfirmed unit carries a NON-WAIVABLE supply blocker, so
 * `decideEarlyAccessRelease` refused before it looked at a release, and every
 * unit in the opening set went held with no price. The releases, the
 * confirmations, the identity and the agreement were all correct; two of them
 * were invisible to the process.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 *
 * `production-deps.test.ts` asserts the durable MODE and the commerce ports.
 * It was green throughout, because it never asked about these two keys. A test
 * that enumerates some of the composition proves the composition works, not
 * that the deployment does. This file asks only about the omission, and it
 * builds the options through the SAME function `server/index.ts` calls.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It seeds no confirmation and no hold. A test that injected a fake
 * confirmation would prove the projection can read one, which was never in
 * doubt; the defect was that production asked the wrong object. So the proof
 * here is that the wired store TALKS TO THE DATABASE: the recording query
 * below observes the RPC an in-memory store could never issue.
 */

/** The environment `server/index.ts` runs under in production. */
const PRODUCTION_ENV = {
  NODE_ENV: "production",
  RESEARCH_EARLY_ACCESS_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_value_not_a_real_key",
  RESEARCH_EARLY_ACCESS_OWNER_ID: "3f2f4bde-6f0f-4a11-9a3e-8c7d5b2a1e90",
  RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS: JSON.stringify([
    { kind: "early_access_terms", version: "v1" },
  ]),
} as NodeJS.ProcessEnv;

/**
 * A query that answers NOTHING and remembers every call.
 *
 * Answering nothing matters: it is the same answer an empty in-memory store
 * gives, so the tests below cannot pass because the data was helpful. They
 * pass only because the RPC was ISSUED, which is the thing the in-memory
 * fallback cannot do.
 */
function recordingQuery() {
  const calls: EarlyAccessPersistenceCall[] = [];
  const query = async (call: EarlyAccessPersistenceCall): Promise<unknown> => {
    calls.push(call);
    // The empty answer in each RPC's own SHAPE. The hold reader returns a set
    // of blocker kinds and refuses a non-array, so `[]` is its "nothing"
    // exactly as `null` is the confirmation reader's. Neither is seeded data:
    // both are what the database says when it holds no row.
    return call.fn.includes("hold") ? [] : null;
  };
  return { calls, query };
}

function buildProduction(query?: (call: EarlyAccessPersistenceCall) => Promise<unknown>) {
  return buildEarlyAccessPersistence(PRODUCTION_ENV, query ?? (async () => null));
}

describe("the production composition supplies BOTH projection-time stores", () => {
  it("wires a durable supplier-confirmation store, not the in-memory fallback", () => {
    // This is the assertion whose absence cost the launch. Removing
    // `supplierConfirmations` from production-deps.ts fails here.
    const build = buildProduction();

    expect(build.mode).toBe("durable");
    expect(
      build.options.supplierConfirmations,
      "production never supplied supplierConfirmations, so register.ts fell back to an EMPTY in-memory store and every unit projected held",
    ).toBeDefined();
    expect(build.options.supplierConfirmations).toBeInstanceOf(SupabaseSupplierConfirmationStore);
    // Named explicitly, because the fallback is the exact failure mode.
    expect(build.options.supplierConfirmations).not.toBeInstanceOf(
      InMemorySupplierConfirmationStore,
    );
  });

  it("wires a durable unit-hold registry, not the in-memory fallback", () => {
    const build = buildProduction();

    expect(
      build.options.holds,
      "production never supplied holds, so a recorded prohibition was invisible to the projection",
    ).toBeDefined();
    // The DURABLE registry, behind the migration-tolerant read wrapper. The
    // wrapper is required because production proved the hold RPC is absent
    // (migration 54 not applied) and a throwing projection 503s the whole
    // catalogue; hold-rpc-compatibility.test.ts owns that behaviour. What
    // matters here is that it is not the in-memory fallback that caused the
    // outage this file exists to prevent.
    expect(build.options.holds).toBeInstanceOf(MigrationTolerantUnitHoldRegistry);
    expect(build.options.holds).not.toBeInstanceOf(InMemoryUnitHoldRegistry);
  });

  it("names both keys in the options object, so neither can be dropped silently", () => {
    // A key-level assertion as well as a type-level one. If a future refactor
    // moves either store behind a conditional that production does not enter,
    // this fails even if the class is still imported somewhere.
    const keys = Object.keys(buildProduction().options);
    expect(keys).toContain("supplierConfirmations");
    expect(keys).toContain("holds");
  });
});

describe("the wired stores actually reach the database", () => {
  it("issues a supplier-confirmation RPC, which an in-memory store cannot", async () => {
    const { calls, query } = recordingQuery();
    const build = buildProduction(query);

    const confirmations = build.options.supplierConfirmations;
    expect(confirmations).toBeDefined();
    // The exact read the declared-facts reader performs per unit during a
    // projection. Nothing is seeded; the answer is null either way.
    const answer = await confirmations!.liveForUnit(
      "PEP-001",
      "VAR-001",
      "2026-08-06T00:00:00.000Z",
    );

    expect(answer).toBeNull();
    // THE PROOF. An empty in-memory store returns null too, and issues no
    // call at all. One RPC means the projection is asking the database.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some((call) => call.fn.includes("supplier_confirmation"))).toBe(true);
  });

  it("issues a unit-hold RPC, which an in-memory registry cannot", async () => {
    const { calls, query } = recordingQuery();
    const build = buildProduction(query);

    const holds = build.options.holds;
    expect(holds).toBeDefined();
    const blockers = await holds!.activeHoldsForUnit(
      "PEP-001",
      "VAR-001",
      "2026-08-06T00:00:00.000Z",
    );

    expect(blockers).toEqual([]);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some((call) => call.fn.includes("hold"))).toBe(true);
  });

  it("keeps every other durable port it already had", () => {
    // The repair adds two keys and must remove none. Checked as a set rather
    // than one by one, so a dropped port is caught even if no test names it.
    const keys = Object.keys(buildProduction().options).sort();
    for (const expected of [
      "agreementRecorder",
      "agreements",
      "audit",
      "consumed",
      "customers",
      "holds",
      "proofStorage",
      "referrals",
      "releases",
      "repository",
      "requiredAgreements",
      "sessionBindings",
      "shipping",
      "store",
      "suppliers",
      "supplierConfirmations",
    ]) {
      expect(keys, `production lost the ${expected} port`).toContain(expected);
    }
  });
});

describe("the modes that must NOT reach for a database", () => {
  it("memory mode still passes no overrides at all", () => {
    // Local development keeps register.ts's in-memory defaults, which is
    // correct there: an empty confirmation store in a dev process holds every
    // unit, and holding is the safe direction.
    const build = buildEarlyAccessPersistence({} as NodeJS.ProcessEnv);
    expect(build.mode).toBe("memory");
    expect(Object.keys(build.options)).toEqual([]);
  });

  it("refused mode mounts no projection store, because it must not project at all", () => {
    const build = buildEarlyAccessPersistence({
      NODE_ENV: "production",
      RESEARCH_EARLY_ACCESS_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(build.mode).toBe("refused");
    expect(build.options.supplierConfirmations).toBeUndefined();
    expect(build.options.holds).toBeUndefined();
  });
});
