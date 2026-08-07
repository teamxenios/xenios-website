/** Affiliate system v2 contracts derived from the founder execution brief. */

export const AFFILIATE_RELATIONSHIP_LANES = [
  "standard_affiliate",
  "strategic_affiliate",
  "parent_partner",
  "collective_leader",
  "organization_partner",
  "authorized_supplement_affiliate",
  "qualified_research_b2b_representative",
  "enterprise_white_label_introducer",
  "professional_practice_review",
] as const;
export type AffiliateRelationshipLane = (typeof AFFILIATE_RELATIONSHIP_LANES)[number];

export const AFFILIATE_LIFECYCLE_STATES = [
  "prospect",
  "application_review",
  "approved_pending_documents",
  "testing",
  "active",
  "paused",
  "terminated",
] as const;
export type AffiliateLifecycleState = (typeof AFFILIATE_LIFECYCLE_STATES)[number];

export const AFFILIATE_CODE_STATES = ["draft","testing","active","paused","revoked","expired"] as const;
export type AffiliateCodeState = (typeof AFFILIATE_CODE_STATES)[number];

export const COMMISSION_SCHEDULE_STATES = ["draft","under_review","approved","active","paused","expired","replaced","archived"] as const;
export type CommissionScheduleState = (typeof COMMISSION_SCHEDULE_STATES)[number];

export const AFFILIATE_COMMISSION_STATES = ["pending","approved","payable","paid","reversed","disputed","held"] as const;
export type AffiliateCommissionStateV2 = (typeof AFFILIATE_COMMISSION_STATES)[number];

export type AffiliateReadinessRequirement =
  | "identity_or_business_verification"
  | "relationship_lane"
  | "agreement"
  | "commission_schedule"
  | "tax_form"
  | "payout_verification"
  | "privacy_acknowledgment"
  | "training"
  | "offer_matrix"
  | "testing_code"
  | "referral_link"
  | "test_customer_login"
  | "test_checkout"
  | "test_attribution"
  | "test_confirmation"
  | "content_pack"
  | "named_activation_approval";

export type AffiliateReadiness = Readonly<{
  ready: boolean;
  missing: readonly AffiliateReadinessRequirement[];
}>;

export type AffiliateCodePublicResult =
  | Readonly<{
      valid: true;
      accessGranted: boolean;
      publicDisplayName: string | null;
      attributionToken: string;
      supportState: "active" | "testing";
    }>
  | Readonly<{ valid: false; accessGranted: false; message: string }>;

export type AffiliateAttributionSnapshot = Readonly<{
  affiliateId: string;
  codeId: string | null;
  campaignId: string | null;
  method: "explicit_code" | "referral_link" | "attribution_session" | "assisted_sale" | "house";
  attributedAt: string;
  expiresAt: string | null;
  commissionScheduleId: string | null;
  commissionScheduleVersion: number | null;
  publicOfferId: string | null;
  sourcePage: string | null;
  firstTouchAt: string | null;
  lastTouchAt: string | null;
}>;

export type AffiliateCommissionScheduleSnapshot = Readonly<{
  scheduleId: string;
  version: number;
  firstOrderRateBps: number;
  repeatOrderRateBps: number;
  attributionWindowDays: number;
  holdDays: number;
  minimumPayoutCents: number;
  recurringTermMonths: number | null;
  currency: "USD";
}>;

export type AffiliateCommissionCalculation = Readonly<{
  eligibleRevenueCents: number;
  rateBps: number;
  grossCommissionCents: number;
}>;
