import type {
  AdminProductMedia,
  AdminProductPrice,
  AdminProductSummary,
  AdminProductVariant,
  PriceAudience,
} from "./product-admin";
import type { DomainReadiness, RequiredInput } from "./required-inputs";

export type CartProductSelectionRequest = {
  productId: string;
  variantId: string;
  audience: PriceAudience;
  currency: string;
  evaluatedAt: string;
};

/**
 * Website 4 supplies this fact. It deliberately carries no quantity, lot,
 * location, reservation, fulfillment, or provider data.
 */
export type CartInventoryEligibility = {
  productId: string;
  variantId: string;
  state: "eligible" | "unavailable" | "unknown";
  reason: string | null;
  sourceVersion: string;
  evaluatedAt: string;
};

export type CartProductSelectionSource = {
  products: readonly AdminProductSummary[];
  variants: readonly AdminProductVariant[];
  prices: readonly AdminProductPrice[];
  media: readonly AdminProductMedia[];
  requiredInputs: readonly RequiredInput[];
  readiness: readonly DomainReadiness[];
  inventoryEligibility: CartInventoryEligibility | null;
};

export const CART_PRODUCT_SELECTION_FAILURE_CODES = [
  "invalid_request",
  "product_missing",
  "product_ambiguous",
  "product_not_published",
  "product_inactive",
  "product_hidden",
  "product_commerce_unapproved",
  "product_unavailable",
  "variant_missing",
  "variant_ambiguous",
  "variant_product_mismatch",
  "variant_unapproved",
  "variant_inactive",
  "variant_sku_missing",
  "price_missing",
  "price_currency_mismatch",
  "price_unapproved",
  "price_stale",
  "price_ambiguous",
  "media_missing",
  "media_unapproved",
  "media_ambiguous",
  "required_inputs_incomplete",
  "readiness_incomplete",
  "inventory_eligibility_missing",
  "inventory_identity_mismatch",
  "inventory_unavailable",
  "invalid_projection",
] as const;

export type CartProductSelectionFailureCode =
  (typeof CART_PRODUCT_SELECTION_FAILURE_CODES)[number];

export type CartProductSelection = {
  productId: string;
  variantId: string;
  sku: string;
  audience: PriceAudience;
  price: {
    id: string;
    amountCents: number;
    currency: string;
    effectiveAt: string;
    expiresAt: string | null;
    version: number;
  };
  media: {
    id: string;
    kind: "primary_image";
    altText: string;
  };
  canonicalReadiness: {
    ready: true;
    verifiedInputCount: number;
    inputVersions: Array<{ id: string; version: number }>;
    domainVersions: Array<{ domain: string; version: number }>;
  };
  inventoryEligibility: CartInventoryEligibility & { state: "eligible" };
  evaluatedAt: string;
};

export type CartProductSelectionResult =
  | { ok: true; selection: CartProductSelection }
  | { ok: false; code: CartProductSelectionFailureCode };
