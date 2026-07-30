/**
 * Server-authoritative affiliate and organization economics policy.
 *
 * This contract deliberately contains no payment or payout command. It only
 * evaluates canonical revenue evidence and returns an opaque policy decision
 * that a future audited persistence boundary may consume.
 */
export const AFFILIATE_ORGANIZATION_POLICY_VERSION = "2026-07-30" as const;

export const INDIVIDUAL_COMMISSION_BASIS_POINTS = 1_500;
export const ORGANIZATION_COMMISSION_BASIS_POINTS = 2_000;
export const ORGANIZATION_SELLER_BASIS_POINTS = 1_500;
export const ORGANIZATION_PARENT_BASIS_POINTS = 500;
export const MEMBERSHIP_FIRST_YEAR_BASIS_POINTS = 2_000;
export const MEMBERSHIP_RENEWAL_BASIS_POINTS = 1_000;
export const ATTRIBUTION_CLICK_WINDOW_DAYS = 60;
export const ACCOUNT_ATTRIBUTION_LOCK_MONTHS = 12;
export const COMMISSION_HOLD_DAYS = 30;
export const PAYOUT_MINIMUM_CENTS = 5_000;

export type AffiliateRevenueClassification =
  | "research_goods"
  | "membership"
  | "clinical"
  | "unknown";

export type AffiliateAttributionKind =
  | "individual"
  | "organization_direct"
  | "organization_member";

export interface CanonicalAccountAttributionLock {
  lockedAt: string;
  expiresAt: string;
}

export interface CanonicalAffiliateAttributionProjection {
  attributionId: string;
  kind: AffiliateAttributionKind;
  sellerPartnerId: string;
  organizationPartnerId: string | null;
  clickedAt: string;
  accountLock: CanonicalAccountAttributionLock | null;
}

export interface CanonicalAffiliateRevenueProjection {
  projectionVersion: number;
  revenueEventId: string;
  orderId: string;
  classification: AffiliateRevenueClassification;
  currency: string;
  eligiblePaidRevenueCents: number;
  convertedAt: string;
  paidAt: string;
  membershipPaidMonth: number | null;
  attribution: CanonicalAffiliateAttributionProjection;
}

export type AffiliateAllocationRole =
  | "individual"
  | "organization"
  | "organization_seller"
  | "organization_parent";

export interface AffiliateCommissionAllocation {
  beneficiaryPartnerId: string;
  role: AffiliateAllocationRole;
  basisPoints: number;
  amountCents: number;
}

export type AffiliateEconomicsDenialReason =
  | "invalid_projection"
  | "clinical_or_unknown_revenue"
  | "attribution_expired"
  | "invalid_account_lock"
  | "invalid_organization_relationship"
  | "no_eligible_paid_revenue";

export interface AffiliateEconomicsDeniedDecision {
  status: "denied";
  decisionId: string;
  policyVersion: typeof AFFILIATE_ORGANIZATION_POLICY_VERSION;
  reason: AffiliateEconomicsDenialReason;
  totalCommissionCents: 0;
  allocations: [];
  holdUntil: null;
  payable: false;
}

export interface AffiliateEconomicsEligibleDecision {
  status: "eligible";
  decisionId: string;
  policyVersion: typeof AFFILIATE_ORGANIZATION_POLICY_VERSION;
  revenueEventId: string;
  currency: string;
  totalCommissionCents: number;
  allocations: AffiliateCommissionAllocation[];
  holdUntil: string;
  payable: false;
}

export type AffiliateEconomicsDecision =
  | AffiliateEconomicsDeniedDecision
  | AffiliateEconomicsEligibleDecision;

export interface CanonicalAffiliateReversalProjection {
  projectionVersion: number;
  reversalEventId: string;
  reversedAt: string;
  reversedEligibleRevenueCents: number;
  originalRevenue: CanonicalAffiliateRevenueProjection;
}

export interface AffiliateReversalEligibleDecision {
  status: "eligible";
  decisionId: string;
  policyVersion: typeof AFFILIATE_ORGANIZATION_POLICY_VERSION;
  reversalEventId: string;
  currency: string;
  totalReversalCents: number;
  allocations: AffiliateCommissionAllocation[];
  payable: false;
}

export type AffiliateReversalDecision =
  | AffiliateEconomicsDeniedDecision
  | AffiliateReversalEligibleDecision;

export type AffiliatePayabilityDenialReason =
  | "invalid_projection"
  | "partner_not_active"
  | "terms_not_verified"
  | "payout_configuration_not_verified"
  | "clinical_or_unknown_revenue_included"
  | "hold_not_elapsed"
  | "below_payout_minimum"
  | "no_payable_balance";

export interface CanonicalAffiliatePayabilityProjection {
  projectionVersion: number;
  partnerId: string;
  currency: string;
  evaluatedAt: string;
  partnerState: "active" | "paused" | "disabled" | "under_review";
  termsVerified: boolean;
  payoutConfigurationVerified: boolean;
  clinicalOrUnknownRevenueIncluded: boolean;
  grossCommissionCents: number;
  reversalCents: number;
  latestHoldUntil: string;
}

export type AffiliatePayabilityDecision =
  | {
      payable: false;
      decisionId: string;
      policyVersion: typeof AFFILIATE_ORGANIZATION_POLICY_VERSION;
      reason: AffiliatePayabilityDenialReason;
      amountCents: 0;
      currency: string | null;
    }
  | {
      payable: true;
      decisionId: string;
      policyVersion: typeof AFFILIATE_ORGANIZATION_POLICY_VERSION;
      amountCents: number;
      currency: string;
    };
