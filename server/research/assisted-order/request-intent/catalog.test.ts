import { describe, expect, it } from "vitest";
import type { NormalizedMasterOffering } from "../../master-offerings/model";
import type { AssistedOrderMasterCatalogInput } from "../production-catalog";
import type { AssistedOrderViewer } from "../ports";
import { createRequestIntentCatalog } from "./catalog";

const viewer = { actorType: "member", memberId: "synthetic", normalizedEmail: null,
  earlyAccessSessionHash: null, capabilities: new Set(["assisted_orders:submit"]) } as AssistedOrderViewer;
function offering(id: number, clinical = false): NormalizedMasterOffering {
  return {
    id: "off-" + id, slug: "synthetic-" + id, canonicalKey: "synthetic-" + id,
    displayName: "Synthetic " + id, canonicalName: "Synthetic " + id,
    family: clinical ? "clinical_formulations_503a" : "research_peptides_materials",
    category: "Synthetic", subcategory: null, brand: null, aliases: [],
    displayState: clinical ? "care_pathway" : "request_access", stateExplanation: "", copyState: "approved", visibility: "member",
    variants: [{ id: "var-" + id, label: "Synthetic exact variant", displayState: clinical ? "care_pathway" : "request_access", visibility: "member", sourceReferences: [] }],
    sourceReferences: [],
  };
}
function wiring(rows: NormalizedMasterOffering[]): AssistedOrderMasterCatalogInput {
  return {
    serviceFor: () => ({
      async select(query) {
        const page = query.page ?? 1, pageSize = Math.min(query.pageSize ?? 24, 100);
        return { offerings: rows.slice((page - 1) * pageSize, page * pageSize),
          prices: new Map(), page: { page, pageSize, total: rows.length } };
      },
    }),
    bindingFor: (variantId) => ({ productId: "product-" + variantId, variantId: "pc-" + variantId }),
    offeringVariantFor: () => null, catalogVersion: "synthetic-v1",
  };
}
describe("mixed request canonical projection", () => {
  it("keeps clinical and nonclinical rows, exact quantities and source identity past the first page", async () => {
    const rows = Array.from({ length: 105 }, (_, index) => offering(index, index === 104));
    const catalog = createRequestIntentCatalog(wiring(rows));
    const page = await catalog.list(viewer, { page: 5, pageSize: 24 });
    expect(page.total).toBe(105);
    expect(page.items).toHaveLength(9);
    const [clinical, wrong] = await catalog.resolveMany(viewer, [
      { productId: "product-var-104", variantId: "pc-var-104" },
      { productId: "wrong-product", variantId: "pc-var-104" },
    ]);
    expect(clinical).toMatchObject({ selectableForReview: true, clinicalReviewRequired: true,
      researchUseOnly: false, unitPriceCents: null, workflowMode: "provider_request", maximumQuantity: 100,
      sourceSelection: { variantId: "var-104" } });
    expect(wrong).toBeNull();
  });
  it("keeps held classification and Coming soon distinct without hiding rows", async () => {
    const held = offering(1), future = offering(2);
    held.displayState = "temporarily_unavailable";
    future.displayState = "coming_soon";
    const page = await createRequestIntentCatalog(wiring([held, future])).list(viewer, {});
    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({ workflowMode: "availability_review", selectableForReview: true,
      sourceDisplayState: "temporarily_unavailable" });
    expect(page.items[1]).toMatchObject({ selectableForReview: false, intentExclusion: "coming_soon" });
  });
  it("fails closed when the catalog cannot be fully enumerated, rather than reporting partial coverage", async () => {
    const input = wiring([offering(1)]);
    const catalog = createRequestIntentCatalog({ ...input, serviceFor: () => ({
      select: async (query) => ({ offerings: [], prices: new Map(), page: { page: query.page ?? 1, pageSize: 100, total: 105 } }),
    }) });
    await expect(catalog.list(viewer, {})).rejects.toThrow("request_intent_catalog_incomplete");
  });
});
