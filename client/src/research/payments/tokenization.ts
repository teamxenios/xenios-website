/**
 * Browser payment-method tokenization boundary.
 *
 * The hosted element is created and owned by the payment provider. Xenios never
 * accepts a card number, expiry, or security code through this API; the only
 * successful output is an opaque provider reference suitable for a server-side
 * member-ownership check.
 */

export type PublicPaymentConfiguration =
  | { state: "disabled" }
  | { state: "not_configured"; missing: readonly ["VITE_STRIPE_PUBLISHABLE_KEY"] }
  | { state: "invalid"; message: string }
  | {
      state: "ready";
      provider: "stripe";
      mode: "test" | "live";
      publishableKey: string;
    };

export type PaymentTokenizationResult =
  | { ok: true; paymentMethodReference: string }
  | { ok: false; code: "payment_disabled" | "payment_not_configured" | "payment_configuration_invalid"; message: string }
  | { ok: false; code: "payment_method_invalid" | "payment_method_rejected"; message: string };

/** The provider SDK owns the runtime value. It must never be serialized. */
export interface ProviderHostedPaymentElement {
  readonly provider: "stripe";
  readonly element: unknown;
}

export interface StripeBrowserSdk {
  createPaymentMethod(input: {
    type: "card";
    card: unknown;
    billing_details?: { name?: string; email?: string };
  }): Promise<{
    paymentMethod?: { id?: unknown };
    error?: { type?: unknown; message?: unknown };
  }>;
}

/**
 * Authenticated server seam that exchanges the short-lived provider reference
 * for a Xenios-owned, member-bound selector. The checkout request receives only
 * the `pmi_*` selector; it never trusts a browser-supplied `pm_*` directly.
 */
export interface PaymentMethodRegistrar {
  register(input: {
    provider: "stripe";
    providerPaymentMethodReference: string;
  }): Promise<
    | { ok: true; paymentMethodReference: string }
    | { ok: false; code: "not_configured" | "invalid" | "unavailable" }
  >;
}

export interface TokenizePaymentMethodInput {
  configuration: PublicPaymentConfiguration;
  hostedElement: ProviderHostedPaymentElement;
  sdk: StripeBrowserSdk;
  registrar: PaymentMethodRegistrar;
  billingIdentity?: { name?: string; email?: string };
}

const STRIPE_PUBLISHABLE_KEY = /^pk_(test|live)_[A-Za-z0-9_]{8,}$/;
const STRIPE_PAYMENT_METHOD_REFERENCE = /^pm_[A-Za-z0-9_]{3,}$/;
const XENIOS_PAYMENT_METHOD_REFERENCE = /^pmi_[A-Za-z0-9_]{5,}$/;

export function resolvePublicPaymentConfiguration(input: {
  provider?: unknown;
  publishableKey?: unknown;
}): PublicPaymentConfiguration {
  if (input.provider === undefined || input.provider === null || input.provider === "" || input.provider === "disabled") {
    return { state: "disabled" };
  }
  if (input.provider !== "stripe") {
    return { state: "invalid", message: "The configured payment provider is not supported." };
  }
  if (typeof input.publishableKey !== "string" || input.publishableKey.trim() === "") {
    return { state: "not_configured", missing: ["VITE_STRIPE_PUBLISHABLE_KEY"] };
  }
  const match = STRIPE_PUBLISHABLE_KEY.exec(input.publishableKey);
  if (!match) {
    return { state: "invalid", message: "The payment provider public configuration is invalid." };
  }
  return {
    state: "ready",
    provider: "stripe",
    mode: match[1] as "test" | "live",
    publishableKey: input.publishableKey,
  };
}

function normalizeBillingIdentity(
  value: TokenizePaymentMethodInput["billingIdentity"],
): { name?: string; email?: string } | undefined {
  if (!value) return undefined;
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 200) : "";
  const email = typeof value.email === "string" ? value.email.trim().slice(0, 320) : "";
  if (!name && !email) return undefined;
  return { ...(name ? { name } : {}), ...(email ? { email } : {}) };
}

/**
 * Calls the provider SDK with its hosted element and returns only an opaque
 * payment-method reference. Provider error details are deliberately collapsed
 * into a safe UX contract so card/provider internals are never reflected.
 */
export async function tokenizePaymentMethod(input: TokenizePaymentMethodInput): Promise<PaymentTokenizationResult> {
  if (input.configuration.state === "disabled") {
    return { ok: false, code: "payment_disabled", message: "Payment is not enabled." };
  }
  if (input.configuration.state === "not_configured") {
    return {
      ok: false,
      code: "payment_not_configured",
      message: "Payment setup is incomplete. No payment method was submitted.",
    };
  }
  if (input.configuration.state === "invalid") {
    return { ok: false, code: "payment_configuration_invalid", message: input.configuration.message };
  }
  if (input.hostedElement.provider !== input.configuration.provider || input.hostedElement.element == null) {
    return {
      ok: false,
      code: "payment_method_invalid",
      message: "The secure payment field is not ready.",
    };
  }

  try {
    const result = await input.sdk.createPaymentMethod({
      type: "card",
      card: input.hostedElement.element,
      ...(normalizeBillingIdentity(input.billingIdentity)
        ? { billing_details: normalizeBillingIdentity(input.billingIdentity) }
        : {}),
    });
    const reference = result.paymentMethod?.id;
    if (result.error || typeof reference !== "string" || !STRIPE_PAYMENT_METHOD_REFERENCE.test(reference)) {
      return {
        ok: false,
        code: "payment_method_rejected",
        message: "The payment provider could not securely save that payment method.",
      };
    }
    const registered = await input.registrar.register({
      provider: "stripe",
      providerPaymentMethodReference: reference,
    });
    if (!registered.ok || !XENIOS_PAYMENT_METHOD_REFERENCE.test(registered.paymentMethodReference)) {
      return {
        ok: false,
        code: "payment_method_rejected",
        message: "The payment provider could not securely save that payment method.",
      };
    }
    return { ok: true, paymentMethodReference: registered.paymentMethodReference };
  } catch {
    return {
      ok: false,
      code: "payment_method_rejected",
      message: "The payment provider could not securely save that payment method.",
    };
  }
}
