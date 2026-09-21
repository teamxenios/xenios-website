import { describe, expect, it } from "vitest";
import {
  SETH_OPERATING_ADVISOR_SCHEDULE,
  STANDARD_REPRESENTATIVE_SCHEDULE,
} from "@shared/research/commission-schedules";
import type { PartnerState } from "@shared/research/distribution";
import {
  commissionStateTransitionAllowed,
  commissionRevenueSnapshotHash,
  createCommissionLedgerService,
  createInMemoryCommissionLedgerRepository,
  type CanonicalCommissionAccrualFact,
  type CanonicalCommissionReversalFact,
} from "./ledger";
import {
  createCommissionScheduleAuthority,
  createInMemoryCommissionProgramBindingRepository,
  type CommissionProgramBinding,
} from "./authority";
import { createCommissionScheduleSnapshot } from "./hash";

const SETH_START = "2026-09-02T00:00:00.000Z";
const STANDARD_START = "2026-09-15T00:00:00.000Z";
const PARTNER_ID = "10000000-0000-4000-8000-000000000001";
const CANONICAL_ORDER_ID = "30000000-0000-4000-8000-000000000001";

function binding(
  program: "seth" | "standard",
  partnerId = PARTNER_ID,
): CommissionProgramBinding {
  const schedule = program === "seth"
    ? SETH_OPERATING_ADVISOR_SCHEDULE
    : STANDARD_REPRESENTATIVE_SCHEDULE;
  return {
    bindingId: program === "seth"
      ? "20000000-0000-4000-8000-000000000001"
      : "20000000-0000-4000-8000-000000000002",
    partnerId,
    programId: schedule.programId,
    scheduleVersion: schedule.version,
    scheduleHash: createCommissionScheduleSnapshot(schedule).scheduleHash,
    effectiveAt: program === "seth" ? SETH_START : STANDARD_START,
    terminatedAt: null,
    authorityReference: `signed:${program}:v1`,
    recordedAt: "2026-09-21T00:00:00.000Z",
  };
}

function setup(program: "seth" | "standard", initialState: PartnerState = "active") {
  let state = initialState;
  const repository = createInMemoryCommissionLedgerRepository();
  const accrualFacts = new Map<string, CanonicalCommissionAccrualFact>();
  const reversalFacts = new Map<string, CanonicalCommissionReversalFact>();
  const authority = createCommissionScheduleAuthority({
    bindings: createInMemoryCommissionProgramBindingRepository([binding(program)]),
    partners: { async getPartnerStateAt() { return state; } },
  });
  const domainService = createCommissionLedgerService({
    authority,
    repository,
    facts: {
      async loadAccrualFact(orderId) {
        return accrualFacts.get(orderId) ?? null;
      },
      async loadReversalFact(orderId, adjustmentSettlementRef) {
        return reversalFacts.get(`${orderId}:${adjustmentSettlementRef}`) ?? null;
      },
    },
  });
  return {
    // Tests seed the trusted adapter directly. Production has no such adapter
    // yet and therefore cannot mount this service accidentally.
    service: {
      async accrue(fact: CanonicalCommissionAccrualFact) {
        accrualFacts.set(fact.orderId, fact);
        return domainService.accrue({ orderId: fact.orderId });
      },
      async reverse(fact: CanonicalCommissionReversalFact) {
        reversalFacts.set(`${fact.orderId}:${fact.adjustment.settlementRef}`, fact);
        return domainService.reverse({
          orderId: fact.orderId,
          adjustmentSettlementRef: fact.adjustment.settlementRef,
        });
      },
    },
    domainService,
    repository,
    setState(next: PartnerState) { state = next; },
  };
}

function accrualInput(input: Readonly<{
  program: "seth" | "standard";
  settlementRef: string;
  amountCents: number;
  settledAt?: string;
  lane?: "product_channel" | "care_clinical";
  careExclusionCents?: number;
}>) {
  const settledAt = input.settledAt ?? (input.program === "seth" ? SETH_START : STANDARD_START);
  const care = input.careExclusionCents ?? 0;
  return {
    partnerId: PARTNER_ID,
    orderId: `order-${input.settlementRef}`,
    canonicalOrderId: CANONICAL_ORDER_ID,
    settlement: {
      settlementRef: input.settlementRef,
      externalTransactionRef: `external-${input.settlementRef}`,
      amountCents: input.amountCents,
      currency: "USD" as const,
      settledAt,
    },
    revenueLane: input.lane ?? "product_channel" as const,
    revenue: {
      grossEligibleProductChannelCents: input.amountCents - care,
      preCollectionAdjustments: [],
      eligibleProductChannelCollectedCents: input.amountCents - care,
      collectedExclusions: care === 0 ? [] : [{
        kind: "care_clinical_charge" as const,
        amountCents: care,
        authorityReference: null,
      }],
      settlementAmountCents: input.amountCents,
    },
    attribution: {
      customerBindingKey: "auth:10000000-0000-4000-8000-000000000099",
      acceptedRelationshipReference: "accepted-customer:1",
      firstEligibleTransactionAt: input.program === "seth" ? SETH_START : STANDARD_START,
      activeManagementConfirmed: true,
    },
    priceAuthorityReference: "catalog-price:v1",
  };
}

function adjustment(
  original: ReturnType<typeof accrualInput>,
  kind: "refund" | "chargeback",
  amountCents: number,
  suffix: string,
  allocationComponents: readonly Readonly<{
    kind: "eligible_product_channel" | "tax" | "shipping_pass_through" | "care_clinical_charge";
    amountCents: number;
    authorityReference: string | null;
  }>[] = [{ kind: "eligible_product_channel", amountCents, authorityReference: null }],
) {
  const eligibleBasisReductionCents = allocationComponents
    .filter((component) => component.kind === "eligible_product_channel")
    .reduce((sum, component) => sum + component.amountCents, 0);
  return {
    orderId: original.orderId,
    originalSettlementRef: original.settlement.settlementRef,
    kind,
    adjustment: {
      settlementRef: `${kind}-${suffix}`,
      externalTransactionRef: `${kind}-external-${suffix}`,
      amountCents,
      currency: "USD" as const,
      settledAt: "2026-10-01T00:00:00.000Z",
    },
    allocation: {
      allocationReference: `allocation:${kind}:${suffix}`,
      originalRevenueSnapshotHash: commissionRevenueSnapshotHash(original.revenue),
      eligibleBasisReductionCents,
      components: allocationComponents,
    },
    authorityReference: `commerce:${kind}:${suffix}`,
  };
}

describe("program commission order and period ledgers", () => {
  it("accepts only identifiers and fails closed without a canonical server projection", async () => {
    const { domainService, repository } = setup("standard");
    expect(await domainService.accrue({ orderId: "unknown-order" }))
      .toEqual({ ok: false, code: "invalid_request" });
    expect(await domainService.reverse({
      orderId: "unknown-order",
      adjustmentSettlementRef: "unknown-adjustment",
    })).toEqual({ ok: false, code: "invalid_request" });
    expect(await repository.listEntries()).toEqual([]);
  });

  it("splits Seth's marginal rate across orders and resets it at the next 30-day period", async () => {
    const { service, repository } = setup("seth");
    const first = await service.accrue(accrualInput({
      program: "seth", settlementRef: "seth-49k", amountCents: 4_900_000,
    }));
    const second = await service.accrue(accrualInput({
      program: "seth", settlementRef: "seth-2k", amountCents: 200_000,
      settledAt: "2026-09-03T00:00:00.000Z",
    }));
    const nextPeriod = await service.accrue(accrualInput({
      program: "seth", settlementRef: "seth-next", amountCents: 100_000,
      settledAt: "2026-10-02T00:00:00.000Z",
    }));

    expect(first.ok && first.entry.commissionDeltaCents).toBe(1_225_000);
    expect(second.ok && second.entry.commissionDeltaCents).toBe(55_000);
    expect(nextPeriod.ok && nextPeriod.entry.commissionDeltaCents).toBe(25_000);
    expect((await repository.listPeriodEvents()).map((event) => event.period.index)).toEqual([0, 0, 1]);
  });

  it("reverses standard commissions for partial refunds and chargebacks without mutation", async () => {
    const { service, repository } = setup("standard");
    const original = accrualInput({ program: "standard", settlementRef: "std-sale", amountCents: 100_000 });
    const earned = await service.accrue(original);
    const refund = adjustment(original, "refund", 25_000, "one");
    const refunded = await service.reverse(refund);
    const refundReplay = await service.reverse(refund);
    const chargedBack = await service.reverse(adjustment(original, "chargeback", 75_000, "two"));

    expect(earned.ok && earned.entry.commissionDeltaCents).toBe(20_000);
    expect(refunded.ok && refunded.entry.commissionDeltaCents).toBe(-5_000);
    expect(refundReplay.ok && refundReplay.replayed).toBe(true);
    expect(refundReplay.ok && refunded.ok && refundReplay.entry.entryId)
      .toBe(refunded.ok && refunded.entry.entryId);
    expect(chargedBack.ok && chargedBack.entry.commissionDeltaCents).toBe(-15_000);
    const events = await repository.listPeriodEvents();
    expect(events.at(-1)).toMatchObject({
      cumulativeEligibleBasisCents: 0,
      cumulativeCommissionCents: 0,
    });
    expect(await repository.listEntries()).toHaveLength(3);
  });

  it("re-reads outstanding order basis when distinct refund events race", async () => {
    const { service, repository } = setup("standard");
    const original = accrualInput({
      program: "standard", settlementRef: "racing-refunds", amountCents: 100_000,
    });
    expect((await service.accrue(original)).ok).toBe(true);
    const [left, right] = await Promise.all([
      service.reverse(adjustment(original, "refund", 80_000, "race-left")),
      service.reverse(adjustment(original, "refund", 80_000, "race-right")),
    ]);
    expect([left.ok, right.ok].filter(Boolean)).toHaveLength(1);
    const accepted = left.ok ? left : right;
    const denied = left.ok ? right : left;
    expect(accepted.ok && accepted.entry.eligibleBasisDeltaCents).toBe(-80_000);
    expect(denied).toEqual({ ok: false, code: "reversal_exceeds_outstanding_basis" });
    expect((await repository.listPeriodEvents()).at(-1)).toMatchObject({
      cumulativeEligibleBasisCents: 20_000,
      cumulativeCommissionCents: 4_000,
    });
  });

  it("uses canonical refund allocation and never reverses tax-only cash", async () => {
    const { service, repository } = setup("standard");
    const original = accrualInput({
      program: "standard", settlementRef: "allocated-refund", amountCents: 110_000,
    });
    original.revenue.grossEligibleProductChannelCents = 100_000;
    original.revenue.eligibleProductChannelCollectedCents = 100_000;
    original.revenue.collectedExclusions = [{
      kind: "tax", amountCents: 10_000, authorityReference: null,
    }];
    expect((await service.accrue(original)).ok).toBe(true);

    const taxOnly = await service.reverse(adjustment(
      original,
      "refund",
      5_000,
      "tax-only",
      [{ kind: "tax", amountCents: 5_000, authorityReference: null }],
    ));
    expect(taxOnly).toEqual({ ok: false, code: "no_eligible_basis_reduction" });

    const mixed = await service.reverse(adjustment(
      original,
      "refund",
      11_000,
      "mixed",
      [
        { kind: "eligible_product_channel", amountCents: 10_000, authorityReference: null },
        { kind: "tax", amountCents: 1_000, authorityReference: null },
      ],
    ));
    expect(mixed.ok && mixed.entry).toMatchObject({
      eligibleBasisDeltaCents: -10_000,
      commissionDeltaCents: -2_000,
    });
    expect((await repository.listEntries()).map((entry) => entry.eventKind))
      .toEqual(["accrual", "refund_reversal"]);
  });

  it("replays the same settlement exactly once and rejects changed payloads under its key", async () => {
    const { service, repository } = setup("standard");
    const input = accrualInput({ program: "standard", settlementRef: "replay", amountCents: 50_000 });
    const first = await service.accrue(input);
    const replay = await service.accrue(input);
    const conflict = await service.accrue({
      ...input,
      priceAuthorityReference: "different-price-authority",
    });

    expect(first.ok && first.replayed).toBe(false);
    expect(replay.ok && replay.replayed).toBe(true);
    expect(replay.ok && first.ok && replay.entry.entryId).toBe(first.ok && first.entry.entryId);
    expect(conflict).toEqual({ ok: false, code: "idempotency_conflict" });
    expect(await repository.listEntries()).toHaveLength(1);
  });

  it("refuses to append a period event behind a later money occurrence", async () => {
    const { service, repository } = setup("standard");
    expect((await service.accrue(accrualInput({
      program: "standard",
      settlementRef: "ordered-first",
      amountCents: 10_000,
      settledAt: "2026-09-16T00:00:00.000Z",
    }))).ok).toBe(true);
    expect((await service.accrue(accrualInput({
      program: "standard",
      settlementRef: "ordered-second",
      amountCents: 10_000,
      settledAt: "2026-09-20T00:00:00.000Z",
    }))).ok).toBe(true);
    expect(await service.accrue(accrualInput({
      program: "standard",
      settlementRef: "late-arriving-earlier-event",
      amountCents: 10_000,
      settledAt: "2026-09-18T00:00:00.000Z",
    }))).toEqual({ ok: false, code: "period_contention" });
    expect(await repository.listEntries()).toHaveLength(2);
  });

  it.each<PartnerState>(["quality_review", "suspended", "terminated"])(
    "fails closed when the canonical partner state is %s",
    async (state) => {
      const { service, repository } = setup("standard", state);
      expect(await service.accrue(accrualInput({
        program: "standard", settlementRef: `inactive-${state}`, amountCents: 10_000,
      }))).toEqual({ ok: false, code: "partner_not_active" });
      expect(await repository.listEntries()).toEqual([]);
    },
  );

  it("denies Care as a lane and deducts a server-classified Care portion from a mixed settlement", async () => {
    const { service } = setup("standard");
    expect(await service.accrue(accrualInput({
      program: "standard", settlementRef: "care", amountCents: 100_000, lane: "care_clinical",
    }))).toEqual({ ok: false, code: "care_revenue_excluded" });

    const mixed = await service.accrue(accrualInput({
      program: "standard", settlementRef: "mixed", amountCents: 100_000, careExclusionCents: 40_000,
    }));
    expect(mixed.ok && mixed.entry).toMatchObject({
      eligibleBasisDeltaCents: 60_000,
      commissionDeltaCents: 12_000,
    });
  });

  it("uses the immutable historical snapshot for a later reversal even after partner deactivation", async () => {
    const { service, setState } = setup("seth");
    const original = accrualInput({ program: "seth", settlementRef: "history", amountCents: 6_000_000 });
    const earned = await service.accrue(original);
    expect(earned.ok).toBe(true);
    setState("terminated");
    const reversed = await service.reverse(adjustment(original, "refund", 1_000_000, "history"));
    expect(reversed.ok).toBe(true);
    if (!earned.ok || !reversed.ok) throw new Error("expected ledger success");
    expect(reversed.entry.scheduleHash).toBe(earned.entry.scheduleHash);
    expect(reversed.entry.scheduleVersion).toBe(earned.entry.scheduleVersion);
    expect(reversed.entry.scheduleSnapshot).toEqual(earned.entry.scheduleSnapshot);
    expect(reversed.entry.commissionDeltaCents).toBe(-300_000);
  });

  it("ends the standard program at the exclusive 90-day boundary and preserves Seth's 25% tail", async () => {
    const standard = setup("standard").service;
    const ended = await standard.accrue(accrualInput({
      program: "standard",
      settlementRef: "day-90",
      amountCents: 10_000,
      settledAt: "2026-12-14T00:00:00.000Z",
    }));
    expect(ended).toEqual({ ok: false, code: "program_term_ended" });

    const seth = setup("seth").service;
    const tail = await seth.accrue(accrualInput({
      program: "seth",
      settlementRef: "seth-tail",
      amountCents: 6_000_000,
      settledAt: "2026-12-01T00:00:00.000Z",
    }));
    expect(tail.ok && tail.entry).toMatchObject({
      termMode: "post_term_tail",
      commissionDeltaCents: 1_500_000,
    });
  });

  it("ends Seth customer attribution at the exclusive 12-month boundary", async () => {
    const beforeBoundary = await setup("seth").service.accrue(accrualInput({
      program: "seth",
      settlementRef: "seth-month-12-minus-one-day",
      amountCents: 10_000,
      settledAt: "2027-09-01T23:59:59.999Z",
    }));
    expect(beforeBoundary.ok && beforeBoundary.entry).toMatchObject({
      termMode: "post_term_tail",
      commissionDeltaCents: 2_500,
    });

    const atBoundary = await setup("seth").service.accrue(accrualInput({
      program: "seth",
      settlementRef: "seth-month-12-boundary",
      amountCents: 10_000,
      settledAt: "2027-09-02T00:00:00.000Z",
    }));
    expect(atBoundary).toEqual({ ok: false, code: "attribution_window_expired" });
  });

  it("requires payment evidence for the paid state and forbids leaving reversed", () => {
    expect(commissionStateTransitionAllowed("payable", "paid", null)).toBe(false);
    expect(commissionStateTransitionAllowed("payable", "paid", "payout:bank:1")).toBe(true);
    expect(commissionStateTransitionAllowed("reversed", "approved", "payout:bank:1")).toBe(false);
  });
});
