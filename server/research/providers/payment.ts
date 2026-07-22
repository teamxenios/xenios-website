// xenios research: payment provider boundary.
//
// Built with no live key, on purpose. The production default is Disabled, which
// returns a structured refusal rather than throwing, so a checkout route can
// report an honest capability error instead of half-creating a paid order.
//
// The invariant this file protects: an order becomes paid ONLY on a provider
// reference returned by a provider. There is no code path where xenios decides
// on its own that money moved.

import {
  providerDisabled,
  providerMisconfigured,
  providerOk,
  type ProviderResult,
} from "@shared/research/capability";

export interface CreateAuthorizationInput {
  /** Minor units. Always computed server-side from the catalog, never from a client. */
  amountCents: number;
  currency: "usd";
  orderId: string;
  memberId: string;
  /** Required. Replaying the same key must never create a second authorization. */
  idempotencyKey: string;
  description?: string;
}

export interface PaymentAuthorization {
  providerReference: string;
  amountCents: number;
  currency: "usd";
  status: "authorized";
  /** True when the provider can capture later, which large-order review needs. */
  captureDeferred: boolean;
}

export interface PaymentCapture {
  providerReference: string;
  capturedAmountCents: number;
  status: "captured";
}

export interface PaymentRefund {
  providerReference: string;
  refundedAmountCents: number;
  status: "refunded";
}

export interface WebhookVerification {
  eventId: string;
  eventType: string;
  providerReference?: string;
  /** The provider-signed payload, already verified. */
  verified: true;
}

export interface PaymentProvider {
  readonly name: string;
  /** True when the provider supports authorize-now, capture-later. */
  readonly supportsDeferredCapture: boolean;

  createAuthorization(input: CreateAuthorizationInput): Promise<ProviderResult<PaymentAuthorization>>;
  captureAuthorization(providerReference: string, amountCents?: number): Promise<ProviderResult<PaymentCapture>>;
  cancelAuthorization(providerReference: string): Promise<ProviderResult<void>>;
  refund(providerReference: string, amountCents: number, idempotencyKey: string): Promise<ProviderResult<PaymentRefund>>;
  retrieveStatus(providerReference: string): Promise<ProviderResult<{ status: string }>>;
  verifyWebhook(rawBody: string, signatureHeader: string | undefined): Promise<ProviderResult<WebhookVerification>>;
}

// ---------------------------------------------------------------------------
// Disabled (the production default)
// ---------------------------------------------------------------------------

export class DisabledPaymentProvider implements PaymentProvider {
  readonly name = "disabled";
  readonly supportsDeferredCapture = false;

  async createAuthorization() {
    return providerDisabled<PaymentAuthorization>("product_commerce");
  }
  async captureAuthorization() {
    return providerDisabled<PaymentCapture>("product_commerce");
  }
  async cancelAuthorization() {
    return providerDisabled<void>("product_commerce");
  }
  async refund() {
    return providerDisabled<PaymentRefund>("product_commerce");
  }
  async retrieveStatus() {
    return providerDisabled<{ status: string }>("product_commerce");
  }
  async verifyWebhook() {
    return providerDisabled<WebhookVerification>("product_commerce");
  }
}

// ---------------------------------------------------------------------------
// Test provider (never available in production)
// ---------------------------------------------------------------------------

/**
 * Deterministic in-memory provider for tests and local development.
 *
 * It models the behavior that matters: idempotent authorization, capture only of
 * an existing authorization, no double capture, and refund bounded by the captured
 * amount. It refuses to construct in production so it cannot become a live payment
 * path by a configuration mistake.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly name = "test";
  readonly supportsDeferredCapture = true;

  private authorizations = new Map<
    string,
    { amountCents: number; captured: number; cancelled: boolean; orderId: string }
  >();
  private byIdempotencyKey = new Map<string, string>();
  private seenWebhookEvents = new Set<string>();
  private counter = 0;

  constructor(options: { allowInProduction?: boolean } = {}) {
    if (process.env.NODE_ENV === "production" && !options.allowInProduction) {
      throw new Error("TestPaymentProvider is not available in production");
    }
  }

  async createAuthorization(input: CreateAuthorizationInput): Promise<ProviderResult<PaymentAuthorization>> {
    if (input.amountCents <= 0) {
      return providerMisconfigured<PaymentAuthorization>("Authorization amount must be positive.");
    }

    // Idempotency: the same key returns the original authorization, never a second one.
    const existingRef = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingRef) {
      const existing = this.authorizations.get(existingRef)!;
      return providerOk(
        {
          providerReference: existingRef,
          amountCents: existing.amountCents,
          currency: "usd" as const,
          status: "authorized" as const,
          captureDeferred: true,
        },
        existingRef,
      );
    }

    const ref = `test_auth_${++this.counter}`;
    this.authorizations.set(ref, {
      amountCents: input.amountCents,
      captured: 0,
      cancelled: false,
      orderId: input.orderId,
    });
    this.byIdempotencyKey.set(input.idempotencyKey, ref);

    return providerOk(
      {
        providerReference: ref,
        amountCents: input.amountCents,
        currency: "usd" as const,
        status: "authorized" as const,
        captureDeferred: true,
      },
      ref,
    );
  }

  async captureAuthorization(ref: string, amountCents?: number): Promise<ProviderResult<PaymentCapture>> {
    const auth = this.authorizations.get(ref);
    if (!auth) {
      return { ok: false, code: "REJECTED", message: "Unknown authorization.", retryable: false };
    }
    if (auth.cancelled) {
      return { ok: false, code: "REJECTED", message: "Authorization was cancelled.", retryable: false };
    }
    if (auth.captured > 0) {
      return { ok: false, code: "REJECTED", message: "Authorization already captured.", retryable: false };
    }
    const amount = amountCents ?? auth.amountCents;
    if (amount > auth.amountCents) {
      return { ok: false, code: "REJECTED", message: "Capture exceeds authorized amount.", retryable: false };
    }
    auth.captured = amount;
    return providerOk({ providerReference: ref, capturedAmountCents: amount, status: "captured" as const }, ref);
  }

  async cancelAuthorization(ref: string): Promise<ProviderResult<void>> {
    const auth = this.authorizations.get(ref);
    if (!auth) {
      return { ok: false, code: "REJECTED", message: "Unknown authorization.", retryable: false };
    }
    if (auth.captured > 0) {
      return { ok: false, code: "REJECTED", message: "Cannot cancel a captured authorization.", retryable: false };
    }
    auth.cancelled = true;
    return providerOk(undefined as void, ref);
  }

  async refund(ref: string, amountCents: number, idempotencyKey: string): Promise<ProviderResult<PaymentRefund>> {
    const auth = this.authorizations.get(ref);
    if (!auth) {
      return { ok: false, code: "REJECTED", message: "Unknown authorization.", retryable: false };
    }
    if (auth.captured <= 0) {
      return { ok: false, code: "REJECTED", message: "Nothing captured to refund.", retryable: false };
    }
    if (amountCents > auth.captured) {
      return { ok: false, code: "REJECTED", message: "Refund exceeds captured amount.", retryable: false };
    }
    void idempotencyKey;
    return providerOk(
      { providerReference: ref, refundedAmountCents: amountCents, status: "refunded" as const },
      ref,
    );
  }

  async retrieveStatus(ref: string): Promise<ProviderResult<{ status: string }>> {
    const auth = this.authorizations.get(ref);
    if (!auth) {
      return { ok: false, code: "REJECTED", message: "Unknown authorization.", retryable: false };
    }
    const status = auth.cancelled ? "cancelled" : auth.captured > 0 ? "captured" : "authorized";
    return providerOk({ status }, ref);
  }

  /**
   * Replay protection is modelled here rather than left to the caller, because a
   * replayed capture event is the classic way an order double-advances.
   */
  async verifyWebhook(rawBody: string, signatureHeader: string | undefined): Promise<ProviderResult<WebhookVerification>> {
    if (!signatureHeader) {
      return { ok: false, code: "REJECTED", message: "Missing signature header.", retryable: false };
    }
    if (signatureHeader !== "test-signature") {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }
    let parsed: { id?: string; type?: string; providerReference?: string };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed webhook body.", retryable: false };
    }
    if (!parsed.id || !parsed.type) {
      return { ok: false, code: "REJECTED", message: "Webhook missing id or type.", retryable: false };
    }
    if (this.seenWebhookEvents.has(parsed.id)) {
      return { ok: false, code: "REJECTED", message: "Duplicate webhook event.", retryable: false };
    }
    this.seenWebhookEvents.add(parsed.id);
    return providerOk({
      eventId: parsed.id,
      eventType: parsed.type,
      providerReference: parsed.providerReference,
      verified: true as const,
    });
  }
}

// ---------------------------------------------------------------------------
// Real adapter shell
// ---------------------------------------------------------------------------

/**
 * The real adapter, deliberately unimplemented.
 *
 * It exists so the wiring, resolution, and configuration validation are all
 * complete and testable before a key is ever requested. Every method returns a
 * MISCONFIGURED refusal rather than a stub success, so an accidental production
 * enablement without the implementation fails loudly and safely.
 *
 * ACTIVATION: implement against the chosen processor, then set the credentials
 * named in `requiredEnvironmentVariables`. Do not implement before Samuel has
 * chosen the processor and the peptide-commerce approval exists.
 */
export class StripePaymentAdapter implements PaymentProvider {
  readonly name = "stripe";
  readonly supportsDeferredCapture = true;

  static readonly requiredEnvironmentVariables = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;

  private notImplemented<T>(): ProviderResult<T> {
    return providerMisconfigured<T>(
      "The live payment adapter is not implemented. Commerce remains disabled pending processor selection and written approval.",
    );
  }

  async createAuthorization() {
    return this.notImplemented<PaymentAuthorization>();
  }
  async captureAuthorization() {
    return this.notImplemented<PaymentCapture>();
  }
  async cancelAuthorization() {
    return this.notImplemented<void>();
  }
  async refund() {
    return this.notImplemented<PaymentRefund>();
  }
  async retrieveStatus() {
    return this.notImplemented<{ status: string }>();
  }
  async verifyWebhook() {
    return this.notImplemented<WebhookVerification>();
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Chooses the provider. Defaults to Disabled.
 *
 * The test provider is reachable only outside production, so a stray environment
 * value cannot turn a live deployment into a fake-payment deployment.
 */
export function resolvePaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const commerceEnabled = env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true";
  if (!commerceEnabled) return new DisabledPaymentProvider();

  const selected = env.PAYMENT_PROVIDER;
  if (selected === "test") {
    if (env.NODE_ENV === "production") return new DisabledPaymentProvider();
    return new TestPaymentProvider();
  }
  if (selected === "stripe") return new StripePaymentAdapter();
  return new DisabledPaymentProvider();
}
