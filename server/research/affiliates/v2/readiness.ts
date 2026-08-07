import type { AffiliateReadiness, AffiliateReadinessRequirement, AffiliateRelationshipLane } from "@shared/research/affiliate-system";

export type AffiliateReadinessFacts = Readonly<{
  identityOrBusinessVerified: boolean;
  relationshipLane: AffiliateRelationshipLane | null;
  agreementSigned: boolean;
  commissionScheduleAssigned: boolean;
  taxFormReceived: boolean;
  payoutVerified: boolean;
  privacyAcknowledged: boolean;
  trainingCompleted: boolean;
  offerMatrixAssigned: boolean;
  testingCodeGenerated: boolean;
  referralLinkGenerated: boolean;
  testCustomerLoginPassed: boolean;
  testCheckoutPassed: boolean;
  testAttributionPassed: boolean;
  testConfirmationPassed: boolean;
  contentPackAssigned: boolean;
  namedActivationApproval: boolean;
}>;

export function affiliateReadiness(facts: AffiliateReadinessFacts): AffiliateReadiness {
  const missing: AffiliateReadinessRequirement[] = [];
  const require = (ok: boolean, key: AffiliateReadinessRequirement) => { if (!ok) missing.push(key); };
  require(facts.identityOrBusinessVerified, "identity_or_business_verification");
  require(facts.relationshipLane !== null, "relationship_lane");
  require(facts.agreementSigned, "agreement");
  require(facts.commissionScheduleAssigned, "commission_schedule");
  require(facts.taxFormReceived, "tax_form");
  require(facts.payoutVerified, "payout_verification");
  require(facts.privacyAcknowledged, "privacy_acknowledgment");
  require(facts.trainingCompleted, "training");
  require(facts.offerMatrixAssigned, "offer_matrix");
  require(facts.testingCodeGenerated, "testing_code");
  require(facts.referralLinkGenerated, "referral_link");
  require(facts.testCustomerLoginPassed, "test_customer_login");
  require(facts.testCheckoutPassed, "test_checkout");
  require(facts.testAttributionPassed, "test_attribution");
  require(facts.testConfirmationPassed, "test_confirmation");
  require(facts.contentPackAssigned, "content_pack");
  require(facts.namedActivationApproval, "named_activation_approval");
  return Object.freeze({ ready: missing.length === 0, missing: Object.freeze(missing) });
}
