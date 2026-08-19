/**
 * Cart attribution over the durable referral grant.
 *
 * WHY THIS ADAPTER EXISTS. The cart checkout record has carried an
 * `attribution` field since the shape was defined, and the commit RPC persists
 * it whole-record — but production constructs the checkout route WITHOUT an
 * attribution port, so `NO_ATTRIBUTION` answers null and every cart order is
 * born unattributed. This adapter is the missing implementation, and it answers
 * from exactly one place: the SERVER's durable record of how this customer
 * arrived (`research_early_access_referral_grants`, read through the same
 * resolver the single-product settlement lane already trusts).
 *
 * NOTHING HERE READS THE BROWSER. The port receives a `customerRef` the
 * identity seam already resolved from a server-verified session, and a `nowMs`
 * the route took from its own clock. There is no code path on which a referral
 * code, an affiliate id, a timestamp or a window arrives from a request body,
 * a cookie value, or a query string. A code a customer can type is a code they
 * can type into someone else's checkout, and the commission it would create is
 * real money moving on an unverified claim.
 *
 * SILENCE IS THE SAFE ANSWER ABOUT MONEY. Every refusal in this file collapses
 * to `null`, and a null attribution places the order unattributed rather than
 * refusing the sale: the customer's purchase is never hostage to an affiliate
 * bookkeeping fact. A durable READ FAILURE is different and deliberately not
 * caught: an order silently recorded as unattributed because the database was
 * briefly unreachable is a corrupted money record that nobody would ever
 * notice, so the error propagates and the checkout door answers 503 honestly.
 */

import type { EarlyAccessReferralAttribution } from "../routes/ports";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import type { EarlyAccessCartAttributionPort } from "./ports";

type EarlyAccessCartAttribution = NonNullable<EarlyAccessCartCheckoutRecord["attribution"]>;

/**
 * The grant read this adapter consumes. `SupabaseEarlyAccessReferralResolver`
 * satisfies it as-is; the optional instants exist so a richer future source can
 * state the grant's own lifetime and have this adapter honour it, instead of
 * this adapter guessing. A source that states neither gets the default window
 * measured from the snapshot instant.
 */
export interface EarlyAccessCartReferralGrantSource {
  forCustomer(
    customerRef: string,
  ): Promise<
    | (EarlyAccessReferralAttribution & Readonly<{ grantedAt?: string; expiresAt?: string }>)
    | null
  >;
}

/**
 * How long an attribution stays creditable after it was granted. Ninety days,
 * stated here once as deployment policy; an operator who wants a different
 * window passes one explicitly rather than editing a constant that other
 * deployments share.
 */
export const EARLY_ACCESS_CART_ATTRIBUTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const CUSTOMER_REF = /^eac_[a-f0-9]{32}$/;
const SAFE_AFFILIATE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,63}$/;

export type ReferralGrantCartAttributionOptions = Readonly<{
  referrals: EarlyAccessCartReferralGrantSource;
  /**
   * How the attribution was established. The durable grant is written only by
   * server seams (the operator bridge and the verified customer-bind seam), so
   * the method is deployment policy stated at construction, never derived from
   * anything a browser sent. Defaults to `referral_session`, which is what a
   * grant recorded from a server-verified partner referral is.
   */
  method?: EarlyAccessCartAttribution["method"];
  /** Override of the attribution window, in milliseconds. Must be positive. */
  windowMs?: number;
}>;

function validInstantMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString() === value ? parsed : null;
}

/**
 * `EarlyAccessCartAttributionPort` over the durable referral grant.
 *
 * No grant, a malformed grant, a self-referral grant, or an expired grant all
 * answer null and the checkout proceeds unattributed. A valid live grant
 * answers the exact attribution shape the checkout record persists.
 */
export class ReferralGrantCartAttribution implements EarlyAccessCartAttributionPort {
  private readonly referrals: EarlyAccessCartReferralGrantSource;
  private readonly method: EarlyAccessCartAttribution["method"];
  private readonly windowMs: number;

  constructor(options: ReferralGrantCartAttributionOptions) {
    this.referrals = options.referrals;
    this.method = options.method ?? "referral_session";
    this.windowMs =
      options.windowMs !== undefined &&
      Number.isSafeInteger(options.windowMs) &&
      options.windowMs > 0
        ? options.windowMs
        : EARLY_ACCESS_CART_ATTRIBUTION_WINDOW_MS;
  }

  async snapshot(
    customerRef: string,
    nowMs: number,
  ): Promise<EarlyAccessCartCheckoutRecord["attribution"]> {
    // A handle this lane did not mint, or a clock that is not a clock, cannot
    // become an attribution. Null, not a throw: the ORDER is still fine.
    if (!CUSTOMER_REF.test(customerRef)) return null;
    if (!Number.isFinite(nowMs) || nowMs <= 0) return null;

    const grant = await this.referrals.forCustomer(customerRef);
    if (grant === null) return null;

    // The resolver already shape-checks its RPC answer, and this adapter checks
    // it again, because between here and the commission that eventually pays on
    // this record there is no later gate that knows what a grant looked like.
    if (!SAFE_AFFILIATE.test(grant.affiliateId)) return null;
    if (!SAFE_CODE.test(grant.referralCode)) return null;
    if (!CUSTOMER_REF.test(grant.affiliateCustomerRef)) return null;
    if (
      !Number.isSafeInteger(grant.holdBasisPoints) ||
      grant.holdBasisPoints < 1 ||
      grant.holdBasisPoints > 10_000
    ) {
      return null;
    }
    // An affiliate cannot arrive by their own referral. The settlement lane
    // refuses this again with its own name; here it simply never attributes.
    if (grant.affiliateCustomerRef === customerRef) return null;

    const grantedAtMs = validInstantMs(grant.grantedAt);
    const attributedAtMs = grantedAtMs ?? nowMs;
    const statedExpiryMs = validInstantMs(grant.expiresAt);
    const expiresAtMs = statedExpiryMs ?? attributedAtMs + this.windowMs;
    // An expired grant attributes nothing. Not "attributes with a past
    // expiry": a record that already says "no longer creditable" must never
    // be written onto new money.
    if (expiresAtMs <= nowMs) return null;

    return Object.freeze({
      affiliateId: grant.affiliateId,
      codeId: grant.referralCode,
      campaignId: null,
      method: this.method,
      attributedAt: new Date(attributedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      scheduleId: null,
      scheduleVersion: null,
    });
  }
}
