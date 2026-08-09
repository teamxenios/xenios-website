import { createHash } from "node:crypto";
import {
  EARLY_ACCESS_INTERNAL_EMAIL_ACCEPTANCE,
  type EarlyAccessInternalEmailAcceptance,
} from "../hardening-contract";
import {
  EarlyAccessPersistenceError,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "../persistence/executor";
import type {
  ProofSubmissionClaim,
  ProofSubmissionRow,
  ProofSubmissionStore,
} from "./submission-record";
import { assertNoProofBytes } from "./transient-proof";

const RPC = Object.freeze({
  claim: "research_early_access_begin_proof_submission",
  confirm: "research_early_access_confirm_submission_email",
  adminView: "research_early_access_submission_admin_view",
});

function submissionKey(submissionId: string): string {
  return `eask_${createHash("sha256").update(submissionId).digest("hex").slice(0, 48)}`;
}

function requiredString(fn: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EarlyAccessPersistenceError(fn);
  }
  return value;
}

function nullableString(fn: string, value: unknown): string | null {
  if (value === null) return null;
  return requiredString(fn, value);
}

function nonnegativeInteger(fn: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new EarlyAccessPersistenceError(fn);
  }
  return value;
}

function isAcceptance(value: unknown): value is EarlyAccessInternalEmailAcceptance {
  return (
    typeof value === "string" &&
    (EARLY_ACCESS_INTERNAL_EMAIL_ACCEPTANCE as readonly string[]).includes(value)
  );
}

/** Decode only the frozen durable row fields; extra admin fields never spread. */
function decodeRow(fn: string, value: unknown): ProofSubmissionRow {
  const raw = expectObject(fn, value);
  assertNoProofBytes(raw);
  const method = expectObject(fn, raw.method);
  if (!isAcceptance(raw.internalEmailAcceptance)) {
    throw new EarlyAccessPersistenceError(fn);
  }

  return Object.freeze({
    submissionId: requiredString(fn, raw.submissionId),
    cartCheckoutNumber: requiredString(fn, raw.cartCheckoutNumber),
    customerRef: requiredString(fn, raw.customerRef),
    memberId: requiredString(fn, raw.memberId),
    method: Object.freeze({
      code: requiredString(fn, method.code),
      methodName: requiredString(fn, method.methodName),
      registryVersion: requiredString(fn, method.registryVersion),
      presentedAt: requiredString(fn, method.presentedAt),
    }) as ProofSubmissionRow["method"],
    filename: requiredString(fn, raw.filename),
    contentType: requiredString(fn, raw.contentType),
    byteSize: nonnegativeInteger(fn, raw.byteSize),
    proofSha256: requiredString(fn, raw.proofSha256),
    packageVersion: requiredString(fn, raw.packageVersion),
    createdAt: requiredString(fn, raw.createdAt),
    internalEmailAcceptance: raw.internalEmailAcceptance,
    providerMessageId: nullableString(fn, raw.providerMessageId),
    lastError: nullableString(fn, raw.lastError),
    updatedAt: requiredString(fn, raw.updatedAt),
    attempts: nonnegativeInteger(fn, raw.attempts),
    reconciledAt: nullableString(fn, raw.reconciledAt),
  });
}

function submissionMetadata(row: ProofSubmissionRow): Readonly<Record<string, unknown>> {
  const metadata = Object.freeze({
    submissionId: row.submissionId,
    cartCheckoutNumber: row.cartCheckoutNumber,
    customerRef: row.customerRef,
    memberId: row.memberId,
    method: Object.freeze({
      code: row.method.code,
      methodName: row.method.methodName,
      registryVersion: row.method.registryVersion,
      presentedAt: row.method.presentedAt,
    }),
    filename: row.filename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    proofSha256: row.proofSha256,
    packageVersion: row.packageVersion,
    createdAt: row.createdAt,
  });
  assertNoProofBytes(metadata);
  return metadata;
}

/**
 * Production ProofSubmissionStore backed only by M62 service-role RPCs.
 *
 * `claimPending` performs one call to the atomic INSERT ... ON CONFLICT claim
 * RPC. It never reads before claiming. All inputs and decoded outputs pass the
 * independent no-proof-bytes boundary.
 */
export class SupabaseProofSubmissionStore implements ProofSubmissionStore {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async claimPending(row: ProofSubmissionRow): Promise<ProofSubmissionClaim> {
    assertNoProofBytes(row);
    const raw = expectObject(
      RPC.claim,
      await runEarlyAccessCall(this.query, {
        fn: RPC.claim,
        args: {
          p_submission: submissionMetadata(row),
          p_submission_key: submissionKey(row.submissionId),
        },
      }),
    );
    if (typeof raw.claimed !== "boolean" || raw.row === undefined) {
      throw new EarlyAccessPersistenceError(RPC.claim);
    }
    const stored = decodeRow(RPC.claim, raw.row);
    if (stored.submissionId !== row.submissionId) {
      throw new EarlyAccessPersistenceError(RPC.claim);
    }
    return Object.freeze({ claimed: raw.claimed, row: stored }) as ProofSubmissionClaim;
  }

  async recordAcceptance(input: {
    readonly submissionId: string;
    readonly acceptance: EarlyAccessInternalEmailAcceptance;
    readonly providerMessageId: string | null;
    readonly lastError: string | null;
    readonly at: string;
  }): Promise<ProofSubmissionRow | null> {
    assertNoProofBytes(input);
    if (input.acceptance === "not_attempted") {
      throw new EarlyAccessPersistenceError(RPC.confirm);
    }
    const raw = expectObject(
      RPC.confirm,
      await runEarlyAccessCall(this.query, {
        fn: RPC.confirm,
        args: {
          p_submission_id: input.submissionId,
          p_submission_key: submissionKey(input.submissionId),
          p_acceptance: input.acceptance,
          p_provider_message_id: input.providerMessageId,
          p_last_error: input.lastError,
        },
      }),
    );
    if (raw.row !== undefined) return decodeRow(RPC.confirm, raw.row);
    if (raw.updated === true || raw.replayed === true) {
      throw new EarlyAccessPersistenceError(RPC.confirm);
    }
    return null;
  }

  async byId(submissionId: string): Promise<ProofSubmissionRow | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.adminView,
      // M62's text projection key accepts either checkout number or submission id.
      args: { p_checkout_number: submissionId },
    });
    return raw === null || raw === undefined ? null : decodeRow(RPC.adminView, raw);
  }
}
