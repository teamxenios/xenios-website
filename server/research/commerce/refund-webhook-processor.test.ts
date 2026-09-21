import { describe, expect, it } from "vitest";
import { createInMemoryRefundExecutionStore, type DurableRefundExecutionStore } from "./refund-executions";
import { createRefundWebhookProcessor } from "./refund-webhook-processor";
import { createInMemoryWebhookExecutionInbox } from "./webhook-execution-processor";

const NOW = new Date("2026-09-21T12:00:00.000Z");
const CLAIM_ID = "00000000-0000-4000-8000-0000000000c1";
const ORDER_ID = "00000000-0000-4000-8000-0000000000d1";
const EXECUTION_ID = "00000000-0000-4000-8000-0000000000e1";

async function setup() {
  type Claim = { claimId: string; orderId: string; state: string; resolution: null | "refund" | "partial_refund" | "replacement" | "none"; reviewedBy: string | null };
  type Order = { orderId: string; state: string; capturedAmountCents: number; refundedCents: number; lastAppliedIdempotencyKey?: string };
  const claim: Claim = { claimId: CLAIM_ID, orderId: ORDER_ID, state: "approved", resolution: null, reviewedBy: null };
  const order: Order = { orderId: ORDER_ID, state: "delivered", capturedAmountCents: 5_000, refundedCents: 0 };
  const claims = {
    async get(id: string) { return id === CLAIM_ID ? { ...claim } : null; },
    async save(next: Claim) { Object.assign(claim, next); },
  };
  const orders = {
    async get(id: string) { return id === ORDER_ID ? { ...order } : null; },
    async save(next: Order) { Object.assign(order, next); },
  };
  const executions = createInMemoryRefundExecutionStore({ claims, orders });
  const prepared = await executions.prepare({
    executionId: EXECUTION_ID,
    scope: "xr-refund-v1-webhook-test",
    claimId: CLAIM_ID,
    orderId: ORDER_ID,
    adminId: "admin-1",
    paymentReference: "pi_webhook_1",
    amountCents: 5_000,
    currency: "usd",
    createdAt: NOW.toISOString(),
  });
  await executions.claim(EXECUTION_ID, prepared.version, NOW);
  const inbox = createInMemoryWebhookExecutionInbox();
  const event = {
    eventId: "evt_refund_1",
    eventType: "payment.refunded",
    providerReference: "pi_webhook_1",
    refundReference: "re_webhook_1",
    refundExecutionId: EXECUTION_ID,
    amountCents: 5_000,
    currency: "usd",
    verified: true as const,
  };
  return { claim, order, executions, inbox, event };
}

describe("durable refund webhook settlement", () => {
  it("commits exact signed refund evidence and terminalizes the inbox only afterward", async () => {
    const h = await setup();
    const processor = createRefundWebhookProcessor({
      providerName: "stripe",
      expectedProviderAccountId: null,
      inbox: h.inbox,
      executions: h.executions,
    });

    await expect(processor.process(h.event, "a".repeat(64), NOW)).resolves.toEqual({
      outcome: "applied",
      executionId: EXECUTION_ID,
    });
    expect(await h.executions.getById(EXECUTION_ID)).toMatchObject({
      state: "committed",
      providerRefundReference: "re_webhook_1",
    });
    expect(h.order).toMatchObject({ state: "refunded", refundedCents: 5_000 });
    expect(h.claim).toMatchObject({ state: "resolved", resolution: "refund" });
    expect(h.inbox.snapshot()[0]).toMatchObject({ state: "processed", outcome: "applied" });
  });

  it("resumes after a crash between provider evidence and atomic local completion", async () => {
    const h = await setup();
    let failCommit = true;
    const crashing: DurableRefundExecutionStore = {
      ...h.executions,
      async commit(id, version) {
        if (failCommit) {
          failCommit = false;
          throw new Error("simulated transaction interruption");
        }
        return h.executions.commit(id, version);
      },
    };
    const processor = createRefundWebhookProcessor({
      providerName: "stripe",
      expectedProviderAccountId: null,
      inbox: h.inbox,
      executions: crashing,
    });

    await expect(processor.process(h.event, "b".repeat(64), NOW)).resolves.toEqual({
      outcome: "retry",
      reason: "refund_execution_contention",
    });
    expect(h.inbox.snapshot()[0]).toMatchObject({ state: "processing" });
    expect(await h.executions.getById(EXECUTION_ID)).toMatchObject({ state: "provider_succeeded" });

    await expect(processor.process(h.event, "b".repeat(64), new Date(NOW.getTime() + 1_000))).resolves.toEqual({
      outcome: "applied",
      executionId: EXECUTION_ID,
    });
    expect(h.inbox.snapshot()[0]).toMatchObject({ state: "processed", outcome: "applied" });
  });

  it("isolates mismatched signed evidence without changing the claim or order", async () => {
    const h = await setup();
    const processor = createRefundWebhookProcessor({
      providerName: "stripe",
      expectedProviderAccountId: null,
      inbox: h.inbox,
      executions: h.executions,
    });

    await expect(processor.process({ ...h.event, amountCents: 4_999 }, "c".repeat(64), NOW)).resolves.toMatchObject({
      outcome: "isolated",
      reason: "refund_evidence_mismatch",
    });
    expect(h.order).toMatchObject({ state: "delivered", refundedCents: 0 });
    expect(h.claim).toMatchObject({ state: "approved", resolution: null });
    expect(h.inbox.snapshot()[0]).toMatchObject({ state: "isolated", reason: "refund_evidence_mismatch" });
  });

  it("absorbs an exact duplicate and acknowledges a later exact event after commit", async () => {
    const h = await setup();
    const processor = createRefundWebhookProcessor({
      providerName: "stripe",
      expectedProviderAccountId: null,
      inbox: h.inbox,
      executions: h.executions,
    });
    await processor.process(h.event, "d".repeat(64), NOW);
    await expect(processor.process(h.event, "d".repeat(64), NOW)).resolves.toEqual({ outcome: "duplicate" });
    await expect(processor.process({ ...h.event, eventId: "evt_refund_2" }, "e".repeat(64), NOW)).resolves.toEqual({
      outcome: "acknowledged",
      executionId: EXECUTION_ID,
    });
  });
});
