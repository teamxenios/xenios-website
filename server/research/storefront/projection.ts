/**
 * The public storefront projection: canonical catalog answer in, customer-safe
 * public shapes out.
 *
 * Pure and framework free. Everything consequential was already decided by the
 * MasterOfferingCatalogService for a viewer with no pricing grant; this module
 * copies the safe subset field by field and translates each variant's resolved
 * action into the closed six-word launch vocabulary. Field-by-field on
 * purpose: a spread would silently forward whatever the member contract grows
 * next, and the whole point of a public projection is that nothing crosses it
 * unless someone wrote its name here.
 */

import type {
  MasterOfferingCardView,
  MasterOfferingCatalogPage,
  MasterOfferingDetailView,
  MasterOfferingVariantSummary,
} from "@shared/research/master-offerings/contract";
import { isDisplayablePrice } from "@shared/research/master-offerings/pricing-contract";
import { customerActionFromMasterOfferingAction } from "@shared/research/launch/customer-action";
import {
  strongestPublicAction,
  type PublicStorefrontCard,
  type PublicStorefrontDetail,
  type PublicStorefrontFacets,
  type PublicStorefrontPage,
  type PublicStorefrontPriceView,
  type PublicStorefrontVariant,
} from "@shared/research/storefront/contract";

function toPublicPrice(
  variant: MasterOfferingVariantSummary,
): PublicStorefrontPriceView {
  const price = variant.price;
  // isDisplayablePrice revalidates the amount (positive safe integer, non-blank
  // display), so a malformed upstream price degrades to on-request here rather
  // than reaching a public page as a number nobody approved.
  if (!isDisplayablePrice(price)) return { state: "on_request" };
  return {
    state: "priced",
    amountCents: price.amountCents,
    currency: price.currency,
    display: price.display,
  };
}

function toPublicVariant(
  variant: MasterOfferingVariantSummary,
): PublicStorefrontVariant {
  return {
    id: variant.id,
    label: variant.label,
    displayLabel: variant.displayLabel,
    displayState: variant.displayState,
    // The one closed translation. It can restate or downgrade the resolved
    // action, never widen it: a variant the catalog refused to sell cannot
    // become BUY_NOW by passing through here.
    action: customerActionFromMasterOfferingAction(variant.action, variant.price),
    price: toPublicPrice(variant),
  };
}

export function toPublicStorefrontCard(
  product: MasterOfferingCardView,
): PublicStorefrontCard {
  const variants = product.variants.map(toPublicVariant);
  return {
    slug: product.slug,
    family: product.family,
    familyLabel: product.familyLabel,
    displayName: product.displayName,
    category: product.category,
    subcategory: product.subcategory,
    displayState: product.displayState,
    displayLabel: product.displayLabel,
    stateExplanation: product.stateExplanation,
    variantCount: product.variantCount,
    variants,
    priceSummary: product.priceSummary.display,
    action: strongestPublicAction(variants.map((variant) => variant.action)),
  };
}

export function toPublicStorefrontDetail(
  product: MasterOfferingDetailView,
): PublicStorefrontDetail {
  return {
    ...toPublicStorefrontCard(product),
    overview: product.overview,
    disclosures: product.disclosures,
  };
}

function toPublicFacets(
  facets: MasterOfferingCatalogPage["facets"],
): PublicStorefrontFacets {
  return {
    families: facets.families.map((bucket) => ({
      value: bucket.value,
      label: bucket.label,
      count: bucket.count,
    })),
    categories: facets.categories.map((bucket) => ({
      value: bucket.value,
      label: bucket.label,
      count: bucket.count,
    })),
  };
}

export function toPublicStorefrontPage(
  page: MasterOfferingCatalogPage,
): PublicStorefrontPage {
  return {
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    totalPages: page.totalPages,
    sort: page.sort,
    products: page.products.map(toPublicStorefrontCard),
    facets: toPublicFacets(page.facets),
  };
}
