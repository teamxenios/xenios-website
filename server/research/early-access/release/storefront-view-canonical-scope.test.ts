// The "canonical_eligible" scope: how the eight-step payment journey stops
// being bounded by the founder's released opening set.
//
// A separate file from storefront-view.test.ts on purpose — that suite pins the
// released-units behaviour, and the most important thing to prove here is that
// NOTHING about it changed. The new scope is additive; the default is untouched.

import { describe, expect, it, vi } from "vitest";

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
import type { CanonicalPaymentFacts } from "./canonical-payment-eligibility";

const HELD = ["PRICE_NOT_APPROVED", "DOCUMENTATION_NOT_SATISFIED"] as const;
const POLICY = { directPurchaseFamilies: ["research_peptides_materials"] };

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
    evaluatedAt: "2026-08-04T12:00:00.000Z",
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
    recordedAt: "2026-08-04T12:00:00.000Z",
  });
  if (!validated.ok) throw new Error(`fixture invalid: ${validated.code}`);
  return validated.release;
}

function facts(
  overrides: Partial<CanonicalPaymentFacts> = {},
): CanonicalPaymentFacts {
  return {
    family: "research_peptides_materials",
    researchUseOnlyConfirmed: true,
    hasApprovedRetailPrice: true,
    compositionResolved: true,
    commerceHold: false,
    availabilityUnderReview: false,
    ...overrides,
  };
}

const ids = (storefront: { units: readonly { variantId: string }[] }) =>
  storefront.units.map((unit) => unit.variantId).sort();

// ---------------------------------------------------------------------------

describe("the existing scopes are untouched", () => {
  const released = row({ variantId: "released" });
  const unreleased = row({ variantId: "unreleased" });
  const input = {
    projection: projection([released, unreleased]),
    releases: [releaseFor(released)],
  };

  it("released_units still shows only the released unit", () => {
    const storefront = buildEarlyAccessStorefront({
      ...input,
      scope: "released_units",
    });
    expect(ids(storefront)).toEqual(["released"]);
  });

  it("all still shows everything", () => {
    expect(ids(buildEarlyAccessStorefront({ ...input, scope: "all" }))).toEqual([
      "released",
      "unreleased",
    ]);
  });

  it("an absent scope still behaves as before", () => {
    expect(ids(buildEarlyAccessStorefront(input))).toEqual([
      "released",
      "unreleased",
    ]);
  });
});

describe("canonical_eligible admits a unit the release ledger never named", () => {
  const released = row({ variantId: "released" });
  const eligible = row({ variantId: "canonical" });

  it("shows both: the opening set becomes a subset, not the boundary", () => {
    const storefront = buildEarlyAccessStorefront({
      projection: projection([released, eligible]),
      releases: [releaseFor(released)],
      scope: "canonical_eligible",
      canonicalFacts: () => facts(),
      paymentPolicy: POLICY,
    });
    expect(ids(storefront)).toEqual(["canonical", "released"]);
  });

  it("keeps a released unit even when the canonical facts refuse it", () => {
    // The union rule. Losing a live product is worse than showing one extra,
    // so a released unit survives a canonical refusal.
    const storefront = buildEarlyAccessStorefront({
      projection: projection([released, eligible]),
      releases: [releaseFor(released)],
      scope: "canonical_eligible",
      canonicalFacts: (candidate) =>
        candidate.variantId === "released"
          ? facts({ commerceHold: true })
          : facts(),
      paymentPolicy: POLICY,
    });
    expect(ids(storefront)).toContain("released");
  });

  it("does not consult the gate for a released unit at all", () => {
    const resolver = vi.fn(() => facts());
    buildEarlyAccessStorefront({
      projection: projection([released]),
      releases: [releaseFor(released)],
      scope: "canonical_eligible",
      canonicalFacts: resolver,
      paymentPolicy: POLICY,
    });
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("canonical_eligible refuses what the gate refuses", () => {
  const candidate = row({ variantId: "candidate" });
  const only = (resolved: CanonicalPaymentFacts | null) =>
    ids(
      buildEarlyAccessStorefront({
        projection: projection([candidate]),
        releases: [],
        scope: "canonical_eligible",
        canonicalFacts: () => resolved,
        paymentPolicy: POLICY,
      }),
    );

  it("keeps a non-direct family out — capsules and 503A never appear", () => {
    expect(only(facts({ family: "research_capsules" }))).toEqual([]);
    expect(only(facts({ family: "clinical_503a" }))).toEqual([]);
  });

  it("keeps a classification-pending unit out", () => {
    expect(only(facts({ researchUseOnlyConfirmed: false }))).toEqual([]);
  });

  it("keeps an unresolved composition out — this is the GRP-0422 rule", () => {
    expect(only(facts({ compositionResolved: false }))).toEqual([]);
  });

  it("keeps an unpriced unit out rather than pricing it at zero", () => {
    expect(only(facts({ hasApprovedRetailPrice: false }))).toEqual([]);
  });

  it("keeps an explicitly held unit out", () => {
    expect(only(facts({ commerceHold: true }))).toEqual([]);
    expect(only(facts({ availabilityUnderReview: true }))).toEqual([]);
  });

  it("FAILS CLOSED when the catalog authority cannot state the facts", () => {
    // The pricing lane's lesson, applied to eligibility: an upstream blip must
    // not change what a customer can do. Null is not "probably fine".
    expect(only(null)).toEqual([]);
  });
});

describe("canonical_eligible refuses to run misconfigured", () => {
  const candidate = row({ variantId: "candidate" });

  it("throws rather than silently widening to every row", () => {
    // The dangerous failure would be falling back to "all", which would put
    // 503A clinical rows in front of a customer. Refuse to start instead.
    expect(() =>
      buildEarlyAccessStorefront({
        projection: projection([candidate]),
        releases: [],
        scope: "canonical_eligible",
        paymentPolicy: POLICY,
      }),
    ).toThrow(/requires both canonicalFacts and paymentPolicy/);

    expect(() =>
      buildEarlyAccessStorefront({
        projection: projection([candidate]),
        releases: [],
        scope: "canonical_eligible",
        canonicalFacts: () => facts(),
      }),
    ).toThrow(/requires both canonicalFacts and paymentPolicy/);
  });
});

describe("the counts are computed the same way in every scope", () => {
  it("reports identical totals for the same admitted rows", () => {
    const unit = row({ variantId: "unit-one" });
    const release = releaseFor(unit);
    const viaReleased = buildEarlyAccessStorefront({
      projection: projection([unit]),
      releases: [release],
      scope: "released_units",
    });
    const viaCanonical = buildEarlyAccessStorefront({
      projection: projection([unit]),
      releases: [release],
      scope: "canonical_eligible",
      canonicalFacts: () => facts(),
      paymentPolicy: POLICY,
    });
    // Same rows in, same summary out — the branch cannot drift into counting
    // differently from the one the opening-set acceptance test pins.
    expect(viaCanonical).toEqual(viaReleased);
  });
});
