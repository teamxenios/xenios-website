import { describe, expect, it, vi } from "vitest";
import {
  authorizeCheckoutPayment,
  InMemoryPaymentAuthorizationIdempotency,
  inspectUntrustedCheckoutPaymentPayload,
  parseCheckoutPaymentRequest,
  type CheckoutPaymentKernelDependencies,
  type ResolvedMemberPaymentInstrument,
  type ServerVerifiedPaymentQuote,
} from "./checkout-kernel";
import { DisabledPeptidePaymentProvider, TestPeptidePaymentProvider } from "./provider";

const nowMs = Date.parse("2026-08-02T18:00:00.000Z");
const quote: ServerVerifiedPaymentQuote = {
  orderIntentId: "order-intent-1",
  memberId: "member-1",
  amountCents: 12_345,
  currency: "usd",
  quoteVersion: "quote-v1",
  expiresAt: "2026-08-02T18:05:00.000Z",
};
const request = {
  orderIntentId: quote.orderIntentId,
  paymentMethodReference: "pmi_member_1",
  idempotencyKey: "authorize:order-intent-1",
};
const activeInstrument: ResolvedMemberPaymentInstrument = {
  paymentMethodReference: request.paymentMethodReference,
  memberId: "member-1",
  provider: "test",
  providerCustomerReference: "test_cus_member_1",
  providerPaymentMethodReference: "test_pm_success",
  state: "active",
};

function dependencies(
  instrument: ResolvedMemberPaymentInstrument | null = activeInstrument,
): CheckoutPaymentKernelDependencies {
  return {
    instruments: { resolve: vi.fn(async () => instrument) },
    provider: new TestPeptidePaymentProvider({ nodeEnv: "test" }),
    idempotency: new InMemoryPaymentAuthorizationIdempotency(),
    now: () => nowMs,
    audit: vi.fn(),
  };
}

describe("untrusted checkout payment payload", () => {
  it.each([
    { cardNumber: "4242424242424242" },
    { nested: { cvc: "123" } },
    { nested: [{ expiry: "12/30" }] },
    { harmlessLooking: "4242 4242 4242 4242" },
    { bank: { routing_number: "110000000" } },
  ])("rejects raw payment material before parsing: %o", (payload) => {
    expect(inspectUntrustedCheckoutPaymentPayload(payload)).toEqual({ ok: false, code: "unsafe_payment_payload" });
  });

  it.each([
    { ...request, amountCents: 1 },
    { ...request, nested: { total: 1 } },
    { ...request, lines: [{ unit_price_cents: 1 }] },
    { ...request, shippingCents: 1 },
  ])("rejects client money authority: %o", (payload) => {
    expect(parseCheckoutPaymentRequest(payload)).toEqual({ ok: false, code: "client_money_not_allowed" });
  });

  it("accepts only a Xenios internal selector, never a direct provider token", () => {
    expect(parseCheckoutPaymentRequest(request)).toEqual({ ok: true, value: request });
    expect(parseCheckoutPaymentRequest({ ...request, paymentMethodReference: "pm_direct_provider" })).toEqual({
      ok: false,
      code: "payment_request_invalid",
    });
    expect(parseCheckoutPaymentRequest({ ...request, extra: true })).toEqual({
      ok: false,
      code: "payment_request_invalid",
    });
  });
});

describe("member-owned payment instrument resolution", () => {
  it.each([
    ["not found", null],
    ["other member", { ...activeInstrument, memberId: "member-2" }],
    ["disabled", { ...activeInstrument, state: "disabled" as const }],
    ["detached", { ...activeInstrument, state: "detached" as const }],
    ["expired", { ...activeInstrument, state: "expired" as const }],
    ["provider mismatch", { ...activeInstrument, provider: "stripe" as const }],
    ["customer binding missing", { ...activeInstrument, providerCustomerReference: "" }],
    ["method binding malformed", { ...activeInstrument, providerPaymentMethodReference: "4242424242424242" }],
  ])("collapses %s into one non-enumerating denial", async (_label, instrument) => {
    const deps = dependencies(instrument);
    const authorize = vi.spyOn(deps.provider, "authorize");
    const result = await authorizeCheckoutPayment("member-1", request, quote, deps);

    expect(result).toEqual({
      ok: false,
      code: "payment_method_invalid",
      message: "The saved payment method is unavailable.",
      retryable: false,
      idempotentReplay: false,
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("binds the resolved customer and instrument and uses only server quote cents", async () => {
    const deps = dependencies();
    const authorize = vi.spyOn(deps.provider, "authorize");
    const result = await authorizeCheckoutPayment("member-1", request, quote, deps);

    expect(result).toMatchObject({ ok: true, authorization: { amountCents: 12_345, currency: "usd" } });
    expect(authorize).toHaveBeenCalledWith({
      amountCents: 12_345,
      currency: "usd",
      orderIntentId: "order-intent-1",
      memberId: "member-1",
      providerCustomerReference: "test_cus_member_1",
      providerPaymentMethodReference: "test_pm_success",
      idempotencyKey: "authorize:order-intent-1",
    });
  });
});

describe("checkout payment gates and idempotency", () => {
  it("fails closed before instrument resolution when payment is disabled", async () => {
    const resolve = vi.fn();
    const result = await authorizeCheckoutPayment("member-1", request, quote, {
      instruments: { resolve },
      provider: new DisabledPeptidePaymentProvider(),
      idempotency: new InMemoryPaymentAuthorizationIdempotency(),
      now: () => nowMs,
    });
    expect(result).toMatchObject({ ok: false, code: "payment_not_configured" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects invalid, mismatched, and expired server quotes before provider work", async () => {
    for (const invalidQuote of [
      { ...quote, amountCents: 0 },
      { ...quote, currency: "eur" as "usd" },
      { ...quote, memberId: "member-2" },
      { ...quote, expiresAt: "08/02/2026 18:05" },
    ]) {
      const deps = dependencies();
      expect(await authorizeCheckoutPayment("member-1", request, invalidQuote, deps)).toMatchObject({
        ok: false,
        code: "quote_invalid",
      });
      expect(deps.instruments.resolve).not.toHaveBeenCalled();
    }
    const deps = dependencies();
    expect(
      await authorizeCheckoutPayment("member-1", request, { ...quote, expiresAt: "2026-08-02T18:00:00.000Z" }, deps),
    ).toMatchObject({ ok: false, code: "quote_expired" });
    expect(deps.instruments.resolve).not.toHaveBeenCalled();
  });

  it("coalesces concurrent identical commands and replays without a second authorization", async () => {
    const deps = dependencies();
    const authorize = vi.spyOn(deps.provider, "authorize");
    const [first, second] = await Promise.all([
      authorizeCheckoutPayment("member-1", request, quote, deps),
      authorizeCheckoutPayment("member-1", request, quote, deps),
    ]);

    expect(authorize).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ ok: true, idempotentReplay: false });
    expect(second).toMatchObject({ ok: true, idempotentReplay: true });
    expect(first.ok && second.ok ? second.authorization.providerPaymentReference : "").toBe(
      first.ok ? first.authorization.providerPaymentReference : "never",
    );
  });

  it("rejects a conflicting command that reuses an idempotency key", async () => {
    const deps = dependencies();
    const first = await authorizeCheckoutPayment("member-1", request, quote, deps);
    const conflict = await authorizeCheckoutPayment(
      "member-1",
      { ...request, paymentMethodReference: "pmi_member_other" },
      quote,
      deps,
    );
    expect(first.ok).toBe(true);
    expect(conflict).toMatchObject({ ok: false, code: "idempotency_conflict" });
  });

  it("maps decline and retryable provider failure to stable UX contracts", async () => {
    const declined = dependencies({ ...activeInstrument, providerPaymentMethodReference: "test_pm_declined" });
    const unavailable = dependencies({ ...activeInstrument, providerPaymentMethodReference: "test_pm_unavailable" });
    expect(await authorizeCheckoutPayment("member-1", request, quote, declined)).toMatchObject({
      ok: false,
      code: "payment_declined",
      retryable: false,
    });
    expect(await authorizeCheckoutPayment("member-1", request, quote, unavailable)).toMatchObject({
      ok: false,
      code: "payment_provider_unavailable",
      retryable: true,
    });
  });
});
