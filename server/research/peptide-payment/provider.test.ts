import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  DisabledPeptidePaymentProvider,
  resolvePeptidePaymentProvider,
  StripePeptidePaymentProvider,
  TestPeptidePaymentProvider,
  verifyStripeWebhookSignature,
  type AuthorizePaymentInput,
  type StripeTransport,
} from "./provider";

const authorization: AuthorizePaymentInput = {
  amountCents: 12_345,
  currency: "usd",
  orderIntentId: "order-intent-1",
  memberId: "member-1",
  providerCustomerReference: "test_cus_member_1",
  providerPaymentMethodReference: "test_pm_success",
  idempotencyKey: "authorize:order-intent-1",
};

describe("payment provider configuration", () => {
  it("fails closed for disabled, missing, unknown, malformed, and test-in-production states", () => {
    expect(resolvePeptidePaymentProvider({}, { nodeEnv: "production" }).state).toBe("disabled");
    expect(resolvePeptidePaymentProvider({ PAYMENTS_PROVIDER: "stripe" }, { nodeEnv: "production" })).toMatchObject({
      state: "not_configured",
      missing: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    });
    expect(resolvePeptidePaymentProvider({ PAYMENTS_PROVIDER: "unknown" }, { nodeEnv: "production" }).state).toBe(
      "invalid",
    );
    expect(
      resolvePeptidePaymentProvider(
        { PAYMENTS_PROVIDER: "stripe", STRIPE_SECRET_KEY: "not-a-key", STRIPE_WEBHOOK_SECRET: "also-bad" },
        { nodeEnv: "production" },
      ).state,
    ).toBe("invalid");
    expect(resolvePeptidePaymentProvider({ PAYMENTS_PROVIDER: "test" }, { nodeEnv: "production" }).state).toBe(
      "invalid",
    );
  });

  it("constructs explicit test mode only outside production", () => {
    const result = resolvePeptidePaymentProvider({ PAYMENTS_PROVIDER: "test" }, { nodeEnv: "test" });
    expect(result).toMatchObject({ state: "ready", mode: "test" });
    if (result.state === "ready") expect(result.provider).toBeInstanceOf(TestPeptidePaymentProvider);
  });

  it("constructs Stripe without exposing credential values in diagnostics", () => {
    const transport = vi.fn<StripeTransport>();
    const env = {
      PAYMENTS_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_synthetic_fixture_123",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic_fixture_123",
    };
    const result = resolvePeptidePaymentProvider(env, { nodeEnv: "production", stripeTransport: transport });
    expect(result).toMatchObject({ state: "ready", mode: "test" });
    expect(JSON.stringify(result)).not.toContain(env.STRIPE_SECRET_KEY);
    expect(JSON.stringify(result)).not.toContain(env.STRIPE_WEBHOOK_SECRET);
  });
});

describe("deterministic test provider", () => {
  it("refuses construction in production", () => {
    expect(() => new TestPeptidePaymentProvider({ nodeEnv: "production" })).toThrow(/cannot run in production/i);
  });

  it("authorizes idempotently and rejects a conflicting reuse", async () => {
    const provider = new TestPeptidePaymentProvider({ nodeEnv: "test" });
    const first = await provider.authorize(authorization);
    const replay = await provider.authorize({ ...authorization });
    const conflict = await provider.authorize({ ...authorization, amountCents: authorization.amountCents + 1 });

    expect(first).toMatchObject({ ok: true, value: { amountCents: 12_345, state: "authorized" } });
    expect(replay).toMatchObject({ ok: true, replayed: true, value: first.ok ? first.value : undefined });
    expect(conflict).toMatchObject({ ok: false, code: "idempotency_conflict" });
  });

  it("models decline/unavailability and never accepts raw-card or unknown fields", async () => {
    const provider = new TestPeptidePaymentProvider({ nodeEnv: "test" });
    expect(
      await provider.authorize({ ...authorization, providerPaymentMethodReference: "test_pm_declined" }),
    ).toMatchObject({ ok: false, code: "declined", retryable: false });
    expect(
      await provider.authorize({
        ...authorization,
        idempotencyKey: "authorize:unavailable",
        providerPaymentMethodReference: "test_pm_unavailable",
      }),
    ).toMatchObject({ ok: false, code: "provider_unavailable", retryable: true });
    expect(
      await provider.authorize({ ...authorization, cardNumber: "4242424242424242" } as AuthorizePaymentInput),
    ).toMatchObject({ ok: false, code: "invalid_request" });
  });

  it("bounds capture/refunds and makes each command idempotent", async () => {
    const provider = new TestPeptidePaymentProvider({ nodeEnv: "test" });
    const authorized = await provider.authorize(authorization);
    if (!authorized.ok) throw new Error("fixture authorization failed");
    const ref = authorized.value.providerPaymentReference;

    const capture = await provider.capture(ref, 10_000, "capture:order-intent-1");
    const captureReplay = await provider.capture(ref, 10_000, "capture:order-intent-1");
    expect(capture).toMatchObject({ ok: true, value: { capturedAmountCents: 10_000 } });
    expect(captureReplay).toMatchObject({ ok: true, replayed: true });
    expect(await provider.capture(ref, 1, "capture:second-attempt")).toMatchObject({
      ok: false,
      code: "invalid_state",
    });

    expect(await provider.refund(ref, 4_000, "refund:1")).toMatchObject({ ok: true });
    expect(await provider.refund(ref, 4_000, "refund:1")).toMatchObject({ ok: true, replayed: true });
    expect(await provider.refund(ref, 6_001, "refund:over")).toMatchObject({ ok: false, code: "invalid_state" });
    expect(await provider.refund(ref, 6_000, "refund:2")).toMatchObject({ ok: true });
  });
});

describe("Stripe adapter", () => {
  it("binds the provider customer and payment method to server-owned integer cents", async () => {
    const transport = vi.fn<StripeTransport>(async () => ({
      status: 200,
      body: { id: "pi_authorized_1", status: "requires_capture" },
    }));
    const provider = new StripePeptidePaymentProvider(transport, "whsec_fixture_123");
    const result = await provider.authorize(authorization);

    expect(result).toMatchObject({ ok: true, value: { amountCents: 12_345, currency: "usd" } });
    expect(transport).toHaveBeenCalledWith({
      method: "POST",
      path: "/v1/payment_intents",
      idempotencyKey: authorization.idempotencyKey,
      form: {
        amount: "12345",
        currency: "usd",
        customer: "test_cus_member_1",
        payment_method: "test_pm_success",
        confirm: "true",
        capture_method: "manual",
        "metadata[orderIntentId]": "order-intent-1",
        "metadata[memberId]": "member-1",
      },
    });
  });

  it("collapses provider/network errors into safe stable results", async () => {
    const declined = new StripePeptidePaymentProvider(async () => ({ status: 402, body: { error: "secret detail" } }), "whsec_fixture_123");
    const unavailable = new StripePeptidePaymentProvider(async () => Promise.reject(new Error("host detail")), "whsec_fixture_123");
    expect(await declined.authorize(authorization)).toEqual({
      ok: false,
      code: "declined",
      message: "The payment method was declined.",
      retryable: false,
    });
    expect(await unavailable.authorize(authorization)).toMatchObject({
      ok: false,
      code: "provider_unavailable",
      retryable: true,
    });
  });
});

function signedWebhook(body: Uint8Array, secret: string, timestamp: number): string {
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.from(body)]);
  const signature = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("raw-body Stripe webhook verification", () => {
  const secret = "whsec_synthetic_fixture_123";
  const nowMs = Date.parse("2026-08-02T18:00:00.000Z");
  const timestamp = Math.floor(nowMs / 1000);

  it("verifies exact bytes, supports key-rotation signatures, and rejects tamper/stale input", () => {
    const body = Buffer.from('{ "id": "evt_1", "data": {"a": 1} }');
    const header = signedWebhook(body, secret, timestamp);
    expect(verifyStripeWebhookSignature(body, `t=${timestamp},v1=${"0".repeat(64)},${header.split(",")[1]}`, secret, nowMs)).toBe(true);
    expect(verifyStripeWebhookSignature(Buffer.from('{}'), header, secret, nowMs)).toBe(false);
    expect(verifyStripeWebhookSignature(body, header, secret, nowMs + 301_000)).toBe(false);
  });

  it("parses only after verification and normalizes supported Stripe events", async () => {
    const payload = {
      id: "evt_capture_1",
      type: "payment_intent.succeeded",
      created: timestamp,
      data: { object: { id: "pi_payment_1", amount: 12_345, metadata: { orderIntentId: "order-intent-1" } } },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const provider = new StripePeptidePaymentProvider(async () => ({ status: 500, body: null }), secret, () => nowMs);

    expect(await provider.verifyWebhook(rawBody, signedWebhook(rawBody, secret, timestamp))).toEqual({
      ok: true,
      value: {
        eventId: "evt_capture_1",
        type: "payment.captured",
        providerPaymentReference: "pi_payment_1",
        occurredAt: "2026-08-02T18:00:00.000Z",
        amountCents: 12_345,
        verified: true,
      },
    });
    expect(await provider.verifyWebhook(Buffer.from("not-json"), signedWebhook(Buffer.from("not-json"), secret, timestamp))).toMatchObject({
      ok: false,
      code: "webhook_invalid",
    });
    expect(await provider.verifyWebhook(rawBody, "t=1,v1=00")).toMatchObject({ ok: false, code: "webhook_unverified" });
  });
});

describe("disabled provider", () => {
  it("refuses every consequential operation", async () => {
    const provider = new DisabledPeptidePaymentProvider();
    expect(await provider.authorize(authorization)).toMatchObject({ ok: false, code: "disabled" });
    expect(await provider.capture("pi_xxx", 1, "capture:key1")).toMatchObject({ ok: false, code: "disabled" });
    expect(await provider.refund("pi_xxx", 1, "refund:key1")).toMatchObject({ ok: false, code: "disabled" });
    expect(await provider.verifyWebhook(Buffer.from("{}"), "sig")).toMatchObject({ ok: false, code: "disabled" });
  });
});
