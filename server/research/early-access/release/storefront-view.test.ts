import { describe, expect, it } from "vitest";

import type { EarlyAccessCatalogProjection, EarlyAccessCatalogRow } from "../catalog/early-access-catalog";
import { earlyAccessReleaseVersion, validateEarlyAccessRelease, type EarlyAccessRelease } from "./founder-release";
import { buildEarlyAccessStorefront } from "./storefront-view";

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
  return { evaluatedAt: "2026-08-04T12:00:00.000Z", rows, productsWithoutVariants: [] } as unknown as EarlyAccessCatalogProjection;
}

function releaseFor(target: EarlyAccessCatalogRow, overrides: Record<string, unknown> = {}): EarlyAccessRelease {
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
    recordedAt: "2026-08-04T12:00:00.000Z",
    ...overrides,
  });
  if (!validated.ok) throw new Error(`fixture invalid: ${validated.code}`);
  return validated.release;
}

describe("the storefront the customer sees behind the gate", () => {
  it("a founder-released unit is purchasable at the release price", () => {
    const unit = row();
    const store = buildEarlyAccessStorefront({
      projection: projection([unit]),
      releases: [releaseFor(unit)],
    });
    expect(store.purchasableCount).toBe(1);
    const [only] = store.units;
    expect(only?.state).toBe("purchasable");
    expect(only?.priceCents).toBe(24_900);
    expect(only?.currency).toBe("USD");
    expect(only?.basis).toBe("founder_release");
    expect(only?.releaseId).toBe("rel-0001");
  });

  it("Product Control's verdict is still reported on a released unit", () => {
    // Requirement: the storefront keeps showing Product Control information.
    // An override that hides what it overrode would be the dangerous version.
    const unit = row();
    const store = buildEarlyAccessStorefront({ projection: projection([unit]), releases: [releaseFor(unit)] });
    expect(store.units[0]?.productControlBlockers).toEqual([...HELD]);
    expect(store.units[0]?.waivedBlockers).toEqual([...HELD]);
  });

  it("a unit Product Control cleared needs no release at all", () => {
    const clear = row({ purchasable: true, blockers: [], priceCents: 19_900, currency: "USD" });
    const store = buildEarlyAccessStorefront({ projection: projection([clear]), releases: [] });
    expect(store.units[0]?.state).toBe("purchasable");
    expect(store.units[0]?.basis).toBe("product_control");
    expect(store.units[0]?.priceCents).toBe(19_900);
    // Removing the bridge later must not disturb this row.
    expect(store.units[0]?.releaseId).toBeNull();
  });

  it("an unreleased unit is held and shows NO amount", () => {
    // An amount beside "request access" reads as a quotable price, and it would
    // be one nobody approved.
    const store = buildEarlyAccessStorefront({ projection: projection([row()]), releases: [] });
    expect(store.units[0]?.state).toBe("coming_soon");
    expect(store.units[0]?.priceCents).toBeNull();
    expect(store.units[0]?.currency).toBe("");
    expect(store.units[0]?.basis).toBeNull();
    expect(store.units[0]?.hold).toBe("NO_FOUNDER_RELEASE");
  });

  it("a regulatory hold is never described as coming soon", () => {
    const store = buildEarlyAccessStorefront({
      projection: projection([row({ offerState: "UNAVAILABLE" })]),
      releases: [],
    });
    expect(store.units[0]?.state).toBe("held");
  });

  it("a request-access unit says exactly that", () => {
    const store = buildEarlyAccessStorefront({
      projection: projection([row({ offerState: "REQUEST_ACCESS_ONLY" })]),
      releases: [],
    });
    expect(store.units[0]?.state).toBe("request_access");
  });

  it("a stale release does not sell the unit, and the price disappears", () => {
    const unit = row();
    const release = releaseFor(unit);
    const changed = row({ strength: "15 mg" });
    const store = buildEarlyAccessStorefront({ projection: projection([changed]), releases: [release] });
    expect(store.units[0]?.state).not.toBe("purchasable");
    expect(store.units[0]?.priceCents).toBeNull();
    expect(store.units[0]?.hold).toBe("RELEASE_STALE");
  });

  it("a release for one unit does not release its neighbours", () => {
    const first = row();
    const second = row({ variantId: "var-2", sku: "A-2" });
    const store = buildEarlyAccessStorefront({
      projection: projection([first, second]),
      releases: [releaseFor(first)],
    });
    expect(store.purchasableCount).toBe(1);
    expect(store.heldCount).toBe(1);
    expect(store.units[1]?.state).not.toBe("purchasable");
  });

  it("counts an empty catalog without inventing anything", () => {
    const store = buildEarlyAccessStorefront({ projection: projection([]), releases: [] });
    expect(store.purchasableCount).toBe(0);
    expect(store.heldCount).toBe(0);
    expect(store.units).toEqual([]);
  });
});
