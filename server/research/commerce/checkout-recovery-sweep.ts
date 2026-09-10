// The bounded recovery sweep for checkout executions nobody came back for.
//
// A durable execution can stop anywhere: a worker dies mid-authorize, a
// provider response is lost, a customer abandons a bank challenge, a
// cancellation is claimed and never finished. Until now nothing found those
// rows. The customer's own return resolved them, and if the customer never
// returned the order stayed pending, the inventory holds stayed held, and an
// authorization could stand at the provider until it expired.
//
// TWO RULES GOVERN EVERYTHING HERE.
//
// 1. THE SWEEP NEVER COMPLETES A PURCHASE THE CUSTOMER ABANDONED. It finishes
//    what the provider already did, or it releases. `cancel()` still commits
//    when the provider turns out to have captured, because money that was taken
//    is a fact; but the sweep never drives an authorization forward into a
//    capture on its own.
//
// 2. THE SWEEP NEVER CAUSES A PAYMENT TO BE CREATED. Both the coordinator's
//    recover and cancel paths may replay the provider's creation key when an
//    execution has no reference yet. Inside the retention window that replay
//    RETURNS the original payment when the original request reached the
//    provider — but if that request never arrived, the replay CREATES one. For
//    a customer pressing retry that is what they asked for. For a sweep acting
//    on someone's behalf it is not. So an execution that attempted an
//    authorization and never learned a reference is ESCALATED, never acted on.
//
// Everything else follows from those: one action per execution per run, a
// bounded batch, a per-phase grace period so nothing in flight is disturbed,
// and version compare-and-swap underneath, so two sweeps racing each other
// leave exactly one winner and the loser reports pending.
//
// The sweep sends nothing. Downstream notification belongs to the canonical
// outbox and its owner; this module's job is money and inventory truth.

import type { CheckoutExecutionPhase, CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import type { DurableExecutionOutcome } from "./durable-checkout-executor";

/** What the sweep decided to do about one execution, and why. */
export type RecoveryDecision =
  | { action: "resolve"; reason: string }
  | { action: "release"; reason: string }
  | { action: "escalate"; reason: string }
  | { action: "skip"; reason: string };

export interface RecoverySweepEntry {
  executionId: string;
  orderId: string;
  phase: CheckoutExecutionPhase;
  decision: RecoveryDecision;
  /** The coordinator's answer, when an action was taken. */
  outcome?: DurableExecutionOutcome["kind"];
  /** Present when the action threw; the message is never a provider payload. */
  error?: string;
}

export interface RecoverySweepReport {
  /** How many rows discovery returned. */
  considered: number;
  /** Rows the sweep acted on. */
  acted: number;
  /** Rows left for a person, with the reason. Never silently dropped. */
  escalated: RecoverySweepEntry[];
  entries: RecoverySweepEntry[];
  /** True when discovery returned a full batch, so there is more to do. */
  more: boolean;
}

/**
 * How long an execution must have been untouched before the sweep will act.
 * A customer completing a bank challenge is not stuck, so `action_required`
 * waits far longer than a worker that died mid-call.
 */
export const DEFAULT_GRACE_MS: Readonly<Record<CheckoutExecutionPhase, number>> = Object.freeze({
  reserved: 30 * 60_000,
  authorizing: 15 * 60_000,
  authorized: 60 * 60_000,
  action_required: 6 * 60 * 60_000,
  capturing: 15 * 60_000,
  captured: 5 * 60_000,
  cancelling: 15 * 60_000,
  reconciliation_required: 15 * 60_000,
  committed: Number.POSITIVE_INFINITY,
  cancelled: 15 * 60_000,
});

export interface CheckoutRecoveryDeps {
  /**
   * Executions in a non-terminal state, oldest first, bounded. Discovery is the
   * one thing the per-member store cannot do; the managed implementation is a
   * service-role function over the executions table.
   */
  listRecoverable(before: Date, limit: number): Promise<CheckoutExecutionRecord[]>;
  executor: {
    run(memberId: string, requestKey: string): Promise<DurableExecutionOutcome>;
    cancel(memberId: string, requestKey: string): Promise<DurableExecutionOutcome>;
    recover(memberId: string, requestKey: string): Promise<DurableExecutionOutcome>;
  };
  now(): Date;
  grace?: Partial<Record<CheckoutExecutionPhase, number>>;
}

/**
 * The decision for one execution, as a pure function of the record and the
 * clock. Exported because this is the part worth reading and testing on its
 * own: everything the sweep does to money follows from it.
 */
export function decideRecovery(
  record: CheckoutExecutionRecord,
  now: Date,
  grace: Partial<Record<CheckoutExecutionPhase, number>> = {},
): RecoveryDecision {
  if (record.phase === "committed") return { action: "skip", reason: "already committed" };
  if (record.phase === "cancelled" && record.settledAt !== null) return { action: "skip", reason: "already settled" };

  const window = grace[record.phase] ?? DEFAULT_GRACE_MS[record.phase];
  const age = now.getTime() - Date.parse(record.updatedAt ?? record.createdAt);
  if (!Number.isFinite(age) || age < window) {
    return { action: "skip", reason: `within the grace period for ${record.phase}` };
  }

  // Rule 2: an attempt was made and no reference was ever learned. Any action
  // here can replay the creation key, and a replay creates a payment when the
  // original request never reached the provider. A person decides this one.
  if (record.providerReference === null && record.authorizationAttemptedAt !== null) {
    return {
      action: "escalate",
      reason: "an authorization was attempted but no provider reference was ever learned; resolving it could create a payment, so it needs a person to check the provider",
    };
  }

  // A cancellation the provider already confirmed, whose local settlement never
  // finished. Finishing it releases the holds and cancels the order.
  if (record.phase === "cancelled") return { action: "resolve", reason: "cancelled at the provider but not settled locally" };

  // The money is taken, or may have been. Read the provider's truth and let the
  // coordinator commit what it finds. This is finishing what the provider did.
  if (record.phase === "captured" || record.phase === "reconciliation_required") {
    return { action: "resolve", reason: `provider truth must settle a ${record.phase} execution` };
  }

  // Everything else is an unfinished attempt nobody came back for. Release it.
  // If the provider turns out to have taken the money, the release path reads
  // that back and commits instead, which is why this is safe.
  return { action: "release", reason: `no one returned to an execution left in ${record.phase}` };
}

export function createCheckoutRecoverySweep(deps: CheckoutRecoveryDeps) {
  return {
    /**
     * One bounded pass. Returns what it did and what it left for a person.
     * Safe to call on a schedule and safe to call concurrently: every action
     * underneath is a version compare-and-swap.
     */
    async sweep(limit = 25): Promise<RecoverySweepReport> {
      const bounded = Math.max(1, Math.min(limit, 200));
      const now = deps.now();
      // Discovery asks for anything older than the LONGEST grace period; each
      // record is then judged against its own phase's window.
      const windows = Object.values({ ...DEFAULT_GRACE_MS, ...deps.grace }).filter((ms) => Number.isFinite(ms)) as number[];
      const shortest = windows.length > 0 ? Math.min(...windows) : 0;
      const candidates = await deps.listRecoverable(new Date(now.getTime() - shortest), bounded);

      const entries: RecoverySweepEntry[] = [];
      for (const record of candidates) {
        const decision = decideRecovery(record, now, deps.grace);
        const entry: RecoverySweepEntry = { executionId: record.executionId, orderId: record.orderId, phase: record.phase, decision };
        if (decision.action === "skip" || decision.action === "escalate") {
          entries.push(entry);
          continue;
        }
        try {
          const outcome =
            decision.action === "resolve"
              ? await deps.executor.recover(record.memberId, record.requestKey)
              : await deps.executor.cancel(record.memberId, record.requestKey);
          entry.outcome = outcome.kind;
        } catch (error) {
          // Never echo a provider or store message: they carry references and secrets.
          entry.error = error instanceof Error ? error.name : "unknown";
        }
        entries.push(entry);
      }

      const acted = entries.filter((e) => e.decision.action === "resolve" || e.decision.action === "release").length;
      return {
        considered: candidates.length,
        acted,
        escalated: entries.filter((e) => e.decision.action === "escalate"),
        entries,
        more: candidates.length >= bounded,
      };
    },
  };
}

export type CheckoutRecoverySweep = ReturnType<typeof createCheckoutRecoverySweep>;
