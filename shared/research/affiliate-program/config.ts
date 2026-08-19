// xenios research: the affiliate program configuration contract.
//
// This file makes the founder's 2026-08-16 workbook decisions (recorded at
// docs/research-launch/FOUNDER_PRICE_BOOK_2026-08-16.json .pricingAssumptions)
// a typed, CONFIGURABLE seed rather than published business logic:
//
//   first order 20%, repeat 7.5% for months 2-12, a 21-day maturation hold
//   after settled payment AND fulfillment, a $50 minimum payout that rolls
//   forward, paid every other Friday.
//
// Two rules shape everything below:
//
//   1. NOTHING ACTIVATES BY DEFAULT. The seed existing in code changes no
//      behavior; resolveAffiliateProgram returns null unless the founder-gated
//      env flag is exactly "true", and every consumer must fail closed on null.
//   2. NO SECOND MATH. The commission basis is eligibleNetRevenueCents from
//      shared/research/distribution.ts, re-exported through one function here
//      so no caller re-derives it, and the rates live ONLY in configuration.
//      Business logic reads the config; it never states 20% or 7.5% itself.

import {
  DEFAULT_ATTRIBUTION,
  eligibleNetRevenueCents,
  type AttributionConfig,
  type OrderRevenueBreakdown,
} from "../distribution";

// ---------------------------------------------------------------------------
// The configuration shape
// ---------------------------------------------------------------------------

/**
 * Whether a partner may earn on an order the partner placed for themselves.
 * The launch program denies it; the field exists so a later program can state
 * a different policy explicitly rather than by omission.
 */
export type SelfReferralPolicy = "denied" | "allowed";

export type PayoutCadence = "biweekly_friday";

export interface AffiliateProgramConfig {
  /** Basis points on the first attributed order. Integer, 0..10000. */
  readonly firstOrderRateBasisPoints: number;
  /** Basis points on repeat orders inside the repeat window. Integer, 0..10000. */
  readonly repeatOrderRateBasisPoints: number;
  /**
   * The months (counted from the referred customer's FIRST order, first order
   * = month 1) in which the repeat rate applies, both ends inclusive. Outside
   * this window a repeat order earns nothing.
   */
  readonly repeatWindowMonths: Readonly<{ fromMonth: number; toMonth: number }>;
  /** Days a commission stays held after settled payment AND fulfillment. */
  readonly holdDays: number;
  /** Balances below this roll forward to the next payout run. Integer cents. */
  readonly minimumPayoutCents: number;
  readonly payoutCadence: PayoutCadence;
  /** Window and model for resolving the winning touch. Shared authority shape. */
  readonly attribution: AttributionConfig;
  /** Lifetime of the signed attribution cookie. Matches the window by default. */
  readonly attributionCookieTtlDays: number;
  readonly selfReferralPolicy: SelfReferralPolicy;
}

/**
 * The founder's approved launch seed. A SEED, not an activation: nothing reads
 * this constant into live behavior except through resolveAffiliateProgram,
 * which refuses unless the founder-gated flag is set.
 */
export const DEFAULT_LAUNCH_PROGRAM: AffiliateProgramConfig = Object.freeze({
  firstOrderRateBasisPoints: 2000,
  repeatOrderRateBasisPoints: 750,
  repeatWindowMonths: Object.freeze({ fromMonth: 2, toMonth: 12 }),
  holdDays: 21,
  minimumPayoutCents: 5000,
  payoutCadence: "biweekly_friday" as const,
  attribution: DEFAULT_ATTRIBUTION,
  attributionCookieTtlDays: DEFAULT_ATTRIBUTION.windowDays,
  selfReferralPolicy: "denied" as const,
});

// ---------------------------------------------------------------------------
// Fail-closed activation
// ---------------------------------------------------------------------------

export const AFFILIATE_PROGRAM_ENV = "AFFILIATE_PROGRAM_ENABLED";

export type EnvLike = Readonly<Partial<Record<string, string | undefined>>>;

/**
 * Exactly the lowercase string "true", and nothing else — the same exact-string
 * discipline as server/research/affiliates/v2/feature-flags.ts. "TRUE", "1",
 * "yes", and " true " all read as off, so a deployment that meant to enable the
 * program and typed it differently gets the safe answer.
 */
export function affiliateProgramEnabled(env: EnvLike): boolean {
  return env[AFFILIATE_PROGRAM_ENV] === "true";
}

/**
 * The one gate between the seed and live behavior. Null means the program is
 * not active, and every consumer must treat null as "accrue nothing, mint
 * nothing" rather than substituting the seed. Activation stays founder-gated:
 * the flag is set by the founder's deployment, never by code.
 */
export function resolveAffiliateProgram(env: EnvLike): AffiliateProgramConfig | null {
  return affiliateProgramEnabled(env) ? DEFAULT_LAUNCH_PROGRAM : null;
}

// ---------------------------------------------------------------------------
// Pure commission-basis math
// ---------------------------------------------------------------------------

/** Which program rate an order draws: its ordinal in the referred relationship. */
export type ProgramOrderOrdinal = "first" | "repeat";

/**
 * The commission basis for an order. This IS eligibleNetRevenueCents from
 * shared/research/distribution.ts — delegated, never re-derived, so the
 * affiliate program can never disagree with the ledger about what revenue is
 * eligible.
 */
export function commissionBasisCents(breakdown: OrderRevenueBreakdown): number {
  return eligibleNetRevenueCents(breakdown);
}

/**
 * The rate the program pays for an order, in basis points. Zero means the
 * order earns nothing under this program.
 *
 * Fails closed on every uncertain input: a repeat order with an unknown,
 * non-integer, or out-of-window month earns 0 rather than the first-order
 * rate. The month is counted from the referred customer's first order (the
 * first order is month 1), so the founder's "months 2-12" window is the
 * inclusive range [fromMonth, toMonth].
 */
export function programRateBasisPoints(
  config: AffiliateProgramConfig,
  ordinal: ProgramOrderOrdinal,
  monthsSinceFirstOrder?: number,
): number {
  if (ordinal === "first") return config.firstOrderRateBasisPoints;
  if (
    monthsSinceFirstOrder === undefined ||
    !Number.isInteger(monthsSinceFirstOrder) ||
    monthsSinceFirstOrder < config.repeatWindowMonths.fromMonth ||
    monthsSinceFirstOrder > config.repeatWindowMonths.toMonth
  ) {
    return 0;
  }
  return config.repeatOrderRateBasisPoints;
}
