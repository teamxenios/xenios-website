import {
  MASTER_OFFERING_DISPLAY_LABELS,
  MASTER_OFFERING_FAMILY_LABELS,
  type MasterOfferingCardView,
  type MasterOfferingDetailView,
  type MasterOfferingVariantView,
} from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_PRICE_ON_REQUEST,
  type MasterOfferingPriceView,
} from "@shared/research/master-offerings/pricing-contract";
import {
  DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES,
  defaultMasterOfferingActionTargets,
  resolveMasterOfferingAction,
  type MasterOfferingActionCapabilities,
} from "./action";
import {
  NO_MASTER_OFFERING_PRICES,
  priceForVariant,
  projectMasterOfferingVariantSummaries,
  summarizeOfferingPrices,
  type MasterOfferingPriceMap,
} from "./price-projection";
import type {
  MasterOfferingCommerceResolver,
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";

export const MASTER_OFFERING_CATALOG_DISCLOSURE =
  "Catalog visibility does not establish availability, clinical suitability, or purchase eligibility. Product Control remains the purchase authority.";

export const MASTER_OFFERING_RESEARCH_DISCLOSURE =
  "Research listings are presented for nonclinical catalog navigation. They are not treatment recommendations or instructions for human use.";

function noCommerce(): ReturnType<MasterOfferingCommerceResolver> {
  return { binding: null, selection: null };
}

export const noMasterOfferingCommerce: MasterOfferingCommerceResolver = noCommerce;

export function projectMasterOfferingVariant(
  offering: NormalizedMasterOffering,
  variant: NormalizedMasterOfferingVariant,
  commerce: MasterOfferingCommerceResolver = noMasterOfferingCommerce,
  price: MasterOfferingPriceView = MASTER_OFFERING_PRICE_ON_REQUEST,
  capabilities: MasterOfferingActionCapabilities = DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES,
): MasterOfferingVariantView {
  return {
    id: variant.id,
    label: variant.label,
    displayState: variant.displayState,
    displayLabel: MASTER_OFFERING_DISPLAY_LABELS[variant.displayState],
    price,
    action: resolveMasterOfferingAction(
      offering,
      variant,
      commerce(offering, variant),
      defaultMasterOfferingActionTargets,
      capabilities,
    ),
  };
}

export function projectMasterOfferingCard(
  offering: NormalizedMasterOffering,
  prices: MasterOfferingPriceMap = NO_MASTER_OFFERING_PRICES,
): MasterOfferingCardView {
  if (offering.visibility !== "member") {
    throw new Error(`Refused to project admin-only offering ${offering.id}`);
  }
  return {
    id: offering.id,
    slug: offering.slug,
    displayName: offering.displayName,
    canonicalName: offering.canonicalName,
    family: offering.family,
    familyLabel: MASTER_OFFERING_FAMILY_LABELS[offering.family],
    category: offering.category,
    subcategory: offering.subcategory,
    brand: offering.brand,
    displayState: offering.displayState,
    displayLabel: MASTER_OFFERING_DISPLAY_LABELS[offering.displayState],
    stateExplanation: offering.stateExplanation,
    copyState: offering.copyState,
    variantCount: offering.variants.length,
    variants: projectMasterOfferingVariantSummaries(offering, prices),
    priceSummary: summarizeOfferingPrices(offering, prices),
  };
}

export function projectMasterOfferingDetail(
  offering: NormalizedMasterOffering,
  commerce: MasterOfferingCommerceResolver = noMasterOfferingCommerce,
  prices: MasterOfferingPriceMap = NO_MASTER_OFFERING_PRICES,
  capabilities: MasterOfferingActionCapabilities = DEFAULT_MASTER_OFFERING_ACTION_CAPABILITIES,
): MasterOfferingDetailView {
  const disclosures = [MASTER_OFFERING_CATALOG_DISCLOSURE];
  if (
    offering.family === "research_vials" ||
    offering.family === "blends" ||
    offering.family === "laboratory_supplies"
  ) {
    disclosures.unshift(MASTER_OFFERING_RESEARCH_DISCLOSURE);
  }
  return {
    ...projectMasterOfferingCard(offering, prices),
    overview: null,
    variants: offering.variants.map((variant) =>
      projectMasterOfferingVariant(
        offering,
        variant,
        commerce,
        priceForVariant(prices, variant),
        capabilities,
      ),
    ),
    disclosures,
  };
}

export function projectMasterOfferingList(
  offerings: readonly NormalizedMasterOffering[],
  prices: MasterOfferingPriceMap = NO_MASTER_OFFERING_PRICES,
): readonly MasterOfferingCardView[] {
  return offerings.map((offering) =>
    projectMasterOfferingCard(offering, prices),
  );
}
