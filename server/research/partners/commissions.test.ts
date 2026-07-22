import { describe, expect, it } from "vitest";
import type { ProviderResult } from "@shared/research/capability";
import type { CommissionContext, CommissionRate, OrderRevenueBreakdown, PartnerState } from "@shared/research/distribution";
import type { PayoutRecord } from "../providers/payout";
import {
  InMemoryCommissionLedgerRepository,
  createCommissionService,
  type CommissionLedgerEntry,
  type CommissionResult,
} from "./commissions";

// The clock is injected everywhere, so every test is deterministic.
const T0 = new Date("2026-01-01T00:00:00.000Z");
const T1 = new Date("2026-01-02T00:00:00.000Z");
const T2 = new Date("2026-01-03T00:00:00.000Z");

const RATE: CommissionRate = { role: "affiliate", basisPoints: 1000 }; // 10 percent

/** 10000 gross, nothing excluded, so eligible net is 10000 and commission is 1000. */
function breakdown(overrides: Partial<OrderRevenueBreakdown> = {}): OrderRevenueBreakdown {
  return {
    grossItemsCents: 10_000,
    taxCents: 0,
    shippingCents: 0,
    discountsCents: 0,
    storeCreditAppliedCents: 0,
    refundedCents: 0,
    chargebackCents: 0,
    ineligibleCategoryCents: 0,
    ...overrides,
  };
}

function context(overrides: Partial<CommissionContext> = {}): CommissionContext {
  return {
    partnerState: "active",
    commissionsEnabled: true,
    // Passed honestly at every call site. Never defaulted true in the service.
    laneCommissionEnabled: true,
    ...overrides,
  };
}

function setup(partnerState: PartnerState = "active") {
  const repository = new InMemoryCommissionLedgerRepository();
  let counter = 0;
  const service = createCommissionService({
    repository,
    newId: () => `entry_${++counter}`,
    loadPartnerState: async () => partnerState,
  });
  return { repository, service };
}

function unwrap<T>(result: CommissionResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got denials: ${result.denials.map((d) => d.code).join(",")}`);
  return result.value;
}

/** A successful payout provider result, the only evidence markPaid accepts. */
function proof(
  partnerId: string,
  batchId: string,
  overrides: Partial<PayoutRecord> = {},
): ProviderResult<PayoutRecord> {
  return {
    ok: true,
    value: {
      providerReference: "pref_1",
      batchId,
      partnerId,
      amountCents: 1000,
      currency: "usd",
      status: "paid",
      // A proof binds to the entries it settled; the ledger id used across
      // these tests is the accrual chain's, matched loosely because markPaid
      // resolves any entry id in the chain.
      ledgerEntryIds: ["led_1"],
      ...overrides,
    },
    providerReference: "pref_1",
  };
}

function codes<T>(result: CommissionResult<T>): string[] {
  if (result.ok) throw new Error("expected a denial");
  return result.denials.map((d) => d.code);
}

describe("accrual", () => {
  it("computes commission from eligible net revenue and opens a pending chain", async () => {
    const { service } = setup();
    const outcome = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));

    expect(outcome.replayed).toBe(false);
    expect(outcome.entry.amountCents).toBe(1000);
    expect(outcome.entry.eligibleNetCents).toBe(10_000);
    expect(outcome.entry.state).toBe("pending");
    expect(outcome.entry.rootId).toBe(outcome.entry.id);
    expect(outcome.entry.createdAt).toBe(T0.toISOString());
  });

  it("is idempotent per partner and order: a double accrual yields ONE entry", async () => {
    const { repository, service } = setup();
    const first = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    const second = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T1));

    expect(second.replayed).toBe(true);
    expect(second.entry.id).toBe(first.entry.id);

    const accruals = repository.snapshot().filter((e) => e.kind === "accrual");
    expect(accruals).toHaveLength(1);

    const balance = await service.balanceFor("p1");
    expect(balance.pendingCents).toBe(1000);
  });

  it("accrues NOTHING when the product lane commission is disabled", async () => {
    const { repository, service } = setup();
    const result = await service.accrue("p1", "o1", breakdown(), RATE, context({ laneCommissionEnabled: false }), T0);

    expect(codes(result)).toContain("lane_commission_disabled");
    expect(repository.snapshot()).toHaveLength(0);
    expect(await service.balanceFor("p1")).toMatchObject({ pendingCents: 0, reversedCents: 0 });
  });

  it("accumulates every denial rather than returning on the first", async () => {
    const { repository, service } = setup();
    const result = await service.accrue(
      "p1",
      "o1",
      breakdown({ grossItemsCents: 0 }),
      { role: "affiliate", basisPoints: -5 },
      context({ commissionsEnabled: false, laneCommissionEnabled: false, partnerState: "suspended" }),
      T0,
    );

    const reasons = codes(result);
    expect(reasons).toContain("commissions_disabled");
    expect(reasons).toContain("lane_commission_disabled");
    expect(reasons).toContain("partner_not_active");
    expect(reasons).toContain("invalid_rate");
    expect(reasons).toContain("no_eligible_revenue");
    expect(repository.snapshot()).toHaveLength(0);
  });

  it("does not accrue for a partner who is not active", async () => {
    const { repository, service } = setup();
    const result = await service.accrue("p1", "o1", breakdown(), RATE, context({ partnerState: "terminated" }), T0);
    expect(codes(result)).toContain("partner_not_active");
    expect(repository.snapshot()).toHaveLength(0);
  });

  it("rounds commission DOWN so rounding never invents a cent for the partner", async () => {
    const { service } = setup();
    // 999 eligible net at 10 percent is 99.9 cents.
    const outcome = unwrap(
      await service.accrue("p1", "o1", breakdown({ grossItemsCents: 999 }), RATE, context(), T0),
    );
    expect(outcome.entry.amountCents).toBe(99);
  });

  it("excludes tax, shipping, discounts, store credit, and ineligible categories", async () => {
    const { service } = setup();
    const outcome = unwrap(
      await service.accrue(
        "p1",
        "o1",
        breakdown({
          grossItemsCents: 20_000,
          taxCents: 1_000,
          shippingCents: 500,
          discountsCents: 1_500,
          storeCreditAppliedCents: 1_000,
          ineligibleCategoryCents: 6_000,
        }),
        RATE,
        context(),
        T0,
      ),
    );
    // 20000 - 1000 - 500 - 1500 - 1000 - 6000 = 10000, at 10 percent.
    expect(outcome.entry.eligibleNetCents).toBe(10_000);
    expect(outcome.entry.amountCents).toBe(1000);
  });
});

describe("state moves", () => {
  it("walks pending to held to approved to payable to paid", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));

    unwrap(await service.hold(entry.id, "admin_1", "manual review", T1));
    expect((await service.balanceFor("p1")).heldCents).toBe(1000);

    unwrap(await service.approve(entry.id, "admin_1", T1));
    expect((await service.balanceFor("p1")).approvedCents).toBe(1000);

    unwrap(await service.markPayable(entry.id, T1));
    expect((await service.balanceFor("p1")).payableCents).toBe(1000);

    const paid = unwrap(await service.markPaid(entry.id, "batch_7", proof("p1", "batch_7"), T2));
    expect(paid.payoutBatchId).toBe("batch_7");
    expect((await service.balanceFor("p1")).paidCents).toBe(1000);
  });

  it("refuses a transition the contract does not allow", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    // pending to paid is not a legal move.
    expect(codes(await service.markPaid(entry.id, "batch_7", proof("p1", "batch_7"), T1))).toContain("invalid_transition");
  });

  it("refuses to pay a partner who is no longer payable, and fails closed on an unknown one", async () => {
    const suspended = setup("suspended");
    const { entry } = unwrap(await suspended.service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await suspended.service.approve(entry.id, "admin_1", T1));
    expect(codes(await suspended.service.markPayable(entry.id, T1))).toContain("partner_not_payable");

    const repository = new InMemoryCommissionLedgerRepository();
    let n = 0;
    const unknown = createCommissionService({
      repository,
      newId: () => `e${++n}`,
      loadPartnerState: async () => null,
    });
    const accrued = unwrap(await unknown.accrue("p2", "o2", breakdown(), RATE, context(), T0));
    unwrap(await unknown.approve(accrued.entry.id, "admin_1", T1));
    expect(codes(await unknown.markPayable(accrued.entry.id, T1))).toContain("partner_not_payable");
  });

  it("names the admin on an admin action and records the reason on a hold", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));

    expect(codes(await service.hold(entry.id, "", "review", T1))).toContain("missing_actor");
    expect(codes(await service.hold(entry.id, "admin_1", "   ", T1))).toContain("missing_reason");

    const held = unwrap(await service.hold(entry.id, "admin_1", "velocity review", T1));
    expect(held.actorId).toBe("admin_1");
    expect(held.reason).toBe("velocity review");
  });

  it("reports entry_not_found for an unknown ledger id", async () => {
    const { service } = setup();
    expect(codes(await service.approve("nope", "admin_1", T1))).toContain("entry_not_found");
  });
});

describe("ledger immutability", () => {
  it("a reversal preserves the original entry and only the DERIVED balance changes", async () => {
    const { repository, service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    const before = { ...entry };

    expect((await service.balanceFor("p1")).pendingCents).toBe(1000);

    unwrap(await service.reverse(entry.id, "chargeback", T1));

    const original = repository.snapshot().find((e) => e.id === entry.id) as CommissionLedgerEntry;
    expect(original).toEqual(before);
    expect(original.state).toBe("pending");
    expect(original.amountCents).toBe(1000);

    const balance = await service.balanceFor("p1");
    expect(balance.pendingCents).toBe(0);
    expect(balance.reversedCents).toBe(1000);
  });

  it("never edits or deletes: every event appends a new entry referencing the last", async () => {
    const { repository, service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.hold(entry.id, "admin_1", "review", T1));
    unwrap(await service.approve(entry.id, "admin_1", T1));
    unwrap(await service.reverse(entry.id, "refund", T2));

    const chain = repository.snapshot();
    expect(chain).toHaveLength(4);
    expect(chain[0].previousEntryId).toBeNull();
    expect(chain[1].previousEntryId).toBe(chain[0].id);
    expect(chain[2].previousEntryId).toBe(chain[1].id);
    expect(chain[3].previousEntryId).toBe(chain[2].id);
    chain.forEach((e) => expect(e.rootId).toBe(entry.id));
    // A transition moves state, never money.
    expect(chain[1].amountCents).toBe(0);
    expect(chain[2].amountCents).toBe(0);
  });

  it("refuses any further move once a chain is terminal", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.reverse(entry.id, "chargeback", T1));

    expect(codes(await service.approve(entry.id, "admin_1", T2))).toContain("chain_terminal");
    expect(codes(await service.reverse(entry.id, "again", T2))).toContain("nothing_to_reverse");
  });
});

describe("reversal after payout", () => {
  it("a PAID commission can still reverse, because a chargeback arrives later", async () => {
    const { repository, service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.approve(entry.id, "admin_1", T1));
    unwrap(await service.markPayable(entry.id, T1));
    unwrap(await service.markPaid(entry.id, "batch_7", proof("p1", "batch_7"), T1));
    expect((await service.balanceFor("p1")).paidCents).toBe(1000);

    const reversal = unwrap(await service.reverse(entry.id, "chargeback after payout", T2));
    expect(reversal.state).toBe("reversed");
    expect(reversal.amountCents).toBe(1000);

    const balance = await service.balanceFor("p1");
    expect(balance.paidCents).toBe(0);
    expect(balance.reversedCents).toBe(1000);

    // The paid entry itself is untouched, so the payout history survives.
    const paidEntry = repository.snapshot().find((e) => e.payoutBatchId === "batch_7");
    expect(paidEntry?.state).toBe("paid");
  });
});

describe("onOrderRefunded", () => {
  it("fully reverses when the refund covers the eligible net revenue", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.approve(entry.id, "admin_1", T1));

    const written = unwrap(await service.onOrderRefunded("o1", 10_000, "rfnd_a", T2));
    expect(written).toHaveLength(1);
    expect(written[0].amountCents).toBe(1000);
    expect(written[0].state).toBe("reversed");

    const balance = await service.balanceFor("p1");
    expect(balance.approvedCents).toBe(0);
    expect(balance.reversedCents).toBe(1000);
  });

  it("partially reverses in proportion, leaving the rest live", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.approve(entry.id, "admin_1", T1));

    // Half the eligible net refunded, so half the commission goes back.
    const written = unwrap(await service.onOrderRefunded("o1", 5_000, "rfnd_a", T2));
    expect(written[0].amountCents).toBe(500);
    expect(written[0].state).toBe("approved");

    const balance = await service.balanceFor("p1");
    expect(balance.approvedCents).toBe(500);
    expect(balance.reversedCents).toBe(500);
  });

  it("rounds a partial reversal UP so the partner never keeps an unearned cent", async () => {
    const { service } = setup();
    unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    // 1000 commission times 1 over 3 of the revenue is 333.33, reversed as 334.
    const written = unwrap(await service.onOrderRefunded("o1", 3_333, "rfnd_a", T2));
    expect(written[0].amountCents).toBe(334);
  });

  // The winner moved by a manual re-attribution, so the order carries a dead chain
  // for p1 and a live one for p2. Only the live one is reversed.
  it("reverses each attributed partner chain on the order and skips terminal ones", async () => {
    const { service } = setup();
    const a = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.reverse(a.entry.id, "re-attributed", T1));
    unwrap(await service.accrue("p2", "o1", breakdown(), RATE, context(), T1));

    const written = unwrap(await service.onOrderRefunded("o1", 10_000, "rfnd_a", T2));
    expect(written).toHaveLength(1);
    expect(written[0].partnerId).toBe("p2");
  });

  it("refuses a non-positive refund", async () => {
    const { service } = setup();
    unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    expect(codes(await service.onOrderRefunded("o1", 0, "rfnd_a", T2))).toContain("invalid_amount");
    expect(codes(await service.onOrderRefunded("o1", -100, "rfnd_a", T2))).toContain("invalid_amount");
  });

  it("does nothing for an order with no accrued commission", async () => {
    const { service } = setup();
    expect(unwrap(await service.onOrderRefunded("unknown_order", 5_000, "rfnd_a", T2))).toHaveLength(0);
  });
});

describe("disputes and forfeiture", () => {
  it("moves approved to disputed and back to approved", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.approve(entry.id, "admin_1", T1));
    unwrap(await service.dispute(entry.id, "admin_1", T1));
    expect((await service.balanceFor("p1")).disputedCents).toBe(1000);

    unwrap(await service.resolveDispute(entry.id, "admin_1", "approved", "resolved in favour", T2));
    expect((await service.balanceFor("p1")).approvedCents).toBe(1000);
    expect((await service.balanceFor("p1")).disputedCents).toBe(0);
  });

  it("resolves a dispute by reversal, which removes the value", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.approve(entry.id, "admin_1", T1));
    unwrap(await service.dispute(entry.id, "admin_1", T1));
    unwrap(await service.resolveDispute(entry.id, "admin_1", "reversed", "order was fraudulent", T2));

    const balance = await service.balanceFor("p1");
    expect(balance.disputedCents).toBe(0);
    expect(balance.reversedCents).toBe(1000);
  });

  it("refuses to resolve a dispute that was never opened", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    expect(codes(await service.resolveDispute(entry.id, "admin_1", "approved", "why", T1))).toContain(
      "invalid_transition",
    );
  });

  it("forfeits a held commission and records why", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.hold(entry.id, "admin_1", "quality review", T1));
    const forfeited = unwrap(await service.forfeit(entry.id, "admin_1", "policy breach", T2));

    expect(forfeited.state).toBe("forfeited");
    expect(forfeited.reason).toBe("policy breach");
    expect((await service.balanceFor("p1")).forfeitedCents).toBe(1000);
  });
});

describe("balances", () => {
  it("never goes negative, even with repeated reversal attempts", async () => {
    const { service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.reverse(entry.id, "chargeback", T1));

    // Every later attempt is refused rather than driving the balance below zero.
    await service.onOrderRefunded("o1", 10_000, "rfnd_a", T2);
    await service.onOrderRefunded("o1", 10_000, "rfnd_b", T2);

    const balance = await service.balanceFor("p1");
    expect(balance.reversedCents).toBe(1000);
    Object.keys(balance).forEach((key) => {
      expect(balance[key as keyof typeof balance]).toBeGreaterThanOrEqual(0);
    });
  });

  it("caps a reversal at what remains after a partial reversal", async () => {
    const { service } = setup();
    unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.onOrderRefunded("o1", 5_000, "rfnd_a", T1));
    unwrap(await service.onOrderRefunded("o1", 10_000, "rfnd_b", T2));

    const balance = await service.balanceFor("p1");
    // 500 then the remaining 500. Never more than the 1000 accrued.
    expect(balance.reversedCents).toBe(1000);
    expect(balance.pendingCents).toBe(0);
  });

  it("sums independent chains and isolates one partner from another", async () => {
    const { service } = setup();
    const a = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.accrue("p1", "o2", breakdown({ grossItemsCents: 5_000 }), RATE, context(), T0));
    unwrap(await service.accrue("p2", "o3", breakdown(), RATE, context(), T0));
    unwrap(await service.approve(a.entry.id, "admin_1", T1));

    const p1 = await service.balanceFor("p1");
    expect(p1.approvedCents).toBe(1000);
    expect(p1.pendingCents).toBe(500);

    const p2 = await service.balanceFor("p2");
    expect(p2.pendingCents).toBe(1000);
    expect(p2.approvedCents).toBe(0);
  });

  it("returns an all-zero balance for a partner with no ledger history", async () => {
    const { service } = setup();
    expect(await service.balanceFor("nobody")).toEqual({
      pendingCents: 0,
      heldCents: 0,
      approvedCents: 0,
      payableCents: 0,
      paidCents: 0,
      disputedCents: 0,
      forfeitedCents: 0,
      reversedCents: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Regressions: paid without proof, double accrual, replayed refunds, floats
// ---------------------------------------------------------------------------

describe("paid requires real provider proof", () => {
  async function payable() {
    const { repository, service } = setup();
    const { entry } = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.approve(entry.id, "admin_1", T1));
    unwrap(await service.markPayable(entry.id, T1));
    return { repository, service, entry };
  }

  it("refuses to mark paid on a provider refusal", async () => {
    const { repository, service, entry } = await payable();
    const result = await service.markPaid(entry.id, "batch_7", {
      ok: false,
      code: "DISABLED",
      message: "affiliate_payouts is not enabled.",
      retryable: false,
    }, T2);

    expect(codes(result)).toContain("payout_proof_missing");
    expect((await service.balanceFor("p1")).paidCents).toBe(0);
    expect(repository.snapshot().some((e) => e.state === "paid")).toBe(false);
  });

  it("refuses a success that carries no provider reference", async () => {
    const { service, entry } = await payable();
    const result = await service.markPaid(
      entry.id,
      "batch_7",
      proof("p1", "batch_7", { providerReference: "" }),
      T2,
    );
    expect(codes(result)).toContain("payout_proof_missing");
    expect((await service.balanceFor("p1")).payableCents).toBe(1000);
  });

  it("refuses a payout the provider has not settled yet", async () => {
    const { service, entry } = await payable();
    const result = await service.markPaid(
      entry.id,
      "batch_7",
      proof("p1", "batch_7", { status: "pending" }),
      T2,
    );
    expect(codes(result)).toContain("payout_proof_missing");
  });

  it("refuses proof issued for a different partner or a different batch", async () => {
    const { service, entry } = await payable();
    expect(codes(await service.markPaid(entry.id, "batch_7", proof("p_other", "batch_7"), T2))).toContain(
      "payout_proof_mismatch",
    );
    expect(codes(await service.markPaid(entry.id, "batch_7", proof("p1", "batch_9"), T2))).toContain(
      "payout_proof_mismatch",
    );
    expect((await service.balanceFor("p1")).paidCents).toBe(0);
  });

  it("records the provider reference on the paid entry", async () => {
    const { service, entry } = await payable();
    const paid = unwrap(
      await service.markPaid(entry.id, "batch_7", proof("p1", "batch_7", { providerReference: "pref_live_1" }), T2),
    );
    expect(paid.providerReference).toBe("pref_live_1");
  });
});

describe("one order pays one partner", () => {
  it("refuses a second partner accruing on an order that already has a live commission", async () => {
    const { repository, service } = setup();
    unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));

    const result = await service.accrue("p2", "o1", breakdown(), RATE, context(), T1);
    expect(codes(result)).toContain("order_already_attributed");

    const accruals = repository.snapshot().filter((e) => e.kind === "accrual");
    expect(accruals).toHaveLength(1);
    expect((await service.balanceFor("p2")).pendingCents).toBe(0);
  });

  it("allows a re-attributed partner once the losing chain is fully reversed", async () => {
    const { service } = setup();
    const first = unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    unwrap(await service.reverse(first.entry.id, "re-attributed to p2", T1));

    const second = unwrap(await service.accrue("p2", "o1", breakdown(), RATE, context(), T1));
    expect(second.replayed).toBe(false);
    expect((await service.balanceFor("p1")).pendingCents).toBe(0);
    expect((await service.balanceFor("p2")).pendingCents).toBe(1000);
  });
});

describe("refund replay", () => {
  it("reverses once for a refund reference, however many times the webhook arrives", async () => {
    const { service } = setup();
    unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));

    const first = unwrap(await service.onOrderRefunded("o1", 5_000, "rfnd_same", T1));
    const replay = unwrap(await service.onOrderRefunded("o1", 5_000, "rfnd_same", T2));

    expect(first).toHaveLength(1);
    expect(replay).toHaveLength(0);
    const balance = await service.balanceFor("p1");
    expect(balance.reversedCents).toBe(500);
    expect(balance.pendingCents).toBe(500);
  });

  it("requires a refund reference and whole cents", async () => {
    const { service } = setup();
    unwrap(await service.accrue("p1", "o1", breakdown(), RATE, context(), T0));
    expect(codes(await service.onOrderRefunded("o1", 5_000, "  ", T1))).toContain("missing_reason");
    expect(codes(await service.onOrderRefunded("o1", 12.5, "rfnd_a", T1))).toContain("invalid_amount");
  });
});

describe("money is whole cents", () => {
  it("refuses a fractional revenue component", async () => {
    const { repository, service } = setup();
    const result = await service.accrue(
      "p1",
      "o1",
      breakdown({ grossItemsCents: 10_000.5 }),
      RATE,
      context(),
      T0,
    );
    expect(codes(result)).toContain("invalid_amount");
    expect(repository.snapshot()).toHaveLength(0);
  });

  it("refuses a rate above 100 percent, which would pay more than the order earned", async () => {
    const { service } = setup();
    const result = await service.accrue(
      "p1",
      "o1",
      breakdown(),
      { role: "affiliate", basisPoints: 20_000 },
      context(),
      T0,
    );
    expect(codes(result)).toContain("invalid_rate");
  });
});
