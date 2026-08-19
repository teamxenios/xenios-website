import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartExternalProof,
  EarlyAccessCartSettlement,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import { checkoutView } from "./model";
import { canonicalTransactionId } from "../hardening-contract";
import { earlyAccessShipByAt } from "@shared/research/early-access-hardening";
import type { EarlyAccessCommissionAccrual } from "../commerce/commission-event";
import type {
  CartCommitResult,
  CartExternalProofCommit,
  CartSettlementCommit,
  CartSettlementCommitInput,
  EarlyAccessHardenedCartSettlement,
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
  private readonly settlements = new Map<string, EarlyAccessHardenedCartSettlement>();
  private readonly transactionIds = new Set<string>();
  private readonly commissionEventsById = new Map<string, EarlyAccessCommissionAccrual>();

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

  /** Every committed checkout, for tests that must assert on durable truth
   * rather than on a response body. Read only; order is insertion order. */
  allCheckouts(): readonly EarlyAccessCartCheckoutRecord[] {
    return Object.freeze(Array.from(this.byNumber.values()));
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
    // Mirrors the partial unique index in migration 61. The in-memory store is
    // what most tests run against, so if it stayed permissive the suite would
    // keep proving a behaviour production no longer has.
    const activeForQuote = Array.from(this.byNumber.values()).find(
      (existing) => existing.quoteId === checkout.quoteId && existing.disposition == null,
    );
    if (activeForQuote !== undefined) {
      return Object.freeze({
        committed: false as const,
        reason: "quote_has_active_checkout" as const,
        checkout: activeForQuote,
      });
    }
    // ONE CUSTOMER INTENT IS ONE ORDER, EVEN ACROSS TWO QUOTES.
    //
    // Migration 61 made a quote unrepeatable. It did not make an INTENT
    // unrepeatable, and re-quoting an unchanged cart is the ordinary way a
    // customer reaches that gap: `intentHash` is derived from the customer,
    // contact, destination and lines, deliberately not from the quote id, so
    // two quotes for one cart carry one intent under two ids and miss both
    // existing guards.
    //
    // Scoped to customerRef as well as intentHash. The hash already binds the
    // customer, but relying on that alone would make this guard depend on a
    // derivation living in another module.
    // Scoped to an UNRESOLVED intent, not to the intent forever. A checkout
    // still awaiting payment is an open obligation, and a second one for the
    // same cart is the duplicate this guard exists to stop. Once that first
    // order is paid, the customer buying the same cart again is an ordinary
    // repeat purchase and must be allowed: keying on the intent alone would
    // have made a returning customer unable to reorder anything they had ever
    // bought before.
    const activeForIntent = Array.from(this.byNumber.values()).find(
      (existing) =>
        existing.customerRef === checkout.customerRef &&
        existing.intentHash === checkout.intentHash &&
        existing.disposition == null &&
        existing.paymentState === "awaiting_payment",
    );
    if (activeForIntent !== undefined) {
      return Object.freeze({
        committed: false as const,
        reason: "intent_has_active_checkout" as const,
        checkout: activeForIntent,
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
    confirmedFundsReceived: true;
    confirmedAmountAndReference: true;
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
    // `canonicalTransactionId` returns null for an id with too little substance
    // to BE an identity, rather than canonicalizing it into something that could
    // collide with an unrelated payment. Refuse it here: settling on an
    // identifier we cannot uniquely key would defeat the whole guard.
    const canonicalId = canonicalTransactionId(input.externalTransactionId);
    if (canonicalId === null) {
      return Object.freeze({
        committed: false as const,
        reason: "input_invalid" as const,
        settlement: null,
      });
    }
    if (this.transactionIds.has(canonicalId)) {
      return Object.freeze({
        committed: false as const,
        reason: "transaction_id_duplicate_canonical" as const,
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
    const shipByAt = earlyAccessShipByAt(input.at);
    if (shipByAt === null) {
      return Object.freeze({ committed: false as const, reason: "input_invalid" as const, settlement: null });
    }
    if (!input.confirmedFundsReceived || !input.confirmedAmountAndReference) {
      return Object.freeze({
        committed: false as const,
        reason: "admin_confirmation_missing" as const,
        settlement: null,
      });
    }
    if (input.checkout.disposition != null) {
      return Object.freeze({
        committed: false as const,
        reason: "checkout_superseded" as const,
        settlement: null,
      });
    }
    const settlement: EarlyAccessCartSettlement & Readonly<{
      paymentVerifiedAt: string;
      shipByAt: string;
    }> = Object.freeze({
      cartCheckoutNumber: input.checkout.cartCheckoutNumber,
      externalTransactionId: input.externalTransactionId,
      reviewedEvidenceRef: input.evidenceRef,
      verifiedAmountCents: input.verifiedAmountCents,
      verifiedCurrency: input.verifiedCurrency,
      settledAt: input.at,
      settledBy: input.actorId,
      paymentVerifiedAt: input.at,
      shipByAt,
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
    this.transactionIds.add(canonicalId);
    this.byNumber.set(
      input.checkout.cartCheckoutNumber,
      Object.freeze({ ...input.checkout, paymentState: "payment_verified" as const }),
    );
    return Object.freeze({ committed: true as const, settlement });
  }

  /**
   * The atomic settlement-plus-commission door, mirroring the candidate RPC:
   * the accrual is appended ONLY on the commit that genuinely settled the
   * checkout, so a replay (`already_settled`) and every refusal write nothing.
   * The suite runs mostly against this store, so if it stayed permissive the
   * tests would keep proving a double-accrual production refuses.
   */
  async commitSettlementWithCommission(
    input: CartSettlementCommitInput & Readonly<{ commission: EarlyAccessCommissionAccrual }>,
  ): Promise<CartSettlementCommit> {
    const committed = await this.commitSettlement(input);
    if (committed.committed) {
      // Append-only ledger: one accrual per checkout, keyed by its derived id.
      // The guard is unreachable while commitSettlement enforces one
      // settlement per checkout, and stays anyway: two guards drift less.
      if (!this.commissionEventsById.has(input.commission.accrualId)) {
        this.commissionEventsById.set(input.commission.accrualId, input.commission);
      }
    }
    return committed;
  }

  /** Every accrued commission, for tests asserting on durable money truth. */
  commissionEvents(): readonly EarlyAccessCommissionAccrual[] {
    return Object.freeze(Array.from(this.commissionEventsById.values()));
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
        paymentVerifiedAt: settlement?.paymentVerifiedAt ?? null,
      }),
      receipt: settlement?.receipt ?? null,
      fulfilment: Object.freeze({
        released: settlement !== null,
        childOrders: settlement?.childReleases ?? Object.freeze([]),
        paymentVerifiedAt: settlement?.paymentVerifiedAt ?? null,
        shipByAt: settlement?.shipByAt ?? null,
      }),
    });
  }
}
