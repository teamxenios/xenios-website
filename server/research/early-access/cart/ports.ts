import type {
  EarlyAccessCartCheckout,
  EarlyAccessCartContact,
  EarlyAccessCartItemInput,
  EarlyAccessCartLineFailure,
  EarlyAccessCartQuote,
  EarlyAccessCartShipping,
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
  decide(input: Readonly<{ unit: CartCatalogUnit; quantity: number; nowMs: number }>): Promise<CartReleaseDecision>;
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

export type EarlyAccessCartQuoteRecord = Readonly<{
  publicQuote: EarlyAccessCartQuote;
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
  | Readonly<{ committed: true; checkout: EarlyAccessCartCheckout }>
  | Readonly<{
      committed: false;
      reason: "idempotency_key_taken" | "checkout_number_taken" | "child_order_number_taken";
      checkout: EarlyAccessCartCheckout | null;
    }>;

export interface EarlyAccessCartCheckoutStore {
  byIdempotencyKey(key: string): Promise<EarlyAccessCartCheckout | null>;
  byCheckoutNumber(checkoutNumber: string): Promise<EarlyAccessCartCheckout | null>;
  commit(checkout: EarlyAccessCartCheckout): Promise<CartCommitResult>;
}
