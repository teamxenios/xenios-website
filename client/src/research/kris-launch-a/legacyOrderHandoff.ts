import type { KrisCatalogItemView } from "@shared/research/kris-launch-a/contract";
import type { EarlyAccessCatalogSelection } from "../early-access/EarlyAccessCatalogSection";

// Deliberately memory-only. The partner price is confidential account data and
// must not be persisted to localStorage/sessionStorage merely to cross a route.
let pending: EarlyAccessCatalogSelection | null = null;

export function queueKrisLegacyOrder(item: KrisCatalogItemView): boolean {
  if (
    item.purchaseMode !== "direct_eligible" ||
    item.canBuyNow !== true ||
    item.legacyOrder === null ||
    item.price.state !== "priced"
  ) {
    return false;
  }

  pending = Object.freeze({
    product: Object.freeze({
      productId: item.legacyOrder.productId,
      variantId: item.legacyOrder.variantId,
      name: item.displayName,
      strength: item.specification,
      unitPriceCents: item.price.amountCents,
      currency: item.price.currency,
      description: `${item.access.statusLabel}. ${item.suppliedNote}`,
      availability: "AVAILABLE" as const,
      // First live Roman purchase is intentionally one unit. The placement
      // route still re-reads the active Product Control/release authority.
      quantityLimit: 1,
    }),
    quantity: 1,
  });
  return true;
}

export function consumeKrisLegacyOrder(): EarlyAccessCatalogSelection | null {
  const value = pending;
  pending = null;
  return value;
}

export function clearKrisLegacyOrder(): void {
  pending = null;
}
