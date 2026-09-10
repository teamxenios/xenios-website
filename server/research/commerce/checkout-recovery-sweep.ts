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

/**
 * A checkpoint is a whole cycle's position: the horizon it started with, and
 * where in that horizon it stopped.
 *
 * The horizon is fixed for the life of a cycle. Recomputing it on every pass
 * lets the eligible set grow underneath a cursor that only moves forward, so a
 * busy platform never reaches the end of its own queue.
 *
 * `after: null` means the cycle finished. The next scheduled cycle then starts
 * a fresh horizon and reconsiders everything, which is how a row that was
 * escalated or temporarily failed gets tried again rather than being skipped
 * for ever.
 */
export interface RecoveryCheckpoint {
  /** The cycle's fixed horizon, as an ISO timestamp. */
  before: string;
  /** Where the cycle stopped, or null when it completed. */
  after: RecoveryCursor | null;
}

/**
 * A stable code for an operator store to index on, so nothing has to parse
 * prose. Deliberately a small closed set.
 */
export type RecoveryEntryCode =
  | "settled_committed"
  | "settled_cancelled"
  | "left_pending"
  | "contended"
  | "needs_person"
  | "vanished"
  | "skipped"
  | "attempt_failed";

export interface RecoverySweepEntry {
  executionId: string;
  orderId: string;
  phase: CheckoutExecutionPhase;
  /** The payment an operator can open at the provider. Not a secret. */
  providerReference: string | null;
  /** What the pass did, or why it did nothing. */
  outcome: UnattendedOutcome["kind"] | "skipped";
  /** The same fact as `outcome`, as a fixed code an operator store can index. */
  code: RecoveryEntryCode;
  /**
   * Always present for a skip or an escalation; the sentence an operator acts
   * on. Written here, never taken from a provider: provider error text can
   * carry references and secrets.
   */
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
  /**
   * What to persist and hand back to the next pass. Null when the cycle
   * completed, so the next one starts a fresh horizon.
   */
  checkpoint: RecoveryCheckpoint | null;
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
  settleUnattended(
    memberId: string,
    requestKey: string,
    expected?: { updatedAt: string | null },
  ): Promise<UnattendedOutcome>;
  /**
   * Durably record what happened to a row, called immediately after that row is
   * decided and always BEFORE the cursor moves past it. If it throws, the pass
   * stops and hands back the last position it did record, so the remaining rows
   * replay. That is safe because the unattended operation is idempotent and
   * re-reads the authoritative record.
   *
   * The residual, stated plainly: an external effect and a local write cannot be
   * made atomic. A row settled in the instant before this store failed keeps its
   * outcome in the execution row, which is the authoritative record of what
   * happened to that payment; the operator event is a convenience that can be
   * one row behind. This is why the sweep reports what it did as well as
   * recording it.
   *
   * The platform's existing job/audit state owns this. The sweep deliberately
   * does not choose a store.
   */
  record?(entries: readonly RecoverySweepEntry[]): Promise<void>;
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
  /**
   * Resume a cycle. Pass back exactly what the previous pass returned; null or
   * omitted starts a new cycle with a fresh horizon.
   */
  checkpoint?: RecoveryCheckpoint | null;
}

const CODE_FOR_OUTCOME: Readonly<Record<UnattendedOutcome["kind"], RecoveryEntryCode>> = Object.freeze({
  committed: "settled_committed",
  cancelled: "settled_cancelled",
  pending: "left_pending",
  contended: "contended",
  escalated: "needs_person",
  missing: "vanished",
});

/**
 * A cycle position. Null means "this cycle is done, start a fresh one", which
 * is also the honest answer when a pass stopped before recording anything.
 */
function checkpointOf(before: Date, cursor: RecoveryCursor | null): RecoveryCheckpoint | null {
  return cursor === null ? null : { before: before.toISOString(), after: cursor };
}

function report(
  entries: RecoverySweepEntry[],
  considered: number,
  attempted: number,
  pages: number,
  checkpoint: RecoveryCheckpoint | null,
  exhausted: boolean,
): RecoverySweepReport {
  return {
    considered,
    attempted,
    settled: entries.filter((e) => e.outcome === "committed" || e.outcome === "cancelled").length,
    escalated: entries.filter((e) => e.outcome === "escalated"),
    deferred: entries.filter((e) => e.outcome === "pending" || e.outcome === "contended" || e.code === "attempt_failed").length,
    entries,
    pages,
    checkpoint,
    exhausted,
  };
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
      // A resumed cycle keeps the horizon it started with. A new cycle takes a
      // fresh one. Without that, the eligible set grows under a cursor that
      // only moves forward and the cycle never ends.
      const resumed = options.checkpoint ?? null;
      const horizon = resumed && resumed.after !== null ? new Date(resumed.before) : new Date(now.getTime() - shortestGrace());
      const before = Number.isFinite(horizon.getTime()) ? horizon : new Date(now.getTime() - shortestGrace());

      const entries: RecoverySweepEntry[] = [];
      const seen = new Set<string>();
      let cursor: RecoveryCursor | null = resumed?.after ?? null;
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
        // The cursor may only ever pass a row this pass actually LOOKED at.
        // Advancing it to the end of a batch that was cut short by a limit
        // steps over rows nobody examined, and because the cursor only moves
        // forward inside a cycle, those rows are then skipped for the whole
        // cycle. That is the exact starvation the cursor exists to prevent.
        let examined = 0;
        let stoppedShort = false;
        let recordFailed = false;
        for (const record of batch) {
          if (attempted >= maxAttempts) {
            stoppedShort = true;
            break;
          }
          considered += 1;
          examined += 1;
          const position: RecoveryCursor = {
            updatedAt: record.updatedAt ?? record.createdAt,
            executionId: record.executionId,
          };
          // Acting on a row moves it later in the ordering, so a defensive
          // guard keeps a single pass from revisiting one it already handled.
          if (seen.has(record.executionId)) {
            cursor = position;
            continue;
          }
          seen.add(record.executionId);

          const base = {
            executionId: record.executionId,
            orderId: record.orderId,
            phase: record.phase,
            providerReference: record.providerReference,
          };
          const decision = shouldAttempt(record, now, deps.grace);
          const entry: RecoverySweepEntry = decision.attempt
            ? await (async () => {
                attempted += 1;
                try {
                  // The discovery snapshot travels with the request, so the
                  // operation can tell "still idle" from "someone came back".
                  const outcome = await deps.settleUnattended(record.memberId, record.requestKey, {
                    updatedAt: record.updatedAt ?? null,
                  });
                  return {
                    ...base,
                    outcome: outcome.kind,
                    code: CODE_FOR_OUTCOME[outcome.kind],
                    ...(outcome.kind === "escalated" ? { reason: outcome.reason } : {}),
                  };
                } catch {
                  // One row that always throws must not starve every row behind
                  // it. It is reported and the pass keeps going; the provider
                  // error text never travels, only the fact of the failure.
                  return {
                    ...base,
                    outcome: "skipped" as const,
                    code: "attempt_failed" as const,
                    reason: "this execution could not be settled on this pass and was left for the next one",
                  };
                }
              })()
            : { ...base, outcome: "skipped", code: "skipped", reason: decision.reason };
          entries.push(entry);

          // Recorded before the cursor passes this row.
          if (deps.record) {
            try {
              await deps.record([entry]);
            } catch {
              recordFailed = true;
              break;
            }
          }
          cursor = position;
        }

        if (recordFailed) {
          // Hand back the last position that WAS recorded. On the first page of
          // a fresh cycle that is still null, which resumes from the head: the
          // rows replay, and replaying is safe.
          return report(entries, considered, attempted, pages, checkpointOf(before, cursor), false);
        }
        if (stoppedShort) break;
        if (examined === batch.length && batch.length < pageSize) {
          exhausted = true;
          cursor = null;
          break;
        }
      }

      // A finished cycle persists null, so the next scheduled cycle takes a
      // fresh horizon and reconsiders rows this one escalated or deferred.
      return report(entries, considered, attempted, pages, checkpointOf(before, cursor), exhausted);
    },
  };
}

export type CheckoutRecoverySweep = ReturnType<typeof createCheckoutRecoverySweep>;
