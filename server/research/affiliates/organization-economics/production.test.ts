import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ATTRIBUTION_LOCK_MONTHS,
  ATTRIBUTION_CLICK_WINDOW_DAYS,
  COMMISSION_HOLD_DAYS,
  INDIVIDUAL_COMMISSION_BASIS_POINTS,
  MEMBERSHIP_FIRST_YEAR_BASIS_POINTS,
  MEMBERSHIP_RENEWAL_BASIS_POINTS,
  ORGANIZATION_COMMISSION_BASIS_POINTS,
  ORGANIZATION_PARENT_BASIS_POINTS,
  ORGANIZATION_SELLER_BASIS_POINTS,
  PAYOUT_MINIMUM_CENTS,
  type CanonicalAffiliatePayabilityProjection,
  type CanonicalAffiliateRevenueProjection,
} from "@shared/research/affiliates/organization-economics";
import { createAffiliateOrganizationEconomicsKernel } from "./production";

const kernel = createAffiliateOrganizationEconomicsKernel();
const CLICKED = "2026-01-01T00:00:00.000Z";
const CONVERTED = "2026-01-15T00:00:00.000Z";
const PAID = "2026-01-16T00:00:00.000Z";

function revenue(
  overrides: Partial<CanonicalAffiliateRevenueProjection> = {},
): CanonicalAffiliateRevenueProjection {
  return {
    projectionVersion: 1,
    revenueEventId: "revenue:1",
    orderId: "order:1",
    classification: "research_goods",
    currency: "USD",
    eligiblePaidRevenueCents: 10_000,
    convertedAt: CONVERTED,
    paidAt: PAID,
    membershipPaidMonth: null,
    attribution: {
      attributionId: "attribution:1",
      kind: "individual",
      sellerPartnerId: "partner:seller",
      organizationPartnerId: null,
      clickedAt: CLICKED,
      accountLock: null,
    },
    ...overrides,
  };
}

function payability(
  overrides: Partial<CanonicalAffiliatePayabilityProjection> = {},
): CanonicalAffiliatePayabilityProjection {
  return {
    projectionVersion: 1,
    partnerId: "partner:seller",
    currency: "USD",
    evaluatedAt: "2026-03-01T00:00:00.000Z",
    partnerState: "active",
    termsVerified: true,
    payoutConfigurationVerified: true,
    clinicalOrUnknownRevenueIncluded: false,
    grossCommissionCents: 8_000,
    reversalCents: 1_000,
    latestHoldUntil: "2026-02-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("affiliate organization economics policy", () => {
  it("pins the founder-authorized terms without enabling a payout action", () => {
    expect({
      individual: INDIVIDUAL_COMMISSION_BASIS_POINTS,
      organization: ORGANIZATION_COMMISSION_BASIS_POINTS,
      seller: ORGANIZATION_SELLER_BASIS_POINTS,
      parent: ORGANIZATION_PARENT_BASIS_POINTS,
      firstYearMembership: MEMBERSHIP_FIRST_YEAR_BASIS_POINTS,
      renewalMembership: MEMBERSHIP_RENEWAL_BASIS_POINTS,
      clickDays: ATTRIBUTION_CLICK_WINDOW_DAYS,
      lockMonths: ACCOUNT_ATTRIBUTION_LOCK_MONTHS,
      holdDays: COMMISSION_HOLD_DAYS,
      minimumCents: PAYOUT_MINIMUM_CENTS,
    }).toEqual({
      individual: 1_500,
      organization: 2_000,
      seller: 1_500,
      parent: 500,
      firstYearMembership: 2_000,
      renewalMembership: 1_000,
      clickDays: 60,
      lockMonths: 12,
      holdDays: 30,
      minimumCents: 5_000,
    });

    const source = readFileSync(resolve(__dirname, "production.ts"), "utf8");
    expect(source).not.toContain(".from(");
    expect(source).not.toContain(".rpc(");
    expect(source).not.toMatch(/\.(insert|upsert|delete)\s*\(/);
    expect(source).not.toContain("createClient");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("markPaid");
    expect(source).not.toContain("sendPayout");
  });

  it("computes 15% for an individual and keeps the result held", async () => {
    const result = await kernel.evaluateRevenue(revenue());
    expect(result).toMatchObject({
      status: "eligible",
      totalCommissionCents: 1_500,
      holdUntil: "2026-02-15T00:00:00.000Z",
      payable: false,
      allocations: [{
        beneficiaryPartnerId: "partner:seller",
        role: "individual",
        basisPoints: 1_500,
        amountCents: 1_500,
      }],
    });
  });

  it("computes 20% for a direct organization", async () => {
    const result = await kernel.evaluateRevenue(revenue({
      attribution: {
        attributionId: "attribution:organization",
        kind: "organization_direct",
        sellerPartnerId: "partner:organization",
        organizationPartnerId: "partner:organization",
        clickedAt: CLICKED,
        accountLock: null,
      },
    }));
    expect(result).toMatchObject({
      status: "eligible",
      totalCommissionCents: 2_000,
      allocations: [{
        beneficiaryPartnerId: "partner:organization",
        role: "organization",
        basisPoints: 2_000,
        amountCents: 2_000,
      }],
    });
  });

  it("splits organization-member economics 15% to seller and 5% to one parent", async () => {
    const result = await kernel.evaluateRevenue(revenue({
      attribution: {
        attributionId: "attribution:member",
        kind: "organization_member",
        sellerPartnerId: "partner:seller",
        organizationPartnerId: "partner:parent",
        clickedAt: CLICKED,
        accountLock: null,
      },
    }));
    expect(result).toMatchObject({
      status: "eligible",
      totalCommissionCents: 2_000,
      allocations: [
        { role: "organization_seller", basisPoints: 1_500, amountCents: 1_500 },
        { role: "organization_parent", basisPoints: 500, amountCents: 500 },
      ],
    });
    if (result.status === "eligible") expect(result.allocations).toHaveLength(2);
  });

  it("uses 20% for the first 12 paid membership months and 10% thereafter", async () => {
    const firstYear = await kernel.evaluateRevenue(revenue({
      classification: "membership",
      membershipPaidMonth: 12,
    }));
    const renewal = await kernel.evaluateRevenue(revenue({
      revenueEventId: "revenue:renewal",
      classification: "membership",
      membershipPaidMonth: 13,
    }));
    expect(firstYear).toMatchObject({ status: "eligible", totalCommissionCents: 2_000 });
    expect(renewal).toMatchObject({ status: "eligible", totalCommissionCents: 1_000 });
  });

  it("preserves the seller/parent split ratio for membership renewals", async () => {
    const result = await kernel.evaluateRevenue(revenue({
      classification: "membership",
      membershipPaidMonth: 13,
      attribution: {
        attributionId: "attribution:member-renewal",
        kind: "organization_member",
        sellerPartnerId: "partner:seller",
        organizationPartnerId: "partner:parent",
        clickedAt: CLICKED,
        accountLock: null,
      },
    }));
    expect(result).toMatchObject({
      status: "eligible",
      totalCommissionCents: 1_000,
      allocations: [
        { role: "organization_seller", basisPoints: 750, amountCents: 750 },
        { role: "organization_parent", basisPoints: 250, amountCents: 250 },
      ],
    });
  });

  it("accepts the inclusive 60-day click boundary and rejects the next millisecond", async () => {
    const boundary = await kernel.evaluateRevenue(revenue({
      convertedAt: "2026-03-02T00:00:00.000Z",
      paidAt: "2026-03-02T00:00:00.000Z",
    }));
    const outside = await kernel.evaluateRevenue(revenue({
      revenueEventId: "revenue:outside",
      convertedAt: "2026-03-02T00:00:00.001Z",
      paidAt: "2026-03-02T00:00:00.001Z",
    }));
    expect(boundary.status).toBe("eligible");
    expect(outside).toMatchObject({
      status: "denied",
      reason: "attribution_expired",
      totalCommissionCents: 0,
      payable: false,
    });
  });

  it("honors only an exact 12-calendar-month account lock", async () => {
    const locked = revenue({
      convertedAt: "2026-12-15T00:00:00.000Z",
      paidAt: "2026-12-16T00:00:00.000Z",
      attribution: {
        attributionId: "attribution:locked",
        kind: "individual",
        sellerPartnerId: "partner:seller",
        organizationPartnerId: null,
        clickedAt: CLICKED,
        accountLock: {
          lockedAt: "2026-01-15T00:00:00.000Z",
          expiresAt: "2027-01-15T00:00:00.000Z",
        },
      },
    });
    expect((await kernel.evaluateRevenue(locked)).status).toBe("eligible");
    expect(await kernel.evaluateRevenue({
      ...locked,
      revenueEventId: "revenue:bad-lock",
      attribution: {
        ...locked.attribution,
        accountLock: {
          lockedAt: "2026-01-15T00:00:00.000Z",
          expiresAt: "2027-01-14T00:00:00.000Z",
        },
      },
    })).toMatchObject({ status: "denied", reason: "invalid_account_lock" });
  });

  it("fails closed for clinical, unknown, missing, ambiguous, and unsafe revenue", async () => {
    for (const input of [
      revenue({ classification: "clinical" }),
      revenue({ classification: "unknown" }),
      { ...revenue(), currency: "usd" },
      { ...revenue(), eligiblePaidRevenueCents: -1 },
      { ...revenue(), eligiblePaidRevenueCents: Number.MAX_SAFE_INTEGER },
      { ...revenue(), unexpected: true },
      { ...revenue(), membershipPaidMonth: 1 },
      {
        ...revenue(),
        attribution: {
          ...revenue().attribution,
          organizationPartnerId: "partner:unexpected",
        },
      },
    ]) {
      const result = await kernel.evaluateRevenue(input);
      expect(result.status).toBe("denied");
      expect(result.totalCommissionCents).toBe(0);
      expect(result.allocations).toEqual([]);
      expect(result.payable).toBe(false);
    }
  });

  it("returns a zero decision instead of throwing for unserializable unsafe input", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const input of [1n, circular]) {
      await expect(kernel.evaluateRevenue(input)).resolves.toMatchObject({
        status: "denied",
        reason: "invalid_projection",
        totalCommissionCents: 0,
        payable: false,
      });
    }
  });

  it("rejects ambiguous or recursive organization relationships", async () => {
    const same = await kernel.evaluateRevenue(revenue({
      attribution: {
        attributionId: "attribution:recursive",
        kind: "organization_member",
        sellerPartnerId: "partner:same",
        organizationPartnerId: "partner:same",
        clickedAt: CLICKED,
        accountLock: null,
      },
    }));
    expect(same).toMatchObject({
      status: "denied",
      reason: "invalid_organization_relationship",
    });
  });

  it("computes bounded full and partial reversals without creating a payable result", async () => {
    const original = revenue();
    const partial = await kernel.evaluateReversal({
      projectionVersion: 1,
      reversalEventId: "reversal:partial",
      reversedAt: "2026-02-01T00:00:00.000Z",
      reversedEligibleRevenueCents: 4_000,
      originalRevenue: original,
    });
    const full = await kernel.evaluateReversal({
      projectionVersion: 1,
      reversalEventId: "reversal:full",
      reversedAt: "2026-02-01T00:00:00.000Z",
      reversedEligibleRevenueCents: 10_000,
      originalRevenue: original,
    });
    expect(partial).toMatchObject({
      status: "eligible",
      totalReversalCents: 600,
      payable: false,
    });
    expect(full).toMatchObject({
      status: "eligible",
      totalReversalCents: 1_500,
      payable: false,
    });
    expect(await kernel.evaluateReversal({
      projectionVersion: 1,
      reversalEventId: "reversal:excess",
      reversedAt: "2026-02-01T00:00:00.000Z",
      reversedEligibleRevenueCents: 10_001,
      originalRevenue: original,
    })).toMatchObject({ status: "denied", reason: "invalid_projection" });
  });

  it("enforces the 30-day hold and $50 net minimum without paying anything", async () => {
    expect(await kernel.assessPayability(payability())).toMatchObject({
      payable: true,
      amountCents: 7_000,
      currency: "USD",
    });
    expect(await kernel.assessPayability(payability({
      evaluatedAt: "2026-02-14T23:59:59.999Z",
    }))).toMatchObject({ payable: false, reason: "hold_not_elapsed", amountCents: 0 });
    expect(await kernel.assessPayability(payability({
      grossCommissionCents: 5_999,
      reversalCents: 1_000,
    }))).toMatchObject({ payable: false, reason: "below_payout_minimum", amountCents: 0 });
    expect(await kernel.assessPayability(payability({
      grossCommissionCents: 6_000,
      reversalCents: 1_000,
    }))).toMatchObject({ payable: true, amountCents: 5_000 });
  });

  it("fails closed when partner, terms, payout setup, or revenue-class evidence is unsafe", async () => {
    const cases: Array<[Partial<CanonicalAffiliatePayabilityProjection>, string]> = [
      [{ partnerState: "paused" }, "partner_not_active"],
      [{ termsVerified: false }, "terms_not_verified"],
      [{ payoutConfigurationVerified: false }, "payout_configuration_not_verified"],
      [{ clinicalOrUnknownRevenueIncluded: true }, "clinical_or_unknown_revenue_included"],
      [{ reversalCents: 8_001 }, "invalid_projection"],
    ];
    for (const [overrides, reason] of cases) {
      expect(await kernel.assessPayability(payability(overrides))).toMatchObject({
        payable: false,
        reason,
        amountCents: 0,
      });
    }
  });

  it("is deterministic and rounds down across a wide property range", async () => {
    for (let cents = 1; cents <= 100_000; cents += 137) {
      const input = revenue({
        revenueEventId: `revenue:${cents}`,
        eligiblePaidRevenueCents: cents,
      });
      const first = await kernel.evaluateRevenue(input);
      const second = await kernel.evaluateRevenue(structuredClone(input));
      expect(second).toEqual(first);
      if (first.status === "eligible") {
        expect(first.totalCommissionCents).toBe(
          Math.floor((cents * INDIVIDUAL_COMMISSION_BASIS_POINTS) / 10_000),
        );
        expect(first.totalCommissionCents).toBeLessThanOrEqual(cents);
      }
    }
  });

  it("returns one immutable decision identity under concurrent identical evaluation", async () => {
    const input = revenue();
    const results = await Promise.all(
      Array.from({ length: 100 }, () => kernel.evaluateRevenue(structuredClone(input))),
    );
    expect(new Set(results.map((result) => result.decisionId))).toHaveLength(1);
    expect(results.every((result) => result === results[0])).toBe(false);
    expect(results.every((result) => JSON.stringify(result) === JSON.stringify(results[0]))).toBe(true);
  });

  it("domain-separates revenue, reversal, and payability decision identities", async () => {
    const revenueDecision = await kernel.evaluateRevenue(revenue());
    const reversalDecision = await kernel.evaluateReversal({
      projectionVersion: 1,
      reversalEventId: "reversal:1",
      reversedAt: "2026-02-01T00:00:00.000Z",
      reversedEligibleRevenueCents: 10_000,
      originalRevenue: revenue(),
    });
    const payabilityDecision = await kernel.assessPayability(payability());
    expect(new Set([
      revenueDecision.decisionId,
      reversalDecision.decisionId,
      payabilityDecision.decisionId,
    ])).toHaveLength(3);
  });
});
