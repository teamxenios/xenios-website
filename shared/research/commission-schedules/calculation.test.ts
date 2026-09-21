import { describe, expect, it } from "vitest";
import {
  SETH_OPERATING_ADVISOR_SCHEDULE,
  STANDARD_REPRESENTATIVE_SCHEDULE,
  commissionPeriodWindow,
  eligibleNetCollectedRevenueCents,
  incrementalCommissionForBasis,
  totalCommissionForBasis,
  validateCommissionRevenueBreakdown,
  validateCommissionReversalAllocation,
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

  it("reconciles gross price, non-cash adjustments, eligible cash, and collected exclusions exactly", () => {
    const breakdown = {
      grossEligibleProductChannelCents: 100_000,
      preCollectionAdjustments: [
        { kind: "discount" as const, amountCents: 10_000, authorityReference: null },
      ],
      eligibleProductChannelCollectedCents: 90_000,
      collectedExclusions: [
        { kind: "tax" as const, amountCents: 5_000, authorityReference: null },
        { kind: "shipping_pass_through" as const, amountCents: 2_000, authorityReference: null },
        { kind: "care_clinical_charge" as const, amountCents: 40_000, authorityReference: null },
      ],
      settlementAmountCents: 137_000,
    };
    expect(validateCommissionRevenueBreakdown(breakdown)).toEqual([]);
    expect(eligibleNetCollectedRevenueCents(breakdown)).toBe(90_000);
    expect(validateCommissionRevenueBreakdown({
      grossEligibleProductChannelCents: 10_000,
      preCollectionAdjustments: [],
      eligibleProductChannelCollectedCents: 10_000,
      collectedExclusions: [
        { kind: "other_written_exclusion", amountCents: 100, authorityReference: " " },
      ],
      settlementAmountCents: 10_100,
    })).toContain("collected_exclusion_0_requires_written_authority");
  });

  it("rejects double-counted, duplicate, over-gross, and unsafe waterfall components", () => {
    const invalid = validateCommissionRevenueBreakdown({
      grossEligibleProductChannelCents: 10_000,
      preCollectionAdjustments: [
        { kind: "discount", amountCents: 1_000, authorityReference: null },
        { kind: "discount", amountCents: 1_000, authorityReference: null },
      ],
      eligibleProductChannelCollectedCents: 9_000,
      collectedExclusions: [],
      settlementAmountCents: 9_000,
    });
    expect(invalid).toContain("pre_collection_adjustment_1_duplicate_kind");
    expect(validateCommissionRevenueBreakdown({
      grossEligibleProductChannelCents: 1_000,
      preCollectionAdjustments: [
        { kind: "credit", amountCents: 1_500, authorityReference: null },
      ],
      eligibleProductChannelCollectedCents: 0,
      collectedExclusions: [],
      settlementAmountCents: 0,
    })).toContain("pre_collection_adjustments_do_not_reconcile_to_eligible_collected_cash");
    expect(validateCommissionRevenueBreakdown({
      grossEligibleProductChannelCents: Number.MAX_SAFE_INTEGER,
      preCollectionAdjustments: [
        { kind: "discount", amountCents: Number.MAX_SAFE_INTEGER, authorityReference: null },
        { kind: "credit", amountCents: 1, authorityReference: null },
      ],
      eligibleProductChannelCollectedCents: 0,
      collectedExclusions: [],
      settlementAmountCents: 0,
    })).toContain("revenue_component_sum_exceeds_safe_integer_cents");
    expect(() => incrementalCommissionForBasis(
      STANDARD_REPRESENTATIVE_SCHEDULE,
      Number.MAX_SAFE_INTEGER,
      1,
    )).toThrow(/safe integer/);
  });

  it("requires exact, unique canonical reversal allocation components", () => {
    const valid = {
      allocationReference: "refund-allocation:1",
      originalRevenueSnapshotHash: "a".repeat(64),
      eligibleBasisReductionCents: 10_000,
      components: [
        { kind: "eligible_product_channel" as const, amountCents: 10_000, authorityReference: null },
        { kind: "tax" as const, amountCents: 800, authorityReference: null },
      ],
    };
    expect(validateCommissionReversalAllocation(valid, 10_800)).toEqual([]);
    expect(validateCommissionReversalAllocation({
      ...valid,
      components: [...valid.components, {
        kind: "tax" as const, amountCents: 200, authorityReference: null,
      }],
    }, 11_000)).toContain("reversal_component_2_duplicate_kind");
    expect(validateCommissionReversalAllocation(valid, 11_000))
      .toContain("reversal_components_do_not_equal_adjustment_amount");
    expect(validateCommissionReversalAllocation({
      ...valid,
      eligibleBasisReductionCents: Number.MAX_SAFE_INTEGER,
      components: [
        {
          kind: "eligible_product_channel",
          amountCents: Number.MAX_SAFE_INTEGER,
          authorityReference: null,
        },
        { kind: "tax", amountCents: 1, authorityReference: null },
      ],
    }, Number.MAX_SAFE_INTEGER)).toContain("reversal_component_sum_exceeds_safe_integer_cents");
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
