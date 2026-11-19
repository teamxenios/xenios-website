// The outbox worker's row writes, in one place. runOutboxTick (outbox.ts)
// applies exactly these, and the customer-notice PostgreSQL journey case
// applies the same functions to a real database, so the two cannot drift.
// This module has no imports, so a database test can load it without the
// worker's mail, route or storage modules.

// Backoff schedule (Mega 1 section 4): immediate, 1m, 5m, 20m, 1h, 6h.
const BACKOFF_SECONDS = [0, 60, 300, 1200, 3600, 21600];
export const OUTBOX_MAX_ATTEMPTS = BACKOFF_SECONDS.length;
/** The automatic retry ladder, exported so tests can bound its span. */
export const OUTBOX_RETRY_LADDER = Object.freeze({ backoffSeconds: Object.freeze([...BACKOFF_SECONDS]), maxJitter: 0.2 });

export function outboxNextAttemptAt(attemptCount: number, now: Date): string {
  const base = BACKOFF_SECONDS[Math.min(attemptCount, BACKOFF_SECONDS.length - 1)];
  const jitter = base * OUTBOX_RETRY_LADDER.maxJitter * Math.random();
  return new Date(now.getTime() + (base + jitter) * 1000).toISOString();
}

/** The statuses a due job may be claimed from. */
export const OUTBOX_DUE_STATUSES: readonly string[] = Object.freeze(["pending", "failed_retryable"]);

export type OutboxAttemptOutcome = Readonly<{
  ok: boolean;
  providerId: string | null;
  error?: string;
  nonRetryable?: boolean;
  cancel?: boolean;
}>;

/** The claim, applied only from the status the job was read in. It records the attempt before any send. */
export function outboxClaimFields(now: Date) {
  return { status: "processing", updated_at: now.toISOString(), last_attempt_at: now.toISOString(), completed_at: null };
}

/** The attempt row recorded for one dispatch. */
export function outboxAttemptRow(outboxId: unknown, attempt: number, outcome: OutboxAttemptOutcome) {
  return { outbox_id: outboxId, attempt, outcome: outcome.ok ? "sent" : "failed", error_summary: outcome.error ?? null };
}

/** The job's fields after one attempt. */
export function outboxCompletionFields(outcome: OutboxAttemptOutcome, attempt: number, now: Date) {
  const at = now.toISOString();
  if (outcome.ok) {
    return {
      status: "sent", attempt_count: attempt, last_attempt_at: at,
      provider_message_id: outcome.providerId, completed_at: at, updated_at: at,
    };
  }
  if (outcome.cancel) {
    // Deliberately not sent and never tried: closed without a failure alert.
    return {
      status: "cancelled", attempt_count: attempt, last_attempt_at: at,
      last_error_summary: outcome.error ?? null, completed_at: at, updated_at: at,
    };
  }
  if (outcome.nonRetryable || attempt >= OUTBOX_MAX_ATTEMPTS) {
    return {
      status: "failed_permanent", attempt_count: attempt, last_attempt_at: at,
      last_error_summary: outcome.error ?? null, completed_at: at, updated_at: at,
    };
  }
  return {
    status: "failed_retryable", attempt_count: attempt, last_attempt_at: at,
    next_attempt_at: outboxNextAttemptAt(attempt, now), last_error_summary: outcome.error ?? null, updated_at: at,
  };
}
