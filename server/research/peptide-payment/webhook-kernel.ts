import type { PeptidePaymentProvider, VerifiedPaymentEvent } from "./provider";

export type PaymentLifecycleState =
  | "pending"
  | "authorized"
  | "captured"
  | "failed";
export type PaymentDisputeState = "none" | "open" | "won" | "lost";

export interface PaymentEventProjection {
  providerPaymentReference: string;
  lifecycle: PaymentLifecycleState;
  capturedAmountCents: number;
  refundedAmountCents: number;
  dispute: PaymentDisputeState;
  lifecycleOccurredAt: string | null;
  refundOccurredAt: string | null;
  disputeOccurredAt: string | null;
  lastOccurredAt: string;
  lastEventId: string;
}

export type PaymentWebhookFirstApplyResult =
  | { status: "applied"; projection: PaymentEventProjection }
  | {
      status: "ignored_out_of_order" | "quarantined";
      reason: string;
      needsReconciliation: boolean;
      projection: PaymentEventProjection | null;
    };

export type PaymentWebhookApplyResult =
  | PaymentWebhookFirstApplyResult
  | {
      status: "duplicate";
      originalStatus: PaymentWebhookFirstApplyResult["status"];
      reason: string | null;
      needsReconciliation: boolean;
      projection: PaymentEventProjection | null;
    };

export interface PaymentWebhookReconciliationItem {
  event: VerifiedPaymentEvent;
  reason: string;
}

export type PaymentWebhookReconciliationResult =
  | PaymentWebhookFirstApplyResult
  | { status: "not_pending"; projection: null };

export interface PaymentWebhookLedger {
  /**
   * Atomic claim + projection update. When needsReconciliation is true, a
   * production adapter must durably enqueue the verified event in that same
   * transaction so a separate worker can re-evaluate it after prerequisites.
   */
  applyVerifiedEvent(
    event: VerifiedPaymentEvent,
  ): Promise<PaymentWebhookApplyResult>;

  /**
   * Re-evaluates an already-claimed, durably queued event without accepting a
   * second webhook delivery. Projection update and queue acknowledgement must
   * be atomic; events that still need reconciliation remain queued.
   */
  reconcileClaimedEvent(
    eventId: string,
  ): Promise<PaymentWebhookReconciliationResult>;
}

export type PaymentWebhookHandlingResult =
  | { ok: true; eventId: string; result: PaymentWebhookApplyResult }
  | {
      ok: false;
      code: "webhook_unverified" | "webhook_invalid" | "webhook_unavailable";
      message: string;
      retryable: boolean;
    };

export class PaymentWebhookKernel {
  constructor(
    private readonly provider: PeptidePaymentProvider,
    private readonly ledger: PaymentWebhookLedger,
  ) {}

  /** rawBody must be the untouched request bytes captured before JSON parsing. */
  async handle(
    rawBody: Uint8Array,
    signatureHeader: string | undefined,
  ): Promise<PaymentWebhookHandlingResult> {
    const verified = await this.provider.verifyWebhook(
      rawBody,
      signatureHeader,
    );
    if (!verified.ok) {
      if (verified.code === "webhook_unverified") {
        return {
          ok: false,
          code: "webhook_unverified",
          message: "The payment webhook was not verified.",
          retryable: false,
        };
      }
      if (verified.code === "webhook_invalid") {
        return {
          ok: false,
          code: "webhook_invalid",
          message: "The verified payment webhook is invalid.",
          retryable: false,
        };
      }
      return {
        ok: false,
        code: "webhook_unavailable",
        message: "Payment webhook processing is unavailable.",
        retryable: verified.retryable,
      };
    }
    const result = await this.ledger.applyVerifiedEvent(verified.value);
    return { ok: true, eventId: verified.value.eventId, result };
  }
}

const STRICT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PAYMENT_REFERENCE = /^(pi|test_pi)_[A-Za-z0-9_]{3,}$/;

function cloneProjection(
  value: PaymentEventProjection | null | undefined,
): PaymentEventProjection | null {
  return value ? { ...value } : null;
}

function quarantine(
  reason: string,
  projection: PaymentEventProjection | null,
  needsReconciliation = true,
): PaymentWebhookFirstApplyResult {
  return {
    status: "quarantined",
    reason,
    needsReconciliation,
    projection: cloneProjection(projection),
  };
}

function initialProjection(
  event: VerifiedPaymentEvent,
): PaymentEventProjection {
  return {
    providerPaymentReference: event.providerPaymentReference,
    lifecycle: "pending",
    capturedAmountCents: 0,
    refundedAmountCents: 0,
    dispute: "none",
    lifecycleOccurredAt: null,
    refundOccurredAt: null,
    disputeOccurredAt: null,
    lastOccurredAt: event.occurredAt,
    lastEventId: event.eventId,
  };
}

function validEvent(event: VerifiedPaymentEvent): boolean {
  return (
    event.verified === true &&
    typeof event.eventId === "string" &&
    event.eventId.length >= 5 &&
    event.eventId.length <= 255 &&
    PAYMENT_REFERENCE.test(event.providerPaymentReference) &&
    STRICT_UTC.test(event.occurredAt) &&
    Number.isFinite(Date.parse(event.occurredAt)) &&
    (event.amountCents === undefined ||
      (Number.isSafeInteger(event.amountCents) && event.amountCents >= 0))
  );
}

function reduceEvent(
  current: PaymentEventProjection | null,
  event: VerifiedPaymentEvent,
): PaymentWebhookFirstApplyResult {
  if (!validEvent(event)) return quarantine("verified_event_invalid", current);

  const ignoredOutOfOrder = (
    dimension: "lifecycle" | "refund" | "dispute",
  ): PaymentWebhookFirstApplyResult => ({
    status: "ignored_out_of_order",
    reason: `${dimension}_event_older_than_projection`,
    needsReconciliation: false,
    projection: cloneProjection(current),
  });
  const olderThan = (occurredAt: string | null): boolean =>
    occurredAt !== null &&
    Date.parse(event.occurredAt) < Date.parse(occurredAt);

  const next = current ? { ...current } : initialProjection(event);
  const apply = (
    dimension: "lifecycle" | "refund" | "dispute",
  ): PaymentWebhookFirstApplyResult => {
    if (dimension === "lifecycle") next.lifecycleOccurredAt = event.occurredAt;
    if (dimension === "refund") next.refundOccurredAt = event.occurredAt;
    if (dimension === "dispute") next.disputeOccurredAt = event.occurredAt;
    if (Date.parse(event.occurredAt) >= Date.parse(next.lastOccurredAt)) {
      next.lastOccurredAt = event.occurredAt;
      next.lastEventId = event.eventId;
    }
    return { status: "applied", projection: { ...next } };
  };

  switch (event.type) {
    case "payment.authorized":
      if (olderThan(next.lifecycleOccurredAt))
        return ignoredOutOfOrder("lifecycle");
      if (next.lifecycle === "captured" || next.lifecycle === "failed") {
        return quarantine(
          "authorization_would_regress_lifecycle",
          current,
          false,
        );
      }
      next.lifecycle = "authorized";
      return apply("lifecycle");

    case "payment.captured":
      if (olderThan(next.lifecycleOccurredAt))
        return ignoredOutOfOrder("lifecycle");
      if (!event.amountCents || event.amountCents <= 0)
        return quarantine("capture_amount_invalid", current);
      if (next.lifecycle === "failed")
        return quarantine("capture_after_failure", current);
      if (next.lifecycle === "captured") {
        return event.amountCents === next.capturedAmountCents
          ? quarantine("capture_already_applied", current, false)
          : quarantine("capture_amount_conflict", current);
      }
      next.lifecycle = "captured";
      next.capturedAmountCents = event.amountCents;
      return apply("lifecycle");

    case "payment.failed":
      if (olderThan(next.lifecycleOccurredAt))
        return ignoredOutOfOrder("lifecycle");
      if (next.lifecycle === "captured")
        return quarantine("failure_after_capture", current, false);
      next.lifecycle = "failed";
      return apply("lifecycle");

    case "payment.refunded":
      if (olderThan(next.refundOccurredAt)) return ignoredOutOfOrder("refund");
      if (next.lifecycle !== "captured" || next.capturedAmountCents <= 0) {
        return quarantine("refund_before_capture", current);
      }
      if (
        next.lifecycleOccurredAt &&
        Date.parse(event.occurredAt) < Date.parse(next.lifecycleOccurredAt)
      ) {
        return quarantine("refund_occurred_before_capture", current);
      }
      if (
        event.amountCents === undefined ||
        event.amountCents <= next.refundedAmountCents ||
        event.amountCents > next.capturedAmountCents
      ) {
        return quarantine("refund_total_invalid_or_non_monotonic", current);
      }
      next.refundedAmountCents = event.amountCents;
      return apply("refund");

    case "payment.dispute_opened":
      if (olderThan(next.disputeOccurredAt))
        return ignoredOutOfOrder("dispute");
      if (next.lifecycle !== "captured")
        return quarantine("dispute_before_capture", current);
      if (
        next.lifecycleOccurredAt &&
        Date.parse(event.occurredAt) < Date.parse(next.lifecycleOccurredAt)
      ) {
        return quarantine("dispute_occurred_before_capture", current);
      }
      if (next.dispute === "won" || next.dispute === "lost") {
        return quarantine("closed_dispute_cannot_reopen", current, false);
      }
      next.dispute = "open";
      return apply("dispute");

    case "payment.dispute_won":
    case "payment.dispute_lost":
      if (olderThan(next.disputeOccurredAt))
        return ignoredOutOfOrder("dispute");
      if (next.dispute !== "open")
        return quarantine("dispute_close_without_open", current);
      next.dispute = event.type === "payment.dispute_won" ? "won" : "lost";
      return apply("dispute");
  }
  return quarantine("event_type_unsupported", current);
}

/**
 * Credential-free atomic test ledger. Production integration must replace this
 * with one durable transaction that claims eventId, updates the projection,
 * and enqueues reconciliation when the first disposition requires it.
 */
export class InMemoryPaymentWebhookLedger implements PaymentWebhookLedger {
  private projections = new Map<string, PaymentEventProjection>();
  private receipts = new Map<string, PaymentWebhookFirstApplyResult>();
  private reconciliation = new Map<string, PaymentWebhookReconciliationItem>();
  private queue: Promise<void> = Promise.resolve();

  applyVerifiedEvent(
    event: VerifiedPaymentEvent,
  ): Promise<PaymentWebhookApplyResult> {
    const operation = this.queue.then(() => {
      const duplicate = this.receipts.get(event.eventId);
      if (duplicate) {
        return {
          status: "duplicate" as const,
          originalStatus: duplicate.status,
          reason: duplicate.status === "applied" ? null : duplicate.reason,
          needsReconciliation: this.reconciliation.has(event.eventId),
          projection: cloneProjection(
            this.projections.get(event.providerPaymentReference),
          ),
        };
      }
      const current = cloneProjection(
        this.projections.get(event.providerPaymentReference),
      );
      const result = reduceEvent(current, event);
      if (result.status === "applied")
        this.projections.set(event.providerPaymentReference, {
          ...result.projection,
        });
      if (result.status !== "applied" && result.needsReconciliation) {
        this.reconciliation.set(event.eventId, {
          event: { ...event },
          reason: result.reason,
        });
      }
      this.receipts.set(event.eventId, result);
      return result;
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  reconcileClaimedEvent(
    eventId: string,
  ): Promise<PaymentWebhookReconciliationResult> {
    const operation = this.queue.then(() => {
      const item = this.reconciliation.get(eventId);
      if (!item) return { status: "not_pending" as const, projection: null };

      const current = cloneProjection(
        this.projections.get(item.event.providerPaymentReference),
      );
      const result = reduceEvent(current, item.event);
      if (result.status === "applied") {
        this.projections.set(item.event.providerPaymentReference, {
          ...result.projection,
        });
        this.reconciliation.delete(eventId);
      } else if (!result.needsReconciliation) {
        this.reconciliation.delete(eventId);
      } else {
        this.reconciliation.set(eventId, {
          event: { ...item.event },
          reason: result.reason,
        });
      }
      return result;
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  getProjection(
    providerPaymentReference: string,
  ): PaymentEventProjection | null {
    return cloneProjection(this.projections.get(providerPaymentReference));
  }

  getReceipt(eventId: string): PaymentWebhookFirstApplyResult | null {
    const result = this.receipts.get(eventId);
    if (!result) return null;
    return result.status === "applied"
      ? { ...result, projection: { ...result.projection } }
      : { ...result, projection: cloneProjection(result.projection) };
  }

  getReconciliation(eventId: string): PaymentWebhookReconciliationItem | null {
    const item = this.reconciliation.get(eventId);
    return item ? { event: { ...item.event }, reason: item.reason } : null;
  }
}
