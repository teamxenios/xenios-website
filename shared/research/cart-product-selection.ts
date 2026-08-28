import type {
  AdminProductMedia,
  AdminProductPrice,
  AdminProductSummary,
  AdminProductVariant,
} from "./product-admin";
import type { DomainReadiness, RequiredInput } from "./required-inputs";

export const CART_PURCHASE_AUDIENCES = [
  "retail",
  "member",
  "professional",
  "wholesale",
  /**
   * Private Early Access. Explicit and additive: the Early Access password
   * grants portal access only, and an approved Early Access customer is not a
   * member, so their authorization is stated in its own vocabulary rather than
   * borrowed from one. No member surface constructs this value.
   */
  "private_early_access",
] as const;

export type CartPurchaseAudience =
  (typeof CART_PURCHASE_AUDIENCES)[number];

export type CartProductSelectionRequest = {
  productId: string;
  variantId: string;
  audience: CartPurchaseAudience;
  currency: string;
  evaluatedAt: string;
};

/**
 * The future authenticated integration resolves this fact from the server-side
 * member/account tier. A requested browser audience is never authorization.
 */
export type CartAudienceEligibility = {
  audience: CartPurchaseAudience;
  state: "authorized" | "unauthorized";
  sourceVersion: string;
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
  audienceEligibility: CartAudienceEligibility | null;
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
  "audience_eligibility_missing",
  "audience_identity_mismatch",
  "audience_unauthorized",
  "variant_missing",
  "variant_ambiguous",
  "variant_product_mismatch",
  "variant_unapproved",
  "variant_inactive",
  "member_variant_ineligible",
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
  "activation_authority_missing",
  "activation_authority_not_live",
  "activation_identity_mismatch",
  "activation_evidence_invalid",
  "invalid_projection",
] as const;

export type CartProductSelectionFailureCode =
  (typeof CART_PRODUCT_SELECTION_FAILURE_CODES)[number];

export type CartProductSelection = {
  productId: string;
  variantId: string;
  sku: string;
  audience: CartPurchaseAudience;
  audienceEligibility: CartAudienceEligibility & { state: "authorized" };
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
  inventoryEligibility: Omit<CartInventoryEligibility, "reason"> & {
    state: "eligible";
  };
  evaluatedAt: string;
};

export type CartProductSelectionResult =
  | { ok: true; selection: CartProductSelection }
  | { ok: false; code: CartProductSelectionFailureCode };
