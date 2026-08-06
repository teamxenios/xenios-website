import { describe, expect, it } from "vitest";

import { ProductControlDeclaredFactsReader } from "../catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../catalog/product-control-source";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "./first-release-canonical-source";
import { seedFounderFirstRelease } from "./founder-first-release-seed";
import { seedRawPeptidesConfirmations } from "./founder-supply-seed";
import { InMemoryEarlyAccessReleaseLedger } from "./founder-release";
import { buildEarlyAccessStorefront } from "./storefront-view";

/**
 * THE OPENING SET, as the founder accepted it on 2026-08-05.
 *
 * Early Access opens with 18 purchasable units out of 22 visible. Four units are
 * visible and held, each for a reason someone decided on purpose. This file
 * exists so that set is ENFORCED rather than incidental: a later change that
 * quietly opens a held unit, or quietly hides one, fails here.
 *
 * It asserts on the same projection the mounted catalog route serves, built from
 * the same canonical source and the same two seeds, so it is the opening set a
 * customer would actually meet rather than a restatement of the seed data.
 */

/** Held on a disputed strength. Migration 47's write gate is what holds these. */
const STRENGTH_DISPUTE_HELD = [
  { productId: "PEP-007", strength: "10 mg", name: "Tesamorelin" },
  { productId: "PEP-009", strength: "500 mg", name: "NAD+" },
  { productId: "PEP-010", strength: "10 mg", name: "MOTS-C" },
] as const;

/** Held because the founder has not commercially released it. */
const FOUNDER_HELD = { productId: "PEX-028", strength: "10 mg", name: "Cagrilintide" } as const;

const EXPECTED_PURCHASABLE = 18;
const EXPECTED_VISIBLE = 22;

async function openingSet() {
  const confirmations = new InMemorySupplierConfirmationStore();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);

  const at = new Date("2026-08-05T00:00:00.000Z");
  // A VERIFIED customer. The opening set is what an identified customer sees,
  // and since the verified-link gate only "verified_link" is identified.
  const context = {
    earlyAccessCustomer: { customerRef: "cus_opening_set", boundBy: "verified_link" as const },
  };

  // The production preparation order: confirm supply, re-project against the
  // confirmed world, then release.
  const before = await source.load(at, context);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const confirmed = await source.load(at, context);
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const seeded = await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

  return buildEarlyAccessStorefront({
    projection: confirmed,
    releases: await ledger.all(),
    scope: "released_units",
    founderHeldUnits: seeded.founderHeldUnits,
  } as never);
}

describe("the accepted Early Access opening set", () => {
  it("opens with 18 purchasable units out of 22 visible", async () => {
    const storefront = await openingSet();

    expect(storefront.units).toHaveLength(EXPECTED_VISIBLE);
    expect(storefront.units.filter((unit) => unit.purchasable)).toHaveLength(EXPECTED_PURCHASABLE);
    expect(
      storefront.units.filter((unit) => unit.availability === "AVAILABLE"),
    ).toHaveLength(EXPECTED_PURCHASABLE);
  });

  it("holds exactly the four accepted units and no others", async () => {
    const storefront = await openingSet();
    const held = storefront.units
      .filter((unit) => unit.availability !== "AVAILABLE")
      .map((unit) => `${unit.productId} ${unit.strength}`)
      .sort();

    expect(held).toEqual(
      [
        ...STRENGTH_DISPUTE_HELD.map((u) => `${u.productId} ${u.strength}`),
        `${FOUNDER_HELD.productId} ${FOUNDER_HELD.strength}`,
      ].sort(),
    );
  });

  it.each(STRENGTH_DISPUTE_HELD)(
    "holds $name $strength on the unresolved strength dispute",
    async ({ productId, strength }) => {
      const storefront = await openingSet();
      const unit = storefront.units.find(
        (candidate) => candidate.productId === productId && candidate.strength === strength,
      );

      expect(unit, `${productId} ${strength} is not in the catalogue`).toBeDefined();
      expect(unit?.availability).toBe("TEMPORARILY_HELD");
      expect(unit?.purchasable).toBe(false);
      expect(unit?.productControlBlockers).toContain("STRENGTH_DISPUTE_UNRESOLVED");
      // Held units carry no price, so no amount sits beside something nobody
      // may buy.
      expect(unit?.priceCents).toBeNull();
      expect(unit?.basis).toBeNull();
    },
  );

  it("holds Cagrilintide on the founder's commercial decision, not a dispute", async () => {
    const storefront = await openingSet();
    const unit = storefront.units.find((u) => u.productId === FOUNDER_HELD.productId);

    expect(unit?.availability).toBe("TEMPORARILY_HELD");
    expect(unit?.purchasable).toBe(false);
    expect(unit?.hold).toBe("NO_FOUNDER_RELEASE");
    expect(unit?.priceCents).toBeNull();
    expect(unit?.basis).toBeNull();
    // The distinction matters: a strength dispute is a determination about the
    // product, and this is not one. Nothing here asserts a quality finding.
    expect(unit?.productControlBlockers).not.toContain("STRENGTH_DISPUTE_UNRESOLVED");
  });

  it("keeps NAD+ 1000 mg purchasable, because only the 500 mg strength is disputed", async () => {
    // The hold is per UNIT, not per product. Holding the whole product would
    // withdraw a strength the founder approved and priced, on the strength of a
    // dispute that is not about it.
    const storefront = await openingSet();
    const thousand = storefront.units.find(
      (unit) => unit.productId === "PEP-009" && unit.strength === "1000 mg",
    );

    expect(thousand?.availability).toBe("AVAILABLE");
    expect(thousand?.purchasable).toBe(true);
    expect(thousand?.priceCents).toBeGreaterThan(0);
  });

  it("shows every held unit rather than hiding it", async () => {
    // A customer cannot tell a hidden product from one that does not exist, so
    // held units stay visible and say why.
    const storefront = await openingSet();

    for (const { productId } of [...STRENGTH_DISPUTE_HELD, FOUNDER_HELD]) {
      expect(
        storefront.units.some((unit) => unit.productId === productId),
        `${productId} vanished from the catalogue instead of rendering held`,
      ).toBe(true);
    }
  });

  it("gives every purchasable unit an exact price and a release to sell under", async () => {
    const storefront = await openingSet();

    for (const unit of storefront.units.filter((candidate) => candidate.purchasable)) {
      expect(Number.isSafeInteger(unit.priceCents), `${unit.productId} price is not exact`).toBe(
        true,
      );
      expect(unit.priceCents as number).toBeGreaterThan(0);
      expect(unit.basis, `${unit.productId} has no purchase basis`).not.toBeNull();
      expect(unit.releaseId, `${unit.productId} is not pinned to a release`).not.toBeNull();
    }
  });
});
