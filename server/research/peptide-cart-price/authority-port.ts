import type { CustomerPriceAudience } from "@shared/research/pricing";
import {
  bindCartPrice,
  type BindCartPriceInput,
  type CartPriceBindingDeps,
  type CartPriceBindingResult,
} from "../pricing/cart-price-binding";

/**
 * Narrow adapter over the existing canonical Product Control price-binding
 * core. This lane composes that authority; it does not select or invent a
 * second price.
 */
export interface CanonicalCartPriceAuthorityPort {
  bind(input: BindCartPriceInput): Promise<CartPriceBindingResult>;
}

export function createCanonicalCartPriceAuthorityPort(
  deps: CartPriceBindingDeps,
): CanonicalCartPriceAuthorityPort {
  return Object.freeze({
    bind(input: BindCartPriceInput) {
      return bindCartPrice(input, deps);
    },
  });
}

/**
 * Product Control quantity facts are deliberately returned as unknown. The
 * transaction kernel validates exact coverage, shape, versions, and windows
 * before allowing a price lookup.
 */
export interface ProductControlQuantityLimitPort {
  resolveQuantityLimits(input: {
    skus: readonly string[];
    audience: CustomerPriceAudience;
    evaluatedAt: string;
  }): Promise<unknown>;
}

export interface ProductControlQuantityLimitFact {
  sku: string;
  minQuantity: number;
  maxQuantity: number;
  increment: number;
  sourceVersion: string;
  effectiveAt: string;
  expiresAt: string | null;
}
