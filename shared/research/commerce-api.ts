// xenios research: the wire contract for the commerce, catalog, evidence, and
// distribution lane (G6, G7, G8).
//
// Conventions are inherited from the frozen envelope in
// docs/agent-coordination/blitzscale/API_CONTRACTS.md and are NOT re-invented here:
//
//   success  { ok: true, ...payload }
//   denial   { ok: false, code: "<machine_code>", message?: string }
//
// The UI routes on `code`, never on `message`, so every denial below carries a stable
// machine code and the message stays free to change.
//
// Member-safe rule: a capability is a BOOLEAN to a member. Environment variable names
// and approval counterparties are admin-only and never appear in a member payload.

import type {
  CatalogProduct,
  MemberGoal,
  ProductAvailability,
  ProductLane,
} from "./catalog";
import type {
  OrderState,
  ShippingQuote,
  SubscriptionFrequencyDays,
  SubscriptionState,
} from "./commerce";
import type { CommissionState, PartnerRole, PartnerState } from "./distribution";

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; code: string; message?: string };
export type Api<T> = ApiOk<T> | ApiErr;

/** Every denial code this lane can emit. The UI switches on these. */
export type CommerceDenialCode =
  // inherited from the merged guards, listed so the UI has one place to look
  | "activation_required"
  | "billing_past_due"
  | "membership_inactive"
  | "recovery_session"
  // this lane
  | "capability_disabled"
  | "commerce_disabled"
  | "product_not_found"
  | "product_not_purchasable"
  | "unconfirmed_supplier_facts"
  | "lane_not_purchasable"
  | "quantity_invalid"
  | "insufficient_stock"
  | "cart_empty"
  | "cart_revalidation_failed"
  | "agreement_required"
  | "address_invalid"
  | "state_not_serviceable"
  | "shipping_unavailable"
  | "payment_disabled"
  | "payment_failed"
  | "large_order_review_required"
  | "order_not_found"
  | "order_state_invalid"
  | "subscription_not_found"
  | "subscription_action_invalid"
  | "guide_not_found"
  | "guide_not_published"
  | "partner_not_found"
  | "partner_not_active"
  | "commission_not_visible"
  | "forbidden";

// ---------------------------------------------------------------------------
// G0 capabilities
// ---------------------------------------------------------------------------

/** Member-safe. Boolean only, per the frozen contract. */
export type MemberCapabilityStatus = { enabled: boolean };

export type CapabilitiesResponse = Api<{
  capabilities: Record<string, MemberCapabilityStatus>;
}>;

// ---------------------------------------------------------------------------
// G6 catalog, goals, guides
// ---------------------------------------------------------------------------

/**
 * The member-facing product card.
 *
 * Note what is ABSENT: composition, strength, shelf life, storage, COA. Those are
 * supplier facts, and an unconfirmed supplier fact is never serialized to a member.
 * `priceCents` is nullable because an unconfirmed price is omitted rather than shown.
 */
export interface ProductSummaryDto {
  sku: string;
  slug: string;
  displayName: string;
  lane: ProductLane;
  availability: ProductAvailability;
  purchasable: boolean;
  /** Null whenever the price is not confirmed. The UI must render an honest state. */
  priceCents: number | null;
  goalMappings: MemberGoal[];
  guideState: CatalogProduct["guideState"];
  relatedGuideSlugs: string[];
}

/** The detail view adds only what is safe to add. */
export interface ProductDetailDto extends ProductSummaryDto {
  /** Confirmed facts only. An unconfirmed fact is simply not a key here. */
  confirmedFacts: Partial<Record<"composition" | "strength" | "format", string>>;
  /** Member-visible explanation of why a product cannot be bought right now. */
  unavailableReason: string | null;
  prohibitedClaims: never[];
  faq: Array<{ question: string; answer: string }>;
}

export type ProductsResponse = Api<{ products: ProductSummaryDto[] }>;
export type ProductDetailResponse = Api<{ product: ProductDetailDto }>;

export interface GoalDto {
  slug: string;
  label: string;
  productSkus: string[];
  guideSlugs: string[];
}
export type GoalsResponse = Api<{ goals: GoalDto[] }>;

export interface GuideSummaryDto {
  slug: string;
  title: string;
  status: "published" | "updated" | "in_review" | "in_development" | "coming_soon";
  /** Present only when the Guide is published or updated. */
  publishedAt: string | null;
  relatedProductSkus: string[];
}

export interface GuideDetailDto extends GuideSummaryDto {
  revision: number;
  sections: Array<{ heading: string; body: string }>;
  claims: Array<{ id: string; text: string; grade: string; sourceIds: string[] }>;
  sources: Array<{ id: string; citation: string; url: string | null; verified: boolean }>;
  correctionHistory: Array<{ at: string; note: string }>;
}

export type GuidesResponse = Api<{ guides: GuideSummaryDto[] }>;
export type GuideDetailResponse = Api<{ guide: GuideDetailDto }>;

// ---------------------------------------------------------------------------
// G7 cart, checkout, orders, subscriptions, shipping
// ---------------------------------------------------------------------------

export interface CartLineDto {
  sku: string;
  displayName: string;
  quantity: number;
  purchaseMode: "one_time" | "subscription";
  subscriptionFrequencyDays?: SubscriptionFrequencyDays;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  /** Populated when this specific line is blocking checkout. */
  blockedReason: CommerceDenialCode | null;
}

export interface CartDto {
  lines: CartLineDto[];
  /** Per fulfillment owner, because one order may split into several shipments. */
  shipmentGroups: Array<{ owner: "mitch" | "xenios"; skus: string[] }>;
  subtotalCents: number;
  /** Shipping is charged ONCE per order even across a split. */
  shippingCents: number;
  storeCreditAppliedCents: number;
  estimatedTotalCents: number;
  /** True only when every line and every gate passes. */
  checkoutReady: boolean;
  blockingReasons: CommerceDenialCode[];
  requiredAgreements: string[];
}

export type CartResponse = Api<{ cart: CartDto }>;

export interface AddCartLineRequest {
  sku: string;
  quantity: number;
  purchaseMode: "one_time" | "subscription";
  subscriptionFrequencyDays?: SubscriptionFrequencyDays;
}

export interface ShippingQuoteRequest {
  destination: { line1: string; line2?: string; city: string; state: string; postalCode: string; country: "US" };
  service: ShippingQuote["service"];
}
export type ShippingQuoteResponse = Api<{ quote: ShippingQuote }>;

export interface CheckoutRequest {
  shippingAddress: ShippingQuoteRequest["destination"];
  shippingService: ShippingQuote["service"];
  applyStoreCreditCents?: number;
  acceptedAgreementKeys: string[];
  researchAttestation?: boolean;
  /** Client-supplied so a retried submit cannot create two orders. */
  idempotencyKey: string;
}

export interface OrderSummaryDto {
  orderId: string;
  state: OrderState;
  placedAt: string;
  totalCents: number;
  shipments: Array<{
    owner: "mitch" | "xenios";
    status: string;
    trackingNumber: string | null;
    carrier: string | null;
  }>;
}

export interface OrderDetailDto extends OrderSummaryDto {
  lines: Array<{ sku: string; displayName: string; quantity: number; lineTotalCents: number }>;
  shippingCents: number;
  storeCreditAppliedCents: number;
  /** Present when the order is held for large-order review. */
  reviewReason: string | null;
}

export type CheckoutResponse = Api<{ order: OrderSummaryDto }>;
export type OrdersResponse = Api<{ orders: OrderSummaryDto[] }>;
export type OrderDetailResponse = Api<{ order: OrderDetailDto }>;

export interface SubscriptionDto {
  subscriptionId: string;
  sku: string;
  displayName: string;
  state: SubscriptionState;
  frequencyDays: SubscriptionFrequencyDays;
  quantity: number;
  nextChargeAt: string | null;
  nextShipmentAt: string | null;
}

export type SubscriptionsResponse = Api<{ subscriptions: SubscriptionDto[] }>;

export interface SubscriptionActionRequest {
  action: "pause" | "resume" | "skip" | "reschedule" | "cancel";
  frequencyDays?: SubscriptionFrequencyDays;
  quantity?: number;
  rescheduleTo?: string;
}

// ---------------------------------------------------------------------------
// Refunds and replacements
// ---------------------------------------------------------------------------

export type ClaimReason = "damaged" | "lost" | "incorrect" | "missing" | "temperature_concern";

export interface CreateClaimRequest {
  orderId: string;
  sku: string;
  reason: ClaimReason;
  detail: string;
  /** Opaque references only. No image bytes cross this boundary. */
  evidenceRefs: string[];
}

export interface ClaimDto {
  claimId: string;
  orderId: string;
  sku: string;
  reason: ClaimReason;
  state: "submitted" | "under_review" | "information_requested" | "approved" | "declined" | "resolved";
  resolution: "replacement" | "refund" | "partial_refund" | "none" | null;
  submittedAt: string;
}

export type ClaimsResponse = Api<{ claims: ClaimDto[] }>;
export type ClaimResponse = Api<{ claim: ClaimDto }>;

// ---------------------------------------------------------------------------
// G8 referrals, partners, commissions
// ---------------------------------------------------------------------------

export interface StoreCreditDto {
  spendableCents: number;
  pendingCents: number;
  entries: Array<{ amountCents: number; state: string; reason: string; availableAt: string | null }>;
}
export type StoreCreditResponse = Api<{ storeCredit: StoreCreditDto }>;

/**
 * The partner portal view.
 *
 * Aggregates only. There is no member id, email, name, health data, rejection reason,
 * Blueprint, plan, tracker record, or private order anywhere in this shape, and the
 * server builds it by explicit construction rather than by filtering a richer object.
 */
export interface PartnerDashboardDto {
  partnerId: string;
  role: PartnerRole;
  state: PartnerState;
  leadCount: number;
  conversionCount: number;
  totalCommissionCents: number;
  payableCents: number;
  conversions: Array<{
    attributedAt: string;
    eligibleNetCents: number;
    commissionCents: number;
    state: CommissionState;
  }>;
  /** Training modules the partner must complete or recertify. */
  outstandingTraining: Array<{ moduleKey: string; version: string }>;
}

export type PartnerDashboardResponse = Api<{ partner: PartnerDashboardDto }>;

export interface PartnerLinkDto {
  code: string;
  url: string;
  channel: "signed_link" | "code" | "qr" | "campaign" | "organization" | "event";
  campaign: string | null;
  qrSvgPath: string | null;
}
export type PartnerLinksResponse = Api<{ links: PartnerLinkDto[] }>;

// ---------------------------------------------------------------------------
// Admin queues (G10 surface owned by this lane's data)
// ---------------------------------------------------------------------------

export interface AdminCommerceQueuesDto {
  largeOrderReview: Array<{ orderId: string; totalCents: number; triggers: string[]; heldSince: string }>;
  claims: Array<{ claimId: string; orderId: string; reason: ClaimReason; submittedAt: string }>;
  supplierFactBlocks: Array<{ sku: string; unconfirmedFacts: string[]; disputed: boolean }>;
  quarantinedLots: Array<{ lotId: string; sku: string; blockReasons: string[] }>;
  partnerReview: Array<{ partnerId: string; state: PartnerState }>;
  commissionDisputes: Array<{ ledgerId: string; partnerId: string; amountCents: number }>;
}

export type AdminCommerceQueuesResponse = Api<{ queues: AdminCommerceQueuesDto }>;
