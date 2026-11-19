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
  validateCommissionReversalAllocationV2,
  validateCommissionReversalFactV2,
  type CanonicalCommissionReversalFactV2,
  type CommissionReversalAllocationV2,
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

// Entirely synthetic structure: none of these IDs/references assert an actual
// order, payment, release, authority, commercial binding or earned commission.
const LINE_A = "a1000000-0000-4000-8000-000000000001";
const LINE_B = "a1000000-0000-4000-8000-000000000002";
const ANCHOR = "b2000000-0000-4000-8000-000000000001";
const RELEASE = "c3000000-0000-4000-8000-000000000001";

function reversalV2() {
  return {
    schemaVersion: 2 as const,
    cashAllocation: {
      allocationReference: "synthetic-cash-allocation:1",
      originalRevenueSnapshotHash: "a".repeat(64),
      eligibleBasisReductionCents: 10_000,
      components: [
        { kind: "eligible_product_channel" as const, amountCents: 10_000, authorityReference: null },
        { kind: "tax" as const, amountCents: 800, authorityReference: null },
      ],
    },
    earnedPartition: {
      authorityReference: "synthetic-allocation-authority:1",
      allocationReference: "synthetic-earned-allocation:1",
      allocationVersion: 1,
      anchorEntryId: ANCHOR,
      releaseHistorySnapshotHash: "b".repeat(64),
      earnedBasisReductionCents: 4_000,
      unearnedEligibleCashReductionCents: 6_000,
      lines: [
        {
          canonicalOrderLineId: LINE_A,
          eligibleCashRefundCents: 5_000,
          earnedBasisReductionCents: 4_000,
          unearnedEligibleCashReductionCents: 1_000,
          sourceReleaseEntryIds: [RELEASE],
        },
        {
          canonicalOrderLineId: LINE_B,
          eligibleCashRefundCents: 5_000,
          earnedBasisReductionCents: 0,
          unearnedEligibleCashReductionCents: 5_000,
          sourceReleaseEntryIds: [],
        },
      ],
    },
  } satisfies CommissionReversalAllocationV2;
}

function reversalFactV2() {
  return {
    factVersion: 2 as const,
    orderId: "synthetic-order:1",
    canonicalOrderId: "d4000000-0000-4000-8000-000000000001",
    originalSettlementRef: "synthetic-settlement:1",
    kind: "refund" as "refund" | "chargeback",
    adjustment: {
      settlementRef: "synthetic-refund:1",
      externalTransactionRef: "synthetic-provider-adjustment:1",
      amountCents: 10_800,
      currency: "USD" as const,
      settledAt: "2026-11-19T12:00:00.000Z",
    },
    authorityReference: "synthetic-money-authority:1",
    allocationV2: reversalV2(),
  } satisfies CanonicalCommissionReversalFactV2;
}

describe("V2 structural reversal validation (no authority or ledger)", () => {
  it("separates 4,000 earned cents from 10,000 eligible cash without changing V1", () => {
    const value = reversalV2();
    const before = structuredClone(value);
    expect(validateCommissionReversalAllocationV2(value, 10_800)).toEqual([]);
    expect(validateCommissionReversalAllocation(value.cashAllocation, 10_800)).toEqual([]);
    expect(validateCommissionReversalAllocation({
      ...value.cashAllocation,
      eligibleBasisReductionCents: 4_000,
    }, 10_800)).toContain("reversal_eligible_component_does_not_equal_basis_reduction");
    expect(value).toEqual(before);
  });

  it("accepts an entirely unearned refund without a zero commission or fake release", () => {
    const value = reversalV2();
    value.earnedPartition.earnedBasisReductionCents = 0;
    value.earnedPartition.unearnedEligibleCashReductionCents = 10_000;
    for (const line of value.earnedPartition.lines) {
      line.earnedBasisReductionCents = 0;
      line.unearnedEligibleCashReductionCents = line.eligibleCashRefundCents;
      line.sourceReleaseEntryIds = [];
    }
    expect(validateCommissionReversalAllocationV2(value, 10_800)).toEqual([]);
  });

  it("allows no line partition only when full eligible cash is zero", () => {
    const value = reversalV2();
    value.cashAllocation.eligibleBasisReductionCents = 0;
    value.cashAllocation.components = [{ kind: "tax", amountCents: 800, authorityReference: null }];
    value.earnedPartition.earnedBasisReductionCents = 0;
    value.earnedPartition.unearnedEligibleCashReductionCents = 0;
    value.earnedPartition.lines = [];
    expect(validateCommissionReversalAllocationV2(value, 800)).toEqual([]);
    const missing = reversalV2();
    missing.earnedPartition.lines = [];
    expect(validateCommissionReversalAllocationV2(missing, 10_800))
      .toContain("reversal_v2_cash_partition_mismatch");
  });

  it.each([undefined, null, 1, 3, "2", true])("requires schemaVersion exactly 2, refusing %s", version => {
    expect(validateCommissionReversalAllocationV2({ ...reversalV2(), schemaVersion: version }, 10_800))
      .toEqual(["reversal_v2_schema_version_must_be_2"]);
  });

  it("rejects absent discriminators, legacy allocations and mixed V1/V2 fields", () => {
    const value = reversalV2();
    expect(validateCommissionReversalAllocationV2(value.cashAllocation, 10_800))
      .toEqual(["reversal_v2_shape_invalid"]);
    expect(validateCommissionReversalAllocation(value as unknown as typeof value.cashAllocation, 10_800))
      .toContain("reversal_allocation_components_required");
    expect(validateCommissionReversalAllocationV2({ cashAllocation: value.cashAllocation, earnedPartition: value.earnedPartition }, 10_800))
      .toEqual(["reversal_v2_shape_invalid"]);
    expect(validateCommissionReversalAllocationV2({ ...value, eligibleBasisReductionCents: 4_000 }, 10_800))
      .toEqual(["reversal_v2_shape_invalid"]);
    expect(validateCommissionReversalAllocationV2({
      ...value, cashAllocation: { ...value.cashAllocation, earnedBasisReductionCents: 4_000 },
    }, 10_800)).toEqual(["reversal_v2_cash_shape_invalid"]);
    expect(validateCommissionReversalAllocationV2(value, 11_000))
      .toContain("reversal_components_do_not_equal_adjustment_amount");
    expect(validateCommissionReversalAllocationV2(value, 4_000))
      .toContain("reversal_components_do_not_equal_adjustment_amount");
  });

  it("delegates unchanged full-cash errors before inspecting the earned partition", () => {
    const value = reversalV2();
    value.cashAllocation.eligibleBasisReductionCents = 4_000;
    const expected = validateCommissionReversalAllocation(value.cashAllocation, 10_800);
    expect(validateCommissionReversalAllocationV2({ ...value, earnedPartition: null }, 10_800)).toEqual(expected);
    value.cashAllocation.components.push({ kind: "tax", amountCents: 200, authorityReference: null });
    expect(validateCommissionReversalAllocationV2(value, 11_000))
      .toContain("reversal_component_2_duplicate_kind");
  });

  it("rejects a per-line mismatch even when global totals still reconcile", () => {
    const value = reversalV2();
    value.earnedPartition.lines[0]!.unearnedEligibleCashReductionCents = 999;
    expect(validateCommissionReversalAllocationV2(value, 10_800))
      .toContain("reversal_v2_line_0_partition_mismatch");
  });

  it("checks global cash and line-earned totals independently", () => {
    const wrongCash = reversalV2();
    wrongCash.earnedPartition.lines[1]!.eligibleCashRefundCents = 4_999;
    wrongCash.earnedPartition.lines[1]!.unearnedEligibleCashReductionCents = 4_999;
    wrongCash.earnedPartition.unearnedEligibleCashReductionCents = 5_999;
    expect(validateCommissionReversalAllocationV2(wrongCash, 10_800))
      .toContain("reversal_v2_cash_partition_mismatch");
    const wrongTotals = reversalV2();
    wrongTotals.earnedPartition.earnedBasisReductionCents = 4_001;
    wrongTotals.earnedPartition.unearnedEligibleCashReductionCents = 5_999;
    expect(validateCommissionReversalAllocationV2(wrongTotals, 10_800))
      .toEqual(["reversal_v2_line_totals_mismatch"]);
  });
});

describe("V2 integer, identity and source-reference boundaries", () => {
  it.each([NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "4000", null])(
    "refuses invalid cents %s before integer arithmetic",
    amount => {
      const value = reversalV2();
      for (const field of ["earnedBasisReductionCents", "unearnedEligibleCashReductionCents"]) {
        expect(validateCommissionReversalAllocationV2({
          ...value, earnedPartition: { ...value.earnedPartition, [field]: amount },
        }, 10_800)).toContain("reversal_v2_partition_totals_invalid");
      }
      for (const field of ["eligibleCashRefundCents", "earnedBasisReductionCents", "unearnedEligibleCashReductionCents"]) {
        expect(validateCommissionReversalAllocationV2({
          ...value,
          earnedPartition: {
            ...value.earnedPartition,
            lines: [{ ...value.earnedPartition.lines[0], [field]: amount }, value.earnedPartition.lines[1]],
          },
        }, 10_800)).toContain("reversal_v2_line_0_amounts_invalid");
      }
    },
  );

  it("refuses zero-valued cash lines rather than creating meaningless line allocations", () => {
    const value = reversalV2();
    value.earnedPartition.lines[0]!.eligibleCashRefundCents = 0;
    expect(validateCommissionReversalAllocationV2(value, 10_800))
      .toContain("reversal_v2_line_0_amounts_invalid");
  });

  it("detects per-line partition overflow before converting a sum back to number", () => {
    const value = reversalV2();
    Object.assign(value.earnedPartition.lines[0]!, {
      eligibleCashRefundCents: Number.MAX_SAFE_INTEGER,
      earnedBasisReductionCents: Number.MAX_SAFE_INTEGER,
      unearnedEligibleCashReductionCents: 1,
    });
    expect(validateCommissionReversalAllocationV2(value, 10_800))
      .toContain("reversal_v2_line_0_partition_overflow");
  });

  it("detects individually safe line values whose accumulated cash overflows", () => {
    const value = reversalV2();
    for (const line of value.earnedPartition.lines) {
      line.eligibleCashRefundCents = Number.MAX_SAFE_INTEGER;
      line.earnedBasisReductionCents = Number.MAX_SAFE_INTEGER;
      line.unearnedEligibleCashReductionCents = 0;
      line.sourceReleaseEntryIds = [RELEASE];
    }
    expect(validateCommissionReversalAllocationV2(value, 10_800))
      .toEqual(["reversal_v2_partition_sum_overflow"]);
  });

  it("detects global earned-plus-unearned overflow independently of line sums", () => {
    const value = reversalV2();
    value.earnedPartition.earnedBasisReductionCents = Number.MAX_SAFE_INTEGER;
    value.earnedPartition.unearnedEligibleCashReductionCents = 1;
    expect(validateCommissionReversalAllocationV2(value, 10_800))
      .toEqual(["reversal_v2_partition_sum_overflow"]);
  });

  it("retains the unchanged V1 full-cash overflow refusal", () => {
    const value = reversalV2();
    value.cashAllocation.eligibleBasisReductionCents = Number.MAX_SAFE_INTEGER;
    value.cashAllocation.components[0]!.amountCents = Number.MAX_SAFE_INTEGER;
    value.cashAllocation.components[1]!.amountCents = 1;
    expect(validateCommissionReversalAllocationV2(value, Number.MAX_SAFE_INTEGER))
      .toEqual(["reversal_component_sum_exceeds_safe_integer_cents"]);
  });

  it("rejects repeated canonical line identity even with alternate UUID casing", () => {
    const value = reversalV2();
    value.earnedPartition.lines[1]!.canonicalOrderLineId = LINE_A.toUpperCase();
    expect(validateCommissionReversalAllocationV2(value, 10_800))
      .toContain("reversal_v2_line_1_duplicate_id");
  });

  it.each(["", "line:ordinal-1", "00000000-0000-0000-0000-000000000000", "a1000000-0000-4000-7000-000000000001", null])(
    "requires UUID-shaped canonical line, anchor and release references, refusing %s",
    id => {
      const value = reversalV2();
      expect(validateCommissionReversalAllocationV2({
        ...value, earnedPartition: { ...value.earnedPartition, anchorEntryId: id },
      }, 10_800)).toContain("reversal_v2_anchor_id_invalid");
      expect(validateCommissionReversalAllocationV2({
        ...value,
        earnedPartition: {
          ...value.earnedPartition,
          lines: [{ ...value.earnedPartition.lines[0], canonicalOrderLineId: id }],
        },
      }, 10_800)).toContain("reversal_v2_line_0_id_invalid");
      expect(validateCommissionReversalAllocationV2({
        ...value,
        earnedPartition: {
          ...value.earnedPartition,
          lines: [{ ...value.earnedPartition.lines[0], sourceReleaseEntryIds: [id] }],
        },
      }, 10_800)).toContain("reversal_v2_line_0_release_id_invalid");
    },
  );

  it("rejects duplicate release references within a line but allows one release across distinct lines", () => {
    const repeated = reversalV2();
    repeated.earnedPartition.lines[0]!.sourceReleaseEntryIds = [RELEASE, RELEASE.toUpperCase()];
    expect(validateCommissionReversalAllocationV2(repeated, 10_800))
      .toContain("reversal_v2_line_0_duplicate_release_id");
    const shared = reversalV2();
    shared.earnedPartition.lines[0]!.earnedBasisReductionCents = 2_000;
    shared.earnedPartition.lines[0]!.unearnedEligibleCashReductionCents = 3_000;
    shared.earnedPartition.lines[1]!.earnedBasisReductionCents = 2_000;
    shared.earnedPartition.lines[1]!.unearnedEligibleCashReductionCents = 3_000;
    shared.earnedPartition.lines[1]!.sourceReleaseEntryIds = [RELEASE];
    expect(validateCommissionReversalAllocationV2(shared, 10_800)).toEqual([]);
    // Structural identity is not a claim that this release owns either line.
  });

  it("requires release references for earned reductions and none for unearned-only lines", () => {
    const missing = reversalV2();
    missing.earnedPartition.lines[0]!.sourceReleaseEntryIds = [];
    expect(validateCommissionReversalAllocationV2(missing, 10_800))
      .toContain("reversal_v2_line_0_release_ids_do_not_match_earned_partition");
    const extra = reversalV2();
    extra.earnedPartition.lines[1]!.sourceReleaseEntryIds = [RELEASE];
    expect(validateCommissionReversalAllocationV2(extra, 10_800))
      .toContain("reversal_v2_line_1_release_ids_do_not_match_earned_partition");
  });

  it.each(["", "ab", " padded", "padded ", "ref\nline", "ref\u007fline", "x".repeat(513), null])(
    "requires bounded nonblank opaque partition references, refusing %s",
    reference => {
      const value = reversalV2();
      for (const field of ["authorityReference", "allocationReference"]) {
        expect(validateCommissionReversalAllocationV2({
          ...value, earnedPartition: { ...value.earnedPartition, [field]: reference },
        }, 10_800)).toContain("reversal_v2_partition_reference_invalid");
      }
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, "1", null])(
    "requires a positive safe-integer allocation version, refusing %s",
    version => {
      const value = reversalV2();
      expect(validateCommissionReversalAllocationV2({
        ...value, earnedPartition: { ...value.earnedPartition, allocationVersion: version },
      }, 10_800)).toContain("reversal_v2_allocation_version_invalid");
    },
  );

  it.each(["a".repeat(63), "A".repeat(64), "z".repeat(64), null])(
    "requires a lowercase SHA-256-shaped release-history hash, refusing %s",
    hash => {
      const value = reversalV2();
      expect(validateCommissionReversalAllocationV2({
        ...value, earnedPartition: { ...value.earnedPartition, releaseHistorySnapshotHash: hash },
      }, 10_800)).toContain("reversal_v2_release_history_hash_invalid");
    },
  );
});

describe("V2 closed structures and fact discriminator", () => {
  it("accepts the maximum safe cent value without rounding", () => {
    const value = reversalV2();
    value.cashAllocation.eligibleBasisReductionCents = Number.MAX_SAFE_INTEGER;
    value.cashAllocation.components = [{
      kind: "eligible_product_channel", amountCents: Number.MAX_SAFE_INTEGER, authorityReference: null,
    }];
    value.earnedPartition.earnedBasisReductionCents = Number.MAX_SAFE_INTEGER;
    value.earnedPartition.unearnedEligibleCashReductionCents = 0;
    value.earnedPartition.lines = [{
      canonicalOrderLineId: LINE_A,
      eligibleCashRefundCents: Number.MAX_SAFE_INTEGER,
      earnedBasisReductionCents: Number.MAX_SAFE_INTEGER,
      unearnedEligibleCashReductionCents: 0,
      sourceReleaseEntryIds: [RELEASE],
    }];
    expect(validateCommissionReversalAllocationV2(value, Number.MAX_SAFE_INTEGER)).toEqual([]);
  });

  it("refuses non-records, missing fields, unknown fields and inherited versions", () => {
    for (const value of [undefined, null, [], {}, 2, "2", new Date("2026-11-19T00:00:00.000Z")]) {
      expect(validateCommissionReversalAllocationV2(value, 10_800)).toEqual(["reversal_v2_shape_invalid"]);
    }
    const value = reversalV2();
    expect(validateCommissionReversalAllocationV2(Object.assign(Object.create({ schemaVersion: 2 }), {
      cashAllocation: value.cashAllocation, earnedPartition: value.earnedPartition,
    }), 10_800)).toEqual(["reversal_v2_shape_invalid"]);
    expect(validateCommissionReversalAllocationV2({
      ...value, earnedPartition: { ...value.earnedPartition, currentBalance: 10_000 },
    }, 10_800)).toEqual(["reversal_v2_partition_shape_invalid"]);
    expect(validateCommissionReversalAllocationV2({
      ...value,
      earnedPartition: { ...value.earnedPartition, lines: [{ ...value.earnedPartition.lines[0], orderId: "other-order" }] },
    }, 10_800)).toContain("reversal_v2_line_0_shape_invalid");
    expect(validateCommissionReversalAllocationV2({
      ...value,
      cashAllocation: { ...value.cashAllocation, components: [{ ...value.cashAllocation.components[0], earnedOnly: true }] },
    }, 10_800)).toEqual(["reversal_v2_cash_component_shape_invalid"]);
  });

  it("refuses object accessors without reading their claimed evidence", () => {
    const value = reversalV2();
    Object.defineProperty(value, "cashAllocation", { enumerable: true, get: () => { throw new Error("must not be read"); } });
    expect(validateCommissionReversalAllocationV2(value, 10_800)).toEqual(["reversal_v2_shape_invalid"]);
  });

  it("refuses non-array and sparse components, lines and release-reference lists", () => {
    const value = reversalV2();
    expect(validateCommissionReversalAllocationV2({
      ...value, cashAllocation: { ...value.cashAllocation, components: null },
    }, 10_800)).toContain("reversal_allocation_components_required");
    expect(validateCommissionReversalAllocationV2({
      ...value, cashAllocation: { ...value.cashAllocation, components: Array(1) },
    }, 10_800)).toEqual(["reversal_v2_cash_component_shape_invalid"]);
    expect(validateCommissionReversalAllocationV2({
      ...value, earnedPartition: { ...value.earnedPartition, lines: null },
    }, 10_800)).toContain("reversal_v2_lines_must_be_an_array");
    expect(validateCommissionReversalAllocationV2({
      ...value, earnedPartition: { ...value.earnedPartition, lines: Array(1) },
    }, 10_800)).toContain("reversal_v2_line_0_shape_invalid");
    for (const [references, issue] of [
      [null, "reversal_v2_line_0_release_ids_invalid"],
      [Array(1), "reversal_v2_line_0_release_id_invalid"],
    ] as const) {
      expect(validateCommissionReversalAllocationV2({
        ...value,
        earnedPartition: {
          ...value.earnedPartition, lines: [{ ...value.earnedPartition.lines[0], sourceReleaseEntryIds: references }],
        },
      }, 10_800)).toContain(issue);
    }
  });

  it.each(["refund", "chargeback"] as const)("accepts a structurally valid %s fact without attesting authenticity", kind => {
    const fact = reversalFactV2();
    fact.kind = kind;
    const before = structuredClone(fact);
    // A result of [] means only structural success. No repository, provider,
    // authority, proof, permission, current balance or ledger was consulted.
    expect(validateCommissionReversalFactV2(fact)).toEqual([]);
    expect(fact).toEqual(before);
  });

  it.each([undefined, null, 1, 3, "2", true])("requires factVersion exactly 2, refusing %s", version => {
    expect(validateCommissionReversalFactV2({ ...reversalFactV2(), factVersion: version }))
      .toEqual(["reversal_fact_v2_version_must_be_2"]);
  });

  it("refuses legacy fact allocations, absent fact versions and mixed fact shapes", () => {
    const fact = reversalFactV2();
    const { factVersion: _version, ...withoutVersion } = fact;
    const { allocationV2: _allocationV2, ...withoutAllocation } = fact;
    expect(validateCommissionReversalFactV2(withoutVersion)).toEqual(["reversal_fact_v2_shape_invalid"]);
    expect(validateCommissionReversalFactV2({ ...fact, allocation: fact.allocationV2.cashAllocation }))
      .toEqual(["reversal_fact_v2_shape_invalid"]);
    expect(validateCommissionReversalFactV2({ ...withoutAllocation, allocation: fact.allocationV2.cashAllocation }))
      .toEqual(["reversal_fact_v2_shape_invalid"]);
    expect(validateCommissionReversalFactV2({ ...fact, allocationV2: fact.allocationV2.cashAllocation }))
      .toEqual(["reversal_v2_shape_invalid"]);
    expect(validateCommissionReversalFactV2({ ...fact, allocationV2: { ...fact.allocationV2, schemaVersion: 1 } }))
      .toEqual(["reversal_v2_schema_version_must_be_2"]);
  });

  it("requires separate adjustment money identity, a canonical UUID and known adjustment kind", () => {
    const fact = reversalFactV2();
    expect(validateCommissionReversalFactV2({
      ...fact, adjustment: { ...fact.adjustment, settlementRef: fact.originalSettlementRef },
    })).toContain("reversal_fact_v2_adjustment_reuses_original_reference");
    expect(validateCommissionReversalFactV2({ ...fact, canonicalOrderId: fact.orderId }))
      .toContain("reversal_fact_v2_order_id_invalid");
    expect(validateCommissionReversalFactV2({ ...fact, kind: "completion_dispute" }))
      .toContain("reversal_fact_v2_kind_invalid");
    expect(validateCommissionReversalFactV2({ ...fact, authorityReference: " " }))
      .toContain("reversal_fact_v2_reference_invalid");
    expect(validateCommissionReversalFactV2({ ...fact, orderId: " order " }))
      .toContain("reversal_fact_v2_reference_invalid");
    expect(validateCommissionReversalFactV2({
      ...fact, adjustment: { ...fact.adjustment, externalTransactionRef: " " },
    })).toContain("reversal_fact_v2_adjustment_reference_invalid");
  });

  it("requires exact full adjustment money fields and does not accept an earned-only amount", () => {
    const fact = reversalFactV2();
    expect(validateCommissionReversalFactV2({ ...fact, adjustment: null }))
      .toEqual(["reversal_fact_v2_adjustment_shape_invalid"]);
    expect(validateCommissionReversalFactV2({ ...fact, adjustment: { ...fact.adjustment, providerStatus: "settled" } }))
      .toEqual(["reversal_fact_v2_adjustment_shape_invalid"]);
    expect(validateCommissionReversalFactV2({ ...fact, adjustment: { ...fact.adjustment, amountCents: 4_000 } }))
      .toContain("reversal_components_do_not_equal_adjustment_amount");
    expect(validateCommissionReversalFactV2({ ...fact, adjustment: { ...fact.adjustment, currency: "EUR" } }))
      .toContain("reversal_fact_v2_currency_invalid");
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "10800", null])(
    "retains positive-safe-integer full money validation for %s",
    amount => {
      const fact = reversalFactV2();
      expect(validateCommissionReversalFactV2({ ...fact, adjustment: { ...fact.adjustment, amountCents: amount } }))
        .toContain("reversal_adjustment_must_be_positive_safe_integer_cents");
    },
  );

  it.each([
    "", "not-an-instant", "2026-11-19", "2026-11-19T12:00:00Z", "2026-11-19T13:00:00.000+01:00",
    "2026-02-30T12:00:00.000Z", "2026-11-19T24:00:00.000Z", null,
  ])("requires an exact real UTC millisecond instant, refusing %s", instant => {
    const fact = reversalFactV2();
    expect(validateCommissionReversalFactV2({ ...fact, adjustment: { ...fact.adjustment, settledAt: instant } }))
      .toContain("reversal_fact_v2_instant_invalid");
  });
});
