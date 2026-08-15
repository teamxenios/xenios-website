import type { ProductRequestCategory } from "@shared/research/product-requests";
import { productRequestHref } from "@shared/research/product-request-sources";
import type { MasterOfferingAction } from "@shared/research/master-offerings/contract";
import {
  toExistingProductRequest,
  type ProductRequestHandoff,
  type Website3ProductRequestForm,
} from "../products-diagnostics/product-request-integration";
import type {
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";

export const MASTER_OFFERING_DEMAND_INTENTS = [
  "early_access_purchase",
  "request_access",
  "notify_me",
  "join_waitlist",
  "apply",
  "get_updates",
] as const;

export type MasterOfferingDemandIntent =
  (typeof MASTER_OFFERING_DEMAND_INTENTS)[number];

const CATEGORY_BY_FAMILY: Readonly<
  Record<NormalizedMasterOffering["family"], ProductRequestCategory>
> = {
  research_vials: "research_vial",
  blends: "blend",
  supplements: "supplement",
  laboratory_supplies: "laboratory_supply",
  diagnostics: "other",
  clinician_guided_care: "other",
  quantum: "quantum",
  programs: "program",
  education_and_tracking: "program",
  provider_network: "other",
  white_label_and_partners: "other",
  shipping_and_fulfillment: "other",
  clinical_formulations_503a: "other",
  research_capsules: "research_vial",
  research_peptides_materials: "research_vial",
  research_supplies: "laboratory_supply",
  topicals_regenerative: "other",
};

export function demandIntentForAction(
  action: MasterOfferingAction,
): MasterOfferingDemandIntent | null {
  switch (action.kind) {
    case "request_early_access_purchase":
      return "early_access_purchase";
    case "request_access":
    case "notify_me":
    case "join_waitlist":
    case "apply":
    case "get_updates":
      return action.kind;
    case "add_to_cart":
    case "explore_care":
    case "none":
      return null;
  }
}
export function masterOfferingDemandHref(input: {
  offering: NormalizedMasterOffering;
  variant: NormalizedMasterOfferingVariant;
  intent: MasterOfferingDemandIntent;
}): string {
  const base = new URL(productRequestHref("products", input.offering.displayName), "https://xenios.invalid");
  base.searchParams.set("offering", input.offering.id);
  base.searchParams.set("variant", input.variant.id);
  base.searchParams.set("intent", input.intent);
  return `${base.pathname}${base.search}`;
}

export interface MasterOfferingDemandSubmission {
  offering: NormalizedMasterOffering;
  variant: NormalizedMasterOfferingVariant;
  intent: MasterOfferingDemandIntent;
  idempotencyKey: string;
  contactConsent: boolean;
  notes?: string | null;
}

/**
 * Adapts catalog demand into the existing durable product-request domain. It
 * creates no order and deliberately carries no purchase quantity selector.
 */
export function toExistingMasterOfferingProductRequest(
  input: MasterOfferingDemandSubmission,
): ProductRequestHandoff {
  const form: Website3ProductRequestForm = {
    productName: input.offering.displayName,
    category: CATEGORY_BY_FAMILY[input.offering.family],
    description:
      input.intent === "early_access_purchase"
        ? `Manual Early Access purchase request for ${input.offering.displayName}.`
        : `Catalog ${input.intent.replace(/_/g, " ")} interest for ${input.offering.displayName}.`,
    brand: input.offering.brand,
    desiredFormat: input.variant.label,
    desiredSize: null,
    quantity: null,
    frequency: null,
    timing:
      // A manual Early Access purchase is a buyer asking to buy now. It is
      // still a request, not an order: no quantity, no price, no commitment.
      input.intent === "early_access_purchase"
        ? "asap"
        : input.intent === "request_access" || input.intent === "apply"
          ? "researching"
          : "future_interest",
    notes: input.notes?.trim() || null,
    contactConsent: input.contactConsent,
    attributionSource: "products",
    idempotencyKey: input.idempotencyKey,
  };
  return toExistingProductRequest(form);
}
