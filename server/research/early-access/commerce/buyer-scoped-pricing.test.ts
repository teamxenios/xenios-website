/**
 * The buyer-scoped pricing seam itself: the flag is exact, and the one read
 * path can only ever answer a sheet or null, never an exception and never a
 * guess.
 */
import { describe, expect, it } from "vitest";

import {
  BUYER_SCOPED_PRICING_ENV,
  buyerScopedPricingEnabled,
  resolveBuyerSheet,
  type BuyerPriceSheet,
  type BuyerScopedPricing,
} from "./buyer-scoped-pricing";

const SHEET: BuyerPriceSheet = Object.freeze({
  profileKey: "KRIS_VOLUME_PARTNER",
  entitlementId: "ent_test",
  priceFor: () => ({ amountCents: 2_464, currency: "USD" }),
});

describe("the buyer-scoped pricing flag", () => {
  it("enables only on the exact profile name", () => {
    expect(buyerScopedPricingEnabled({ [BUYER_SCOPED_PRICING_ENV]: "KRIS_VOLUME_PARTNER" })).toBe(true);
    expect(buyerScopedPricingEnabled({ [BUYER_SCOPED_PRICING_ENV]: " KRIS_VOLUME_PARTNER " })).toBe(true);
  });

  it.each([
    ["absent", {}],
    ["empty", { [BUYER_SCOPED_PRICING_ENV]: "" }],
    ["a truthy boolean word", { [BUYER_SCOPED_PRICING_ENV]: "true" }],
    ["a one", { [BUYER_SCOPED_PRICING_ENV]: "1" }],
    ["lowercase", { [BUYER_SCOPED_PRICING_ENV]: "kris_volume_partner" }],
    ["a different profile", { [BUYER_SCOPED_PRICING_ENV]: "DEFAULT_CONSUMER" }],
  ])("stays disabled for %s", (_label, env) => {
    expect(buyerScopedPricingEnabled(env as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("resolveBuyerSheet", () => {
  const provider: BuyerScopedPricing = { forCustomer: async () => SHEET };

  it("returns the provider's sheet", async () => {
    expect(await resolveBuyerSheet(provider, "eac_" + "a".repeat(32), 1_755_000_000_000)).toBe(SHEET);
  });

  it("answers null with no provider configured", async () => {
    expect(await resolveBuyerSheet(undefined, "eac_" + "a".repeat(32), 1_755_000_000_000)).toBeNull();
  });

  it("answers null rather than throwing when the provider throws", async () => {
    const failing: BuyerScopedPricing = {
      forCustomer: async () => {
        throw new Error("supabase unreachable");
      },
    };
    expect(await resolveBuyerSheet(failing, "eac_" + "a".repeat(32), 1_755_000_000_000)).toBeNull();
  });

  it("answers null for degenerate inputs without consulting the provider", async () => {
    let consulted = 0;
    const counting: BuyerScopedPricing = {
      forCustomer: async () => {
        consulted += 1;
        return SHEET;
      },
    };
    expect(await resolveBuyerSheet(counting, "", 1)).toBeNull();
    expect(await resolveBuyerSheet(counting, "eac_" + "a".repeat(32), Number.NaN)).toBeNull();
    expect(consulted).toBe(0);
  });
});
