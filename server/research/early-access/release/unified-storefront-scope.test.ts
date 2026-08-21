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
 * THE SAFETY PROOF FOR ONE UNIFIED EARLY ACCESS STOREFRONT.
 *
 * The customer catalog is scoped to `released_units` today, which is why it
 * shows the founder-released set and nothing else. The launch directive is to
 * serve the FULL canonical catalog from that one surface, with the released
 * set surfaced as "Featured" rather than used as a filter.
 *
 * Widening a customer-facing catalog is a money-safety change, so the property
 * that makes it safe is asserted here rather than assumed: **scope decides
 * VISIBILITY, and nothing else.** A row that was not purchasable under
 * `released_units` is not purchasable under `all`; it simply becomes visible
 * in its own truthful held state. If that ever stops being true, widening the
 * scope silently puts unsellable inventory on sale, and this file fails first.
 *
 * The one thing scope CANNOT fix is deliberately proven too: a row Product
 * Control has already cleared (`purchasable: true`) is purchasable under BOTH
 * scopes. That is the seam the launch actually turns on, and naming it here
 * means nobody discovers it by shipping it.
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

/** One released unit, one unreleased-and-unready, one Product Control clear. */
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

describe("widening the Early Access storefront scope", () => {
  const releases = [releaseFor(released)];

  it("released_units hides the rest of the catalog, which is why one storefront needs `all`", () => {
    const scoped = buildEarlyAccessStorefront({
      projection: projection([released, unreleased]),
      releases,
      scope: "released_units",
    });
    expect(scoped.units.map((u) => u.productId)).toEqual(["prod-released"]);
  });

  it("`all` shows every row, and adds NOT ONE purchasable unit", () => {
    const both = { projection: projection([released, unreleased]), releases };
    const scoped = buildEarlyAccessStorefront({ ...both, scope: "released_units" });
    const full = buildEarlyAccessStorefront({ ...both, scope: "all" });

    expect(full.units).toHaveLength(2);
    // The whole safety property, in one line.
    expect(full.purchasableCount).toBe(scoped.purchasableCount);

    const widened = full.units.find((u) => u.productId === "prod-unreleased");
    expect(widened).toBeDefined();
    expect(widened!.state).not.toBe("purchasable");
    expect(widened!.purchasable).toBe(false);
    // Visible and truthful: it carries no price and no purchase basis.
    expect(widened!.priceCents).toBeNull();
    expect(widened!.basis).toBeNull();
    expect(widened!.releaseId).toBeNull();
  });

  it("every newly visible unit states a held reason rather than going quiet", () => {
    const full = buildEarlyAccessStorefront({
      projection: projection([released, unreleased]),
      releases,
      scope: "all",
    });
    for (const unit of full.units.filter((u) => !u.purchasable)) {
      expect(unit.state).not.toBe("purchasable");
      expect(unit.productControlBlockers.length).toBeGreaterThan(0);
    }
  });

  it("Featured marks the released set without filtering anything out", () => {
    const full = buildEarlyAccessStorefront({
      projection: projection([released, unreleased]),
      releases,
      scope: "all",
    });
    expect(full.featuredCount).toBe(1);
    expect(full.units.find((u) => u.productId === "prod-released")!.featured).toBe(true);
    expect(full.units.find((u) => u.productId === "prod-unreleased")!.featured).toBe(false);
    // Merchandising carries no authority: the unfeatured row's buyability is
    // decided by its own facts, not by whether it is featured.
    const scoped = buildEarlyAccessStorefront({
      projection: projection([released, unreleased]),
      releases,
      scope: "released_units",
    });
    expect(scoped.units.every((u) => u.featured)).toBe(true);
    expect(scoped.featuredCount).toBe(scoped.units.length);
  });

  it("SEAM: a Product-Control-cleared row is purchasable under BOTH scopes", () => {
    // Not a defect — the intended long-term path, and the exact seam the
    // launch flips. It is asserted so that widening the scope is understood as
    // "this catalog now shows every row Product Control has cleared", which is
    // a founder decision about readiness, not an accident of merchandising.
    //
    // Under `released_units` this row is INVISIBLE despite being purchasable,
    // because no founder release names it. That asymmetry is the reason the
    // unified storefront cannot simply keep the old scope.
    const both = {
      projection: projection([released, controlClear]),
      releases,
    };
    const scoped = buildEarlyAccessStorefront({ ...both, scope: "released_units" });
    expect(scoped.units.map((u) => u.productId)).toEqual(["prod-released"]);

    const full = buildEarlyAccessStorefront({ ...both, scope: "all" });
    const clear = full.units.find((u) => u.productId === "prod-clear");
    expect(clear!.state).toBe("purchasable");
    expect(clear!.basis).toBe("product_control");
    expect(clear!.featured).toBe(false);
    expect(full.purchasableCount).toBe(scoped.purchasableCount + 1);
  });
});
