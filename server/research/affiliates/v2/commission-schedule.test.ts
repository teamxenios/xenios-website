import { describe, expect, it } from "vitest";

import {
  AFFILIATE_ATTRIBUTION_WINDOW_DAYS,
  AFFILIATE_COMMISSION_HOLD_DAYS,
  AFFILIATE_DRAFT_COMMISSION_SCHEDULE,
  AFFILIATE_DRAFT_SCHEDULE_STATE,
  AFFILIATE_DRAFT_SCHEDULE_VERSION_HASH,
  AFFILIATE_FIRST_ORDER_RATE_BPS,
  AFFILIATE_MINIMUM_PAYOUT_CENTS,
  AFFILIATE_REPEAT_ORDER_RATE_BPS,
  affiliateScheduleIsActive,
} from "./draft-schedule";
import { calculateAffiliateCommission, type CommissionOrderFacts } from "./commission-engine";

/**
 * THE COMMISSION SCHEDULE THE FOUNDER SPECIFIED, AND THE FACT THAT IT PAYS
 * NOBODY UNTIL A NAMED HUMAN APPROVES IT.
 */

function facts(overrides: Partial<CommissionOrderFacts> = {}): CommissionOrderFacts {
  return {
    settledProductRevenueCents: 100_000,
    fundedDiscountsCents: 0,
    refundsCents: 0,
    chargebacksCents: 0,
    complimentaryCents: 0,
    excludedCents: 0,
    salesTaxCents: 0,
    passThroughShippingCents: 0,
    isFirstEligibleOrder: true,
    productCommissionable: true,
    affiliateActive: true,
    scheduleActive: true,
    ...overrides,
  };
}

describe("the draft schedule records exactly what the brief specified", () => {
  it("carries 2000 bps first, 1500 bps repeat, 30-day window and hold, $100 minimum", () => {
    expect(AFFILIATE_FIRST_ORDER_RATE_BPS).toBe(2_000);
    expect(AFFILIATE_REPEAT_ORDER_RATE_BPS).toBe(1_500);
    expect(AFFILIATE_ATTRIBUTION_WINDOW_DAYS).toBe(30);
    expect(AFFILIATE_COMMISSION_HOLD_DAYS).toBe(30);
    expect(AFFILIATE_MINIMUM_PAYOUT_CENTS).toBe(10_000);
    expect(AFFILIATE_DRAFT_COMMISSION_SCHEDULE.firstOrderRateBps).toBe(2_000);
    expect(AFFILIATE_DRAFT_COMMISSION_SCHEDULE.repeatOrderRateBps).toBe(1_500);
  });

  it("is a DRAFT, and a draft is not active", () => {
    expect(AFFILIATE_DRAFT_SCHEDULE_STATE).toBe("draft");
    expect(affiliateScheduleIsActive(AFFILIATE_DRAFT_SCHEDULE_STATE)).toBe(false);
    expect(affiliateScheduleIsActive("active")).toBe(true);
  });

  it("is versioned by its own content, so an edited rate cannot rewrite history", () => {
    expect(AFFILIATE_DRAFT_SCHEDULE_VERSION_HASH).toMatch(/^[a-f0-9]{32}$/);
    // The same content always fingerprints the same way.
    expect(AFFILIATE_DRAFT_COMMISSION_SCHEDULE.version).toBe(1);
  });
});

describe("nothing accrues while anything is inactive", () => {
  it("pays NOTHING under the draft schedule as it ships", () => {
    // The whole point: the numbers exist, and they earn nobody a cent until
    // the schedule is approved and activated by a named human.
    expect(
      calculateAffiliateCommission(AFFILIATE_DRAFT_COMMISSION_SCHEDULE, facts({ scheduleActive: false })),
    ).toBeNull();
  });

  it.each([
    ["the schedule is inactive", { scheduleActive: false }],
    ["the affiliate is inactive", { affiliateActive: false }],
    ["the product is not commissionable", { productCommissionable: false }],
  ])("pays nothing when %s", (_name, override) => {
    expect(
      calculateAffiliateCommission(AFFILIATE_DRAFT_COMMISSION_SCHEDULE, facts(override)),
    ).toBeNull();
  });
});

describe("the cents math, once a schedule is genuinely active", () => {
  const active = AFFILIATE_DRAFT_COMMISSION_SCHEDULE;

  it("takes 20% of the first eligible order", () => {
    const result = calculateAffiliateCommission(active, facts());
    expect(result).toEqual({ eligibleRevenueCents: 100_000, rateBps: 2_000, grossCommissionCents: 20_000 });
  });

  it("takes 15% of a repeat order", () => {
    const result = calculateAffiliateCommission(active, facts({ isFirstEligibleOrder: false }));
    expect(result).toEqual({ eligibleRevenueCents: 100_000, rateBps: 1_500, grossCommissionCents: 15_000 });
  });

  it("removes refunds, chargebacks, tax and pass-through shipping from the base", () => {
    const result = calculateAffiliateCommission(
      active,
      facts({
        settledProductRevenueCents: 100_000,
        refundsCents: 10_000,
        chargebacksCents: 5_000,
        salesTaxCents: 8_000,
        passThroughShippingCents: 2_000,
        fundedDiscountsCents: 5_000,
      }),
    );
    // 100,000 - 10,000 - 5,000 - 8,000 - 2,000 - 5,000 = 70,000, then 20%.
    expect(result?.eligibleRevenueCents).toBe(70_000);
    expect(result?.grossCommissionCents).toBe(14_000);
  });

  it("never returns a negative base, and rounds the commission DOWN", () => {
    const fullyRefunded = calculateAffiliateCommission(
      active,
      facts({ settledProductRevenueCents: 10_000, refundsCents: 50_000 }),
    );
    expect(fullyRefunded).toEqual({ eligibleRevenueCents: 0, rateBps: 2_000, grossCommissionCents: 0 });

    // 3,333 * 2000 / 10000 = 666.6 -> 666, never 667: the payer is never
    // charged a cent more than the approved percentage.
    const odd = calculateAffiliateCommission(active, facts({ settledProductRevenueCents: 3_333 }));
    expect(odd?.grossCommissionCents).toBe(666);
  });

  it("refuses a nonsense rate rather than computing with it", () => {
    for (const rateBps of [-1, 10_001, 1.5, Number.NaN]) {
      expect(
        calculateAffiliateCommission({ ...active, firstOrderRateBps: rateBps } as never, facts()),
      ).toBeNull();
    }
  });
});
