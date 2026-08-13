import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EARLY_ACCESS_CART_MAX_QUANTITY } from "@shared/research/early-access-cart";
import {
  DIRECT_EARLY_ACCESS_MAX_QUANTITY,
  REQUEST_MAX_QUANTITY,
} from "@shared/research/early-access-quantity";
import { validateEarlyAccessRelease } from "../release/founder-release";

function releaseAt(quantity: number) {
  return validateEarlyAccessRelease({
    releaseId: `rel-f012-${quantity}`,
    productId: "prod-f012",
    variantId: "var-f012",
    productVersion: "a".repeat(64),
    status: "approved",
    approvedPriceCents: 1_000,
    currency: "USD",
    waivedBlockers: [],
    approvedQuantityLimit: quantity,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "F-012 pre-M66 direct quantity domain verification.",
    recordedAt: "2026-08-12T12:00:00.000Z",
  });
}

describe("F-013 application/database agreement, 1 through 50", () => {
  it("permits release authority at 50 and refuses 51", () => {
    expect(EARLY_ACCESS_CART_MAX_QUANTITY).toBe(DIRECT_EARLY_ACCESS_MAX_QUANTITY);
    expect(EARLY_ACCESS_CART_MAX_QUANTITY).toBe(50);
    // F-013 collapsed the split: the request ceiling IS the normal ceiling.
    expect(REQUEST_MAX_QUANTITY).toBe(EARLY_ACCESS_CART_MAX_QUANTITY);
    expect(releaseAt(20).ok).toBe(true);
    expect(releaseAt(21).ok).toBe(true);
    expect(releaseAt(50).ok).toBe(true);
    expect(releaseAt(51)).toEqual({ ok: false, code: "QUANTITY_LIMIT_INVALID" });
  });

  it("pins the APPLIED M65 band, which is still 1..20 in the database today", () => {
    // This is not nostalgia for F-012. M65 is the migration that is actually
    // applied to production right now, so its band is the real durable
    // constraint until M66 is applied. Asserting it keeps the deploy hazard
    // visible: ship the F-013 code against an M65 database and a 21 unit
    // checkout passes every application layer and is then refused by Postgres.
    const m65 = readFileSync(
      path.resolve("supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql"),
      "utf8",
    );
    expect(m65).toContain("check (quantity >= 1 and quantity <= 20)");
    expect(m65).not.toContain("check (quantity >= 1 and quantity <= 50)");
  });

  it("pins the M66 widening to the F-013 band", () => {
    const m66 = readFileSync(
      path.resolve("supabase/migrations/20260812120000_research_early_access_cart_quantity_band_50.sql"),
      "utf8",
    );
    expect(m66).toContain("quantity >= 1 and quantity <= 50");
    expect(m66).toContain("quantity < 1 or quantity > 50");
  });

  it("keeps M66 visibly separate and design-only", () => {
    const m66 = readFileSync(
      path.resolve("supabase/migrations/20260812120000_research_early_access_cart_quantity_band_50.sql"),
      "utf8",
    );
    expect(m66).toContain("DESIGN ONLY");
    expect(m66).toContain("does not authorize application");
    expect(m66).toContain("M66 expected exact M65 1..20 band");
    expect(m66).toContain("quantity<=50");
  });
});
