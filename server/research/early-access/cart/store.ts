import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartExternalProof,
  EarlyAccessCartSettlement,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import { checkoutView } from "./model";
import type {
  CartCommitResult,
  CartExternalProofCommit,
  CartSettlementCommit,
  EarlyAccessCartCheckoutStore,
  EarlyAccessCartQuoteRecord,
  EarlyAccessCartQuoteStore,
  EarlyAccessCartSettlementStore,
} from "./ports";

/**
 * Test/local store only. Production must inject a durable implementation and
 * cart/store-composition.ts must refuse any implicit memory fallback.
 */
export class InMemoryEarlyAccessCartStore
  implements EarlyAccessCartQuoteStore, EarlyAccessCartCheckoutStore, EarlyAccessCartSettlementStore
{
  private readonly quotes = new Map<string, EarlyAccessCartQuoteRecord>();
  private readonly byKey = new Map<string, EarlyAccessCartCheckoutRecord>();
  private readonly byNumber = new Map<string, EarlyAccessCartCheckoutRecord>();
  private readonly childOrderNumbers = new Set<string>();
  private readonly proofByRef = new Map<string, EarlyAccessCartExternalProof>();
  private readonly proofRefsByCheckout = new Map<string, string[]>();
  private readonly settlements = new Map<string, EarlyAccessCartSettlement>();
  private readonly transactionIds = new Set<string>();

  async put(record: EarlyAccessCartQuoteRecord): Promise<void> {
    this.quotes.set(record.publicQuote.quoteId, record);
  }

  async get(quoteId: string): Promise<EarlyAccessCartQuoteRecord | null> {
    return this.quotes.get(quoteId) ?? null;
  }

  async byIdempotencyKey(key: string): Promise<EarlyAccessCartCheckoutRecord | null> {
    return this.byKey.get(key) ?? null;
  }

  async byCheckoutNumber(checkoutNumber: string): Promise<EarlyAccessCartCheckoutRecord | null> {
    return this.byNumber.get(checkoutNumber) ?? null;
  }

  async commit(checkout: EarlyAccessCartCheckoutRecord): Promise<CartCommitResult> {
    const priorKey = this.byKey.get(checkout.idempotencyKey);
    if (priorKey) {
      return Object.freeze({
        committed: false as const,
        reason: "idempotency_key_taken" as const,
        checkout: priorKey,
      });
    }
    const priorNumber = this.byNumber.get(checkout.cartCheckoutNumber);
    if (priorNumber) {
      return Object.freeze({
        committed: false as const,
        reason: "checkout_number_taken" as const,
        checkout: priorNumber,
      });
    }
    for (const child of checkout.children) {
      if (this.childOrderNumbers.has(child.orderNumber)) {
        return Object.freeze({
          committed: false as const,
          reason: "child_order_number_taken" as const,
          checkout: null,
        });
      }
    }
    this.byKey.set(checkout.idempotencyKey, checkout);
    this.byNumber.set(checkout.cartCheckoutNumber, checkout);
    for (const child of checkout.children) this.childOrderNumbers.add(child.orderNumber);
    return Object.freeze({ committed: true as const, checkout });
  }

  async recordExternalProof(proof: EarlyAccessCartExternalProof): Promise<CartExternalProofCommit> {
    if (!this.byNumber.has(proof.cartCheckoutNumber)) {
      return Object.freeze({
        committed: false as const,
        reason: "checkout_unknown" as const,
        proof: null,
      });
    }
    const prior = this.proofByRef.get(proof.evidenceRef);
    if (prior) {
      return Object.freeze({
        committed: false as const,
        reason: "evidence_ref_taken" as const,
        proof: prior,
      });
    }
    this.proofByRef.set(proof.evidenceRef, proof);
    const refs = this.proofRefsByCheckout.get(proof.cartCheckoutNumber) ?? [];
    this.proofRefsByCheckout.set(proof.cartCheckoutNumber, [...refs, proof.evidenceRef]);
    const checkout = this.byNumber.get(proof.cartCheckoutNumber)!;
    this.byNumber.set(
      proof.cartCheckoutNumber,
      Object.freeze({ ...checkout, paymentState: "under_review" as const }),
    );
    return Object.freeze({ committed: true as const, proof });
  }

  async externalProofs(checkoutNumber: string): Promise<readonly EarlyAccessCartExternalProof[]> {
    return Object.freeze(
      (this.proofRefsByCheckout.get(checkoutNumber) ?? [])
        .map((ref) => this.proofByRef.get(ref))
        .filter((proof): proof is EarlyAccessCartExternalProof => proof !== undefined),
    );
  }

  async settlement(checkoutNumber: string): Promise<EarlyAccessCartSettlement | null> {
    return this.settlements.get(checkoutNumber) ?? null;
  }

  async commitSettlement(input: {
    checkout: EarlyAccessCartCheckoutRecord;
    evidenceRef: string;
    externalTransactionId: string;
    verifiedAmountCents: number;
    verifiedCurrency: "USD";
    actorId: string;
    at: string;
  }): Promise<CartSettlementCommit> {
    const prior = this.settlements.get(input.checkout.cartCheckoutNumber);
    if (prior) {
      return Object.freeze({
        committed: false as const,
        reason: "already_settled" as const,
        settlement: prior,
      });
    }
    if (this.transactionIds.has(input.externalTransactionId)) {
      return Object.freeze({
        committed: false as const,
        reason: "transaction_id_used" as const,
        settlement: null,
      });
    }
    if (!this.byNumber.has(input.checkout.cartCheckoutNumber)) {
      return Object.freeze({
        committed: false as const,
        reason: "checkout_unknown" as const,
        settlement: null,
      });
    }
    const proof = this.proofByRef.get(input.evidenceRef);
    if (!proof || proof.cartCheckoutNumber !== input.checkout.cartCheckoutNumber) {
      return Object.freeze({
        committed: false as const,
        reason: "evidence_missing" as const,
        settlement: null,
      });
    }
    if (
      input.verifiedCurrency !== input.checkout.invoice.currency ||
      input.verifiedAmountCents !== input.checkout.invoice.payableTotalCents
    ) {
      return Object.freeze({
        committed: false as const,
        reason: "amount_mismatch" as const,
        settlement: null,
      });
    }
    const settlement: EarlyAccessCartSettlement = Object.freeze({
      cartCheckoutNumber: input.checkout.cartCheckoutNumber,
      externalTransactionId: input.externalTransactionId,
      reviewedEvidenceRef: input.evidenceRef,
      verifiedAmountCents: input.verifiedAmountCents,
      verifiedCurrency: input.verifiedCurrency,
      settledAt: input.at,
      settledBy: input.actorId,
      receipt: Object.freeze({
        receiptId: `xea-cart-receipt:${input.checkout.cartCheckoutNumber}`,
        cartCheckoutNumber: input.checkout.cartCheckoutNumber,
        invoiceNumber: input.checkout.invoice.invoiceNumber,
        paymentReference: input.checkout.invoice.paymentReference,
        verifiedAmountCents: input.verifiedAmountCents,
        currency: input.verifiedCurrency,
        issuedAt: input.at,
      }),
      childReleases: Object.freeze(
        input.checkout.children.map((child) =>
          Object.freeze({
            releaseId: `xea-cart-release:${child.orderNumber}`,
            cartCheckoutNumber: input.checkout.cartCheckoutNumber,
            orderNumber: child.orderNumber,
            supplierId: child.supplierId,
            supplierSku: child.supplierSku,
            quantity: child.quantity,
            releasedAt: input.at,
            shippedAt: null,
            tracking: Object.freeze([]),
          }),
        ),
      ),
    });
    this.settlements.set(input.checkout.cartCheckoutNumber, settlement);
    this.transactionIds.add(input.externalTransactionId);
    this.byNumber.set(
      input.checkout.cartCheckoutNumber,
      Object.freeze({ ...input.checkout, paymentState: "payment_verified" as const }),
    );
    return Object.freeze({ committed: true as const, settlement });
  }

  async status(checkoutNumber: string): Promise<EarlyAccessCartStatus | null> {
    const record = this.byNumber.get(checkoutNumber);
    if (!record) return null;
    const settlement = this.settlements.get(checkoutNumber) ?? null;
    const proofCount = (this.proofRefsByCheckout.get(checkoutNumber) ?? []).length;
    return Object.freeze({
      checkout: checkoutView(record),
      payment: Object.freeze({
        state: record.paymentState,
        paid: settlement !== null,
        externalProofCount: proofCount,
      }),
      receipt: settlement?.receipt ?? null,
      fulfilment: Object.freeze({
        released: settlement !== null,
        childOrders: settlement?.childReleases ?? Object.freeze([]),
      }),
    });
  }
}
