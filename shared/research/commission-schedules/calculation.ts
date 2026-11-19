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

const V2_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const V2_SHA256 = /^[0-9a-f]{64}$/;

function v2Record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function v2Keys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && keys.every(key => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    return field !== undefined && "value" in field && field.enumerable === true;
  });
}

function v2Reference(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 512
    && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function v2Uuid(value: unknown): value is string {
  return typeof value === "string" && V2_UUID.test(value);
}

/** STRUCTURAL ONLY. First validates unchanged V1 full cash, then a separate
 * earned/unearned partition. Success cannot attest actual line/release/order
 * ownership, proof, allocation authenticity or current balances/CAS. It never
 * calculates rates, clamps a refund or creates a money/commission record. */
export function validateCommissionReversalAllocationV2(
  value: unknown,
  adjustmentAmountCents: number,
): readonly string[] {
  if (!v2Record(value) || !v2Keys(value, ["schemaVersion", "cashAllocation", "earnedPartition"])) {
    return ["reversal_v2_shape_invalid"];
  }
  if (value.schemaVersion !== 2) return ["reversal_v2_schema_version_must_be_2"];
  const cash = value.cashAllocation;
  if (!v2Record(cash) || !v2Keys(cash, [
    "allocationReference", "originalRevenueSnapshotHash", "eligibleBasisReductionCents", "components",
  ])) {
    return ["reversal_v2_cash_shape_invalid"];
  }
  // Reject mixed fields/accessors/sparse components before calling V1. Its
  // existing semantics and error codes are deliberately not changed.
  if (Array.isArray(cash.components)) {
    for (const component of cash.components) {
      if (!v2Record(component) || !v2Keys(component, ["kind", "amountCents", "authorityReference"])) {
        return ["reversal_v2_cash_component_shape_invalid"];
      }
    }
  }
  const cashIssues = validateCommissionReversalAllocation(
    cash as unknown as CommissionReversalAllocation,
    adjustmentAmountCents,
  );
  if (cashIssues.length > 0) return cashIssues;
  const partition = value.earnedPartition;
  if (!v2Record(partition) || !v2Keys(partition, [
    "authorityReference", "allocationReference", "allocationVersion", "anchorEntryId",
    "releaseHistorySnapshotHash", "earnedBasisReductionCents", "unearnedEligibleCashReductionCents", "lines",
  ])) {
    return ["reversal_v2_partition_shape_invalid"];
  }
  const issues: string[] = [];
  if (!v2Reference(partition.authorityReference) || !v2Reference(partition.allocationReference)) {
    issues.push("reversal_v2_partition_reference_invalid");
  }
  if (typeof partition.allocationVersion !== "number" || !Number.isSafeInteger(partition.allocationVersion)
    || partition.allocationVersion < 1) issues.push("reversal_v2_allocation_version_invalid");
  if (!v2Uuid(partition.anchorEntryId)) issues.push("reversal_v2_anchor_id_invalid");
  if (typeof partition.releaseHistorySnapshotHash !== "string" || !V2_SHA256.test(partition.releaseHistorySnapshotHash)) {
    issues.push("reversal_v2_release_history_hash_invalid");
  }
  if (!wholeNonnegativeCents(partition.earnedBasisReductionCents as number)
    || !wholeNonnegativeCents(partition.unearnedEligibleCashReductionCents as number)) {
    issues.push("reversal_v2_partition_totals_invalid");
  }
  if (!Array.isArray(partition.lines)) return [...issues, "reversal_v2_lines_must_be_an_array"];
  const lineIds = new Set<string>();
  const cashValues: number[] = [];
  const earnedValues: number[] = [];
  const unearnedValues: number[] = [];
  for (const [index, line] of partition.lines.entries()) {
    if (!v2Record(line) || !v2Keys(line, [
      "canonicalOrderLineId", "eligibleCashRefundCents", "earnedBasisReductionCents",
      "unearnedEligibleCashReductionCents", "sourceReleaseEntryIds",
    ])) {
      issues.push(`reversal_v2_line_${index}_shape_invalid`);
      continue;
    }
    if (!v2Uuid(line.canonicalOrderLineId)) issues.push(`reversal_v2_line_${index}_id_invalid`);
    else {
      const identity = line.canonicalOrderLineId.toLowerCase();
      if (lineIds.has(identity)) issues.push(`reversal_v2_line_${index}_duplicate_id`);
      lineIds.add(identity);
    }
    const amountsValid = wholePositiveCents(line.eligibleCashRefundCents as number)
      && wholeNonnegativeCents(line.earnedBasisReductionCents as number)
      && wholeNonnegativeCents(line.unearnedEligibleCashReductionCents as number);
    if (!amountsValid) issues.push(`reversal_v2_line_${index}_amounts_invalid`);
    else {
      const eligible = line.eligibleCashRefundCents as number;
      const earned = line.earnedBasisReductionCents as number;
      const unearned = line.unearnedEligibleCashReductionCents as number;
      const sum = BigInt(earned) + BigInt(unearned);
      if (sum > BigInt(Number.MAX_SAFE_INTEGER)) issues.push(`reversal_v2_line_${index}_partition_overflow`);
      if (sum !== BigInt(eligible)) issues.push(`reversal_v2_line_${index}_partition_mismatch`);
      cashValues.push(eligible);
      earnedValues.push(earned);
      unearnedValues.push(unearned);
    }
    if (!Array.isArray(line.sourceReleaseEntryIds)) issues.push(`reversal_v2_line_${index}_release_ids_invalid`);
    else {
      const releases = new Set<string>();
      for (const id of line.sourceReleaseEntryIds) {
        if (!v2Uuid(id)) issues.push(`reversal_v2_line_${index}_release_id_invalid`);
        else {
          const identity = id.toLowerCase();
          if (releases.has(identity)) issues.push(`reversal_v2_line_${index}_duplicate_release_id`);
          releases.add(identity);
        }
      }
      const hasSources = line.sourceReleaseEntryIds.length > 0;
      const needsSources = (line.earnedBasisReductionCents as number) > 0;
      if (amountsValid && (needsSources !== hasSources)) {
        issues.push(`reversal_v2_line_${index}_release_ids_do_not_match_earned_partition`);
      }
    }
  }
  if (issues.length > 0) return issues;
  const cashTotal = safeCentsSum(cashValues);
  const earnedTotal = safeCentsSum(earnedValues);
  const unearnedTotal = safeCentsSum(unearnedValues);
  const earned = partition.earnedBasisReductionCents as number;
  const unearned = partition.unearnedEligibleCashReductionCents as number;
  const globalSum = BigInt(earned) + BigInt(unearned);
  if (cashTotal === null || earnedTotal === null || unearnedTotal === null || globalSum > BigInt(Number.MAX_SAFE_INTEGER)) {
    return ["reversal_v2_partition_sum_overflow"];
  }
  if (cashTotal !== cash.eligibleBasisReductionCents || globalSum !== BigInt(cash.eligibleBasisReductionCents as number)) {
    issues.push("reversal_v2_cash_partition_mismatch");
  }
  if (earnedTotal !== earned || unearnedTotal !== unearned) issues.push("reversal_v2_line_totals_mismatch");
  return issues;
}

/** Version/shape/reference checks only; this is not a canonical fact loader or
 * authority grant. Existing V1 facts/rows are not implicitly accepted as V2. */
export function validateCommissionReversalFactV2(value: unknown): readonly string[] {
  if (!v2Record(value) || !v2Keys(value, [
    "factVersion", "orderId", "canonicalOrderId", "originalSettlementRef", "kind", "adjustment", "authorityReference", "allocationV2",
  ])) {
    return ["reversal_fact_v2_shape_invalid"];
  }
  if (value.factVersion !== 2) return ["reversal_fact_v2_version_must_be_2"];
  const issues: string[] = [];
  if (!v2Reference(value.orderId) || !v2Reference(value.originalSettlementRef) || !v2Reference(value.authorityReference)) {
    issues.push("reversal_fact_v2_reference_invalid");
  }
  if (!v2Uuid(value.canonicalOrderId)) issues.push("reversal_fact_v2_order_id_invalid");
  if (value.kind !== "refund" && value.kind !== "chargeback") issues.push("reversal_fact_v2_kind_invalid");
  const adjustment = value.adjustment;
  if (!v2Record(adjustment) || !v2Keys(adjustment, [
    "settlementRef", "externalTransactionRef", "amountCents", "currency", "settledAt",
  ])) {
    return [...issues, "reversal_fact_v2_adjustment_shape_invalid"];
  }
  if (!v2Reference(adjustment.settlementRef) || !v2Reference(adjustment.externalTransactionRef)) {
    issues.push("reversal_fact_v2_adjustment_reference_invalid");
  }
  if (adjustment.settlementRef === value.originalSettlementRef) {
    issues.push("reversal_fact_v2_adjustment_reuses_original_reference");
  }
  if (adjustment.currency !== "USD") issues.push("reversal_fact_v2_currency_invalid");
  const instant = adjustment.settledAt;
  if (typeof instant !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(instant)
    || !Number.isFinite(Date.parse(instant)) || new Date(instant).toISOString() !== instant) issues.push("reversal_fact_v2_instant_invalid");
  issues.push(...validateCommissionReversalAllocationV2(value.allocationV2, adjustment.amountCents as number));
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
