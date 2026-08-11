import {
  MASTER_OFFERING_DISPLAY_LABELS,
  MASTER_OFFERING_FAMILY_LABELS,
  type MasterOfferingCardView,
  type MasterOfferingDetailView,
  type MasterOfferingVariantView,
} from "@shared/research/master-offerings/contract";
import { resolveMasterOfferingAction } from "./action";
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
): MasterOfferingVariantView {
  return {
    id: variant.id,
    label: variant.label,
    displayState: variant.displayState,
    displayLabel: MASTER_OFFERING_DISPLAY_LABELS[variant.displayState],
    action: resolveMasterOfferingAction(
      offering,
      variant,
      commerce(offering, variant),
    ),
  };
}

export function projectMasterOfferingCard(
  offering: NormalizedMasterOffering,
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
  };
}

export function projectMasterOfferingDetail(
  offering: NormalizedMasterOffering,
  commerce: MasterOfferingCommerceResolver = noMasterOfferingCommerce,
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
    ...projectMasterOfferingCard(offering),
    overview: null,
    variants: offering.variants.map((variant) =>
      projectMasterOfferingVariant(offering, variant, commerce),
    ),
    disclosures,
  };
}

export function projectMasterOfferingList(
  offerings: readonly NormalizedMasterOffering[],
): readonly MasterOfferingCardView[] {
  return offerings.map(projectMasterOfferingCard);
}
