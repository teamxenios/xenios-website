// xenios research: payment provider boundary.
//
// Built with no live key, on purpose. The production default is Disabled, which
// returns a structured refusal rather than throwing, so a checkout route can
// report an honest capability error instead of half-creating a paid order.
//
// The invariant this file protects: an order becomes paid ONLY on a provider
// reference returned by a provider. There is no code path where xenios decides
// on its own that money moved.

import crypto from "crypto";
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
  /**
   * A provider payment-method token collected by the provider's own client
   * surface. Never card data: xenios stores no card number, expiry, or CVC,
   * and this field cannot carry them. When present the provider is asked to
   * confirm immediately, which is the only path to a synchronous authorization.
   */
  paymentMethodReference?: string;
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
  currency: "usd";
  status: "captured";
}

export interface PaymentRefund {
  /** The provider's refund-object reference (Stripe `re_...`), never the payment id. */
  providerReference: string;
  /** The exact payment/authorization reference the provider says was refunded. */
  paymentReference: string;
  refundedAmountCents: number;
  currency: "usd";
  status: "refunded";
}

export interface WebhookVerification {
  eventId: string;
  eventType: string;
  providerReference?: string;
  /** Server-authored order metadata carried inside the signed provider object. */
  orderId?: string;
  /** Exact provider-reported minor units for the translated money event. */
  amountCents?: number;
  /** Provider-reported ISO currency, normalized by the provider (Stripe uses lowercase). */
  currency?: string;
  /** Present for connected-account events after adapter-level account binding. */
  providerAccountId?: string;
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
    {
      amountCents: number;
      captured: number;
      refunded: number;
      cancelled: boolean;
      orderId: string;
      memberId: string;
      currency: "usd";
      paymentMethodReference?: string;
      description?: string;
    }
  >();
  private byIdempotencyKey = new Map<string, string>();
  /** Refund idempotency: key -> the exact operation and result already produced. */
  private refundsByKey = new Map<
    string,
    { reference: string; amountCents: number; result: PaymentRefund }
  >();
  private counter = 0;

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TestPaymentProvider is not available in production");
    }
  }

  async createAuthorization(input: CreateAuthorizationInput): Promise<ProviderResult<PaymentAuthorization>> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.currency !== "usd") {
      return providerMisconfigured<PaymentAuthorization>(
        "Authorization requires a positive integer amount of USD cents.",
      );
    }

    // Idempotency: the same key returns the original authorization, never a second one.
    const existingRef = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingRef) {
      const existing = this.authorizations.get(existingRef)!;
      if (
        existing.amountCents !== input.amountCents ||
        existing.currency !== input.currency ||
        existing.orderId !== input.orderId ||
        existing.memberId !== input.memberId ||
        existing.paymentMethodReference !== input.paymentMethodReference ||
        existing.description !== input.description
      ) {
        return {
          ok: false,
          code: "PERMANENT_FAILURE",
          message: "Authorization idempotency key was already used for different parameters.",
          retryable: false,
        };
      }
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
      refunded: 0,
      cancelled: false,
      orderId: input.orderId,
      memberId: input.memberId,
      currency: input.currency,
      paymentMethodReference: input.paymentMethodReference,
      description: input.description,
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
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return { ok: false, code: "REJECTED", message: "Capture amount must be a positive integer of cents.", retryable: false };
    }
    if (amount > auth.amountCents) {
      return { ok: false, code: "REJECTED", message: "Capture exceeds authorized amount.", retryable: false };
    }
    auth.captured = amount;
    return providerOk(
      { providerReference: ref, capturedAmountCents: amount, currency: "usd", status: "captured" as const },
      ref,
    );
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
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return { ok: false, code: "REJECTED", message: "Refund amount must be a positive integer of cents.", retryable: false };
    }
    // Idempotency first, as the real adapter's provider behaves: replaying the
    // same key returns the original refund and never moves money twice.
    const replayed = this.refundsByKey.get(idempotencyKey);
    if (replayed) {
      if (replayed.reference !== ref || replayed.amountCents !== amountCents) {
        return {
          ok: false,
          code: "PERMANENT_FAILURE",
          message: "Refund idempotency key was already used for different parameters.",
          retryable: false,
        };
      }
      return providerOk({ ...replayed.result }, replayed.result.providerReference);
    }

    const auth = this.authorizations.get(ref);
    if (!auth) {
      return { ok: false, code: "REJECTED", message: "Unknown authorization.", retryable: false };
    }
    if (auth.captured <= 0) {
      return { ok: false, code: "REJECTED", message: "Nothing captured to refund.", retryable: false };
    }
    // Refund <= capture MINUS what was already refunded, matching the real
    // adapter's captured-minus-already-refunded bound, so repeated partial
    // refunds through the double cannot overshoot the capture either.
    if (amountCents > auth.captured - auth.refunded) {
      return { ok: false, code: "REJECTED", message: "Refund exceeds captured amount.", retryable: false };
    }
    auth.refunded += amountCents;
    const refundReference = `test_ref_${this.refundsByKey.size + 1}`;
    const refund: PaymentRefund = {
      providerReference: refundReference,
      paymentReference: ref,
      refundedAmountCents: amountCents,
      currency: "usd",
      status: "refunded",
    };
    this.refundsByKey.set(idempotencyKey, { reference: ref, amountCents, result: refund });
    return providerOk({ ...refund }, refundReference);
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
   * Verification is deliberately stateless. Replay authority belongs to the
   * caller's atomic inbox+order persistence so a valid event is not burned by
   * an unknown-order lookup or a failed commit.
   */
  async verifyWebhook(rawBody: string, signatureHeader: string | undefined): Promise<ProviderResult<WebhookVerification>> {
    if (!signatureHeader) {
      return { ok: false, code: "REJECTED", message: "Missing signature header.", retryable: false };
    }
    if (signatureHeader !== "test-signature") {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }
    let parsed: {
      id?: string;
      type?: string;
      providerReference?: string;
      orderId?: string;
      amountCents?: number;
      currency?: string;
      providerAccountId?: string;
    };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed webhook body.", retryable: false };
    }
    if (!parsed.id || !parsed.type) {
      return { ok: false, code: "REJECTED", message: "Webhook missing id or type.", retryable: false };
    }
    return providerOk({
      eventId: parsed.id,
      eventType: parsed.type,
      providerReference: parsed.providerReference,
      orderId: parsed.orderId,
      amountCents: parsed.amountCents,
      currency: parsed.currency,
      providerAccountId: parsed.providerAccountId,
      verified: true as const,
    });
  }
}

// ---------------------------------------------------------------------------
// Stripe wire helpers (shared with the membership billing adapter)
// ---------------------------------------------------------------------------

/**
 * The wire contract for Stripe's REST API, mirroring the CarrierTransport
 * pattern in shipping.ts: the transport is the one injectable seam, so every
 * test runs against canned Stripe-shaped responses and no test can reach the
 * network by default.
 */
export interface StripeRequest {
  method: "GET" | "POST" | "DELETE";
  /** Path under the API host, e.g. "/v1/payment_intents". */
  path: string;
  /** Flattened application/x-www-form-urlencoded fields, e.g. "metadata[orderId]". */
  form?: Record<string, string>;
  /** Sent as Stripe's Idempotency-Key header. Always the caller's key, never invented. */
  idempotencyKey?: string;
}

export interface StripeResponse {
  status: number;
  /** Parsed JSON body, or null when the body was empty or not JSON. */
  body: unknown;
}

export type StripeTransport = (request: StripeRequest) => Promise<StripeResponse>;

const STRIPE_API_BASE = "https://api.stripe.com";

/**
 * The production transport. The secret key lives only inside this closure, so
 * it never sits on adapter config, never reaches a ProviderResult message, and
 * nothing serializable carries it. Inert until a resolver constructs it from a
 * complete environment behind the commerce flag.
 */
export function buildFetchStripeTransport(secretKey: string): StripeTransport {
  return async (request) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${secretKey}`,
    };
    if (request.idempotencyKey) headers["idempotency-key"] = request.idempotencyKey;
    let body: string | undefined;
    if (request.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = encodeStripeForm(request.form);
    }
    const response = await fetch(`${STRIPE_API_BASE}${request.path}`, {
      method: request.method,
      headers,
      body,
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    return { status: response.status, body: parsed };
  };
}

export function encodeStripeForm(form: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) params.append(key, value);
  return params.toString();
}

export type StripeSignatureFailure = "malformed" | "stale" | "mismatch";

/** Stripe's documented default tolerance for webhook timestamps. */
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Verifies a Stripe-Signature header: `t=<unix seconds>,v1=<hex hmac>` where
 * the hmac is SHA-256 over `${t}.${rawBody}` keyed by the webhook secret.
 *
 * The tolerance window refuses an old signed body, so a captured genuine
 * webhook cannot be replayed after the event store has forgotten it. Replay
 * inside the window is the event store's job upstream. Comparison is
 * constant-time. Returns null when the signature verifies.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  nowMs: number,
  toleranceSeconds: number = STRIPE_WEBHOOK_TOLERANCE_SECONDS,
): StripeSignatureFailure | null {
  let timestamp: number | undefined;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) timestamp = parsed;
    } else if (key === "v1" && /^[0-9a-f]+$/i.test(value)) {
      candidates.push(value);
    }
  }
  if (timestamp === undefined || candidates.length === 0) return "malformed";
  if (Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) return "stale";

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  for (const candidate of candidates) {
    const candidateBuffer = Buffer.from(candidate, "hex");
    if (
      candidateBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
    ) {
      return null;
    }
  }
  return "mismatch";
}

/**
 * Maps a Stripe error response to the provider-result vocabulary. Credentials
 * problems are MISCONFIGURED (a capability state, not an outage), throttling
 * and provider outages are RETRYABLE, and everything else (declines, invalid
 * requests) is REJECTED. Only Stripe's human-readable error message is
 * carried; never the raw body, never a header, never a key.
 */
export function mapStripeFailure<T>(status: number, body: unknown): ProviderResult<T> {
  let type: string | undefined;
  let message: string | undefined;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>).error;
    if (error && typeof error === "object" && !Array.isArray(error)) {
      const record = error as Record<string, unknown>;
      if (typeof record.type === "string") type = record.type;
      if (typeof record.message === "string") message = record.message;
    }
  }
  const detail = message ?? `Provider returned HTTP ${status}.`;
  if (status === 401 || status === 403 || type === "authentication_error") {
    return providerMisconfigured<T>(detail);
  }
  if (status === 429 || type === "rate_limit_error") {
    return { ok: false, code: "RETRYABLE", message: detail, retryable: true };
  }
  if (status >= 500 || type === "api_error") {
    return { ok: false, code: "RETRYABLE", message: detail, retryable: true };
  }
  return { ok: false, code: "REJECTED", message: detail, retryable: false };
}

/** A transport-level failure (network, DNS, timeout). Always retryable. */
export function stripeTransportFailure<T>(): ProviderResult<T> {
  return {
    ok: false,
    code: "RETRYABLE",
    message: "The payment provider could not be reached.",
    retryable: true,
  };
}

/**
 * A status string this code was not written for. Never mapped to success,
 * never guessed at: an explicit provider error the operator can see.
 */
export function unrecognizedProviderStatus<T>(context: string, status: unknown): ProviderResult<T> {
  return {
    ok: false,
    code: "PERMANENT_FAILURE",
    message: `Unrecognized provider status "${String(status)}" during ${context}. Refusing to guess.`,
    retryable: false,
  };
}

export function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown> | null, key: string): string | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readNumber(source: Record<string, unknown> | null, key: string): number | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// Stripe configuration
// ---------------------------------------------------------------------------

export interface StripePaymentConfig {
  secretKey: string;
  webhookSecret: string;
  /**
   * Expected Stripe Connect account id. Null/absent means platform-account
   * events only; an event carrying a different account is rejected after
   * signature verification and before any domain routing.
   */
  providerAccountId?: string | null;
  /** Injected in every test. Defaults to the fetch transport only at resolution time. */
  transport?: StripeTransport;
  /** Injectable clock (milliseconds) for webhook tolerance tests. */
  now?: () => number;
  toleranceSeconds?: number;
}

/**
 * Reports what is missing by VARIABLE NAME only. A value never appears in the
 * result, so this structure is safe to surface in admin diagnostics.
 */
export function validateStripeConfig(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; secretKey: string; webhookSecret: string } | { ok: false; missingEnvironmentVariables: string[] } {
  const secretKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const missing: string[] = [];
  if (!secretKey) missing.push("STRIPE_SECRET_KEY");
  if (!webhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!secretKey || !webhookSecret) return { ok: false, missingEnvironmentVariables: missing };
  return { ok: true, secretKey, webhookSecret };
}

// ---------------------------------------------------------------------------
// Stripe adapter (real, inert until resolved from a complete environment)
// ---------------------------------------------------------------------------

/**
 * PaymentIntent status to domain status vocabulary. Anything absent from this
 * table is refused explicitly rather than passed through, so a new Stripe
 * status cannot leak an unknown word into order logic.
 */
const INTENT_STATUS_DOMAIN: Record<string, string> = {
  requires_payment_method: "pending",
  requires_confirmation: "pending",
  requires_action: "pending",
  processing: "processing",
  requires_capture: "authorized",
  succeeded: "captured",
  canceled: "cancelled",
};

/**
 * Stripe event types translated to the domain event vocabulary consumed by
 * commerce/webhooks.ts. An unlisted Stripe type passes through untranslated,
 * which the webhook handler acknowledges and ignores: a new provider event can
 * never move an order by accident.
 */
const STRIPE_PAYMENT_EVENT_TYPES: Record<string, string> = {
  "payment_intent.amount_capturable_updated": "payment.authorized",
  "payment_intent.succeeded": "payment.captured",
  "charge.refunded": "payment.refunded",
  "payment_intent.payment_failed": "payment.failed",
};

/**
 * The real Stripe adapter: PaymentIntents with manual capture, refunds bounded
 * by what was captured, and signed-webhook verification.
 *
 * It constructs ONLY with a complete configuration; `resolvePaymentProvider`
 * returns Disabled when anything is missing, so an accidental production
 * enablement without credentials degrades to a truthful capability refusal,
 * never a half-configured adapter.
 *
 * Money safety inside the adapter, independent of upstream checks:
 * capture is refused above the provider's own amount_capturable, refund is
 * refused above captured-minus-already-refunded, and no response status
 * outside the explicit tables is ever treated as success.
 */
export class StripePaymentAdapter implements PaymentProvider {
  readonly name = "stripe";
  readonly supportsDeferredCapture = true;

  static readonly requiredEnvironmentVariables = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;

  private readonly transport: StripeTransport;
  private readonly webhookSecret: string;
  private readonly providerAccountId: string | null;
  private readonly now: () => number;
  private readonly toleranceSeconds: number;

  constructor(config: StripePaymentConfig) {
    if (!config.secretKey || !config.webhookSecret) {
      throw new Error(
        "StripePaymentAdapter requires a secret key and a webhook secret. " +
          "Use resolvePaymentProvider, which falls back to Disabled when they are absent.",
      );
    }
    if (config.providerAccountId && !config.transport) {
      throw new Error(
        "Stripe Connect requires an explicitly account-bound transport; the built-in platform transport is not Connect-aware.",
      );
    }
    this.transport = config.transport ?? buildFetchStripeTransport(config.secretKey);
    this.webhookSecret = config.webhookSecret;
    this.providerAccountId = config.providerAccountId ?? null;
    this.now = config.now ?? Date.now;
    this.toleranceSeconds = config.toleranceSeconds ?? STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  }

  private async call(request: StripeRequest): Promise<StripeResponse | null> {
    try {
      return await this.transport(request);
    } catch {
      return null;
    }
  }

  private async retrieveIntent(
    ref: string,
    expandLatestCharge = false,
  ): Promise<ProviderResult<Record<string, unknown>>> {
    const suffix = expandLatestCharge ? "?expand[]=latest_charge" : "";
    const response = await this.call({
      method: "GET",
      path: `/v1/payment_intents/${encodeURIComponent(ref)}${suffix}`,
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);
    const intent = asJsonObject(response.body);
    if (
      intent === null ||
      readString(intent, "id") !== ref ||
      readString(intent, "currency") !== "usd"
    ) {
      return {
        ok: false,
        code: "PERMANENT_FAILURE",
        message: "Stripe payment retrieval evidence did not match the requested payment and USD account.",
        retryable: false,
      };
    }
    return providerOk(intent);
  }

  async createAuthorization(input: CreateAuthorizationInput): Promise<ProviderResult<PaymentAuthorization>> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.currency !== "usd") {
      return providerMisconfigured<PaymentAuthorization>(
        "Authorization requires a positive integer amount of USD cents.",
      );
    }
    const form: Record<string, string> = {
      amount: String(input.amountCents),
      currency: input.currency,
      capture_method: "manual",
      "metadata[orderId]": input.orderId,
      "metadata[memberId]": input.memberId,
    };
    if (input.description) form.description = input.description;
    if (input.paymentMethodReference) {
      form.payment_method = input.paymentMethodReference;
      form.confirm = "true";
    }

    const response = await this.call({
      method: "POST",
      path: "/v1/payment_intents",
      form,
      idempotencyKey: input.idempotencyKey,
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);

    const intent = asJsonObject(response.body);
    const reference = readString(intent, "id");
    const status = intent?.status;
    if (!reference) return unrecognizedProviderStatus("authorization", "response without an id");
    const returnedAmount = readNumber(intent, "amount");
    const returnedCurrency = readString(intent, "currency");
    const returnedMetadata = asJsonObject(intent?.metadata);
    if (
      !reference.startsWith("pi_") ||
      !Number.isSafeInteger(returnedAmount) ||
      returnedAmount !== input.amountCents ||
      returnedCurrency !== input.currency ||
      readString(returnedMetadata, "orderId") !== input.orderId ||
      readString(returnedMetadata, "memberId") !== input.memberId
    ) {
      return {
        ok: false,
        code: "PERMANENT_FAILURE",
        message: "Stripe authorization evidence did not match the requested order, amount, or currency.",
        retryable: false,
      };
    }

    if (status === "requires_capture") {
      const returnedCapturable = readNumber(intent, "amount_capturable");
      if (
        !Number.isSafeInteger(returnedCapturable) ||
        returnedCapturable !== returnedAmount
      ) {
        return {
          ok: false,
          code: "PERMANENT_FAILURE",
          message: "Stripe authorization did not prove the exact capturable amount.",
          retryable: false,
        };
      }
      return providerOk<PaymentAuthorization>(
        {
          providerReference: reference,
          amountCents: returnedAmount as number,
          currency: returnedCurrency,
          status: "authorized",
          captureDeferred: true,
        },
        reference,
      );
    }
    if (
      status === "requires_payment_method" ||
      status === "requires_confirmation" ||
      status === "requires_action" ||
      status === "processing"
    ) {
      // The intent exists but the money is not authorized. Authorization is
      // asserted only by the provider (a requires_capture response here, or a
      // signed payment.authorized webhook later), never assumed by xenios.
      return {
        ok: false,
        code: "REJECTED",
        message: `The payment was created (${reference}) but is not authorized yet (status ${String(status)}).`,
        retryable: false,
      };
    }
    if (status === "canceled") {
      return { ok: false, code: "REJECTED", message: "The payment was cancelled before authorization.", retryable: false };
    }
    if (status === "succeeded") {
      return {
        ok: false,
        code: "PERMANENT_FAILURE",
        message:
          "The provider reported an immediate capture where a deferred authorization was requested. Refusing to treat it as an authorization.",
        retryable: false,
      };
    }
    return unrecognizedProviderStatus("authorization", status);
  }

  async captureAuthorization(ref: string, amountCents?: number): Promise<ProviderResult<PaymentCapture>> {
    const current = await this.retrieveIntent(ref);
    if (!current.ok) return current;
    const intent = current.value;

    if (intent.status === "canceled") {
      return { ok: false, code: "REJECTED", message: "Authorization was cancelled.", retryable: false };
    }
    if (intent.status === "succeeded") {
      return { ok: false, code: "REJECTED", message: "Authorization already captured.", retryable: false };
    }
    if (intent.status !== "requires_capture") {
      return {
        ok: false,
        code: "REJECTED",
        message: `The payment is not in a capturable state (status ${String(intent.status)}).`,
        retryable: false,
      };
    }

    const authorized = readNumber(intent, "amount");
    const capturable = readNumber(intent, "amount_capturable");
    const amount = amountCents ?? capturable;
    if (
      !Number.isSafeInteger(authorized) ||
      (authorized as number) <= 0 ||
      !Number.isSafeInteger(capturable) ||
      (capturable as number) <= 0 ||
      !Number.isSafeInteger(amount) ||
      (amount as number) <= 0
    ) {
      return { ok: false, code: "REJECTED", message: "Capture amount must be a positive integer of cents.", retryable: false };
    }
    // The upstream state machine enforces capture <= authorization; the adapter
    // refuses again against the provider's own number, so neither side alone
    // can over-capture.
    if ((amount as number) > (capturable as number)) {
      return { ok: false, code: "REJECTED", message: "Capture exceeds authorized amount.", retryable: false };
    }
    // Xenios never performs a partial capture. The exact intent amount and the
    // exact amount still capturable must both equal this order's amount before
    // the side-effecting POST. A rebound or externally enlarged intent is not
    // acceptable merely because Stripe would allow the requested subset.
    if (authorized !== amount || capturable !== amount) {
      return {
        ok: false,
        code: "REJECTED",
        message: "Capture amount does not exactly match the authorized payment intent.",
        retryable: false,
      };
    }

    const response = await this.call({
      method: "POST",
      path: `/v1/payment_intents/${encodeURIComponent(ref)}/capture`,
      form: { amount_to_capture: String(amount) },
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);
    const captured = asJsonObject(response.body);
    if (captured?.status !== "succeeded") {
      return unrecognizedProviderStatus("capture", captured?.status);
    }
    const returnedReference = readString(captured, "id");
    const returnedAmount = readNumber(captured, "amount_received");
    const returnedCurrency = readString(captured, "currency");
    if (
      returnedReference !== ref ||
      !Number.isSafeInteger(returnedAmount) ||
      returnedAmount !== amount ||
      returnedCurrency !== "usd"
    ) {
      return {
        ok: false,
        code: "PERMANENT_FAILURE",
        message: "Stripe capture evidence did not match the requested payment, amount, or currency.",
        retryable: false,
      };
    }
    return providerOk<PaymentCapture>(
      {
        providerReference: returnedReference,
        capturedAmountCents: returnedAmount as number,
        currency: "usd",
        status: "captured",
      },
      returnedReference,
    );
  }

  async cancelAuthorization(ref: string): Promise<ProviderResult<void>> {
    const response = await this.call({
      method: "POST",
      path: `/v1/payment_intents/${encodeURIComponent(ref)}/cancel`,
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);
    const intent = asJsonObject(response.body);
    if (intent?.status !== "canceled") {
      return unrecognizedProviderStatus("cancellation", intent?.status);
    }
    if (
      readString(intent, "id") !== ref ||
      readString(intent, "currency") !== "usd" ||
      !Number.isSafeInteger(readNumber(intent, "amount_received")) ||
      readNumber(intent, "amount_received") !== 0
    ) {
      return {
        ok: false,
        code: "PERMANENT_FAILURE",
        message: "Stripe cancellation evidence did not prove the requested USD payment released with zero captured amount.",
        retryable: false,
      };
    }
    return providerOk(undefined as void, ref);
  }

  async refund(ref: string, amountCents: number, idempotencyKey: string): Promise<ProviderResult<PaymentRefund>> {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return { ok: false, code: "REJECTED", message: "Refund amount must be a positive integer of cents.", retryable: false };
    }

    const current = await this.retrieveIntent(ref, true);
    if (!current.ok) return current;
    const intent = current.value;

    const captured = readNumber(intent, "amount_received");
    if (!Number.isSafeInteger(captured) || (captured as number) <= 0) {
      return { ok: false, code: "REJECTED", message: "Nothing captured to refund.", retryable: false };
    }
    const latestCharge = asJsonObject(intent.latest_charge);
    const alreadyRefunded = readNumber(latestCharge, "amount_refunded");
    if (
      !Number.isSafeInteger(alreadyRefunded) ||
      (alreadyRefunded as number) < 0 ||
      (alreadyRefunded as number) > (captured as number)
    ) {
      return {
        ok: false,
        code: "PERMANENT_FAILURE",
        message: "Stripe refund ledger evidence was missing or malformed.",
        retryable: false,
      };
    }
    // Refund <= capture, enforced against the provider's own captured and
    // already-refunded numbers, so a repeated partial refund cannot overshoot.
    if (amountCents > (captured as number) - (alreadyRefunded as number)) {
      return { ok: false, code: "REJECTED", message: "Refund exceeds captured amount.", retryable: false };
    }

    const response = await this.call({
      method: "POST",
      path: "/v1/refunds",
      form: { payment_intent: ref, amount: String(amountCents) },
      idempotencyKey,
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);
    const refund = asJsonObject(response.body);
    if (refund?.status !== "pending" && refund?.status !== "succeeded") {
      return unrecognizedProviderStatus("refund", refund?.status);
    }
    // A pending result is still evidence that Stripe accepted a side effect.
    // Bind it to the exact payment, amount, and currency before choosing the
    // pending-vs-settled outcome.
    const refundReference = readString(refund, "id");
    const returnedPaymentReference = readString(refund, "payment_intent");
    const returnedAmount = readNumber(refund, "amount");
    const returnedCurrency = readString(refund, "currency");
    if (
      !refundReference?.startsWith("re_") ||
      returnedPaymentReference !== ref ||
      !Number.isSafeInteger(returnedAmount) ||
      returnedAmount !== amountCents ||
      returnedCurrency !== "usd"
    ) {
      return {
        ok: false,
        code: "PERMANENT_FAILURE",
        message: "Stripe refund evidence did not match the requested payment, amount, or currency.",
        retryable: false,
      };
    }
    if (refund.status === "pending") {
      // The provider accepted the refund but it has NOT settled, and a pending
      // refund can still fail asynchronously. Reporting "refunded" here would
      // permanently record money returned that may never return (and could
      // trigger commission reversal upstream). RETRYABLE: nothing is recorded
      // until the provider confirms settlement. The signed charge.refunded
      // webhook (mapped to payment.refunded) is the settlement evidence; a
      // pending refund that later fails simply never produces one.
      return {
        ok: false,
        code: "RETRYABLE",
        message:
          "The refund was accepted but has not settled (status pending). It is not recorded as refunded until the provider confirms settlement.",
        retryable: true,
      };
    }
    return providerOk<PaymentRefund>(
      {
        providerReference: refundReference,
        paymentReference: returnedPaymentReference,
        refundedAmountCents: returnedAmount as number,
        currency: "usd",
        status: "refunded",
      },
      refundReference,
    );
  }

  async retrieveStatus(ref: string): Promise<ProviderResult<{ status: string }>> {
    const current = await this.retrieveIntent(ref);
    if (!current.ok) return current;
    const mapped = INTENT_STATUS_DOMAIN[String(current.value.status)];
    if (!mapped) return unrecognizedProviderStatus("status retrieval", current.value.status);
    return providerOk({ status: mapped }, ref);
  }

  async verifyWebhook(rawBody: string, signatureHeader: string | undefined): Promise<ProviderResult<WebhookVerification>> {
    if (!signatureHeader) {
      return { ok: false, code: "REJECTED", message: "Missing signature header.", retryable: false };
    }
    const failure = verifyStripeSignature(
      rawBody,
      signatureHeader,
      this.webhookSecret,
      this.now(),
      this.toleranceSeconds,
    );
    if (failure === "malformed") {
      return { ok: false, code: "REJECTED", message: "Malformed signature header.", retryable: false };
    }
    if (failure === "stale") {
      return { ok: false, code: "REJECTED", message: "Webhook timestamp is outside the tolerance window.", retryable: false };
    }
    if (failure) {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }

    let event: Record<string, unknown> | null = null;
    try {
      event = asJsonObject(JSON.parse(rawBody));
    } catch {
      event = null;
    }
    if (!event) {
      return { ok: false, code: "REJECTED", message: "Malformed webhook body.", retryable: false };
    }
    const eventId = readString(event, "id");
    const stripeType = readString(event, "type");
    if (!eventId || !stripeType) {
      return { ok: false, code: "REJECTED", message: "Webhook missing id or type.", retryable: false };
    }

    const eventProviderAccountId = readString(event, "account") ?? null;
    if (eventProviderAccountId !== this.providerAccountId) {
      return {
        ok: false,
        code: "REJECTED",
        message: "Webhook provider account does not match the configured payment account.",
        retryable: false,
      };
    }

    // Replay of a verified event id is handled only by the caller's atomic
    // inbox+order store. Verification itself is deliberately stateless so an
    // unknown-order or failed persistence attempt cannot burn a legitimate id.
    // The adapter's job is the cryptographic boundary and the type translation.
    const dataObject = asJsonObject(asJsonObject(event.data)?.object);
    const metadata = asJsonObject(dataObject?.metadata);
    const objectId = readString(dataObject, "id");
    const providerReference =
      objectId && objectId.startsWith("pi_") ? objectId : readString(dataObject, "payment_intent");
    const eventType = STRIPE_PAYMENT_EVENT_TYPES[stripeType] ?? stripeType;
    const amountField =
      eventType === "payment.authorized"
        ? "amount_capturable"
        : eventType === "payment.captured"
          ? "amount_received"
          : eventType === "payment.refunded"
            ? "amount_refunded"
            : null;
    const amountCents = amountField === null ? undefined : readNumber(dataObject, amountField);
    const currency = readString(dataObject, "currency");
    const orderId = readString(metadata, "orderId");

    return providerOk<WebhookVerification>({
      eventId,
      eventType,
      providerReference,
      orderId,
      amountCents,
      currency,
      ...(eventProviderAccountId === null ? {} : { providerAccountId: eventProviderAccountId }),
      verified: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Chooses the provider. Defaults to Disabled.
 *
 * The test provider is reachable only outside production, so a stray environment
 * value cannot turn a live deployment into a fake-payment deployment. The Stripe
 * adapter is returned only from a complete configuration; a partial one falls
 * back to Disabled rather than constructing a half-configured adapter.
 */
export function resolvePaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProvider {
  const commerceEnabled = env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true";
  if (!commerceEnabled) return new DisabledPaymentProvider();

  // PROVIDER_READINESS.md names PAYMENTS_PROVIDER; the earlier singular spelling
  // is still honored so an existing environment does not silently fall to Disabled.
  const selected = env.PAYMENTS_PROVIDER ?? env.PAYMENT_PROVIDER;
  if (selected === "test") {
    if (env.NODE_ENV === "production") return new DisabledPaymentProvider();
    return new TestPaymentProvider();
  }
  if (selected === "stripe") {
    // The adapter is fully executable and attack-tested in isolation, but the
    // running composition has no durable payment intent/saga that can reconcile
    // a provider success across a crash before order persistence. Mounting the
    // adapter here would expose checkout, admin capture/cancel, and refund to
    // that window. Until a reviewed durable execution adapter owns those
    // effects, the production resolver remains structurally disabled even when
    // credentials are present. Injected test compositions can still exercise
    // StripePaymentAdapter directly without creating a production mutation path.
    return new DisabledPaymentProvider();
  }
  return new DisabledPaymentProvider();
}
