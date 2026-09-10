// Durable checkout orchestration types.
//
// Origin: XENIOS_IMPLEMENTATION_20260908 package, shared/research/durable-checkout-execution.ts,
// reformatted for the repository with no semantic change. This contract grants no
// product, price, payment or inventory authority: it only names the phases a
// checkout execution can be in and the exact provider evidence that may move it.

export type CheckoutExecutionPhase =
  | "reserved"
  | "authorizing"
  | "action_required"
  | "authorized"
  | "capturing"
  | "captured"
  | "committed"
  | "cancelling"
  | "cancelled"
  | "reconciliation_required";

/** The money binding one execution is allowed to move. Every provider effect is checked against it. */
export interface CheckoutMoneyBinding {
  orderId: string;
  memberId: string;
  amountCents: number;
  currency: "usd";
  /** Provider-hosted payment method reference (Stripe `pm_...`); never card data. */
  paymentMethodReference: string;
  quoteFingerprint: string;
}

export interface CheckoutExecutionRecord extends CheckoutMoneyBinding {
  executionId: string;
  requestKey: string;
  phase: CheckoutExecutionPhase;
  version: number;
  providerReference: string | null;
  /** Stable provider operation keys, minted once with the record and never regenerated. */
  authorizationKey: string;
  captureKey: string;
  cancelKey: string;
  reservationIds: string[];
  createdAt: string;
  /**
   * When the FIRST authorization attempt was claimed. A creation replay with
   * the same key is only retrieval of the original payment while the
   * provider's idempotency guarantee still holds (Stripe: 24 hours); after
   * that an attempt with no reference is uncertain and must not be replayed.
   */
  authorizationAttemptedAt: string | null;
  /** When the local settlement of a cancelled execution completed (order cancelled, holds released). */
  settledAt: string | null;
  /**
   * Set when the provider captured but the local transaction could not complete
   * (an incomplete reservation set, for example). The external charge stands and
   * the execution waits for a person: this is the one field an operations view
   * must never lose.
   */
  localCommitFailure?: string | null;
  /** When the local commit completed. */
  committedAt?: string | null;
  /**
   * When the row last changed. The recovery sweep judges staleness by this, so
   * an execution a worker is actively moving is never mistaken for abandoned.
   */
  updatedAt?: string | null;
  /** The last provider evidence recorded, when the store keeps it (the SQL row does). */
  lastProviderResult?: ProviderExecutionResult | null;
}

export type CancellationReason = "declined" | "customer" | "provider";

export type ProviderExecutionResult =
  | { kind: "authorized"; providerReference: string; amountCents: number; currency: "usd"; memberId: string; orderId: string }
  | { kind: "captured"; providerReference: string; amountCents: number; currency: "usd"; memberId: string; orderId: string }
  | { kind: "action_required"; providerReference: string }
  /**
   * providerReference is null only when no provider payment ever existed for
   * the execution. `reason` names why nothing was charged: the card was
   * declined, the customer (or an operator) asked, or the provider ended it.
   */
  | { kind: "cancelled"; providerReference: string | null; capturedAmountCents: 0; reason?: CancellationReason }
  | { kind: "refused"; definitiveNoEffect: boolean }
  /**
   * The outcome is not known. It may still carry a reference the caller LEARNED
   * during the attempt: recording it lets every later attempt read the payment
   * back by reference instead of replaying a creation key that expires.
   */
  | { kind: "unknown"; providerReference?: string };

/** Provider proof counts only when it names exactly this record's money, member and order. */
export function exactPaymentEvidence(
  record: CheckoutMoneyBinding,
  proof: Extract<ProviderExecutionResult, { kind: "authorized" | "captured" }>,
): boolean {
  return (
    proof.amountCents === record.amountCents &&
    proof.currency === record.currency &&
    proof.memberId === record.memberId &&
    proof.orderId === record.orderId &&
    Number.isSafeInteger(proof.amountCents) &&
    proof.amountCents > 0 &&
    /^pi_[A-Za-z0-9]+$/.test(proof.providerReference)
  );
}
