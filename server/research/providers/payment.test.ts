import { describe, expect, it, afterEach } from "vitest";
import {
  DisabledPaymentProvider,
  StripePaymentAdapter,
  TestPaymentProvider,
  resolvePaymentProvider,
} from "./payment";

const baseInput = {
  amountCents: 33999,
  currency: "usd" as const,
  orderId: "ord_1",
  memberId: "mem_1",
  idempotencyKey: "key_1",
};

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

  it("rejects a non-positive amount", async () => {
    const p = new TestPaymentProvider();
    const r = await p.createAuthorization({ ...baseInput, amountCents: 0 });
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

  it("refuses to refund something never captured", async () => {
    const p = new TestPaymentProvider();
    const auth = await p.createAuthorization(baseInput);
    if (!auth.ok) throw new Error("setup failed");
    expect((await p.refund(auth.value.providerReference, 100, "r1")).ok).toBe(false);
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
      const body = JSON.stringify({ id: "evt_1", type: "payment.captured", providerReference: "x" });
      const r = await p.verifyWebhook(body, "test-signature");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.verified).toBe(true);
    });

    // Replay protection is required by the build directive.
    it("rejects a replayed event id", async () => {
      const p = new TestPaymentProvider();
      const body = JSON.stringify({ id: "evt_dup", type: "payment.captured" });
      expect((await p.verifyWebhook(body, "test-signature")).ok).toBe(true);
      const replay = await p.verifyWebhook(body, "test-signature");
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.message).toContain("Duplicate");
    });
  });
});

describe("StripePaymentAdapter shell", () => {
  it("refuses every call as MISCONFIGURED rather than faking success", async () => {
    const p = new StripePaymentAdapter();
    const r = await p.createAuthorization();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  it("declares the credential names it will need, without any values", () => {
    expect(StripePaymentAdapter.requiredEnvironmentVariables).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ]);
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
    const p = resolvePaymentProvider({ PAYMENT_PROVIDER: "stripe" } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("selects the test provider only outside production", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENT_PROVIDER: "test",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("test");
  });

  // A misconfiguration must never turn production into fake payments.
  it("refuses the test provider in production and falls back to disabled", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENT_PROVIDER: "test",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("falls back to disabled for an unknown provider name", () => {
    const p = resolvePaymentProvider({
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
      PAYMENT_PROVIDER: "wat",
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
  });
});
