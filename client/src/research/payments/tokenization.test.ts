import { describe, expect, it, vi } from "vitest";
import {
  resolvePublicPaymentConfiguration,
  tokenizePaymentMethod,
  type ProviderHostedPaymentElement,
  type StripeBrowserSdk,
} from "./tokenization";

const ready = resolvePublicPaymentConfiguration({
  provider: "stripe",
  publishableKey: "pk_test_synthetic_fixture_123",
});

function hosted(element: unknown = { providerOwned: true }): ProviderHostedPaymentElement {
  return { provider: "stripe", element };
}

const registrar = {
  register: vi.fn(async () => ({ ok: true as const, paymentMethodReference: "pmi_member_saved_1" })),
};

describe("public payment configuration", () => {
  it("fails closed for disabled, missing, unsupported, and malformed states", () => {
    expect(resolvePublicPaymentConfiguration({})).toEqual({ state: "disabled" });
    expect(resolvePublicPaymentConfiguration({ provider: "disabled" })).toEqual({ state: "disabled" });
    expect(resolvePublicPaymentConfiguration({ provider: "stripe" })).toEqual({
      state: "not_configured",
      missing: ["VITE_STRIPE_PUBLISHABLE_KEY"],
    });
    expect(resolvePublicPaymentConfiguration({ provider: "other", publishableKey: "anything" }).state).toBe("invalid");
    expect(resolvePublicPaymentConfiguration({ provider: "stripe", publishableKey: "sk_test_secret" }).state).toBe(
      "invalid",
    );
  });

  it("derives test/live mode only from a valid publishable key", () => {
    expect(ready).toMatchObject({ state: "ready", provider: "stripe", mode: "test" });
    expect(
      resolvePublicPaymentConfiguration({ provider: "stripe", publishableKey: "pk_live_synthetic_fixture_123" }),
    ).toMatchObject({ state: "ready", mode: "live" });
  });
});

describe("provider-hosted tokenization", () => {
  it("never calls the SDK unless configuration and the hosted field are ready", async () => {
    const createPaymentMethod = vi.fn();
    const sdk = { createPaymentMethod } as StripeBrowserSdk;

    expect(
      await tokenizePaymentMethod({ configuration: { state: "disabled" }, hostedElement: hosted(), sdk, registrar }),
    ).toMatchObject({ ok: false, code: "payment_disabled" });
    expect(
      await tokenizePaymentMethod({
        configuration: { state: "not_configured", missing: ["VITE_STRIPE_PUBLISHABLE_KEY"] },
        hostedElement: hosted(),
        sdk,
        registrar,
      }),
    ).toMatchObject({ ok: false, code: "payment_not_configured" });
    expect(
      await tokenizePaymentMethod({ configuration: ready, hostedElement: hosted(null), sdk, registrar }),
    ).toMatchObject({ ok: false, code: "payment_method_invalid" });
    expect(createPaymentMethod).not.toHaveBeenCalled();
  });

  it("passes only the opaque hosted element and bounded billing identity to the SDK", async () => {
    const providerOwnedElement = { opaque: Symbol("provider-owned") };
    const createPaymentMethod = vi.fn(async () => ({ paymentMethod: { id: "pm_test_success_1" } }));
    const result = await tokenizePaymentMethod({
      configuration: ready,
      hostedElement: hosted(providerOwnedElement),
      sdk: { createPaymentMethod },
      registrar,
      billingIdentity: { name: "  Research Member  ", email: " member@example.invalid " },
    });

    expect(result).toEqual({ ok: true, paymentMethodReference: "pmi_member_saved_1" });
    expect(createPaymentMethod).toHaveBeenCalledWith({
      type: "card",
      card: providerOwnedElement,
      billing_details: { name: "Research Member", email: "member@example.invalid" },
    });
    expect(registrar.register).toHaveBeenCalledWith({
      provider: "stripe",
      providerPaymentMethodReference: "pm_test_success_1",
    });
    expect(JSON.stringify(result)).not.toContain("pm_test_success_1");
    expect(JSON.stringify(result)).not.toMatch(/card|cvc|expir|security/i);
  });

  it("never returns provider error details or malformed references", async () => {
    const secretProviderMessage = "card 4242424242424242 cvc 123";
    const rejected = await tokenizePaymentMethod({
      configuration: ready,
      hostedElement: hosted(),
      sdk: { createPaymentMethod: async () => ({ error: { message: secretProviderMessage } }) },
      registrar,
    });
    const malformed = await tokenizePaymentMethod({
      configuration: ready,
      hostedElement: hosted(),
      sdk: { createPaymentMethod: async () => ({ paymentMethod: { id: secretProviderMessage } }) },
      registrar,
    });

    expect(rejected).toMatchObject({ ok: false, code: "payment_method_rejected" });
    expect(malformed).toMatchObject({ ok: false, code: "payment_method_rejected" });
    expect(JSON.stringify([rejected, malformed])).not.toContain("4242424242424242");
  });

  it("collapses thrown SDK failures into the same safe error contract", async () => {
    const result = await tokenizePaymentMethod({
      configuration: ready,
      hostedElement: hosted(),
      sdk: { createPaymentMethod: async () => Promise.reject(new Error("socket + provider internals")) },
      registrar,
    });
    expect(result).toEqual({
      ok: false,
      code: "payment_method_rejected",
      message: "The payment provider could not securely save that payment method.",
    });
  });

  it("fails closed when the member-bound registration seam rejects or returns a direct provider reference", async () => {
    const sdk = { createPaymentMethod: async () => ({ paymentMethod: { id: "pm_test_success_2" } }) };
    const rejected = await tokenizePaymentMethod({
      configuration: ready,
      hostedElement: hosted(),
      sdk,
      registrar: { register: async () => ({ ok: false, code: "unavailable" }) },
    });
    const unbound = await tokenizePaymentMethod({
      configuration: ready,
      hostedElement: hosted(),
      sdk,
      registrar: { register: async () => ({ ok: true, paymentMethodReference: "pm_direct_not_member_bound" }) },
    });
    expect(rejected).toMatchObject({ ok: false, code: "payment_method_rejected" });
    expect(unbound).toMatchObject({ ok: false, code: "payment_method_rejected" });
  });
});
