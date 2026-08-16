import { describe, expect, it } from "vitest";
import {
  createAssistedOrderMasterCatalogCallbacks,
  type AssistedOrderMasterCatalogService,
} from "./production-catalog";
import type { AssistedOrderViewer } from "./ports";
import type { NormalizedMasterOffering } from "../master-offerings/model";
import type { MasterOfferingPriceView } from "../../../shared/research/master-offerings/pricing-contract";

const viewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "11111111-1111-4111-8111-111111111111",
  earlyAccessSessionHash: null,
  normalizedEmail: "member@example.com",
  capabilities: new Set(["assisted_orders:submit"]),
});

function offering(
  overrides: Partial<NormalizedMasterOffering> = {},
): NormalizedMasterOffering {
  return {
    id: "off_1",
    slug: "bpc-157",
    canonicalKey: "bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_peptides_materials",
    category: "Peptides",
    subcategory: null,
    brand: null,
    aliases: [],
    displayState: "request_access",
    stateExplanation: "Research use only.",
    copyState: "approved",
    visibility: "member",
    variants: [
      {
        id: "var_1",
        label: "10 mg",
        displayState: "request_access",
        visibility: "member",
        sourceReferences: [],
      },
    ],
    sourceReferences: [],
    ...overrides,
  } as NormalizedMasterOffering;
}

function priced(amountCents: number): MasterOfferingPriceView {
  return {
    state: "priced",
    amountCents,
    currency: "USD",
    display: `$${(amountCents / 100).toFixed(2)}`,
    basis: "exact_listed_unit",
    priceId: "price-1",
  } as MasterOfferingPriceView;
}

function callbacks(
  offerings: NormalizedMasterOffering[],
  prices: ReadonlyMap<string, MasterOfferingPriceView>,
  bound = true,
) {
  const service = {
    select: async () => ({
      offerings,
      prices,
      page: { ok: true, page: 1, pageSize: 24, total: offerings.length, totalPages: 1, sort: "name", products: [], facets: {} },
    }),
  } as unknown as AssistedOrderMasterCatalogService;
  return createAssistedOrderMasterCatalogCallbacks({
    serviceFor: () => service,
    bindingFor: (offeringVariantId) =>
      bound ? { productId: "pc-prod-1", variantId: "pc-var-1" } : null,
    offeringVariantFor: (identity) =>
      bound && identity.productId === "pc-prod-1" && identity.variantId === "pc-var-1"
        ? "var_1"
        : null,
    catalogVersion: "catalog-test-v1",
  });
}

describe("assisted-order production catalog mapping", () => {
  it("projects a priced bound research variant as direct-eligible with the exact price", async () => {
    const page = await callbacks([offering()], new Map([["var_1", priced(5000)]])).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    expect(item.productId).toBe("pc-prod-1");
    expect(item.variantId).toBe("pc-var-1");
    expect(item.unitPriceCents).toBe(5000);
    expect(item.priceVersion).toBe("price-1");
    expect(item.catalogVersion).toBe("catalog-test-v1");
    expect(item.workflowMode).toBe("direct_order_request");
    expect(item.researchUseOnly).toBe(true);
  });

  it("keeps a care-pathway variant visible as a provider request, never direct", async () => {
    const page = await callbacks(
      [offering({ family: "clinical_formulations_503a", displayState: "care_pathway", variants: [{ id: "var_1", label: "Rx", displayState: "care_pathway", visibility: "member", sourceReferences: [] }] } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(9000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].workflowMode).toBe("provider_request");
  });

  it("keeps a classification-pending variant as an activation request", async () => {
    const page = await callbacks(
      [offering({ displayState: "approval_required", variants: [{ id: "var_1", label: "10 mg", displayState: "approval_required", visibility: "member", sourceReferences: [] }] } as Partial<NormalizedMasterOffering>)],
      new Map(),
    ).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].workflowMode).toBe("request_activation");
  });

  it("keeps an unpriced variant visible as request pricing with a null price, never zero", async () => {
    const page = await callbacks([offering()], new Map()).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].unitPriceCents).toBeNull();
    expect(page.items[0].workflowMode).toBe("request_pricing");
  });

  it("strips price and direct eligibility from a variant without a commerce binding", async () => {
    const page = await callbacks([offering()], new Map([["var_1", priced(5000)]]), false).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].unitPriceCents).toBeNull();
    expect(page.items[0].workflowMode).toBe("request_pricing");
  });

  it("resolves the exact identity at submission time and misses unknown identities", async () => {
    const built = callbacks([offering()], new Map([["var_1", priced(5000)]]));
    const hit = await built.resolve(viewer, "pc-prod-1", "pc-var-1");
    expect(hit?.unitPriceCents).toBe(5000);
    const miss = await built.resolve(viewer, "pc-prod-1", "pc-var-unknown");
    expect(miss).toBeNull();
  });
});
