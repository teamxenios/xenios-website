import {
  authorizeAudienceFromServerIdentity,
  type AuthoritativePriceResolver,
} from "../../../pricing/authoritative-price-resolver";
import type { QuoteLineClearance, QuoteLineClearanceReader, QuoteLineClearanceScope } from "./production-portal";

/**
 * CANDIDATE line clearance for production private quotes, backed by the
 * existing Product Control price authority. Not wired: the protected mount
 * passes no clearance reader until the Product Control/pricing owner and the
 * quote-operations owner approve a source.
 *
 * What it asserts, per line, at the instant it is asked (issue, customer read
 * and dispatch each ask again):
 *  - the line's own commerce identity resolves through the same
 *    `AuthoritativePriceResolver` the member catalog uses: a published, public,
 *    active product; one approved, active, member-eligible variant; exactly one
 *    approved, active, in-window USD `member` price row;
 *  - the unit price is that row's amount at the line's exact quantity tier;
 *  - the evidence is the price row's id and version, so any repricing (a new
 *    version or a new row) changes the evidence.
 *
 * The member audience is justified because the portal resolves the recipient
 * to exactly one active, confirmed, owning member before it asks for any
 * clearance. Synthetic ("unbound:") identities never resolve to a product.
 *
 * What it does NOT assert: that anyone approved quoting this particular
 * request. The configured issuer's audited issue action would be that per-request
 * approval; whether that suffices is the quote-operations owner's decision.
 */
export const PRODUCT_CONTROL_CLEARANCE_AUDIENCE_SOURCE = "ea-production-quote-member-recipient";

export function productControlQuoteLineClearance(
  resolver: Pick<AuthoritativePriceResolver, "resolveApprovedResearchPrice">,
  now: () => number = Date.now,
): QuoteLineClearanceReader {
  return Object.freeze({
    async cleared(scope: QuoteLineClearanceScope): Promise<QuoteLineClearance | null> {
      const at = new Date(now()).toISOString();
      const audience = authorizeAudienceFromServerIdentity({
        audience: "member", sourceVersion: PRODUCT_CONTROL_CLEARANCE_AUDIENCE_SOURCE, evaluatedAt: at,
      });
      if (!audience || !Number.isSafeInteger(scope.quantity) || scope.quantity <= 0) return null;
      const resolution = await resolver.resolveApprovedResearchPrice({
        productId: scope.productId, variantId: scope.variantId,
        authenticatedAudience: audience, currency: "USD", at, quantity: scope.quantity,
      });
      if (resolution.state !== "available") return null;
      const price = resolution.price;
      // The resolver's answer must be about this exact line, in USD, for members.
      if (price.productId !== scope.productId || price.variantId !== scope.variantId ||
          price.audience !== "member" || price.currency !== "USD" ||
          !Number.isSafeInteger(price.version) || price.version <= 0 ||
          typeof price.priceId !== "string" || !/^[-a-zA-Z0-9_.]{1,120}$/.test(price.priceId)) return null;
      return Object.freeze({
        ...scope,
        approvalEvidenceId: `pc-price:${price.priceId}:v${price.version}`,
        unitPriceCents: price.amountCents,
        currency: "USD" as const,
      });
    },
  });
}
