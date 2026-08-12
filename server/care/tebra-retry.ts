import type { TebraFailureCode } from "@shared/care/tebra";
import { isRetryableTebraCode, safeTebraErrorCode } from "./tebra-redaction";

/**
 * Bounded retry for upstream calls.
 *
 * Retrying an external write is only safe when repeating it cannot create a
 * duplicate. Every call the connector retries is addressed by a deterministic
 * external id, so a repeat either finds the record it already created or
 * updates it. Nothing here retries an operation that is not idempotent.
 */

export interface TebraRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_TEBRA_RETRY_POLICY: TebraRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};

/**
 * No jitter is added. A practice API is a low-concurrency integration rather
 * than a thundering herd, and a deterministic schedule keeps the retry
 * behaviour provable in tests.
 */
export function tebraRetryDelayMs(attempt: number, policy: TebraRetryPolicy): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, policy.maxDelayMs);
}

export type TebraAttemptOutcome<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; code: TebraFailureCode; retryable: boolean; attempts: number };

export async function runWithTebraRetry<T>(
  operation: () => Promise<T>,
  options: {
    policy?: TebraRetryPolicy;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<TebraAttemptOutcome<T>> {
  const policy = options.policy ?? DEFAULT_TEBRA_RETRY_POLICY;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxAttempts = Math.max(1, policy.maxAttempts);

  let attempts = 0;
  let lastCode: TebraFailureCode = "tebra_unavailable";

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      return { ok: true, value: await operation(), attempts };
    } catch (error) {
      lastCode = safeTebraErrorCode(error);
      if (!isRetryableTebraCode(lastCode) || attempts >= maxAttempts) break;
      await sleep(tebraRetryDelayMs(attempts, policy));
    }
  }

  return { ok: false, code: lastCode, retryable: isRetryableTebraCode(lastCode), attempts };
}
