import type { CatalogResponse } from "@shared/research/types";
import { products } from "./products-data";

/**
 * The ONE place a research catalog response is built.
 *
 * B7. This lane serves prices from the hardcoded products-data array, NOT from
 * Product Control, so nothing in the strength-dispute machinery can see it: no
 * price row means the price trigger never fires, no variant row means the
 * variant trigger never fires, and findVariantStrengthDispute is never called.
 * Three of these entries carry a strength the signed supplier master
 * contradicts, and client/src/research/components.tsx renders
 * formatMoney(product.priceCents) unconditionally, so an active member was
 * shown a firm price for a contested unit while the lane could not transact.
 *
 * The catalog is served from more than one door: GET /api/research/catalog and
 * its member-contract alias GET /api/research/member/catalog. The first fix
 * corrected only the first door, which is exactly the failure this module
 * exists to prevent. Both now build their body here, so a future third door
 * cannot reintroduce the leak by forgetting to repeat the rule.
 *
 * NULL, never 0. formatMoney(null) already renders "Pricing available after
 * review", which is the honest state, and CartPage computes with
 * `priceCents || 0`, so a zero would read as FREE. shared/research/types.ts
 * already types priceCents as `number | null`, so this needs no type change.
 *
 * CONTAINMENT, NOT CURE. When research commerce is turned ON these amounts are
 * served again with no dispute check anywhere. The durable fix is to stop
 * serving money from products-data.ts and resolve through Product Control,
 * where the gate applies.
 */
export function buildCatalogResponse(): CatalogResponse {
  const research = researchCommerceEnabled();
  return {
    products: research ? products : products.map((product) => ({ ...product, priceCents: null })),
    commerce: { research, consumer: consumerCommerceEnabled() },
    email: "research@xeniostechnology.com",
  };
}

/** The production enablement flag for the research commerce surface. */
export function researchCommerceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED === "true";
}

/** The production enablement flag for the consumer commerce surface. */
export function consumerCommerceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CONSUMER_COMMERCE_ENABLED === "true";
}
