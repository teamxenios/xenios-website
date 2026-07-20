import { describe, expect, it, afterEach } from "vitest";
import {
  DisabledPayoutProvider,
  MINIMUM_PAYOUT_CENTS,
  RealPayoutAdapter,
  TestPayoutProvider,
  buildBatch,
  canMarkPaid,
  eligibleForPayout,
  resolvePayoutProvider,
  type PayoutBatchEntry,
} from "./payout";

const baseInput = {
  batchId: "batch_1",
  partnerId: "prt_1",
  amountCents: 12500,
  currency: "usd" as const,
  idempotencyKey: "key_1",
  ledgerEntryIds: ["led_1"],
};

const ASOF = new Date("2026-03-01T00:00:00.000Z");

function entry(over: Partial<PayoutBatchEntry> = {}): PayoutBatchEntry {
  return {
    ledgerId: "led_1",
    partnerId: "prt_1",
    partnerState: "active",
    taxStatus: "verified",
    payoutMethodStatus: "verified",
    commissionState: "payable",
    amountCents: 9000,
    payableAt: "2026-02-01T00:00:00.000Z",
    underDispute: false,
    onHold: false,
    ...over,
  };
}

describe("DisabledPayoutProvider (the production default)", () => {
  const p = new DisabledPayoutProvider();

  it("refuses every operation with a structured DISABLED result, never a throw", async () => {
    for (const result of [
      await p.createPayout(),
      await p.getPayout(),
      await p.cancelPayout(),
      await p.verifyWebhook(),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("DISABLED");
        expect(result.retryable).toBe(false);
      }
    }
  });
});

describe("TestPayoutProvider", () => {
  it("creates a payout and returns a provider reference", async () => {
    const p = new TestPayoutProvider();
    const r = await p.createPayout(baseInput);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("paid");
      expect(r.value.providerReference).toBeTruthy();
    }
  });

  it("rejects a non-positive or non-integer amount", async () => {
    const p = new TestPayoutProvider();
    expect((await p.createPayout({ ...baseInput, amountCents: 0 })).ok).toBe(false);
    expect((await p.createPayout({ ...baseInput, amountCents: -1, idempotencyKey: "k2" })).ok).toBe(false);
    expect((await p.createPayout({ ...baseInput, amountCents: 10.5, idempotencyKey: "k3" })).ok).toBe(false);
  });

  it("refuses a payout that settles no ledger entry", async () => {
    const p = new TestPayoutProvider();
    const r = await p.createPayout({ ...baseInput, ledgerEntryIds: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  // Idempotency: the classic double-pay bug.
  it("returns the same payout for a repeated idempotency key", async () => {
    const p = new TestPayoutProvider();
    const a = await p.createPayout(baseInput);
    const b = await p.createPayout(baseInput);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.value.providerReference).toBe(a.value.providerReference);
    }
  });

  it("refuses a second payout for the same partner in one batch even with a fresh key", async () => {
    const p = new TestPayoutProvider();
    expect((await p.createPayout(baseInput)).ok).toBe(true);
    const dup = await p.createPayout({ ...baseInput, idempotencyKey: "key_2" });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.message).toContain("already has a payout");
  });

  it("creates a distinct payout for the same partner in a different batch", async () => {
    const p = new TestPayoutProvider();
    const a = await p.createPayout(baseInput);
    const b = await p.createPayout({ ...baseInput, batchId: "batch_2", idempotencyKey: "key_2" });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.value.providerReference).not.toBe(a.value.providerReference);
  });

  it("retrieves a created payout and refuses an unknown reference", async () => {
    const p = new TestPayoutProvider();
    const created = await p.createPayout(baseInput);
    if (!created.ok) throw new Error("setup failed");
    expect((await p.getPayout(created.value.providerReference)).ok).toBe(true);
    expect((await p.getPayout("nope")).ok).toBe(false);
  });

  it("refuses to cancel a paid payout", async () => {
    const p = new TestPayoutProvider();
    const created = await p.createPayout(baseInput);
    if (!created.ok) throw new Error("setup failed");
    const r = await p.cancelPayout(created.value.providerReference);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Cannot cancel a paid payout");
  });

  describe("webhook verification", () => {
    it("rejects a missing or wrong signature", async () => {
      const p = new TestPayoutProvider();
      const body = JSON.stringify({ id: "evt_1", type: "payout.paid" });
      expect((await p.verifyWebhook(body, undefined)).ok).toBe(false);
      expect((await p.verifyWebhook(body, "wrong")).ok).toBe(false);
    });

    it("rejects a malformed body and a body missing id or type", async () => {
      const p = new TestPayoutProvider();
      expect((await p.verifyWebhook("{not json", "test-signature")).ok).toBe(false);
      expect((await p.verifyWebhook(JSON.stringify({ id: "e" }), "test-signature")).ok).toBe(false);
    });

    it("accepts a well formed signed event and rejects a replay", async () => {
      const p = new TestPayoutProvider();
      const body = JSON.stringify({ id: "evt_dup", type: "payout.paid", providerReference: "x" });
      const first = await p.verifyWebhook(body, "test-signature");
      expect(first.ok).toBe(true);
      if (first.ok) expect(first.value.verified).toBe(true);
      const replay = await p.verifyWebhook(body, "test-signature");
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.message).toContain("Duplicate");
    });
  });
});

describe("RealPayoutAdapter shell", () => {
  it("refuses every call as MISCONFIGURED rather than faking a payment", async () => {
    const p = new RealPayoutAdapter();
    for (const r of [
      await p.createPayout(),
      await p.getPayout(),
      await p.cancelPayout(),
      await p.verifyWebhook(),
    ]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
    }
  });

  it("declares the credential names it will need, without any values", () => {
    expect(RealPayoutAdapter.requiredEnvironmentVariables).toEqual(["PAYOUT_PROVIDER", "PAYOUT_API_KEY"]);
  });
});

describe("resolvePayoutProvider", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("defaults to disabled with an empty environment", () => {
    expect(resolvePayoutProvider({} as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("stays disabled when payouts are off, even if a provider is named", () => {
    expect(resolvePayoutProvider({ PAYOUT_PROVIDER: "live" } as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("requires the flag to be exactly true", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "TRUE",
      PAYOUT_PROVIDER: "test",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("selects the test provider only outside production", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "test",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("test");
  });

  // A misconfiguration must never turn production into fake payouts.
  it("refuses the test provider in production and falls back to disabled", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "test",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("falls back to disabled for an unknown provider name", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "wat",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("returns the inert real adapter when it is explicitly selected", () => {
    const p = resolvePayoutProvider({
      RESEARCH_AFFILIATE_PAYOUTS_ENABLED: "true",
      PAYOUT_PROVIDER: "live",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("real");
  });
});

describe("TestPayoutProvider production guard", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("refuses to construct in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => new TestPayoutProvider()).toThrow(/not available in production/);
  });
});

describe("canMarkPaid", () => {
  it("refuses to mark paid on a failed provider result", () => {
    expect(canMarkPaid({ ok: false, code: "DISABLED", message: "no", retryable: false })).toBe(false);
  });

  it("refuses to mark paid on a success carrying no provider reference", () => {
    expect(
      canMarkPaid({
        ok: true,
        value: {
          providerReference: "",
          batchId: "b",
          partnerId: "p",
          amountCents: 100,
          currency: "usd",
          status: "paid",
        },
      }),
    ).toBe(false);
  });

  it("refuses to mark paid while the payout is only pending", () => {
    expect(
      canMarkPaid({
        ok: true,
        value: {
          providerReference: "ref_1",
          batchId: "b",
          partnerId: "p",
          amountCents: 100,
          currency: "usd",
          status: "pending",
        },
      }),
    ).toBe(false);
  });

  it("allows marking paid only on a real reference plus a paid status", async () => {
    const p = new TestPayoutProvider();
    const r = await p.createPayout(baseInput);
    expect(canMarkPaid(r)).toBe(true);
  });
});

describe("eligibleForPayout", () => {
  it("passes a fully compliant active partner over the minimum", () => {
    const r = eligibleForPayout("active", "verified", MINIMUM_PAYOUT_CENTS, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
    });
    expect(r).toEqual({ ok: true, reasons: [] });
  });

  // Fail closed: silence about the payout method is not approval.
  it("denies when the payout method status is not supplied", () => {
    const r = eligibleForPayout("active", "verified", 99999);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("payout_status_unverified");
  });

  it("denies an unverified payout method", () => {
    const r = eligibleForPayout("active", "verified", 99999, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "unverified",
    });
    expect(r.reasons).toContain("payout_status_unverified");
  });

  it("denies a partner who is not active", () => {
    for (const state of ["suspended", "terminated", "quality_review", "application"] as const) {
      const r = eligibleForPayout(state, "verified", 99999, MINIMUM_PAYOUT_CENTS, {
        payoutMethodStatus: "verified",
      });
      expect(r.ok).toBe(false);
      expect(r.reasons).toContain("partner_not_active");
    }
  });

  it("denies a tax status that is merely submitted, not verified", () => {
    const r = eligibleForPayout("active", "submitted", 99999, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
    });
    expect(r.reasons).toContain("tax_status_missing");
  });

  it("denies a balance one cent under the minimum and allows it exactly at it", () => {
    const under = eligibleForPayout("active", "verified", MINIMUM_PAYOUT_CENTS - 1, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
    });
    expect(under.reasons).toContain("below_minimum");
    const at = eligibleForPayout("active", "verified", MINIMUM_PAYOUT_CENTS, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
    });
    expect(at.ok).toBe(true);
  });

  it("denies a dispute or a hold", () => {
    const disputed = eligibleForPayout("active", "verified", 99999, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
      underDispute: true,
    });
    expect(disputed.reasons).toEqual(["entry_under_dispute"]);
    const held = eligibleForPayout("active", "verified", 99999, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "verified",
      onHold: true,
    });
    expect(held.reasons).toEqual(["entry_on_hold"]);
  });

  // The directive: accumulate every denial rather than returning on the first.
  it("accumulates every reason at once", () => {
    const r = eligibleForPayout("suspended", "missing", 10, MINIMUM_PAYOUT_CENTS, {
      payoutMethodStatus: "missing",
      underDispute: true,
      onHold: true,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual([
      "partner_not_active",
      "tax_status_missing",
      "payout_status_unverified",
      "below_minimum",
      "entry_under_dispute",
      "entry_on_hold",
    ]);
  });
});

describe("buildBatch", () => {
  it("includes a clean partner and sums their entries", () => {
    const batch = buildBatch(
      [entry({ ledgerId: "led_1", amountCents: 3000 }), entry({ ledgerId: "led_2", amountCents: 4000 })],
      ASOF,
    );
    expect(batch.excluded).toEqual([]);
    expect(batch.included).toEqual([{ partnerId: "prt_1", amountCents: 7000, ledgerIds: ["led_1", "led_2"] }]);
  });

  it("excludes an entry whose commission state is not payable", () => {
    const batch = buildBatch([entry({ commissionState: "approved" })], ASOF);
    expect(batch.included).toEqual([]);
    expect(batch.excluded[0].reasons).toContain("entry_on_hold");
  });

  it("excludes a disputed entry and a held entry with their own reasons", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_d", underDispute: true }),
        entry({ ledgerId: "led_h", onHold: true }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([]);
    const disputed = batch.excluded.find((e) => e.ledgerId === "led_d");
    const held = batch.excluded.find((e) => e.ledgerId === "led_h");
    expect(disputed?.reasons).toContain("entry_under_dispute");
    expect(held?.reasons).toContain("entry_on_hold");
  });

  // The hold window must actually elapse against the injected clock.
  it("excludes an entry whose hold has not elapsed at asOf", () => {
    const batch = buildBatch([entry({ payableAt: "2026-04-01T00:00:00.000Z" })], ASOF);
    expect(batch.included).toEqual([]);
    expect(batch.excluded[0].reasons).toContain("entry_on_hold");
  });

  it("excludes an entry with an unparseable payableAt rather than paying it", () => {
    const batch = buildBatch([entry({ payableAt: "not-a-date" })], ASOF);
    expect(batch.included).toEqual([]);
    expect(batch.excluded).toHaveLength(1);
  });

  it("does not let a blocked entry lift a partner over the minimum", () => {
    // 4000 clean plus 4000 disputed would clear 5000 if the disputed one counted.
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_ok", amountCents: 4000 }),
        entry({ ledgerId: "led_bad", amountCents: 4000, underDispute: true }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([]);
    const clean = batch.excluded.find((e) => e.ledgerId === "led_ok");
    expect(clean?.reasons).toContain("below_minimum");
  });

  it("excludes every entry of a partner who fails the partner-level gate", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_1", partnerState: "suspended", amountCents: 9000 }),
        entry({ ledgerId: "led_2", partnerState: "suspended", amountCents: 9000 }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([]);
    expect(batch.excluded).toHaveLength(2);
    batch.excluded.forEach((e) => expect(e.reasons).toContain("partner_not_active"));
  });

  it("excludes a partner with an unverified payout method or missing tax status", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_1", partnerId: "prt_a", payoutMethodStatus: "unverified" }),
        entry({ ledgerId: "led_2", partnerId: "prt_b", taxStatus: "missing" }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([]);
    const a = batch.excluded.find((e) => e.partnerId === "prt_a");
    const b = batch.excluded.find((e) => e.partnerId === "prt_b");
    expect(a?.reasons).toContain("payout_status_unverified");
    expect(b?.reasons).toContain("tax_status_missing");
  });

  it("keeps one partner's problem from blocking another partner", () => {
    const batch = buildBatch(
      [
        entry({ ledgerId: "led_good", partnerId: "prt_good", amountCents: 9000 }),
        entry({ ledgerId: "led_bad", partnerId: "prt_bad", partnerState: "terminated", amountCents: 9000 }),
      ],
      ASOF,
    );
    expect(batch.included).toEqual([
      { partnerId: "prt_good", amountCents: 9000, ledgerIds: ["led_good"] },
    ]);
    expect(batch.excluded).toHaveLength(1);
    expect(batch.excluded[0].partnerId).toBe("prt_bad");
  });

  it("rounds a total DOWN so rounding never invents value for a partner", () => {
    const batch = buildBatch([entry({ amountCents: 9000.9 })], ASOF);
    expect(batch.included[0].amountCents).toBe(9000);
  });

  it("is deterministic in ordering across partners", () => {
    const entries = [
      entry({ ledgerId: "led_z", partnerId: "prt_z", amountCents: 9000 }),
      entry({ ledgerId: "led_a", partnerId: "prt_a", amountCents: 9000 }),
    ];
    const first = buildBatch(entries, ASOF);
    const second = buildBatch(entries.slice().reverse(), ASOF);
    expect(first.included).toEqual(second.included);
    expect(first.included[0].partnerId).toBe("prt_a");
  });

  it("returns empty structures for no entries", () => {
    expect(buildBatch([], ASOF)).toEqual({ included: [], excluded: [] });
  });
});
