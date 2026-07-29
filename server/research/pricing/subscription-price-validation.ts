/**
 * Subscription price validation. Server only. Pure.
 *
 * Today a subscription stores its priceVersion verbatim from wire input
 * (server/research/commerce/subscriptions.ts) with no validation: the string
 * is whatever the client sent. This module supplies the missing check: given
 * a claimed price version and a (variant, audience) pair resolved from the
 * SKU, it answers whether the claim names the CURRENT authoritative price.
 *
 * Three typed results, no fourth shape:
 * - version_confirmed: the claim matches the current price version exactly.
 * - version_stale: the claim does not match; the result carries the current
 *   version and price so the caller can surface an explicit reprice. A claim
 *   that is not even a well formed version (empty, signed, padded, fractional,
 *   non-numeric, unsafe) can never be confirmed and reports here with
 *   claimedVersion null, because the remedy is the same: adopt the current
 *   version explicitly.
 * - price_unavailable: there is no current price to compare against; the
 *   reason says why, fail closed. A renewal must not proceed on this result.
 *
 * The claimed version is only ever compared, never used to select a price:
 * the authority resolves the current price on its own, so a claimed version
 * cannot steer resolution toward an older or cheaper row.
 */

import type {
  CustomerPrice,
  PriceResolutionFailureReason,
} from "@shared/research/pricing";
import {
  resolveSkuPrice,
  type PriceLineageReaders,
} from "./cart-price-binding";
import type { ServerAuthorizedAudience } from "./authoritative-price-resolver";

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type SubscriptionPriceUnavailableReason =
  | PriceResolutionFailureReason
  | "sku_unknown"
  | "audience_unauthorized"
  | "invalid_instant";

export type SubscriptionPriceValidation =
  | { state: "version_confirmed"; version: number; currentPrice: CustomerPrice }
  | {
      state: "version_stale";
      /** Null when the claim is not a well formed version string. */
      claimedVersion: number | null;
      currentVersion: number;
      currentPrice: CustomerPrice;
    }
  | { state: "price_unavailable"; reason: SubscriptionPriceUnavailableReason };

export interface ValidateSubscriptionPriceVersionInput {
  sku: string;
  /** The stored wire string, verbatim. Compared, never trusted. */
  claimedPriceVersion: string;
  authenticatedAudience: ServerAuthorizedAudience;
  currency: string;
  /** The validation instant. Always explicit, never a clock read. */
  at: string;
}

// ---------------------------------------------------------------------------
// Claim parsing
// ---------------------------------------------------------------------------

/**
 * A well formed claim is the canonical decimal rendering of a positive safe
 * integer: no sign, no leading zero, no fraction, no exponent, no padding.
 * Anything else is null. "03", " 3", "3.0", "1e3", "-1", and "0" all fail,
 * because a version the server issued is never rendered that way.
 */
export function parseClaimedPriceVersion(claim: string): number | null {
  if (typeof claim !== "string" || !/^[1-9]\d*$/.test(claim)) return null;
  const parsed = Number(claim);
  return Number.isSafeInteger(parsed) && String(parsed) === claim ? parsed : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a claimed price version against the current authoritative price
 * for the SKU's variant and the server-authorized audience.
 */
export async function validateSubscriptionPriceVersion(
  input: ValidateSubscriptionPriceVersionInput,
  readers: PriceLineageReaders,
): Promise<SubscriptionPriceValidation> {
  const outcome = await resolveSkuPrice(
    {
      sku: input.sku,
      authenticatedAudience: input.authenticatedAudience,
      currency: input.currency,
      at: input.at,
    },
    readers,
  );
  if (outcome.state === "failed") {
    return { state: "price_unavailable", reason: outcome.reason };
  }

  const currentVersion = outcome.price.version;
  const claimedVersion = parseClaimedPriceVersion(input.claimedPriceVersion);
  if (claimedVersion !== null && claimedVersion === currentVersion) {
    return {
      state: "version_confirmed",
      version: currentVersion,
      currentPrice: outcome.price,
    };
  }
  return {
    state: "version_stale",
    claimedVersion,
    currentVersion,
    currentPrice: outcome.price,
  };
}
