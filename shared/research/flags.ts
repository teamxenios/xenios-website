// xenios research: feature flag DECLARATIONS.
//
// READ THIS BEFORE TRUSTING ANYTHING IN THIS FILE.
//
// This is an inventory of intended capabilities. It is NOT a source of truth
// about what is switched on, and nothing in the running system consumes it:
// `readResearchFlags` and `flagFromEnv` have zero callers across client,
// server and shared source. Setting any variable named below changes no
// behaviour, because no composition root reads it.
//
// That was not obvious, and it mattered. A rollback note once said "leave
// every flag false, this is the rollback" about affiliate switches that
// nothing parsed. The affiliate system was genuinely inert, but because no
// affiliate route was mounted, not because a flag held it shut. Anyone who
// later mounted a route and trusted the flag would have shipped an ungated
// surface believing it was off.
//
// WHERE ENFORCEMENT ACTUALLY LIVES: beside the capability, at the composition
// root that mounts it. The two worked examples are
// `server/research/early-access/cart/feature-flag.ts` (consumed in
// `early-access/register.ts`) and `server/research/affiliates/v2/feature-flags.ts`.
// Each pairs a named env constant with an exact-string parser and a real
// mount consumer, and each is covered by tests that hit the real route.
//
// Adding a name here is a declaration of intent and enforces nothing. To
// actually gate something, add the parser next to the capability and a test
// that proves the route is unmounted when the flag is absent.
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
