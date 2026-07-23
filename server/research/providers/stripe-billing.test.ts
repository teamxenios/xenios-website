import crypto from "crypto";
import { describe, expect, it } from "vitest";
import type { StripeRequest } from "./payment";
import {
  ACTIVATION_AMOUNT_CENTS,
  DisabledMembershipBillingProvider,
  MEMBERSHIP_MONTHLY_AMOUNT_CENTS,
  STRIPE_BILLING_ENVIRONMENT_VARIABLES,
  StripeMembershipBillingAdapter,
  resolveMembershipBillingProvider,
  validateStripeBillingConfig,
} from "./stripe-billing";

// Deliberately fake placeholder strings. They match no Stripe key format and
// never leave the injected transport.
const FAKE_SECRET_KEY = "sk_fake_unit_test_only";
const FAKE_WEBHOOK_SECRET = "whsec_fake_unit_test_only";
const FAKE_ACTIVATION_PRICE = "price_fake_activation";
const FAKE_MEMBERSHIP_PRICE = "price_fake_membership";
const NOW_MS = Date.parse("2026-07-22T12:00:00Z");

function billingAdapter(responses: Array<{ status: number; body: unknown }>) {
  const requests: StripeRequest[] = [];
  const queue = [...responses];
  const adapter = new StripeMembershipBillingAdapter({
    secretKey: FAKE_SECRET_KEY,
    webhookSecret: FAKE_WEBHOOK_SECRET,
    activationPriceId: FAKE_ACTIVATION_PRICE,
    membershipPriceId: FAKE_MEMBERSHIP_PRICE,
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

function subscriptionBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sub_1",
    status: "incomplete",
    cancel_at_period_end: false,
    items: { data: [{ price: { id: FAKE_MEMBERSHIP_PRICE, unit_amount: MEMBERSHIP_MONTHLY_AMOUNT_CENTS } }] },
    latest_invoice: { id: "in_1" },
    ...overrides,
  };
}

describe("the membership offer constants", () => {
  it("encode the $50 activation and $25 monthly amounts", () => {
    expect(ACTIVATION_AMOUNT_CENTS).toBe(5000);
    expect(MEMBERSHIP_MONTHLY_AMOUNT_CENTS).toBe(2500);
  });
});

describe("DisabledMembershipBillingProvider (the production default)", () => {
  const p = new DisabledMembershipBillingProvider();

  it("refuses every operation with a structured DISABLED result, never a throw", async () => {
    for (const result of [
      await p.createCustomer(),
      await p.createActivationCheckout(),
      await p.startSubscription(),
      await p.cancelSubscription(),
      await p.reactivateSubscription(),
      await p.reconcileSubscription(),
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

describe("StripeMembershipBillingAdapter", () => {
  it("refuses to construct without a complete configuration", () => {
    expect(
      () =>
        new StripeMembershipBillingAdapter({
          secretKey: FAKE_SECRET_KEY,
          webhookSecret: FAKE_WEBHOOK_SECRET,
          activationPriceId: "",
          membershipPriceId: FAKE_MEMBERSHIP_PRICE,
        }),
    ).toThrow(/complete configuration/);
  });

  describe("createCustomer", () => {
    it("creates a customer carrying the member id and the caller's idempotency key", async () => {
      const { adapter, requests } = billingAdapter([{ status: 200, body: { id: "cus_1" } }]);
      const r = await adapter.createCustomer({
        memberId: "mem_1",
        email: "member@example.com",
        idempotencyKey: "cust_key_1",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.customerId).toBe("cus_1");
      expect(requests[0].path).toBe("/v1/customers");
      expect(requests[0].idempotencyKey).toBe("cust_key_1");
      expect(requests[0].form?.["metadata[memberId]"]).toBe("mem_1");
    });
  });

  describe("createActivationCheckout", () => {
    const sessionBody = {
      id: "cs_1",
      url: "https://checkout.example/cs_1",
      amount_total: ACTIVATION_AMOUNT_CENTS,
    };

    it("creates a hosted checkout for the $50 activation against the env-named price", async () => {
      const { adapter, requests } = billingAdapter([{ status: 200, body: sessionBody }]);
      const r = await adapter.createActivationCheckout({
        customerId: "cus_1",
        memberId: "mem_1",
        idempotencyKey: "act_key_1",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.reference).toBe("cs_1");
        expect(r.value.checkoutUrl).toBe("https://checkout.example/cs_1");
        expect(r.value.amountCents).toBe(ACTIVATION_AMOUNT_CENTS);
      }
      expect(requests[0].form?.mode).toBe("payment");
      expect(requests[0].form?.["line_items[0][price]"]).toBe(FAKE_ACTIVATION_PRICE);
      expect(requests[0].idempotencyKey).toBe("act_key_1");
    });

    it("refuses a session that would charge anything other than $50", async () => {
      const { adapter } = billingAdapter([
        { status: 200, body: { ...sessionBody, amount_total: 9900 } },
      ]);
      const r = await adapter.createActivationCheckout({
        customerId: "cus_1",
        memberId: "mem_1",
        idempotencyKey: "act_key_2",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("MISCONFIGURED");
        expect(r.message).toContain("STRIPE_PRICE_RESEARCH_ACTIVATION");
      }
    });
  });

  describe("startSubscription", () => {
    it("starts the $25 monthly subscription and returns the separate recurring reference", async () => {
      const { adapter, requests } = billingAdapter([{ status: 200, body: subscriptionBody() }]);
      const r = await adapter.startSubscription({
        customerId: "cus_1",
        memberId: "mem_1",
        idempotencyKey: "sub_key_1",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.subscriptionId).toBe("sub_1");
        expect(r.value.billingState).toBe("subscription_pending");
        expect(r.value.latestInvoiceReference).toBe("in_1");
      }
      expect(requests[0].path).toBe("/v1/subscriptions");
      expect(requests[0].form?.["items[0][price]"]).toBe(FAKE_MEMBERSHIP_PRICE);
      expect(requests[0].form?.payment_behavior).toBe("default_incomplete");
      expect(requests[0].idempotencyKey).toBe("sub_key_1");
    });

    it("refuses a subscription that would charge anything other than $25 monthly", async () => {
      const { adapter } = billingAdapter([
        {
          status: 200,
          body: subscriptionBody({ items: { data: [{ price: { unit_amount: 1000 } }] } }),
        },
      ]);
      const r = await adapter.startSubscription({
        customerId: "cus_1",
        memberId: "mem_1",
        idempotencyKey: "sub_key_2",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("MISCONFIGURED");
        expect(r.message).toContain("STRIPE_PRICE_RESEARCH_MEMBERSHIP");
      }
    });

    it("maps an active subscription to the active billing state", async () => {
      const { adapter } = billingAdapter([{ status: 200, body: subscriptionBody({ status: "active" }) }]);
      const r = await adapter.startSubscription({
        customerId: "cus_1",
        memberId: "mem_1",
        idempotencyKey: "sub_key_3",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.billingState).toBe("active");
    });

    it("refuses an unmapped subscription status explicitly instead of guessing", async () => {
      const { adapter } = billingAdapter([{ status: 200, body: subscriptionBody({ status: "paused" }) }]);
      const r = await adapter.startSubscription({
        customerId: "cus_1",
        memberId: "mem_1",
        idempotencyKey: "sub_key_4",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("PERMANENT_FAILURE");
        expect(r.message).toContain("paused");
      }
    });

    it("maps a failed first payment to REJECTED via the provider error", async () => {
      const { adapter } = billingAdapter([
        { status: 402, body: { error: { type: "card_error", message: "Your card was declined." } } },
      ]);
      const r = await adapter.startSubscription({
        customerId: "cus_1",
        memberId: "mem_1",
        idempotencyKey: "sub_key_5",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("REJECTED");
    });
  });

  describe("cancel, reactivate, reconcile", () => {
    it("cancels at period end by default, keeping the member active until then", async () => {
      const { adapter, requests } = billingAdapter([
        { status: 200, body: subscriptionBody({ status: "active", cancel_at_period_end: true }) },
      ]);
      const r = await adapter.cancelSubscription("sub_1");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.billingState).toBe("active");
        expect(r.value.cancelAtPeriodEnd).toBe(true);
      }
      expect(requests[0].method).toBe("POST");
      expect(requests[0].form?.cancel_at_period_end).toBe("true");
    });

    it("cancels immediately when asked, mapping to cancelled", async () => {
      const { adapter, requests } = billingAdapter([
        { status: 200, body: subscriptionBody({ status: "canceled" }) },
      ]);
      const r = await adapter.cancelSubscription("sub_1", { atPeriodEnd: false });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.billingState).toBe("cancelled");
      expect(requests[0].method).toBe("DELETE");
      expect(requests[0].path).toBe("/v1/subscriptions/sub_1");
    });

    it("reactivates a pending cancellation", async () => {
      const { adapter, requests } = billingAdapter([
        { status: 200, body: subscriptionBody({ status: "active", cancel_at_period_end: false }) },
      ]);
      const r = await adapter.reactivateSubscription("sub_1");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.billingState).toBe("active");
        expect(r.value.cancelAtPeriodEnd).toBe(false);
      }
      expect(requests[0].form?.cancel_at_period_end).toBe("false");
    });

    it("maps the provider's refusal to reactivate a fully cancelled subscription", async () => {
      const { adapter } = billingAdapter([
        {
          status: 400,
          body: { error: { type: "invalid_request_error", message: "This subscription is canceled." } },
        },
      ]);
      const r = await adapter.reactivateSubscription("sub_1");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("REJECTED");
    });

    it("reconciles the provider's current state, including dunning", async () => {
      const { adapter, requests } = billingAdapter([
        { status: 200, body: subscriptionBody({ status: "past_due" }) },
      ]);
      const r = await adapter.reconcileSubscription("sub_1");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.billingState).toBe("past_due");
        expect(r.value.providerStatus).toBe("past_due");
      }
      expect(requests[0].method).toBe("GET");
      expect(requests[0].path).toBe("/v1/subscriptions/sub_1");
    });
  });

  describe("verifyWebhook", () => {
    const nowSeconds = Math.floor(NOW_MS / 1000);

    function event(type: string, object: Record<string, unknown>): string {
      return JSON.stringify({ id: "evt_1", type, data: { object } });
    }

    it("maps a failed payment to past_due; the provider's retry outcomes arrive as later events", async () => {
      const { adapter } = billingAdapter([]);
      const body = event("invoice.payment_failed", { id: "in_1", subscription: "sub_1" });
      const r = await adapter.verifyWebhook(body, sign(body, nowSeconds));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.billingEffect).toBe("past_due");
        expect(r.value.subscriptionReference).toBe("sub_1");
      }
    });

    it("maps a paid invoice to active", async () => {
      const { adapter } = billingAdapter([]);
      const body = event("invoice.paid", { id: "in_1", subscription: "sub_1" });
      const r = await adapter.verifyWebhook(body, sign(body, nowSeconds));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.billingEffect).toBe("active");
    });

    it("maps completion of the activation checkout to subscription_pending", async () => {
      const { adapter } = billingAdapter([]);
      const body = event("checkout.session.completed", { id: "cs_1", payment_intent: "pi_1" });
      const r = await adapter.verifyWebhook(body, sign(body, nowSeconds));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.billingEffect).toBe("subscription_pending");
        expect(r.value.paymentReference).toBe("pi_1");
      }
    });

    it("maps refunds and disputes to their billing states", async () => {
      const { adapter } = billingAdapter([]);
      for (const [type, effect] of [
        ["charge.refunded", "refunded"],
        ["charge.dispute.created", "disputed"],
        ["customer.subscription.deleted", "cancelled"],
      ] as const) {
        const body = event(type, { id: "obj_1", subscription: "sub_1" });
        const r = await adapter.verifyWebhook(body, sign(body, nowSeconds));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.billingEffect).toBe(effect);
      }
    });

    it("verifies an unmapped event type but carries no billing effect", async () => {
      const { adapter } = billingAdapter([]);
      const body = event("customer.subscription.updated", { id: "sub_1" });
      const r = await adapter.verifyWebhook(body, sign(body, nowSeconds));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.billingEffect).toBeUndefined();
        expect(r.value.subscriptionReference).toBe("sub_1");
      }
    });

    it("rejects a bad signature", async () => {
      const { adapter } = billingAdapter([]);
      const body = event("invoice.paid", { id: "in_1" });
      const r = await adapter.verifyWebhook(body, sign(body, nowSeconds, "whsec_other_fake"));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("Invalid signature");
    });

    it("rejects a stale timestamp", async () => {
      const { adapter } = billingAdapter([]);
      const body = event("invoice.paid", { id: "in_1" });
      const r = await adapter.verifyWebhook(body, sign(body, nowSeconds - 301));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("tolerance");
    });

    it("rejects a missing signature header", async () => {
      const { adapter } = billingAdapter([]);
      const r = await adapter.verifyWebhook(event("invoice.paid", { id: "in_1" }), undefined);
      expect(r.ok).toBe(false);
    });
  });
});

describe("validateStripeBillingConfig", () => {
  it("reports missing variable NAMES only, never values", () => {
    const r = validateStripeBillingConfig({} as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missingEnvironmentVariables).toEqual([...STRIPE_BILLING_ENVIRONMENT_VARIABLES]);
    }
  });

  it("reports only what is missing", () => {
    const r = validateStripeBillingConfig({
      STRIPE_SECRET_KEY: FAKE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missingEnvironmentVariables).toEqual([
        "STRIPE_PRICE_RESEARCH_ACTIVATION",
        "STRIPE_PRICE_RESEARCH_MEMBERSHIP",
      ]);
    }
  });
});

describe("resolveMembershipBillingProvider", () => {
  const completeEnv = {
    RESEARCH_MEMBERSHIP_BILLING_ENABLED: "true",
    PAYMENTS_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: FAKE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
    STRIPE_PRICE_RESEARCH_ACTIVATION: FAKE_ACTIVATION_PRICE,
    STRIPE_PRICE_RESEARCH_MEMBERSHIP: FAKE_MEMBERSHIP_PRICE,
  };

  it("defaults to disabled with an empty environment", () => {
    expect(resolveMembershipBillingProvider({} as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("stays disabled while the billing flag is off, even fully configured", () => {
    const env = { ...completeEnv, RESEARCH_MEMBERSHIP_BILLING_ENABLED: "false" };
    expect(resolveMembershipBillingProvider(env as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("stays disabled when stripe is not the selected provider", () => {
    const env = { ...completeEnv, PAYMENTS_PROVIDER: "test" };
    expect(resolveMembershipBillingProvider(env as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("falls back to disabled when any credential name is absent", () => {
    const env: Record<string, string | undefined> = { ...completeEnv };
    delete env.STRIPE_PRICE_RESEARCH_MEMBERSHIP;
    expect(resolveMembershipBillingProvider(env as NodeJS.ProcessEnv).name).toBe("disabled");
  });

  it("constructs the stripe adapter only from a complete configuration", () => {
    expect(resolveMembershipBillingProvider(completeEnv as NodeJS.ProcessEnv).name).toBe("stripe");
  });
});
