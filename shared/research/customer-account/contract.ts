// The customer account surface: the wire vocabulary a signed-in customer's
// account pages render from, and nothing more.
//
// Three concepts stay separate on this surface, permanently:
//
//   1. Xenios MEMBERSHIP — a recurring administrative/technology/support plan.
//      It has billing states and a renewal date. It never implies treatment.
//   2. Xenios CARE enrollment — an operational pipeline position (intake →
//      provider review → pharmacy → shipped). Provider decisions and pharmacy
//      fulfillment are distinct stations, and none of them is promised by
//      membership.
//   3. Product fulfillment — research orders and Care/pharmacy fulfillment,
//      each with its own payment/fulfillment truth.
//
// Nothing here may carry clinical content: no diagnosis, no dosing, no
// protocol, no prescription detail. Stages speak operational language only.
// Partner attribution (who introduced the customer) is a STAFF projection —
// the customer-facing overview omits it unless explicitly enabled for staff.

// ---------------------------------------------------------------------------
// Response envelope — matches client/src/research/account/api.ts conventions.
// ---------------------------------------------------------------------------

export type CustomerAccountResult<T> =
  | Readonly<{ kind: "ok"; data: T }>
  | Readonly<{ kind: "denied"; reason: string }>
  | Readonly<{ kind: "error" }>;

// ---------------------------------------------------------------------------
// Membership (administrative subscription) — never a promise of product.
// ---------------------------------------------------------------------------

export const MEMBERSHIP_DISPLAY_STATES = [
  "none",
  "trial",
  "active",
  "past_due",
  "canceled",
] as const;

export type MembershipDisplayState = (typeof MEMBERSHIP_DISPLAY_STATES)[number];

export type MembershipDto = Readonly<{
  state: MembershipDisplayState;
  planLabel: string | null;
  /** ISO timestamp of the next renewal/billing event, when one is scheduled. */
  nextRenewalAt: string | null;
  /**
   * Where "manage billing" points. Null while automated billing is not wired
   * (`RESEARCH_MEMBERSHIP_BILLING_ENABLED` off) — the UI then renders the
   * manual/offline explanation instead of a dead link.
   */
  manageUrl: string | null;
  /** True when billing runs manually/offline (no Stripe portal yet). */
  manualBilling: boolean;
}>;

// ---------------------------------------------------------------------------
// Care enrollment — a 10-station operational timeline, neutral language only.
// ---------------------------------------------------------------------------

export const CARE_TIMELINE_STAGES = [
  "account_created",
  "intake_needed",
  "intake_submitted",
  "provider_review",
  "follow_up_required",
  "appointment_needed",
  "provider_decision_complete",
  "pharmacy_processing",
  "shipped",
  "completed",
] as const;

export type CareTimelineStage = (typeof CARE_TIMELINE_STAGES)[number];

export type CareStatusDto = Readonly<{
  /** Null when the customer has no Care relationship at all. */
  stage: CareTimelineStage | null;
  updatedAt: string | null;
  /**
   * One operational sentence ("Your intake is with the provider team."),
   * never clinical content. Server-composed so the client cannot invent it.
   */
  neutralSummary: string | null;
}>;

export type CareEnrollmentDto = Readonly<{
  enrolled: boolean;
  status: CareStatusDto;
  /** Pharmacy fulfillment is its own station, never merged into provider review. */
  pharmacyState: "none" | "processing" | "shipped" | "completed";
}>;

// ---------------------------------------------------------------------------
// Orders — research orders and Care/pharmacy fulfillment listed separately.
// ---------------------------------------------------------------------------

export const ORDER_PAYMENT_DISPLAY_STATES = ["awaiting_payment", "paid"] as const;
export type OrderPaymentDisplayState = (typeof ORDER_PAYMENT_DISPLAY_STATES)[number];

export const ORDER_FULFILLMENT_DISPLAY_STATES = [
  "unfulfilled",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "exception",
] as const;
export type OrderFulfillmentDisplayState = (typeof ORDER_FULFILLMENT_DISPLAY_STATES)[number];

export type OrderSummaryDto = Readonly<{
  /** XRR- / XEA- / XEC- / XO- reference, verbatim. */
  reference: string;
  placedAt: string;
  itemLabel: string;
  variantLabel: string | null;
  quantity: number;
  paymentState: OrderPaymentDisplayState;
  fulfillmentState: OrderFulfillmentDisplayState;
  trackingUrl: string | null;
  /** True only when an approved COA/lot document is actually retrievable. */
  lotCoaAvailable: boolean;
}>;

export type CareFulfillmentDto = Readonly<{
  /** Operational states only; no prescription content. */
  intakeState: "needed" | "submitted";
  providerReviewState: "pending" | "follow_up_required" | "complete";
  pharmacyState: "none" | "processing" | "shipped" | "completed";
  trackingUrl: string | null;
  updatedAt: string;
}>;

export type CustomerOrdersDto = Readonly<{
  research: readonly OrderSummaryDto[];
  carePharmacy: readonly CareFulfillmentDto[];
}>;

// ---------------------------------------------------------------------------
// Product interests and availability requests.
// ---------------------------------------------------------------------------

export type ProductInterestDto = Readonly<{
  /** Canonical demand key (e.g. "bpc157-tb500") — never a raw import string. */
  interestKey: string;
  displayLabel: string;
  /** The account-visible availability state, from the activation overlay. */
  availability:
    | "live"
    | "request_only"
    | "provider_required"
    | "pending_activation"
    | "unavailable";
  recordedAt: string;
}>;

// ---------------------------------------------------------------------------
// Documents — receipts, approved COAs, order/membership/Care-admin documents.
// ---------------------------------------------------------------------------

export const CUSTOMER_DOCUMENT_KINDS = [
  "receipt",
  "coa",
  "order_document",
  "membership_document",
  "care_admin_document",
] as const;
export type CustomerDocumentKind = (typeof CUSTOMER_DOCUMENT_KINDS)[number];

export type DocumentSummaryDto = Readonly<{
  id: string;
  kind: CustomerDocumentKind;
  title: string;
  issuedAt: string;
  /** Server-authorized download path; never a raw storage URL. */
  downloadPath: string;
}>;

// ---------------------------------------------------------------------------
// Support cases.
// ---------------------------------------------------------------------------

export const SUPPORT_CASE_CATEGORIES = ["order", "account", "care", "pharmacy"] as const;
export type SupportCaseCategory = (typeof SUPPORT_CASE_CATEGORIES)[number];

export const SUPPORT_CASE_STATES = ["open", "waiting_on_customer", "resolved"] as const;
export type SupportCaseState = (typeof SUPPORT_CASE_STATES)[number];

export type SupportCaseSummaryDto = Readonly<{
  id: string;
  category: SupportCaseCategory;
  subject: string;
  state: SupportCaseState;
  lastUpdateAt: string;
  /** Human sentence, e.g. "We reply within one business day." */
  responseExpectation: string;
}>;

// ---------------------------------------------------------------------------
// Partner attribution — a STAFF projection. The customer overview omits it.
// ---------------------------------------------------------------------------

export type PartnerAttributionDto = Readonly<{
  /** e.g. "vitality_advisors" — a partner-source slug, never free text. */
  sourcePartner: string;
  /** Displayed to authorized staff only. */
  relationshipOwner: string;
}>;

// ---------------------------------------------------------------------------
// The account overview: one screen, everything above, nothing clinical.
// ---------------------------------------------------------------------------

export type CustomerAccountOverviewDto = Readonly<{
  identity: Readonly<{
    displayName: string;
    email: string;
    accountStatus: "invited" | "active" | "inactive";
    memberSince: string | null;
  }>;
  /** Present only in staff projections; null for the customer's own view. */
  partnerAttribution: PartnerAttributionDto | null;
  membership: MembershipDto;
  careEnrollment: CareEnrollmentDto;
  researchOrders: readonly OrderSummaryDto[];
  productInterests: readonly ProductInterestDto[];
  documents: readonly DocumentSummaryDto[];
  supportCases: readonly SupportCaseSummaryDto[];
  /**
   * The single next administrative step, if any ("Complete your intake",
   * "Confirm your shipping address"). Administrative only — never medical
   * advice, never a product recommendation.
   */
  nextAdministrativeAction: string | null;
}>;
