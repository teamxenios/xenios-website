import type {
  CommissionCalculation,
  CommissionPeriodWindow,
  CommissionRateComponent,
  CommissionRatePolicy,
  CommissionRevenueBreakdown,
  CommissionScheduleDefinition,
} from "./contract";

const DAY_MS = 24 * 60 * 60 * 1_000;

function wholeNonnegativeCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateCommissionRevenueBreakdown(
  breakdown: CommissionRevenueBreakdown,
): readonly string[] {
  const issues: string[] = [];
  if (!wholeNonnegativeCents(breakdown.grossProductChannelRevenueCents)) {
    issues.push("gross_product_channel_revenue_must_be_nonnegative_integer_cents");
  }
  breakdown.exclusions.forEach((exclusion, index) => {
    if (!wholeNonnegativeCents(exclusion.amountCents)) {
      issues.push(`exclusion_${index}_must_be_nonnegative_integer_cents`);
    }
    if (
      exclusion.kind === "other_written_exclusion" &&
      (exclusion.authorityReference === null || exclusion.authorityReference.trim().length === 0)
    ) {
      issues.push(`exclusion_${index}_requires_written_authority`);
    }
  });
  return issues;
}

export function eligibleNetCollectedRevenueCents(
  breakdown: CommissionRevenueBreakdown,
): number {
  const exclusions = breakdown.exclusions.reduce(
    (sum, item) => sum + BigInt(item.amountCents),
    0n,
  );
  const net = BigInt(breakdown.grossProductChannelRevenueCents) - exclusions;
  return net > 0n ? Number(net) : 0;
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
