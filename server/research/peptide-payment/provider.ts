import { createHmac, timingSafeEqual } from "node:crypto";

export const PEPTIDE_PAYMENT_SERVER_ENVIRONMENT = [
  "PAYMENTS_PROVIDER",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export type PaymentFailureCode =
  | "disabled"
  | "not_configured"
  | "configuration_invalid"
  | "invalid_request"
  | "idempotency_conflict"
  | "declined"
  | "provider_unavailable"
  | "not_found"
  | "invalid_state"
  | "webhook_unverified"
  | "webhook_invalid";

export type PaymentProviderResult<T> =
  | { ok: true; value: T; replayed?: boolean }
  | { ok: false; code: PaymentFailureCode; message: string; retryable: boolean };

export interface AuthorizePaymentInput {
  /** Derived from a server-verified quote; never accepted from the browser request. */
  amountCents: number;
  currency: "usd";
  orderIntentId: string;
  memberId: string;
  providerCustomerReference: string;
  providerPaymentMethodReference: string;
  idempotencyKey: string;
}

export interface AuthorizedPayment {
  providerPaymentReference: string;
  amountCents: number;
  currency: "usd";
  state: "authorized";
}

export interface CapturedPayment {
  providerPaymentReference: string;
  capturedAmountCents: number;
  state: "captured";
}

export interface RefundedPayment {
  providerPaymentReference: string;
  refundedAmountCents: number;
  state: "refunded";
}

export type VerifiedPaymentEventType =
  | "payment.authorized"
  | "payment.captured"
  | "payment.failed"
  | "payment.refunded"
  | "payment.dispute_opened"
  | "payment.dispute_won"
  | "payment.dispute_lost";

export interface VerifiedPaymentEvent {
  eventId: string;
  type: VerifiedPaymentEventType;
  providerPaymentReference: string;
  occurredAt: string;
  amountCents?: number;
  verified: true;
}

export interface PeptidePaymentProvider {
  readonly name: "disabled" | "test" | "stripe";
  authorize(input: AuthorizePaymentInput): Promise<PaymentProviderResult<AuthorizedPayment>>;
  capture(providerPaymentReference: string, amountCents: number, idempotencyKey: string): Promise<PaymentProviderResult<CapturedPayment>>;
  refund(providerPaymentReference: string, amountCents: number, idempotencyKey: string): Promise<PaymentProviderResult<RefundedPayment>>;
  verifyWebhook(
    rawBody: Uint8Array,
    signatureHeader: string | undefined,
  ): Promise<PaymentProviderResult<VerifiedPaymentEvent>>;
}

function failure<T>(code: PaymentFailureCode, message: string, retryable = false): PaymentProviderResult<T> {
  return { ok: false, code, message, retryable };
}

function fingerprint(value: unknown): string {
  return createHmac("sha256", "xenios-payment-idempotency-fingerprint-v1").update(JSON.stringify(value)).digest("hex");
}

const CUSTOMER_REFERENCE = /^(cus|test_cus)_[A-Za-z0-9_]{3,}$/;
const METHOD_REFERENCE = /^(pm|test_pm)_[A-Za-z0-9_]{3,}$/;
const PAYMENT_REFERENCE = /^(pi|test_pi)_[A-Za-z0-9_]{3,}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,200}$/;

function validIntegerCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validateAuthorizationInput(input: AuthorizePaymentInput): PaymentProviderResult<AuthorizePaymentInput> {
  const allowed = new Set([
    "amountCents",
    "currency",
    "orderIntentId",
    "memberId",
    "providerCustomerReference",
    "providerPaymentMethodReference",
    "idempotencyKey",
  ]);
  if (!input || typeof input !== "object" || Object.keys(input).some((key) => !allowed.has(key))) {
    return failure("invalid_request", "The payment authorization request contains unsupported fields.");
  }
  if (
    !validIntegerCents(input.amountCents) ||
    input.currency !== "usd" ||
    typeof input.orderIntentId !== "string" ||
    !input.orderIntentId ||
    typeof input.memberId !== "string" ||
    !input.memberId ||
    !CUSTOMER_REFERENCE.test(input.providerCustomerReference) ||
    !METHOD_REFERENCE.test(input.providerPaymentMethodReference) ||
    !IDEMPOTENCY_KEY.test(input.idempotencyKey)
  ) {
    return failure("invalid_request", "The payment authorization request is invalid.");
  }
  return { ok: true, value: input };
}

export class DisabledPeptidePaymentProvider implements PeptidePaymentProvider {
  readonly name = "disabled" as const;

  private unavailable<T>(): PaymentProviderResult<T> {
    return failure("disabled", "Payment is disabled.");
  }

  async authorize(_input: AuthorizePaymentInput) {
    return this.unavailable<AuthorizedPayment>();
  }
  async capture(_providerPaymentReference: string, _amountCents: number, _idempotencyKey: string) {
    return this.unavailable<CapturedPayment>();
  }
  async refund(_providerPaymentReference: string, _amountCents: number, _idempotencyKey: string) {
    return this.unavailable<RefundedPayment>();
  }
  async verifyWebhook(_rawBody: Uint8Array, _signatureHeader: string | undefined) {
    return this.unavailable<VerifiedPaymentEvent>();
  }
}

/** Deterministic and network-free; construction is refused in production. */
export class TestPeptidePaymentProvider implements PeptidePaymentProvider {
  readonly name = "test" as const;
  private authorizationCounter = 0;
  private authorizations = new Map<
    string,
    { amountCents: number; capturedCents: number; refundedCents: number; fingerprint: string }
  >();
  private authorizationKeys = new Map<string, { fingerprint: string; value: AuthorizedPayment }>();
  private captureKeys = new Map<string, { fingerprint: string; value: CapturedPayment }>();
  private refundKeys = new Map<string, { fingerprint: string; value: RefundedPayment }>();

  constructor(options: { nodeEnv?: string } = {}) {
    if ((options.nodeEnv ?? process.env.NODE_ENV) === "production") {
      throw new Error("TestPeptidePaymentProvider cannot run in production.");
    }
  }

  async authorize(input: AuthorizePaymentInput): Promise<PaymentProviderResult<AuthorizedPayment>> {
    const validated = validateAuthorizationInput(input);
    if (!validated.ok) return validated;
    const inputFingerprint = fingerprint(input);
    const replay = this.authorizationKeys.get(input.idempotencyKey);
    if (replay) {
      return replay.fingerprint === inputFingerprint
        ? { ok: true, value: { ...replay.value }, replayed: true }
        : failure("idempotency_conflict", "The idempotency key was already used for a different authorization.");
    }
    if (input.providerPaymentMethodReference === "test_pm_declined") {
      return failure("declined", "The payment method was declined.");
    }
    if (input.providerPaymentMethodReference === "test_pm_unavailable") {
      return failure("provider_unavailable", "The test payment provider is unavailable.", true);
    }

    const providerPaymentReference = `test_pi_${++this.authorizationCounter}`;
    const value: AuthorizedPayment = {
      providerPaymentReference,
      amountCents: input.amountCents,
      currency: "usd",
      state: "authorized",
    };
    this.authorizations.set(providerPaymentReference, {
      amountCents: input.amountCents,
      capturedCents: 0,
      refundedCents: 0,
      fingerprint: inputFingerprint,
    });
    this.authorizationKeys.set(input.idempotencyKey, { fingerprint: inputFingerprint, value });
    return { ok: true, value: { ...value } };
  }

  async capture(
    providerPaymentReference: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<PaymentProviderResult<CapturedPayment>> {
    const inputFingerprint = fingerprint({ providerPaymentReference, amountCents });
    const replay = this.captureKeys.get(idempotencyKey);
    if (replay) {
      return replay.fingerprint === inputFingerprint
        ? { ok: true, value: { ...replay.value }, replayed: true }
        : failure("idempotency_conflict", "The idempotency key was already used for a different capture.");
    }
    const authorization = this.authorizations.get(providerPaymentReference);
    if (!authorization) return failure("not_found", "The payment authorization was not found.");
    if (!validIntegerCents(amountCents) || amountCents > authorization.amountCents || authorization.capturedCents > 0) {
      return failure("invalid_state", "The payment authorization cannot be captured for that amount.");
    }
    authorization.capturedCents = amountCents;
    const value: CapturedPayment = { providerPaymentReference, capturedAmountCents: amountCents, state: "captured" };
    this.captureKeys.set(idempotencyKey, { fingerprint: inputFingerprint, value });
    return { ok: true, value: { ...value } };
  }

  async refund(
    providerPaymentReference: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<PaymentProviderResult<RefundedPayment>> {
    const inputFingerprint = fingerprint({ providerPaymentReference, amountCents });
    const replay = this.refundKeys.get(idempotencyKey);
    if (replay) {
      return replay.fingerprint === inputFingerprint
        ? { ok: true, value: { ...replay.value }, replayed: true }
        : failure("idempotency_conflict", "The idempotency key was already used for a different refund.");
    }
    const authorization = this.authorizations.get(providerPaymentReference);
    if (!authorization) return failure("not_found", "The captured payment was not found.");
    if (
      !validIntegerCents(amountCents) ||
      authorization.capturedCents <= 0 ||
      authorization.refundedCents + amountCents > authorization.capturedCents
    ) {
      return failure("invalid_state", "The refund exceeds the remaining captured amount.");
    }
    authorization.refundedCents += amountCents;
    const value: RefundedPayment = { providerPaymentReference, refundedAmountCents: amountCents, state: "refunded" };
    this.refundKeys.set(idempotencyKey, { fingerprint: inputFingerprint, value });
    return { ok: true, value: { ...value } };
  }

  async verifyWebhook(): Promise<PaymentProviderResult<VerifiedPaymentEvent>> {
    return failure("webhook_unverified", "The deterministic test provider does not accept external webhooks.");
  }
}

export interface StripeWireRequest {
  method: "POST";
  path: string;
  form: Record<string, string>;
  idempotencyKey: string;
}

export interface StripeWireResponse {
  status: number;
  body: unknown;
}

export type StripeTransport = (request: StripeWireRequest) => Promise<StripeWireResponse>;

export function buildStripeFetchTransport(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): StripeTransport {
  return async (request) => {
    const body = new URLSearchParams(request.form);
    const response = await fetchImpl(`https://api.stripe.com${request.path}`, {
      method: request.method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": request.idempotencyKey,
      },
      body,
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stripeFailure<T>(response: StripeWireResponse): PaymentProviderResult<T> {
  if (response.status === 402) return failure("declined", "The payment method was declined.");
  if (response.status >= 500 || response.status === 429) {
    return failure("provider_unavailable", "The payment provider is temporarily unavailable.", true);
  }
  return failure("invalid_request", "The payment provider rejected the request.");
}

function strictIsoFromUnixSeconds(value: unknown): string | null {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
  return new Date((value as number) * 1000).toISOString();
}

function paymentEventType(stripeType: string, object: Record<string, unknown>): VerifiedPaymentEventType | null {
  if (stripeType === "payment_intent.amount_capturable_updated") return "payment.authorized";
  if (stripeType === "payment_intent.succeeded") return "payment.captured";
  if (stripeType === "payment_intent.payment_failed") return "payment.failed";
  if (stripeType === "charge.refunded") return "payment.refunded";
  if (stripeType === "charge.dispute.created") return "payment.dispute_opened";
  if (stripeType === "charge.dispute.closed") {
    return object.status === "won" ? "payment.dispute_won" : object.status === "lost" ? "payment.dispute_lost" : null;
  }
  return null;
}

export class StripePeptidePaymentProvider implements PeptidePaymentProvider {
  readonly name = "stripe" as const;

  readonly #transport: StripeTransport;
  readonly #webhookSecret: string;
  readonly #now: () => number;

  constructor(
    transport: StripeTransport,
    webhookSecret: string,
    now: () => number = Date.now,
  ) {
    this.#transport = transport;
    this.#webhookSecret = webhookSecret;
    this.#now = now;
  }

  async authorize(input: AuthorizePaymentInput): Promise<PaymentProviderResult<AuthorizedPayment>> {
    const validated = validateAuthorizationInput(input);
    if (!validated.ok) return validated;
    let response: StripeWireResponse;
    try {
      response = await this.#transport({
        method: "POST",
        path: "/v1/payment_intents",
        idempotencyKey: input.idempotencyKey,
        form: {
          amount: String(input.amountCents),
          currency: "usd",
          customer: input.providerCustomerReference,
          payment_method: input.providerPaymentMethodReference,
          confirm: "true",
          capture_method: "manual",
          "metadata[orderIntentId]": input.orderIntentId,
          "metadata[memberId]": input.memberId,
        },
      });
    } catch {
      return failure("provider_unavailable", "The payment provider is temporarily unavailable.", true);
    }
    if (response.status < 200 || response.status >= 300) return stripeFailure(response);
    const body = record(response.body);
    if (!body || typeof body.id !== "string" || !PAYMENT_REFERENCE.test(body.id) || body.status !== "requires_capture") {
      return failure("provider_unavailable", "The payment provider returned an invalid authorization response.", true);
    }
    return {
      ok: true,
      value: {
        providerPaymentReference: body.id,
        amountCents: input.amountCents,
        currency: "usd",
        state: "authorized",
      },
    };
  }

  async capture(
    providerPaymentReference: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<PaymentProviderResult<CapturedPayment>> {
    if (!PAYMENT_REFERENCE.test(providerPaymentReference) || !validIntegerCents(amountCents) || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return failure("invalid_request", "The capture request is invalid.");
    }
    let response: StripeWireResponse;
    try {
      response = await this.#transport({
        method: "POST",
        path: `/v1/payment_intents/${encodeURIComponent(providerPaymentReference)}/capture`,
        idempotencyKey,
        form: { amount_to_capture: String(amountCents) },
      });
    } catch {
      return failure("provider_unavailable", "The payment provider is temporarily unavailable.", true);
    }
    if (response.status < 200 || response.status >= 300) return stripeFailure(response);
    const body = record(response.body);
    if (!body || body.id !== providerPaymentReference || body.status !== "succeeded") {
      return failure("provider_unavailable", "The payment provider returned an invalid capture response.", true);
    }
    return { ok: true, value: { providerPaymentReference, capturedAmountCents: amountCents, state: "captured" } };
  }

  async refund(
    providerPaymentReference: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<PaymentProviderResult<RefundedPayment>> {
    if (!PAYMENT_REFERENCE.test(providerPaymentReference) || !validIntegerCents(amountCents) || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return failure("invalid_request", "The refund request is invalid.");
    }
    let response: StripeWireResponse;
    try {
      response = await this.#transport({
        method: "POST",
        path: "/v1/refunds",
        idempotencyKey,
        form: { payment_intent: providerPaymentReference, amount: String(amountCents) },
      });
    } catch {
      return failure("provider_unavailable", "The payment provider is temporarily unavailable.", true);
    }
    if (response.status < 200 || response.status >= 300) return stripeFailure(response);
    const body = record(response.body);
    if (!body || body.payment_intent !== providerPaymentReference || body.status !== "succeeded") {
      return failure("provider_unavailable", "The payment provider returned an invalid refund response.", true);
    }
    return { ok: true, value: { providerPaymentReference, refundedAmountCents: amountCents, state: "refunded" } };
  }

  async verifyWebhook(
    rawBody: Uint8Array,
    signatureHeader: string | undefined,
  ): Promise<PaymentProviderResult<VerifiedPaymentEvent>> {
    if (!signatureHeader || !verifyStripeWebhookSignature(rawBody, signatureHeader, this.#webhookSecret, this.#now())) {
      return failure("webhook_unverified", "The payment webhook signature is invalid.");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(rawBody).toString("utf8"));
    } catch {
      return failure("webhook_invalid", "The verified payment webhook body is malformed.");
    }
    const event = record(payload);
    const data = record(event?.data);
    const object = record(data?.object);
    const eventId = event?.id;
    const stripeType = event?.type;
    const occurredAt = strictIsoFromUnixSeconds(event?.created);
    const type = typeof stripeType === "string" && object ? paymentEventType(stripeType, object) : null;
    const reference = object?.payment_intent ?? object?.id;
    if (
      typeof eventId !== "string" ||
      !object ||
      typeof reference !== "string" ||
      !PAYMENT_REFERENCE.test(reference) ||
      !occurredAt ||
      !type
    ) {
      return failure("webhook_invalid", "The verified payment webhook event is unsupported or incomplete.");
    }
    const rawAmount = type === "payment.refunded" ? object.amount_refunded : object.amount;
    const amountCents = Number.isSafeInteger(rawAmount) && (rawAmount as number) >= 0 ? (rawAmount as number) : undefined;
    return {
      ok: true,
      value: {
        eventId,
        type,
        providerPaymentReference: reference,
        occurredAt,
        ...(amountCents !== undefined ? { amountCents } : {}),
        verified: true,
      },
    };
  }
}

export function verifyStripeWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string,
  webhookSecret: string,
  nowMs: number,
  toleranceSeconds = 300,
): boolean {
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && /^\d+$/.test(value ?? "")) timestamp = Number(value);
    if (key === "v1" && /^[a-f0-9]{64}$/i.test(value ?? "")) signatures.push(value.toLowerCase());
  }
  if (!Number.isSafeInteger(timestamp) || signatures.length === 0 || !webhookSecret) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp!) > toleranceSeconds) return false;
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), Buffer.from(rawBody)]);
  const expected = createHmac("sha256", webhookSecret).update(signed).digest();
  return signatures.some((candidate) => {
    const actual = Buffer.from(candidate, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export type PaymentProviderResolution =
  | { state: "disabled"; provider: DisabledPeptidePaymentProvider }
  | { state: "not_configured"; missing: string[]; provider: DisabledPeptidePaymentProvider }
  | { state: "invalid"; message: string; provider: DisabledPeptidePaymentProvider }
  | { state: "ready"; mode: "test" | "live"; provider: PeptidePaymentProvider };

export function resolvePeptidePaymentProvider(
  env: Record<string, string | undefined>,
  options: { nodeEnv?: string; stripeTransport?: StripeTransport; now?: () => number } = {},
): PaymentProviderResolution {
  const selected = env.PAYMENTS_PROVIDER?.trim().toLowerCase();
  if (!selected || selected === "disabled") return { state: "disabled", provider: new DisabledPeptidePaymentProvider() };
  if (selected === "test") {
    if ((options.nodeEnv ?? process.env.NODE_ENV) === "production") {
      return {
        state: "invalid",
        message: "The deterministic test payment provider is prohibited in production.",
        provider: new DisabledPeptidePaymentProvider(),
      };
    }
    return { state: "ready", mode: "test", provider: new TestPeptidePaymentProvider({ nodeEnv: options.nodeEnv }) };
  }
  if (selected !== "stripe") {
    return {
      state: "invalid",
      message: "The configured payment provider is not supported.",
      provider: new DisabledPeptidePaymentProvider(),
    };
  }
  const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { state: "not_configured", missing, provider: new DisabledPeptidePaymentProvider() };
  const secretKey = env.STRIPE_SECRET_KEY!;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET!;
  if (!/^sk_(test|live)_[A-Za-z0-9_]{8,}$/.test(secretKey) || !/^whsec_[A-Za-z0-9_]{8,}$/.test(webhookSecret)) {
    return {
      state: "invalid",
      message: "The payment provider credentials are invalid.",
      provider: new DisabledPeptidePaymentProvider(),
    };
  }
  const mode = secretKey.startsWith("sk_live_") ? "live" : "test";
  return {
    state: "ready",
    mode,
    provider: new StripePeptidePaymentProvider(
      options.stripeTransport ?? buildStripeFetchTransport(secretKey),
      webhookSecret,
      options.now,
    ),
  };
}
