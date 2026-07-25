import { describe, expect, it, vi } from "vitest";
import {
  calculateCommission,
  CommissionLedger,
  validateLawrenceModel,
  type CommissionFacts,
  type CommissionPolicy,
  type PayoutProvider,
} from "./commission-engine";
import type { OperationsActor } from "./state-machines";

const NOW = new Date("2026-07-25T16:00:00.000Z");
const system: OperationsActor = { id: "system", role: "system" };
const finance: OperationsActor = { id: "finance", role: "finance" };

const policy: CommissionPolicy = {
  id: "standard-affiliate",
  version: "v3",
  partnerId: null,
  enabledRuleKinds: [
    "percentage",
    "bounty",
    "new_customer_bonus",
    "activation_bounty",
    "campaign_rule",
    "sliding_rate",
  ],
  baseRateBps: 1_000,
  baseBountyCents: 500,
  newCustomerBonusCents: 700,
  activationBountyCents: 900,
  slidingRate: [
    { thresholdCents: 0, rateBps: 1_000 },
    { thresholdCents: 10_000, rateBps: 1_250 },
  ],
  campaigns: [{ campaign: "launch", rateBps: 1_500, bountyCents: 1_000 }],
  rateCeilingBps: 1_750,
  ineligibleProductIds: ["NO-COMMISSION"],
  holdDays: 30,
  effectiveAt: "2026-07-01T00:00:00.000Z",
};

function facts(overrides: Partial<CommissionFacts> = {}): CommissionFacts {
  return {
    orderId: "ord-1",
    attributedPartnerId: "aff-1",
    campaign: "launch",
    items: [
      {
        productId: "ELIGIBLE",
        subtotalCents: 20_000,
        discountCents: 1_000,
        refundCents: 2_000,
        chargebackCents: 0,
        cancelled: false,
        collected: true,
        eligible: true,
      },
      {
        productId: "NO-COMMISSION",
        subtotalCents: 8_000,
        discountCents: 0,
        refundCents: 0,
        chargebackCents: 0,
        cancelled: false,
        collected: true,
        eligible: true,
      },
      {
        productId: "CANCELLED",
        subtotalCents: 4_000,
        discountCents: 0,
        refundCents: 0,
        chargebackCents: 0,
        cancelled: true,
        collected: true,
        eligible: true,
      },
      {
        productId: "UNCOLLECTED",
        subtotalCents: 3_000,
        discountCents: 0,
        refundCents: 0,
        chargebackCents: 0,
        cancelled: false,
        collected: false,
        eligible: true,
      },
    ],
    taxCents: 2_200,
    shippingCents: 900,
    isNewCustomer: true,
    isActivation: true,
    ...overrides,
  };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("server-authoritative commission calculation", () => {
  it("supports percentage, bounty, new-customer, activation, campaign, and sliding rules", () => {
    const result = calculateCommission(facts(), policy);
    expect(result).toEqual({
      eligibleRevenueCents: 17_000,
      excludedCents: 21_100,
      rateBps: 1_500,
      percentageCents: 2_550,
      bountyCents: 1_000,
      newCustomerBonusCents: 700,
      activationBountyCents: 900,
      commissionCents: 5_150,
      policyId: "standard-affiliate",
      policyVersion: "v3",
    });
  });

  it("excludes tax, shipping, discount, refund, chargeback, cancelled items, uncollected amounts, and ineligible products", () => {
    const result = calculateCommission(
      facts({
        campaign: null,
        isNewCustomer: false,
        isActivation: false,
        items: [
          {
            productId: "ELIGIBLE",
            subtotalCents: 10_000,
            discountCents: 1_000,
            refundCents: 2_000,
            chargebackCents: 3_000,
            cancelled: false,
            collected: true,
            eligible: true,
          },
        ],
      }),
      policy,
    );
    expect(result.eligibleRevenueCents).toBe(4_000);
    expect(result.rateBps).toBe(1_000);
    expect(result.percentageCents).toBe(400);
  });

  it("rejects a client override and requires the immutable attribution winner", () => {
    const ledger = new CommissionLedger(new Map([["*", policy]]));
    expect(
      ledger.accrue({
        partnerId: "aff-1",
        attributionPartnerId: "aff-1",
        facts: facts(),
        requestedRateBps: 9_999,
        actor: system,
        idempotencyKey: "override",
        occurredAt: NOW,
      }),
    ).toMatchObject({ ok: false, code: "override_rejected" });
    expect(
      ledger.accrue({
        partnerId: "aff-2",
        attributionPartnerId: "aff-1",
        facts: facts(),
        actor: system,
        idempotencyKey: "wrong-winner",
        occurredAt: NOW,
      }),
    ).toMatchObject({ ok: false, code: "attribution_mismatch" });
  });
});

describe("immutable commission, reversal, and payout ledger", () => {
  function accruedLedger() {
    const ledger = new CommissionLedger(new Map([["*", policy]]));
    const event = unwrap(
      ledger.accrue({
        partnerId: "aff-1",
        attributionPartnerId: "aff-1",
        facts: facts(),
        actor: system,
        idempotencyKey: "accrue-1",
        occurredAt: NOW,
      }),
    );
    return { ledger, event };
  }

  it("accrues one chain per order and absorbs a retry", () => {
    const ledger = new CommissionLedger(new Map([["*", policy]]));
    const command = {
      partnerId: "aff-1",
      attributionPartnerId: "aff-1",
      facts: facts(),
      actor: system,
      idempotencyKey: "accrue-once",
      occurredAt: NOW,
    };
    expect(ledger.accrue(command)).toMatchObject({ ok: true, idempotent: false });
    expect(ledger.accrue(command)).toMatchObject({ ok: true, idempotent: true });
    expect(ledger.list()).toHaveLength(1);
  });

  it("appends pending, approved, payable, and paid events with provider proof", async () => {
    const { ledger, event } = accruedLedger();
    unwrap(
      ledger.transition({
        chainId: event.chainId,
        to: "approved",
        actor: finance,
        idempotencyKey: "approve-1",
        occurredAt: NOW,
      }),
    );
    unwrap(
      ledger.transition({
        chainId: event.chainId,
        to: "payable",
        actor: finance,
        idempotencyKey: "payable-1",
        occurredAt: NOW,
      }),
    );
    const provider: PayoutProvider = {
      pay: vi.fn(async () => ({ ok: true, settled: true, providerReference: "payout-42" })),
    };
    const paid = unwrap(
      await ledger.pay({
        chainId: event.chainId,
        batchId: "batch-1",
        actor: finance,
        provider,
        idempotencyKey: "pay-1",
        occurredAt: NOW,
      }),
    );
    expect(paid).toMatchObject({ state: "paid", providerReference: "payout-42" });
    expect(ledger.list().map((item) => item.kind)).toEqual(["accrued", "approved", "payable", "paid"]);
    expect(ledger.balance("aff-1").paid).toBe(5_150);
  });

  it("does not mark an unsettled payout paid", async () => {
    const { ledger, event } = accruedLedger();
    unwrap(ledger.transition({ chainId: event.chainId, to: "approved", actor: finance, idempotencyKey: "a", occurredAt: NOW }));
    unwrap(ledger.transition({ chainId: event.chainId, to: "payable", actor: finance, idempotencyKey: "b", occurredAt: NOW }));
    const result = await ledger.pay({
      chainId: event.chainId,
      batchId: "batch-1",
      actor: finance,
      provider: { pay: async () => ({ ok: true, settled: false, providerReference: "pending-1" }) },
      idempotencyKey: "c",
      occurredAt: NOW,
    });
    expect(result).toMatchObject({ ok: false, code: "provider_unsettled" });
    expect(ledger.list()).toHaveLength(3);
  });

  it("appends proportional refund and chargeback reversals without editing the accrual", () => {
    const { ledger, event } = accruedLedger();
    const reversed = unwrap(
      ledger.reverse({
        chainId: event.chainId,
        reason: "refund",
        revenueReversedCents: 8_500,
        actor: system,
        idempotencyKey: "refund-1",
        occurredAt: NOW,
      }),
    );
    expect(reversed.amountCents).toBe(-2_575);
    expect(ledger.list()).toHaveLength(2);
    expect(ledger.list()[0].amountCents).toBe(5_150);
    expect(ledger.balance("aff-1").reversed).toBe(2_575);
  });
});

describe("editable Lawrence / MostFitBarber model", () => {
  it("accepts editable thresholds and rejects rates above the editable ceiling", () => {
    const model = {
      partnerId: "lawrence",
      customCode: "MOSTFITBARBER",
      customLinks: ["https://example.test/mfb"],
      campaigns: ["barber-launch"],
      revenueThresholds: [
        { thresholdCents: 0, rateBps: 1_000 },
        { thresholdCents: 500_000, rateBps: 1_250 },
        { thresholdCents: 1_500_000, rateBps: 1_500 },
        { thresholdCents: 3_000_000, rateBps: 1_750 },
      ],
      rateCeilingBps: 1_750,
      bountyCents: 0,
      milestoneRules: [{ revenueCents: 3_000_000, rewardCents: 25_000 }],
      optionalRetainerCents: null,
      holdDays: 30,
      payoutSchedule: "monthly",
      cohortRetentionWindowDays: 90,
      cohortContributionWindowDays: 180,
      reviewDate: "2026-10-01",
      agreementVersion: "draft-v1",
    };
    expect(validateLawrenceModel(model)).toEqual([]);
    expect(validateLawrenceModel({ ...model, revenueThresholds: [{ thresholdCents: 0, rateBps: 2_000 }] })).toContain(
      "A threshold rate exceeds the editable ceiling.",
    );
  });
});
