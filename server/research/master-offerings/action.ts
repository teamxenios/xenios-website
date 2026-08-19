import type { CartProductSelection } from "@shared/research/cart-product-selection";
import type { MasterOfferingAction } from "@shared/research/master-offerings/contract";
import { productRequestHref } from "@shared/research/product-request-sources";
import type {
  MasterOfferingCommerceIdentityBinding,
  MasterOfferingCommerceResolution,
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";

export interface MasterOfferingActionTargets {
  requestAccess: (
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ) => string;
  apply: (
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ) => string;
  notifyMe: (
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ) => string;
  joinWaitlist: (
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ) => string;
  exploreCare: (
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ) => string;
  getUpdates: (
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ) => string;
  earlyAccessPurchase: (
    offering: NormalizedMasterOffering,
    variant: NormalizedMasterOfferingVariant,
  ) => string;
}

/**
 * Behaviour a composition root may switch on. Every capability defaults to off,
 * so the resolver's default mapping is exactly the one the catalog foundation
 * shipped with and a new surface has to opt in deliberately.
 */
export interface MasterOfferingActionCapabilities {
  /**
   * Offer the manual Early Access purchase request on a member-safe variant
   * that is available now but has no direct purchase authority. It routes to
   * the existing product-request domain; it creates no cart, order, payment, or
   * quantity commitment, and it cannot appear where Product Control already
   * authorized `Add to Cart`.
   */
  manualEarlyAccessPurchase?: boolean;
}

export const DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES: MasterOfferingActionCapabilities =
  { manualEarlyAccessPurchase: false };

export const defaultMasterOfferingActionTargets: MasterOfferingActionTargets = {
  requestAccess: (offering) => productRequestHref("products", offering.displayName),
  apply: (offering) => productRequestHref("products", offering.displayName),
  notifyMe: (offering) => productRequestHref("products", offering.displayName),
  joinWaitlist: (offering) => productRequestHref("products", offering.displayName),
  exploreCare: () => "/research/member/metabolic-care",
  getUpdates: (offering) => productRequestHref("products", offering.displayName),
  earlyAccessPurchase: (offering) =>
    productRequestHref("products", offering.displayName),
};

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Runtime check for the fields this bridge relies on. The TypeScript type is not
 * trusted as validation because database and network values cross runtime seams.
 */
export function isUsableCartSelection(
  value: CartProductSelection | null,
): value is CartProductSelection {
  if (value === null || typeof value !== "object") return false;
  return (
    nonBlank(value.productId) &&
    nonBlank(value.variantId) &&
    nonBlank(value.sku) &&
    value.audienceEligibility?.state === "authorized" &&
    value.inventoryEligibility?.state === "eligible" &&
    value.canonicalReadiness?.ready === true &&
    Number.isSafeInteger(value.price?.amountCents) &&
    value.price.amountCents > 0 &&
    nonBlank(value.price.currency) &&
    nonBlank(value.evaluatedAt)
  );
}

function bindingMatches(
  variant: NormalizedMasterOfferingVariant,
  binding: MasterOfferingCommerceIdentityBinding | null,
  selection: CartProductSelection | null,
): selection is CartProductSelection {
  if (binding === null || !isUsableCartSelection(selection)) return false;
  return (
    binding.offeringVariantId === variant.id &&
    binding.productId === selection.productId &&
    binding.variantId === selection.variantId
  );
}

/**
 * Resolve one customer action.
 *
 * A spreadsheet price, display state, source SKU, or identity binding can never
 * produce Add to Cart. Only an exact matching CartProductSelection can do so.
 */
export function resolveMasterOfferingAction(
  offering: NormalizedMasterOffering,
  variant: NormalizedMasterOfferingVariant,
  commerce: MasterOfferingCommerceResolution,
  targets: MasterOfferingActionTargets = defaultMasterOfferingActionTargets,
  capabilities: MasterOfferingActionCapabilities = DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES,
): MasterOfferingAction {
  const selection = commerce.selection;
  if (
    offering.visibility === "member" &&
    variant.visibility === "member" &&
    bindingMatches(variant, commerce.binding, selection)
  ) {
    return {
      kind: "add_to_cart",
      label: "Add to Cart",
      productId: selection.productId,
      variantId: selection.variantId,
      // The selection's own SKU, already validated non-blank above. The
      // SKU-keyed member cart needs it, and echoing the resolved value is the
      // only way the browser can name a line without inventing identity.
      sku: selection.sku,
      amount: {
        amountCents: selection.price.amountCents,
        currency: selection.price.currency,
      },
      evaluatedAt: selection.evaluatedAt,
    };
  }

  // Available now, member safe, and no direct purchase authority: this is the
  // manual Early Access purchase case. It is reached only after the exact
  // CartProductSelection check above has already declined, so it can never
  // shadow or weaken a real Add to Cart.
  if (
    capabilities.manualEarlyAccessPurchase === true &&
    offering.visibility === "member" &&
    variant.visibility === "member" &&
    variant.displayState === "available_now"
  ) {
    return {
      kind: "request_early_access_purchase",
      label: "Request Early Access Purchase",
      href: targets.earlyAccessPurchase(offering, variant),
    };
  }

  switch (variant.displayState) {
    case "available_now":
    case "request_access":
      return {
        kind: "request_access",
        label: "Request Access",
        href: targets.requestAccess(offering, variant),
      };
    case "approval_required":
      return {
        kind: "apply",
        label: "Apply",
        href: targets.apply(offering, variant),
      };
    case "available_this_week":
    case "temporarily_unavailable":
      return {
        kind: "notify_me",
        label: "Notify Me",
        href: targets.notifyMe(offering, variant),
      };
    case "coming_soon":
      return {
        kind: "join_waitlist",
        label: "Join Waitlist",
        href: targets.joinWaitlist(offering, variant),
      };
    case "care_pathway":
      return {
        kind: "explore_care",
        label: "Explore Care",
        href: targets.exploreCare(offering, variant),
      };
    case "planned":
      return {
        kind: "get_updates",
        label: "Get Updates",
        href: targets.getUpdates(offering, variant),
      };
    case "unavailable":
      return { kind: "none", label: null, href: null };
  }
}
