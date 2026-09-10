// The bounded recovery sweep for checkout executions nobody came back for.
//
// A durable execution can stop anywhere: a worker dies mid-authorize, a
// provider response is lost, a customer abandons a bank challenge, a
// cancellation is claimed and never finished. Until this existed nothing found
// those rows. The customer's own return resolved them, and if the customer
// never returned the order stayed pending, the inventory holds stayed held, and
// an authorization could stand at the provider until it expired.
//
// THIS MODULE HAS NO PAYMENT AUTHORITY OF ITS OWN. It cannot call `run`,
// `recover` or `cancel`: it is given exactly one operation,
// `settleUnattended`, which the coordinator defines and deliberately limits so
// it can never create, confirm or capture a payment. The "never complete an
// abandoned purchase" rule is therefore enforced below this file, under the
// claim, against the authoritative record — not by the scheduling decision
// here, which is only about WHEN to try a row.
//
// Discovery pages forward through a stable ordering. An earlier version
// returned the oldest bounded batch every pass, so a handful of escalated rows
// at the head of the queue could hide everything behind them indefinitely. The
// cursor makes the queue advance without touching any business timestamp.
//
// The sweep sends nothing. Downstream notification belongs to the canonical
// outbox and its owner; this module's job is money and inventory truth.

import type { CheckoutExecutionPhase, CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";
import type { UnattendedOutcome } from "./durable-checkout-executor";

/** Where a pass stopped, so the next one resumes after it. */
export interface RecoveryCursor {
  updatedAt: string;
  executionId: string;
}

export interface RecoveryListRequest {
  /** Only rows untouched since this moment are eligible. */
  before: Date;
  limit: number;
  /** Resume strictly after this position in the (updatedAt, executionId) order. */
  after?: RecoveryCursor | null;
}

export interface RecoverySweepEntry {
  executionId: string;
  orderId: string;
  phase: CheckoutExecutionPhase;
  /** The payment an operator can open at the provider. Not a secret. */
  providerReference: string | null;
  /** What the pass did, or why it did nothing. */
  outcome: UnattendedOutcome["kind"] | "skipped";
  /** Always present for a skip or an escalation; the sentence an operator acts on. */
  reason?: string;
}

export interface RecoverySweepReport {
  /** Rows discovery returned across every page of this pass. */
  considered: number;
  /** Rows the pass actually operated on. */
  attempted: number;
  /** Rows that reached a terminal, settled state. */
  settled: number;
  /** Rows a person must look at. Never dropped, never silent. */
  escalated: RecoverySweepEntry[];
  /** Rows left for a later pass (contended, or a release that did not conclude). */
  deferred: number;
  entries: RecoverySweepEntry[];
  /** How many discovery pages this pass read. */
  pages: number;
  /** Where the next pass should resume. Null when the queue was read to the end. */
  cursor: RecoveryCursor | null;
  /** True when discovery ran out of eligible rows. */
  exhausted: boolean;
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
   * Non-terminal executions untouched since `before`, ordered by
   * (updatedAt, executionId) ascending, resuming after `after`. Discovery is the
   * one thing the per-member store cannot do; the managed implementation is a
   * service-role function over the executions table.
   */
  listRecoverable(request: RecoveryListRequest): Promise<CheckoutExecutionRecord[]>;
  /**
   * The coordinator's LIMITED unattended operation. Nothing else is given to
   * this module, so no path here can enter normal payment progression.
   */
  settleUnattended(memberId: string, requestKey: string): Promise<UnattendedOutcome>;
  now(): Date;
  grace?: Partial<Record<CheckoutExecutionPhase, number>>;
}

export type AttemptDecision = { attempt: true } | { attempt: false; reason: string };

/**
 * WHEN to try a row. Deliberately not what to do with it: every safety decision
 * belongs under the claim, against the authoritative record, because a customer
 * or a webhook may move an execution between discovery and the attempt.
 */
export function shouldAttempt(
  record: CheckoutExecutionRecord,
  now: Date,
  grace: Partial<Record<CheckoutExecutionPhase, number>> = {},
): AttemptDecision {
  if (record.phase === "committed") return { attempt: false, reason: "already committed" };
  if (record.phase === "cancelled" && record.settledAt !== null) return { attempt: false, reason: "already settled" };
  const window = grace[record.phase] ?? DEFAULT_GRACE_MS[record.phase];
  const touched = Date.parse(record.updatedAt ?? record.createdAt);
  if (!Number.isFinite(touched)) return { attempt: false, reason: "the record carries no usable timestamp" };
  const age = now.getTime() - touched;
  if (age < window) return { attempt: false, reason: `within the ${Math.round(window / 60_000)} minute grace period for ${record.phase}` };
  return { attempt: true };
}

export interface SweepOptions {
  /** Most rows this pass will operate on. */
  maxAttempts?: number;
  /** Most discovery pages this pass will read. */
  maxPages?: number;
  /** Rows per discovery page. */
  pageSize?: number;
  /** Resume a previous pass. */
  cursor?: RecoveryCursor | null;
}

export function createCheckoutRecoverySweep(deps: CheckoutRecoveryDeps) {
  const shortestGrace = () => {
    const windows = Object.values({ ...DEFAULT_GRACE_MS, ...deps.grace }).filter((ms): ms is number => Number.isFinite(ms));
    return windows.length > 0 ? Math.min(...windows) : 0;
  };

  return {
    /**
     * One bounded pass. Safe on a schedule and safe to run concurrently: every
     * write underneath is a version compare-and-swap, so a losing worker
     * reports `contended` and changes nothing.
     */
    async sweep(options: SweepOptions = {}): Promise<RecoverySweepReport> {
      const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 25, 200));
      const maxPages = Math.max(1, Math.min(options.maxPages ?? 10, 50));
      const pageSize = Math.max(1, Math.min(options.pageSize ?? 25, 200));
      const now = deps.now();
      const before = new Date(now.getTime() - shortestGrace());

      const entries: RecoverySweepEntry[] = [];
      const seen = new Set<string>();
      let cursor: RecoveryCursor | null = options.cursor ?? null;
      let considered = 0;
      let attempted = 0;
      let pages = 0;
      let exhausted = false;

      while (pages < maxPages && attempted < maxAttempts) {
        const batch = await deps.listRecoverable({ before, limit: pageSize, after: cursor });
        pages += 1;
        if (batch.length === 0) {
          exhausted = true;
          cursor = null;
          break;
        }
        for (const record of batch) {
          considered += 1;
          // Acting on a row moves it later in the ordering, so a defensive
          // guard keeps a single pass from revisiting one it already handled.
          if (seen.has(record.executionId)) continue;
          seen.add(record.executionId);

          const base = {
            executionId: record.executionId,
            orderId: record.orderId,
            phase: record.phase,
            providerReference: record.providerReference,
          };
          const decision = shouldAttempt(record, now, deps.grace);
          if (!decision.attempt) {
            entries.push({ ...base, outcome: "skipped", reason: decision.reason });
            continue;
          }
          if (attempted >= maxAttempts) break;
          attempted += 1;
          const outcome = await deps.settleUnattended(record.memberId, record.requestKey);
          entries.push({
            ...base,
            outcome: outcome.kind,
            ...(outcome.kind === "escalated" ? { reason: outcome.reason } : {}),
          });
        }
        const last = batch[batch.length - 1]!;
        cursor = { updatedAt: last.updatedAt ?? last.createdAt, executionId: last.executionId };
        if (batch.length < pageSize) {
          exhausted = true;
          cursor = null;
          break;
        }
      }

      const escalated = entries.filter((e) => e.outcome === "escalated");
      return {
        considered,
        attempted,
        settled: entries.filter((e) => e.outcome === "committed" || e.outcome === "cancelled").length,
        escalated,
        deferred: entries.filter((e) => e.outcome === "pending" || e.outcome === "contended").length,
        entries,
        pages,
        cursor,
        exhausted,
      };
    },
  };
}

export type CheckoutRecoverySweep = ReturnType<typeof createCheckoutRecoverySweep>;
