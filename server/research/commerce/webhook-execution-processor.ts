// Processing verified provider events against durable checkout executions.
//
// Order of operations, and why:
//   1. Look up the execution the event names (reads only). An event that names
//      no execution is "unbound" and untouched, so the legacy order projection
//      keeps owning it.
//   2. Claim the event in the inbox BEFORE any effect. The claim is the durable
//      receipt: the provider is told 2xx only after the inbox row reaches a
//      terminal state, so an interrupted run leaves a "processing" row that a
//      redelivery resumes idempotently.
//   3. Record the evidence through the execution store's conditional write
//      (version compare-and-swap). The binding is monotonic in phase, so the
//      resume of an interrupted run, a duplicate delivery, or a stale
//      out-of-order event finds the execution already advanced and is
//      acknowledged rather than re-applied. Downstream money, inventory and
//      credit effects happen only in the store's commit, never here.
//   4. Mismatched evidence is isolated: durably recorded with its reason and
//      acknowledged to the provider, never attached to an execution.
import type { CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import type { WebhookVerification } from "../providers/payment";
import type { CanonicalCheckoutExecutionStore } from "./durable-checkout-executor";
import { bindPaymentEventToExecution, type WebhookExecutionDecision } from "./webhook-execution-binding";

export interface WebhookExecutionInboxEvent {
  providerName: string;
  eventId: string;
  eventType: string;
  /** Digest of the exact signed bytes; the same id with other bytes is a conflict. */
  payloadSha256: string;
  receivedAt: Date;
}

export type WebhookExecutionInboxClaim =
  | { state: "new" }
  /** Claimed earlier and never completed: an interrupted run. Resume idempotently. */
  | { state: "processing" }
  | { state: "processed"; outcome: string }
  | { state: "conflict" };

/**
 * Durable event receipt. A production implementation must back `claim` with a
 * UNIQUE (provider_name, event_id) row created in state "processing" and must
 * never delete rows; `complete` and `isolate` are terminal-state updates.
 */
export interface WebhookExecutionInbox {
  claim(event: WebhookExecutionInboxEvent): Promise<WebhookExecutionInboxClaim>;
  complete(providerName: string, eventId: string, outcome: "applied" | "acknowledged", executionId: string | null): Promise<void>;
  isolate(providerName: string, eventId: string, reason: string, executionId: string | null): Promise<void>;
}

export interface WebhookExecutionLookup {
  findByProviderReference(providerReference: string): Promise<CheckoutExecutionRecord | null>;
  /** Executions that have not learned their provider reference yet; matched by server-authored order metadata. */
  findByOrder(orderId: string): Promise<CheckoutExecutionRecord | null>;
}

export type WebhookExecutionStore = WebhookExecutionLookup & Pick<CanonicalCheckoutExecutionStore, "recordProvider">;

export type WebhookExecutionOutcome =
  | { outcome: "applied" | "acknowledged" | "isolated"; executionId: string | null; reason?: string }
  | { outcome: "duplicate" }
  | { outcome: "conflict" }
  /** The conditional write lost twice; the inbox row stays "processing" for the provider's redelivery. */
  | { outcome: "retry"; reason: "execution_contention" }
  | { outcome: "unbound" };

export interface WebhookExecutionProcessor {
  process(verified: WebhookVerification, payloadSha256: string, receivedAt: Date): Promise<WebhookExecutionOutcome>;
}

export interface WebhookExecutionProcessorDeps {
  providerName: string;
  inbox: WebhookExecutionInbox;
  executions: WebhookExecutionStore;
  /** Null for platform-account events; a Connect event must match exactly. */
  expectedProviderAccountId: string | null;
}

export function createWebhookExecutionProcessor(deps: WebhookExecutionProcessorDeps): WebhookExecutionProcessor {
  async function lookup(verified: WebhookVerification): Promise<CheckoutExecutionRecord | null> {
    const reference = verified.providerReference;
    if (typeof reference === "string" && reference !== "") {
      const byReference = await deps.executions.findByProviderReference(reference);
      if (byReference) return byReference;
    }
    if (verified.orderId !== undefined) {
      const byOrder = await deps.executions.findByOrder(verified.orderId);
      // Only a record that never learned its reference may bind through order metadata.
      if (byOrder && byOrder.providerReference === null) return byOrder;
    }
    return null;
  }

  return {
    async process(verified, payloadSha256, receivedAt) {
      const first = await lookup(verified);
      const initial: WebhookExecutionDecision = bindPaymentEventToExecution(verified, first, deps.expectedProviderAccountId);
      if (initial.kind === "unbound") return { outcome: "unbound" };

      const claim = await deps.inbox.claim({
        providerName: deps.providerName,
        eventId: verified.eventId,
        eventType: verified.eventType,
        payloadSha256,
        receivedAt,
      });
      if (claim.state === "conflict") return { outcome: "conflict" };
      if (claim.state === "processed") return { outcome: "duplicate" };

      let execution: CheckoutExecutionRecord | null = first;
      let decision: WebhookExecutionDecision = initial;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          execution = await lookup(verified);
          decision = bindPaymentEventToExecution(verified, execution, deps.expectedProviderAccountId);
        }
        const executionId = execution?.executionId ?? null;
        if (decision.kind === "unbound") {
          // The record vanished between the read and the claim; keep the receipt and let the provider redeliver.
          return { outcome: "retry", reason: "execution_contention" };
        }
        if (decision.kind === "isolate") {
          await deps.inbox.isolate(deps.providerName, verified.eventId, decision.reason, executionId);
          return { outcome: "isolated", executionId, reason: decision.reason };
        }
        if (decision.kind === "acknowledge") {
          await deps.inbox.complete(deps.providerName, verified.eventId, "acknowledged", executionId);
          return { outcome: "acknowledged", executionId, reason: decision.reason };
        }
        const saved = await deps.executions.recordProvider(execution!.executionId, execution!.version, decision.proof);
        if (saved) {
          await deps.inbox.complete(deps.providerName, verified.eventId, "applied", saved.executionId);
          return { outcome: "applied", executionId: saved.executionId, reason: decision.target };
        }
      }
      return { outcome: "retry", reason: "execution_contention" };
    },
  };
}

/** Deterministic inbox for tests and local composition. Never a production authority. */
export function createInMemoryWebhookExecutionInbox() {
  const rows = new Map<string, { payloadSha256: string; state: "processing" | "processed" | "isolated"; outcome: string | null; reason: string | null; executionId: string | null }>();
  const key = (providerName: string, eventId: string) => JSON.stringify([providerName, eventId]);
  const inbox: WebhookExecutionInbox = {
    async claim(event) {
      const existing = rows.get(key(event.providerName, event.eventId));
      if (existing) {
        if (existing.payloadSha256 !== event.payloadSha256) return { state: "conflict" };
        if (existing.state === "processing") return { state: "processing" };
        return { state: "processed", outcome: existing.outcome ?? existing.state };
      }
      rows.set(key(event.providerName, event.eventId), { payloadSha256: event.payloadSha256, state: "processing", outcome: null, reason: null, executionId: null });
      return { state: "new" };
    },
    async complete(providerName, eventId, outcome, executionId) {
      const row = rows.get(key(providerName, eventId));
      if (!row) throw new Error("inbox completion without a claim");
      row.state = "processed";
      row.outcome = outcome;
      row.executionId = executionId;
    },
    async isolate(providerName, eventId, reason, executionId) {
      const row = rows.get(key(providerName, eventId));
      if (!row) throw new Error("inbox isolation without a claim");
      row.state = "isolated";
      row.outcome = "isolated";
      row.reason = reason;
      row.executionId = executionId;
    },
  };
  return {
    ...inbox,
    snapshot: () => [...rows.entries()].map(([k, v]) => ({ key: JSON.parse(k) as [string, string], ...v })),
  };
}
