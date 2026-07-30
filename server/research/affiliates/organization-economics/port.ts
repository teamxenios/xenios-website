import type {
  AffiliateEconomicsDecision,
  AffiliatePayabilityDecision,
  AffiliateReversalDecision,
  CanonicalAffiliatePayabilityProjection,
  CanonicalAffiliateRevenueProjection,
  CanonicalAffiliateReversalProjection,
} from "@shared/research/affiliates/organization-economics";

/**
 * Pure composition port. Callers must supply projections assembled from
 * authenticated, canonical server data; no browser field is authoritative.
 */
export interface AffiliateOrganizationEconomicsPort {
  evaluateRevenue(
    projection: CanonicalAffiliateRevenueProjection | unknown,
  ): Promise<AffiliateEconomicsDecision>;
  evaluateReversal(
    projection: CanonicalAffiliateReversalProjection | unknown,
  ): Promise<AffiliateReversalDecision>;
  assessPayability(
    projection: CanonicalAffiliatePayabilityProjection | unknown,
  ): Promise<AffiliatePayabilityDecision>;
}
