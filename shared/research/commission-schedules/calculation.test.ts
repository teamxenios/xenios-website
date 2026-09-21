import { describe, expect, it } from "vitest";
import {
  SETH_OPERATING_ADVISOR_SCHEDULE,
  STANDARD_REPRESENTATIVE_SCHEDULE,
  commissionPeriodWindow,
  eligibleNetCollectedRevenueCents,
  incrementalCommissionForBasis,
  totalCommissionForBasis,
  validateCommissionRevenueBreakdown,
} from "./index";

describe("versioned commission schedule calculations", () => {
  it("splits Seth revenue marginally at $50,000 without repricing the first band", () => {
    const result = incrementalCommissionForBasis(
      SETH_OPERATING_ADVISOR_SCHEDULE,
      4_900_000,
      200_000,
    );
    expect(result).toEqual({
      eligibleBasisCents: 200_000,
      commissionCents: 55_000,
      components: [
        { basisCents: 100_000, rateBasisPoints: 2_500, commissionCents: 25_000 },
        { basisCents: 100_000, rateBasisPoints: 3_000, commissionCents: 30_000 },
      ],
    });
    expect(totalCommissionForBasis(SETH_OPERATING_ADVISOR_SCHEDULE, 7_500_000).commissionCents)
      .toBe(2_000_000);
  });

  it("pays the standard representative a flat 20%", () => {
    expect(totalCommissionForBasis(STANDARD_REPRESENTATIVE_SCHEDULE, 123_45)).toMatchObject({
      commissionCents: 2_469,
      components: [{ rateBasisPoints: 2_000 }],
    });
  });

  it("deducts explicit Care and ordinary exclusions and refuses unsupported written exclusions", () => {
    const breakdown = {
      grossProductChannelRevenueCents: 100_000,
      exclusions: [
        { kind: "tax" as const, amountCents: 5_000, authorityReference: null },
        { kind: "shipping_pass_through" as const, amountCents: 2_000, authorityReference: null },
        { kind: "care_clinical_charge" as const, amountCents: 40_000, authorityReference: null },
      ],
    };
    expect(validateCommissionRevenueBreakdown(breakdown)).toEqual([]);
    expect(eligibleNetCollectedRevenueCents(breakdown)).toBe(53_000);
    expect(validateCommissionRevenueBreakdown({
      grossProductChannelRevenueCents: 10_000,
      exclusions: [
        { kind: "other_written_exclusion", amountCents: 100, authorityReference: " " },
      ],
    })).toContain("exclusion_0_requires_written_authority");
  });

  it("uses exact exclusive 30-day and 14-day period boundaries", () => {
    const anchor = "2026-09-02T00:00:00.000Z";
    expect(commissionPeriodWindow(
      SETH_OPERATING_ADVISOR_SCHEDULE,
      anchor,
      "2026-10-01T23:59:59.999Z",
    )?.index).toBe(0);
    expect(commissionPeriodWindow(
      SETH_OPERATING_ADVISOR_SCHEDULE,
      anchor,
      "2026-10-02T00:00:00.000Z",
    )?.index).toBe(1);
    expect(commissionPeriodWindow(
      STANDARD_REPRESENTATIVE_SCHEDULE,
      anchor,
      "2026-09-16T00:00:00.000Z",
    )?.index).toBe(1);
  });

  it("records the signed post-term tail at the 25% base rate", () => {
    expect(totalCommissionForBasis(
      SETH_OPERATING_ADVISOR_SCHEDULE,
      6_000_000,
      "post_term_tail",
    ).commissionCents).toBe(1_500_000);
  });

  it("keeps all recruiter, sponsor, and recursive downline overrides disabled", () => {
    for (const schedule of [SETH_OPERATING_ADVISOR_SCHEDULE, STANDARD_REPRESENTATIVE_SCHEDULE]) {
      expect(schedule.sponsorOverridesEnabled).toBe(false);
      expect(schedule.recruiterOverridesEnabled).toBe(false);
      expect(schedule.downlineOverridesEnabled).toBe(false);
      expect(schedule.compensationForRecruitingEnabled).toBe(false);
    }
  });
});
