import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartContact,
  EarlyAccessCartExternalProof,
  EarlyAccessCartItemInput,
  EarlyAccessCartLineFailure,
  EarlyAccessCartQuote,
  EarlyAccessCartReceipt,
  EarlyAccessCartSettlement,
  EarlyAccessCartShipping,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";

export type CartCustomer = Readonly<{
  customerRef: string;
  aliases?: readonly string[];
}>;

export type CartCatalogUnit = Readonly<{
  productId: string;
  variantId: string;
  displayName: string;
  strength: string;
  sku: string;
  purchasable: boolean;
  availability: string;
  priceCents: number | null;
  currency: string;
  quantityLimit: number | null;
  supplierReady: boolean;
}>;

export type CartReleaseDecision =
  | Readonly<{
      released: true;
      priceCents: number;
      currency: "USD";
      promotion: Readonly<{
        promotionId: string | null;
        version: string | null;
        label: string | null;
        discountCents: number;
      }>;
    }>
  | Readonly<{ released: false; code: EarlyAccessCartLineFailure }>;

export type CartSupplierRoute = Readonly<{
  supplierId: string;
  supplierSku: string;
}>;

export interface EarlyAccessCartCatalogPort {
  units(nowMs: number, customer: CartCustomer): Promise<readonly CartCatalogUnit[]>;
}

export interface EarlyAccessCartReleasePort {
  /**
   * `customer` is required, and is the reason this signature changed. The
   * release decision reads the SAME projection the shelf does, and that
   * projection derives its audience from the caller, so deciding without one
   * refuses everything. Making it a parameter rather than an optional means a
   * future implementation cannot forget it and silently hold the whole cart.
   */
  decide(input: Readonly<{ unit: CartCatalogUnit; quantity: number; nowMs: number; customer: CartCustomer }>): Promise<CartReleaseDecision>;
}

export interface EarlyAccessCartSupplierPort {
  forUnit(productId: string, variantId: string): Promise<CartSupplierRoute | null>;
}

export interface EarlyAccessCartShippingPort {
  serves(destination: EarlyAccessCartShipping): Promise<boolean>;
  /** One order-level shipping amount. Never added per child order. */
  quote(destination: EarlyAccessCartShipping): Promise<Readonly<{ currency: "USD"; shippingCents: number }>>;
}

export interface EarlyAccessCartAgreementPort {
  accepted(customerRef: string): Promise<boolean>;
}

export interface EarlyAccessCartAuditPort {
  record(event: Readonly<{ event: string; actor: string; at: string; detail: Record<string, unknown> }>): Promise<void>;
}

export interface EarlyAccessCartAttributionPort {
  snapshot(customerRef: string, nowMs: number): Promise<EarlyAccessCartCheckoutRecord["attribution"]>;
}

export type EarlyAccessCartQuoteRecord = Readonly<{
  publicQuote: EarlyAccessCartQuote;
  customerRef: string;
  quoteHash: string;
  /** Private fields never returned by the quote endpoint. */
  contact: EarlyAccessCartContact;
  shipTo: EarlyAccessCartShipping;
  items: readonly EarlyAccessCartItemInput[];
}>;

export interface EarlyAccessCartQuoteStore {
  put(record: EarlyAccessCartQuoteRecord): Promise<void>;
  get(quoteId: string): Promise<EarlyAccessCartQuoteRecord | null>;
}

export type CartCommitResult =
  | Readonly<{ committed: true; checkout: EarlyAccessCartCheckoutRecord }>
  | Readonly<{
      committed: false;
      reason:
        | "idempotency_key_taken"
        // The quote already has an ACTIVE (not superseded) checkout. A fresh
        // idempotency key does not buy the same cart twice: `checkout` carries
        // the existing order so the caller can replay it.
        | "quote_has_active_checkout"
        | "intent_has_active_checkout"
        | "checkout_number_taken"
        | "child_order_number_taken";
      checkout: EarlyAccessCartCheckoutRecord | null;
    }>;

export interface EarlyAccessCartCheckoutStore {
  byIdempotencyKey(key: string): Promise<EarlyAccessCartCheckoutRecord | null>;
  byCheckoutNumber(checkoutNumber: string): Promise<EarlyAccessCartCheckoutRecord | null>;
  commit(checkout: EarlyAccessCartCheckoutRecord): Promise<CartCommitResult>;
}

export type CartExternalProofCommit =
  | Readonly<{ committed: true; proof: EarlyAccessCartExternalProof }>
  | Readonly<{ committed: false; reason: "checkout_unknown" | "evidence_ref_taken"; proof: EarlyAccessCartExternalProof | null }>;

export type EarlyAccessHardenedCartSettlement = EarlyAccessCartSettlement & Readonly<{
  /** Database-authoritative money time returned by the M62 settlement RPC. */
  paymentVerifiedAt?: string;
  /** Exactly paymentVerifiedAt + 72 hours, computed in the same transaction. */
  shipByAt?: string;
}>;

export type CartSettlementCommit =
  | Readonly<{ committed: true; settlement: EarlyAccessHardenedCartSettlement }>
  | Readonly<{ committed: false; reason: "already_settled"; settlement: EarlyAccessHardenedCartSettlement }>
  | Readonly<{
      committed: false;
      reason:
        | "transaction_id_used"
        | "checkout_unknown"
        | "evidence_missing"
        | "amount_mismatch"
        | "agreements_not_current"
        | "submission_missing"
        | "submission_unreconciled"
        | "checkout_superseded"
        | "admin_confirmation_missing"
        | "transaction_id_duplicate_canonical"
        | "input_invalid";
      settlement: null;
    }>;

export interface EarlyAccessCartSettlementStore {
  recordExternalProof(proof: EarlyAccessCartExternalProof): Promise<CartExternalProofCommit>;
  externalProofs(checkoutNumber: string): Promise<readonly EarlyAccessCartExternalProof[]>;
  settlement(checkoutNumber: string): Promise<EarlyAccessCartSettlement | null>;
  /**
   * Commit a settlement.
   *
   * `externalTransactionId` is what the operator typed and is stored verbatim
   * for reconciliation. `canonicalTransactionId` is the identity: uniqueness is
   * decided on it, so two spellings of one payment cannot settle two checkouts.
   * An implementation that enforces uniqueness on the raw value is wrong, and
   * that was the defect this field exists to close.
   */
  commitSettlement(input: Readonly<{
    checkout: EarlyAccessCartCheckoutRecord;
    evidenceRef: string;
    externalTransactionId: string;
    canonicalTransactionId: string;
    verifiedAmountCents: number;
    verifiedCurrency: "USD";
    actorId: string;
    confirmedFundsReceived: true;
    confirmedAmountAndReference: true;
    at: string;
  }>): Promise<CartSettlementCommit>;
  status(checkoutNumber: string): Promise<EarlyAccessCartStatus | null>;
}

export type EarlyAccessCartStorePorts =
  & EarlyAccessCartQuoteStore
  & EarlyAccessCartCheckoutStore
  & EarlyAccessCartSettlementStore;

export interface EarlyAccessCartReceiptOutboxPort {
  write(receipt: EarlyAccessCartReceipt): Promise<void>;
}
