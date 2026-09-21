import type {
  CommissionCalculation,
  CommissionPeriodWindow,
  CommissionRateComponent,
  CommissionRatePolicy,
  CommissionRevenueBreakdown,
  CommissionRevenueExclusion,
  CommissionReversalAllocation,
  CommissionScheduleDefinition,
} from "./contract";
import {
  COMMISSION_COLLECTED_EXCLUSION_KINDS,
  COMMISSION_PRE_COLLECTION_ADJUSTMENT_KINDS,
  COMMISSION_REVERSAL_ALLOCATION_KINDS,
} from "./contract";

const DAY_MS = 24 * 60 * 60 * 1_000;

function wholeNonnegativeCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function wholePositiveCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function safeCentsSum(values: readonly number[]): number | null {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

function validateUniqueComponents(
  components: readonly unknown[],
  allowed: readonly string[],
  prefix: string,
): readonly string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  components.forEach((component, index) => {
    if (component === null || typeof component !== "object" || Array.isArray(component)) {
      issues.push(`${prefix}_${index}_must_be_an_object`);
      return;
    }
    const candidate = component as Partial<CommissionRevenueExclusion>;
    if (typeof candidate.kind !== "string" || !allowed.includes(candidate.kind)) {
      issues.push(`${prefix}_${index}_kind_not_allowed`);
    }
    if (!wholePositiveCents(candidate.amountCents as number)) {
      issues.push(`${prefix}_${index}_must_be_positive_safe_integer_cents`);
    }
    if (typeof candidate.kind === "string") {
      if (seen.has(candidate.kind)) issues.push(`${prefix}_${index}_duplicate_kind`);
      seen.add(candidate.kind);
    }
    if (candidate.authorityReference !== null && typeof candidate.authorityReference !== "string") {
      issues.push(`${prefix}_${index}_authority_reference_invalid`);
    }
    if (
      candidate.kind === "other_written_exclusion" &&
      (typeof candidate.authorityReference !== "string" ||
        candidate.authorityReference.trim().length === 0)
    ) issues.push(`${prefix}_${index}_requires_written_authority`);
  });
  return issues;
}

export function validateCommissionRevenueBreakdown(
  breakdown: CommissionRevenueBreakdown,
): readonly string[] {
  const issues: string[] = [];
  if (breakdown === null || typeof breakdown !== "object") {
    return ["revenue_breakdown_must_be_an_object"];
  }
  if (!wholeNonnegativeCents(breakdown.grossEligibleProductChannelCents)) {
    issues.push("gross_eligible_product_channel_must_be_nonnegative_safe_integer_cents");
  }
  if (!wholeNonnegativeCents(breakdown.eligibleProductChannelCollectedCents)) {
    issues.push("eligible_product_channel_collected_must_be_nonnegative_safe_integer_cents");
  }
  if (!wholeNonnegativeCents(breakdown.settlementAmountCents)) {
    issues.push("settlement_amount_must_be_nonnegative_safe_integer_cents");
  }
  if (!Array.isArray(breakdown.preCollectionAdjustments)) {
    issues.push("pre_collection_adjustments_must_be_an_array");
  }
  if (!Array.isArray(breakdown.collectedExclusions)) {
    issues.push("collected_exclusions_must_be_an_array");
  }
  if (issues.length > 0) return issues;

  issues.push(...validateUniqueComponents(
    breakdown.preCollectionAdjustments,
    COMMISSION_PRE_COLLECTION_ADJUSTMENT_KINDS,
    "pre_collection_adjustment",
  ));
  issues.push(...validateUniqueComponents(
    breakdown.collectedExclusions,
    COMMISSION_COLLECTED_EXCLUSION_KINDS,
    "collected_exclusion",
  ));
  if (issues.length > 0) return issues;

  const adjustmentTotal = safeCentsSum(breakdown.preCollectionAdjustments.map((item) => item.amountCents));
  const collectedExclusionTotal = safeCentsSum(breakdown.collectedExclusions.map((item) => item.amountCents));
  if (adjustmentTotal === null || collectedExclusionTotal === null) {
    issues.push("revenue_component_sum_exceeds_safe_integer_cents");
    return issues;
  }
  if (
    BigInt(breakdown.grossEligibleProductChannelCents) - BigInt(adjustmentTotal) !==
      BigInt(breakdown.eligibleProductChannelCollectedCents)
  ) issues.push("pre_collection_adjustments_do_not_reconcile_to_eligible_collected_cash");
  if (
    BigInt(breakdown.eligibleProductChannelCollectedCents) + BigInt(collectedExclusionTotal) !==
      BigInt(breakdown.settlementAmountCents)
  ) issues.push("collected_cash_components_do_not_equal_settlement_amount");
  return issues;
}

export function eligibleNetCollectedRevenueCents(
  breakdown: CommissionRevenueBreakdown,
): number {
  return breakdown.eligibleProductChannelCollectedCents;
}

export function validateCommissionReversalAllocation(
  allocation: CommissionReversalAllocation,
  adjustmentAmountCents: number,
): readonly string[] {
  const issues: string[] = [];
  if (allocation === null || typeof allocation !== "object") {
    return ["reversal_allocation_must_be_an_object"];
  }
  if (typeof allocation.allocationReference !== "string" || allocation.allocationReference.trim().length < 3) {
    issues.push("reversal_allocation_reference_required");
  }
  if (
    typeof allocation.originalRevenueSnapshotHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(allocation.originalRevenueSnapshotHash)
  ) issues.push("reversal_original_revenue_snapshot_hash_invalid");
  if (!wholeNonnegativeCents(allocation.eligibleBasisReductionCents)) {
    issues.push("reversal_eligible_basis_reduction_must_be_nonnegative_safe_integer_cents");
  }
  if (!wholePositiveCents(adjustmentAmountCents)) {
    issues.push("reversal_adjustment_must_be_positive_safe_integer_cents");
  }
  if (!Array.isArray(allocation.components) || allocation.components.length === 0) {
    issues.push("reversal_allocation_components_required");
    return issues;
  }
  const seen = new Set<string>();
  allocation.components.forEach((component, index) => {
    if (component === null || typeof component !== "object" || Array.isArray(component)) {
      issues.push(`reversal_component_${index}_must_be_an_object`);
      return;
    }
    const candidate = component as Partial<(typeof allocation.components)[number]>;
    if (
      typeof candidate.kind !== "string" ||
      !(COMMISSION_REVERSAL_ALLOCATION_KINDS as readonly string[]).includes(candidate.kind)
    ) {
      issues.push(`reversal_component_${index}_kind_not_allowed`);
    }
    if (!wholePositiveCents(candidate.amountCents as number)) {
      issues.push(`reversal_component_${index}_must_be_positive_safe_integer_cents`);
    }
    if (typeof candidate.kind === "string") {
      if (seen.has(candidate.kind)) issues.push(`reversal_component_${index}_duplicate_kind`);
      seen.add(candidate.kind);
    }
    if (candidate.authorityReference !== null && typeof candidate.authorityReference !== "string") {
      issues.push(`reversal_component_${index}_authority_reference_invalid`);
    }
    if (
      candidate.kind === "other_written_exclusion" &&
      (typeof candidate.authorityReference !== "string" ||
        candidate.authorityReference.trim().length === 0)
    ) issues.push(`reversal_component_${index}_requires_written_authority`);
  });
  if (issues.length > 0) return issues;
  const total = safeCentsSum(allocation.components.map((component) => component.amountCents));
  const eligible = allocation.components.find((component) => component.kind === "eligible_product_channel")
    ?.amountCents ?? 0;
  if (total === null) issues.push("reversal_component_sum_exceeds_safe_integer_cents");
  else if (total !== adjustmentAmountCents) issues.push("reversal_components_do_not_equal_adjustment_amount");
  if (eligible !== allocation.eligibleBasisReductionCents) {
    issues.push("reversal_eligible_component_does_not_equal_basis_reduction");
  }
  return issues;
}

function roundedDownCommissionCents(basisCents: number, rateBasisPoints: number): number {
  const result = (BigInt(basisCents) * BigInt(rateBasisPoints)) / 10_000n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Commission result exceeds safe integer cents.");
  }
  return Number(result);
}

function commissionForPolicy(
  policy: CommissionRatePolicy,
  basisCents: number,
): CommissionCalculation {
  if (!wholeNonnegativeCents(basisCents)) {
    throw new Error("Commission basis must be non-negative integer cents.");
  }
  if (policy.kind === "flat") {
    const commissionCents = roundedDownCommissionCents(basisCents, policy.rateBasisPoints);
    return {
      eligibleBasisCents: basisCents,
      commissionCents,
      components: Object.freeze([
        Object.freeze({ basisCents, rateBasisPoints: policy.rateBasisPoints, commissionCents }),
      ]),
    };
  }

  let remaining = basisCents;
  let lowerBound = 0;
  const components: CommissionRateComponent[] = [];
  for (const band of policy.bands) {
    const capacity = band.throughCents === null ? remaining : Math.max(0, band.throughCents - lowerBound);
    const bandBasis = Math.min(remaining, capacity);
    if (bandBasis > 0) {
      components.push(
        Object.freeze({
          basisCents: bandBasis,
          rateBasisPoints: band.rateBasisPoints,
          commissionCents: roundedDownCommissionCents(bandBasis, band.rateBasisPoints),
        }),
      );
      remaining -= bandBasis;
    }
    if (band.throughCents !== null) lowerBound = band.throughCents;
    if (remaining === 0) break;
  }
  if (remaining !== 0) throw new Error("Commission rate policy does not cover the full basis.");
  return {
    eligibleBasisCents: basisCents,
    commissionCents: components.reduce((sum, component) => sum + component.commissionCents, 0),
    components: Object.freeze(components),
  };
}

export function totalCommissionForBasis(
  schedule: CommissionScheduleDefinition,
  basisCents: number,
  mode: "initial_term" | "post_term_tail" = "initial_term",
): CommissionCalculation {
  const policy = mode === "post_term_tail" ? schedule.postTermTailRatePolicy : schedule.ratePolicy;
  if (policy === null) throw new Error(`Schedule ${schedule.programId} has no post-term tail rate.`);
  return commissionForPolicy(policy, basisCents);
}

export function incrementalCommissionForBasis(
  schedule: CommissionScheduleDefinition,
  priorPeriodBasisCents: number,
  addedBasisCents: number,
  mode: "initial_term" | "post_term_tail" = "initial_term",
): CommissionCalculation {
  if (!wholeNonnegativeCents(priorPeriodBasisCents) || !wholeNonnegativeCents(addedBasisCents)) {
    throw new Error("Prior and added commission bases must be non-negative integer cents.");
  }
  if (BigInt(priorPeriodBasisCents) + BigInt(addedBasisCents) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Cumulative commission basis exceeds safe integer cents.");
  }
  const before = totalCommissionForBasis(schedule, priorPeriodBasisCents, mode);
  const after = totalCommissionForBasis(schedule, priorPeriodBasisCents + addedBasisCents, mode);
  return {
    eligibleBasisCents: addedBasisCents,
    commissionCents: after.commissionCents - before.commissionCents,
    components: Object.freeze(
      after.components.map((component, index) => {
        const priorComponent = before.components[index];
        const prior = priorComponent?.basisCents ?? 0;
        const basisCents = Math.max(0, component.basisCents - prior);
        return Object.freeze({
          basisCents,
          rateBasisPoints: component.rateBasisPoints,
          // Preserve the policy's cumulative round-down result. Calculating the
          // delta independently can lose a cent when two events share a band.
          commissionCents: component.commissionCents - (priorComponent?.commissionCents ?? 0),
        });
      }).filter((component) => component.basisCents > 0),
    ),
  };
}

export function commissionPeriodWindow(
  schedule: CommissionScheduleDefinition,
  bindingEffectiveAt: string,
  occurredAt: string,
): CommissionPeriodWindow | null {
  const anchor = Date.parse(bindingEffectiveAt);
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(anchor) || !Number.isFinite(occurred) || occurred < anchor) return null;
  const duration = schedule.measurementPeriod.days * DAY_MS;
  const index = Math.floor((occurred - anchor) / duration);
  const startsAt = anchor + index * duration;
  return Object.freeze({
    index,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + duration).toISOString(),
  });
}

export function initialProgramTermEndsAt(
  schedule: CommissionScheduleDefinition,
  bindingEffectiveAt: string,
): string | null {
  const anchor = Date.parse(bindingEffectiveAt);
  if (!Number.isFinite(anchor)) return null;
  return new Date(anchor + schedule.initialTermDays * DAY_MS).toISOString();
}

export function customerAttributionEndsAt(
  schedule: CommissionScheduleDefinition,
  firstEligibleTransactionAt: string,
): string | null {
  const months = schedule.customerAttribution.durationMonths;
  const start = new Date(firstEligibleTransactionAt);
  if (months === null || !Number.isFinite(start.getTime())) return null;
  const originalDay = start.getUTCDate();
  const end = new Date(start.getTime());
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(originalDay, lastDay));
  return end.toISOString();
}
