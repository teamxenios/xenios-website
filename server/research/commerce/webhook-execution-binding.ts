// Binding a signature-verified provider event to a durable checkout execution.
//
// Pure decisions only. Given the verified event (already past the provider's
// cryptographic boundary and type translation) and the execution record the
// store found for it, decide whether the event is evidence this execution may
// record, is a harmless duplicate or stale ordering, or contradicts the record
// and must be isolated for an operator. Nothing here reads or writes storage,
// and no event can be attached to "the nearest-looking" execution: every
// binding is by exact provider account, payment reference, order, member,
// amount and currency, and every advance is monotonic in the execution's
// phase so duplicate, delayed and out-of-order deliveries cannot regress or
// double-apply an effect.
import type {
  CheckoutExecutionPhase,
  CheckoutExecutionRecord,
  ProviderExecutionResult,
} from "@shared/research/durable-checkout-execution";
import type { WebhookVerification } from "../providers/payment";

export type WebhookExecutionAcknowledgeReason =
  | "untranslated_event_type"
  | "not_an_execution_event"
  | "already_authorized_or_later"
  | "already_captured_or_later"
  | "failed_after_authorization";

export type WebhookExecutionIsolateReason =
  | "reference_missing"
  | "provider_account_mismatch"
  | "payment_reference_mismatch"
  | "execution_unbound_without_order_metadata"
  | "order_mismatch"
  | "member_mismatch"
  | "currency_mismatch"
  | "amount_mismatch"
  | "captured_after_cancelled";

export type WebhookExecutionDecision =
  | { kind: "apply"; proof: ProviderExecutionResult; target: "authorized" | "captured" | "refused" }
  | { kind: "acknowledge"; reason: WebhookExecutionAcknowledgeReason }
  | { kind: "isolate"; reason: WebhookExecutionIsolateReason }
  /** The event addresses no execution (legacy order projection may still own it). */
  | { kind: "unbound" };

/** Monotonic order of phases for out-of-order tolerance. Terminal phases rank last. */
const PHASE_RANK: Record<CheckoutExecutionPhase, number> = {
  reserved: 0,
  authorizing: 1,
  action_required: 1,
  reconciliation_required: 1,
  authorized: 2,
  cancelling: 3,
  capturing: 3,
  captured: 4,
  committed: 5,
  cancelled: 5,
};

/** Event types this binding turns into execution evidence. Everything else is acknowledged. */
export const EXECUTION_EVENT_TYPES = new Set(["payment.authorized", "payment.captured", "payment.failed"]);

const PAYMENT_REFERENCE = /^pi_[A-Za-z0-9]+$/;

export function bindPaymentEventToExecution(
  event: WebhookVerification,
  execution: CheckoutExecutionRecord | null,
  expectedProviderAccountId: string | null,
): WebhookExecutionDecision {
  if (!EXECUTION_EVENT_TYPES.has(event.eventType)) {
    return { kind: "acknowledge", reason: event.eventType.includes(".") && event.eventType.startsWith("payment.") ? "not_an_execution_event" : "untranslated_event_type" };
  }
  const reference = event.providerReference;
  if (typeof reference !== "string" || !PAYMENT_REFERENCE.test(reference)) return { kind: "isolate", reason: "reference_missing" };
  if (!execution) return { kind: "unbound" };

  if ((event.providerAccountId ?? null) !== expectedProviderAccountId) return { kind: "isolate", reason: "provider_account_mismatch" };
  if (execution.providerReference !== null) {
    if (execution.providerReference !== reference) return { kind: "isolate", reason: "payment_reference_mismatch" };
  } else if (event.orderId === undefined) {
    // A record that never learned its reference can adopt one only through
    // the server-authored order metadata; a bare reference is not enough.
    return { kind: "isolate", reason: "execution_unbound_without_order_metadata" };
  }
  if (event.orderId !== undefined && event.orderId !== execution.orderId) return { kind: "isolate", reason: "order_mismatch" };
  if (event.memberId !== undefined && event.memberId !== execution.memberId) return { kind: "isolate", reason: "member_mismatch" };
  if (event.currency !== undefined && event.currency !== "usd") return { kind: "isolate", reason: "currency_mismatch" };

  const rank = PHASE_RANK[execution.phase];
  const exactAmount = Number.isSafeInteger(event.amountCents) && event.amountCents === execution.amountCents;

  switch (event.eventType) {
    case "payment.authorized": {
      if (!exactAmount) return { kind: "isolate", reason: "amount_mismatch" };
      if (rank >= PHASE_RANK.authorized) return { kind: "acknowledge", reason: "already_authorized_or_later" };
      return {
        kind: "apply",
        target: "authorized",
        proof: {
          kind: "authorized",
          providerReference: reference,
          amountCents: execution.amountCents,
          currency: "usd",
          memberId: execution.memberId,
          orderId: execution.orderId,
        },
      };
    }
    case "payment.captured": {
      if (!exactAmount) return { kind: "isolate", reason: "amount_mismatch" };
      if (execution.phase === "cancelled") return { kind: "isolate", reason: "captured_after_cancelled" };
      if (rank >= PHASE_RANK.captured) return { kind: "acknowledge", reason: "already_captured_or_later" };
      return {
        kind: "apply",
        target: "captured",
        proof: {
          kind: "captured",
          providerReference: reference,
          amountCents: execution.amountCents,
          currency: "usd",
          memberId: execution.memberId,
          orderId: execution.orderId,
        },
      };
    }
    case "payment.failed": {
      // A failed attempt before authorization leaves the payment object in place
      // without money; after authorization it is stale and cannot undo anything.
      if (rank >= PHASE_RANK.authorized) return { kind: "acknowledge", reason: "failed_after_authorization" };
      return { kind: "apply", target: "refused", proof: { kind: "refused", definitiveNoEffect: false } };
    }
    default:
      return { kind: "acknowledge", reason: "not_an_execution_event" };
  }
}
