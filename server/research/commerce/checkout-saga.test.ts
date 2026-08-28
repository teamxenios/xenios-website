import { describe, expect, it, vi } from "vitest";
import type { CartDto, CheckoutRequest } from "@shared/research/commerce-api";
import type { ProviderResult } from "@shared/research/capability";
import { ConfiguredRateShippingProvider } from "../providers/shipping";
import {
  TestPaymentProvider,
  type CreateAuthorizationInput,
  type PaymentAuthorization,
  type PaymentCapture,
  type PaymentProvider,
} from "../providers/payment";
import {
  createAtomicCheckoutService,
  createInMemoryCheckoutSagaControl,
  type AtomicCheckoutDeps,
  type CheckoutActivationPrechargePort,
} from "./checkout-saga";

const NOW = new Date("2026-08-28T10:00:00.000Z");
const MEMBER = "11111111-1111-4111-8111-111111111111";
const SHA = `sha256:${"a".repeat(64)}`;

function cart(credit = 0): CartDto {
  return {
    lines: [{
      sku: "XR-ATOM-1",
      displayName: "Atomic Test Product",
      quantity: 2,
      purchaseMode: "one_time",
      unitPriceCents: 9_900,
      lineTotalCents: 19_800,
      blockedReason: null,
    }],
    shipmentGroups: [{ owner: "mitch", skus: ["XR-ATOM-1"] }],
    subtotalCents: 19_800,
    shippingCents: 1_295,
    storeCreditAppliedCents: credit,
    estimatedTotalCents: 21_095 - credit,
    checkoutReady: true,
    blockingReasons: [],
    requiredAgreements: ["XR-COM-001"],
  };
}

function request(idempotencyKey = "checkout-key-1", credit = 0): CheckoutRequest {
  return {
    shippingAddress: {
      line1: "100 Main St",
      city: "Houston",
      state: "TX",
      postalCode: "77002",
      country: "US",
    },
    shippingService: "standard",
    applyStoreCreditCents: credit,
    acceptedAgreementKeys: ["XR-COM-001"],
    researchAttestation: true,
    idempotencyKey,
    paymentMethodReference: "pm_test_atomic",
  };
}

function activation(overrides: Partial<CheckoutActivationPrechargePort> = {}): CheckoutActivationPrechargePort {
  return {
    async authorize(input) {
      return {
        ok: true,
        authorization: {
          intentId: "22222222-2222-4222-8222-222222222222",
          cartId: "33333333-3333-4333-8333-333333333333",
          cartVersion: 7,
          cartFingerprint: SHA,
          lines: [{
            productId: "44444444-4444-4444-8444-444444444444",
            variantId: "55555555-5555-4555-8555-555555555555",
            sku: "XR-ATOM-1",
            productRevision: 4,
            variantRevision: 8,
            bindingFingerprint: SHA,
            activationLedgerRevision: 12,
            activationEvidenceFingerprint: SHA,
            quantity: 2,
            purchaseMode: "one_time",
          }],
          authorizedAt: input.evaluatedAt,
          expiresAt: new Date(Date.parse(input.evaluatedAt) + input.leaseTtlSeconds * 1_000).toISOString(),
        },
      };
    },
    async consume() {
      return { ok: true };
    },
    async claim() {
      return { ok: true, state: "claimed", idempotent: false };
    },
    async cancel() {
      return { ok: true };
    },
    ...overrides,
  };
}

function deps(input: {
  payment?: PaymentProvider;
  activation?: CheckoutActivationPrechargePort;
  credit?: number;
  control?: ReturnType<typeof createInMemoryCheckoutSagaControl>;
} = {}): AtomicCheckoutDeps & { control: ReturnType<typeof createInMemoryCheckoutSagaControl> } {
  const control = input.control ?? createInMemoryCheckoutSagaControl();
  return {
    control,
    cart: { revalidate: async () => cart(input.credit ?? 0) },
    activation: input.activation ?? activation(),
    saga: control.store,
    payment: input.payment ?? new TestPaymentProvider(),
    shipping: new ConfiguredRateShippingProvider(),
    commerceEnabled: true,
    atomicCapabilityReady: true,
    serviceableStates: ["TX"],
    acceptedAgreementKeys: ["XR-COM-001"],
  };
}

class AmbiguousOncePayment implements PaymentProvider {
  readonly name = "ambiguous-test";
  readonly supportsDeferredCapture = true;
  private ambiguousAuthorization = true;
  private ambiguousCapture = false;
  constructor(
    private readonly delegate = new TestPaymentProvider(),
    phase: "authorization" | "capture" = "authorization",
  ) {
    this.ambiguousAuthorization = phase === "authorization";
    this.ambiguousCapture = phase === "capture";
  }
  async createAuthorization(input: CreateAuthorizationInput): Promise<ProviderResult<PaymentAuthorization>> {
    const result = await this.delegate.createAuthorization(input);
    if (this.ambiguousAuthorization && result.ok) {
      this.ambiguousAuthorization = false;
      return {
        ok: false,
        code: "RETRYABLE",
        message: "Synthetic connection loss after provider accepted the command.",
        retryable: true,
        providerReference: result.value.providerReference,
      };
    }
    return result;
  }
  async captureAuthorization(ref: string, amount?: number, key?: string): Promise<ProviderResult<PaymentCapture>> {
    const result = await this.delegate.captureAuthorization(ref, amount, key);
    if (this.ambiguousCapture && result.ok) {
      this.ambiguousCapture = false;
      return {
        ok: false,
        code: "RETRYABLE",
        message: "Synthetic connection loss after provider captured.",
        retryable: true,
        providerReference: ref,
      };
    }
    return result;
  }
  cancelAuthorization(ref: string, key?: string) {
    return this.delegate.cancelAuthorization(ref, key);
  }
  refund(ref: string, amount: number, key: string) {
    return this.delegate.refund(ref, amount, key);
  }
  retrieveStatus(ref: string) {
    return this.delegate.retrieveStatus(ref);
  }
  verifyWebhook(raw: string, signature: string | undefined) {
    return this.delegate.verifyWebhook(raw, signature);
  }
}

describe("durable checkout financial saga", () => {
  it("serializes two process instances to one authorization, capture, order, and internal completion", async () => {
    let completions = 0;
    const control = createInMemoryCheckoutSagaControl({
      complete: async () => { completions += 1; },
    });
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const capture = vi.spyOn(payment, "captureAuthorization");
    const first = createAtomicCheckoutService(deps({ control, payment }));
    const second = createAtomicCheckoutService(deps({ control, payment }));

    const results = await Promise.all([
      first.submit(MEMBER, request(), NOW),
      second.submit(MEMBER, request(), NOW),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(new Set(results.flatMap((result) => result.ok ? [result.order.orderId] : [])).size).toBe(1);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(completions).toBe(1);
  });

  it("recovers a crash after provider authorization without creating a second authorization", async () => {
    const control = createInMemoryCheckoutSagaControl();
    control.setCrashPoint("record_authorization");
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const service = createAtomicCheckoutService(deps({ control, payment }));

    await expect(service.submit(MEMBER, request(), NOW)).rejects.toThrow("record_authorization");
    const recovered = await service.submit(MEMBER, request(), new Date(NOW.getTime() + 1_000));

    expect(recovered.ok).toBe(true);
    expect(authorize).toHaveBeenCalledTimes(2);
    if (recovered.ok) expect(recovered.order.paymentReference).toBe("test_auth_1");
  });

  it("recovers a crash after provider capture and publishes internal effects once", async () => {
    let completions = 0;
    const control = createInMemoryCheckoutSagaControl({
      complete: async () => { completions += 1; },
    });
    control.setCrashPoint("complete");
    const payment = new TestPaymentProvider();
    const capture = vi.spyOn(payment, "captureAuthorization");
    const service = createAtomicCheckoutService(deps({ control, payment }));

    await expect(service.submit(MEMBER, request(), NOW)).rejects.toThrow("complete");
    const recovered = await service.submit(MEMBER, request(), new Date(NOW.getTime() + 1_000));

    expect(recovered.ok).toBe(true);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(completions).toBe(1);
  });

  it.each(["authorization", "capture"] as const)(
    "keeps an ambiguous %s result pending and recovers only through the same provider command",
    async (phase) => {
      const payment = new AmbiguousOncePayment(new TestPaymentProvider(), phase);
      const control = createInMemoryCheckoutSagaControl();
      const service = createAtomicCheckoutService(deps({ control, payment }));

      const pending = await service.submit(MEMBER, request(), NOW);
      expect(pending).toMatchObject({
        ok: false,
        denials: ["checkout_reconciliation_pending"],
        retryable: true,
        reconciliation: { phase },
      });
      const recovered = await service.submit(MEMBER, request(), new Date(NOW.getTime() + 1_000));
      expect(recovered.ok).toBe(true);
    },
  );

  it("never manufactures captured money from a status that omits the exact amount", async () => {
    const fallback = new TestPaymentProvider();
    const payment: PaymentProvider = {
      name: "amount-ambiguous-test",
      supportsDeferredCapture: true,
      createAuthorization: async () => ({
        ok: false,
        code: "REJECTED",
        message: "Provider object exists but authorization was refused.",
        retryable: false,
        providerReference: "pi_amount_unknown",
      }),
      captureAuthorization: (ref, amount, key) => fallback.captureAuthorization(ref, amount, key),
      cancelAuthorization: async () => ({
        ok: false,
        code: "REJECTED",
        message: "Capture may have won the cancellation race.",
        retryable: false,
        providerReference: "pi_amount_unknown",
      }),
      retrieveStatus: async () => ({ ok: true, value: { status: "captured" } }),
      refund: (ref, amount, key) => fallback.refund(ref, amount, key),
      verifyWebhook: (raw, signature) => fallback.verifyWebhook(raw, signature),
    };
    const service = createAtomicCheckoutService(deps({ payment }));

    const result = await service.submit(MEMBER, request(), NOW);

    expect(result).toMatchObject({
      ok: false,
      denials: ["checkout_reconciliation_pending"],
      reconciliation: { phase: "cancellation" },
    });
  });

  it("recovers an unexpected immediate capture only from exact amount and currency evidence", async () => {
    const fallback = new TestPaymentProvider();
    const payment: PaymentProvider = {
      name: "immediate-capture-test",
      supportsDeferredCapture: true,
      createAuthorization: async () => ({
        ok: false,
        code: "PERMANENT_FAILURE",
        message: "Provider captured despite a deferred-capture command.",
        retryable: false,
        providerReference: "pi_immediate_capture",
      }),
      captureAuthorization: (ref, amount, key) => fallback.captureAuthorization(ref, amount, key),
      cancelAuthorization: async () => ({
        ok: false,
        code: "REJECTED",
        message: "Captured payment cannot be cancelled.",
        retryable: false,
        providerReference: "pi_immediate_capture",
      }),
      retrieveStatus: async () => ({
        ok: true,
        value: { status: "captured", currency: "usd", capturedAmountCents: 21_095 },
      }),
      refund: (ref, amount, key) => fallback.refund(ref, amount, key),
      verifyWebhook: (raw, signature) => fallback.verifyWebhook(raw, signature),
    };
    const service = createAtomicCheckoutService(deps({ payment }));

    const result = await service.submit(MEMBER, request(), NOW);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.paymentReference).toBe("pi_immediate_capture");
  });

  it("rejects changed address/totals under one idempotency key before another provider call", async () => {
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const service = createAtomicCheckoutService(deps({ payment }));
    expect((await service.submit(MEMBER, request(), NOW)).ok).toBe(true);

    const changed = request();
    changed.shippingAddress = { ...changed.shippingAddress, postalCode: "77003" };
    const conflict = await service.submit(MEMBER, changed, new Date(NOW.getTime() + 1_000));

    expect(conflict).toMatchObject({ ok: false, denials: ["idempotency_conflict"] });
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("fails closed before payment when activation authority is unavailable or evidence is expired", async () => {
    const payment = new TestPaymentProvider();
    const authorize = vi.spyOn(payment, "createAuthorization");
    const unavailable = createAtomicCheckoutService(deps({
      payment,
      activation: activation({ authorize: async () => ({ ok: false, code: "authority_unavailable" }) }),
    }));
    const expired = createAtomicCheckoutService(deps({
      payment,
      activation: activation({
        authorize: async (input) => {
          const base = await activation().authorize(input);
          if (!base.ok) return base;
          return { ok: true, authorization: { ...base.authorization, expiresAt: input.evaluatedAt } };
        },
      }),
    }));

    expect((await unavailable.submit(MEMBER, request("unavailable"), NOW)).ok).toBe(false);
    expect((await expired.submit(MEMBER, request("expired"), NOW)).ok).toBe(false);
    expect(authorize).not.toHaveBeenCalled();
  });

  it("holds store credit at begin so two commands cannot spend the same balance", async () => {
    let balance = 800;
    let spends = 0;
    const control = createInMemoryCheckoutSagaControl({
      storeCreditBalanceCents: async () => balance,
      complete: async (command) => {
        balance -= command.totals.storeCreditAppliedCents;
        spends += command.totals.storeCreditAppliedCents;
      },
    });
    const payment = new TestPaymentProvider();
    const first = createAtomicCheckoutService(deps({ control, payment, credit: 800 }));
    const second = createAtomicCheckoutService(deps({ control, payment, credit: 800 }));

    const results = await Promise.all([
      first.submit(MEMBER, request("credit-a", 800), NOW),
      second.submit(MEMBER, request("credit-b", 800), NOW),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(balance).toBe(0);
    expect(spends).toBe(800);
  });

  it("does not run completion effects when the atomic completion transaction crashes", async () => {
    let completions = 0;
    const control = createInMemoryCheckoutSagaControl({ complete: async () => { completions += 1; } });
    control.setCrashPoint("complete");
    const service = createAtomicCheckoutService(deps({ control }));

    await expect(service.submit(MEMBER, request(), NOW)).rejects.toThrow();
    expect(completions).toBe(0);
  });
});
