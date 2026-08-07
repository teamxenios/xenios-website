/**
 * CONSTRUCTING THE MONEY AUTHORITY MUST NOT TOUCH THE NETWORK.
 *
 * The hazard this file closes, found in review of PR #224:
 *
 *   resolveMoneyPriceAuthority (production-deps.ts) used to build the live
 *   Product Control reader eagerly. createProductionProductControlReader runs
 *   `new SupabaseProductAdminRepository()`, whose default `db` parameter calls
 *   getSupabaseAdmin() AT CONSTRUCTION (product-admin-production.ts:216). That
 *   reads AMBIENT process.env.SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, not
 *   the injected env (supabase.ts:14-15), and it fires a fire-and-forget
 *   `auth.admin.listUsers` privilege probe (supabase.ts:34-49). That probe is
 *   a real outbound call.
 *
 *   It was unreachable only because the flag defaults off. But
 *   production-wiring.test.ts's LIVE_ENV already carries SUPABASE_*, so the
 *   day anyone adds RESEARCH_PRICE_AUTHORITY_ENABLED to a test env, the suite
 *   would dial out of the machine it runs on.
 *
 * The proof below is the literal claim: with the flag ON and SUPABASE_* set,
 * constructing the authority AND then driving a real price read through it
 * makes ZERO outbound calls. `fetch` is replaced with a spy that throws, so
 * even a regression cannot leave the machine, and the assertion is that it was
 * never reached at all.
 *
 * The values used for SUPABASE_* are throwaway placeholders, they are not
 * credentials of any kind, and nothing in this file prints an env value.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { PRICE_AUTHORITY_FLAG } from "./price-authority";
import { resolveMoneyPriceAuthority } from "./production-deps";

const ASOF = new Date("2026-07-28T12:00:00.000Z");

/** Throwaway placeholders. Not credentials, and never printed. */
const PLACEHOLDER_SUPABASE: NodeJS.ProcessEnv = {
  SUPABASE_URL: "https://placeholder.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-not-a-real-key",
};

/**
 * A fetch that cannot leave the machine. If any construction path tries an
 * outbound call, this throws instead of dialling, and the spy records it.
 */
function trapFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    throw new Error("outbound call attempted during authority construction");
  });
}

/** Lets any fire-and-forget promise chain reach its first fetch. */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("constructing the money authority performs no outbound call", () => {
  it("FLAG ON with SUPABASE_* set: zero fetches at construction", async () => {
    const fetchSpy = trapFetch();

    const authority = resolveMoneyPriceAuthority({
      ...PLACEHOLDER_SUPABASE,
      [PRICE_AUTHORITY_FLAG]: "true",
    });

    expect(authority).toBeDefined();
    await drainMicrotasks();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("FLAG ON with SUPABASE_* set: zero fetches when the authority is actually READ", async () => {
    // Deferring construction to the first read would move the hazard rather
    // than remove it, so the read path is driven here too.
    const fetchSpy = trapFetch();

    const authority = resolveMoneyPriceAuthority({
      ...PLACEHOLDER_SUPABASE,
      [PRICE_AUTHORITY_FLAG]: "true",
    });
    if (!authority) throw new Error("expected an authority with the flag on");

    const priced = await authority.priceLines([{ sku: "P001", quantity: 1 }], ASOF);

    // FAIL CLOSED, not a fabricated price: the test environment's reader knows
    // no products, so the only answer it can give is a refusal.
    expect(priced.get("P001")).toEqual({
      state: "refused",
      reason: "sku_unknown",
    });

    await drainMicrotasks();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("FLAG OFF: builds nothing at all, and still no fetch", async () => {
    const fetchSpy = trapFetch();

    expect(resolveMoneyPriceAuthority(PLACEHOLDER_SUPABASE)).toBeUndefined();
    expect(resolveMoneyPriceAuthority({})).toBeUndefined();

    await drainMicrotasks();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("makes no call even when the AMBIENT process.env carries SUPABASE_*", async () => {
    // This is the exact hazard, reproduced. getSupabaseAdmin reads AMBIENT
    // process.env, not the injected env, so the injected env alone cannot
    // prove the absence of an outbound call: on a machine (or a CI job) whose
    // environment exports SUPABASE_*, eager construction builds a real client
    // and fires the listUsers privilege probe. The placeholders below are
    // throwaway, the trapped fetch cannot leave the machine, and the ambient
    // values are restored whatever happens.
    const fetchSpy = trapFetch();
    const before = {
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    process.env.SUPABASE_URL = PLACEHOLDER_SUPABASE.SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      PLACEHOLDER_SUPABASE.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const authority = resolveMoneyPriceAuthority({
        ...PLACEHOLDER_SUPABASE,
        [PRICE_AUTHORITY_FLAG]: "true",
      });
      if (!authority) throw new Error("expected an authority with the flag on");

      const priced = await authority.priceLines(
        [{ sku: "P001", quantity: 1 }],
        ASOF,
      );
      expect(priced.get("P001")).toEqual({
        state: "refused",
        reason: "sku_unknown",
      });

      await drainMicrotasks();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (before.url === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = before.url;
      if (before.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = before.key;
    }
  });

  it("an env that explicitly says NODE_ENV=test is honoured too", async () => {
    // The injected env objects in this package are partial and often carry no
    // NODE_ENV, so the guard consults the ambient runner env as well. Both
    // spellings must land in the same place.
    const fetchSpy = trapFetch();

    const authority = resolveMoneyPriceAuthority({
      ...PLACEHOLDER_SUPABASE,
      NODE_ENV: "test",
      [PRICE_AUTHORITY_FLAG]: "true",
    });
    if (!authority) throw new Error("expected an authority with the flag on");

    const priced = await authority.priceLines([{ sku: "P001", quantity: 1 }], ASOF);
    expect(priced.get("P001")).toEqual({
      state: "refused",
      reason: "sku_unknown",
    });

    await drainMicrotasks();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
