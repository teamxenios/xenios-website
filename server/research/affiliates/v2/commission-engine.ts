import type {
  AffiliateCommissionCalculation,
  AffiliateCommissionScheduleSnapshot,
} from "@shared/research/affiliate-system";

export type CommissionOrderFacts = Readonly<{
  settledProductRevenueCents: number;
  fundedDiscountsCents: number;
  refundsCents: number;
  chargebacksCents: number;
  complimentaryCents: number;
  excludedCents: number;
  salesTaxCents: number;
  passThroughShippingCents: number;
  isFirstEligibleOrder: boolean;
  productCommissionable: boolean;
  affiliateActive: boolean;
  scheduleActive: boolean;
}>;

function cents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function calculateAffiliateCommission(
  schedule: AffiliateCommissionScheduleSnapshot,
  facts: CommissionOrderFacts,
): AffiliateCommissionCalculation | null {
  const values = [facts.settledProductRevenueCents, facts.fundedDiscountsCents, facts.refundsCents, facts.chargebacksCents, facts.complimentaryCents, facts.excludedCents, facts.salesTaxCents, facts.passThroughShippingCents];
  if (!values.every(cents) || !facts.productCommissionable || !facts.affiliateActive || !facts.scheduleActive) return null;
  const eligibleRevenueCents = Math.max(0,
    facts.settledProductRevenueCents - facts.fundedDiscountsCents - facts.refundsCents -
    facts.chargebacksCents - facts.complimentaryCents - facts.excludedCents -
    facts.salesTaxCents - facts.passThroughShippingCents,
  );
  const rateBps = facts.isFirstEligibleOrder ? schedule.firstOrderRateBps : schedule.repeatOrderRateBps;
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) return null;
  const grossCommissionCents = Math.floor((eligibleRevenueCents * rateBps) / 10_000);
  return Object.freeze({ eligibleRevenueCents, rateBps, grossCommissionCents });
}

export function contributionMarginAfterCommission(input: Readonly<{
  eligibleRevenueCents: number;
  costOfGoodsCents: number;
  fulfillmentCostCents: number;
  paymentCostCents: number;
  commissionCents: number;
}>): number | null {
  const values = Object.values(input);
  if (!values.every(cents) || input.eligibleRevenueCents === 0) return null;
  return input.eligibleRevenueCents - input.costOfGoodsCents - input.fulfillmentCostCents - input.paymentCostCents - input.commissionCents;
}
