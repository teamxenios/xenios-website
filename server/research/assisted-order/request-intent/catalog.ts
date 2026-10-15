import {
  projectAssistedOrderCatalogItem,
} from "../../../../shared/research/assisted-order/action-policy";
import { assistedOrderActionGroupFor, type AssistedOrderCatalogQuery } from "../../../../shared/research/assisted-order/contract";
import type { RequestIntentCatalogItem, RequestIntentCatalogPage } from "../../../../shared/research/assisted-order/request-intent";
import { MASTER_OFFERING_FAMILIES, isMasterOfferingFamily } from "../../../../shared/research/master-offerings/contract";
import { directPurchaseRefusal } from "../../../../shared/research/master-offerings/pathway-authority";
import { authorityFor, type AssistedOrderMasterCatalogInput } from "../production-catalog";
import type { AssistedOrderViewer } from "../ports";

export type RequestIntentCatalog = Readonly<{
  list(viewer: AssistedOrderViewer, query: AssistedOrderCatalogQuery): Promise<RequestIntentCatalogPage>;
  resolveMany(viewer: AssistedOrderViewer, identities: readonly Readonly<{ productId: string; variantId: string }>[]): Promise<readonly (RequestIntentCatalogItem | null)[]>;
}>;

/** Same viewer-scoped master reader, binding artifact, price and pathway authorities. No copied catalog. */
export function createRequestIntentCatalog(input: AssistedOrderMasterCatalogInput): RequestIntentCatalog {
  async function visible(viewer: AssistedOrderViewer): Promise<RequestIntentCatalogItem[]> {
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
        const comingSoon = [offering.displayState, variant.displayState]
          .some((state) => state === "coming_soon" || state === "planned");
        const nonMerchandise = refusal === "non_merchandise_family";
        items.push({
          ...item,
          // A clinical request is not a quote. Never present its price as permission to buy.
          unitPriceCents: authority.providerWorkflowRequired ? null : item.unitPriceCents,
          priceVersion: authority.providerWorkflowRequired ? null : item.priceVersion,
          sourceSelection: { family: offering.family, slug: offering.slug, variantId: variant.id },
          selectableForReview: !comingSoon && !nonMerchandise,
          intentExclusion: nonMerchandise ? "non_merchandise" : comingSoon ? "coming_soon" : null,
          clinicalReviewRequired: authority.providerWorkflowRequired,
          sourceDisplayState: offering.displayState,
          sourceVariantDisplayState: variant.displayState,
          sourceRefusal: refusal,
          actionLabel: comingSoon ? "Coming soon" : nonMerchandise ? "Not a product request" : "Add to request",
        });
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
      const search = query.search?.trim().toLowerCase();
      const items = (await visible(viewer)).filter((item) =>
        (!query.family || (isMasterOfferingFamily(query.family) && item.family === query.family))
        && (!query.channel || item.channel === query.channel)
        && (!query.actionGroup || assistedOrderActionGroupFor(item.workflowMode) === query.actionGroup)
        && (query.actionGroup !== undefined || !query.workflowMode || item.workflowMode === query.workflowMode)
        && (!search || [item.productName, item.specification, item.variantId].join(" ").toLowerCase().includes(search)));
      return {
        items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize,
        families: MASTER_OFFERING_FAMILIES,
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
