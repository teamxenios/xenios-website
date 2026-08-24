import type {
  AssistedOrderCatalogItem,
  AssistedOrderWorkflowMode,
} from "./contract";

export type AssistedOrderCatalogAuthority = Readonly<{
  productId: string;
  variantId: string;
  productName: string;
  family: string;
  channel: string;
  specification: string | null;
  format: string | null;
  packBasis: string | null;
  minimumQuantity: number;
  maximumQuantity: number | null;
  quantityIncrement: number;
  unitPriceCents: number | null;
  currency: "USD";
  catalogVersion: string;
  priceVersion: string | null;
  visible: boolean;
  directEligible: boolean;
  providerWorkflowRequired: boolean;
  classificationPending: boolean;
  pricePending: boolean;
  held: boolean;
  outOfStock: boolean;
  researchUseOnly: boolean;
  accessNotice: string | null;
}>;

export type AssistedOrderActionDecision = Readonly<{
  visible: boolean;
  workflowMode: AssistedOrderWorkflowMode;
  actionLabel: string;
  reason: string;
}>;

export function decideAssistedOrderAction(
  authority: AssistedOrderCatalogAuthority,
): AssistedOrderActionDecision {
  if (!authority.visible) {
    return Object.freeze({
      visible: false,
      workflowMode: "availability_review",
      actionLabel: "Unavailable",
      reason: "The authoritative catalog projection does not expose this item.",
    });
  }

  // Pathway before price: a provider-only or classification-pending row must
  // never present a pricing CTA to a general customer, priced or not. The
  // pathway is what blocks it; pricing is downstream of the pathway.
  if (authority.providerWorkflowRequired) {
    return Object.freeze({
      visible: true,
      workflowMode: "provider_request",
      actionLabel: "Continue through Care",
      reason: "Provider review is required before ordinary commerce.",
    });
  }

  // Availability before price: a canonical hold remains held even when its
  // price is absent. Otherwise one missing price would move a held product
  // into the Request Order filter and conceal its actual pathway state.
  if (authority.held || authority.outOfStock) {
    return Object.freeze({
      visible: true,
      workflowMode: "availability_review",
      actionLabel: authority.outOfStock
        ? "Request availability"
        : "Request review",
      reason: authority.outOfStock
        ? "This item is currently out of stock."
        : "This item is currently held for review.",
    });
  }

  if (authority.classificationPending) {
    return Object.freeze({
      visible: true,
      workflowMode: "request_activation",
      actionLabel: "Request Order",
      reason: "Classification or documentation must be completed first.",
    });
  }

  if (authority.unitPriceCents === null || authority.pricePending) {
    return Object.freeze({
      visible: true,
      workflowMode: "request_pricing",
      actionLabel: "Request pricing",
      reason: "No approved customer price is currently available.",
    });
  }

  if (authority.directEligible) {
    return Object.freeze({
      visible: true,
      workflowMode: "direct_order_request",
      actionLabel: "Add to order request",
      reason: "The item is eligible for assisted order intake.",
    });
  }

  return Object.freeze({
    visible: true,
    workflowMode: "request_activation",
    actionLabel: "Request item",
    reason: "The item is visible but does not currently have direct authority.",
  });
}

export function projectAssistedOrderCatalogItem(
  authority: AssistedOrderCatalogAuthority,
): AssistedOrderCatalogItem | null {
  const action = decideAssistedOrderAction(authority);
  if (!action.visible) {
    return null;
  }
  if (!Number.isSafeInteger(authority.minimumQuantity) || authority.minimumQuantity < 1) {
    throw new Error("Catalog minimum quantity must be a positive integer.");
  }
  if (!Number.isSafeInteger(authority.quantityIncrement) || authority.quantityIncrement < 1) {
    throw new Error("Catalog quantity increment must be a positive integer.");
  }
  if (
    authority.maximumQuantity !== null &&
    (!Number.isSafeInteger(authority.maximumQuantity) ||
      authority.maximumQuantity < authority.minimumQuantity)
  ) {
    throw new Error("Catalog maximum quantity is invalid.");
  }
  if (
    authority.unitPriceCents !== null &&
    (!Number.isSafeInteger(authority.unitPriceCents) || authority.unitPriceCents < 1)
  ) {
    throw new Error("Catalog price must be null or a positive integer.");
  }

  return Object.freeze({
    productId: authority.productId,
    variantId: authority.variantId,
    productName: authority.productName,
    family: authority.family,
    channel: authority.channel,
    specification: authority.specification,
    format: authority.format,
    packBasis: authority.packBasis,
    minimumQuantity: authority.minimumQuantity,
    maximumQuantity: authority.maximumQuantity,
    quantityIncrement: authority.quantityIncrement,
    unitPriceCents: authority.unitPriceCents,
    currency: authority.currency,
    workflowMode: action.workflowMode,
    actionLabel: action.actionLabel,
    accessNotice: authority.accessNotice,
    researchUseOnly: authority.researchUseOnly,
    catalogVersion: authority.catalogVersion,
    priceVersion: authority.priceVersion,
  });
}

export function quantityIsAllowed(
  item: Pick<
    AssistedOrderCatalogItem,
    "minimumQuantity" | "maximumQuantity" | "quantityIncrement"
  >,
  quantity: number,
): boolean {
  if (!Number.isSafeInteger(quantity) || quantity < item.minimumQuantity) {
    return false;
  }
  if (item.maximumQuantity !== null && quantity > item.maximumQuantity) {
    return false;
  }
  return (quantity - item.minimumQuantity) % item.quantityIncrement === 0;
}
