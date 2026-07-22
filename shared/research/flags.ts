// xenios research: feature flags.
//
// Every flag defaults to FALSE. A capability becomes available because Samuel
// turned it on after the required approval exists, never because code shipped.

export interface ResearchFeatureFlags {
  publicResearch: boolean;
  indexableResearch: boolean;
  referrals: boolean;
  membershipBilling: boolean;
  identityVerification: boolean;
  productCommerce: boolean;
  quantumCommerce: boolean;
  affiliatePayouts: boolean;
  affiliateCommissions: boolean;
  liveShippingRates: boolean;
  mitchFulfillment: boolean;
}

export const DEFAULT_RESEARCH_FLAGS: ResearchFeatureFlags = {
  publicResearch: false,
  indexableResearch: false,
  referrals: false,
  membershipBilling: false,
  identityVerification: false,
  productCommerce: false,
  quantumCommerce: false,
  affiliatePayouts: false,
  affiliateCommissions: false,
  liveShippingRates: false,
  mitchFulfillment: false,
};

/**
 * Reads a flag from the environment. Anything other than the exact string "true"
 * is false, so a typo, an empty string, or an unset variable all fail closed.
 */
export function flagFromEnv(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return env[name] === "true";
}

export const RESEARCH_FLAG_ENV: Record<keyof ResearchFeatureFlags, string> = {
  publicResearch: "NEXT_PUBLIC_RESEARCH_PUBLIC_ENABLED",
  indexableResearch: "NEXT_PUBLIC_RESEARCH_INDEXABLE",
  referrals: "RESEARCH_REFERRALS_ENABLED",
  membershipBilling: "RESEARCH_MEMBERSHIP_BILLING_ENABLED",
  identityVerification: "RESEARCH_IDENTITY_ENABLED",
  productCommerce: "NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED",
  quantumCommerce: "RESEARCH_QUANTUM_COMMERCE_ENABLED",
  affiliatePayouts: "RESEARCH_AFFILIATE_PAYOUTS_ENABLED",
  affiliateCommissions: "RESEARCH_AFFILIATE_COMMISSIONS_ENABLED",
  liveShippingRates: "RESEARCH_LIVE_SHIPPING_ENABLED",
  mitchFulfillment: "RESEARCH_MITCH_FULFILLMENT_ENABLED",
};

export function readResearchFlags(env: NodeJS.ProcessEnv = process.env): ResearchFeatureFlags {
  const out = { ...DEFAULT_RESEARCH_FLAGS };
  for (const key of Object.keys(RESEARCH_FLAG_ENV) as Array<keyof ResearchFeatureFlags>) {
    out[key] = flagFromEnv(RESEARCH_FLAG_ENV[key], env);
  }
  return out;
}

/**
 * Quantum commerce is gated twice on purpose: it requires BOTH general product
 * commerce and its own flag. Turning on product commerce must never turn on
 * Quantum as a side effect, because Quantum's classification is unresolved.
 */
export function quantumCommerceAllowed(flags: ResearchFeatureFlags): boolean {
  return flags.productCommerce && flags.quantumCommerce;
}
