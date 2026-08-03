import { createHash } from "node:crypto";
import type { AuthorizedPayment, PeptidePaymentProvider } from "./provider";

export interface ServerVerifiedPaymentQuote {
  orderIntentId: string;
  memberId: string;
  amountCents: number;
  currency: "usd";
  quoteVersion: string;
  expiresAt: string;
}

export interface CheckoutPaymentRequest {
  orderIntentId: string;
  paymentMethodReference: string;
  idempotencyKey: string;
}

export interface ResolvedMemberPaymentInstrument {
  paymentMethodReference: string;
  memberId: string;
  provider: "stripe" | "test";
  providerCustomerReference: string;
  providerPaymentMethodReference: string;
  state: "active" | "disabled" | "detached" | "expired";
}

export interface MemberPaymentInstrumentResolver {
  resolve(paymentMethodReference: string): Promise<ResolvedMemberPaymentInstrument | null>;
}

export type CheckoutPaymentDenialCode =
  | "unsafe_payment_payload"
  | "client_money_not_allowed"
  | "payment_request_invalid"
  | "payment_not_configured"
  | "payment_method_invalid"
  | "quote_invalid"
  | "quote_expired"
  | "idempotency_conflict"
  | "payment_declined"
  | "payment_provider_unavailable";

export type CheckoutPaymentOutcome =
  | { ok: true; authorization: AuthorizedPayment; idempotentReplay: boolean }
  | { ok: false; code: CheckoutPaymentDenialCode; message: string; retryable: boolean; idempotentReplay: boolean };

export interface PaymentAuthorizationIdempotency {
  execute(
    key: string,
    commandFingerprint: string,
    operation: () => Promise<CheckoutPaymentOutcome>,
  ): Promise<CheckoutPaymentOutcome>;
}

export interface PaymentCheckoutAuditEvent {
  type: "payment_instrument_refused";
  memberId: string;
  orderIntentId: string;
  reason: "not_found" | "not_owned" | "inactive" | "provider_mismatch" | "binding_invalid";
}

export interface CheckoutPaymentKernelDependencies {
  instruments: MemberPaymentInstrumentResolver;
  provider: PeptidePaymentProvider;
  idempotency: PaymentAuthorizationIdempotency;
  now?: () => number;
  audit?: (event: PaymentCheckoutAuditEvent) => void | Promise<void>;
}

const REQUEST_KEYS = new Set(["orderIntentId", "paymentMethodReference", "idempotencyKey"]);
const INTERNAL_PAYMENT_METHOD_REFERENCE = /^pmi_[A-Za-z0-9_]{5,}$/;
const PROVIDER_CUSTOMER_REFERENCE = /^(cus|test_cus)_[A-Za-z0-9_]{3,}$/;
const PROVIDER_PAYMENT_METHOD_REFERENCE = /^(pm|test_pm)_[A-Za-z0-9_]{3,}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9:_-]{8,200}$/;
const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const RAW_PAYMENT_KEYS = new Set([
  "card",
  "cardnumber",
  "pan",
  "primaryaccountnumber",
  "cvc",
  "cvv",
  "securitycode",
  "expiry",
  "expiration",
  "expmonth",
  "expyear",
  "routingnumber",
  "accountnumber",
]);

const CLIENT_MONEY_KEYS = new Set([
  "amount",
  "amountcents",
  "price",
  "pricecents",
  "unitprice",
  "unitpricecents",
  "linetotal",
  "linetotalcents",
  "subtotal",
  "subtotalcents",
  "shippingcents",
  "total",
  "totalcents",
]);

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function luhn(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function inspectUntrustedCheckoutPaymentPayload(
  value: unknown,
): { ok: true } | { ok: false; code: "unsafe_payment_payload" | "client_money_not_allowed" } {
  const seen = new Set<object>();
  const visit = (candidate: unknown): "unsafe_payment_payload" | "client_money_not_allowed" | null => {
    if (typeof candidate === "string" && luhn(candidate)) return "unsafe_payment_payload";
    if (!candidate || typeof candidate !== "object") return null;
    if (seen.has(candidate)) return "unsafe_payment_payload";
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const finding = visit(item);
        if (finding) return finding;
      }
      return null;
    }
    for (const [key, nested] of Object.entries(candidate as Record<string, unknown>)) {
      const normalized = normalizeKey(key);
      if (RAW_PAYMENT_KEYS.has(normalized)) return "unsafe_payment_payload";
      if (CLIENT_MONEY_KEYS.has(normalized)) return "client_money_not_allowed";
      const finding = visit(nested);
      if (finding) return finding;
    }
    return null;
  };
  const finding = visit(value);
  return finding ? { ok: false, code: finding } : { ok: true };
}

export function parseCheckoutPaymentRequest(
  value: unknown,
):
  | { ok: true; value: CheckoutPaymentRequest }
  | { ok: false; code: "unsafe_payment_payload" | "client_money_not_allowed" | "payment_request_invalid" } {
  const inspection = inspectUntrustedCheckoutPaymentPayload(value);
  if (!inspection.ok) return inspection;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, code: "payment_request_invalid" };
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !REQUEST_KEYS.has(key))) return { ok: false, code: "payment_request_invalid" };
  if (
    typeof object.orderIntentId !== "string" ||
    !object.orderIntentId ||
    typeof object.paymentMethodReference !== "string" ||
    !INTERNAL_PAYMENT_METHOD_REFERENCE.test(object.paymentMethodReference) ||
    typeof object.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(object.idempotencyKey)
  ) {
    return { ok: false, code: "payment_request_invalid" };
  }
  return {
    ok: true,
    value: {
      orderIntentId: object.orderIntentId,
      paymentMethodReference: object.paymentMethodReference,
      idempotencyKey: object.idempotencyKey,
    },
  };
}

function denied(
  code: CheckoutPaymentDenialCode,
  message: string,
  retryable = false,
): CheckoutPaymentOutcome {
  return { ok: false, code, message, retryable, idempotentReplay: false };
}

function validateQuote(quote: ServerVerifiedPaymentQuote, memberId: string, orderIntentId: string, nowMs: number): CheckoutPaymentOutcome | null {
  if (
    quote.memberId !== memberId ||
    quote.orderIntentId !== orderIntentId ||
    quote.currency !== "usd" ||
    !Number.isSafeInteger(quote.amountCents) ||
    quote.amountCents <= 0 ||
    !quote.quoteVersion ||
    !STRICT_UTC.test(quote.expiresAt)
  ) {
    return denied("quote_invalid", "The server payment quote is invalid.");
  }
  const expiresAt = Date.parse(quote.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    return denied("quote_expired", "The server payment quote expired.");
  }
  return null;
}

function commandFingerprint(memberId: string, quote: ServerVerifiedPaymentQuote, request: CheckoutPaymentRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        memberId,
        orderIntentId: quote.orderIntentId,
        amountCents: quote.amountCents,
        currency: quote.currency,
        quoteVersion: quote.quoteVersion,
        paymentMethodReference: request.paymentMethodReference,
      }),
    )
    .digest("hex");
}

async function auditRefusal(
  deps: CheckoutPaymentKernelDependencies,
  memberId: string,
  orderIntentId: string,
  reason: PaymentCheckoutAuditEvent["reason"],
): Promise<void> {
  await deps.audit?.({ type: "payment_instrument_refused", memberId, orderIntentId, reason });
}

export async function authorizeCheckoutPayment(
  memberId: string,
  untrustedRequest: unknown,
  quote: ServerVerifiedPaymentQuote,
  deps: CheckoutPaymentKernelDependencies,
): Promise<CheckoutPaymentOutcome> {
  const parsed = parseCheckoutPaymentRequest(untrustedRequest);
  if (!parsed.ok) {
    const messages = {
      unsafe_payment_payload: "Raw payment credentials are not accepted by Xenios.",
      client_money_not_allowed: "Payment totals must come from the server.",
      payment_request_invalid: "The payment request is invalid.",
    } as const;
    return denied(parsed.code, messages[parsed.code]);
  }
  if (deps.provider.name === "disabled") {
    return denied("payment_not_configured", "Payment is not configured.");
  }
  const quoteDenial = validateQuote(quote, memberId, parsed.value.orderIntentId, (deps.now ?? Date.now)());
  if (quoteDenial) return quoteDenial;

  const fingerprint = commandFingerprint(memberId, quote, parsed.value);
  return deps.idempotency.execute(parsed.value.idempotencyKey, fingerprint, async () => {
    const instrument = await deps.instruments.resolve(parsed.value.paymentMethodReference);
    let reason: PaymentCheckoutAuditEvent["reason"] | null = null;
    if (!instrument) reason = "not_found";
    else if (instrument.memberId !== memberId) reason = "not_owned";
    else if (instrument.state !== "active") reason = "inactive";
    else if (instrument.provider !== deps.provider.name) reason = "provider_mismatch";
    else if (
      !PROVIDER_CUSTOMER_REFERENCE.test(instrument.providerCustomerReference) ||
      !PROVIDER_PAYMENT_METHOD_REFERENCE.test(instrument.providerPaymentMethodReference)
    ) {
      reason = "binding_invalid";
    }
    if (reason) {
      await auditRefusal(deps, memberId, quote.orderIntentId, reason);
      return denied("payment_method_invalid", "The saved payment method is unavailable.");
    }

    const result = await deps.provider.authorize({
      amountCents: quote.amountCents,
      currency: "usd",
      orderIntentId: quote.orderIntentId,
      memberId,
      providerCustomerReference: instrument!.providerCustomerReference,
      providerPaymentMethodReference: instrument!.providerPaymentMethodReference,
      idempotencyKey: parsed.value.idempotencyKey,
    });
    if (result.ok) return { ok: true, authorization: result.value, idempotentReplay: Boolean(result.replayed) };
    if (result.code === "declined") return denied("payment_declined", "The payment method was declined.");
    if (result.code === "idempotency_conflict") {
      return denied("idempotency_conflict", "The payment idempotency key conflicts with an earlier command.");
    }
    return denied(
      "payment_provider_unavailable",
      "The payment provider is unavailable. No order was completed.",
      result.retryable,
    );
  });
}

export class InMemoryPaymentAuthorizationIdempotency implements PaymentAuthorizationIdempotency {
  private entries = new Map<string, { fingerprint: string; outcome: Promise<CheckoutPaymentOutcome> }>();

  async execute(
    key: string,
    commandFingerprintValue: string,
    operation: () => Promise<CheckoutPaymentOutcome>,
  ): Promise<CheckoutPaymentOutcome> {
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.fingerprint !== commandFingerprintValue) {
        return denied("idempotency_conflict", "The payment idempotency key conflicts with an earlier command.");
      }
      const outcome = await existing.outcome;
      return { ...outcome, idempotentReplay: true };
    }
    const outcome = Promise.resolve().then(operation);
    this.entries.set(key, { fingerprint: commandFingerprintValue, outcome });
    try {
      return await outcome;
    } catch (error) {
      this.entries.delete(key);
      throw error;
    }
  }
}
