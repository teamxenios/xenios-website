import type { AuthoritativeCartProductSelection } from "../commerce/cart-product-selection";
import type { MasterOfferingAction } from "@shared/research/master-offerings/contract";
import {
  isDirectPurchaseForbidden,
  requiresProviderPathway,
} from "@shared/research/master-offerings/pathway-authority";
import { productRequestHref } from "@shared/research/product-request-sources";
import { isResolvedCurrentLiveProductVariantActivationAuthority } from "../product-activation/authority-repository";
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
  /**
   * The normalized specifications the founder's reviewed reconciliation
   * currently holds out of direct purchase.
   *
   * Optional so existing callers compile, but a purchase-deciding composition
   * MUST supply it: without it a reviewed hold is invisible here, and the only
   * thing standing between a formulation-unresolved product and a cart is the
   * declared marker, which the canonical rewrite removes from the customer-
   * facing specification. `reviewedHeldSpecifications()` is the reader.
   */
  reviewedFormulationHolds?: ReadonlySet<string> | null;
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
  value: AuthoritativeCartProductSelection | null,
): value is AuthoritativeCartProductSelection {
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
    nonBlank(value.evaluatedAt) &&
    isResolvedCurrentLiveProductVariantActivationAuthority(value.activationAuthority, {
      productId: value.productId,
      variantId: value.variantId,
      sku: value.sku,
      evaluatedAt: value.evaluatedAt,
    })
  );
}

function bindingMatches(
  variant: NormalizedMasterOfferingVariant,
  binding: MasterOfferingCommerceIdentityBinding | null,
  selection: AuthoritativeCartProductSelection | null,
): selection is AuthoritativeCartProductSelection {
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
  // A provider-pathway row can never be a direct purchase, whatever Product
  // Control says about it.
  //
  // This arm used to check visibility and the binding only. The purchase
  // authority behind it gates on Product Control facts — commerce approval and
  // stock — and Product Control has no notion of the master-offerings care
  // pathway, which is never passed to it. So 244 of the 420 variants, every one
  // of them carrying the copy "Fulfilled through the provider pathway... Not
  // available for direct purchase", and every one bound to a Product Control
  // identity with an active member price, would have rendered "Add to Cart" the
  // moment direct commerce was enabled.
  //
  // The omission read as deliberate because the NEXT arm checks displayState,
  // and it stayed invisible because the flag is off. Care separation is a
  // standing rule, not a flag-dependent one: it is enforced here, before
  // authority is consulted.
  //
  // The rule itself now lives in the shared pathway authority rather than in an
  // expression here, because the assisted-order lane was deciding the same
  // thing from a wider fact set (it also refuses the whole
  // `clinical_formulations_503a` family). The two agreed only because every
  // 503a row happens to carry `care_pathway` today; one workbook edit would
  // have split them. One predicate, both lanes.
  const forbidden = isDirectPurchaseForbidden({
    family: offering.family,
    displayState: offering.displayState,
    variantDisplayState: variant.displayState,
    // The declared specification, so a row the founder has held, or one that
    // says its own formulation is unresolved, is refused before any purchase
    // authority is consulted.
    specification: variant.label,
    reviewedHolds: capabilities.reviewedFormulationHolds,
  });
  if (
    !forbidden &&
    offering.visibility === "member" &&
    variant.visibility === "member" &&
    offering.displayState === "available_now" &&
    variant.displayState === "available_now" &&
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
  //
  // It carries the same forbidden-row guard as Add to Cart. A manual purchase
  // request is still a request to BUY, so a provider-required row must not
  // offer one by the side door just because it has no Product Control
  // authority yet.
  if (
    !forbidden &&
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

  // A provider-required row routes to Care whatever its display state says.
  //
  // For every row shipping today this returns exactly what the `care_pathway`
  // switch arm below already returned, so the rendered catalog does not move.
  // It matters for the row that is provider-required by FAMILY while carrying
  // some other display state: without this, such a row would fall through to
  // "Request Access", which invites a customer down a research-use-only path
  // for a product that requires a provider.
  if (
    requiresProviderPathway({
      family: offering.family,
      displayState: offering.displayState,
      variantDisplayState: variant.displayState,
      specification: variant.label,
      reviewedHolds: capabilities.reviewedFormulationHolds,
    })
  ) {
    return {
      kind: "explore_care",
      label: "Explore Care",
      href: targets.exploreCare(offering, variant),
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
