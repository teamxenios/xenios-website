/**
 * AN IN-PROCESS SUBMISSION STORE.
 *
 * FOR TESTS AND FOR A SINGLE-PROCESS DEVELOPMENT RUN, NEVER FOR PRODUCTION.
 * `claimPending` is atomic here only because a single Node process has no
 * preemption inside a synchronous block. The durable implementation must be an
 * insert with an on-conflict return in one statement, because two web
 * instances racing on the same submission is exactly the case this store
 * cannot represent.
 *
 * It is still metadata only. Even the throwaway implementation has nowhere to
 * put bytes, so a test cannot accidentally prove that persistence works by
 * persisting something production would refuse to hold.
 */

import type { EarlyAccessInternalEmailAcceptance } from "../hardening-contract";
import type {
  ProofSubmissionClaim,
  ProofSubmissionRow,
  ProofSubmissionStore,
} from "./submission-record";

export interface MemoryProofSubmissionStore extends ProofSubmissionStore {
  /** Test visibility. Never used by the service. */
  all(): readonly ProofSubmissionRow[];
  /** Forces the next writes to fail, to exercise the unreconciled path. */
  failNextWrite(times?: number): void;
}

export function createMemoryProofSubmissionStore(): MemoryProofSubmissionStore {
  const rows = new Map<string, ProofSubmissionRow>();
  let failWrites = 0;

  return Object.freeze({
    async claimPending(row: ProofSubmissionRow): Promise<ProofSubmissionClaim> {
      const existing = rows.get(row.submissionId);
      if (existing !== undefined) {
        return Object.freeze({ claimed: false as const, row: existing });
      }
      rows.set(row.submissionId, row);
      return Object.freeze({ claimed: true as const, row });
    },

    async recordAcceptance(input: {
      submissionId: string;
      acceptance: EarlyAccessInternalEmailAcceptance;
      providerMessageId: string | null;
      lastError: string | null;
      at: string;
    }): Promise<ProofSubmissionRow | null> {
      if (failWrites > 0) {
        failWrites -= 1;
        return null;
      }
      const existing = rows.get(input.submissionId);
      if (existing === undefined) return null;
      const updated = Object.freeze({
        ...existing,
        internalEmailAcceptance: input.acceptance,
        providerMessageId: input.providerMessageId ?? existing.providerMessageId,
        lastError: input.lastError,
        updatedAt: input.at,
        attempts: existing.attempts + 1,
      });
      rows.set(input.submissionId, updated);
      return updated;
    },

    async byId(submissionId: string): Promise<ProofSubmissionRow | null> {
      return rows.get(submissionId) ?? null;
    },

    all(): readonly ProofSubmissionRow[] {
      const out: ProofSubmissionRow[] = [];
      rows.forEach((row) => out.push(row));
      return Object.freeze(out);
    },

    failNextWrite(times = 1): void {
      failWrites = times;
    },
  });
}
