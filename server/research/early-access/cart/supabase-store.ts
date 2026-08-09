import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartExternalProof,
  EarlyAccessCartSettlement,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import {
  EarlyAccessPersistenceError,
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "../persistence/executor";
import type {
  CartCommitResult,
  CartExternalProofCommit,
  CartSettlementCommit,
  EarlyAccessCartQuoteRecord,
  EarlyAccessCartStorePorts,
} from "./ports";

const RPC = Object.freeze({
  putQuote: "research_early_access_put_cart_quote",
  quote: "research_early_access_cart_quote_record",
  checkoutByKey: "research_early_access_cart_checkout_for_key",
  checkoutByNumber: "research_early_access_cart_checkout_for_number",
  commitCheckout: "research_early_access_commit_cart_checkout",
  recordProof: "research_early_access_record_cart_external_proof",
  proofs: "research_early_access_cart_external_proofs",
  settlement: "research_early_access_cart_settlement",
  commitSettlement: "research_early_access_commit_cart_settlement",
  status: "research_early_access_cart_status",
});

const CHECKOUT_REASONS = [
  "idempotency_key_taken",
  "quote_has_active_checkout",
  "checkout_number_taken",
  "child_order_number_taken",
] as const;
const PROOF_REASONS = ["checkout_unknown", "evidence_ref_taken"] as const;
const SETTLEMENT_REASONS = [
  "already_settled",
  "transaction_id_used",
  "checkout_unknown",
  "evidence_missing",
  "amount_mismatch",
] as const;

function isOneOf<T extends readonly string[]>(value: unknown, set: T): value is T[number] {
  return typeof value === "string" && (set as readonly string[]).includes(value);
}

function nullableObject(fn: string, value: unknown): Record<string, unknown> | null {
  return value === null || value === undefined ? null : expectObject(fn, value);
}

/**
 * Durable cart store for production.
 *
 * Every call is one reviewed service-role RPC. The browser receives none of
 * these table/RPC privileges, and production composition must inject this
 * explicitly when RESEARCH_EARLY_ACCESS_CART_ENABLED is true.
 */
export class SupabaseEarlyAccessCartStore implements EarlyAccessCartStorePorts {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async put(record: EarlyAccessCartQuoteRecord): Promise<void> {
    const result = expectObject(
      RPC.putQuote,
      await runEarlyAccessCall(this.query, {
        fn: RPC.putQuote,
        args: {
          p_quote_id: record.publicQuote.quoteId,
          p_customer_ref: record.customerRef,
          p_intent_hash: record.publicQuote.intentHash,
          p_quote_hash: record.quoteHash,
          p_record: record,
          p_quoted_at: record.publicQuote.quotedAt,
          p_expires_at: record.publicQuote.expiresAt,
        },
      }),
    );
    if (result.stored !== true && result.replayed !== true) {
      throw new EarlyAccessPersistenceError(RPC.putQuote);
    }
  }

  async get(quoteId: string): Promise<EarlyAccessCartQuoteRecord | null> {
    const raw = nullableObject(
      RPC.quote,
      await runEarlyAccessCall(this.query, {
        fn: RPC.quote,
        args: { p_quote_id: quoteId },
      }),
    );
    return raw === null ? null : (Object.freeze(raw) as unknown as EarlyAccessCartQuoteRecord);
  }

  async byIdempotencyKey(key: string): Promise<EarlyAccessCartCheckoutRecord | null> {
    const raw = nullableObject(
      RPC.checkoutByKey,
      await runEarlyAccessCall(this.query, {
        fn: RPC.checkoutByKey,
        args: { p_idempotency_key: key },
      }),
    );
    return raw === null ? null : (Object.freeze(raw) as unknown as EarlyAccessCartCheckoutRecord);
  }

  async byCheckoutNumber(checkoutNumber: string): Promise<EarlyAccessCartCheckoutRecord | null> {
    const raw = nullableObject(
      RPC.checkoutByNumber,
      await runEarlyAccessCall(this.query, {
        fn: RPC.checkoutByNumber,
        args: { p_checkout_number: checkoutNumber },
      }),
    );
    return raw === null ? null : (Object.freeze(raw) as unknown as EarlyAccessCartCheckoutRecord);
  }

  async commit(checkout: EarlyAccessCartCheckoutRecord): Promise<CartCommitResult> {
    const raw = expectObject(
      RPC.commitCheckout,
      await runEarlyAccessCall(this.query, {
        fn: RPC.commitCheckout,
        args: {
          p_checkout: checkout,
          p_items: checkout.children.map((child, lineIndex) => ({ ...child, lineIndex })),
          p_invoice: checkout.invoice,
          p_idempotency_key: checkout.idempotencyKey,
          p_at: checkout.placedAt,
        },
      }),
    );
    const record = nullableObject(RPC.commitCheckout, raw.record);
    if (raw.committed === true) {
      return Object.freeze({ committed: true as const, checkout });
    }
    if (!isOneOf(raw.reason, CHECKOUT_REASONS)) {
      throw new EarlyAccessPersistenceError(RPC.commitCheckout);
    }
    return Object.freeze({
      committed: false as const,
      reason: raw.reason,
      checkout:
        record === null ? null : (Object.freeze(record) as unknown as EarlyAccessCartCheckoutRecord),
    });
  }

  async recordExternalProof(proof: EarlyAccessCartExternalProof): Promise<CartExternalProofCommit> {
    const raw = expectObject(
      RPC.recordProof,
      await runEarlyAccessCall(this.query, {
        fn: RPC.recordProof,
        args: { p_proof: proof },
      }),
    );
    const saved = nullableObject(RPC.recordProof, raw.proof);
    if (raw.committed === true && saved !== null) {
      return Object.freeze({
        committed: true as const,
        proof: Object.freeze(saved) as unknown as EarlyAccessCartExternalProof,
      });
    }
    if (!isOneOf(raw.reason, PROOF_REASONS)) {
      throw new EarlyAccessPersistenceError(RPC.recordProof);
    }
    return Object.freeze({
      committed: false as const,
      reason: raw.reason,
      proof:
        saved === null ? null : (Object.freeze(saved) as unknown as EarlyAccessCartExternalProof),
    });
  }

  async externalProofs(checkoutNumber: string): Promise<readonly EarlyAccessCartExternalProof[]> {
    const raw = expectArray(
      RPC.proofs,
      await runEarlyAccessCall(this.query, {
        fn: RPC.proofs,
        args: { p_checkout_number: checkoutNumber },
      }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(expectObject(RPC.proofs, entry)) as unknown as EarlyAccessCartExternalProof,
      ),
    );
  }

  async settlement(checkoutNumber: string): Promise<EarlyAccessCartSettlement | null> {
    const raw = nullableObject(
      RPC.settlement,
      await runEarlyAccessCall(this.query, {
        fn: RPC.settlement,
        args: { p_checkout_number: checkoutNumber },
      }),
    );
    return raw === null ? null : (Object.freeze(raw) as unknown as EarlyAccessCartSettlement);
  }

  /**
   * KNOWN GAP, NAMED RATHER THAN PAPERED OVER.
   *
   * `canonicalTransactionId` is accepted here and is NOT yet passed to the RPC,
   * because the deployed function's signature has no parameter for it and its
   * duplicate check still compares `external_transaction_id` raw to raw. Adding
   * the parameter, the column and the unique index on it is migration 62's
   * work, recorded as `EARLY_ACCESS_SETTLEMENT_NEEDS_CANONICAL_TXN_COLUMN`.
   *
   * Until that lands, canonical uniqueness holds at the service boundary and in
   * the in-memory store but NOT in the database, so a caller reaching the RPC
   * directly could still settle two spellings of one payment. Passing the
   * canonical value in place of the raw one would close it today at the cost of
   * destroying the operator's reconciliation view, which is the wrong trade.
   * This is a gap to close, not a gap to hide.
   */
  async commitSettlement(input: {
    checkout: EarlyAccessCartCheckoutRecord;
    evidenceRef: string;
    externalTransactionId: string;
    canonicalTransactionId: string;
    verifiedAmountCents: number;
    verifiedCurrency: "USD";
    actorId: string;
    at: string;
  }): Promise<CartSettlementCommit> {
    const raw = expectObject(
      RPC.commitSettlement,
      await runEarlyAccessCall(this.query, {
        fn: RPC.commitSettlement,
        args: {
          p_checkout_number: input.checkout.cartCheckoutNumber,
          p_external_transaction_id: input.externalTransactionId,
          p_evidence_ref: input.evidenceRef,
          p_verified_amount_cents: input.verifiedAmountCents,
          p_verified_currency: input.verifiedCurrency,
          p_actor_id: input.actorId,
          p_at: input.at,
        },
      }),
    );
    const settlement = nullableObject(RPC.commitSettlement, raw.settlement);
    if (raw.committed === true && settlement !== null) {
      return Object.freeze({
        committed: true as const,
        settlement: Object.freeze(settlement) as unknown as EarlyAccessCartSettlement,
      });
    }
    if (!isOneOf(raw.reason, SETTLEMENT_REASONS)) {
      throw new EarlyAccessPersistenceError(RPC.commitSettlement);
    }
    if (raw.reason === "already_settled") {
      if (settlement === null) {
        // The RPC says this checkout is already settled and cannot hand back
        // the settlement. Do NOT report that as a benign replay: the admin
        // route answers `already_settled` with paid, receiptIssued and
        // supplierReleased all true, so a null settlement would assert three
        // facts the database just failed to show. An inconsistent durable
        // state is an error, not a success with a missing field.
        throw new EarlyAccessPersistenceError(RPC.commitSettlement);
      }
      return Object.freeze({
        committed: false as const,
        reason: "already_settled" as const,
        settlement: Object.freeze(settlement) as unknown as EarlyAccessCartSettlement,
      });
    }
    // Every remaining reason genuinely carries no settlement, which is what
    // the CartSettlementCommit union states. The narrowing above is what makes
    // that true rather than merely asserted.
    return Object.freeze({ committed: false as const, reason: raw.reason, settlement: null });
  }

  async status(checkoutNumber: string): Promise<EarlyAccessCartStatus | null> {
    const raw = nullableObject(
      RPC.status,
      await runEarlyAccessCall(this.query, {
        fn: RPC.status,
        args: { p_checkout_number: checkoutNumber },
      }),
    );
    return raw === null ? null : (Object.freeze(raw) as unknown as EarlyAccessCartStatus);
  }
}
