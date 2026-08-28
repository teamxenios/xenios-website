import { describe, expect, it } from "vitest";
import { providerDisabled, providerOk, type ProviderResult } from "@shared/research/capability";
import type {
  PaymentAuthorization,
  PaymentCapture,
  PaymentProvider,
  PaymentRefund,
  WebhookVerification,
} from "../providers/payment";
import type {
  FulfillmentAcceptance,
  FulfillmentProvider,
  FulfillmentStatusUpdate,
} from "../providers/fulfillment";
import {
  createInMemoryWebhookAtomicStore,
  createInMemoryWebhookEventStore,
  createWebhookHandler,
  type WebhookAtomicApplyStore,
  type WebhookAtomicEvent,
  type WebhookDeps,
  type WebhookEventStore,
  type WebhookOrder,
} from "./webhooks";

const NOW = new Date("2026-07-20T00:00:00Z");
const GOOD_SIGNATURE = "good-signature";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/**
 * A payment provider that verifies a signature and nothing else.
 *
 * It deliberately does NOT deduplicate events, because replay protection is the
 * handler's job and a real processor redelivers the same event id happily.
 */
class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake_payment";
  readonly supportsDeferredCapture = true;
  verifyCalls = 0;

  async createAuthorization(): Promise<ProviderResult<PaymentAuthorization>> {
    return providerDisabled<PaymentAuthorization>("product_commerce");
  }
  async captureAuthorization(): Promise<ProviderResult<PaymentCapture>> {
    return providerDisabled<PaymentCapture>("product_commerce");
  }
  async cancelAuthorization(): Promise<ProviderResult<void>> {
    return providerDisabled<void>("product_commerce");
  }
  async refund(): Promise<ProviderResult<PaymentRefund>> {
    return providerDisabled<PaymentRefund>("product_commerce");
  }
  async retrieveStatus(): Promise<ProviderResult<{ status: string }>> {
    return providerOk({ status: "authorized" });
  }

  async verifyWebhook(
    rawBody: string,
    signature: string | undefined,
  ): Promise<ProviderResult<WebhookVerification>> {
    this.verifyCalls += 1;
    if (signature !== GOOD_SIGNATURE) {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }
    let parsed: { id?: string; type?: string; providerReference?: string };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed body.", retryable: false };
    }
    if (!parsed.id || !parsed.type) {
      return { ok: false, code: "REJECTED", message: "Missing id or type.", retryable: false };
    }
    return providerOk({
      eventId: parsed.id,
      eventType: parsed.type,
      providerReference: parsed.providerReference,
      verified: true as const,
    });
  }
}

class DisabledVerifyPaymentProvider extends FakePaymentProvider {
  async verifyWebhook(): Promise<ProviderResult<WebhookVerification>> {
    return providerDisabled<WebhookVerification>("product_commerce");
  }
}

class FakeFulfillmentProvider implements FulfillmentProvider {
  readonly name = "fake_fulfillment";
  readonly transportMode = "api" as const;

  async submit(): Promise<ProviderResult<FulfillmentAcceptance>> {
    return providerDisabled<FulfillmentAcceptance>("mitch_fulfillment");
  }
  async fetchStatus(): Promise<ProviderResult<FulfillmentStatusUpdate>> {
    return providerDisabled<FulfillmentStatusUpdate>("mitch_fulfillment");
  }
  async verifyInboundWebhook(
    rawBody: string,
    signature: string | undefined,
  ): Promise<ProviderResult<FulfillmentStatusUpdate>> {
    if (signature !== GOOD_SIGNATURE) {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }
    try {
      const parsed = JSON.parse(rawBody) as FulfillmentStatusUpdate;
      if (!parsed.fulfillmentOrderId || !parsed.status) {
        return { ok: false, code: "REJECTED", message: "Missing id or status.", retryable: false };
      }
      return providerOk(parsed);
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed body.", retryable: false };
    }
  }
}

/** Records every call so a test can assert the ORDER of operations, not just the result. */
class RecordingEventStore implements WebhookEventStore {
  readonly calls: string[] = [];
  private readonly inner = createInMemoryWebhookEventStore();

  seen(providerName: string, eventId: string): boolean {
    this.calls.push(`seen:${eventId}`);
    return this.inner.seen(providerName, eventId);
  }
  record(providerName: string, eventId: string, at: Date): void {
    this.calls.push(`record:${eventId}`);
    this.inner.record(providerName, eventId, at);
  }
}

function orderStore(initial: WebhookOrder[]): {
  get(orderId: string): Promise<WebhookOrder | undefined>;
  save(order: WebhookOrder): Promise<void>;
  atomic: WebhookAtomicApplyStore;
  saves: number;
} {
  const backing = createInMemoryWebhookAtomicStore(initial);
  return {
    atomic: backing,
    saves: 0,
    async get(orderId: string) {
      return backing.get(orderId);
    },
    async save(order: WebhookOrder) {
      await backing.save(order);
      this.saves += 1;
    },
  };
}

function approvedOrder(orderId = "ord_1"): WebhookOrder {
  return { orderId, state: "approved", paymentReference: "auth_1", captured: false };
}

function deps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  const orders = overrides.orders ?? orderStore([approvedOrder()]);
  const result: WebhookDeps = {
    store: new RecordingEventStore(),
    payment: new FakePaymentProvider(),
    fulfillment: new FakeFulfillmentProvider(),
    orders,
    atomic: (orders as typeof orders & { atomic?: WebhookAtomicApplyStore }).atomic,
    commerceEnabled: true,
    ...overrides,
  };
  if (Object.prototype.hasOwnProperty.call(overrides, "atomic")) {
    result.atomic = overrides.atomic;
  }
  return result;
}

function captureBody(id = "evt_1", orderId = "ord_1"): string {
  return JSON.stringify({
    id,
    type: "payment.captured",
    providerReference: "auth_1",
    orderId,
  });
}

// ---------------------------------------------------------------------------

describe("payment webhooks", () => {
  it("moves an approved order to captured using the provider reference", async () => {
    const orders = orderStore([approvedOrder()]);
    const d = deps({ orders });
    const handler = createWebhookHandler(d);

    const result = await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: true, applied: true, eventId: "evt_1" });
    const order = (await orders.get("ord_1"))!;
    expect(order.state).toBe("payment_captured");
    expect(order.captured).toBe(true);
    expect(order.paymentReference).toBe("auth_1");
  });

  it("refuses an event with no provider reference on a state that requires one", async () => {
    const orders = orderStore([approvedOrder()]);
    const handler = createWebhookHandler(deps({ orders }));

    const body = JSON.stringify({ id: "evt_2", type: "payment.captured", orderId: "ord_1" });
    const result = await handler.handlePayment(body, GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: true, applied: false, eventId: "evt_2" });
    expect((await orders.get("ord_1"))!.state).toBe("approved");
    expect((await orders.get("ord_1"))!.captured).toBe(false);
  });

  it("rejects an unsigned body and never records it as seen", async () => {
    const store = new RecordingEventStore();
    const orders = orderStore([approvedOrder()]);
    const handler = createWebhookHandler(deps({ store, orders }));

    const forged = await handler.handlePayment(captureBody(), undefined, NOW);
    expect(forged).toEqual({ ok: false, code: "invalid_signature" });
    expect(store.calls).toEqual([]);
    expect((await orders.get("ord_1"))!.state).toBe("approved");

    // The genuine event carrying the SAME id still applies, so a forged body
    // cannot burn an event id to suppress the real one.
    const genuine = await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW);
    expect(genuine).toEqual({ ok: true, applied: true, eventId: "evt_1" });
    expect((await orders.get("ord_1"))!.state).toBe("payment_captured");
  });

  it("rejects a wrongly signed body without touching the store", async () => {
    const store = new RecordingEventStore();
    const handler = createWebhookHandler(deps({ store }));

    const result = await handler.handlePayment(captureBody(), "wrong-signature", NOW);

    expect(result).toEqual({ ok: false, code: "invalid_signature" });
    expect(store.calls).toEqual([]);
  });

  it("verifies the signature before looking up replay state", async () => {
    const store = new RecordingEventStore();
    const payment = new FakePaymentProvider();
    const handler = createWebhookHandler(deps({ store, payment }));

    await handler.handlePayment(captureBody(), "wrong-signature", NOW);
    expect(payment.verifyCalls).toBe(1);
    expect(store.calls).toEqual([]);

    await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW);
    expect(payment.verifyCalls).toBe(2);
    // Legacy seen/record calls are not an atomic authority and are never used by
    // the handler, even after successful verification.
    expect(store.calls).toEqual([]);
  });

  it("absorbs a replayed event without moving state", async () => {
    const store = new RecordingEventStore();
    const orders = orderStore([approvedOrder()]);
    const handler = createWebhookHandler(deps({ store, orders }));

    const first = await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW);
    expect(first).toEqual({ ok: true, applied: true, eventId: "evt_1" });
    expect((await orders.get("ord_1"))!.state).toBe("payment_captured");
    const savesAfterFirst = orders.saves;

    const replay = await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW);
    expect(replay).toEqual({ ok: true, applied: false, eventId: "evt_1" });
    expect((await orders.get("ord_1"))!.state).toBe("payment_captured");
    expect(orders.saves).toBe(savesAfterFirst);
    expect(store.calls).toEqual([]);
  });

  it("serializes concurrent deliveries so exactly one owns and applies the event", async () => {
    const orders = orderStore([approvedOrder()]);
    const handler = createWebhookHandler(deps({ orders }));

    const results = await Promise.all([
      handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW),
      handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW),
    ]);

    expect(results).toContainEqual({ ok: true, applied: true, eventId: "evt_1" });
    expect(results).toContainEqual({ ok: true, applied: false, eventId: "evt_1" });
    expect(results.filter((result) => result.ok && result.applied)).toHaveLength(1);
    expect((await orders.get("ord_1"))!.state).toBe("payment_captured");
  });

  it("rejects the same provider event id when it is bound to different signed bytes", async () => {
    const orders = orderStore([approvedOrder()]);
    const handler = createWebhookHandler(deps({ orders }));

    expect(await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW)).toEqual({
      ok: true,
      applied: true,
      eventId: "evt_1",
    });
    const conflictingBody = JSON.stringify({
      id: "evt_1",
      type: "payment.failed",
      providerReference: "auth_other",
      orderId: "ord_1",
    });

    expect(await handler.handlePayment(conflictingBody, GOOD_SIGNATURE, NOW)).toEqual({
      ok: false,
      code: "event_conflict",
    });
    expect((await orders.get("ord_1"))!.state).toBe("payment_captured");
  });

  it("does not poison a retry when the atomic persistence operation fails", async () => {
    const orders = orderStore([approvedOrder()]);
    const durable = orders.atomic;
    let failOnce = true;
    const atomic: WebhookAtomicApplyStore = {
      async claimAndApply(event, decide) {
        if (failOnce) {
          failOnce = false;
          throw new Error("injected transaction failure");
        }
        return durable.claimAndApply(event, decide);
      },
    };
    const handler = createWebhookHandler(deps({ orders, atomic }));

    await expect(handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW)).rejects.toThrow(
      "injected transaction failure",
    );
    expect((await orders.get("ord_1"))!.state).toBe("approved");

    await expect(handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW)).resolves.toEqual({
      ok: true,
      applied: true,
      eventId: "evt_1",
    });
  });

  it("fails closed when only separate replay and order stores are wired", async () => {
    const store = new RecordingEventStore();
    const orders = orderStore([approvedOrder()]);
    const handler = createWebhookHandler(deps({ store, orders, atomic: undefined }));

    expect(await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW)).toEqual({
      ok: false,
      code: "capability_disabled",
    });
    expect(store.calls).toEqual([]);
    expect((await orders.get("ord_1"))!.state).toBe("approved");
  });

  it("reports an unknown order rather than crashing or retrying forever", async () => {
    const handler = createWebhookHandler(deps());

    const result = await handler.handlePayment(captureBody("evt_9", "ord_missing"), GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: false, code: "unknown_order" });
  });

  it("does not claim an event for an unknown order, allowing a later durable-order retry", async () => {
    const orders = orderStore([]);
    const handler = createWebhookHandler(deps({ orders }));

    expect(await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW)).toEqual({
      ok: false,
      code: "unknown_order",
    });
    await orders.save(approvedOrder());
    expect(await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW)).toEqual({
      ok: true,
      applied: true,
      eventId: "evt_1",
    });
  });

  it("reports malformed when the body is not JSON", async () => {
    const handler = createWebhookHandler(deps());

    const result = await handler.handlePayment("not json at all", GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: false, code: "malformed" });
  });

  it("reports malformed when a verified event names no order", async () => {
    const store = new RecordingEventStore();
    const handler = createWebhookHandler(deps({ store }));

    const body = JSON.stringify({ id: "evt_3", type: "payment.captured", providerReference: "auth_1" });
    const result = await handler.handlePayment(body, GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: false, code: "malformed" });
    expect(store.calls).toEqual([]);
  });

  it("surfaces a disabled provider as capability_disabled", async () => {
    const store = new RecordingEventStore();
    const handler = createWebhookHandler(
      deps({ store, payment: new DisabledVerifyPaymentProvider() }),
    );

    const result = await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: false, code: "capability_disabled" });
    expect(store.calls).toEqual([]);
  });

  it("acknowledges but applies nothing while commerce is disabled", async () => {
    const store = new RecordingEventStore();
    const orders = orderStore([approvedOrder()]);
    const handler = createWebhookHandler(deps({ store, orders, commerceEnabled: false }));

    const result = await handler.handlePayment(captureBody(), GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: true, applied: false, eventId: "evt_1" });
    expect((await orders.get("ord_1"))!.state).toBe("approved");
    // Not recorded, because nothing happened. A redelivery after commerce is
    // enabled is a first application, not a second.
    expect(store.calls).toEqual([]);
  });

  it("acknowledges an unrecognised event type without guessing at a state", async () => {
    const orders = orderStore([approvedOrder()]);
    const handler = createWebhookHandler(deps({ orders }));

    const body = JSON.stringify({ id: "evt_4", type: "payment.something_new", orderId: "ord_1" });
    const result = await handler.handlePayment(body, GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: true, applied: false, eventId: "evt_4" });
    expect((await orders.get("ord_1"))!.state).toBe("approved");
  });

  it("does not move an order along a transition a webhook may not drive", async () => {
    // payment_captured to refunded is an admin decision, never a provider one.
    const orders = orderStore([
      { orderId: "ord_1", state: "payment_captured", paymentReference: "auth_1", captured: true },
    ]);
    const handler = createWebhookHandler(deps({ orders }));

    const body = JSON.stringify({
      id: "evt_5",
      type: "payment.refunded",
      providerReference: "auth_1",
      orderId: "ord_1",
    });
    const result = await handler.handlePayment(body, GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: true, applied: false, eventId: "evt_5" });
    expect((await orders.get("ord_1"))!.state).toBe("payment_captured");
  });
});

describe("fulfillment webhooks", () => {
  function deliveredBody(id = "ff_evt_1", orderId = "ord_1"): string {
    return JSON.stringify({
      eventId: id,
      fulfillmentOrderId: orderId,
      status: "delivered",
      trackingNumber: "1Z999",
      carrier: "ups",
    });
  }

  it("moves a fulfilled order to delivered", async () => {
    const orders = orderStore([
      { orderId: "ord_1", state: "fulfilled", paymentReference: "auth_1", captured: true },
    ]);
    const handler = createWebhookHandler(deps({ orders }));

    const result = await handler.handleFulfillment(deliveredBody(), GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: true, applied: true, eventId: "ff_evt_1" });
    expect((await orders.get("ord_1"))!.state).toBe("delivered");
  });

  it("never carries a payment reference from a fulfillment partner", async () => {
    const orders = orderStore([
      { orderId: "ord_1", state: "fulfilled", paymentReference: null, captured: false },
    ]);
    const handler = createWebhookHandler(deps({ orders }));

    await handler.handleFulfillment(deliveredBody(), GOOD_SIGNATURE, NOW);

    expect((await orders.get("ord_1"))!.paymentReference).toBeNull();
    expect((await orders.get("ord_1"))!.captured).toBe(false);
  });

  it("rejects an unsigned fulfillment body without touching the store", async () => {
    const store = new RecordingEventStore();
    const handler = createWebhookHandler(deps({ store }));

    const result = await handler.handleFulfillment(deliveredBody(), undefined, NOW);

    expect(result).toEqual({ ok: false, code: "invalid_signature" });
    expect(store.calls).toEqual([]);
  });

  it("absorbs a replayed fulfillment event", async () => {
    const orders = orderStore([
      { orderId: "ord_1", state: "fulfilled", paymentReference: "auth_1", captured: true },
    ]);
    const handler = createWebhookHandler(deps({ orders }));

    await handler.handleFulfillment(deliveredBody(), GOOD_SIGNATURE, NOW);
    const replay = await handler.handleFulfillment(deliveredBody(), GOOD_SIGNATURE, NOW);

    expect(replay).toEqual({ ok: true, applied: false, eventId: "ff_evt_1" });
    expect((await orders.get("ord_1"))!.state).toBe("delivered");
  });

  it("derives a stable event id when the partner sends none", async () => {
    const orders = orderStore([
      { orderId: "ord_1", state: "fulfilled", paymentReference: "auth_1", captured: true },
    ]);
    const handler = createWebhookHandler(deps({ orders }));
    const body = JSON.stringify({
      fulfillmentOrderId: "ord_1",
      status: "delivered",
      trackingNumber: "1Z999",
    });

    const first = await handler.handleFulfillment(body, GOOD_SIGNATURE, NOW);
    const second = await handler.handleFulfillment(body, GOOD_SIGNATURE, NOW);

    expect(first).toEqual({ ok: true, applied: true, eventId: "ord_1:delivered:1Z999" });
    expect(second.ok && second.applied).toBe(false);
  });

  it("reports capability_disabled when no fulfillment provider is wired", async () => {
    const store = new RecordingEventStore();
    const handler = createWebhookHandler(deps({ store, fulfillment: undefined }));

    const result = await handler.handleFulfillment(deliveredBody(), GOOD_SIGNATURE, NOW);

    expect(result).toEqual({ ok: false, code: "capability_disabled" });
    expect(store.calls).toEqual([]);
  });

  it("reports an unknown order", async () => {
    const handler = createWebhookHandler(deps());

    const result = await handler.handleFulfillment(
      deliveredBody("ff_evt_2", "ord_missing"),
      GOOD_SIGNATURE,
      NOW,
    );

    expect(result).toEqual({ ok: false, code: "unknown_order" });
  });
});

describe("the in-memory event store", () => {
  it("scopes event ids per provider so two providers cannot suppress each other", () => {
    const store = createInMemoryWebhookEventStore();
    store.record("provider_a", "evt_1", NOW);

    expect(store.seen("provider_a", "evt_1")).toBe(true);
    expect(store.seen("provider_b", "evt_1")).toBe(false);
  });
});

describe("the in-memory atomic inbox and order store", () => {
  const event: WebhookAtomicEvent = {
    providerName: "provider_a",
    eventId: "evt_owner",
    eventType: "payment.captured",
    payloadSha256: "a".repeat(64),
    receivedAt: NOW,
    orderId: "ord_1",
  };

  it("rejects a decision that tries to write an order it does not own without burning the claim", async () => {
    const store = createInMemoryWebhookAtomicStore([approvedOrder()]);

    await expect(
      store.claimAndApply(event, () => ({
        kind: "apply",
        order: { ...approvedOrder("ord_2"), state: "payment_captured", captured: true },
      })),
    ).rejects.toThrow("different order");

    await expect(
      store.claimAndApply(event, (order) => ({
        kind: "apply",
        order: { ...order!, state: "payment_captured", captured: true },
      })),
    ).resolves.toEqual({ outcome: "applied" });
    expect((await store.get("ord_1"))!.state).toBe("payment_captured");
  });
});
