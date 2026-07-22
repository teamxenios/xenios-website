import { describe, expect, it } from "vitest";
import {
  COMMISSION_TRANSITIONS,
  DEFAULT_ATTRIBUTION,
  PARTNER_FORBIDDEN_FIELDS,
  REFERRAL_NEW_MEMBER_CREDIT_CENTS,
  REFERRAL_REFERRER_CREDIT_CENTS,
  REFERRAL_HOLD_DAYS,
  TERMINAL_COMMISSION_STATES,
  computeCommission,
  eligibleNetRevenueCents,
  partnerCanEarn,
  resolveAttribution,
  spendableStoreCreditCents,
  toPartnerVisibleConversion,
  transitionCommission,
  type AttributionTouch,
  type OrderRevenueBreakdown,
  type StoreCreditEntry,
} from "./distribution";

function credit(overrides: Partial<StoreCreditEntry> = {}): StoreCreditEntry {
  return {
    id: "c1",
    memberId: "m1",
    amountCents: 1000,
    state: "approved",
    reason: "referral_referrer",
    createdAt: "2026-07-01",
    availableAt: "2026-07-15",
    ...overrides,
  };
}

describe("referral constants match the founder decision", () => {
  it("credits the new member $10 and the referrer $15 after a 14 day hold", () => {
    expect(REFERRAL_NEW_MEMBER_CREDIT_CENTS).toBe(1000);
    expect(REFERRAL_REFERRER_CREDIT_CENTS).toBe(1500);
    expect(REFERRAL_HOLD_DAYS).toBe(14);
  });
});

describe("store credit", () => {
  it("counts only approved entries as spendable", () => {
    const entries = [
      credit({ id: "a", state: "approved", amountCents: 1000 }),
      credit({ id: "b", state: "pending", amountCents: 5000 }),
      credit({ id: "c", state: "held", amountCents: 5000 }),
      credit({ id: "d", state: "reversed", amountCents: 5000 }),
      credit({ id: "e", state: "fraud_flagged", amountCents: 5000 }),
    ];
    expect(spendableStoreCreditCents(entries)).toBe(1000);
  });

  it("is zero with no entries", () => {
    expect(spendableStoreCreditCents([])).toBe(0);
  });
});

describe("attribution", () => {
  const touches: AttributionTouch[] = [
    { partnerId: "first", channel: "signed_link", occurredAt: "2026-07-01T00:00:00Z" },
    { partnerId: "last", channel: "code", occurredAt: "2026-07-10T00:00:00Z" },
  ];
  const convertedAt = "2026-07-12T00:00:00Z";

  it("defaults to last touch over a 30 day window", () => {
    expect(DEFAULT_ATTRIBUTION).toEqual({ model: "last_touch", windowDays: 30 });
    expect(resolveAttribution(touches, convertedAt)!.partnerId).toBe("last");
  });

  it("honors a first-touch configuration", () => {
    const r = resolveAttribution(touches, convertedAt, { model: "first_touch", windowDays: 30 });
    expect(r!.partnerId).toBe("first");
  });

  it("discards touches outside the window", () => {
    const r = resolveAttribution(touches, convertedAt, { model: "last_touch", windowDays: 1 });
    expect(r).toBeNull();
  });

  it("ignores a touch that happened after the conversion", () => {
    const future: AttributionTouch[] = [
      { partnerId: "future", channel: "code", occurredAt: "2026-08-01T00:00:00Z" },
    ];
    expect(resolveAttribution(future, convertedAt)).toBeNull();
  });

  it("returns null when there are no touches", () => {
    expect(resolveAttribution([], convertedAt)).toBeNull();
  });

  it("lets a manual admin attribution override the automatic winner", () => {
    const withManual: AttributionTouch[] = [
      ...touches,
      {
        partnerId: "manual-winner",
        channel: "manual",
        occurredAt: "2026-07-05T00:00:00Z",
        setByAdminId: "samuel",
      },
    ];
    expect(resolveAttribution(withManual, convertedAt)!.partnerId).toBe("manual-winner");
  });

  // A race must not produce two different winners for one order.
  it("breaks an exact timestamp tie deterministically regardless of array order", () => {
    const a: AttributionTouch = { partnerId: "aaa", channel: "code", occurredAt: "2026-07-10T00:00:00Z" };
    const b: AttributionTouch = { partnerId: "bbb", channel: "code", occurredAt: "2026-07-10T00:00:00Z" };
    const one = resolveAttribution([a, b], convertedAt)!.partnerId;
    const two = resolveAttribution([b, a], convertedAt)!.partnerId;
    expect(one).toBe(two);
  });
});

describe("eligible net revenue", () => {
  function breakdown(o: Partial<OrderRevenueBreakdown> = {}): OrderRevenueBreakdown {
    return {
      grossItemsCents: 10_000,
      taxCents: 0,
      shippingCents: 0,
      discountsCents: 0,
      storeCreditAppliedCents: 0,
      refundedCents: 0,
      chargebackCents: 0,
      ineligibleCategoryCents: 0,
      ...o,
    };
  }

  it("excludes every category the founder decision excludes", () => {
    expect(eligibleNetRevenueCents(breakdown({ taxCents: 800 }))).toBe(9_200);
    expect(eligibleNetRevenueCents(breakdown({ shippingCents: 1_295 }))).toBe(8_705);
    expect(eligibleNetRevenueCents(breakdown({ discountsCents: 1_000 }))).toBe(9_000);
    expect(eligibleNetRevenueCents(breakdown({ storeCreditAppliedCents: 1_500 }))).toBe(8_500);
    expect(eligibleNetRevenueCents(breakdown({ refundedCents: 2_000 }))).toBe(8_000);
    expect(eligibleNetRevenueCents(breakdown({ chargebackCents: 3_000 }))).toBe(7_000);
    expect(eligibleNetRevenueCents(breakdown({ ineligibleCategoryCents: 10_000 }))).toBe(0);
  });

  // A heavily refunded order must yield zero, never a negative that could offset
  // another order's commission.
  it("clamps at zero rather than going negative", () => {
    expect(eligibleNetRevenueCents(breakdown({ refundedCents: 99_999 }))).toBe(0);
  });
});

describe("computeCommission", () => {
  const fullBreakdown: OrderRevenueBreakdown = {
    grossItemsCents: 10_000,
    taxCents: 0,
    shippingCents: 0,
    discountsCents: 0,
    storeCreditAppliedCents: 0,
    refundedCents: 0,
    chargebackCents: 0,
    ineligibleCategoryCents: 0,
  };
  const rate = { role: "affiliate" as const, basisPoints: 1_000 }; // 10 percent
  const enabled = { partnerState: "active" as const, commissionsEnabled: true, laneCommissionEnabled: true };

  it("computes from eligible net revenue when every gate passes", () => {
    const r = computeCommission(fullBreakdown, rate, enabled);
    expect(r.earned).toBe(true);
    if (r.earned) expect(r.amountCents).toBe(1_000);
  });

  it("is denied when commissions are globally disabled", () => {
    const r = computeCommission(fullBreakdown, rate, { ...enabled, commissionsEnabled: false });
    expect(r.earned).toBe(false);
    if (!r.earned) expect(r.reason).toBe("commissions_disabled");
  });

  // Peptide and Quantum commission stays off until approved.
  it("is denied when the lane commission is not activated", () => {
    const r = computeCommission(fullBreakdown, rate, { ...enabled, laneCommissionEnabled: false });
    expect(r.earned).toBe(false);
    if (!r.earned) expect(r.reason).toBe("lane_commission_disabled");
  });

  it("is denied for a partner who is not active", () => {
    for (const state of ["suspended", "terminated", "quality_review", "application"] as const) {
      const r = computeCommission(fullBreakdown, rate, { ...enabled, partnerState: state });
      expect(r.earned).toBe(false);
      if (!r.earned) expect(r.reason).toBe("partner_not_active");
    }
  });

  it("is denied when nothing eligible remains", () => {
    const r = computeCommission({ ...fullBreakdown, refundedCents: 10_000 }, rate, enabled);
    expect(r.earned).toBe(false);
    if (!r.earned) expect(r.reason).toBe("no_eligible_revenue");
  });

  it("rounds down so a partial cent is never invented", () => {
    const r = computeCommission({ ...fullBreakdown, grossItemsCents: 999 }, { role: "affiliate", basisPoints: 1_000 }, enabled);
    if (r.earned) expect(r.amountCents).toBe(99); // 99.9 floors to 99
  });
});

describe("commission ledger transitions", () => {
  it("follows the ordinary payout path", () => {
    expect(transitionCommission("pending", "approved", "system").ok).toBe(true);
    expect(transitionCommission("approved", "payable", "system").ok).toBe(true);
    expect(transitionCommission("payable", "paid", "system").ok).toBe(true);
  });

  it("allows a reversal after payment, because a chargeback can arrive later", () => {
    expect(transitionCommission("paid", "reversed", "system").ok).toBe(true);
  });

  it("treats reversed and forfeited as terminal", () => {
    for (const t of TERMINAL_COMMISSION_STATES) {
      expect(transitionCommission(t, "approved", "admin").ok).toBe(false);
    }
  });

  it("requires an admin to release a held commission", () => {
    expect(transitionCommission("held", "approved", "system").ok).toBe(false);
    expect(transitionCommission("held", "approved", "admin").ok).toBe(true);
  });

  it("does not let the system mark a commission paid from approved without going payable", () => {
    expect(transitionCommission("approved", "paid", "system").ok).toBe(false);
  });

  it("never originates a transition in a terminal state", () => {
    for (const r of COMMISSION_TRANSITIONS) {
      expect(TERMINAL_COMMISSION_STATES.has(r.from)).toBe(false);
    }
  });
});

describe("partner privacy", () => {
  it("names the forbidden fields in one shared place", () => {
    expect(PARTNER_FORBIDDEN_FIELDS).toContain("memberBlueprint");
    expect(PARTNER_FORBIDDEN_FIELDS).toContain("trackerData");
    expect(PARTNER_FORBIDDEN_FIELDS).toContain("rejectionReason");
    expect(PARTNER_FORBIDDEN_FIELDS).toContain("applicantHealthData");
  });

  // A partner sees aggregates, never a member-level record.
  it("strips member identity and health data from a conversion view", () => {
    const view = toPartnerVisibleConversion({
      attributedAt: "2026-07-10",
      eligibleNetCents: 10_000,
      commissionCents: 1_000,
      state: "approved",
      memberId: "LEAK-MEMBER",
      memberEmail: "LEAK-EMAIL",
      healthGoals: ["LEAK-GOAL"],
    });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("LEAK-MEMBER");
    expect(serialized).not.toContain("LEAK-EMAIL");
    expect(serialized).not.toContain("LEAK-GOAL");
    expect(Object.keys(view).sort()).toEqual([
      "attributedAt",
      "commissionCents",
      "eligibleNetCents",
      "state",
    ]);
  });
});

describe("no recursive downline", () => {
  // Structural assertion: the partner contract has no parent or child concept, so a
  // multi-level compensation structure cannot be expressed on top of it.
  it("exposes no parent or downline field on the partner-visible shapes", () => {
    const view = toPartnerVisibleConversion({
      attributedAt: "2026-07-10",
      eligibleNetCents: 1,
      commissionCents: 1,
      state: "pending",
    });
    const keys = Object.keys(view).join(",").toLowerCase();
    for (const forbidden of ["parent", "upline", "downline", "sponsor", "tier", "level"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("only earns from revenue, since partnerCanEarn is the sole earning gate", () => {
    expect(partnerCanEarn("active")).toBe(true);
    expect(partnerCanEarn("suspended")).toBe(false);
  });
});
