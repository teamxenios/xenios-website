import crypto from "crypto";
import { describe, expect, it, afterEach } from "vitest";
import {
  DisabledPaymentProvider,
  StripePaymentAdapter,
  TestPaymentProvider,
  resolvePaymentProvider,
  validateStripeConfig,
  verifyStripeSignature,
  type StripeRequest,
} from "./payment";

const baseInput = {
  amountCents: 33999,
  currency: "usd" as const,
  orderId: "ord_1",
  memberId: "mem_1",
  idempotencyKey: "key_1",
};

function authorizationIntent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "pi_1",
    status: "requires_capture",
    amount: baseInput.amountCents,
    amount_capturable: baseInput.amountCents,
    currency: "usd",
    metadata: { orderId: baseInput.orderId, memberId: baseInput.memberId },
    ...overrides,
  };
}

function retrievedIntent(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "pi_1",
    status: "requires_capture",
    amount: baseInput.amountCents,
    amount_capturable: baseInput.amountCents,
    currency: "usd",
    ...overrides,
  };
}

describe("DisabledPaymentProvider (the production default)", () => {
  const p = new DisabledPaymentProvider();

  it("refuses every operation with a structured DISABLED result, never a throw", async () => {
    for (const result of [
      await p.createAuthorization(),
      await p.captureAuthorization(),
      await p.cancelAuthorization(),
      await p.refund(),
      await p.retrieveStatus(),
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

describe("TestPaymentProvider", () => {
  it("authorizes and returns a provider reference", async () => {
    const p = new TestPaymentProvider();
    const r = await p.createAuthorization(baseInput);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("authorized");
      expect(r.value.providerReference).toBeTruthy();
    }
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects malformed authorization cents %s",
    async (amountCents) => {
      const p = new TestPaymentProvider();
      const r = await p.createAuthorization({ ...baseInput, amountCents });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
    },
  );

  it("rejects a runtime non-USD authorization despite the compile-time literal", async () => {
    const p = new TestPaymentProvider();
    const r = await p.createAuthorization({ ...baseInput, currency: "eur" as never });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  // Idempotency: the classic double-charge bug.
  it("returns the same authorization for a repeated idempotency key", async () => {
    const p = new TestPaymentProvider();
    const a = await p.createAuthorization(baseInput);
    const b = await p.createAuthorization(baseInput);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.value.providerReference).toBe(a.value.providerReference);
    }
  });

  it("creates a distinct authorization for a different key", async () => {
    const p = new TestPaymentProvider();
    const a = await p.createAuthorization(baseInput);
    const b = await p.createAuthorization({ ...baseInput, idempotencyKey: "key_2" });
    if (a.ok && b.ok) {
      expect(b.value.providerReference).not.toBe(a.value.providerReference);
    }
  });

  it("captures once and refuses a second capture", async () => {
    const p = new TestPaymentProvider();
    const auth = await p.createAuthorization(baseInput);
    if (!auth.ok) throw new Error("setup failed");
    const first = await p.captureAuthorization(auth.value.providerReference);
    expect(first.ok).toBe(true);
    const second = await p.captureAuthorization(auth.value.providerReference);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toContain("already captured");
  });

  it("refuses to capture more than was authorized", async () => {
    const p = new TestPaymentProvider();
    const auth = await p.createAuthorization(baseInput);
    if (!auth.ok) throw new Error("setup failed");
    const r = await p.captureAuthorization(auth.value.providerReference, baseInput.amountCents + 1);
    expect(r.ok).toBe(false);
  });

  it.each([
    ["amount", { amountCents: baseInput.amountCents + 1 }],
    ["order", { orderId: "ord_other" }],
    ["member", { memberId: "mem_other" }],
    ["payment method", { paymentMethodReference: "pm_other" }],
    ["description", { description: "different" }],
  ])("rejects an authorization key replay with different %s", async (_label, override) => {
    const p = new TestPaymentProvider();
    const first = await p.createAuthorization(baseInput);
    expect(first.ok).toBe(true);
    const replay = await p.createAuthorization({ ...baseInput, ...override });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("PERMANENT_FAILURE");
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "refuses malformed capture cents %s without corrupting the authorization",
    async (amountCents) => {
      const p = new TestPaymentProvider();
      const auth = await p.createAuthorization(baseInput);
      if (!auth.ok) throw new Error("setup failed");
      expect((await p.captureAuthorization(auth.value.providerReference, amountCents)).ok).toBe(false);
      expect(
        (await p.captureAuthorization(auth.value.providerReference, baseInput.amountCents)).ok,
      ).toBe(true);
    },
  );

  it("refuses to capture an unknown or cancelled authorization", async () => {
    const p = new TestPaymentProvider();
    expect((await p.captureAuthorization("nope")).ok).toBe(false);

    const auth = await p.createAuthorization(baseInput);
    if (!auth.ok) throw new Error("setup failed");
    await p.cancelAuthorization(auth.value.providerReference);
    const r = await p.captureAuthorization(auth.value.providerReference);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("cancelled");
  });

  it("refuses to cancel after capture", async () => {
    const p = new TestPaymentProvider();
    const auth = await p.createAuthorization(baseInput);
    if (!auth.ok) throw new Error("setup failed");
    await p.captureAuthorization(auth.value.providerReference);
    expect((await p.cancelAuthorization(auth.value.providerReference)).ok).toBe(false);
  });

  it("refunds only up to the captured amount", async () => {
    const p = new TestPaymentProvider();
    const auth = await p.createAuthorization(baseInput);
    if (!auth.ok) throw new Error("setup failed");
    await p.captureAuthorization(auth.value.providerReference);

    const over = await p.refund(auth.value.providerReference, baseInput.amountCents + 1, "r1");
    expect(over.ok).toBe(false);

    const ok = await p.refund(auth.value.providerReference, 100, "r2");
    expect(ok.ok).toBe(true);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "refuses malformed refund cents %s without changing the refundable balance",
    async (amountCents) => {
      const p = new TestPaymentProvider();
      const auth = await p.createAuthorization(baseInput);
      if (!auth.ok) throw new Error("setup failed");
      await p.captureAuthorization(auth.value.providerReference);
      expect((await p.refund(auth.value.providerReference, amountCents, `bad_${amountCents}`)).ok).toBe(false);
      expect(
        (await p.refund(auth.value.providerReference, baseInput.amountCents, "valid_full_refund")).ok,
      ).toBe(true);
    },
  );

  it("refuses to refund something never captured", async () => {
    const p = new TestPaymentProvider();
    const auth = await p.createAuthorization(baseInput);
    if (!auth.ok) throw new Error("setup failed");
    expect((await p.refund(auth.value.providerReference, 100, "r1")).ok).toBe(false);
  });

  it("accumulates partial refunds so their total can never exceed the capture", async () => {
    const p = new TestPaymentProvider();
    const auth = await p.createAuthorization({ ...baseInput, amountCents: 1000 });
    if (!auth.ok) throw new Error("setup failed");
    await p.captureAuthorization(auth.value.providerReference, 1000);

    expect((await p.refund(auth.value.providerReference, 600, "r1")).ok).toBe(true);
    // The second 600 would take the total to 1200 against a 1000 capture.
    const over = await p.refund(auth.value.providerReference, 600, "r2");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toContain("exceeds captured");
    expect((await p.refund(auth.value.providerReference, 400, "r3")).ok).toBe(true);
    expect((await p.refund(auth.value.providerReference, 1, "r4")).ok).toBe(false);
  });

  it("honors the refund idempotency key: a replay returns the original and moves no more money", async () => {
    const p = new TestPaymentProvider();
    const auth = await p.createAuthorization({ ...baseInput, amountCents: 1000 });
    if (!auth.ok) throw new Error("setup failed");
    await p.captureAuthorization(auth.value.providerReference, 1000);

    const first = await p.refund(auth.value.providerReference, 600, "same_key");
    const replay = await p.refund(auth.value.providerReference, 600, "same_key");
    expect(first.ok && replay.ok).toBe(true);
    if (first.ok && replay.ok) expect(replay.value).toEqual(first.value);
    // Only 600 actually left, so 400 (not 0) is still refundable.
    expect((await p.refund(auth.value.providerReference, 400, "new_key")).ok).toBe(true);
  });

  it("rejects a refund key replay bound to a different amount or payment reference", async () => {
    const p = new TestPaymentProvider();
    const firstAuth = await p.createAuthorization({ ...baseInput, amountCents: 1000 });
    const secondAuth = await p.createAuthorization({
      ...baseInput,
      amountCents: 1000,
      orderId: "ord_2",
      idempotencyKey: "auth_key_2",
    });
    if (!firstAuth.ok || !secondAuth.ok) throw new Error("setup failed");
    await p.captureAuthorization(firstAuth.value.providerReference, 1000);
    await p.captureAuthorization(secondAuth.value.providerReference, 1000);
    expect((await p.refund(firstAuth.value.providerReference, 400, "refund_key")).ok).toBe(true);

    const wrongAmount = await p.refund(firstAuth.value.providerReference, 500, "refund_key");
    const wrongReference = await p.refund(secondAuth.value.providerReference, 400, "refund_key");
    expect(wrongAmount.ok).toBe(false);
    expect(wrongReference.ok).toBe(false);
    if (!wrongAmount.ok) expect(wrongAmount.code).toBe("PERMANENT_FAILURE");
    if (!wrongReference.ok) expect(wrongReference.code).toBe("PERMANENT_FAILURE");
    expect((await p.refund(firstAuth.value.providerReference, 600, "refund_key_2")).ok).toBe(true);
    expect((await p.refund(secondAuth.value.providerReference, 1000, "refund_key_3")).ok).toBe(true);
  });

  describe("webhook verification", () => {
    it("rejects a missing or wrong signature", async () => {
      const p = new TestPaymentProvider();
      const body = JSON.stringify({ id: "evt_1", type: "payment.captured" });
      expect((await p.verifyWebhook(body, undefined)).ok).toBe(false);
      expect((await p.verifyWebhook(body, "wrong")).ok).toBe(false);
    });

    it("rejects a malformed body", async () => {
      const p = new TestPaymentProvider();
      expect((await p.verifyWebhook("{not json", "test-signature")).ok).toBe(false);
    });

    it("accepts a well formed signed event", async () => {
      const p = new TestPaymentProvider();
      const body = JSON.stringify({
        id: "evt_1",
        type: "payment.captured",
        providerReference: "x",
        orderId: "ord_1",
        amountCents: 1_000,
        currency: "usd",
      });
      const r = await p.verifyWebhook(body, "test-signature");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toMatchObject({
          verified: true,
          orderId: "ord_1",
          amountCents: 1_000,
          currency: "usd",
        });
      }
    });

    it("does not consume an event id during verification", async () => {
      const p = new TestPaymentProvider();
      const body = JSON.stringify({ id: "evt_dup", type: "payment.captured" });
      expect((await p.verifyWebhook(body, "test-signature")).ok).toBe(true);
      const replay = await p.verifyWebhook(body, "test-signature");
      expect(replay.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Stripe adapter (real implementation, canned transport, no network)
// ---------------------------------------------------------------------------

// Deliberately fake placeholder strings. They match no Stripe key format and
// never leave the injected transport.
const FAKE_SECRET_KEY = "sk_fake_unit_test_only";
const FAKE_WEBHOOK_SECRET = "whsec_fake_unit_test_only";
const NOW_MS = Date.parse("2026-07-22T12:00:00Z");

function stripeAdapter(
  responses: Array<{ status: number; body: unknown }>,
  options: { providerAccountId?: string | null } = {},
) {
  const requests: StripeRequest[] = [];
  const queue = [...responses];
  const adapter = new StripePaymentAdapter({
    secretKey: FAKE_SECRET_KEY,
    webhookSecret: FAKE_WEBHOOK_SECRET,
    providerAccountId: options.providerAccountId ?? null,
    now: () => NOW_MS,
    transport: async (request) => {
      requests.push(request);
      const next = queue.shift();
      if (!next) throw new Error("no canned response left");
      return next;
    },
  });
  return { adapter, requests };
}

function sign(body: string, timestampSeconds: number, secret: string = FAKE_WEBHOOK_SECRET): string {
  const mac = crypto.createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

describe("StripePaymentAdapter", () => {
  it("refuses to construct without a complete configuration", () => {
    expect(
      () => new StripePaymentAdapter({ secretKey: "", webhookSecret: FAKE_WEBHOOK_SECRET }),
    ).toThrow(/complete|requires/i);
    expect(() => new StripePaymentAdapter({ secretKey: FAKE_SECRET_KEY, webhookSecret: "" })).toThrow();
  });

  it("refuses Connect mode over the built-in platform-only transport", () => {
    expect(
      () =>
        new StripePaymentAdapter({
          secretKey: FAKE_SECRET_KEY,
          webhookSecret: FAKE_WEBHOOK_SECRET,
          providerAccountId: "acct_connected",
        }),
    ).toThrow(/Connect|account-bound/i);
  });

  it("declares the credential names it needs, without any values", () => {
    expect(StripePaymentAdapter.requiredEnvironmentVariables).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ]);
  });

  describe("createAuthorization", () => {
    it("creates a manual-capture payment intent and forwards the caller's idempotency key", async () => {
      const { adapter, requests } = stripeAdapter([
        { status: 200, body: authorizationIntent() },
      ]);
      const r = await adapter.createAuthorization({ ...baseInput, paymentMethodReference: "pm_1" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.providerReference).toBe("pi_1");
        expect(r.value.status).toBe("authorized");
        expect(r.value.captureDeferred).toBe(true);
      }
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("POST");
      expect(requests[0].path).toBe("/v1/payment_intents");
      expect(requests[0].idempotencyKey).toBe("key_1");
      expect(requests[0].form?.capture_method).toBe("manual");
      expect(requests[0].form?.amount).toBe("33999");
      expect(requests[0].form?.["metadata[orderId]"]).toBe("ord_1");
      expect(requests[0].form?.confirm).toBe("true");
    });

    it.each([
      ["non-PaymentIntent reference", { id: "ch_wrong" }],
      ["wrong amount", { amount: 33998 }],
      ["wrong capturable amount", { amount_capturable: 33998 }],
      ["wrong currency", { currency: "eur" }],
      ["wrong order metadata", { metadata: { orderId: "ord_other", memberId: "mem_1" } }],
      ["wrong member metadata", { metadata: { orderId: "ord_1", memberId: "mem_other" } }],
    ])("rejects authorization success with %s", async (_label, override) => {
      const { adapter } = stripeAdapter([
        { status: 200, body: authorizationIntent(override) },
      ]);

      const result = await adapter.createAuthorization({
        ...baseInput,
        paymentMethodReference: "pm_1",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("PERMANENT_FAILURE");
    });

    it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
      "refuses malformed authorization cents %s before any provider call",
      async (amountCents) => {
      const { adapter, requests } = stripeAdapter([]);
      const r = await adapter.createAuthorization({ ...baseInput, amountCents });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
      expect(requests).toHaveLength(0);
      },
    );

    it("refuses a runtime non-USD authorization before any provider call", async () => {
      const { adapter, requests } = stripeAdapter([]);
      const r = await adapter.createAuthorization({ ...baseInput, currency: "eur" as never });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
      expect(requests).toHaveLength(0);
    });

    it("never fakes success for an intent that is not authorized yet", async () => {
      const { adapter } = stripeAdapter([
        {
          status: 200,
          body: authorizationIntent({ id: "pi_2", status: "requires_payment_method" }),
        },
      ]);
      const r = await adapter.createAuthorization(baseInput);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("REJECTED");
        expect(r.message).toContain("not authorized");
      }
    });

    it("maps a declined card to REJECTED", async () => {
      const { adapter } = stripeAdapter([
        { status: 402, body: { error: { type: "card_error", message: "Your card was declined." } } },
      ]);
      const r = await adapter.createAuthorization(baseInput);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("REJECTED");
        expect(r.retryable).toBe(false);
      }
    });

    it("maps a credentials failure to MISCONFIGURED, never a retry loop", async () => {
      const { adapter } = stripeAdapter([
        { status: 401, body: { error: { type: "authentication_error", message: "Invalid API key provided." } } },
      ]);
      const r = await adapter.createAuthorization(baseInput);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
    });

    it("maps throttling and provider outages to RETRYABLE", async () => {
      for (const status of [429, 500]) {
        const { adapter } = stripeAdapter([{ status, body: null }]);
        const r = await adapter.createAuthorization(baseInput);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.code).toBe("RETRYABLE");
          expect(r.retryable).toBe(true);
        }
      }
    });

    it("maps a transport failure to RETRYABLE rather than throwing", async () => {
      const adapter = new StripePaymentAdapter({
        secretKey: FAKE_SECRET_KEY,
        webhookSecret: FAKE_WEBHOOK_SECRET,
        transport: async () => {
          throw new Error("connection reset");
        },
      });
      const r = await adapter.createAuthorization(baseInput);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("RETRYABLE");
    });

    it("refuses an unknown provider status explicitly instead of guessing", async () => {
      const { adapter } = stripeAdapter([
        {
          status: 200,
          body: authorizationIntent({ id: "pi_3", status: "some_future_status" }),
        },
      ]);
      const r = await adapter.createAuthorization(baseInput);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("PERMANENT_FAILURE");
        expect(r.message).toContain("some_future_status");
      }
    });
  });

  describe("captureAuthorization", () => {
    it("captures up to the provider's own capturable amount", async () => {
      const { adapter, requests } = stripeAdapter([
        { status: 200, body: retrievedIntent() },
        {
          status: 200,
          body: { id: "pi_1", status: "succeeded", amount_received: 33999, currency: "usd" },
        },
      ]);
      const r = await adapter.captureAuthorization("pi_1", 33999);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toEqual({
          providerReference: "pi_1",
          capturedAmountCents: 33999,
          currency: "usd",
          status: "captured",
        });
      }
      expect(requests[1].path).toBe("/v1/payment_intents/pi_1/capture");
      expect(requests[1].form?.amount_to_capture).toBe("33999");
    });

    it.each([
      ["wrong retrieved id", retrievedIntent({ id: "pi_other" })],
      ["wrong retrieved currency", retrievedIntent({ currency: "eur" })],
      ["missing intent amount", retrievedIntent({ amount: undefined })],
      ["fractional intent amount", retrievedIntent({ amount: 33999.5 })],
      ["unsafe intent amount", retrievedIntent({ amount: Number.MAX_SAFE_INTEGER + 1 })],
      ["larger intent amount", retrievedIntent({ amount: 34000 })],
      ["fractional capturable amount", retrievedIntent({ amount_capturable: 33999.5 })],
      ["unsafe capturable amount", retrievedIntent({ amount_capturable: Number.MAX_SAFE_INTEGER + 1 })],
      ["larger capturable amount", retrievedIntent({ amount_capturable: 34000 })],
    ])("refuses %s before issuing the capture POST", async (_label, body) => {
      const { adapter, requests } = stripeAdapter([{ status: 200, body }]);

      expect((await adapter.captureAuthorization("pi_1", 33999)).ok).toBe(false);
      expect(requests).toHaveLength(1);
    });

    it.each([
      ["wrong returned id", { id: "pi_other", status: "succeeded", amount_received: 33999, currency: "usd" }],
      ["wrong returned amount", { id: "pi_1", status: "succeeded", amount_received: 33998, currency: "usd" }],
      ["fractional returned amount", { id: "pi_1", status: "succeeded", amount_received: 33999.5, currency: "usd" }],
      ["wrong returned currency", { id: "pi_1", status: "succeeded", amount_received: 33999, currency: "eur" }],
    ])("rejects capture success with %s", async (_label, body) => {
      const { adapter, requests } = stripeAdapter([
        { status: 200, body: retrievedIntent() },
        { status: 200, body },
      ]);

      const result = await adapter.captureAuthorization("pi_1", 33999);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("PERMANENT_FAILURE");
      expect(requests).toHaveLength(2);
    });

    it("refuses over-capture locally, before the capture call is ever made", async () => {
      const { adapter, requests } = stripeAdapter([
        { status: 200, body: retrievedIntent() },
      ]);
      const r = await adapter.captureAuthorization("pi_1", 34000);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("exceeds authorized");
      expect(requests).toHaveLength(1);
    });

    it("refuses a second capture of an already captured payment", async () => {
      const { adapter } = stripeAdapter([
        {
          status: 200,
          body: { id: "pi_1", status: "succeeded", amount_received: 33999, currency: "usd" },
        },
      ]);
      const r = await adapter.captureAuthorization("pi_1");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("already captured");
    });

    it("refuses to capture a cancelled payment", async () => {
      const { adapter } = stripeAdapter([
        { status: 200, body: retrievedIntent({ status: "canceled" }) },
      ]);
      const r = await adapter.captureAuthorization("pi_1");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("cancelled");
    });

    it("refuses to capture an unknown payment", async () => {
      const { adapter } = stripeAdapter([
        { status: 404, body: { error: { type: "invalid_request_error", message: "No such payment_intent" } } },
      ]);
      const r = await adapter.captureAuthorization("pi_missing");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("REJECTED");
    });
  });

  describe("cancelAuthorization", () => {
    it("cancels an authorization", async () => {
      const { adapter, requests } = stripeAdapter([
        { status: 200, body: { id: "pi_1", status: "canceled", currency: "usd", amount_received: 0 } },
      ]);
      const r = await adapter.cancelAuthorization("pi_1");
      expect(r.ok).toBe(true);
      expect(requests[0].path).toBe("/v1/payment_intents/pi_1/cancel");
    });

    it.each([
      ["missing captured amount", { id: "pi_1", status: "canceled", currency: "usd" }],
      ["fractional captured amount", { id: "pi_1", status: "canceled", currency: "usd", amount_received: 0.5 }],
      ["unsafe captured amount", { id: "pi_1", status: "canceled", currency: "usd", amount_received: Number.MAX_SAFE_INTEGER + 1 }],
      ["partially captured amount", { id: "pi_1", status: "canceled", currency: "usd", amount_received: 1 }],
    ])("rejects cancellation success with %s", async (_label, body) => {
      const { adapter } = stripeAdapter([{ status: 200, body }]);

      const result = await adapter.cancelAuthorization("pi_1");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("PERMANENT_FAILURE");
    });

    it("maps the provider's refusal to cancel a captured payment", async () => {
      const { adapter } = stripeAdapter([
        {
          status: 400,
          body: { error: { type: "invalid_request_error", message: "You cannot cancel this PaymentIntent" } },
        },
      ]);
      const r = await adapter.cancelAuthorization("pi_1");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("REJECTED");
    });
  });

  describe("refund", () => {
    const capturedIntent = {
      id: "pi_1",
      status: "succeeded",
      amount_received: 33999,
      currency: "usd",
      latest_charge: { id: "ch_1", amount_refunded: 0 },
    };

    it("refunds within the captured amount and forwards the caller's idempotency key", async () => {
      const { adapter, requests } = stripeAdapter([
        { status: 200, body: capturedIntent },
        {
          status: 200,
          body: {
            id: "re_1",
            status: "succeeded",
            payment_intent: "pi_1",
            amount: 1000,
            currency: "usd",
          },
        },
      ]);
      const r = await adapter.refund("pi_1", 1000, "refund_key_1");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toEqual({
          providerReference: "re_1",
          paymentReference: "pi_1",
          refundedAmountCents: 1000,
          currency: "usd",
          status: "refunded",
        });
      }
      expect(requests[1].path).toBe("/v1/refunds");
      expect(requests[1].idempotencyKey).toBe("refund_key_1");
      expect(requests[1].form?.amount).toBe("1000");
    });

    it.each([
      ["wrong retrieved id", { ...capturedIntent, id: "pi_other" }],
      ["wrong retrieved currency", { ...capturedIntent, currency: "eur" }],
    ])("refuses %s before issuing the refund POST", async (_label, intent) => {
      const { adapter, requests } = stripeAdapter([{ status: 200, body: intent }]);

      expect((await adapter.refund("pi_1", 1000, "refund_preflight_attack")).ok).toBe(false);
      expect(requests).toHaveLength(1);
    });

    it.each([
      ["missing payment reference", { id: "re_1", status: "succeeded", amount: 1000, currency: "usd" }],
      ["missing refund id", { status: "succeeded", payment_intent: "pi_1", amount: 1000, currency: "usd" }],
      ["non-refund id", { id: "pi_1", status: "succeeded", payment_intent: "pi_1", amount: 1000, currency: "usd" }],
      ["wrong reference", { id: "re_1", status: "succeeded", payment_intent: "pi_other", amount: 1000, currency: "usd" }],
      ["missing amount", { id: "re_1", status: "succeeded", payment_intent: "pi_1", currency: "usd" }],
      ["wrong amount", { id: "re_1", status: "succeeded", payment_intent: "pi_1", amount: 999, currency: "usd" }],
      ["malformed amount", { id: "re_1", status: "succeeded", payment_intent: "pi_1", amount: 1000.5, currency: "usd" }],
      ["missing currency", { id: "re_1", status: "succeeded", payment_intent: "pi_1", amount: 1000 }],
      ["wrong currency", { id: "re_1", status: "succeeded", payment_intent: "pi_1", amount: 1000, currency: "eur" }],
    ])("rejects succeeded refund evidence with %s", async (_label, body) => {
      const { adapter } = stripeAdapter([
        { status: 200, body: capturedIntent },
        { status: 200, body },
      ]);

      const result = await adapter.refund("pi_1", 1000, "refund_evidence_attack");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("PERMANENT_FAILURE");
        expect(result.message).toContain("did not match");
      }
    });

    it("refuses over-refund locally, before the refund call is ever made", async () => {
      const { adapter, requests } = stripeAdapter([{ status: 200, body: capturedIntent }]);
      const r = await adapter.refund("pi_1", 34000, "refund_key_2");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("exceeds captured");
      expect(requests).toHaveLength(1);
    });

    it("counts prior partial refunds against the refundable remainder", async () => {
      const { adapter } = stripeAdapter([
        {
          status: 200,
          body: { ...capturedIntent, latest_charge: { id: "ch_1", amount_refunded: 33000 } },
        },
      ]);
      const r = await adapter.refund("pi_1", 1500, "refund_key_3");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("exceeds captured");
    });

    it("refuses to refund a payment that never captured", async () => {
      const { adapter } = stripeAdapter([
        {
          status: 200,
          body: {
            id: "pi_1",
            status: "requires_capture",
            amount_received: 0,
            currency: "usd",
          },
        },
      ]);
      const r = await adapter.refund("pi_1", 100, "refund_key_4");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("Nothing captured");
    });

    it("refuses a non-positive refund amount before any provider call", async () => {
      const { adapter, requests } = stripeAdapter([]);
      expect((await adapter.refund("pi_1", 0, "refund_key_5")).ok).toBe(false);
      expect(requests).toHaveLength(0);
    });

    it("refuses an unsafe-integer refund amount before any provider call", async () => {
      const { adapter, requests } = stripeAdapter([]);
      const unsafe = Number.MAX_SAFE_INTEGER + 1;
      expect((await adapter.refund("pi_1", unsafe, "refund_unsafe")).ok).toBe(false);
      expect(requests).toHaveLength(0);
    });

    it.each([
      ["missing captured amount", { ...capturedIntent, amount_received: undefined }],
      ["fractional captured amount", { ...capturedIntent, amount_received: 33999.5 }],
      ["missing prior-refund amount", { ...capturedIntent, latest_charge: { id: "ch_1" } }],
      ["negative prior-refund amount", { ...capturedIntent, latest_charge: { id: "ch_1", amount_refunded: -1 } }],
      ["prior refund above capture", { ...capturedIntent, latest_charge: { id: "ch_1", amount_refunded: 34000 } }],
    ])("refuses %s before issuing a refund", async (_label, intent) => {
      const { adapter, requests } = stripeAdapter([{ status: 200, body: intent }]);

      expect((await adapter.refund("pi_1", 1000, "refund_ledger_attack")).ok).toBe(false);
      expect(requests).toHaveLength(1);
    });

    // A pending refund can still fail asynchronously; recording it as refunded
    // would permanently record money returned that may never return.
    it("never reports a pending refund as refunded: retryable, not success", async () => {
      const { adapter } = stripeAdapter([
        { status: 200, body: capturedIntent },
        {
          status: 200,
          body: {
            id: "re_1",
            status: "pending",
            payment_intent: "pi_1",
            amount: 1000,
            currency: "usd",
          },
        },
      ]);
      const r = await adapter.refund("pi_1", 1000, "refund_key_6");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("RETRYABLE");
        expect(r.retryable).toBe(true);
        expect(r.message).toContain("not settled");
      }
    });

    it.each([
      ["missing refund id", { status: "pending", payment_intent: "pi_1", amount: 1000, currency: "usd" }],
      ["non-refund id", { id: "pi_1", status: "pending", payment_intent: "pi_1", amount: 1000, currency: "usd" }],
      ["missing payment reference", { id: "re_1", status: "pending", amount: 1000, currency: "usd" }],
      ["wrong payment reference", { id: "re_1", status: "pending", payment_intent: "pi_other", amount: 1000, currency: "usd" }],
      ["wrong amount", { id: "re_1", status: "pending", payment_intent: "pi_1", amount: 999, currency: "usd" }],
      ["fractional amount", { id: "re_1", status: "pending", payment_intent: "pi_1", amount: 1000.5, currency: "usd" }],
      ["wrong currency", { id: "re_1", status: "pending", payment_intent: "pi_1", amount: 1000, currency: "eur" }],
    ])("rejects pending refund evidence with %s", async (_label, body) => {
      const { adapter } = stripeAdapter([
        { status: 200, body: capturedIntent },
        { status: 200, body },
      ]);

      const result = await adapter.refund("pi_1", 1000, "refund_pending_attack");

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("PERMANENT_FAILURE");
    });

    it("refuses an unrecognized refund status (failed, canceled) instead of guessing", async () => {
      const { adapter } = stripeAdapter([
        { status: 200, body: capturedIntent },
        { status: 200, body: { id: "re_1", status: "failed" } },
      ]);
      const r = await adapter.refund("pi_1", 1000, "refund_key_7");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("Refusing to guess");
    });
  });

  describe("retrieveStatus", () => {
    it("maps provider statuses to the domain vocabulary", async () => {
      const cases: Array<[string, string]> = [
        ["requires_capture", "authorized"],
        ["succeeded", "captured"],
        ["canceled", "cancelled"],
        ["processing", "processing"],
        ["requires_payment_method", "pending"],
      ];
      for (const [provider, domain] of cases) {
        const { adapter } = stripeAdapter([
          { status: 200, body: { id: "pi_1", status: provider, currency: "usd" } },
        ]);
        const r = await adapter.retrieveStatus("pi_1");
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.status).toBe(domain);
      }
    });

    it("refuses an unknown status explicitly, never passing it through", async () => {
      const { adapter } = stripeAdapter([
        { status: 200, body: { id: "pi_1", status: "brand_new", currency: "usd" } },
      ]);
      const r = await adapter.retrieveStatus("pi_1");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("PERMANENT_FAILURE");
    });
  });

  describe("verifyWebhook", () => {
    const nowSeconds = Math.floor(NOW_MS / 1000);
    const eventBody = JSON.stringify({
      id: "evt_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_1",
          object: "payment_intent",
          metadata: { orderId: "ord_1" },
          amount_received: 12_345,
          currency: "usd",
        },
      },
    });

    it("accepts a correctly signed event and translates the event type", async () => {
      const { adapter } = stripeAdapter([]);
      const r = await adapter.verifyWebhook(eventBody, sign(eventBody, nowSeconds));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.eventId).toBe("evt_1");
        expect(r.value.eventType).toBe("payment.captured");
        expect(r.value.providerReference).toBe("pi_1");
        expect(r.value.orderId).toBe("ord_1");
        expect(r.value.amountCents).toBe(12_345);
        expect(r.value.currency).toBe("usd");
        expect(r.value.verified).toBe(true);
      }
    });

    it("rejects a missing signature header", async () => {
      const { adapter } = stripeAdapter([]);
      const r = await adapter.verifyWebhook(eventBody, undefined);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("Missing signature");
    });

    it("rejects a signature computed with the wrong secret", async () => {
      const { adapter } = stripeAdapter([]);
      const r = await adapter.verifyWebhook(eventBody, sign(eventBody, nowSeconds, "whsec_other_fake"));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("Invalid signature");
    });

    it("rejects a signed body that was tampered with after signing", async () => {
      const { adapter } = stripeAdapter([]);
      const header = sign(eventBody, nowSeconds);
      const tampered = eventBody.replace("pi_1", "pi_9");
      const r = await adapter.verifyWebhook(tampered, header);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("Invalid signature");
    });

    it("rejects a stale timestamp outside the tolerance window", async () => {
      const { adapter } = stripeAdapter([]);
      const stale = nowSeconds - 301;
      const r = await adapter.verifyWebhook(eventBody, sign(eventBody, stale));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("tolerance");
    });

    it("accepts a timestamp just inside the tolerance window", async () => {
      const { adapter } = stripeAdapter([]);
      const recent = nowSeconds - 299;
      const r = await adapter.verifyWebhook(eventBody, sign(eventBody, recent));
      expect(r.ok).toBe(true);
    });

    it("rejects a malformed signature header", async () => {
      const { adapter } = stripeAdapter([]);
      const r = await adapter.verifyWebhook(eventBody, "not-a-stripe-header");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("Malformed signature");
    });

    it("passes an untranslated event type through for upstream to ignore", async () => {
      const { adapter } = stripeAdapter([]);
      const body = JSON.stringify({ id: "evt_2", type: "payment_intent.created", data: { object: { id: "pi_1" } } });
      const r = await adapter.verifyWebhook(body, sign(body, nowSeconds));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.eventType).toBe("payment_intent.created");
    });

    it("reads the payment reference from a charge event's payment_intent field", async () => {
      const { adapter } = stripeAdapter([]);
      const body = JSON.stringify({
        id: "evt_3",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_1",
            payment_intent: "pi_7",
            metadata: { orderId: "ord_7" },
            amount_refunded: 7_500,
            currency: "usd",
          },
        },
      });
      const r = await adapter.verifyWebhook(body, sign(body, nowSeconds));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.eventType).toBe("payment.refunded");
        expect(r.value.providerReference).toBe("pi_7");
        expect(r.value.orderId).toBe("ord_7");
        expect(r.value.amountCents).toBe(7_500);
        expect(r.value.currency).toBe("usd");
      }
    });

    it("binds a connected-account event to the configured Stripe account", async () => {
      const { adapter } = stripeAdapter([], { providerAccountId: "acct_expected" });
      const event = JSON.parse(eventBody) as Record<string, unknown>;
      const matchingBody = JSON.stringify({ ...event, account: "acct_expected" });
      const mismatchedBody = JSON.stringify({ ...event, account: "acct_other" });

      await expect(adapter.verifyWebhook(matchingBody, sign(matchingBody, nowSeconds))).resolves.toMatchObject({
        ok: true,
        value: { providerAccountId: "acct_expected" },
      });
      await expect(adapter.verifyWebhook(mismatchedBody, sign(mismatchedBody, nowSeconds))).resolves.toMatchObject({
        ok: false,
        code: "REJECTED",
      });
    });
  });
});

describe("verifyStripeSignature", () => {
  it("verifies against any of several v1 candidates (secret rotation)", () => {
    const body = "{}";
    const t = 1000;
    const good = crypto.createHmac("sha256", "s1").update(`${t}.${body}`).digest("hex");
    const header = `t=${t},v1=${"0".repeat(64)},v1=${good}`;
    expect(verifyStripeSignature(body, header, "s1", t * 1000, 300)).toBeNull();
  });

  it("reports malformed when t or v1 is absent", () => {
    expect(verifyStripeSignature("{}", "v1=abc", "s1", 0, 300)).toBe("malformed");
    expect(verifyStripeSignature("{}", "t=1000", "s1", 0, 300)).toBe("malformed");
  });
});

describe("validateStripeConfig", () => {
  it("reports missing variable NAMES only", () => {
    const r = validateStripeConfig({} as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missingEnvironmentVariables).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    }
  });

  it("passes with both names present", () => {
    const r = validateStripeConfig({
      STRIPE_SECRET_KEY: FAKE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
  });
});

describe("resolvePaymentProvider", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("defaults to disabled with an empty environment", () => {
    expect(resolvePaymentProvider({} as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("stays disabled when commerce is off, even if a provider is named", () => {
    const p = resolvePaymentProvider({ PAYMENTS_PROVIDER: "stripe" } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("selects the test provider only outside production", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENTS_PROVIDER: "test",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("test");
  });

  // A misconfiguration must never turn production into fake payments.
  it("refuses the test provider in production and falls back to disabled", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENTS_PROVIDER: "test",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("falls back to disabled for an unknown provider name", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENTS_PROVIDER: "wat",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  // The misconfigured-to-disabled fallback required by the build directive.
  it("falls back to disabled when stripe is selected without credentials", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENTS_PROVIDER: "stripe",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("keeps Stripe disabled even with complete credentials until durable execution is mounted", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENTS_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: FAKE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("keeps unsupported Stripe Connect configuration disabled", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENTS_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: FAKE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
      STRIPE_ACCOUNT_ID: "acct_live_connected",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("keeps the earlier singular PAYMENT_PROVIDER spelling disabled too", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: FAKE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("does not construct any adapter for a synthetic-marked Stripe configuration", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENTS_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_synthetic_test_fixture_123",
      STRIPE_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });
});

describe("TestPaymentProvider production guard", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it("refuses to construct in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => new TestPaymentProvider()).toThrow(/not available in production/);
    expect(() => Reflect.construct(TestPaymentProvider, [{ allowInProduction: true }])).toThrow(
      /not available in production/,
    );
  });
});
