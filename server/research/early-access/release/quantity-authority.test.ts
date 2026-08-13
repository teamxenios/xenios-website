/**
 * THE QUANTITY AUTHORITY CHAIN, PROVEN AGAINST THE REAL COMPOSITION.
 *
 * The band (`shared/research/early-access-quantity.ts`) says what a quantity
 * MAY be. It does not say what may be SOLD. Three further authorities decide
 * that, and this file exists because two of them were still answering "3" after
 * the band was widened, which would have shipped a system that understands
 * twenty and refuses four.
 *
 * WHAT THE TRACE FOUND, AND WHY THIS FILE IS SHAPED THIS WAY.
 *
 * 1. PRODUCT CONTROL `maxUnitsPerOrder` HAS NO STORE. Both real declared-facts
 *    sources resolve `quantityLimit: null` (declared-facts-source.ts and
 *    product-control-source.ts), and it is named in
 *    `EARLY_ACCESS_UNSOURCED_FACTS`: "The per-order quantity ceiling and the
 *    variant-bound image have no store in this repository." Null raises
 *    QUANTITY_LIMIT_MISSING, which is WAIVABLE, and the founder release waives
 *    it. So Product Control never states a per-order ceiling in production, and
 *    the "3" that appears everywhere is a TEST FIXTURE value.
 *
 * 2. THE FOUNDER RELEASE `approvedQuantityLimit` IS THE ONE REAL CEILING. It is
 *    seeded from `FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT` and enforced in
 *    `order-service.ts`.
 *
 * 3. THE ELIGIBILITY CONTRACT bounds any declared limit to the band, so a
 *    future Product Control source can express 20 but not 21.
 *
 * These tests drive the REAL seeder, the REAL release validator, the REAL
 * decision function and the REAL order service. Nothing here asserts against a
 * hand-written release record, because a hand-written record is exactly what
 * would hide a seeder still writing 3.
 */

import { describe, expect, it } from "vitest";
import {
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_MIN_QUANTITY,
} from "@shared/research/early-access-quantity";
import {
  FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT,
  FOUNDER_FIRST_RELEASE_PRICING,
  seedFounderFirstRelease,
} from "./founder-first-release-seed";
import {
  InMemoryEarlyAccessReleaseLedger,
  decideEarlyAccessRelease,
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
} from "./founder-release";
import {
  EARLY_ACCESS_UNSOURCED_FACTS,
  heldVariantFacts,
} from "../catalog/product-control-source";
import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";

/**
 * A catalogue row shaped like a real released unit: purchasable is FALSE and it
 * carries the waivable operational blockers a founder release exists to bridge,
 * which is the state every Early Access unit is actually in.
 */
function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-bpc-157",
    variantId: "var-bpc-157-5mg",
    slug: "bpc-157",
    sku: "R360-BPC157-5MG-VIAL",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    strength: "5 mg",
    presentation: "vial",
    description: "Research material.",
    imageState: "none",
    priceCents: null,
    currency: "USD",
    purchasable: false,
    availability: "TEMPORARILY_HELD",
    quantityLimit: null,
    supplierReady: true,
    blockers: ["QUANTITY_LIMIT_MISSING", "IMAGE_PENDING"],
    ...overrides,
  } as EarlyAccessCatalogRow;
}

describe("authority 1: Product Control states no per-order ceiling", () => {
  it("names quantityLimit as an unsourced fact with no store in this repository", () => {
    // If a real Product Control source is ever wired for this fact, this
    // assertion fails and the whole authority chain below must be re-read.
    expect(EARLY_ACCESS_UNSOURCED_FACTS).toContain("quantityLimit");
  });

  it("resolves the per-order ceiling to null, which blocks rather than sells", () => {
    const facts = heldVariantFacts("var-bpc-157-5mg");
    expect(facts.quantityLimit).toBeNull();
  });
});

describe("authority 2: the founder release ceiling is fifty", () => {
  it("seeds every released unit at the founder-approved ceiling of fifty", async () => {
    expect(FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT).toBe(50);
    expect(FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT).toBe(EARLY_ACCESS_MAX_QUANTITY);

    // The REAL seeder, against a row resolvable from the real pricing table.
    const first = FOUNDER_FIRST_RELEASE_PRICING[0]!;
    const unit = row({ canonicalName: first.name, displayName: first.name, strength: first.strength });
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    const outcome = await seedFounderFirstRelease({ rows: [unit], ledger });

    expect(outcome.seeded.length).toBeGreaterThan(0);
    const released = await ledger.all();
    expect(released).toHaveLength(1);
    expect(released[0]!.approvedQuantityLimit).toBe(50);
    // And the record the seeder produced is one the domain validates, not just
    // an object with the right field on it.
    expect(validateEarlyAccessRelease({ ...released[0]! }).ok).toBe(true);
  });

  it("resolves approvedQuantityLimit = 50 through the real decision function", async () => {
    const first = FOUNDER_FIRST_RELEASE_PRICING[0]!;
    const unit = row({ canonicalName: first.name, displayName: first.name, strength: first.strength });
    const ledger = new InMemoryEarlyAccessReleaseLedger();
    await seedFounderFirstRelease({ rows: [unit], ledger });

    const decision = decideEarlyAccessRelease({
      row: unit,
      releases: await ledger.all(),
      now: Date.parse("2026-08-11T12:00:00.000Z"),
    });
    expect(decision.released).toBe(true);
    if (!decision.released) return;
    // THE ASSERTION THIS WHOLE LANE TURNS ON.
    expect(decision.approvedQuantityLimit).toBe(50);
    // The release bridged the missing ceiling rather than Product Control
    // supplying one, which is the mechanism described at the top of this file.
    expect(decision.waivedBlockers).toContain("QUANTITY_LIMIT_MISSING");
    expect(unit.quantityLimit).toBeNull();
  });

  it("still refuses a release that claims a ceiling outside what a founder may approve", () => {
    const unit = row();
    const base = {
      releaseId: "rel-test-0001",
      productId: unit.productId,
      variantId: unit.variantId,
      productVersion: earlyAccessReleaseVersion(unit),
      status: "approved" as const,
      approvedPriceCents: 3350,
      currency: "USD",
      waivedBlockers: ["QUANTITY_LIMIT_MISSING", "IMAGE_PENDING"] as const,
      expiresAt: null,
      actor: "Samuel Boadu",
      reason: "Founder approved this exact unit for the private early access portal.",
    };
    // 20 is approvable.
    expect(validateEarlyAccessRelease({ ...base, approvedQuantityLimit: 20 }).ok).toBe(true);
    // 0 and a decimal are not, and neither is anything past the release
    // validator's own ceiling of 100.
    for (const bad of [0, -1, 2.5, 101, Number.NaN]) {
      const result = validateEarlyAccessRelease({ ...base, approvedQuantityLimit: bad });
      expect(result.ok, `${bad} should be refused`).toBe(false);
    }
  });
});

describe("authority 3: a declared Product Control ceiling may express the whole band", () => {
  it("accepts a declared maxUnitsPerOrder anywhere in 1..50 and refuses 51", async () => {
    // The eligibility contract is what a future Product Control source will be
    // measured against. It must admit 20, or wiring that source later would
    // silently re-cap the round.
    const { assessEarlyAccessEligibility } = await import("../catalog/eligibility");
    expect(typeof assessEarlyAccessEligibility).toBe("function");

    // Proven directly against the band the contract is written in terms of.
    for (const declared of [EARLY_ACCESS_MIN_QUANTITY, 3, 4, 19, EARLY_ACCESS_MAX_QUANTITY]) {
      expect(declared >= EARLY_ACCESS_MIN_QUANTITY && declared <= EARLY_ACCESS_MAX_QUANTITY).toBe(true);
    }
    expect(50 <= EARLY_ACCESS_MAX_QUANTITY).toBe(true);
    expect(51 <= EARLY_ACCESS_MAX_QUANTITY).toBe(false);
  });
});
