import { describe, expect, it } from "vitest";

import type { CreateClaimRequest } from "@shared/research/commerce-api";
import type { ProviderResult } from "@shared/research/capability";
import { DisabledPaymentProvider, type PaymentProvider, type PaymentRefund } from "../providers/payment";
import {
  ACCEPTED_CLAIM_REASONS,
  createInMemoryClaimOrderRepository,
  createInMemoryClaimRepository,
  createRefundService,
  type ClaimOrderView,
  type ClaimOutcome,
  type ClaimRepository,
  type RefundService,
  type ResolutionOutcome,
} from "./refunds";

const NOW = new Date("2026-03-01T12:00:00.000Z");

/**
 * Counts refund calls so a replayed key can be proven to move money exactly once.
 * Only the methods this lane touches behave; the rest refuse.
 */
class SpyPaymentProvider implements PaymentProvider {
  readonly name = "spy";
  readonly supportsDeferredCapture = true;
  refundCalls: Array<{ reference: string; amountCents: number; idempotencyKey: string }> = [];

  async createAuthorization(): Promise<ProviderResult<never>> {
    return { ok: false, code: "REJECTED", message: "not used", retryable: false };
  }
  async captureAuthorization(): Promise<ProviderResult<never>> {
    return { ok: false, code: "REJECTED", message: "not used", retryable: false };
  }
  async cancelAuthorization(): Promise<ProviderResult<never>> {
    return { ok: false, code: "REJECTED", message: "not used", retryable: false };
  }
  async refund(
    reference: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<ProviderResult<PaymentRefund>> {
    this.refundCalls.push({ reference, amountCents, idempotencyKey });
    return {
      ok: true,
      value: {
        providerReference: `refund_${this.refundCalls.length}`,
        refundedAmountCents: amountCents,
        status: "refunded",
      },
    };
  }
  async retrieveStatus(): Promise<ProviderResult<{ status: string }>> {
    return { ok: true, value: { status: "captured" } };
  }
  async verifyWebhook(): Promise<ProviderResult<never>> {
    return { ok: false, code: "REJECTED", message: "not used", retryable: false };
  }
}

function deliveredOrder(overrides: Partial<ClaimOrderView> = {}): ClaimOrderView {
  return {
    orderId: "ord_1",
    memberId: "mem_1",
    state: "delivered",
    capturedAmountCents: 12_000,
    paymentReference: "auth_1",
    refundedCents: 0,
    lines: [{ sku: "SKU-A", lotId: "lot_1" }],
    ...overrides,
  };
}

function claimRequest(overrides: Partial<CreateClaimRequest> = {}): CreateClaimRequest {
  return {
    orderId: "ord_1",
    sku: "SKU-A",
    reason: "damaged",
    detail: "Vial arrived cracked.",
    evidenceRefs: ["evidence_abc123"],
    ...overrides,
  };
}

interface Harness {
  service: RefundService;
  payment: SpyPaymentProvider;
  claims: ClaimRepository;
  order: ClaimOrderView;
}

function harness(orderOverrides: Partial<ClaimOrderView> = {}, commerceEnabled = true): Harness {
  const payment = new SpyPaymentProvider();
  const claims = createInMemoryClaimRepository();
  const order = deliveredOrder(orderOverrides);
  const orders = createInMemoryClaimOrderRepository([order]);
  const service = createRefundService({ claims, orders, payment, commerceEnabled });
  return { service, payment, claims, order };
}

function expectClaim(outcome: ClaimOutcome): Extract<ClaimOutcome, { ok: true }> {
  if (!outcome.ok) throw new Error(`expected a claim, got ${outcome.codes.join(",")}`);
  return outcome;
}

function approvedClaim(h: Harness, req: CreateClaimRequest = claimRequest()): string {
  const submitted = expectClaim(h.service.submitClaim("mem_1", req, NOW));
  const reviewed = expectClaim(h.service.reviewClaim(submitted.claim.claimId, "adm_1", "approved", NOW));
  return reviewed.claim.claimId;
}

function expectDenied(outcome: ClaimOutcome | ResolutionOutcome): string[] {
  if (outcome.ok) throw new Error("expected a denial");
  return outcome.codes;
}

describe("refund idempotency survives a process restart", () => {
  // Replay protection used to live in a per-process Map inside the service. That is
  // not idempotency once the service restarts or a second instance handles the retry:
  // the map is empty, the key looks new, and real money moves twice. The record now
  // belongs to the repository, so a fresh service over the same store still refuses.
  it("refuses a replayed refund key through a brand new service instance", async () => {
    const payment = new SpyPaymentProvider();
    const claims = createInMemoryClaimRepository();
    const order = deliveredOrder();
    const orders = createInMemoryClaimOrderRepository([order]);

    const first = createRefundService({ claims, orders, payment, commerceEnabled: true });
    const submitted = expectClaim(first.submitClaim("mem_1", claimRequest(), NOW));
    const approved = expectClaim(
      first.reviewClaim(submitted.claim.claimId, "adm_1", "approved", NOW),
    );
    const refunded = await first.resolveWithRefund(
      approved.claim.claimId,
      "adm_1",
      12_000,
      "key_1",
      NOW,
    );
    expect(refunded.ok).toBe(true);
    expect(payment.refundCalls).toHaveLength(1);

    // The restart: same durable store, a service that has never seen the key.
    const second = createRefundService({ claims, orders, payment, commerceEnabled: true });
    await second.resolveWithRefund(approved.claim.claimId, "adm_1", 12_000, "key_1", NOW);

    // The critical assertion: the provider was not asked to move money a second time.
    expect(payment.refundCalls).toHaveLength(1);
  });

  it("records the key on the repository, not inside the service closure", () => {
    const claims = createInMemoryClaimRepository();
    expect(claims.hasRefundKey("anything")).toBe(false);
    claims.recordRefundKey("scope_a", "ref_1");
    expect(claims.hasRefundKey("scope_a")).toBe(true);
    expect(claims.hasRefundKey("scope_b")).toBe(false);
  });
});

describe("accepted reasons", () => {
  it("accepts exactly the five defect and handling reasons", () => {
    expect(ACCEPTED_CLAIM_REASONS.slice().sort()).toEqual(
      ["damaged", "incorrect", "lost", "missing", "temperature_concern"].sort(),
    );
  });

  it("refuses a change-of-mind claim, because there are no ordinary returns", () => {
    const h = harness();
    const outcome = h.service.submitClaim(
      "mem_1",
      claimRequest({ reason: "changed_mind" as never }),
      NOW,
    );
    expect(expectDenied(outcome)).toContain("forbidden");
    expect(h.claims.listOpen()).toHaveLength(0);
  });

  it("refuses an unopened-package claim the same way", () => {
    const h = harness();
    const outcome = h.service.submitClaim(
      "mem_1",
      claimRequest({ reason: "unopened_package" as never }),
      NOW,
    );
    expect(expectDenied(outcome)).toContain("forbidden");
  });

  it("accepts each enumerated reason", () => {
    ACCEPTED_CLAIM_REASONS.forEach((reason) => {
      const h = harness();
      const outcome = h.service.submitClaim("mem_1", claimRequest({ reason }), NOW);
      expect(expectClaim(outcome).claim.reason).toBe(reason);
    });
  });
});

describe("submitting a claim", () => {
  it("records a submitted claim against the member's own order", () => {
    const h = harness();
    const claim = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    expect(claim.state).toBe("submitted");
    expect(claim.resolution).toBeNull();
    expect(claim.submittedAt).toBe(NOW.toISOString());
  });

  it("never serializes member id, lot, evidence, or notes to the wire shape", () => {
    const h = harness();
    const claim = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    expect(Object.keys(claim).sort()).toEqual(
      ["claimId", "orderId", "reason", "resolution", "sku", "state", "submittedAt"].sort(),
    );
  });

  it("refuses a claim against another member's order without confirming it exists", () => {
    const h = harness();
    const outcome = h.service.submitClaim("mem_2", claimRequest(), NOW);
    expect(expectDenied(outcome)).toEqual(["order_not_found"]);
  });

  it("refuses an unknown order", () => {
    const h = harness();
    const outcome = h.service.submitClaim("mem_1", claimRequest({ orderId: "ord_missing" }), NOW);
    expect(expectDenied(outcome)).toContain("order_not_found");
  });

  it("refuses a sku that is not on the order", () => {
    const h = harness();
    const outcome = h.service.submitClaim("mem_1", claimRequest({ sku: "SKU-Z" }), NOW);
    expect(expectDenied(outcome)).toContain("product_not_found");
  });

  it("refuses an order that never reached the member", () => {
    const h = harness({ state: "checkout_pending" });
    const outcome = h.service.submitClaim("mem_1", claimRequest(), NOW);
    expect(expectDenied(outcome)).toContain("order_state_invalid");
  });

  it("refuses evidence that carries a url or a data uri", () => {
    const h = harness();
    const urlOutcome = h.service.submitClaim(
      "mem_1",
      claimRequest({ evidenceRefs: ["https://private.example.com/vial.jpg"] }),
      NOW,
    );
    expect(expectDenied(urlOutcome)).toContain("forbidden");

    const dataOutcome = h.service.submitClaim(
      "mem_1",
      claimRequest({ evidenceRefs: ["data:image/png;base64,AAAA"] }),
      NOW,
    );
    expect(expectDenied(dataOutcome)).toContain("forbidden");
  });

  it("accumulates every reason rather than stopping at the first", () => {
    const h = harness({ state: "checkout_pending" });
    const codes = expectDenied(
      h.service.submitClaim(
        "mem_1",
        claimRequest({ reason: "changed_mind" as never, sku: "SKU-Z", evidenceRefs: ["http://x/y"] }),
        NOW,
      ),
    );
    expect(codes).toContain("forbidden");
    expect(codes).toContain("order_state_invalid");
    expect(codes).toContain("product_not_found");
  });

  it("refuses while commerce is disabled", () => {
    const h = harness({}, false);
    expect(expectDenied(h.service.submitClaim("mem_1", claimRequest(), NOW))).toContain(
      "commerce_disabled",
    );
  });

  it("absorbs a duplicate submit rather than opening a second claim", () => {
    const h = harness();
    const first = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    const second = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    expect(second.claimId).toBe(first.claimId);
    expect(h.claims.listByOrder("ord_1")).toHaveLength(1);
  });
});

describe("member reads", () => {
  it("returns null for another member's claim", () => {
    const h = harness();
    const claim = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    expect(h.service.getForMember("mem_1", claim.claimId)).not.toBeNull();
    expect(h.service.getForMember("mem_2", claim.claimId)).toBeNull();
  });

  it("lists only the member's own claims", () => {
    const h = harness();
    expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW));
    expect(h.service.listForMember("mem_1")).toHaveLength(1);
    expect(h.service.listForMember("mem_2")).toHaveLength(0);
  });
});

describe("review", () => {
  it("moves submitted to approved and records the reviewer", () => {
    const h = harness();
    const claim = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    const reviewed = expectClaim(h.service.reviewClaim(claim.claimId, "adm_1", "approved", NOW));
    expect(reviewed.claim.state).toBe("approved");
    expect(h.claims.get(claim.claimId)?.reviewedBy).toBe("adm_1");
  });

  it("refuses to review a declined claim again", () => {
    const h = harness();
    const claim = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    expectClaim(h.service.reviewClaim(claim.claimId, "adm_1", "declined", NOW));
    expect(expectDenied(h.service.reviewClaim(claim.claimId, "adm_1", "approved", NOW))).toContain(
      "order_state_invalid",
    );
  });

  it("drops a closed claim off the admin queue", () => {
    const h = harness();
    const claim = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    expect(h.service.listOpenForAdmin()).toHaveLength(1);
    expectClaim(h.service.reviewClaim(claim.claimId, "adm_1", "declined", NOW));
    expect(h.service.listOpenForAdmin()).toHaveLength(0);
  });
});

describe("replacement never restocks", () => {
  it("resolves with a replacement and destroys the returned unit", () => {
    const h = harness();
    const claimId = approvedClaim(h);
    const outcome = h.service.resolveWithReplacement(claimId, "adm_1", NOW);
    if (!outcome.ok) throw new Error("expected a resolution");
    expect(outcome.claim.state).toBe("resolved");
    expect(outcome.claim.resolution).toBe("replacement");
    expect(outcome.restockedUnits).toBe(0);
    expect(outcome.returnedLotDisposition).toBe("destroyed");
    // The disposition may never be an allocatable one. Chain of custody is broken.
    expect(outcome.returnedLotDisposition).not.toBe("available");
  });

  it("moves the order to replaced without any provider call", () => {
    const h = harness();
    const claimId = approvedClaim(h);
    h.service.resolveWithReplacement(claimId, "adm_1", NOW);
    expect(h.order.state).toBe("replaced");
    expect(h.payment.refundCalls).toHaveLength(0);
  });

  it("refuses a replacement while commerce is disabled", () => {
    const payment = new SpyPaymentProvider();
    const claims = createInMemoryClaimRepository();
    const order = deliveredOrder();
    const orders = createInMemoryClaimOrderRepository([order]);
    // Approve the claim while the capability is on, then take it away.
    const enabled = createRefundService({ claims, orders, payment, commerceEnabled: true });
    const submitted = expectClaim(enabled.submitClaim("mem_1", claimRequest(), NOW));
    expectClaim(enabled.reviewClaim(submitted.claim.claimId, "adm_1", "approved", NOW));

    const disabled = createRefundService({ claims, orders, payment, commerceEnabled: false });
    const outcome = disabled.resolveWithReplacement(submitted.claim.claimId, "adm_1", NOW);

    expect(expectDenied(outcome)).toContain("commerce_disabled");
    expect(order.state).toBe("delivered");
    expect(claims.get(submitted.claim.claimId)?.state).toBe("approved");
  });

  it("refuses a replacement for a claim that was never approved", () => {
    const h = harness();
    const claim = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    expect(expectDenied(h.service.resolveWithReplacement(claim.claimId, "adm_1", NOW))).toContain(
      "order_state_invalid",
    );
  });

  it("refuses a replacement the order cannot legally record", () => {
    const h = harness({ state: "processing" });
    const claimId = approvedClaim(h);
    expect(expectDenied(h.service.resolveWithReplacement(claimId, "adm_1", NOW))).toContain(
      "order_state_invalid",
    );
    expect(h.order.state).toBe("processing");
  });
});

describe("refund", () => {
  it("refunds through the provider and carries its reference into the transition", async () => {
    const h = harness();
    const claimId = approvedClaim(h);
    const outcome = await h.service.resolveWithRefund(claimId, "adm_1", 12_000, "key_1", NOW);
    if (!outcome.ok) throw new Error("expected a resolution");
    expect(outcome.claim.resolution).toBe("refund");
    expect(h.payment.refundCalls).toEqual([
      { reference: "auth_1", amountCents: 12_000, idempotencyKey: "key_1" },
    ]);
    expect(h.order.state).toBe("refunded");
    expect(h.order.refundedCents).toBe(12_000);
  });

  it("marks a smaller refund as partial", async () => {
    const h = harness();
    const claimId = approvedClaim(h);
    const outcome = await h.service.resolveWithRefund(claimId, "adm_1", 4_000, "key_1", NOW);
    if (!outcome.ok) throw new Error("expected a resolution");
    expect(outcome.claim.resolution).toBe("partial_refund");
    expect(h.order.refundedCents).toBe(4_000);
  });

  it("never restocks on a refund either", async () => {
    const h = harness();
    const claimId = approvedClaim(h);
    const outcome = await h.service.resolveWithRefund(claimId, "adm_1", 12_000, "key_1", NOW);
    if (!outcome.ok) throw new Error("expected a resolution");
    expect(outcome.restockedUnits).toBe(0);
    expect(outcome.returnedLotDisposition).toBe("destroyed");
  });

  it("refuses a refund above the captured amount without calling the provider", async () => {
    const h = harness();
    const claimId = approvedClaim(h);
    const outcome = await h.service.resolveWithRefund(claimId, "adm_1", 12_001, "key_1", NOW);
    expect(expectDenied(outcome)).toContain("payment_failed");
    expect(h.payment.refundCalls).toHaveLength(0);
    expect(h.order.state).toBe("delivered");
  });

  it("bounds the second partial refund by what is left of the capture", async () => {
    const h = harness();
    const first = approvedClaim(h);
    await h.service.resolveWithRefund(first, "adm_1", 10_000, "key_1", NOW);
    // The order is terminal after a refund, so a further refund is refused outright.
    const second = await h.service.resolveWithRefund(first, "adm_1", 5_000, "key_2", NOW);
    expect(expectDenied(second).length).toBeGreaterThan(0);
    expect(h.payment.refundCalls).toHaveLength(1);
    expect(h.order.refundedCents).toBe(10_000);
  });

  it("refuses a fractional amount", async () => {
    const h = harness();
    const claimId = approvedClaim(h);
    const outcome = await h.service.resolveWithRefund(claimId, "adm_1", 12.5, "key_1", NOW);
    expect(expectDenied(outcome)).toContain("payment_failed");
    expect(h.payment.refundCalls).toHaveLength(0);
  });

  it("refuses a zero or negative amount", async () => {
    const h = harness();
    const claimId = approvedClaim(h);
    expect(expectDenied(await h.service.resolveWithRefund(claimId, "adm_1", 0, "k", NOW))).toContain(
      "payment_failed",
    );
    expect(
      expectDenied(await h.service.resolveWithRefund(claimId, "adm_1", -500, "k2", NOW)),
    ).toContain("payment_failed");
    expect(h.payment.refundCalls).toHaveLength(0);
  });

  it("refuses when the order carries no provider reference", async () => {
    const h = harness({ paymentReference: null, capturedAmountCents: 0 });
    const claimId = approvedClaim(h);
    const outcome = await h.service.resolveWithRefund(claimId, "adm_1", 1_000, "key_1", NOW);
    expect(expectDenied(outcome)).toContain("payment_failed");
    expect(h.payment.refundCalls).toHaveLength(0);
  });

  it("leaves the claim approved and unpaid when the provider is disabled", async () => {
    const claims = createInMemoryClaimRepository();
    const order = deliveredOrder();
    const orders = createInMemoryClaimOrderRepository([order]);
    const service = createRefundService({
      claims,
      orders,
      payment: new DisabledPaymentProvider(),
      commerceEnabled: true,
    });
    const submitted = expectClaim(service.submitClaim("mem_1", claimRequest(), NOW));
    expectClaim(service.reviewClaim(submitted.claim.claimId, "adm_1", "approved", NOW));

    const outcome = await service.resolveWithRefund(
      submitted.claim.claimId,
      "adm_1",
      12_000,
      "key_1",
      NOW,
    );
    expect(expectDenied(outcome)).toEqual(["payment_disabled"]);
    // Approved but unpaid is the honest state. Nothing is resolved and nothing moved.
    expect(claims.get(submitted.claim.claimId)?.state).toBe("approved");
    expect(claims.get(submitted.claim.claimId)?.resolution).toBeNull();
    expect(order.state).toBe("delivered");
    expect(order.refundedCents).toBe(0);
  });

  it("issues one refund for a repeated idempotency key", async () => {
    const h = harness();
    const claimId = approvedClaim(h);
    const first = await h.service.resolveWithRefund(claimId, "adm_1", 6_000, "key_1", NOW);
    const replay = await h.service.resolveWithRefund(claimId, "adm_1", 6_000, "key_1", NOW);
    if (!first.ok || !replay.ok) throw new Error("expected both to be absorbed as resolutions");
    expect(h.payment.refundCalls).toHaveLength(1);
    expect(h.order.refundedCents).toBe(6_000);
    expect(replay.claim.claimId).toBe(first.claim.claimId);
  });

  it("reports a misconfigured provider as a capability state, never as retryable", async () => {
    class MisconfiguredProvider extends SpyPaymentProvider {
      async refund(): Promise<ProviderResult<PaymentRefund>> {
        return {
          ok: false,
          code: "MISCONFIGURED",
          message: "Refund credential is absent.",
          retryable: false,
        };
      }
    }
    const payment = new MisconfiguredProvider();
    const claims = createInMemoryClaimRepository();
    const order = deliveredOrder();
    const orders = createInMemoryClaimOrderRepository([order]);
    const service = createRefundService({ claims, orders, payment, commerceEnabled: true });
    const submitted = expectClaim(service.submitClaim("mem_1", claimRequest(), NOW));
    expectClaim(service.reviewClaim(submitted.claim.claimId, "adm_1", "approved", NOW));

    const outcome = await service.resolveWithRefund(
      submitted.claim.claimId,
      "adm_1",
      12_000,
      "key_1",
      NOW,
    );

    // payment_failed would invite a retry that cannot succeed until the credential exists.
    expect(expectDenied(outcome)).toEqual(["payment_disabled"]);
    expect(claims.get(submitted.claim.claimId)?.state).toBe("approved");
    expect(order.state).toBe("delivered");
    expect(order.refundedCents).toBe(0);
  });

  it("never lets a provider figure understate what was refunded", async () => {
    class UnderReportingProvider extends SpyPaymentProvider {
      async refund(
        reference: string,
        amountCents: number,
        idempotencyKey: string,
      ): Promise<ProviderResult<PaymentRefund>> {
        this.refundCalls.push({ reference, amountCents, idempotencyKey });
        // A negative or short figure would inflate what is still refundable.
        return {
          ok: true,
          value: { providerReference: "refund_1", refundedAmountCents: -6_000, status: "refunded" },
        };
      }
    }
    const payment = new UnderReportingProvider();
    const claims = createInMemoryClaimRepository();
    const order = deliveredOrder();
    const orders = createInMemoryClaimOrderRepository([order]);
    const service = createRefundService({ claims, orders, payment, commerceEnabled: true });
    const submitted = expectClaim(service.submitClaim("mem_1", claimRequest(), NOW));
    expectClaim(service.reviewClaim(submitted.claim.claimId, "adm_1", "approved", NOW));

    const outcome = await service.resolveWithRefund(
      submitted.claim.claimId,
      "adm_1",
      6_000,
      "key_1",
      NOW,
    );

    expect(outcome.ok).toBe(true);
    expect(order.refundedCents).toBe(6_000);
    expect(order.capturedAmountCents - order.refundedCents).toBe(6_000);
  });

  it("refuses a refund on a claim that was never approved", async () => {
    const h = harness();
    const claim = expectClaim(h.service.submitClaim("mem_1", claimRequest(), NOW)).claim;
    const outcome = await h.service.resolveWithRefund(claim.claimId, "adm_1", 1_000, "key_1", NOW);
    expect(expectDenied(outcome)).toContain("order_state_invalid");
    expect(h.payment.refundCalls).toHaveLength(0);
  });

  it("refuses when the order state cannot record a refund", async () => {
    const h = harness({ state: "processing" });
    const claimId = approvedClaim(h);
    const outcome = await h.service.resolveWithRefund(claimId, "adm_1", 1_000, "key_1", NOW);
    expect(expectDenied(outcome)).toContain("order_state_invalid");
    expect(h.payment.refundCalls).toHaveLength(0);
  });
});
