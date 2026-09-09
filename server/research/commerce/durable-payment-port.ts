// The provider-verified idempotent execution port.
//
// This is the concrete payment side of the recovery-aware checkout coordinator
// (durable-checkout-executor.ts), built over the canonical PaymentProvider
// boundary. It owns no state and decides nothing about money on its own: every
// outcome it reports is a provider result mapped conservatively into the
// coordinator's vocabulary, and every effect is keyed by the execution record's
// stable operation keys, so a retry after a lost response, a restart or a
// duplicate submission can never mint a second charge.
//
// Mapping principles (each is tested):
//   * A provider success counts only when its evidence names this record's
//     amount, currency, member and order; anything else is "unknown".
//   * "refused" with definitiveNoEffect=true is reported only when the provider
//     could not have created an effect: a disabled/misconfigured provider, an
//     invalid record, or a provider authentication refusal before processing.
//   * A transport failure, a 5xx, a rate limit, or evidence the adapter refused
//     is "unknown": the effect may exist, and reconciliation must read it back.
//   * Reconciliation retrieves the existing payment by reference. Without a
//     reference (the create response was lost), it replays the SAME creation
//     key, which providers with request idempotency answer with the original
//     payment, never a replacement.
//
// Nothing here logs, and no card data can pass through: the record carries a
// provider-hosted payment method reference only.
import type { CheckoutExecutionRecord, ProviderExecutionResult } from "@shared/research/durable-checkout-execution";
import type { ProviderResult } from "@shared/research/capability";
import {
  supportsDurableExecution,
  type DurablePaymentProvider,
  type PaymentAuthorization,
  type PaymentPending,
  type PaymentProvider,
  type PaymentSnapshot,
} from "../providers/payment";
import type { IdempotentCheckoutPaymentPort } from "./durable-checkout-executor";

export interface ProviderVerifiedPaymentPortOptions {
  /** Accepted provider-hosted payment method reference shape. Defaults to Stripe's `pm_...`. */
  paymentMethodReferencePattern?: RegExp;
}

const DEFAULT_PAYMENT_METHOD_PATTERN = /^pm_[A-Za-z0-9_]+$/;

function refused(definitiveNoEffect: boolean): ProviderExecutionResult {
  return { kind: "refused", definitiveNoEffect };
}
const UNKNOWN: ProviderExecutionResult = { kind: "unknown" };

/** The record's own money binding is validated before any provider call. */
export function validExecutionBinding(record: CheckoutExecutionRecord, pattern: RegExp): boolean {
  return (
    Number.isSafeInteger(record.amountCents) &&
    record.amountCents > 0 &&
    record.currency === "usd" &&
    typeof record.orderId === "string" &&
    record.orderId.length > 0 &&
    typeof record.memberId === "string" &&
    record.memberId.length > 0 &&
    typeof record.authorizationKey === "string" &&
    record.authorizationKey.length >= 8 &&
    typeof record.paymentMethodReference === "string" &&
    pattern.test(record.paymentMethodReference)
  );
}

export function createProviderVerifiedPaymentPort(
  provider: PaymentProvider,
  options: ProviderVerifiedPaymentPortOptions = {},
): IdempotentCheckoutPaymentPort {
  if (!supportsDurableExecution(provider)) {
    throw new Error("The provider-verified payment port requires a DurablePaymentProvider (pending evidence and payment retrieval).");
  }
  const durable: DurablePaymentProvider = provider;
  const pattern = options.paymentMethodReferencePattern ?? DEFAULT_PAYMENT_METHOD_PATTERN;

  /** A failure result mapped for an operation that may already have had an effect. */
  function failureOf(result: Extract<ProviderResult<unknown>, { ok: false }>, beforeAnyEffect: boolean): ProviderExecutionResult {
    switch (result.code) {
      case "DISABLED":
        return refused(true);
      case "MISCONFIGURED":
        // Local validation, or the provider refused our credentials before processing.
        return refused(beforeAnyEffect);
      case "REJECTED":
        // The provider processed the request and said no. For a creation this
        // can still leave a payment object behind (declined card, idempotency
        // conflict), so it is never "definitive no effect".
        return refused(false);
      case "RETRYABLE":
      case "PERMANENT_FAILURE":
      default:
        return UNKNOWN;
    }
  }

  function authorizedEvidence(record: CheckoutExecutionRecord, value: PaymentAuthorization): ProviderExecutionResult {
    if (
      value.status !== "authorized" ||
      value.currency !== "usd" ||
      value.amountCents !== record.amountCents ||
      typeof value.providerReference !== "string" ||
      value.providerReference.length === 0 ||
      (record.providerReference !== null && value.providerReference !== record.providerReference)
    ) {
      return UNKNOWN;
    }
    return {
      kind: "authorized",
      providerReference: value.providerReference,
      amountCents: value.amountCents,
      currency: "usd",
      memberId: record.memberId,
      orderId: record.orderId,
    };
  }

  function pendingEvidence(record: CheckoutExecutionRecord, value: PaymentPending): ProviderExecutionResult {
    if (record.providerReference !== null && value.providerReference !== record.providerReference) return UNKNOWN;
    return { kind: "action_required", providerReference: value.providerReference };
  }

  /** The provider's read-back truth mapped against the record. Metadata, when present, must agree. */
  function snapshotEvidence(record: CheckoutExecutionRecord, snapshot: PaymentSnapshot): ProviderExecutionResult {
    if (
      snapshot.currency !== "usd" ||
      (record.providerReference !== null && snapshot.providerReference !== record.providerReference) ||
      (snapshot.orderId !== null && snapshot.orderId !== record.orderId) ||
      (snapshot.memberId !== null && snapshot.memberId !== record.memberId)
    ) {
      return UNKNOWN;
    }
    switch (snapshot.status) {
      case "captured":
        if (snapshot.amountReceivedCents !== record.amountCents) return UNKNOWN;
        return {
          kind: "captured",
          providerReference: snapshot.providerReference,
          amountCents: snapshot.amountReceivedCents,
          currency: "usd",
          memberId: record.memberId,
          orderId: record.orderId,
        };
      case "authorized":
        if (snapshot.amountCapturableCents !== record.amountCents || snapshot.amountReceivedCents !== 0) return UNKNOWN;
        return {
          kind: "authorized",
          providerReference: snapshot.providerReference,
          amountCents: snapshot.amountCapturableCents,
          currency: "usd",
          memberId: record.memberId,
          orderId: record.orderId,
        };
      case "cancelled":
        if (snapshot.amountReceivedCents !== 0) return UNKNOWN;
        return { kind: "cancelled", providerReference: snapshot.providerReference, capturedAmountCents: 0 };
      case "pending":
        return { kind: "action_required", providerReference: snapshot.providerReference };
      default:
        // "processing" and anything new: the bank has not decided; do not guess.
        return UNKNOWN;
    }
  }

  async function createWithRecordKey(record: CheckoutExecutionRecord): Promise<ProviderExecutionResult> {
    const result = await durable.createAuthorizationOrPending({
      amountCents: record.amountCents,
      currency: "usd",
      orderId: record.orderId,
      memberId: record.memberId,
      idempotencyKey: record.authorizationKey,
      paymentMethodReference: record.paymentMethodReference,
    });
    if (!result.ok) return failureOf(result, true);
    return result.value.status === "pending"
      ? pendingEvidence(record, result.value)
      : authorizedEvidence(record, result.value);
  }

  async function readBack(record: CheckoutExecutionRecord, reference: string): Promise<ProviderExecutionResult> {
    const snapshot = await durable.retrievePayment(reference);
    if (!snapshot.ok) return UNKNOWN;
    return snapshotEvidence(record, snapshot.value);
  }

  return {
    authority: "provider_verified_idempotent_execution_v1",

    async authorize(record) {
      if (!validExecutionBinding(record, pattern)) return refused(true);
      // A record that already names a payment must never create another one.
      if (record.providerReference !== null) return readBack(record, record.providerReference);
      return createWithRecordKey(record);
    },

    async capture(record) {
      if (!validExecutionBinding(record, pattern)) return refused(true);
      if (record.providerReference === null) return refused(true);
      const reference = record.providerReference;
      const result = await durable.captureAuthorization(reference, record.amountCents);
      if (result.ok) {
        const value = result.value;
        if (
          value.status !== "captured" ||
          value.providerReference !== reference ||
          value.currency !== "usd" ||
          value.capturedAmountCents !== record.amountCents
        ) {
          return UNKNOWN;
        }
        return {
          kind: "captured",
          providerReference: reference,
          amountCents: value.capturedAmountCents,
          currency: "usd",
          memberId: record.memberId,
          orderId: record.orderId,
        };
      }
      // "Already captured", "cancelled", a lost response: the provider's own
      // read-back decides, never the refusal text.
      if (result.code === "DISABLED") return refused(true);
      return readBack(record, reference);
    },

    async reconcile(record) {
      if (!validExecutionBinding(record, pattern)) return refused(true);
      if (record.providerReference === null) {
        // The creation response was lost. Replaying the same key retrieves the
        // original payment from an idempotent provider; it creates one only if
        // the original request never arrived, which is the same logical effect.
        return createWithRecordKey(record);
      }
      return readBack(record, record.providerReference);
    },

    async cancel(record) {
      if (!validExecutionBinding(record, pattern)) return refused(true);
      if (record.providerReference === null) return refused(true);
      const reference = record.providerReference;
      const result = await durable.cancelAuthorization(reference);
      if (result.ok) return { kind: "cancelled", providerReference: reference, capturedAmountCents: 0 };
      if (result.code === "DISABLED") return refused(true);
      // A refusal may mean "already captured": the read-back reports the money truth.
      return readBack(record, reference);
    },
  };
}
