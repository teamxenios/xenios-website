// xenios research: the catalog read side.
//
// This module turns `CatalogProduct` records into the member DTOs. It is the last
// place a supplier fact can leak, so the serialization rule is enforced here rather
// than trusted to a caller: a fact reaches a member only through
// `isMemberDisplayable`, and a fact that fails it is ABSENT from the payload, not
// null and not an empty string. An absent key cannot be rendered as a blank that
// looks like data.
//
// Purchasability is never read off availability. `evaluatePurchaseEligibility` is the
// single authority, and it fails closed.

import {
  MEMBER_GOALS,
  MEMBER_GOAL_LABELS,
  evaluatePurchaseEligibility,
  isCatalogVisible,
  isMemberDisplayable,
  type CatalogProduct,
  type ProductAvailability,
  type PurchaseBlockReason,
} from "@shared/research/catalog";
import type {
  GoalDto,
  ProductDetailDto,
  ProductSummaryDto,
} from "@shared/research/commerce-api";

export interface CatalogServiceDeps {
  products: CatalogProduct[];
  commerceEnabled: boolean;
  quantumCommerceEnabled: boolean;
}

export interface CatalogService {
  listProducts(): ProductSummaryDto[];
  getProduct(slug: string): ProductDetailDto | null;
  listGoals(): GoalDto[];
}

// Member-safe sentences. None of these names a capability, environment variable,
// provider, supplier, approval counterparty, or fact key. A member learns that they
// cannot buy the item and nothing about the internals of why.
const REASON_ORDERING_CLOSED = "Ordering is not open yet.";
const REASON_NOT_AVAILABLE = "This item is not available to order.";
const REASON_DOCUMENTATION = "Product documentation is still being confirmed.";
const REASON_OUT_OF_STOCK = "This item is out of stock right now.";
const REASON_WAITLIST = "This item is available by waitlist.";
const REASON_COMING_SOON = "This item is coming soon.";

/**
 * The member sentence reports ONE reason, not the accumulated set.
 *
 * The full blocking set is retained for the admin surface by
 * `evaluatePurchaseEligibility`. Enumerating it to a member would disclose how many
 * gates exist and which one moved, which is internal detail.
 */
const BLOCK_REASON_PRIORITY: readonly PurchaseBlockReason[] = [
  "commerce_capability_disabled",
  "lane_commerce_disabled",
  "unconfirmed_commerce_critical_facts",
  "quality_documentation_incomplete",
  "commerce_not_approved",
  "availability_not_purchasable",
  "subscription_not_eligible",
] as const;

function availabilitySentence(availability: ProductAvailability): string {
  switch (availability) {
    case "out_of_stock":
      return REASON_OUT_OF_STOCK;
    case "waitlist":
      return REASON_WAITLIST;
    case "coming_soon":
      return REASON_COMING_SOON;
    default:
      return REASON_NOT_AVAILABLE;
  }
}

function memberReason(reason: PurchaseBlockReason, availability: ProductAvailability): string {
  switch (reason) {
    case "commerce_capability_disabled":
      return REASON_ORDERING_CLOSED;
    case "lane_commerce_disabled":
      return REASON_NOT_AVAILABLE;
    case "unconfirmed_commerce_critical_facts":
    case "quality_documentation_incomplete":
      return REASON_DOCUMENTATION;
    case "commerce_not_approved":
      return REASON_NOT_AVAILABLE;
    case "availability_not_purchasable":
      return availabilitySentence(availability);
    case "subscription_not_eligible":
      return REASON_NOT_AVAILABLE;
    default:
      return REASON_NOT_AVAILABLE;
  }
}

function pickReason(
  blockReasons: readonly PurchaseBlockReason[],
  availability: ProductAvailability,
): string | null {
  if (blockReasons.length === 0) return null;
  const ranked = BLOCK_REASON_PRIORITY.find((candidate) => blockReasons.includes(candidate));
  return memberReason(ranked ?? blockReasons[0], availability);
}

/**
 * Confirmed facts only, and only the three keys the wire contract allows.
 *
 * Shelf life, storage, COA, and price are deliberately not part of this shape.
 */
function confirmedFacts(product: CatalogProduct): ProductDetailDto["confirmedFacts"] {
  const out: ProductDetailDto["confirmedFacts"] = {};
  if (isMemberDisplayable(product.facts.composition)) {
    out.composition = product.facts.composition.value as string;
  }
  if (isMemberDisplayable(product.facts.strength)) {
    out.strength = product.facts.strength.value as string;
  }
  if (isMemberDisplayable(product.facts.format)) {
    out.format = product.facts.format.value as string;
  }
  return out;
}

export function createCatalogService(deps: CatalogServiceDeps): CatalogService {
  const eligibilityContext = {
    productCommerceEnabled: deps.commerceEnabled,
    quantumCommerceEnabled: deps.quantumCommerceEnabled,
  };

  const visible = deps.products.filter((product) => isCatalogVisible(product.availability));

  function toSummary(product: CatalogProduct): ProductSummaryDto {
    const priceFact = product.facts.priceCents;
    return {
      sku: product.sku,
      slug: product.slug,
      displayName: product.displayName,
      lane: product.lane,
      availability: product.availability,
      purchasable: evaluatePurchaseEligibility(product, eligibilityContext).purchasable,
      // An unconfirmed price is null. Zero would read as free.
      priceCents: isMemberDisplayable(priceFact) ? (priceFact.value as number) : null,
      goalMappings: [...product.goalMappings],
      guideState: product.guideState,
      relatedGuideSlugs: [...product.relatedGuideSlugs],
    };
  }

  return {
    listProducts(): ProductSummaryDto[] {
      return visible.map(toSummary);
    },

    getProduct(slug: string): ProductDetailDto | null {
      const product = visible.find((candidate) => candidate.slug === slug);
      if (!product) return null;

      const decision = evaluatePurchaseEligibility(product, eligibilityContext);
      return {
        ...toSummary(product),
        confirmedFacts: confirmedFacts(product),
        unavailableReason: pickReason(decision.blockReasons, product.availability),
        // The member payload never carries claims text, so this is always empty.
        prohibitedClaims: [],
        // No reviewed FAQ source exists for these records yet. An empty list is the
        // honest state; inventing entries would state supplier facts.
        faq: [],
      };
    },

    /**
     * A goal is a navigation aid. The DTO carries slugs and a label only, so there is
     * no field an effect claim could travel in.
     *
     * A goal with no mapped SKU is omitted rather than returned empty, because it is a
     * dead-end filter to a member.
     */
    listGoals(): GoalDto[] {
      const goals: GoalDto[] = [];
      for (const goal of MEMBER_GOALS) {
        const matches = visible.filter((product) => product.goalMappings.includes(goal));
        if (matches.length === 0) continue;

        const guideSlugs: string[] = [];
        for (const product of matches) {
          for (const guideSlug of product.relatedGuideSlugs) {
            if (!guideSlugs.includes(guideSlug)) guideSlugs.push(guideSlug);
          }
        }

        goals.push({
          slug: goal,
          label: MEMBER_GOAL_LABELS[goal],
          productSkus: matches.map((product) => product.sku),
          guideSlugs,
        });
      }
      return goals;
    },
  };
}
