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
import type { EarlyAccessCommissionAccrual } from "../commerce/commission-event";
import type {
  CartCommitResult,
  CartExternalProofCommit,
  CartSettlementCommit,
  CartSettlementCommitInput,
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
  commitSettlementWithCommission: "research_early_access_commit_cart_settlement_with_commission",
  settlementHardening: "research_early_access_cart_settlement_hardening",
  status: "research_early_access_cart_status",
});

const CHECKOUT_REASONS = [
  "idempotency_key_taken",
  "quote_has_active_checkout",
  "intent_has_active_checkout",
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
  "agreements_not_current",
  "submission_missing",
  "submission_unreconciled",
  "checkout_superseded",
  "admin_confirmation_missing",
  "transaction_id_duplicate_canonical",
  "commission_invalid",
  "input_invalid",
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
   * `canonicalTransactionId` is accepted here and is NOT yet passed to the RPC.
   * The deployed M62 wrapper derives the same canonical form itself and keys
   * `research_early_access_cart_transaction_ids.canonical_transaction_id`
   * uniquely on it, so the sole GRANTED settlement door already refuses two
   * spellings of one payment. What the database still lacks is the invariant on
   * the settlements TABLE itself, recorded as
   * `EARLY_ACCESS_SETTLEMENT_NEEDS_CANONICAL_TXN_COLUMN`: a future routine
   * writing `research_early_access_cart_settlements` directly would only be
   * checked raw-to-raw. The founder-gated candidate
   * `supabase/candidates/20260819_research_ea_cart_settlement_canonical_txn.sql`
   * closes that with a stored generated column and a unique index, where no
   * routine can forget to consult it.
   */
  async commitSettlement(input: CartSettlementCommitInput): Promise<CartSettlementCommit> {
    return this.settle(RPC.commitSettlement, input, {});
  }

  /**
   * Settlement AND commission accrual through the candidate RPC, which wraps
   * the deployed M62 settlement function and inserts the commission event in
   * the SAME transaction: both durable or neither.
   *
   * Until the founder applies
   * `supabase/candidates/20260819_research_ea_cart_commission_settlement.sql`,
   * the function is absent and this call throws the named persistence error —
   * a refusal with nothing written, which is exactly the fail-closed behaviour
   * the settlement service documents for an attributed checkout.
   */
  async commitSettlementWithCommission(
    input: CartSettlementCommitInput & Readonly<{ commission: EarlyAccessCommissionAccrual }>,
  ): Promise<CartSettlementCommit> {
    return this.settle(RPC.commitSettlementWithCommission, input, {
      p_commission: input.commission,
    });
  }

  private async settle(
    fn: string,
    input: CartSettlementCommitInput,
    extraArgs: Readonly<Record<string, unknown>>,
  ): Promise<CartSettlementCommit> {
    const raw = expectObject(
      fn,
      await runEarlyAccessCall(this.query, {
        fn,
        args: {
          p_checkout_number: input.checkout.cartCheckoutNumber,
          p_external_transaction_id: input.externalTransactionId,
          p_evidence_ref: input.evidenceRef,
          p_verified_amount_cents: input.verifiedAmountCents,
          p_verified_currency: input.verifiedCurrency,
          p_actor_id: input.actorId,
          p_confirmed_funds_received: input.confirmedFundsReceived,
          p_confirmed_amount_and_reference: input.confirmedAmountAndReference,
          p_at: input.at,
          ...extraArgs,
        },
      }),
    );
    const settlement = nullableObject(fn, raw.settlement);
    if (raw.committed === true && settlement !== null) {
      return Object.freeze({
        committed: true as const,
        settlement: Object.freeze(settlement) as unknown as EarlyAccessCartSettlement,
      });
    }
    if (!isOneOf(raw.reason, SETTLEMENT_REASONS)) {
      throw new EarlyAccessPersistenceError(fn);
    }
    if (raw.reason === "already_settled") {
      if (settlement === null) {
        // The RPC says this checkout is already settled and cannot hand back
        // the settlement. Do NOT report that as a benign replay: the admin
        // route answers `already_settled` with paid, receiptIssued and
        // supplierReleased all true, so a null settlement would assert three
        // facts the database just failed to show. An inconsistent durable
        // state is an error, not a success with a missing field.
        throw new EarlyAccessPersistenceError(fn);
      }
      const hardening = await this.settlementHardening(input.checkout.cartCheckoutNumber);
      return Object.freeze({
        committed: false as const,
        reason: "already_settled" as const,
        settlement: Object.freeze({ ...settlement, ...(hardening ?? {}) }) as unknown as EarlyAccessCartSettlement,
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
    if (raw === null) return null;
    const hardening = await this.settlementHardening(checkoutNumber);
    if (hardening === null) {
      return Object.freeze(raw) as unknown as EarlyAccessCartStatus;
    }
    const payment = nullableObject(RPC.status, raw.payment) ?? {};
    const fulfilment = nullableObject(RPC.status, raw.fulfilment) ?? {};
    return Object.freeze({
      ...raw,
      payment: Object.freeze({
        ...payment,
        paymentVerifiedAt: hardening.paymentVerifiedAt,
      }),
      fulfilment: Object.freeze({
        ...fulfilment,
        paymentVerifiedAt: hardening.paymentVerifiedAt,
        shipByAt: hardening.shipByAt,
      }),
    }) as unknown as EarlyAccessCartStatus;
  }

  private async settlementHardening(checkoutNumber: string): Promise<Record<string, unknown> | null> {
    return nullableObject(
      RPC.settlementHardening,
      await runEarlyAccessCall(this.query, {
        fn: RPC.settlementHardening,
        args: { p_checkout_number: checkoutNumber },
      }),
    );
  }
}
