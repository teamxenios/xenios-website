import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTRIBUTION,
  eligibleNetRevenueCents,
  type OrderRevenueBreakdown,
} from "../distribution";
import {
  AFFILIATE_PROGRAM_ENV,
  DEFAULT_LAUNCH_PROGRAM,
  affiliateProgramEnabled,
  commissionBasisCents,
  programRateBasisPoints,
  resolveAffiliateProgram,
} from "./config";

function breakdown(overrides: Partial<OrderRevenueBreakdown> = {}): OrderRevenueBreakdown {
  return {
    grossItemsCents: 25000,
    taxCents: 1500,
    shippingCents: 900,
    discountsCents: 500,
    storeCreditAppliedCents: 0,
    refundedCents: 0,
    chargebackCents: 0,
    ineligibleCategoryCents: 0,
    ...overrides,
  };
}

describe("DEFAULT_LAUNCH_PROGRAM", () => {
  it("carries the founder's 2026-08-16 workbook decisions exactly", () => {
    // The rates are pinned HERE, against configuration. Business logic reads
    // the config, so these are the only lines allowed to state the numbers.
    expect(DEFAULT_LAUNCH_PROGRAM.firstOrderRateBasisPoints).toBe(2000);
    expect(DEFAULT_LAUNCH_PROGRAM.repeatOrderRateBasisPoints).toBe(750);
    expect(DEFAULT_LAUNCH_PROGRAM.repeatWindowMonths).toEqual({ fromMonth: 2, toMonth: 12 });
    expect(DEFAULT_LAUNCH_PROGRAM.holdDays).toBe(21);
    expect(DEFAULT_LAUNCH_PROGRAM.minimumPayoutCents).toBe(5000);
    expect(DEFAULT_LAUNCH_PROGRAM.payoutCadence).toBe("biweekly_friday");
    expect(DEFAULT_LAUNCH_PROGRAM.selfReferralPolicy).toBe("denied");
  });

  it("uses the shared attribution authority, not a private window", () => {
    expect(DEFAULT_LAUNCH_PROGRAM.attribution).toBe(DEFAULT_ATTRIBUTION);
    expect(DEFAULT_LAUNCH_PROGRAM.attributionCookieTtlDays).toBe(
      DEFAULT_ATTRIBUTION.windowDays,
    );
  });

  it("is frozen so a consumer cannot mutate the seed", () => {
    expect(Object.isFrozen(DEFAULT_LAUNCH_PROGRAM)).toBe(true);
    expect(Object.isFrozen(DEFAULT_LAUNCH_PROGRAM.repeatWindowMonths)).toBe(true);
  });
});

describe("activation gate", () => {
  it("activates only on the exact lowercase string 'true'", () => {
    expect(affiliateProgramEnabled({ [AFFILIATE_PROGRAM_ENV]: "true" })).toBe(true);
    expect(resolveAffiliateProgram({ [AFFILIATE_PROGRAM_ENV]: "true" })).toBe(
      DEFAULT_LAUNCH_PROGRAM,
    );
  });

  it("fails closed on every near-miss and on absence", () => {
    for (const value of ["TRUE", "True", "1", "yes", " true", "true ", "", undefined]) {
      expect(affiliateProgramEnabled({ [AFFILIATE_PROGRAM_ENV]: value })).toBe(false);
      expect(resolveAffiliateProgram({ [AFFILIATE_PROGRAM_ENV]: value })).toBeNull();
    }
    expect(resolveAffiliateProgram({})).toBeNull();
  });
});

describe("commissionBasisCents", () => {
  it("is exactly eligibleNetRevenueCents, never a second derivation", () => {
    const b = breakdown();
    expect(commissionBasisCents(b)).toBe(eligibleNetRevenueCents(b));

    const refunded = breakdown({ refundedCents: 100000 });
    expect(commissionBasisCents(refunded)).toBe(0);
    expect(commissionBasisCents(refunded)).toBe(eligibleNetRevenueCents(refunded));
  });
});

describe("programRateBasisPoints", () => {
  it("pays the configured first-order rate for a first order", () => {
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "first")).toBe(
      DEFAULT_LAUNCH_PROGRAM.firstOrderRateBasisPoints,
    );
  });

  it("pays the configured repeat rate inside months 2-12 inclusive", () => {
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", 2)).toBe(
      DEFAULT_LAUNCH_PROGRAM.repeatOrderRateBasisPoints,
    );
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", 7)).toBe(
      DEFAULT_LAUNCH_PROGRAM.repeatOrderRateBasisPoints,
    );
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", 12)).toBe(
      DEFAULT_LAUNCH_PROGRAM.repeatOrderRateBasisPoints,
    );
  });

  it("pays nothing outside the repeat window", () => {
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", 1)).toBe(0);
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", 13)).toBe(0);
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", 24)).toBe(0);
  });

  it("fails closed on an unknown or malformed month, never up to the first-order rate", () => {
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat")).toBe(0);
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", 2.5)).toBe(0);
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", Number.NaN)).toBe(0);
    expect(programRateBasisPoints(DEFAULT_LAUNCH_PROGRAM, "repeat", -3)).toBe(0);
  });

  it("reads rates only from the configuration it is handed", () => {
    const halved = {
      ...DEFAULT_LAUNCH_PROGRAM,
      firstOrderRateBasisPoints: 1000,
      repeatOrderRateBasisPoints: 375,
    };
    expect(programRateBasisPoints(halved, "first")).toBe(1000);
    expect(programRateBasisPoints(halved, "repeat", 3)).toBe(375);
  });
});
