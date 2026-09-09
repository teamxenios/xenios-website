import crypto from "crypto";
import { describe, expect, it } from "vitest";
import type { CheckoutExecutionRecord, ProviderExecutionResult } from "@shared/research/durable-checkout-execution";
import { StripePaymentAdapter, TestPaymentProvider, type WebhookVerification } from "../providers/payment";
import { createDurableCheckoutExecutor, type CanonicalCheckoutExecutionStore, type IdempotentCheckoutPaymentPort } from "./durable-checkout-executor";
import { createInMemoryWebhookAtomicStore, createInMemoryWebhookEventStore, createWebhookHandler } from "./webhooks";
import {
  createInMemoryWebhookExecutionInbox,
  createWebhookExecutionProcessor,
  type WebhookExecutionStore,
} from "./webhook-execution-processor";

const NOW = new Date("2026-09-09T12:00:00Z");
const base: CheckoutExecutionRecord = {
  executionId: "exe-1",
  requestKey: "req-1",
  phase: "authorizing",
  version: 2,
  providerReference: "pi_0001",
  orderId: "11111111-1111-4111-8111-111111111111",
  memberId: "22222222-2222-4222-8222-222222222222",
  amountCents: 33_999,
  currency: "usd",
  paymentMethodReference: "pm_fixture",
  quoteFingerprint: "quote-1",
  authorizationKey: "xr-auth-key-0001",
  captureKey: "xr-capture-key-0001",
  cancelKey: "xr-cancel-key-0001",
  reservationIds: ["res-1"],
  createdAt: "2026-09-09T00:00:00Z",
  authorizationAttemptedAt: null,
  settledAt: null,
};

/** Execution store double with version compare-and-swap and reference/order lookups. Test only. */
function executions(initial: CheckoutExecutionRecord | null, options: { contend?: number } = {}) {
  let current = initial ? structuredClone(initial) : null;
  let contend = options.contend ?? 0;
  const writes: ProviderExecutionResult[] = [];
  const store: WebhookExecutionStore & CanonicalCheckoutExecutionStore = {
    authority: "canonical_checkout_transaction_v1",
    async findByProviderReference(reference) {
      return current && current.providerReference === reference ? structuredClone(current) : null;
    },
    async findByOrder(orderId) {
      return current && current.orderId === orderId ? structuredClone(current) : null;
    },
    async getForMember(memberId, requestKey) {
      return current && current.memberId === memberId && current.requestKey === requestKey ? structuredClone(current) : null;
    },
    async claim(_id, expected, phase) {
      if (!current || current.version !== expected) return null;
      current = { ...current, phase, version: expected + 1 };
      return structuredClone(current);
    },
    async recordProvider(_id, expected, result) {
      if (contend > 0) {
        contend -= 1;
        return null;
      }
      if (!current || current.version !== expected) return null;
      writes.push(result);
      const phase: CheckoutExecutionRecord["phase"] = result.kind === "unknown" || result.kind === "refused" ? "reconciliation_required" : result.kind;
      current = { ...current, phase, version: expected + 1, providerReference: "providerReference" in result ? result.providerReference : current.providerReference };
      return structuredClone(current);
    },
    async commitCaptured(_id, expected) {
      if (!current || current.version !== expected) return null;
      current = { ...current, phase: "committed", version: expected + 1 };
      return structuredClone(current);
    },
    async commitCancelled() {
      return null;
    },
  };
  return { store, writes, snapshot: () => (current ? structuredClone(current) : null) };
}

function verified(overrides: Partial<WebhookVerification> = {}): WebhookVerification {
  return {
    eventId: "evt_1",
    eventType: "payment.authorized",
    providerReference: "pi_0001",
    orderId: base.orderId,
    memberId: base.memberId,
    amountCents: base.amountCents,
    currency: "usd",
    verified: true,
    ...overrides,
  };
}
const digest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

function processor(store: WebhookExecutionStore, inbox = createInMemoryWebhookExecutionInbox()) {
  return { inbox, processor: createWebhookExecutionProcessor({ providerName: "test", inbox, executions: store, expectedProviderAccountId: null }) };
}

describe("webhook execution processor", () => {
  it("applies once, then reports the same delivery as a duplicate with a durable receipt", async () => {
    const exec = executions(base);
    const { inbox, processor: p } = processor(exec.store);
    expect(await p.process(verified(), digest("a"), NOW)).toEqual({ outcome: "applied", executionId: "exe-1", reason: "authorized" });
    expect(await p.process(verified(), digest("a"), NOW)).toEqual({ outcome: "duplicate" });
    expect(exec.writes).toHaveLength(1);
    expect(exec.snapshot()).toMatchObject({ phase: "authorized", version: 3, providerReference: "pi_0001" });
    expect(inbox.snapshot()).toEqual([{ key: ["test", "evt_1"], payloadSha256: digest("a"), state: "processed", outcome: "applied", reason: null, executionId: "exe-1" }]);
  });
  it("treats the same event id with different bytes as a conflict and writes nothing", async () => {
    const exec = executions(base);
    const { processor: p } = processor(exec.store);
    await p.process(verified(), digest("a"), NOW);
    expect(await p.process(verified({ amountCents: 1 }), digest("b"), NOW)).toEqual({ outcome: "conflict" });
    expect(exec.writes).toHaveLength(1);
  });
  it("tolerates out-of-order delivery: a capture first, then the late authorization is acknowledged", async () => {
    const exec = executions(base);
    const { processor: p } = processor(exec.store);
    expect(await p.process(verified({ eventId: "evt_cap", eventType: "payment.captured" }), digest("cap"), NOW)).toMatchObject({ outcome: "applied", reason: "captured" });
    expect(await p.process(verified({ eventId: "evt_auth" }), digest("auth"), NOW)).toEqual({ outcome: "acknowledged", executionId: "exe-1", reason: "already_authorized_or_later" });
    expect(exec.writes.map((w) => w.kind)).toEqual(["captured"]);
    expect(exec.snapshot()?.phase).toBe("captured");
  });
  it("resumes an interrupted run idempotently: the effect landed but the receipt was never completed", async () => {
    const exec = executions(base);
    const inbox = createInMemoryWebhookExecutionInbox();
    let crashOnce = true;
    const flaky = {
      ...inbox,
      complete: async (...args: Parameters<typeof inbox.complete>) => {
        if (crashOnce) {
          crashOnce = false;
          throw new Error("process died after the execution write");
        }
        return inbox.complete(...args);
      },
    };
    const p = createWebhookExecutionProcessor({ providerName: "test", inbox: flaky, executions: exec.store, expectedProviderAccountId: null });
    await expect(p.process(verified(), digest("a"), NOW)).rejects.toThrow(/process died/);
    expect(inbox.snapshot()[0]).toMatchObject({ state: "processing" });
    // The provider redelivers because it never got a 2xx.
    expect(await p.process(verified(), digest("a"), NOW)).toEqual({ outcome: "acknowledged", executionId: "exe-1", reason: "already_authorized_or_later" });
    expect(exec.writes).toHaveLength(1);
    expect(inbox.snapshot()[0]).toMatchObject({ state: "processed", outcome: "acknowledged" });
  });
  it("leaves the receipt open and asks for redelivery when the execution keeps moving under the event", async () => {
    const exec = executions(base, { contend: 2 });
    const { inbox, processor: p } = processor(exec.store);
    expect(await p.process(verified(), digest("a"), NOW)).toEqual({ outcome: "retry", reason: "execution_contention" });
    expect(inbox.snapshot()[0]).toMatchObject({ state: "processing" });
    expect(await p.process(verified(), digest("a"), NOW)).toMatchObject({ outcome: "applied" });
    expect(exec.writes).toHaveLength(1);
  });
  it("isolates mismatched evidence durably and never writes the execution", async () => {
    const exec = executions(base);
    const { inbox, processor: p } = processor(exec.store);
    expect(await p.process(verified({ amountCents: 1 }), digest("a"), NOW)).toEqual({ outcome: "isolated", executionId: "exe-1", reason: "amount_mismatch" });
    expect(exec.writes).toHaveLength(0);
    expect(inbox.snapshot()[0]).toMatchObject({ state: "isolated", reason: "amount_mismatch", executionId: "exe-1" });
    // A redelivery of an isolated event is a duplicate, not a second chance to attach.
    expect(await p.process(verified({ amountCents: 1 }), digest("a"), NOW)).toEqual({ outcome: "duplicate" });
  });
  it("reports an event that names no execution as unbound without claiming a receipt", async () => {
    const exec = executions(null);
    const { inbox, processor: p } = processor(exec.store);
    expect(await p.process(verified(), digest("a"), NOW)).toEqual({ outcome: "unbound" });
    expect(inbox.snapshot()).toHaveLength(0);
  });
  it("lets an execution that lost its create response adopt the reference through order metadata", async () => {
    const exec = executions({ ...base, phase: "reconciliation_required", providerReference: null });
    const { processor: p } = processor(exec.store);
    expect(await p.process(verified(), digest("a"), NOW)).toMatchObject({ outcome: "applied", reason: "authorized" });
    expect(exec.snapshot()).toMatchObject({ phase: "authorized", providerReference: "pi_0001" });
    // An unreferenced execution for ANOTHER order is not reachable through this event at all.
    const other = executions({ ...base, executionId: "exe-2", orderId: "33333333-3333-4333-8333-333333333333", providerReference: null });
    expect(await processor(other.store).processor.process(verified(), digest("b"), NOW)).toEqual({ outcome: "unbound" });
    expect(other.writes).toHaveLength(0);
    // And once such an execution HAS the reference, the order metadata mismatch is isolated, not attached.
    const referenced = executions({ ...base, executionId: "exe-3", orderId: "33333333-3333-4333-8333-333333333333" });
    expect(await processor(referenced.store).processor.process(verified(), digest("c"), NOW)).toEqual({ outcome: "isolated", executionId: "exe-3", reason: "order_mismatch" });
    expect(referenced.writes).toHaveLength(0);
  });
});

describe("canonical webhook handler with executions wired", () => {
  const body = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ id: "evt_1", type: "payment.authorized", providerReference: "pi_0001", orderId: base.orderId, memberId: base.memberId, amountCents: base.amountCents, currency: "usd", ...overrides });
  function handler(store: WebhookExecutionStore, options: { commerceEnabled?: boolean } = {}) {
    const inbox = createInMemoryWebhookExecutionInbox();
    return {
      inbox,
      handler: createWebhookHandler({
        store: createInMemoryWebhookEventStore(),
        payment: new TestPaymentProvider(),
        orders: createInMemoryWebhookAtomicStore([]),
        executions: createWebhookExecutionProcessor({ providerName: "test", inbox, executions: store, expectedProviderAccountId: null }),
        commerceEnabled: options.commerceEnabled ?? true,
      }),
    };
  }
  it("routes a verified payment event to its execution and acknowledges the redelivery", async () => {
    const exec = executions(base);
    const { handler: h } = handler(exec.store);
    expect(await h.handlePayment(body(), "test-signature", NOW)).toEqual({ ok: true, applied: true, eventId: "evt_1" });
    expect(await h.handlePayment(body(), "test-signature", NOW)).toEqual({ ok: true, applied: false, eventId: "evt_1" });
    expect(exec.snapshot()?.phase).toBe("authorized");
  });
  it("still refuses an unsigned or forged body before any lookup", async () => {
    const exec = executions(base);
    const { handler: h, inbox } = handler(exec.store);
    expect(await h.handlePayment(body(), undefined, NOW)).toEqual({ ok: false, code: "invalid_signature" });
    expect(await h.handlePayment(body(), "forged", NOW)).toEqual({ ok: false, code: "invalid_signature" });
    expect(inbox.snapshot()).toHaveLength(0);
    expect(exec.writes).toHaveLength(0);
  });
  it("falls through to the legacy order projection when no execution names the payment", async () => {
    const exec = executions(null);
    const { handler: h } = handler(exec.store);
    expect(await h.handlePayment(body(), "test-signature", NOW)).toEqual({ ok: false, code: "unknown_order" });
  });
  it("asks the provider to redeliver while the execution is contended", async () => {
    const exec = executions(base, { contend: 2 });
    const { handler: h } = handler(exec.store);
    expect(await h.handlePayment(body(), "test-signature", NOW)).toEqual({ ok: false, code: "execution_contention" });
    expect(await h.handlePayment(body(), "test-signature", NOW)).toEqual({ ok: true, applied: true, eventId: "evt_1" });
  });
  it("claims nothing while commerce is disabled so the first enabled delivery still applies", async () => {
    const exec = executions(base);
    const { handler: h, inbox } = handler(exec.store, { commerceEnabled: false });
    expect(await h.handlePayment(body(), "test-signature", NOW)).toEqual({ ok: true, applied: false, eventId: "evt_1" });
    expect(inbox.snapshot()).toHaveLength(0);
    expect(exec.writes).toHaveLength(0);
  });
});

describe("real Stripe-signed events through the canonical adapter into an execution", () => {
  const SECRET = "whsec_fake_unit_test_only";
  const sign = (raw: string, timestampSeconds: number) => `t=${timestampSeconds},v1=${crypto.createHmac("sha256", SECRET).update(`${timestampSeconds}.${raw}`).digest("hex")}`;
  const adapter = () => new StripePaymentAdapter({ secretKey: "sk_fake_unit_test_only", webhookSecret: SECRET, now: () => NOW.getTime(), transport: async () => { throw new Error("no network in this test"); } });
  const stripeEvent = (id: string, type: string, object: Record<string, unknown>) => JSON.stringify({ id, type, data: { object: { id: "pi_0001", object: "payment_intent", currency: "usd", metadata: { orderId: base.orderId, memberId: base.memberId }, ...object } } });

  it("binds amount_capturable_updated and succeeded events, then the coordinator commits from the recorded evidence", async () => {
    const exec = executions({ ...base, phase: "reconciliation_required", providerReference: null });
    const inbox = createInMemoryWebhookExecutionInbox();
    const h = createWebhookHandler({
      store: createInMemoryWebhookEventStore(),
      payment: adapter(),
      orders: createInMemoryWebhookAtomicStore([]),
      executions: createWebhookExecutionProcessor({ providerName: "stripe", inbox, executions: exec.store, expectedProviderAccountId: null }),
      commerceEnabled: true,
    });
    const ts = Math.floor(NOW.getTime() / 1000);
    const authorized = stripeEvent("evt_a", "payment_intent.amount_capturable_updated", { amount: base.amountCents, amount_capturable: base.amountCents });
    expect(await h.handlePayment(authorized, sign(authorized, ts), NOW)).toEqual({ ok: true, applied: true, eventId: "evt_a" });
    expect(exec.snapshot()).toMatchObject({ phase: "authorized", providerReference: "pi_0001" });

    const captured = stripeEvent("evt_c", "payment_intent.succeeded", { amount: base.amountCents, amount_received: base.amountCents });
    expect(await h.handlePayment(captured, sign(captured, ts), NOW)).toEqual({ ok: true, applied: true, eventId: "evt_c" });
    expect(exec.snapshot()).toMatchObject({ phase: "captured" });

    const wrongAccount = JSON.stringify({ ...JSON.parse(authorized), id: "evt_x", account: "acct_other" });
    expect(await h.handlePayment(wrongAccount, sign(wrongAccount, ts), NOW)).toEqual({ ok: false, code: "invalid_signature" });

    // No provider call is needed to finish: the coordinator commits the captured evidence.
    const port: IdempotentCheckoutPaymentPort = {
      authority: "provider_verified_idempotent_execution_v1",
      authorize: async () => { throw new Error("must not be called"); },
      capture: async () => { throw new Error("must not be called"); },
      reconcile: async () => { throw new Error("must not be called"); },
      cancel: async () => { throw new Error("must not be called"); },
    };
    expect(await createDurableCheckoutExecutor(exec.store, port).run(base.memberId, base.requestKey)).toEqual({ kind: "committed", orderId: base.orderId, executionId: "exe-1" });
  });
  it("isolates a signed event whose money does not match the execution", async () => {
    const exec = executions(base);
    const inbox = createInMemoryWebhookExecutionInbox();
    const h = createWebhookHandler({
      store: createInMemoryWebhookEventStore(),
      payment: adapter(),
      orders: createInMemoryWebhookAtomicStore([]),
      executions: createWebhookExecutionProcessor({ providerName: "stripe", inbox, executions: exec.store, expectedProviderAccountId: null }),
      commerceEnabled: true,
    });
    const ts = Math.floor(NOW.getTime() / 1000);
    const short = stripeEvent("evt_s", "payment_intent.succeeded", { amount: base.amountCents, amount_received: base.amountCents - 1 });
    expect(await h.handlePayment(short, sign(short, ts), NOW)).toEqual({ ok: true, applied: false, eventId: "evt_s" });
    expect(inbox.snapshot()[0]).toMatchObject({ state: "isolated", reason: "amount_mismatch" });
    expect(exec.snapshot()?.phase).toBe("authorizing");
  });
});
