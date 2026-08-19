// The assisted-order catalog over the canonical master-offerings authority.
//
// No copied product list: every row comes from the same member-safe
// master-offerings service the v2 catalog doors serve, priced by the same
// price authority, and mapped to Product Control identities through the same
// reviewed binding artifact. The mapping is projection only; visibility,
// pathway, and price decisions stay with the canonical systems and the
// shared action policy.
//
// Pathway truth from the normalized channel presentation:
//   care_pathway       -> provider workflow (never direct)
//   approval_required  -> classification pending (activation request)
//   request_access     -> the general lane; direct-eligible only when priced
// A missing price is price-on-request, never zero. A variant without a
// commerce binding has no Product Control identity and is projected as
// price-pending request-only, because an estimate without identity would be
// an invented number.

import type {
  AssistedOrderCatalogItem,
  AssistedOrderCatalogPage,
  AssistedOrderCatalogQuery,
} from "../../../shared/research/assisted-order/contract";
import {
  projectAssistedOrderCatalogItem,
  type AssistedOrderCatalogAuthority,
} from "../../../shared/research/assisted-order/action-policy";
import type { AssistedOrderViewer } from "./ports";
import type { NormalizedMasterOffering } from "../master-offerings/model";
import type { MasterOfferingPriceView } from "../../../shared/research/master-offerings/pricing-contract";

/**
 * The catalog reader this adapter needs, stated structurally so the
 * master-offerings service type stays behind its own boundary (only the
 * composition root may import it). The composition root passes the real
 * service, which satisfies this shape.
 */
export type AssistedOrderMasterCatalogService = Readonly<{
  select(query: {
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    offerings: readonly NormalizedMasterOffering[];
    prices: ReadonlyMap<string, MasterOfferingPriceView>;
    page: Readonly<{ total: number; page: number; pageSize: number }>;
  }>;
}>;

export type AssistedOrderCommerceIdentity = Readonly<{
  productId: string;
  variantId: string;
}>;

export type AssistedOrderMasterCatalogInput = Readonly<{
  /** The per-viewer canonical service, or null when the viewer has none. */
  serviceFor(viewer: AssistedOrderViewer): AssistedOrderMasterCatalogService | null;
  /** offering variant id -> Product Control identity, from the reviewed artifact. */
  bindingFor(offeringVariantId: string): AssistedOrderCommerceIdentity | null;
  /** Product Control identity -> offering variant id (the reverse of the artifact). */
  offeringVariantFor(identity: AssistedOrderCommerceIdentity): string | null;
  /** A stable dataset identity that changes when the catalog dataset changes. */
  catalogVersion: string;
}>;

/**
 * Exported for the launch-matrix generator (scripts/research-launch), which
 * must resolve every variant through THIS derivation rather than a replica
 * that could drift. Production callers stay inside this module.
 */
export function authorityFor(
  offering: NormalizedMasterOffering,
  variant: NormalizedMasterOffering["variants"][number],
  price: MasterOfferingPriceView | undefined,
  identity: AssistedOrderCommerceIdentity | null,
  catalogVersion: string,
): AssistedOrderCatalogAuthority {
  const priced = price !== undefined && price.state === "priced";
  const providerWorkflowRequired = variant.displayState === "care_pathway"
    || offering.displayState === "care_pathway"
    || offering.family === "clinical_formulations_503a";
  const classificationPending = variant.displayState === "approval_required"
    || offering.displayState === "approval_required";
  const researchUseOnly = offering.family === "research_peptides_materials"
    || offering.family === "research_capsules"
    || offering.family === "research_supplies";
  return Object.freeze({
    // A variant without a commerce binding keeps a synthetic identity so the
    // row stays visible, but it is never direct-eligible and carries no
    // price: identity is what makes an estimate honest.
    productId: identity?.productId ?? `unbound:${offering.id}`,
    variantId: identity?.variantId ?? `unbound:${variant.id}`,
    productName: offering.displayName,
    family: offering.family,
    channel: offering.category,
    specification: variant.label || null,
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: null,
    quantityIncrement: 1,
    unitPriceCents: priced && identity !== null ? price.amountCents : null,
    currency: "USD",
    catalogVersion,
    priceVersion: priced && identity !== null ? price.priceId : null,
    visible: true,
    directEligible: priced && identity !== null
      && !providerWorkflowRequired && !classificationPending,
    providerWorkflowRequired,
    classificationPending,
    // Pathway precedence: a provider or classification-pending row is not
    // "price pending", its pathway is what blocks it. Price-pending is the
    // truthful state only for the general lane.
    pricePending: (!priced || identity === null)
      && !providerWorkflowRequired && !classificationPending,
    held: false,
    outOfStock: false,
    researchUseOnly,
    accessNotice: offering.stateExplanation || null,
  });
}

export function createAssistedOrderMasterCatalogCallbacks(
  input: AssistedOrderMasterCatalogInput,
): Readonly<{
  list(
    viewer: AssistedOrderViewer,
    query: AssistedOrderCatalogQuery,
  ): Promise<AssistedOrderCatalogPage>;
  resolve(
    viewer: AssistedOrderViewer,
    productId: string,
    variantId: string,
  ): Promise<AssistedOrderCatalogItem | null>;
  fingerprint(item: AssistedOrderCatalogItem): string;
}> {
  return Object.freeze({
    async list(viewer, query) {
      const service = input.serviceFor(viewer);
      if (!service) {
        throw new Error("The catalog is not available for this viewer.");
      }
      const selection = await service.select({
        q: query.search || undefined,
        page: query.page,
        pageSize: query.pageSize,
      });
      const items: AssistedOrderCatalogItem[] = [];
      for (const offering of selection.offerings) {
        for (const variant of offering.variants) {
          const identity = input.bindingFor(variant.id);
          const item = projectAssistedOrderCatalogItem(
            authorityFor(
              offering,
              variant,
              selection.prices.get(variant.id),
              identity,
              input.catalogVersion,
            ),
          );
          if (item) items.push(item);
        }
      }
      return Object.freeze({
        items: Object.freeze(items),
        total: selection.page.total,
        page: selection.page.page,
        pageSize: selection.page.pageSize,
        families: Object.freeze(
          Array.from(new Set(items.map((item) => item.family))),
        ),
        channels: Object.freeze(
          Array.from(new Set(items.map((item) => item.channel))),
        ),
        workflowModes: Object.freeze(
          Array.from(new Set(items.map((item) => item.workflowMode))),
        ),
      });
    },

    // Submission-time re-read: the exact product and variant again from the
    // canonical authority, never the browser snapshot. An unknown identity
    // resolves to null and the line is refused upstream.
    async resolve(viewer, productId, variantId) {
      const service = input.serviceFor(viewer);
      if (!service) return null;
      const offeringVariantId = input.offeringVariantFor({ productId, variantId });
      if (!offeringVariantId) return null;
      // Walk the current dataset for the owning offering; the dataset is one
      // in-memory catalog read, the same cost the list path pays.
      const selection = await service.select({ page: 1, pageSize: 1_000_000 });
      for (const offering of selection.offerings) {
        for (const variant of offering.variants) {
          if (variant.id !== offeringVariantId) continue;
          return projectAssistedOrderCatalogItem(
            authorityFor(
              offering,
              variant,
              selection.prices.get(variant.id),
              { productId, variantId },
              input.catalogVersion,
            ),
          );
        }
      }
      return null;
    },

    fingerprint(item) {
      return JSON.stringify([
        item.productId,
        item.variantId,
        item.unitPriceCents,
        item.priceVersion,
        item.catalogVersion,
        item.workflowMode,
      ]);
    },
  });
}
