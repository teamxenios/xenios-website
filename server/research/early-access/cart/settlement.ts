import type {
  EarlyAccessCartExternalProof,
  EarlyAccessCartSettlement,
} from "@shared/research/early-access-cart";
import {
  isCartCheckoutNumber,
  isExternalEvidenceRef,
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
  evidenceRef: string;
  externalTransactionId: string;
  verifiedAmountCents: number;
  verifiedCurrency: "USD";
  actorId: string;
  at: string;
}>;

export type EarlyAccessCartSettlementDeps = Readonly<{
  checkouts: EarlyAccessCartCheckoutStore;
  settlements: EarlyAccessCartSettlementStore;
  evidenceRef?: () => string;
}>;

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
    !isExternalEvidenceRef(input.evidenceRef) ||
    !SAFE_TRANSACTION.test(input.externalTransactionId.trim()) ||
    !Number.isSafeInteger(input.verifiedAmountCents) ||
    input.verifiedAmountCents <= 0 ||
    input.verifiedCurrency !== "USD" ||
    !SAFE_ACTOR.test(input.actorId) ||
    !validInstant(input.at)
  ) {
    return Object.freeze({
      committed: false as const,
      reason: "input_invalid" as const,
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

  const proofs = await deps.settlements.externalProofs(input.cartCheckoutNumber);
  if (!proofs.some((proof) => proof.evidenceRef === input.evidenceRef)) {
    return Object.freeze({
      committed: false as const,
      reason: "evidence_missing" as const,
      settlement: null,
    });
  }
  if (
    input.verifiedAmountCents !== checkout.invoice.payableTotalCents ||
    input.verifiedCurrency !== checkout.invoice.currency
  ) {
    return Object.freeze({
      committed: false as const,
      reason: "amount_mismatch" as const,
      settlement: null,
    });
  }

  return deps.settlements.commitSettlement({
    checkout,
    evidenceRef: input.evidenceRef,
    externalTransactionId: input.externalTransactionId.trim(),
    verifiedAmountCents: input.verifiedAmountCents,
    verifiedCurrency: input.verifiedCurrency,
    actorId: input.actorId,
    at: input.at,
  });
}

export function settlementIsApplied(
  result: CartSettlementCommit,
): result is Readonly<{ committed: true; settlement: EarlyAccessCartSettlement }> {
  return result.committed === true;
}
