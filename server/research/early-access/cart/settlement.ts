import type {
  EarlyAccessCartExternalProof,
  EarlyAccessCartSettlement,
} from "@shared/research/early-access-cart";
import { createHash } from "node:crypto";
import { canonicalTransactionId } from "../hardening-contract";
import {
  isCartCheckoutNumber,
  newCartEvidenceRef,
} from "./model";
import type {
  CartExternalProofCommit,
  CartSettlementCommit,
  EarlyAccessCartCheckoutStore,
  EarlyAccessCartSettlementStore,
} from "./ports";

const SAFE_ACTOR = /^[A-Za-z0-9@._:+/-]{2,200}$/;
const SAFE_TRANSACTION = /^[A-Za-z0-9][A-Za-z0-9 ._:/+-]{2,199}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_FILENAME = /^[^\u0000\r\n]{1,240}$/;
const SAFE_CONTENT_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+/-]{1,126}$/;

export type EarlyAccessCartProofInput = Readonly<{
  cartCheckoutNumber: string;
  sha256: string;
  filename: string;
  contentType: string;
  byteSize: number;
  provenanceNote: string;
  actorId: string;
  at: string;
}>;

export type EarlyAccessCartSettlementInput = Readonly<{
  cartCheckoutNumber: string;
  externalTransactionId: string;
  confirmedFundsReceived: boolean;
  confirmedAmountAndReference: boolean;
  actorId: string;
  at: string;
}>;

export type EarlyAccessCartSettlementDeps = Readonly<{
  checkouts: EarlyAccessCartCheckoutStore;
  settlements: EarlyAccessCartSettlementStore;
  evidenceRef?: () => string;
  /** Bridges Session 5's accepted transient submission to M60's metadata proof row. */
  submissionEvidence?: EarlyAccessAcceptedSubmissionEvidencePort;
}>;

export type EarlyAccessAcceptedSubmissionEvidence = Readonly<{
  submissionId: string;
  sha256: string;
  filename: string;
  contentType: string;
  byteSize: number;
}>;

export interface EarlyAccessAcceptedSubmissionEvidencePort {
  acceptedForCheckout(checkoutNumber: string): Promise<EarlyAccessAcceptedSubmissionEvidence | null>;
}

function submissionEvidenceRef(submissionId: string): string {
  return `eaext.${createHash("sha256").update("xenios:ea-submission-evidence:v1|").update(submissionId).digest("hex")}`;
}

function validInstant(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

/**
 * Records metadata for proof a named operator actually received off platform.
 * The response says `storedOnPlatform: false`; no upload reservation or signed
 * preview URL is created for an object that does not exist.
 */
export async function recordEarlyAccessCartExternalProof(
  deps: EarlyAccessCartSettlementDeps,
  input: EarlyAccessCartProofInput,
): Promise<CartExternalProofCommit | Readonly<{ committed: false; reason: "input_invalid"; proof: null }>> {
  if (
    !isCartCheckoutNumber(input.cartCheckoutNumber) ||
    !SHA256.test(input.sha256) ||
    !SAFE_FILENAME.test(input.filename) ||
    !SAFE_CONTENT_TYPE.test(input.contentType) ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize <= 0 ||
    input.byteSize > 25_000_000 ||
    input.provenanceNote.trim().length < 8 ||
    input.provenanceNote.trim().length > 1_000 ||
    !SAFE_ACTOR.test(input.actorId) ||
    !validInstant(input.at)
  ) {
    return Object.freeze({ committed: false as const, reason: "input_invalid" as const, proof: null });
  }

  const checkout = await deps.checkouts.byCheckoutNumber(input.cartCheckoutNumber);
  if (checkout === null) {
    return Object.freeze({ committed: false as const, reason: "checkout_unknown" as const, proof: null });
  }

  const proof: EarlyAccessCartExternalProof = Object.freeze({
    evidenceRef: (deps.evidenceRef ?? newCartEvidenceRef)(),
    cartCheckoutNumber: input.cartCheckoutNumber,
    sha256: input.sha256,
    filename: input.filename,
    contentType: input.contentType,
    byteSize: input.byteSize,
    provenanceNote: input.provenanceNote.trim(),
    recordedAt: input.at,
    recordedBy: input.actorId,
    storedOnPlatform: false,
  });
  return deps.settlements.recordExternalProof(proof);
}

/**
 * Named-admin settlement. The durable store owns the atomic transaction that
 * creates the settlement, receipt and every child supplier release exactly
 * once. This service validates the human decision before asking it to commit.
 */
export async function settleEarlyAccessCart(
  deps: EarlyAccessCartSettlementDeps,
  input: EarlyAccessCartSettlementInput,
): Promise<
  | CartSettlementCommit
  | Readonly<{ committed: false; reason: "input_invalid"; settlement: null }>
> {
  if (
    !isCartCheckoutNumber(input.cartCheckoutNumber) ||
    !SAFE_TRANSACTION.test(input.externalTransactionId.trim()) ||
    !SAFE_ACTOR.test(input.actorId) ||
    !validInstant(input.at)
  ) {
    return Object.freeze({
      committed: false as const,
      reason: "input_invalid" as const,
      settlement: null,
    });
  }
  if (!input.confirmedFundsReceived || !input.confirmedAmountAndReference) {
    return Object.freeze({
      committed: false as const,
      reason: "admin_confirmation_missing" as const,
      settlement: null,
    });
  }

  const checkout = await deps.checkouts.byCheckoutNumber(input.cartCheckoutNumber);
  if (checkout === null) {
    return Object.freeze({
      committed: false as const,
      reason: "checkout_unknown" as const,
      settlement: null,
    });
  }
  if (checkout.disposition != null) {
    return Object.freeze({
      committed: false as const,
      reason: "checkout_superseded" as const,
      settlement: null,
    });
  }

  // ONE PAYMENT, ONE IDENTITY.
  //
  // Computed before any durable work, so an id with too little substance to BE
  // an identity is refused rather than canonicalized into something that could
  // collide with an unrelated payment. Uniqueness downstream is decided on this
  // value, never on the raw string: `TX-Canonical-002`, `tx canonical 002` and
  // `TX CANONICAL 002` are one payment, not three.
  const canonicalTxn = canonicalTransactionId(input.externalTransactionId);
  if (canonicalTxn === null) {
    return Object.freeze({
      committed: false as const,
      reason: "input_invalid" as const,
      settlement: null,
    });
  }

  const proofs = await deps.settlements.externalProofs(input.cartCheckoutNumber);
  let proof = [...proofs].sort((left, right) =>
    right.recordedAt.localeCompare(left.recordedAt) ||
    right.evidenceRef.localeCompare(left.evidenceRef)
  )[0];
  if (!proof && deps.submissionEvidence) {
    const submission = await deps.submissionEvidence.acceptedForCheckout(
      input.cartCheckoutNumber,
    );
    if (submission) {
      const candidate: EarlyAccessCartExternalProof = Object.freeze({
        evidenceRef: submissionEvidenceRef(submission.submissionId),
        cartCheckoutNumber: input.cartCheckoutNumber,
        sha256: submission.sha256,
        filename: submission.filename,
        contentType: submission.contentType,
        byteSize: submission.byteSize,
        provenanceNote: `Accepted transient proof submission ${submission.submissionId}`,
        recordedAt: input.at,
        recordedBy: input.actorId,
        storedOnPlatform: false,
      });
      const bridged = await deps.settlements.recordExternalProof(candidate);
      if (bridged.committed) {
        proof = bridged.proof;
      } else if (
        bridged.reason === "evidence_ref_taken" &&
        bridged.proof?.cartCheckoutNumber === input.cartCheckoutNumber
      ) {
        proof = bridged.proof;
      }
    }
  }
  if (!proof) {
    return Object.freeze({
      committed: false as const,
      reason: "evidence_missing" as const,
      settlement: null,
    });
  }
  return deps.settlements.commitSettlement({
    checkout,
    evidenceRef: proof.evidenceRef,
    externalTransactionId: input.externalTransactionId.trim(),
    // The raw id above is what the operator typed and is kept for
    // reconciliation against a bank statement. This is the identity uniqueness
    // is decided on, so two spellings of one payment cannot settle two
    // checkouts. Computed here, at the one service every settlement door goes
    // through, rather than left to each store to remember.
    canonicalTransactionId: canonicalTxn,
    verifiedAmountCents: checkout.invoice.payableTotalCents,
    verifiedCurrency: checkout.invoice.currency,
    actorId: input.actorId,
    confirmedFundsReceived: true,
    confirmedAmountAndReference: true,
    at: input.at,
  });
}

export function settlementIsApplied(
  result: CartSettlementCommit,
): result is Readonly<{ committed: true; settlement: EarlyAccessCartSettlement }> {
  return result.committed === true;
}
