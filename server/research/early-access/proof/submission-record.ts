/**
 * THE DURABLE SUBMISSION ROW, WHICH IS METADATA ONLY.
 *
 * WHAT A SUBMISSION IS. A customer telling us they have sent money and showing
 * us a picture of having done so. It is a CLAIM. It is not a payment, not a
 * verification, and not a release. Nothing in this file can express any of
 * those, and that is a property of the types rather than a rule someone must
 * remember: there is no `paid` field, no settlement reference, no supplier
 * release, and nowhere at all to put a file.
 *
 * IT EXTENDS THE FROZEN CONTRACT RATHER THAN RESTATING IT. The durable facts
 * come from `EarlyAccessProofSubmissionRecord` in `hardening-contract.ts`, so
 * the vocabulary belongs to the contract and this lane cannot drift from it by
 * renaming a field. What is added here is the operational half the contract
 * assigns to the ADMIN projection: the internal email acceptance, the provider
 * id, the last error and the reconciliation flag.
 *
 * WHY THE IDENTITY IS DERIVED RATHER THAN GENERATED. A generated id changes on
 * every retry, so a double click, a flaky network, or a browser that resends
 * would each create a new row and each send another email with the same
 * attachment to the same internal mailbox. Deriving the identity from the
 * checkout, the file's digest and the chosen method makes a repeat of the SAME
 * claim collapse onto the SAME row by construction. A genuinely different
 * upload has a different digest and is therefore a different submission, which
 * is correct: a customer who sends a second, clearer screenshot has made a
 * second claim.
 *
 * WHY THE PROVIDER IDEMPOTENCY KEY IS THE SAME SHAPE. Resend deduplicates on an
 * idempotency key. Deriving it from the same durable facts means that even if
 * this process dies after the provider accepted the message but before the
 * confirmation is recorded, a later attempt presents the same key and the
 * provider does not send a second copy. So the duplicate email problem is
 * solved at the provider as well as in our own store, and at least one of those
 * two layers survives any single partial failure.
 */

import { createHash } from "node:crypto";
import type {
  EarlyAccessInternalEmailAcceptance,
  EarlyAccessProofMethodSnapshot,
  EarlyAccessProofSubmissionRecord,
  EarlyAccessSubmissionAdminView,
} from "../hardening-contract";
import { EARLY_ACCESS_INTERNAL_RECIPIENT } from "../hardening-contract";

/**
 * The row as it is stored: the contract's durable record plus the operational
 * state the admin projection reads.
 */
export type ProofSubmissionRow = EarlyAccessProofSubmissionRecord &
  Readonly<{
    /** Server-derived ownership handle. Never read from a request body. */
    customerRef: string;
    internalEmailAcceptance: EarlyAccessInternalEmailAcceptance;
    /** Provider custody reference. Internal only, never customer-facing. */
    providerMessageId: string | null;
    /** A coded reason for an operator. Never a provider error object. */
    lastError: string | null;
    /** Last state change, so reconciliation can find stale rows by age. */
    updatedAt: string;
    /** Send attempts, so a retry storm is visible rather than inferred. */
    attempts: number;
    /** Set only when a named operator has resolved an `unknown` acceptance. */
    reconciledAt: string | null;
  }>;

/**
 * The one acceptance state from which a fresh provider send must not happen.
 *
 * ONLY `accepted`. `unknown` is deliberately NOT terminal, and that is the
 * subtle decision in this file. The contract records `unknown` as a state a
 * human must reconcile and tells the customer to retry. A customer retry
 * carries the bytes again, so the send CAN be repeated, and repeating it is
 * safe because the identity and therefore the provider idempotency key are
 * identical: if the first attempt really was accepted, the provider drops the
 * duplicate instead of emailing operations twice. Treating `unknown` as
 * terminal would instead leave a customer permanently unable to make their
 * proof arrive.
 */
export function alreadySent(acceptance: EarlyAccessInternalEmailAcceptance): boolean {
  return acceptance === "accepted";
}

/**
 * How long a `not_attempted` row is treated as a send that is still in flight.
 *
 * THE RACE THIS CLOSES. Two requests for the same claim can both pass the
 * atomic claim before either has sent: the first creates the row, the second
 * finds it not yet attempted, and without this check the second would send a
 * second copy of the same attachment. Inside the lease the second caller does
 * not send.
 *
 * WHY THE LEASE EXPIRES AT ALL. A process that dies mid-send would otherwise
 * leave the row `not_attempted` for ever and no retry could ever deliver the
 * proof. After the lease a later attempt does send, and the deterministic
 * provider idempotency key is what makes that takeover safe.
 *
 * Sixty seconds is comfortably longer than the send timeout, so a takeover can
 * only happen once the original attempt has certainly stopped running.
 */
export const PROOF_SEND_LEASE_MS = 60_000;

export function sendLeaseHeld(row: ProofSubmissionRow, nowMs: number): boolean {
  if (row.internalEmailAcceptance !== "not_attempted") return false;
  const startedAt = Date.parse(row.updatedAt);
  if (!Number.isFinite(startedAt)) return false;
  // A negative age means clock skew between writers. Treating that as held is
  // the safe direction: it declines to send rather than risk a duplicate.
  return nowMs - startedAt < PROOF_SEND_LEASE_MS;
}

/**
 * True while a named human still has to establish whether the internal email
 * exists. Exposed on the admin projection, never to a customer.
 */
export function reconciliationRequired(row: ProofSubmissionRow): boolean {
  return row.internalEmailAcceptance === "unknown" && row.reconciledAt === null;
}

/**
 * The durable identity of one claim.
 *
 * Prefixed and hashed. The prefix makes the value self describing in an audit
 * trail; the hash keeps the file digest out of the identifier itself, so a
 * submission id is safe in places its inputs are not. The separator is a
 * space, which none of the three inputs can contain (a checkout number, a hex
 * digest and a method code are all separator free), so no combination of
 * values can be made to collide by moving a boundary.
 */
export function proofSubmissionId(input: {
  readonly cartCheckoutNumber: string;
  readonly proofSha256: string;
  readonly method: string;
}): string {
  const digest = createHash("sha256")
    .update([input.cartCheckoutNumber, input.proofSha256, input.method].join(" "))
    .digest("hex");
  return `eaps_${digest.slice(0, 40)}`;
}

/**
 * The provider idempotency key for the internal email of one submission.
 *
 * Derived from the submission identity, not equal to it, so a value that leaks
 * from provider logs does not name a row in our store.
 */
export function proofProviderIdempotencyKey(submissionId: string): string {
  return `ea-proof-${createHash("sha256").update(submissionId).digest("hex").slice(0, 48)}`;
}

/**
 * Build the row that is written BEFORE any send is attempted.
 *
 * Constructed here, once, so every store implementation agrees on the initial
 * state and no adapter can invent a row that starts as accepted.
 */
export function pendingSubmission(input: {
  readonly cartCheckoutNumber: string;
  readonly customerRef: string;
  readonly memberId: string;
  readonly proofSha256: string;
  readonly filename: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly method: EarlyAccessProofMethodSnapshot;
  readonly packageVersion: string;
  readonly at: string;
}): ProofSubmissionRow {
  return Object.freeze({
    submissionId: proofSubmissionId({
      cartCheckoutNumber: input.cartCheckoutNumber,
      proofSha256: input.proofSha256,
      method: input.method.code,
    }),
    cartCheckoutNumber: input.cartCheckoutNumber,
    memberId: input.memberId,
    customerRef: input.customerRef,
    method: input.method,
    filename: input.filename,
    contentType: input.contentType,
    byteSize: input.byteSize,
    proofSha256: input.proofSha256,
    packageVersion: input.packageVersion,
    createdAt: input.at,
    internalEmailAcceptance: "not_attempted" as const,
    providerMessageId: null,
    lastError: null,
    updatedAt: input.at,
    attempts: 0,
    reconciledAt: null,
  });
}

/**
 * The admin projection, in the contract's shape.
 *
 * Built from named fields rather than spread, so a field added to the row is
 * invisible to operators until somebody puts it here deliberately.
 */
export function submissionAdminView(row: ProofSubmissionRow): EarlyAccessSubmissionAdminView {
  return Object.freeze({
    submissionId: row.submissionId,
    cartCheckoutNumber: row.cartCheckoutNumber,
    memberId: row.memberId,
    method: row.method,
    filename: row.filename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    proofSha256: row.proofSha256,
    internalRecipient: EARLY_ACCESS_INTERNAL_RECIPIENT,
    internalEmailAcceptance: row.internalEmailAcceptance,
    providerMessageId: row.providerMessageId,
    lastError: row.lastError,
    reconciliationRequired: reconciliationRequired(row),
    createdAt: row.createdAt,
  });
}

export type ProofSubmissionClaim =
  /** This caller created the row and owns the send. */
  | Readonly<{ claimed: true; row: ProofSubmissionRow }>
  /** The row already existed. `row` is the durable truth, not a new one. */
  | Readonly<{ claimed: false; row: ProofSubmissionRow }>;

/**
 * The persistence seam.
 *
 * `claimPending` MUST be atomic: create the row if it does not exist and
 * otherwise return the existing one, in a single statement. A read followed by
 * a write in an adapter reintroduces exactly the double-send race this design
 * removes, so the durable implementation is an insert with an on-conflict
 * return, never a select then an insert.
 */
export interface ProofSubmissionStore {
  claimPending(row: ProofSubmissionRow): Promise<ProofSubmissionClaim>;
  /**
   * Record the outcome of a send. Resolves to the stored row, or null when the
   * write itself failed, which is the unreconciled path.
   */
  recordAcceptance(input: {
    readonly submissionId: string;
    readonly acceptance: EarlyAccessInternalEmailAcceptance;
    readonly providerMessageId: string | null;
    readonly lastError: string | null;
    readonly at: string;
  }): Promise<ProofSubmissionRow | null>;
  byId(submissionId: string): Promise<ProofSubmissionRow | null>;
}
