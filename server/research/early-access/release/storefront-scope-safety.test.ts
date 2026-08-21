import { describe, expect, it } from "vitest";

import type {
  EarlyAccessCatalogProjection,
  EarlyAccessCatalogRow,
} from "../catalog/early-access-catalog";
import {
  earlyAccessReleaseVersion,
  validateEarlyAccessRelease,
  type EarlyAccessRelease,
} from "./founder-release";
import { buildEarlyAccessStorefront } from "./storefront-view";

/**
 * WHAT WIDENING THE EARLY ACCESS CATALOG SCOPE WOULD ACTUALLY DO.
 *
 * The customer catalog is built with `scope: "released_units"`, so it shows the
 * founder-released set. `scope: "all"` exists and is unused. Since the
 * storefront now serves Featured (this released set) alongside All products
 * (the canonical catalog, via the assisted-order bridge), somebody will
 * eventually ask whether the simpler move is to widen this scope instead.
 *
 * This answers that, so the answer is measured rather than assumed:
 *
 *   1. Widening adds VISIBILITY, not purchasability. A row that was not
 *      purchasable under `released_units` is not purchasable under `all`; it
 *      appears in its own truthful held state, with blockers, no price and no
 *      purchase basis.
 *
 *   2. But it is NOT purely cosmetic, and this is the part worth knowing:
 *      `toUnit` returns purchasable for any row Product Control has already
 *      cleared, release or no release. Such a row is purchasable under BOTH
 *      scopes, and is currently INVISIBLE under `released_units` despite being
 *      sellable. So widening the scope publishes every Product-Control-cleared
 *      row — a founder readiness decision, not a merchandising tweak.
 *
 * Nothing here changes behaviour. It pins the two facts a future change to
 * that one argument depends on.
 */

const HELD = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;

function row(overrides: Partial<EarlyAccessCatalogRow> = {}): EarlyAccessCatalogRow {
  return {
    productId: "prod-a",
    slug: "product-a",
    displayName: "Product A",
    canonicalName: "product-a",
    variantId: "var-1",
    sku: "A-1",
    strength: "10 mg",
    presentation: "vial",
    priceCents: null,
    currency: "",
    audience: "member",
    availability: "available",
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    description: "",
    imageState: "none",
    quantityLimit: 3,
    supplierReady: false,
    disputeStatus: { identity: "none", strength: "none" },
    purchasable: false,
    blockers: [...HELD],
    ...overrides,
  } as unknown as EarlyAccessCatalogRow;
}

function projection(rows: EarlyAccessCatalogRow[]): EarlyAccessCatalogProjection {
  return {
    evaluatedAt: "2026-08-21T12:00:00.000Z",
    rows,
    productsWithoutVariants: [],
  } as unknown as EarlyAccessCatalogProjection;
}

function releaseFor(target: EarlyAccessCatalogRow): EarlyAccessRelease {
  const validated = validateEarlyAccessRelease({
    releaseId: "rel-0001",
    productId: target.productId,
    variantId: target.variantId,
    productVersion: earlyAccessReleaseVersion(target),
    status: "approved",
    approvedPriceCents: 24_900,
    currency: "USD",
    waivedBlockers: [...target.blockers],
    approvedQuantityLimit: 3,
    expiresAt: null,
    actor: "Samuel Boadu",
    reason: "Founder release for the private early access pilot.",
    recordedAt: "2026-08-21T12:00:00.000Z",
  });
  if (!validated.ok) throw new Error(`fixture invalid: ${validated.code}`);
  return validated.release;
}

const released = row({ productId: "prod-released", variantId: "var-released" });
const unreleased = row({ productId: "prod-unreleased", variantId: "var-unreleased" });
const controlClear = row({
  productId: "prod-clear",
  variantId: "var-clear",
  purchasable: true,
  blockers: [],
  priceCents: 9_900,
  currency: "USD",
  offerState: "DIRECT_PURCHASE",
});

describe("Early Access storefront scope", () => {
  const releases = [releaseFor(released)];

  it("released_units hides every row the founder has not released", () => {
    const scoped = buildEarlyAccessStorefront({
      projection: projection([released, unreleased]),
      releases,
      scope: "released_units",
    });
    expect(scoped.units.map((u) => u.productId)).toEqual(["prod-released"]);
  });

  it("`all` reveals held rows and adds NOT ONE purchasable unit", () => {
    const both = { projection: projection([released, unreleased]), releases };
    const scoped = buildEarlyAccessStorefront({ ...both, scope: "released_units" });
    const full = buildEarlyAccessStorefront({ ...both, scope: "all" });

    expect(full.units).toHaveLength(2);
    expect(full.purchasableCount).toBe(scoped.purchasableCount);

    const revealed = full.units.find((u) => u.productId === "prod-unreleased");
    expect(revealed).toBeDefined();
    expect(revealed!.state).not.toBe("purchasable");
    expect(revealed!.purchasable).toBe(false);
    expect(revealed!.priceCents).toBeNull();
    expect(revealed!.basis).toBeNull();
    expect(revealed!.releaseId).toBeNull();
    // Visible AND truthful: it says why, rather than going quiet.
    expect(revealed!.productControlBlockers.length).toBeGreaterThan(0);
  });

  it("SEAM: a Product-Control-cleared row is purchasable under BOTH scopes, and hidden by one", () => {
    // The reason widening this argument is a founder decision rather than a
    // merchandising one. Not a defect: the intended long-term path.
    const both = { projection: projection([released, controlClear]), releases };
    const scoped = buildEarlyAccessStorefront({ ...both, scope: "released_units" });
    expect(scoped.units.map((u) => u.productId)).toEqual(["prod-released"]);

    const full = buildEarlyAccessStorefront({ ...both, scope: "all" });
    const clear = full.units.find((u) => u.productId === "prod-clear");
    expect(clear!.state).toBe("purchasable");
    expect(clear!.basis).toBe("product_control");
    expect(full.purchasableCount).toBe(scoped.purchasableCount + 1);
  });
});
