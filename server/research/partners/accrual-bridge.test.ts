import { describe, expect, it } from "vitest";
import type { PartnerState } from "@shared/research/distribution";
import {
  DEFAULT_LAUNCH_PROGRAM,
  resolveAffiliateProgram,
} from "@shared/research/affiliate-program/config";
import { InMemoryCommissionLedgerRepository } from "./commissions";
import * as bridgeModule from "./accrual-bridge";
import {
  createAffiliateAccrualBridge,
  type AffiliateSettlementFact,
} from "./accrual-bridge";

const SETTLED_AT = new Date("2026-08-19T12:00:00.000Z");

function fact(
  overrides: Partial<AffiliateSettlementFact> = {},
): AffiliateSettlementFact {
  return {
    orderRef: "XRR-20260819-ORDER0001",
    partnerId: "partner-1",
    basisCents: 25000,
    ordinal: "first",
    paymentSettled: true,
    paymentReference: "pay_settle_001",
    laneCommissionEnabled: true,
    settledAt: SETTLED_AT,
    ...overrides,
  };
}

function harness(overrides: {
  program?: typeof DEFAULT_LAUNCH_PROGRAM | null;
  partnerState?: PartnerState | null;
} = {}) {
  const ledger = new InMemoryCommissionLedgerRepository();
  let sequence = 0;
  const bridge = createAffiliateAccrualBridge({
    program: overrides.program !== undefined ? overrides.program : DEFAULT_LAUNCH_PROGRAM,
    ledger,
    loadPartnerState: async () =>
      overrides.partnerState !== undefined ? overrides.partnerState : "active",
    newId: () => `entry-${(sequence += 1)}`,
  });
  return { bridge, ledger };
}

describe("createAffiliateAccrualBridge", () => {
  it("accrues a first order at the configured first-order rate and holds it", async () => {
    const h = harness();
    const result = await h.bridge.onSettledPayment(fact());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 20% of $250.00 — asserted THROUGH the config, never as a literal rule.
    expect(result.value.accrual.amountCents).toBe(
      Math.floor(
        (25000 * DEFAULT_LAUNCH_PROGRAM.firstOrderRateBasisPoints) / 10_000,
      ),
    );
    expect(result.value.accrual.amountCents).toBe(5000);
    expect(result.value.accrual.eligibleNetCents).toBe(25000);
    expect(result.value.accrual.state).toBe("pending");
    expect(result.value.replayed).toBe(false);

    // The maturation hold is the chain head: system actor, held state, and a
    // reason that names the configured hold and the settlement reference.
    expect(result.value.hold).not.toBeNull();
    expect(result.value.hold!.state).toBe("held");
    expect(result.value.hold!.actor).toBe("system");
    expect(result.value.hold!.reason).toContain(`${DEFAULT_LAUNCH_PROGRAM.holdDays} days`);
    expect(result.value.hold!.reason).toContain("pay_settle_001");
    expect(h.ledger.snapshot()).toHaveLength(2);
  });

  it("accrues a repeat order inside months 2-12 at the configured repeat rate", async () => {
    const h = harness();
    const result = await h.bridge.onSettledPayment(
      fact({ ordinal: "repeat", monthsSinceFirstOrder: 5 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accrual.amountCents).toBe(
      Math.floor(
        (25000 * DEFAULT_LAUNCH_PROGRAM.repeatOrderRateBasisPoints) / 10_000,
      ),
    );
    expect(result.value.accrual.amountCents).toBe(1875);
  });

  it("refuses a repeat order outside the window instead of writing a zero entry", async () => {
    const h = harness();
    for (const month of [1, 13, undefined]) {
      const result = await h.bridge.onSettledPayment(
        fact({ ordinal: "repeat", monthsSinceFirstOrder: month }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.denials[0].code).toBe("invalid_rate");
    }
    expect(h.ledger.snapshot()).toHaveLength(0);
  });

  it("is idempotent: a replayed settlement appends nothing new", async () => {
    const h = harness();
    const first = await h.bridge.onSettledPayment(fact());
    expect(first.ok).toBe(true);
    const sizeAfterFirst = h.ledger.snapshot().length;

    const replay = await h.bridge.onSettledPayment(fact());
    expect(replay.ok).toBe(true);
    if (!replay.ok || !first.ok) return;
    expect(replay.value.replayed).toBe(true);
    expect(replay.value.hold).toBeNull();
    expect(replay.value.accrual.id).toBe(first.value.accrual.id);
    expect(h.ledger.snapshot()).toHaveLength(sizeAfterFirst);
  });

  it("refuses everything while the program is not activated", async () => {
    // resolveAffiliateProgram with the flag unset is exactly how the
    // composition root would hand this bridge a null program.
    const h = harness({ program: resolveAffiliateProgram({}) });
    const result = await h.bridge.onSettledPayment(fact());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials[0].code).toBe("commissions_disabled");
    expect(h.ledger.snapshot()).toHaveLength(0);
  });

  it("never accrues without the provider's settlement reference", async () => {
    const h = harness();
    const result = await h.bridge.onSettledPayment(fact({ paymentReference: "   " }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials[0].code).toBe("payout_proof_missing");
    expect(h.ledger.snapshot()).toHaveLength(0);
  });

  it("refuses an unknown partner and an inactive partner alike", async () => {
    const unknown = harness({ partnerState: null });
    const unknownResult = await unknown.bridge.onSettledPayment(fact());
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) {
      expect(unknownResult.denials[0].code).toBe("partner_not_active");
    }
    expect(unknown.ledger.snapshot()).toHaveLength(0);

    const suspended = harness({ partnerState: "suspended" });
    const suspendedResult = await suspended.bridge.onSettledPayment(fact());
    expect(suspendedResult.ok).toBe(false);
    if (!suspendedResult.ok) {
      expect(
        suspendedResult.denials.some((d) => d.code === "partner_not_active"),
      ).toBe(true);
    }
    expect(suspended.ledger.snapshot()).toHaveLength(0);
  });

  it("refuses a disabled lane rather than defaulting it on", async () => {
    const h = harness();
    const result = await h.bridge.onSettledPayment(
      fact({ laneCommissionEnabled: false }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials.some((d) => d.code === "lane_commission_disabled")).toBe(true);
    expect(h.ledger.snapshot()).toHaveLength(0);
  });

  it("refuses non-integer money at the service's own boundary", async () => {
    const h = harness();
    const result = await h.bridge.onSettledPayment(fact({ basisCents: 100.5 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials.some((d) => d.code === "invalid_amount")).toBe(true);
  });

  it("exposes no HTTP surface a browser could ever reach", () => {
    // The module's entire runtime export set is the factory. No route table,
    // no express handler, no path constant — nothing to mount by accident.
    expect(Object.keys(bridgeModule).sort()).toEqual(["createAffiliateAccrualBridge"]);
  });
});
