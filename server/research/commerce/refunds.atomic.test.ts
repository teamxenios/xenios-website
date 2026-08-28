import { describe, expect, it } from "vitest";

import type { ProviderResult } from "@shared/research/capability";
import type { PaymentProvider, PaymentRefund } from "../providers/payment";
import {
  createInMemoryClaimOrderRepository,
  createInMemoryClaimRepository,
  createInMemoryRefundCommandStore,
  createRefundService,
  type ClaimOrderView,
  type ClaimRecord,
  type RefundCrashPoint,
} from "./refunds";

const AS_OF = new Date("2026-08-28T09:00:00.000Z");

function approvedClaim(): ClaimRecord {
  return {
    claimId: "clm_atomic_1",
    orderId: "ord_atomic_1",
    memberId: "mem_atomic_1",
    sku: "SKU-ATOMIC",
    lotId: "lot_atomic_1",
    reason: "damaged",
    state: "approved",
    resolution: null,
    evidenceRefs: ["evidence_atomic_1"],
    submittedAt: AS_OF.toISOString(),
    reviewedBy: "admin_reviewer",
    notes: "Approved defect claim.",
  };
}

function refundableOrder(): ClaimOrderView {
  return {
    orderId: "ord_atomic_1",
    memberId: "mem_atomic_1",
    state: "delivered",
    capturedAmountCents: 10_000,
    paymentReference: "pi_atomic_captured_1",
    refundedCents: 0,
    lines: [{ sku: "SKU-ATOMIC", lotId: "lot_atomic_1" }],
  };
}

class ScriptedRefundProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly supportsDeferredCapture = true;
  readonly calls: Array<{ reference: string; amountCents: number; idempotencyKey: string }> = [];

  constructor(
    private readonly script: (
      call: { reference: string; amountCents: number; idempotencyKey: string },
      index: number,
    ) => Promise<ProviderResult<PaymentRefund>> | ProviderResult<PaymentRefund>,
  ) {}

  async createAuthorization(): Promise<ProviderResult<never>> {
    return { ok: false, code: "REJECTED", message: "unused", retryable: false };
  }
  async captureAuthorization(): Promise<ProviderResult<never>> {
    return { ok: false, code: "REJECTED", message: "unused", retryable: false };
  }
  async cancelAuthorization(): Promise<ProviderResult<never>> {
    return { ok: false, code: "REJECTED", message: "unused", retryable: false };
  }
  async refund(
    reference: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<ProviderResult<PaymentRefund>> {
    const call = { reference, amountCents, idempotencyKey };
    this.calls.push(call);
    return this.script(call, this.calls.length);
  }
  async retrieveStatus(): Promise<ProviderResult<{ status: string }>> {
    return { ok: true, value: { status: "captured" } };
  }
  async verifyWebhook(): Promise<ProviderResult<never>> {
    return { ok: false, code: "REJECTED", message: "unused", retryable: false };
  }
}

function successProvider(
  beforeReturn?: () => void | Promise<void>,
): ScriptedRefundProvider {
  return new ScriptedRefundProvider(async (_call, index) => {
    await beforeReturn?.();
    return {
      ok: true,
      value: {
        providerReference: `re_atomic_${index}`,
        refundedAmountCents: 4_000,
        status: "refunded",
      },
    };
  });
}

function harness(input: {
  payment?: ScriptedRefundProvider;
  crashAt?: RefundCrashPoint;
} = {}) {
  const claim = approvedClaim();
  const order = refundableOrder();
  const claims = createInMemoryClaimRepository([claim]);
  const orders = createInMemoryClaimOrderRepository([order]);
  const refundCommands = createInMemoryRefundCommandStore({ claims, orders });
  const payment = input.payment ?? successProvider();
  let armed = input.crashAt;
  const crashAt = async (point: RefundCrashPoint) => {
    if (armed === point) {
      armed = undefined;
      throw new Error(`simulated crash: ${point}`);
    }
  };
  const service = createRefundService({
    claims,
    orders,
    refundCommands,
    payment,
    commerceEnabled: true,
    crashAt,
  });
  return { claim, order, claims, orders, refundCommands, payment, service };
}

function refund(h: ReturnType<typeof harness>, key = "client-refund-key-1") {
  return h.service.resolveWithRefund(h.claim.claimId, "admin_1", 4_000, key, AS_OF);
}

describe("durable refund command concurrency", () => {
  it("allows at most one provider execution across concurrent same-key requests", async () => {
    let release!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const payment = successProvider(() => providerGate);
    const h = harness({ payment });

    const first = refund(h);
    const second = refund(h);
    await Promise.resolve();
    await Promise.resolve();
    release();
    const outcomes = await Promise.all([first, second]);

    expect(payment.calls).toHaveLength(1);
    expect(new Set(payment.calls.map((call) => call.idempotencyKey)).size).toBe(1);
    expect(payment.calls[0]!.idempotencyKey).toMatch(/^xrrf_v1_[0-9a-f]{64}$/);
    expect(outcomes.some((outcome) => outcome.ok)).toBe(true);
    expect(h.order.refundedCents).toBe(4_000);
    await expect(h.claims.hasRefundKey("clm_atomic_1:client-refund-key-1")).resolves.toBe(true);
  });

  it("serializes different keys against the same captured balance", async () => {
    let release!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const payment = successProvider(() => providerGate);
    const h = harness({ payment });
    const first = refund(h, "key-a");
    const second = refund(h, "key-b");
    await Promise.resolve();
    await Promise.resolve();
    release();
    const outcomes = await Promise.all([first, second]);

    expect(payment.calls).toHaveLength(1);
    expect(h.order.refundedCents).toBe(4_000);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    const denied = outcomes.find((outcome) => !outcome.ok);
    expect(denied && !denied.ok ? denied.codes : []).toContain("capability_disabled");
    if (denied && !denied.ok) expect(denied.refundState).toBe("pending");
  });

  it("treats a reused client key with a different amount as a conflict before a second provider call", async () => {
    const h = harness();
    expect((await refund(h)).ok).toBe(true);
    const conflict = await h.service.resolveWithRefund(
      h.claim.claimId,
      "admin_1",
      3_000,
      "client-refund-key-1",
      AS_OF,
    );
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.codes).toEqual(["idempotency_conflict"]);
    expect(h.payment.calls).toHaveLength(1);
  });
});

describe("durable refund command crash boundaries", () => {
  it("records intent before provider I/O and can safely resume that prepared intent", async () => {
    const h = harness({ crashAt: "after_intent_persisted" });
    await expect(refund(h)).rejects.toThrow("after_intent_persisted");
    expect(h.payment.calls).toHaveLength(0);
    expect(h.refundCommands.inspect()).toMatchObject([{ state: "prepared", attempt: 0 }]);

    const resumed = await refund(h);
    expect(resumed.ok).toBe(true);
    expect(h.payment.calls).toHaveLength(1);
  });

  it("quarantines a crash after execution permission but before provider I/O", async () => {
    const h = harness({ crashAt: "after_execution_claimed" });
    await expect(refund(h)).rejects.toThrow("after_execution_claimed");
    expect(h.payment.calls).toHaveLength(0);
    expect(h.refundCommands.inspect()).toMatchObject([
      { state: "provider_in_flight", attempt: 1 },
    ]);

    const retry = await refund(h);
    expect(retry.ok).toBe(false);
    if (!retry.ok) {
      expect(retry.codes).toEqual(["capability_disabled"]);
      expect(retry.refundState).toBe("reconciliation_required");
    }
    expect(h.payment.calls).toHaveLength(0);
    expect(h.order.refundedCents).toBe(0);
    expect(h.claim.state).toBe("approved");
  });

  it("never calls the provider again after a crash following its response", async () => {
    const h = harness({ crashAt: "after_provider_response" });
    await expect(refund(h)).rejects.toThrow("after_provider_response");
    expect(h.payment.calls).toHaveLength(1);
    expect(h.order.refundedCents).toBe(0);
    expect(h.claim.state).toBe("approved");

    const retry = await refund(h);
    expect(retry.ok).toBe(false);
    if (!retry.ok) {
      expect(retry.codes).toEqual(["capability_disabled"]);
      expect(retry.refundState).toBe("reconciliation_required");
    }
    expect(h.payment.calls).toHaveLength(1);
  });

  it("absorbs a restart after the atomic publish without a second provider call", async () => {
    const h = harness({ crashAt: "after_atomic_publish" });
    await expect(refund(h)).rejects.toThrow("after_atomic_publish");
    expect(h.payment.calls).toHaveLength(1);
    expect(h.order.state).toBe("refunded");
    expect(h.claim.state).toBe("resolved");

    const restarted = createRefundService({
      claims: h.claims,
      orders: h.orders,
      refundCommands: h.refundCommands,
      payment: h.payment,
      commerceEnabled: true,
    });
    const replay = await restarted.resolveWithRefund(
      h.claim.claimId,
      "admin_1",
      4_000,
      "client-refund-key-1",
      AS_OF,
    );
    expect(replay.ok).toBe(true);
    expect(h.payment.calls).toHaveLength(1);
  });
});

describe("closed provider outcome map", () => {
  it("quarantines a thrown provider call because delivery of the request is unknowable", async () => {
    const payment = new ScriptedRefundProvider(() => {
      throw new Error("socket ended after write");
    });
    const h = harness({ payment });
    const first = await refund(h);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.codes).toEqual(["capability_disabled"]);
      expect(first.refundState).toBe("reconciliation_required");
    }
    const retry = await refund(h);
    expect(retry.ok).toBe(false);
    expect(payment.calls).toHaveLength(1);
    expect(h.refundCommands.inspect()).toMatchObject([{ state: "reconciliation_required" }]);
  });

  it("turns a transport/unknown result into reconciliation and never retries ordinarily", async () => {
    const payment = new ScriptedRefundProvider(() => ({
      ok: false,
      code: "RETRYABLE",
      message: "transport ended without a response",
      retryable: true,
    }));
    const h = harness({ payment });
    const first = await refund(h);
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.codes).toEqual(["capability_disabled"]);
      expect(first.refundState).toBe("reconciliation_required");
    }
    const second = await refund(h);
    expect(second.ok).toBe(false);
    expect(payment.calls).toHaveLength(1);
    expect(h.refundCommands.inspect()).toMatchObject([{ state: "reconciliation_required" }]);
  });

  it("lets a trusted reconciler publish exact confirmed proof without re-executing the provider", async () => {
    const payment = new ScriptedRefundProvider(() => ({
      ok: false,
      code: "RETRYABLE",
      message: "transport ended without a response",
      retryable: true,
    }));
    const h = harness({ payment });
    expect((await refund(h)).ok).toBe(false);
    const [command] = h.refundCommands.inspect();
    expect(command).toMatchObject({ state: "reconciliation_required", attempt: 1 });

    const reconciled = await h.refundCommands.complete({
      commandId: command!.commandId,
      providerIdempotencyKey: command!.providerIdempotencyKey,
      attempt: command!.attempt,
      providerRefundReference: "re_reconciled_1",
      providerRefundedAmountCents: 4_000,
      asOf: AS_OF,
    });

    expect(reconciled.outcome).toBe("applied");
    expect(payment.calls).toHaveLength(1);
    expect(h.order).toMatchObject({ state: "refunded", refundedCents: 4_000 });
    expect(h.claim).toMatchObject({ state: "resolved", resolution: "partial_refund" });
  });

  it("retries a confirmed capability refusal only with the exact same provider key", async () => {
    const payment = new ScriptedRefundProvider((_call, index) =>
      index === 1
        ? {
            ok: false,
            code: "MISCONFIGURED",
            message: "credential missing",
            retryable: false,
          }
        : {
            ok: true,
            value: {
              providerReference: "re_recovered_1",
              refundedAmountCents: 4_000,
              status: "refunded",
            },
          },
    );
    const h = harness({ payment });
    const first = await refund(h);
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.codes).toEqual(["payment_disabled"]);
    expect(h.refundCommands.inspect()).toMatchObject([{ state: "provider_retryable", attempt: 1 }]);

    const second = await refund(h);
    expect(second.ok).toBe(true);
    expect(payment.calls).toHaveLength(2);
    expect(payment.calls[1]!.idempotencyKey).toBe(payment.calls[0]!.idempotencyKey);
    expect(h.refundCommands.inspect()).toMatchObject([{ state: "applied", attempt: 2 }]);
  });

  it("makes a confirmed permanent refusal terminal for that command", async () => {
    const payment = new ScriptedRefundProvider(() => ({
      ok: false,
      code: "REJECTED",
      message: "provider refused the refund",
      retryable: false,
    }));
    const h = harness({ payment });
    expect((await refund(h)).ok).toBe(false);
    expect((await refund(h)).ok).toBe(false);
    expect(payment.calls).toHaveLength(1);
    expect(h.refundCommands.inspect()).toMatchObject([{ state: "terminal_refused" }]);
  });

  it("quarantines an order mutation that races after provider confirmation", async () => {
    let h!: ReturnType<typeof harness>;
    const payment = successProvider(() => {
      h.order.state = "exception";
    });
    h = harness({ payment });
    const outcome = await refund(h);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.codes).toEqual(["capability_disabled"]);
      expect(outcome.refundState).toBe("reconciliation_required");
    }
    expect(payment.calls).toHaveLength(1);
    expect(h.order.state).toBe("exception");
    expect(h.order.refundedCents).toBe(0);
    expect(h.claim.state).toBe("approved");
  });

  it("mutates nothing when validation fails before provider execution", async () => {
    const h = harness();
    const invalid = await h.service.resolveWithRefund(
      h.claim.claimId,
      "admin_1",
      0,
      "key-invalid",
      AS_OF,
    );
    expect(invalid.ok).toBe(false);
    expect(h.refundCommands.inspect()).toEqual([]);
    expect(h.payment.calls).toHaveLength(0);
    expect(h.order.state).toBe("delivered");
    expect(h.claim.state).toBe("approved");
  });
});
