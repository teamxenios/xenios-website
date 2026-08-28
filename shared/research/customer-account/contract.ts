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
  "pending",
  "trial",
  "active",
  "past_due",
  "paused",
  "canceled",
  "inactive",
] as const;

export type MembershipDisplayState = (typeof MEMBERSHIP_DISPLAY_STATES)[number];

/**
 * BILLING truth, carried INDEPENDENTLY of membership/access state (P1-5,
 * 2026-08-27). The billing-enforcement feature flag may gate ACCESS; it may
 * never erase what the billing ledger already knows. A stored past_due /
 * disputed / cancelled / refunded state renders as itself whether or not
 * enforcement is on; a value the projection cannot read renders "unknown",
 * never "current".
 */
export const MEMBERSHIP_BILLING_DISPLAY_STATES = [
  "current",
  "past_due",
  "disputed",
  "cancelled",
  "refunded",
  "none",
  "unknown",
] as const;

export type MembershipBillingDisplayState = (typeof MEMBERSHIP_BILLING_DISPLAY_STATES)[number];

export type MembershipDto = Readonly<{
  /** Membership/ACCESS state, derived from research_members.status only. */
  state: MembershipDisplayState;
  /** Billing truth, derived from the stored billing_state only — never from the enforcement flag. */
  billing: MembershipBillingDisplayState;
  planLabel: string | null;
  /**
   * ISO timestamp of the next renewal/billing event, when one is actually
   * scheduled in a durable source. Never invented: null until such a source
   * exists.
   */
  nextRenewalAt: string | null;
  /**
   * Where "manage billing" points. Null while automated billing is not wired
   * (`RESEARCH_MEMBERSHIP_BILLING_ENABLED` off) — the UI then renders the
   * manual/offline explanation instead of a dead link. Never invented.
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

/**
 * DISCRIMINATED Care source model (P1-D, 2026-08-27). "The adapter is not
 * wired" and "this person is not enrolled" are different facts, and only one
 * of them is knowable without a durable Care source. `sourceState:
 * "unavailable"` carries NO enrollment claim at all — every surface renders
 * it as "Care status unavailable", never as "not enrolled"/"not started".
 * Enrollment truth (either way) exists only under `sourceState: "available"`.
 */
export type CareEnrollmentDto =
  | Readonly<{
      sourceState: "available";
      enrolled: boolean;
      status: CareStatusDto;
      /** Pharmacy fulfillment is its own station, never merged into provider review. */
      pharmacyState: "none" | "processing" | "shipped" | "completed";
    }>
  | Readonly<{ sourceState: "unavailable" }>;

// ---------------------------------------------------------------------------
// Orders — research orders and Care/pharmacy fulfillment listed separately.
// ---------------------------------------------------------------------------

/**
 * Payment display truth (P1-3, 2026-08-27). paid and refunded are emitted
 * ONLY from durable authoritative facts (a recorded capture; a refund the
 * state machine accepts only with provider confirmation). A lifecycle state
 * that is reachable both before and after capture — exception, cancelled,
 * replaced — projects "unknown": no customer-facing financial guess is
 * acceptable. refunded never renders paid; cancelled-after-capture never
 * renders unpaid.
 */
export const ORDER_PAYMENT_DISPLAY_STATES = [
  "unpaid",
  "paid",
  "partially_refunded",
  "refunded",
  "unknown",
] as const;
export type OrderPaymentDisplayState = (typeof ORDER_PAYMENT_DISPLAY_STATES)[number];

/**
 * Fulfillment display truth (P1-4). shipped/delivered are emitted only when
 * durable shipment evidence exists on the order; a lifecycle claim with no
 * shipment fact behind it projects "unknown", and tracking stays null unless
 * a real carrier + tracking number are recorded.
 */
export const ORDER_FULFILLMENT_DISPLAY_STATES = [
  "unfulfilled",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "exception",
  "unknown",
] as const;
export type OrderFulfillmentDisplayState = (typeof ORDER_FULFILLMENT_DISPLAY_STATES)[number];

export type OrderSummaryDto = Readonly<{
  /** XRR- / XEA- / XEC- / XO- reference, verbatim. */
  reference: string;
  placedAt: string;
  /**
   * Line detail is never fabricated (P1-B): when the authoritative detail
   * read yields no lines, `detailAvailability` is "unavailable" and the
   * label/quantity are null — never a synthesized "Research order" with a
   * fake quantity of 0.
   */
  detailAvailability: "available" | "unavailable";
  itemLabel: string | null;
  variantLabel: string | null;
  quantity: number | null;
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

/**
 * Order-history availability (P1-B, 2026-08-27): a DISCRIMINATED model, per
 * known source, so "unavailable" can never be encoded as an empty list and a
 * partial read can never masquerade as the whole truth. Consumers must not
 * make definitive claims ("no orders", counts, "up to date") unless
 * `availability` is "complete"; counts over a partial history are unknown,
 * not zero.
 */
export const ORDER_HISTORY_SOURCE_KEYS = ["commerce", "xea", "xec", "xrr"] as const;
export type OrderHistorySourceKey = (typeof ORDER_HISTORY_SOURCE_KEYS)[number];

export type OrderSourceStateDto = Readonly<{
  /** The source's reader is wired into this composition. */
  connected: boolean;
  /** The source is connected AND its read covers the full history it owns. */
  complete: boolean;
}>;

export type OrderHistoryAvailabilityDto = Readonly<{
  availability: "complete" | "partial" | "unavailable";
  sources: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>;
}>;

export const ORDER_HISTORY_SOURCE_LABELS: Readonly<Record<OrderHistorySourceKey, string>> = {
  commerce: "commerce member orders",
  xea: "Early Access placements (XEA)",
  xec: "Early Access cart checkouts (XEC)",
  xrr: "assisted order requests (XRR)",
};

/** Derive the availability discriminant from the per-source truth. */
export function orderHistoryAvailability(
  sources: Readonly<Record<OrderHistorySourceKey, OrderSourceStateDto>>,
): "complete" | "partial" | "unavailable" {
  const states = ORDER_HISTORY_SOURCE_KEYS.map((key) => sources[key]);
  if (states.every((s) => s.connected && s.complete)) return "complete";
  if (states.every((s) => !s.connected)) return "unavailable";
  return "partial";
}

export type CustomerOrdersDto = Readonly<{
  research: readonly OrderSummaryDto[];
  carePharmacy: readonly CareFulfillmentDto[];
  history: OrderHistoryAvailabilityDto;
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
  /** Availability of the order history the list above was read from (P1-B). */
  orderHistory: OrderHistoryAvailabilityDto;
  /**
   * Whether the account may be DECLARED current (P1-B/P1-C). "attention" —
   * an administrative action is outstanding. "current" — nothing is
   * outstanding AND every backing source is connected and complete, so the
   * all-clear is provable. "indeterminate" — nothing is recorded, but a
   * source is unavailable/partial or billing truth is not affirmatively
   * settled, so no green all-clear may be rendered.
   */
  accountStanding: "current" | "attention" | "indeterminate";
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
