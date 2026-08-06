import { describe, expect, it } from "vitest";

import {
  MigrationTolerantUnitHoldRegistry,
  SupabaseUnitHoldRegistry,
} from "./ops-stores";
import { buildEarlyAccessPersistence } from "./production-deps";
import { EarlyAccessPersistenceError } from "./executor";
import type { EarlyAccessPersistenceCall } from "./executor";
import { ProductControlDeclaredFactsReader } from "../catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../catalog/product-control-source";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../release/first-release-canonical-source";
import { InMemoryEarlyAccessReleaseLedger } from "../release/founder-release";
import { seedFounderFirstRelease } from "../release/founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "../release/founder-supply-seed";
import { createEarlyAccessCatalogRoute } from "../release/release-routes";

type CatalogueUnit = {
  productId: string;
  strength: string | null;
  availability: string;
  purchasable: boolean;
  priceCents: number | null;
  hold: string | null;
};

/**
 * THE HOLD RPC THAT PRODUCTION DOES NOT HAVE.
 *
 * The predeploy check answered:
 *
 *   hold_kinds_rpc_present:     false
 *   confirmation_rpc_present:   true
 *   unit_holds_table_present:   true
 *
 * So migration 54's read function is absent from production. That matters
 * because `activeHoldsForUnit` runs once per unit inside every catalogue
 * projection: an exception there escapes the projection, the catalogue route's
 * own catch turns it into 503, and a missing prohibition REGISTRY takes down
 * the entire catalogue rather than merely leaving it unfiltered.
 *
 * That is the wrong failure direction, and it is worth being precise about
 * why. Holding a unit is not this registry's job alone. A unit is held by an
 * absent founder release, by an unresolved strength dispute, and by
 * unconfirmed supply, and all three of those still work. The registry adds
 * recorded prohibitions on top. An empty answer from it is exactly what a
 * registry with no rows returns, so degrading to empty is truthful, whereas
 * refusing the whole page is not.
 *
 * What must NOT happen, and is asserted below: fabricating a hold, removing
 * one that another source supplied, or quietly degrading the WRITE path. An
 * operator recording a prohibition must never be told it worked.
 */

const PRODUCTION_ENV = {
  NODE_ENV: "production",
  RESEARCH_EARLY_ACCESS_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_value_not_a_real_key",
  RESEARCH_EARLY_ACCESS_OWNER_ID: "3f2f4bde-6f0f-4a11-9a3e-8c7d5b2a1e90",
} as NodeJS.ProcessEnv;

const HOLD_KINDS_RPC = "research_early_access_active_hold_kinds_for_unit";

/** A database that has migration 54's TABLE but not its read FUNCTION. */
function withoutHoldRpc() {
  const calls: string[] = [];
  return {
    calls,
    query: async (call: EarlyAccessPersistenceCall): Promise<unknown> => {
      calls.push(call.fn);
      if (call.fn === HOLD_KINDS_RPC) {
        // Exactly what `runEarlyAccessCall` produces for a missing function:
        // every driver failure collapses into this one opaque error.
        throw new EarlyAccessPersistenceError(call.fn);
      }
      return [];
    },
  };
}

/** A database with migration 54 fully applied. */
function withHoldRpc(kinds: readonly string[] = []) {
  return {
    query: async (call: EarlyAccessPersistenceCall): Promise<unknown> =>
      call.fn === HOLD_KINDS_RPC ? [...kinds] : [],
  };
}

function warnings() {
  const lines: string[] = [];
  return { lines, warn: (message: string) => lines.push(message) };
}

describe("when the hold RPC is present, nothing changes", () => {
  it("passes the durable answer straight through", async () => {
    const registry = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(withHoldRpc(["REGULATORY_HOLD"]).query),
    );

    expect(await registry.activeHoldsForUnit("PEP-001", "VAR-001", "2026-08-06T00:00:00.000Z"))
      .toEqual(["REGULATORY_HOLD"]);
  });

  it("emits no warning at all", async () => {
    const log = warnings();
    const registry = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(withHoldRpc().query),
      log.warn,
    );

    await registry.activeHoldsForUnit("PEP-001", "VAR-001", "2026-08-06T00:00:00.000Z");
    expect(log.lines).toEqual([]);
  });
});

describe("when the hold RPC is absent", () => {
  it("returns an EMPTY hold set instead of throwing", async () => {
    const registry = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(withoutHoldRpc().query),
    );

    const blockers = await registry.activeHoldsForUnit(
      "PEP-001",
      "VAR-001",
      "2026-08-06T00:00:00.000Z",
    );
    // Empty, and specifically NOT a fabricated hold.
    expect(blockers).toEqual([]);
  });

  it("warns exactly ONCE, however many units are projected", async () => {
    // A projection asks per unit. Twenty-two identical warnings per request
    // would bury the one line an operator needs.
    const log = warnings();
    const registry = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(withoutHoldRpc().query),
      log.warn,
    );

    for (let unit = 0; unit < 22; unit += 1) {
      await registry.activeHoldsForUnit(`PEP-${unit}`, `VAR-${unit}`, "2026-08-06T00:00:00.000Z");
    }

    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toContain("[early-access]");
    expect(log.lines[0]).toContain(HOLD_KINDS_RPC);
    expect(log.lines[0]).toContain("migration 54");
  });

  it("says in the warning that the other holds still apply", async () => {
    // The operator reading this at 2am must not conclude the floor is off.
    const log = warnings();
    const registry = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(withoutHoldRpc().query),
      log.warn,
    );
    await registry.activeHoldsForUnit("PEP-001", "VAR-001", "2026-08-06T00:00:00.000Z");

    expect(log.lines[0]).toContain("Founder releases");
    expect(log.lines[0]).toContain("strength disputes");
  });

  it("puts no secret, customer or connection detail in the warning", async () => {
    const log = warnings();
    const registry = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(withoutHoldRpc().query),
      log.warn,
    );
    await registry.activeHoldsForUnit("PEP-SECRET", "VAR-SECRET", "2026-08-06T00:00:00.000Z");

    const line = log.lines[0];
    // Not even the unit that happened to be first: a log line is the wrong
    // home for anything beyond the fact that identifies the gap.
    for (const forbidden of [
      "PEP-SECRET",
      "VAR-SECRET",
      "sb_secret",
      "SUPABASE",
      "supabase.co",
      "@",
      "cus_",
      "eac_",
      "password",
      "token",
      "cookie",
    ]) {
      expect(line, `warning leaked ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("still THROWS on the write path, so an operator is never misled", async () => {
    // Degrading a read is a truthful "no rows". Degrading a write would tell
    // a named human their prohibition was recorded when it was not.
    const failing = {
      query: async (call: EarlyAccessPersistenceCall): Promise<unknown> => {
        throw new EarlyAccessPersistenceError(call.fn);
      },
    };
    const registry = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(failing.query),
    );

    await expect(
      registry.record({ holdId: "hold_1" } as never),
    ).rejects.toBeInstanceOf(EarlyAccessPersistenceError);
    await expect(
      registry.withdraw("hold_1", "Samuel Boadu", "2026-08-06T00:00:00.000Z"),
    ).rejects.toBeInstanceOf(EarlyAccessPersistenceError);
  });

  it("cannot tell a missing function from any other read failure, and says so by warning", async () => {
    // AN HONEST LIMIT, asserted rather than wished away. `runEarlyAccessCall`
    // collapses EVERY driver failure into one opaque EarlyAccessPersistenceError
    // and deliberately discards the cause, because a driver error can carry a
    // connection string. So this wrapper cannot distinguish "migration 54 is
    // not applied" from "the read failed for some other reason", and it treats
    // both the same way: empty holds, one warning.
    //
    // That is the safe direction for a READ whose empty answer is truthful,
    // and the warning is what stops it being silent. A genuine fault shows up
    // as the same log line an operator is already watching for.
    const log = warnings();
    const boom = {
      query: async (): Promise<unknown> => {
        throw new TypeError("some unrelated read failure");
      },
    };
    const registry = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(boom.query),
      log.warn,
    );

    await expect(
      registry.activeHoldsForUnit("PEP-001", "VAR-001", "2026-08-06T00:00:00.000Z"),
    ).resolves.toEqual([]);
    // Not silent. This is the property that makes the collapse acceptable.
    expect(log.lines).toHaveLength(1);
  });

  it("still propagates a failure raised OUTSIDE the executor", async () => {
    // The wrapper only catches what the inner registry throws. A fault in the
    // wrapper's own caller is untouched, so the catch is narrow in scope even
    // though it cannot be narrow in error type.
    const registry = new MigrationTolerantUnitHoldRegistry({
      activeHoldsForUnit: async () => {
        throw new RangeError("not a persistence failure");
      },
    } as unknown as SupabaseUnitHoldRegistry);

    await expect(
      registry.activeHoldsForUnit("PEP-001", "VAR-001", "2026-08-06T00:00:00.000Z"),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe("the production composition uses the tolerant registry", () => {
  it("wraps the durable registry rather than exposing the raw one", () => {
    const build = buildEarlyAccessPersistence(PRODUCTION_ENV, async () => []);

    expect(build.options.holds).toBeInstanceOf(MigrationTolerantUnitHoldRegistry);
  });

  it("survives a production-shaped projection read with the RPC missing", async () => {
    // The end-to-end shape of tonight's deployment: durable everything, and
    // one function that is not there yet.
    const database = withoutHoldRpc();
    const build = buildEarlyAccessPersistence(PRODUCTION_ENV, database.query);

    const holds = build.options.holds;
    expect(holds).toBeDefined();
    await expect(
      holds!.activeHoldsForUnit("PEP-001", "VAR-001", "2026-08-06T00:00:00.000Z"),
    ).resolves.toEqual([]);
    // It really did try the database, rather than being an in-memory stub.
    expect(database.calls).toContain(HOLD_KINDS_RPC);
  });
});

// ---------------------------------------------------------------------------
// The whole point, at the route: a missing RPC must not cost the catalogue
// ---------------------------------------------------------------------------

/**
 * THE END-TO-END SHAPE OF TONIGHT'S DEPLOYMENT.
 *
 * Real 22-unit canonical catalogue, real projection, real declared-facts
 * reader, real founder releases, real supplier confirmations recorded through
 * the governed seed, and a unit-hold registry whose RPC is not there.
 *
 * On the seeding: the confirmations ARE recorded here, through the same seed
 * production preparation runs, because 18 purchasable units is a fact ABOUT
 * confirmed supply and cannot be asserted without it. That is a different
 * question from the one `production-projection-stores.test.ts` asks, which is
 * whether the composition root hands the projection the durable store at all,
 * and which therefore seeds nothing. Two tests, two claims; neither can stand
 * in for the other.
 */
describe("a missing hold RPC does not cost the catalogue", () => {
  async function servedWithHoldRpcMissing(): Promise<{
    status: number | null;
    body: { units: CatalogueUnit[]; purchasableCount: number; heldCount: number };
    warnings: string[];
  }> {
    const log = warnings();
    const confirmations = new InMemorySupplierConfirmationStore();
    // The registry production will run tonight: durable, over a database whose
    // hold function does not exist.
    const holds = new MigrationTolerantUnitHoldRegistry(
      new SupabaseUnitHoldRegistry(withoutHoldRpc().query),
      log.warn,
    );

    const source = new ProductControlCatalogSource({
      catalog: { readCatalog: async () => canonicalReviewProducts() },
      declaredFacts: new ProductControlDeclaredFactsReader({
        inventory: NO_RECORDED_LOTS_INVENTORY,
        currency: resolveEarlyAccessSettlementCurrency(),
        supplierConfirmations: confirmations,
        holds,
      }),
    } as never);

    const at = new Date("2026-08-05T00:00:00.000Z");
    const context = { earlyAccessCustomer: { customerRef: "cus_hold_rpc_missing" } };

    const before = await source.load(at, context);
    await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const confirmed = await source.load(at, context);
    await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

    const route = createEarlyAccessCatalogRoute({
      resolveSession: async () => ({ authenticated: true, expiresAtEpochMs: at.getTime() + 60_000 }),
      catalog: source,
      ledger,
      now: () => at.getTime(),
    } as never);

    const state: { status: number | null; body: unknown } = { status: null, body: null };
    const port = {
      status(code: number) {
        state.status = code;
        return port;
      },
      json(body: unknown) {
        state.body = body;
        return body;
      },
      setHeader() {
        return port;
      },
    };
    await route(
      { cookieHeader: "ea=1", earlyAccessCustomer: context.earlyAccessCustomer },
      port as never,
    );
    return {
      status: state.status,
      body: state.body as { units: CatalogueUnit[]; purchasableCount: number; heldCount: number },
      warnings: log.lines,
    };
  }

  it("answers 200 rather than 503", async () => {
    // The exact regression. With the registry throwing, the projection threw
    // per unit, the route's catch swallowed it, and the customer got
    // "unavailable" for the whole catalogue.
    const served = await servedWithHoldRpcMissing();
    expect(served.status).toBe(200);
  });

  it("serves 22 visible, 18 purchasable, 4 held", async () => {
    const served = await servedWithHoldRpcMissing();
    expect(served.body.units).toHaveLength(22);
    expect(served.body.purchasableCount).toBe(18);
    expect(served.body.heldCount).toBe(4);
  });

  it("keeps Cagrilintide held, with no price and nothing to buy", async () => {
    const served = await servedWithHoldRpcMissing();
    const unit = served.body.units.find((candidate) => candidate.productId === "PEX-028");

    expect(unit).toBeDefined();
    expect(unit?.availability).toBe("TEMPORARILY_HELD");
    expect(unit?.hold).toBe("NO_FOUNDER_RELEASE");
    expect(unit?.purchasable).toBe(false);
    expect(unit?.priceCents).toBeNull();
  });

  it("keeps the three strength-dispute units held", async () => {
    const served = await servedWithHoldRpcMissing();
    for (const [productId, strength] of [
      ["PEP-007", "10 mg"],
      ["PEP-009", "500 mg"],
      ["PEP-010", "10 mg"],
    ] as const) {
      const unit = served.body.units.find(
        (candidate) => candidate.productId === productId && candidate.strength === strength,
      );
      expect(unit, `${productId} ${strength} vanished`).toBeDefined();
      expect(unit?.purchasable, `${productId} ${strength} became purchasable`).toBe(false);
    }
  });

  it("keeps NAD+ 1000 mg AVAILABLE at exactly 10075 cents", async () => {
    const served = await servedWithHoldRpcMissing();
    const unit = served.body.units.find(
      (candidate) => candidate.productId === "PEP-009" && candidate.strength === "1000 mg",
    );

    expect(unit?.availability).toBe("AVAILABLE");
    expect(unit?.purchasable).toBe(true);
    expect(unit?.priceCents).toBe(10_075);
  });

  it("warns once for the whole 22-unit projection, not once per unit", async () => {
    const served = await servedWithHoldRpcMissing();
    expect(served.warnings).toHaveLength(1);
    expect(served.warnings[0]).toContain(HOLD_KINDS_RPC);
  });
});
