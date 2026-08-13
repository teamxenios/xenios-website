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
    releaseId: `rel-f013-${quantity}`,
    productId: "prod-f013",
    variantId: "var-f013",
    productVersion: "a".repeat(64),
    status: "approved",
    approvedPriceCents: 1_000,
    currency: "USD",
    waivedBlockers: [],
    approvedQuantityLimit: quantity,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "F-013 quantity-50 candidate domain verification.",
    recordedAt: "2026-08-12T12:00:00.000Z",
  });
}

describe("founder quantity-50 application and prepared-database agreement", () => {
  it("permits normal-order release authority through 50 and refuses 51", () => {
    expect(EARLY_ACCESS_CART_MAX_QUANTITY).toBe(DIRECT_EARLY_ACCESS_MAX_QUANTITY);
    expect(EARLY_ACCESS_CART_MAX_QUANTITY).toBe(50);
    expect(REQUEST_MAX_QUANTITY).toBe(50);
    expect(releaseAt(1).ok).toBe(true);
    expect(releaseAt(20).ok).toBe(true);
    expect(releaseAt(21).ok).toBe(true);
    expect(releaseAt(25).ok).toBe(true);
    expect(releaseAt(49).ok).toBe(true);
    expect(releaseAt(50).ok).toBe(true);
    expect(releaseAt(51)).toEqual({ ok: false, code: "QUANTITY_LIMIT_INVALID" });
  });

  it("pins the old accepted durable M65 predecessor without treating it as current policy", () => {
    const m65 = readFileSync(
      path.resolve("supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql"),
      "utf8",
    );
    expect(m65).toContain("check (quantity >= 1 and quantity <= 20)");
    expect(m65).toContain("where quantity < 1 or quantity > 20");
    expect(m65).not.toContain("check (quantity >= 1 and quantity <= 50)");
  });

  it("keeps verified M66 visibly separate and unapplied to production", () => {
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
