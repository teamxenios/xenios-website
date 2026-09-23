import type { WebhookVerification } from "../providers/payment";
import type { DurableRefundExecutionStore, RefundExecutionRecord } from "./refund-executions";
import type { WebhookExecutionInbox } from "./webhook-execution-processor";

export type RefundWebhookOutcome =
  | { outcome: "applied" | "acknowledged" | "isolated"; executionId: string; reason?: string }
  | { outcome: "duplicate" | "conflict" }
  | { outcome: "retry"; reason: "refund_execution_contention" }
  | { outcome: "unbound" };

export interface RefundWebhookProcessor {
  process(verified: WebhookVerification, payloadSha256: string, receivedAt: Date): Promise<RefundWebhookOutcome>;
}

export interface RefundWebhookProcessorDeps {
  providerName: string;
  expectedProviderAccountId: string | null;
  inbox: WebhookExecutionInbox;
  executions: DurableRefundExecutionStore;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT = /^pi_[A-Za-z0-9_]+$/;
const REFUND = /^re_[A-Za-z0-9_]+$/;

function exactEvidence(event: WebhookVerification, execution: RefundExecutionRecord): boolean {
  return event.verified === true
    && event.refundExecutionId === execution.executionId
    && event.providerReference === execution.paymentReference
    && event.refundReference !== undefined
    && REFUND.test(event.refundReference)
    && event.amountCents === execution.amountCents
    && event.currency === execution.currency;
}

/**
 * Consumes only provider-terminal Refund objects carrying the execution id
 * written by the server on the original refund call. The shared durable inbox
 * is terminalized only after the atomic local refund commit succeeds.
 */
export function createRefundWebhookProcessor(deps: RefundWebhookProcessorDeps): RefundWebhookProcessor {
  return {
    async process(verified, payloadSha256, receivedAt) {
      if (verified.eventType !== "payment.refunded") return { outcome: "unbound" };
      const executionId = verified.refundExecutionId;
      if (!executionId || !UUID.test(executionId) || !verified.providerReference || !PAYMENT.test(verified.providerReference) ||
          !verified.refundReference || !REFUND.test(verified.refundReference) ||
          (verified.providerAccountId ?? null) !== deps.expectedProviderAccountId) {
        // No trustworthy execution key means there is no row this processor
        // may claim on behalf of. The handler returns non-2xx so a corrected or
        // operator-replayed event is not hidden by the legacy order path.
        return { outcome: "unbound" };
      }

      const claim = await deps.inbox.claim({
        providerName: deps.providerName,
        eventId: verified.eventId,
        eventType: verified.eventType,
        payloadSha256,
        receivedAt,
      });
      if (claim.state === "conflict") return { outcome: "conflict" };
      if (claim.state === "processed") return { outcome: "duplicate" };

      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const execution = await deps.executions.getById(executionId);
          if (!execution) {
            await deps.inbox.isolate(deps.providerName, verified.eventId, payloadSha256, "refund_execution_missing", null);
            return { outcome: "isolated", executionId, reason: "refund_execution_missing" };
          }
          if (!exactEvidence(verified, execution)) {
            await deps.inbox.isolate(deps.providerName, verified.eventId, payloadSha256, "refund_evidence_mismatch", null, executionId);
            return { outcome: "isolated", executionId, reason: "refund_evidence_mismatch" };
          }
          if (execution.state === "prepared") {
            await deps.inbox.isolate(deps.providerName, verified.eventId, payloadSha256, "refund_was_never_attempted", null, executionId);
            return { outcome: "isolated", executionId, reason: "refund_was_never_attempted" };
          }
          if (execution.state === "committed") {
            if (execution.providerRefundReference !== verified.refundReference) {
              await deps.inbox.isolate(deps.providerName, verified.eventId, payloadSha256, "refund_reference_mismatch", null, executionId);
              return { outcome: "isolated", executionId, reason: "refund_reference_mismatch" };
            }
            await deps.inbox.complete(deps.providerName, verified.eventId, payloadSha256, "acknowledged", null, executionId);
            return { outcome: "acknowledged", executionId };
          }

          let ready = execution;
          if (ready.state !== "provider_succeeded") {
            const recorded = await deps.executions.recordProvider(ready.executionId, ready.version, {
              providerReference: verified.refundReference,
              paymentReference: verified.providerReference,
              refundedAmountCents: verified.amountCents!,
              currency: "usd",
              status: "refunded",
            });
            if (!recorded) continue;
            ready = recorded;
          } else if (ready.providerRefundReference !== verified.refundReference) {
            await deps.inbox.isolate(deps.providerName, verified.eventId, payloadSha256, "refund_reference_mismatch", null, executionId);
            return { outcome: "isolated", executionId, reason: "refund_reference_mismatch" };
          }

          const committed = await deps.executions.commit(ready.executionId, ready.version);
          if (!committed || committed.state !== "committed") continue;
          await deps.inbox.complete(deps.providerName, verified.eventId, payloadSha256, "applied", null, executionId);
          return { outcome: "applied", executionId };
        }
      } catch {
        // The receipt remains processing. Provider redelivery resumes from the
        // durable execution state after a database/transaction interruption.
      }
      return { outcome: "retry", reason: "refund_execution_contention" };
    },
  };
}
