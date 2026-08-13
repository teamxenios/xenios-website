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

describe("F-012 pre-M66 application/database agreement", () => {
  it("permits direct authority at 20 and refuses a release authority of 21", () => {
    expect(EARLY_ACCESS_CART_MAX_QUANTITY).toBe(DIRECT_EARLY_ACCESS_MAX_QUANTITY);
    expect(EARLY_ACCESS_CART_MAX_QUANTITY).toBe(20);
    expect(REQUEST_MAX_QUANTITY).toBe(50);
    expect(releaseAt(20).ok).toBe(true);
    expect(releaseAt(21)).toEqual({ ok: false, code: "QUANTITY_LIMIT_INVALID" });
  });

  it("pins the accepted durable M65 band to the same direct maximum", () => {
    const m65 = readFileSync(
      path.resolve("supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql"),
      "utf8",
    );
    expect(m65).toContain("check (quantity >= 1 and quantity <= 20)");
    expect(m65).toContain("where quantity < 1 or quantity > 20");
    expect(m65).not.toContain("check (quantity >= 1 and quantity <= 50)");
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
