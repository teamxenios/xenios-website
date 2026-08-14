/**
 * Buyer-scoped pricing: the seam through which ONE customer's authorized
 * price may differ from the shared founder release ledger price, without the
 * ledger changing for anyone else.
 *
 * WHY THIS EXISTS. The founder release ledger deliberately carries one price
 * per unit (latest append per product/variant), and both the storefront and
 * the order door read it. That is the right shape for one audience, and
 * exactly the wrong shape for a wholesale partner: appending partner prices
 * to the ledger would reprice the unit for EVERY Early Access session. This
 * seam lets the door answer "what may THIS customer pay for THIS unit"
 * without touching what anyone else sees.
 *
 * WHAT THIS SEAM MAY AND MAY NOT DECIDE.
 *
 *   - It prices. It never releases. A unit the founder release ledger has not
 *     released is not sellable at any price, and every caller consults the
 *     release decision FIRST and only ever substitutes the amount.
 *   - It is fail-closed at every layer: no provider configured, a provider
 *     read failing, no binding for the customer, no active entitlement, an
 *     unbound unit, an unpriced row - each yields null, and null means "the
 *     shared ledger price stands". A wrong answer here can therefore only
 *     ever RESTORE the public price, never invent one.
 *   - The flag is server-side and exact. Anything but the literal profile
 *     name leaves the seam disabled, so a typo cannot half-enable wholesale
 *     pricing.
 *
 * The anti-bait-and-switch invariant is preserved by construction: the shelf
 * (the Kris Buy Now resolver) and the door (order placement) resolve through
 * the SAME provider for the SAME customer, so the price a buyer is shown is
 * the price the door authorizes, and `safeLegacyOrder` plus the door's
 * PRICE_CHANGED equality check still refuse any disagreement.
 */

/** One buyer-scoped price for one unit. Amount and currency only. */
export interface BuyerScopedUnitPrice {
  readonly amountCents: number;
  readonly currency: string;
}

/**
 * One customer's resolved price sheet: the entitlement that authorizes it and
 * a synchronous per-unit lookup. Built once per request so every row in one
 * response is priced against one consistent read.
 */
export interface BuyerPriceSheet {
  readonly profileKey: string;
  readonly entitlementId: string;
  priceFor(productId: string, variantId: string): BuyerScopedUnitPrice | null;
}

/** The provider seam. null = this customer has no buyer-scoped pricing. */
export interface BuyerScopedPricing {
  forCustomer(customerRef: string, nowMs: number): Promise<BuyerPriceSheet | null>;
}

export const BUYER_SCOPED_PRICING_ENV = "XENIOS_BUYER_SCOPED_PRICING";

/**
 * The flag is the exact profile name being enabled, not a boolean, so the
 * environment states WHICH buyer scope is live and a stray truthy value
 * ("1", "yes", "on") enables nothing.
 */
export function buyerScopedPricingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (env[BUYER_SCOPED_PRICING_ENV] ?? "").trim() === "KRIS_VOLUME_PARTNER";
}

/**
 * The one read path callers use. A provider that throws is a provider that
 * does not know, and what it does not know prices at the shared ledger rate:
 * the caller receives null and the public price stands. It can never receive
 * a partial or guessed sheet.
 */
export async function resolveBuyerSheet(
  pricing: BuyerScopedPricing | undefined,
  customerRef: string,
  nowMs: number,
): Promise<BuyerPriceSheet | null> {
  if (pricing === undefined) return null;
  if (typeof customerRef !== "string" || customerRef === "") return null;
  if (!Number.isSafeInteger(nowMs)) return null;
  try {
    return await pricing.forCustomer(customerRef, nowMs);
  } catch {
    return null;
  }
}
