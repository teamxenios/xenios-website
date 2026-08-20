/**
 * The pricing authority for an ANONYMOUS Early Access customer.
 *
 * WHY THIS EXISTS. Early Access has no password and no member account, so its
 * viewer carries no member row. The pricing grant was derived only from an
 * authenticated member, so `pricingIdentityFromViewer` answered null and every
 * priced product degraded to "Price on request". Measured live on 2026-08-20:
 * 420 catalog rows, ZERO prices, zero direct_order_request. A customer could
 * browse the whole catalog and never see a number.
 *
 * WHAT THIS IS NOT. It is not a member. It fabricates no member row, borrows no
 * buyer-scoped profile, and grants no capability: it answers exactly one
 * question — what retail price may an anonymous Early Access viewer be shown for
 * this exact variant — and nothing else. Visibility, pathway, ordering
 * authority, and every private surface are decided elsewhere and are untouched
 * by it. It is derived on the server and can never be selected, hinted, or
 * influenced by the browser.
 *
 * WHICH AUDIENCE IT READS, AND WHY THAT IS A FOUNDER DECISION.
 * `CUSTOMER_PRICE_AUDIENCES` already contains `private_early_access`, which
 * looks like the natural home for this. But Product Control holds NO rows on
 * that audience: measured on 2026-08-20, the price table carries 417 active
 * rows and every one of them is audience `member`, with zero rows for retail,
 * private_early_access, professional or wholesale. Reading
 * `private_early_access` today would resolve nothing and leave the catalog
 * exactly as broken as it is now.
 *
 * So the published customer retail schedule currently LIVES on the member
 * audience — the 2026-08-19 and 2026-08-20 releases wrote the founder's retail
 * price book there — and this authority reads that audience deliberately, in
 * one named constant, rather than pretending a dedicated one exists.
 *
 * THE CONSEQUENCE, STATED PLAINLY: while this constant is `member`, an
 * anonymous Early Access visitor sees the same number a signed-in member sees.
 * That is correct only for as long as the member price IS the retail price. The
 * day Xenios wants member-only pricing, this must become its own audience and
 * a price release must publish rows on it — at which point the change here is
 * one line, and the rest of this file still holds.
 */

import type { CustomerPriceAudience } from "@shared/research/pricing";
import type { MasterOfferingViewerWithGrant } from "./member-pricing-viewer";

/**
 * The audience an anonymous Early Access viewer is priced against.
 *
 * Change this ONLY together with a price release that publishes rows on the new
 * audience, or every product silently returns to "Price on request".
 */
export const EARLY_ACCESS_RETAIL_PRICE_AUDIENCE: CustomerPriceAudience = "member";

/**
 * The authorization version recorded against an Early Access price decision.
 *
 * A member's version fingerprints their own row, because a member's price can
 * depend on their status. An anonymous Early Access viewer has no such row and
 * no per-visitor pricing, so the version is a single constant naming the
 * decision instead. It is stable on purpose: two anonymous visitors asking the
 * same question in the same instant must get the same authorization, or the
 * price memo would fragment per request for no reason.
 */
export const EARLY_ACCESS_RETAIL_SOURCE_VERSION =
  "early-access-retail/2026-08-20";

/**
 * The pricing viewer for an anonymous Early Access session.
 *
 * Deliberately carries NO email and the ordinary customer audience for
 * visibility, so it changes nothing about which products are shown — the item
 * set an Early Access customer sees must be identical before and after this
 * authority exists, and a test measures exactly that. The only thing it adds is
 * the grant that lets an approved price resolve.
 */
export function earlyAccessRetailPricingViewer(): MasterOfferingViewerWithGrant {
  return Object.freeze({
    audience: "member" as const,
    email: "",
    pricingGrant: Object.freeze({
      sourceVersion: EARLY_ACCESS_RETAIL_SOURCE_VERSION,
      audience: EARLY_ACCESS_RETAIL_PRICE_AUDIENCE,
    }),
  });
}

/**
 * The viewer whose grant a customer request prices against: the member's own,
 * or the Early Access retail authority, or none.
 *
 * THE ORDER MATTERS. A member's own viewer always wins, so this can never
 * quietly replace a real member's pricing. The fallback is reached only for an
 * ACTUAL Early Access session — an actor type alone is not enough, because the
 * session hash is the part a request cannot invent. Anything else, including an
 * anonymous probe and an unresolved member, gets no grant and truthfully prices
 * at "Price on request".
 *
 * This lives here, in ONE function that both the composition root and its test
 * call, because a second copy of a pricing derivation is precisely how the
 * assisted-order bridge shipped without its pricing viewer in the first place.
 */
export type PricedCustomerViewer = Readonly<{
  actorType?: string;
  earlyAccessSessionHash?: string | null;
  pricingViewer?: unknown;
}>;

export function pricingViewerForCustomerViewer(
  viewer: PricedCustomerViewer,
): MasterOfferingViewerWithGrant | undefined {
  const member = viewer.pricingViewer as
    | MasterOfferingViewerWithGrant
    | null
    | undefined;
  if (member) return member;
  const hasSession = (viewer.earlyAccessSessionHash ?? null) !== null;
  return viewer.actorType === "early_access_session" && hasSession
    ? earlyAccessRetailPricingViewer()
    : undefined;
}
