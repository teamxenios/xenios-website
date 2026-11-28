import {
  projectAssistedOrderCatalogItem,
} from "../../../../shared/research/assisted-order/action-policy";
import {
  ASSISTED_ORDER_CATALOG_SORTS, assistedOrderActionGroupFor, type AssistedOrderCatalogQuery,
} from "../../../../shared/research/assisted-order/contract";
import type { RequestIntentCatalogItem, RequestIntentCatalogPage } from "../../../../shared/research/assisted-order/request-intent";
import { MASTER_OFFERING_FAMILIES, isMasterOfferingFamily } from "../../../../shared/research/master-offerings/contract";
import { isTopicalCatalogForm } from "../../../../shared/research/assisted-order/catalog-category";
import { directPurchaseRefusal } from "../../../../shared/research/master-offerings/pathway-authority";
import { requestStoreWidening } from "../../../../shared/research/master-offerings/quote-cart";
import { HCG_STRENGTH_REVIEW, isHcgStrengthReview } from "../../../../shared/research/master-offerings/hcg-strength-review";
import { authorityFor, type AssistedOrderMasterCatalogInput } from "../production-catalog";
import type { AssistedOrderViewer } from "../ports";
import { getInquiryDisplayContent, getReviewedProductMedia, isReviewedDatasetVariant } from "../../master-offerings/reviewed-content";
import {
  REVIEWED_SEARCH_TERMS, matchesReviewedSearchTerm, type ReviewedSearchTermEntry, type ReviewedSearchTerms,
} from "../../master-offerings/reviewed-search-terms";
import { inquiryReviewStateFor } from "../../master-offerings/inquiry-review-states";
import { isPublishableSupplement } from "../../master-offerings/catalog-publication-eligibility";
import { isResearchFormUnconfirmed, researchListingSubcategory } from "../../../../client/src/research/product-media/reviewed-form-holds";
import { isFormulationHeld } from "../../../../shared/research/master-offerings/formulation-hold";

import { catalogSearchText, matchesCatalogSearch } from "./catalog-search";
import { readPilotDisplay, type CatalogPublicationPilot, type PublicationSubject } from "./published-catalog-display";
import { candidateRankOrders, readCatalogRankingSource, type RankingSource } from "./ranking-source";

/**
 * The catalog forms search may read, exactly as the listing card prints them
 * (`researchListingSubcategory`). A form-held row prints none, so it gets none
 * here: a search for a form word never lists a row whose form the page
 * withholds. A closed list: a new value is not searched until it is added here
 * or to UNSEARCHED_CATALOG_FORM_VALUES on purpose.
 */
export const SEARCHABLE_CATALOG_FORMS = [
  "Capsule", "Capsules", "Compounded Vial / Liquid", "Injectable Solution", "Nasal Spray", "ODT / Tablet",
  "Solution", "Tablet", "Topical Cream", "Topical Gel / Serum", "Topical Serum", "Troche",
] as const;

/** Values the dataset carries in the form field that name no form. They are never searched. */
export const UNSEARCHED_CATALOG_FORM_VALUES = [
  "Form not stated", "Included Supply", "Listed Unit", "Shipping Service", "Supplement Unit",
] as const;

/** The form a row may be found by, or null. Search only: it never enters the DTO. */
export function searchableCatalogForm(offering: Parameters<typeof researchListingSubcategory>[0]): string | null {
  const shown = researchListingSubcategory(offering);
  return shown !== null && (SEARCHABLE_CATALOG_FORMS as readonly string[]).includes(shown) ? shown : null;
}

export type RequestIntentCatalog = Readonly<{
  list(viewer: AssistedOrderViewer, query: AssistedOrderCatalogQuery): Promise<RequestIntentCatalogPage>;
  resolveMany(viewer: AssistedOrderViewer, identities: readonly Readonly<{ productId: string; variantId: string }>[]): Promise<readonly (RequestIntentCatalogItem | null)[]>;
}>;

/** Same viewer-scoped master reader, binding artifact, price and pathway authorities. No copied catalog. */
export function createRequestIntentCatalog(input: AssistedOrderMasterCatalogInput & { readonly publication?: CatalogPublicationPilot },
  rankingSource: RankingSource = readCatalogRankingSource, clock: () => number = Date.now,
  reviewedSearchTerms: ReviewedSearchTerms = REVIEWED_SEARCH_TERMS): RequestIntentCatalog {
  const searchAliases = new WeakMap<RequestIntentCatalogItem, string>();
  // Reviewed alternative names (reviewed-search-terms.ts). Search only: never in the DTO.
  const reviewedTerms = new WeakMap<RequestIntentCatalogItem, readonly ReviewedSearchTermEntry[]>();
  // Rows whose dataset form says topical. Filter only: the form never enters the DTO here.
  const topicalForm = new WeakSet<RequestIntentCatalogItem>();
  async function visible(viewer: AssistedOrderViewer, pilotRows?: Map<RequestIntentCatalogItem, PublicationSubject>): Promise<RequestIntentCatalogItem[]> {
    const service = input.serviceFor(viewer);
    if (!service) throw new Error("request_intent_catalog_unavailable");
    const items: RequestIntentCatalogItem[] = [];
    const seen = new Set<string>();
    const seenIdentities = new Set<string>();
    let total: number | null = null;
    for (let page = 1; page <= 500; page += 1) {
      const selection = await service.select({ page, pageSize: 100 });
      if (!Number.isSafeInteger(selection.page.total) || selection.page.total < 0
        || selection.page.page !== page || selection.page.pageSize < 1) {
        throw new Error("request_intent_catalog_page_invalid");
      }
      if (total !== null && total !== selection.page.total) throw new Error("request_intent_catalog_changed");
      total = selection.page.total;
      for (const offering of selection.offerings) {
        // Preserve the existing offering-based pagination contract.
        if (offering.variants.length !== 1) throw new Error("request_intent_catalog_topology_changed");
        const variant = offering.variants[0];
        if (seen.has(variant.id)) throw new Error("request_intent_catalog_duplicate");
        seen.add(variant.id);
        const authority = authorityFor(offering, variant, selection.prices.get(variant.id),
          input.bindingFor(variant.id), input.catalogVersion, input.reviewedFormulationHolds);
        const item = projectAssistedOrderCatalogItem(authority);
        if (!item) throw new Error("request_intent_catalog_visibility_mismatch");
        const identity = JSON.stringify([item.productId, item.variantId]);
        if (seenIdentities.has(identity)) throw new Error("request_intent_catalog_identity_ambiguous");
        seenIdentities.add(identity);
        const refusal = directPurchaseRefusal({
          family: offering.family, displayState: offering.displayState,
          variantDisplayState: variant.displayState, specification: variant.label,
          reviewedHolds: input.reviewedFormulationHolds,
        });
        // One rule, shared with the member catalog's quote-cart action.
        const { comingSoon, nonMerchandise } = requestStoreWidening({
          family: offering.family, displayState: offering.displayState,
          variantDisplayState: variant.displayState, specification: variant.label,
          reviewedHolds: input.reviewedFormulationHolds,
        });
        const strengthReview = isHcgStrengthReview(offering.id, variant.id);
        const widerStoreNeeded = comingSoon || nonMerchandise;
        // A reviewed state for a listing with no reviewed description, or whose
        // label states an unconfirmed fact. Only its customer fields are used here.
        const reviewState = inquiryReviewStateFor(offering.id, variant.id);
        const held = reviewState !== null || strengthReview || isResearchFormUnconfirmed(variant.id, offering.id)
          || isFormulationHeld(variant.label, input.reviewedFormulationHolds);
        const reviewedVariant = isReviewedDatasetVariant(offering, variant);
        const reviewedContent = getInquiryDisplayContent(offering, variant, reviewState);
        const reviewedMedia = getReviewedProductMedia(offering, variant);
        items.push({
          ...item,
          ...(reviewedContent ? { reviewedContent } : {}),
          ...(reviewedMedia ? { reviewedMedia } : {}),
          ...(reviewState ? {
            specification: reviewState.neutralSpecification ?? item.specification,
            reviewMessage: reviewState.customerMessage,
          } : {}),
          // A clinical request is not a quote. Never present its price as permission to buy.
          unitPriceCents: authority.providerWorkflowRequired ? null : item.unitPriceCents,
          priceVersion: authority.providerWorkflowRequired ? null : item.priceVersion,
          sourceSelection: { family: offering.family, slug: offering.slug, variantId: variant.id },
          // Every listed row may be asked about. An inquiry is not an offer: it
          // authorizes no purchase, prescription, payment, reservation or shipment.
          // A held row is always selectable, with its disputed detail withheld.
          // A coming-soon row and a supply or service row are selectable only once
          // the request store accepts their lines (see allListedInquirable).
          selectableForReview: !widerStoreNeeded || input.allListedInquirable === true,
          // The reason a line needs a human decision. It excludes the row only
          // while selectableForReview is false.
          intentExclusion: strengthReview ? "specification_review"
            : nonMerchandise ? "non_merchandise" : comingSoon ? "coming_soon"
            : reviewState ? "specification_review" : null,
          clinicalReviewRequired: authority.providerWorkflowRequired,
          sourceDisplayState: offering.displayState,
          sourceVariantDisplayState: variant.displayState,
          sourceRefusal: refusal,
          actionLabel: strengthReview || (reviewState && !comingSoon && !nonMerchandise)
            ? HCG_STRENGTH_REVIEW.actionLabel
            : comingSoon ? "Coming soon"
            : nonMerchandise ? (input.allListedInquirable === true ? "Supply or service inquiry" : "Not a product request")
            : "Add to quote cart",
        });
        if (pilotRows && input.publication?.selected.offeringVariantId === variant.id
          && isPublishableSupplement(offering, variant, input.reviewedFormulationHolds)) {
          pilotRows.set(items[items.length - 1], { offeringId: offering.id, offeringVariantId: variant.id,
            productId: item.productId, variantId: item.variantId });
        }
        // The listing's dataset aliases, which include its listed name and label, so a reviewed
        // heading or neutral line does not hide the listed words from search. Search only: the
        // aliases never enter the DTO, and a match shows the row, not any withheld detail. The
        // member catalog search reads the same aliases. One alias per line, so search reads each
        // alias as its own phrase and an amount in one is never tied to a name in another.
        // The row's printed form is one more line, so it is read as its own phrase too.
        const form = searchableCatalogForm(offering);
        searchAliases.set(items[items.length - 1], [...offering.aliases, ...(form ? [form] : [])].join("\n"));
        if (isTopicalCatalogForm(offering.subcategory)) topicalForm.add(items[items.length - 1]);
        // A held row gets no reviewed term; its listed words above still find it. The holds are
        // the current ones, read here on every catalog read, never copied into the term table.
        const terms = held || !reviewedVariant
          ? undefined : reviewedSearchTerms.entriesFor(offering.id, variant.id);
        if (terms) reviewedTerms.set(items[items.length - 1], terms);
      }
      if (seen.size === total) return items;
      if (seen.size > total || selection.offerings.length === 0) throw new Error("request_intent_catalog_incomplete");
    }
    // Never silently call a truncated catalog complete.
    throw new Error("request_intent_catalog_scan_limit");
  }

  return {
    async list(viewer, query) {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 24;
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new Error("request_intent_page_invalid");
      }
      if (query.sort !== undefined && !ASSISTED_ORDER_CATALOG_SORTS.includes(query.sort)) {
        throw new Error("request_intent_sort_invalid");
      }
      if (query.presentation !== undefined && query.presentation !== "topicals") {
        throw new Error("request_intent_presentation_invalid");
      }
      const search = query.search?.trim() ?? "";
      const pilotRows = input.publication ? new Map<RequestIntentCatalogItem, PublicationSubject>() : undefined;
      const snapshot = await visible(viewer, pilotRows);
      const filtered = snapshot.filter((item) =>
        (!query.family || (isMasterOfferingFamily(query.family) && item.family === query.family))
        && (!query.presentation || topicalForm.has(item))
        && (!query.channel || item.channel === query.channel)
        && (!query.actionGroup || assistedOrderActionGroupFor(item.workflowMode) === query.actionGroup)
        && (query.actionGroup !== undefined || !query.workflowMode || item.workflowMode === query.workflowMode)
        && (!search || matchesCatalogSearch(
          catalogSearchText([item.productName, item.specification, searchAliases.get(item)], item.variantId), search)
          || matchesReviewedSearchTerm(reviewedTerms.get(item), search, clock)));
      // Sorting is over the whole filtered catalog, before paging, so page 2 follows
      // page 1 in the chosen order. Absent sort keeps the catalog's own order.
      //
      // Z to A reverses the names only: inside one name the specifications still
      // run in ascending order, as written, in both directions.
      //
      // The order is total. The last two keys are the row's variant id and product
      // id, and the catalog refuses two rows with the same pair, so no two rows
      // compare equal and the result does not depend on the catalog's own order.
      const direction = query.sort === "name_desc" ? -1 : 1;
      const byName = (left: RequestIntentCatalogItem, right: RequestIntentCatalogItem) =>
        direction * left.productName.localeCompare(right.productName, "en", { sensitivity: "base", numeric: true })
        || (left.specification ?? "").localeCompare(right.specification ?? "", "en", { sensitivity: "base", numeric: true })
        || left.variantId.localeCompare(right.variantId)
        || left.productId.localeCompare(right.productId);
      // An expired or unreadable aggregate never blocks the ordinary catalog. No ranking source is
      // read until visibility has been established; no hidden identities or counts go in the DTO.
      let aggregate: unknown = null;
      if (filtered.length > 1) try { aggregate = await rankingSource(); } catch { /* optional source unavailable */ }
      const rankOrders = candidateRankOrders(aggregate, filtered, clock(), byName);
      const ranked = query.sort === "best_sellers" || query.sort === "most_requested_research_peptides" ? query.sort : null;
      const items = ranked ? (rankOrders.get(ranked) ?? filtered)
        : query.sort === undefined ? filtered : [...filtered].sort(byName);
      const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
      if (input.publication && pilotRows?.size) {
        for (const [item, identity] of pilotRows) {
          const index = pageItems.indexOf(item);
          if (index < 0) continue;
          const display = await readPilotDisplay(input.publication, identity);
          if (display) pageItems[index] = { ...item, reviewedContent: display.content, reviewedMedia: display.media };
        }
      }
      return {
        ...(rankOrders.size ? { availableRankSorts: [...rankOrders.keys()] } : {}),
        ...(ranked && !rankOrders.has(ranked) ? { rankUnavailable: true as const } : {}),
        items: pageItems, total: items.length, page, pageSize,
        // Only families this viewer has rows in, from the unfiltered snapshot, so choosing one
        // family still offers the others. A requested family stays listed so the control can
        // show the current choice. No hidden row adds a family.
        families: MASTER_OFFERING_FAMILIES.filter((family) => family === query.family
          || snapshot.some((item) => item.family === family)),
        channels: [...new Set(items.map((item) => item.channel))],
        workflowModes: [...new Set(items.map((item) => item.workflowMode))],
      };
    },
    async resolveMany(viewer, identities) {
      const snapshot = await visible(viewer);
      const byIdentity = new Map(snapshot.map((item) => [JSON.stringify([item.productId, item.variantId]), item]));
      return identities.map(({ productId, variantId }) => byIdentity.get(JSON.stringify([productId, variantId])) ?? null);
    },
  };
}
