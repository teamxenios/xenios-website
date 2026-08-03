import { describe, expect, it, vi } from "vitest";
import {
  InMemoryPaymentWebhookLedger,
  PaymentWebhookKernel,
  type PaymentEventProjection,
} from "./webhook-kernel";
import type {
  PeptidePaymentProvider,
  PaymentProviderResult,
  VerifiedPaymentEvent,
} from "./provider";

const reference = "test_pi_payment_1";
let sequence = 0;
function event(
  type: VerifiedPaymentEvent["type"],
  occurredAt: string,
  overrides: Partial<VerifiedPaymentEvent> = {},
): VerifiedPaymentEvent {
  sequence += 1;
  return {
    eventId: `evt_${sequence}`,
    type,
    providerPaymentReference: reference,
    occurredAt,
    verified: true,
    ...overrides,
  };
}

class VerifierOnlyProvider implements PeptidePaymentProvider {
  readonly name = "test" as const;
  constructor(
    private readonly result: PaymentProviderResult<VerifiedPaymentEvent>,
  ) {}
  async authorize(): Promise<never> {
    throw new Error("not used");
  }
  async capture(): Promise<never> {
    throw new Error("not used");
  }
  async refund(): Promise<never> {
    throw new Error("not used");
  }
  async verifyWebhook(): Promise<PaymentProviderResult<VerifiedPaymentEvent>> {
    return this.result;
  }
}

describe("webhook verification boundary", () => {
  it("never parses, claims, or applies an unverified body", async () => {
    const ledger = {
      applyVerifiedEvent: vi.fn(),
      reconcileClaimedEvent: vi.fn(),
    };
    const provider = new VerifierOnlyProvider({
      ok: false,
      code: "webhook_unverified",
      message: "secret provider detail",
      retryable: false,
    });
    const result = await new PaymentWebhookKernel(provider, ledger).handle(
      Buffer.from('{"id":"forged"}'),
      "bad",
    );
    expect(result).toEqual({
      ok: false,
      code: "webhook_unverified",
      message: "The payment webhook was not verified.",
      retryable: false,
    });
    expect(ledger.applyVerifiedEvent).not.toHaveBeenCalled();
  });

  it("passes only the provider-verified normalized event to the atomic ledger", async () => {
    const verified = event("payment.captured", "2026-08-02T18:00:00.000Z", {
      amountCents: 1_000,
    });
    const ledger = new InMemoryPaymentWebhookLedger();
    const apply = vi.spyOn(ledger, "applyVerifiedEvent");
    const raw = Buffer.from('{ "whitespace": "must stay exact" }');
    const provider = new VerifierOnlyProvider({ ok: true, value: verified });
    const result = await new PaymentWebhookKernel(provider, ledger).handle(
      raw,
      "verified-signature",
    );
    expect(result).toMatchObject({
      ok: true,
      eventId: verified.eventId,
      result: { status: "applied" },
    });
    expect(apply).toHaveBeenCalledWith(verified);
  });
});

describe("atomic duplicate and ordering behavior", () => {
  it("applies one of many concurrent duplicate deliveries exactly once", async () => {
    const ledger = new InMemoryPaymentWebhookLedger();
    const captured = event("payment.captured", "2026-08-02T18:00:00.000Z", {
      amountCents: 10_000,
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => ledger.applyVerifiedEvent(captured)),
    );
    expect(
      results.filter((result) => result.status === "applied"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "duplicate"),
    ).toHaveLength(19);
    expect(ledger.getProjection(reference)).toMatchObject({
      lifecycle: "captured",
      capturedAmountCents: 10_000,
    });
  });

  it("records but does not apply a stale event or regress captured state", async () => {
    const ledger = new InMemoryPaymentWebhookLedger();
    await ledger.applyVerifiedEvent(
      event("payment.captured", "2026-08-02T18:02:00.000Z", {
        amountCents: 10_000,
      }),
    );
    const stale = event("payment.authorized", "2026-08-02T18:01:00.000Z");
    expect(await ledger.applyVerifiedEvent(stale)).toMatchObject({
      status: "ignored_out_of_order",
      reason: "lifecycle_event_older_than_projection",
      needsReconciliation: false,
    });
    expect(await ledger.applyVerifiedEvent(stale)).toMatchObject({
      status: "duplicate",
    });
    expect(ledger.getProjection(reference)?.lifecycle).toBe("captured");
  });

  it("does not let a later failure regress a captured payment", async () => {
    const ledger = new InMemoryPaymentWebhookLedger();
    await ledger.applyVerifiedEvent(
      event("payment.captured", "2026-08-02T18:00:00.000Z", {
        amountCents: 10_000,
      }),
    );
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.failed", "2026-08-02T18:01:00.000Z"),
      ),
    ).toMatchObject({
      status: "quarantined",
      reason: "failure_after_capture",
      needsReconciliation: false,
    });
    expect(ledger.getProjection(reference)?.lifecycle).toBe("captured");
  });

  it("quarantines a refund-before-capture without preventing a later capture", async () => {
    const ledger = new InMemoryPaymentWebhookLedger();
    const earlyRefund = event("payment.refunded", "2026-08-02T18:02:00.000Z", {
      amountCents: 1_000,
    });
    expect(await ledger.applyVerifiedEvent(earlyRefund)).toMatchObject({
      status: "quarantined",
      reason: "refund_before_capture",
      needsReconciliation: true,
    });
    expect(ledger.getReconciliation(earlyRefund.eventId)).toEqual({
      event: earlyRefund,
      reason: "refund_before_capture",
    });
    expect(ledger.getProjection(reference)).toBeNull();
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.captured", "2026-08-02T18:01:00.000Z", {
          amountCents: 10_000,
        }),
      ),
    ).toMatchObject({ status: "applied" });
    expect(ledger.getProjection(reference)?.capturedAmountCents).toBe(10_000);
    expect(await ledger.applyVerifiedEvent(earlyRefund)).toMatchObject({
      status: "duplicate",
      originalStatus: "quarantined",
      reason: "refund_before_capture",
      needsReconciliation: true,
      projection: { lifecycle: "captured" },
    });
    expect(ledger.getReconciliation(earlyRefund.eventId)?.event).toEqual(
      earlyRefund,
    );
    expect(
      await ledger.reconcileClaimedEvent(earlyRefund.eventId),
    ).toMatchObject({
      status: "applied",
      projection: { lifecycle: "captured", refundedAmountCents: 1_000 },
    });
    expect(ledger.getReconciliation(earlyRefund.eventId)).toBeNull();
    expect(ledger.getProjection(reference)?.refundedAmountCents).toBe(1_000);
    expect(await ledger.applyVerifiedEvent(earlyRefund)).toMatchObject({
      status: "duplicate",
      originalStatus: "quarantined",
      reason: "refund_before_capture",
      needsReconciliation: false,
    });
    expect(await ledger.reconcileClaimedEvent(earlyRefund.eventId)).toEqual({
      status: "not_pending",
      projection: null,
    });
  });

  it("durably queues a dispute close delivered before its open prerequisite", async () => {
    const ledger = new InMemoryPaymentWebhookLedger();
    await ledger.applyVerifiedEvent(
      event("payment.captured", "2026-08-02T18:00:00.000Z", {
        amountCents: 10_000,
      }),
    );
    const earlyClose = event(
      "payment.dispute_lost",
      "2026-08-02T18:02:00.000Z",
    );
    expect(await ledger.applyVerifiedEvent(earlyClose)).toMatchObject({
      status: "quarantined",
      reason: "dispute_close_without_open",
      needsReconciliation: true,
    });
    expect(ledger.getReconciliation(earlyClose.eventId)).toEqual({
      event: earlyClose,
      reason: "dispute_close_without_open",
    });
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.dispute_opened", "2026-08-02T18:01:00.000Z"),
      ),
    ).toMatchObject({
      status: "applied",
      projection: { dispute: "open" },
    });
    expect(await ledger.applyVerifiedEvent(earlyClose)).toMatchObject({
      status: "duplicate",
      originalStatus: "quarantined",
      reason: "dispute_close_without_open",
      needsReconciliation: true,
    });
    expect(
      await ledger.reconcileClaimedEvent(earlyClose.eventId),
    ).toMatchObject({
      status: "applied",
      projection: { dispute: "lost" },
    });
    expect(ledger.getReconciliation(earlyClose.eventId)).toBeNull();
    expect(ledger.getProjection(reference)?.dispute).toBe("lost");
  });

  it("applies legitimate older refund and dispute facts across independent dimensions", async () => {
    const ledger = new InMemoryPaymentWebhookLedger();
    await ledger.applyVerifiedEvent(
      event("payment.captured", "2026-08-02T18:00:00.000Z", {
        amountCents: 10_000,
      }),
    );

    // Delivered first despite occurring last: it must not block an earlier
    // legitimate refund that belongs to a different monotonic dimension.
    await ledger.applyVerifiedEvent(
      event("payment.dispute_opened", "2026-08-02T18:03:00.000Z"),
    );
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.refunded", "2026-08-02T18:02:00.000Z", {
          amountCents: 4_000,
        }),
      ),
    ).toMatchObject({
      status: "applied",
      projection: { dispute: "open", refundedAmountCents: 4_000 },
    });

    const projection = ledger.getProjection(reference);
    expect(projection).toMatchObject({
      lifecycle: "captured",
      dispute: "open",
      refundedAmountCents: 4_000,
      lifecycleOccurredAt: "2026-08-02T18:00:00.000Z",
      refundOccurredAt: "2026-08-02T18:02:00.000Z",
      disputeOccurredAt: "2026-08-02T18:03:00.000Z",
      lastOccurredAt: "2026-08-02T18:03:00.000Z",
    });
  });

  it("also applies an older dispute after a newer refund without losing either fact", async () => {
    const ledger = new InMemoryPaymentWebhookLedger();
    await ledger.applyVerifiedEvent(
      event("payment.captured", "2026-08-02T18:00:00.000Z", {
        amountCents: 10_000,
      }),
    );
    await ledger.applyVerifiedEvent(
      event("payment.refunded", "2026-08-02T18:03:00.000Z", {
        amountCents: 2_000,
      }),
    );
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.dispute_opened", "2026-08-02T18:02:00.000Z"),
      ),
    ).toMatchObject({
      status: "applied",
      projection: { dispute: "open", refundedAmountCents: 2_000 },
    });
  });
});

describe("refund and dispute projection", () => {
  async function capturedLedger(): Promise<InMemoryPaymentWebhookLedger> {
    const ledger = new InMemoryPaymentWebhookLedger();
    await ledger.applyVerifiedEvent(
      event("payment.authorized", "2026-08-02T18:00:00.000Z"),
    );
    await ledger.applyVerifiedEvent(
      event("payment.captured", "2026-08-02T18:01:00.000Z", {
        amountCents: 10_000,
      }),
    );
    return ledger;
  }

  it("applies cumulative partial/full refunds monotonically and never exceeds capture", async () => {
    const ledger = await capturedLedger();
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.refunded", "2026-08-02T18:02:00.000Z", {
          amountCents: 4_000,
        }),
      ),
    ).toMatchObject({
      status: "applied",
      projection: { refundedAmountCents: 4_000 },
    });
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.refunded", "2026-08-02T18:03:00.000Z", {
          amountCents: 3_000,
        }),
      ),
    ).toMatchObject({
      status: "quarantined",
      reason: "refund_total_invalid_or_non_monotonic",
    });
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.refunded", "2026-08-02T18:04:00.000Z", {
          amountCents: 10_001,
        }),
      ),
    ).toMatchObject({
      status: "quarantined",
      reason: "refund_total_invalid_or_non_monotonic",
    });
    expect(
      await ledger.applyVerifiedEvent(
        event("payment.refunded", "2026-08-02T18:05:00.000Z", {
          amountCents: 10_000,
        }),
      ),
    ).toMatchObject({
      status: "applied",
      projection: { refundedAmountCents: 10_000 },
    });
  });

  it.each([
    ["won", "payment.dispute_won" as const],
    ["lost", "payment.dispute_lost" as const],
  ])(
    "tracks a dispute through %s without changing captured/refund facts",
    async (finalState, closingType) => {
      const ledger = await capturedLedger();
      await ledger.applyVerifiedEvent(
        event("payment.refunded", "2026-08-02T18:02:00.000Z", {
          amountCents: 1_000,
        }),
      );
      expect(
        await ledger.applyVerifiedEvent(
          event("payment.dispute_opened", "2026-08-02T18:03:00.000Z"),
        ),
      ).toMatchObject({
        status: "applied",
        projection: { dispute: "open" },
      });
      expect(
        await ledger.applyVerifiedEvent(
          event(closingType, "2026-08-02T18:04:00.000Z"),
        ),
      ).toMatchObject({
        status: "applied",
        projection: {
          dispute: finalState,
          capturedAmountCents: 10_000,
          refundedAmountCents: 1_000,
        },
      });
      expect(
        await ledger.applyVerifiedEvent(
          event("payment.dispute_opened", "2026-08-02T18:05:00.000Z"),
        ),
      ).toMatchObject({
        status: "quarantined",
        reason: "closed_dispute_cannot_reopen",
        needsReconciliation: false,
      });
    },
  );

  it("keeps provider references isolated into separate projections", async () => {
    const ledger = await capturedLedger();
    const other = event("payment.failed", "2026-08-02T18:03:00.000Z", {
      providerPaymentReference: "test_pi_payment_2",
    });
    await ledger.applyVerifiedEvent(other);
    expect(ledger.getProjection(reference)?.lifecycle).toBe("captured");
    expect(ledger.getProjection("test_pi_payment_2")?.lifecycle).toBe("failed");
  });

  it("returns detached projection copies so callers cannot mutate the ledger", async () => {
    const ledger = await capturedLedger();
    const projection = ledger.getProjection(
      reference,
    ) as PaymentEventProjection;
    projection.lifecycle = "failed";
    expect(ledger.getProjection(reference)?.lifecycle).toBe("captured");
  });
});
