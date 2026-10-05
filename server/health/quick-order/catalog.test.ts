import { describe, expect, it, vi } from "vitest";
import type { AssistedOrderCatalogItem, AssistedOrderCatalogQuery } from "../../../shared/research/assisted-order/contract";
import type { MasterOfferingPriceView } from "../../../shared/research/master-offerings/pricing-contract";
import type { AssistedOrderViewer } from "../../research/assisted-order/ports";
import { createAssistedOrderMasterCatalogCallbacks, type AssistedOrderMasterCatalogService } from "../../research/assisted-order/production-catalog";
import type { NormalizedMasterOffering } from "../../research/master-offerings/model";
import { createQuickOrderCanonicalCatalog, projectQuickOrderCanonicalCatalogItem, QuickOrderCatalogUnavailable, type QuickOrderCanonicalCatalogDependencies } from "./catalog";

const viewer: AssistedOrderViewer = {
  actorType: "member",
  memberId: "11111111-1111-4111-8111-111111111111",
  authUserId: "22222222-2222-4222-8222-222222222222",
  earlyAccessSessionHash: null,
  normalizedEmail: null,
  pricingViewer: { marker: "canonical-viewer" },
  capabilities: new Set(["assisted_orders:submit"]),
};
const query = { page: 1, pageSize: 24, search: "" };

function item(index = 0, overrides: Partial<AssistedOrderCatalogItem> = {}): AssistedOrderCatalogItem {
  return {
    productId: `product-${index}`, variantId: `variant-${index}`,
    productName: `Product ${index}`, family: "supplements", channel: "Supplements",
    specification: "One bottle", format: null, packBasis: null,
    minimumQuantity: 1, maximumQuantity: 50, quantityIncrement: 1,
    unitPriceCents: 1200, currency: "USD", workflowMode: "direct_order_request",
    actionLabel: "Add to order request", accessNotice: null, researchUseOnly: false,
    catalogVersion: "same/legacy/path.json", priceVersion: `price-${index}`,
    ...overrides,
  };
}

function source(rows: readonly AssistedOrderCatalogItem[]) {
  return {
    list: vi.fn(async (_viewer: AssistedOrderViewer, input: AssistedOrderCatalogQuery) => {
      const matched = rows.filter((row) => row.productName.toLowerCase().includes((input.search ?? "").toLowerCase()));
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 24;
      return {
        items: matched.slice((page - 1) * pageSize, page * pageSize), total: matched.length, page, pageSize,
        families: [], channels: [], workflowModes: [],
      };
    }),
    resolve: vi.fn(async (_viewer: AssistedOrderViewer, productId: string, variantId: string) =>
      rows.find((row) => row.productId === productId && row.variantId === variantId) ?? null),
  };
}

function adapter(rows: readonly AssistedOrderCatalogItem[], overrides: Partial<QuickOrderCanonicalCatalogDependencies> = {}) {
  const catalog = source(rows);
  const destinationEligibility = vi.fn(async () => ({ allowed: true, sourceVersion: "serviceability-v1" }));
  const deps: QuickOrderCanonicalCatalogDependencies = {
    catalog, visibility: async () => true, destinationEligibility, ...overrides,
  };
  return { api: createQuickOrderCanonicalCatalog(deps), catalog, destinationEligibility };
}

describe("Quick Order canonical catalog", () => {
  it("pages the actual canonical callbacks completely, then counts only Health-authorized variants", async () => {
    const offerings: NormalizedMasterOffering[] = Array.from({ length: 241 }, (_, i) => ({
      id: `offering-${i}`, slug: `product-${i}`, canonicalKey: `product-${i}`,
      displayName: `Product ${String(i).padStart(3, "0")}`, canonicalName: `Product ${i}`,
      family: "supplements", category: "Supplements", subcategory: null, brand: null, aliases: [],
      displayState: "request_access", stateExplanation: "Available for review.", copyState: "approved",
      visibility: "member", sourceReferences: [],
      variants: [{ id: `source-variant-${i}`, label: "One bottle", displayState: "request_access", visibility: "member", sourceReferences: [] }],
    } as NormalizedMasterOffering));
    const prices = new Map<string, MasterOfferingPriceView>(offerings.map((row, i) => [row.variants[0].id, {
      state: "priced", amountCents: 1200 + i, currency: "USD", display: "$12.00", basis: "exact_listed_unit", priceId: `price-${i}`,
    } as MasterOfferingPriceView]));
    const select = vi.fn(async (input: Parameters<AssistedOrderMasterCatalogService["select"]>[0]) => {
      const page = input.page ?? 1;
      const pageSize = Math.min(input.pageSize ?? 24, 100);
      const matched = offerings.filter((row) => !input.q || row.displayName.includes(input.q));
      return { offerings: matched.slice((page - 1) * pageSize, page * pageSize), prices, page: { page, pageSize, total: matched.length } };
    });
    const serviceFor = vi.fn((received: AssistedOrderViewer) => received === viewer ? { select } : null);
    const callbacks = createAssistedOrderMasterCatalogCallbacks({
      serviceFor,
      bindingFor: (variant) => { const i = variant.replace("source-variant-", ""); return { productId: `product-${i}`, variantId: `variant-${i}` }; },
      offeringVariantFor: (identity) => `source-variant-${identity.variantId.replace("variant-", "")}`,
      catalogVersion: "same/legacy/path.json", reviewedFormulationHoldVariantIds: new Set(),
    });
    const api = createQuickOrderCanonicalCatalog({
      catalog: callbacks,
      visibility: async (received, row) => received === viewer && Number(row.variantId.replace("variant-", "")) % 3 !== 0,
      destinationEligibility: async () => ({ allowed: true, sourceVersion: "destination-v1" }),
    });
    const ids: string[] = [];
    for (let page = 1; page <= 7; page += 1) {
      const result = await api.listCatalog(viewer, { ...query, page });
      expect(result.total).toBe(160);
      expect(result.items.length).toBe(page === 7 ? 16 : 24);
      ids.push(...result.items.map((row) => row.variantId));
    }
    expect(new Set(ids).size).toBe(160);
    expect(ids).toContain("variant-239");
    expect(ids).not.toContain("variant-240");
    expect((await api.listCatalog(viewer, { ...query, page: 8 })).items).toEqual([]);
    expect((await api.listCatalog(viewer, { ...query, search: "Product 239" })).total).toBe(1);
    expect((await api.listCatalog(viewer, { ...query, search: "Product 240" })).total).toBe(0);
    expect(serviceFor.mock.calls.every(([received]) => received === viewer)).toBe(true);
    expect(select.mock.calls.some(([input]) => input.page === 3 && input.pageSize === 100)).toBe(true);
    expect((await api.resolveItem(viewer, "product-239", "variant-239", "IL"))?.variantId).toBe("variant-239");
  });

  it("never exposes private row fields or copies a price for Care", () => {
    const row = { ...item(), workflowMode: "provider_request", family: "clinical_formulations_503a", supplierCost: 5, margin: 90, privatePacket: "private", sourceSelection: { family: "supplements", slug: "private", variantId: "source-id" } } as AssistedOrderCatalogItem;
    const result = projectQuickOrderCanonicalCatalogItem(row);
    expect(result).toMatchObject({ workflowMode: "provider_request", requestable: false, unitPriceCents: null, priceVersion: null });
    expect(result.accessNotice).toContain("provider routing");
    expect(Object.keys(result)).not.toEqual(expect.arrayContaining(["supplierCost", "margin", "privatePacket", "sourceSelection"]));
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it.each([
    { workflowMode: "provider_request" },
    { workflowMode: "availability_review" },
    { workflowMode: "request_activation" },
    { researchUseOnly: true },
    { family: "clinical_formulations_503a" },
    { family: "shipping_and_fulfillment" },
  ] as Partial<AssistedOrderCatalogItem>[])("does not allow a Health request for %j", async (overrides) => {
    const { api, destinationEligibility } = adapter([item(0, overrides)]);
    expect((await api.listCatalog(viewer, query)).items[0].requestable).toBe(false);
    expect(await api.resolveItem(viewer, "product-0", "variant-0", "IL")).toBeNull();
    expect(destinationEligibility).not.toHaveBeenCalled();
  });

  it("preserves actual lower quantity bands and pending prices", async () => {
    const row = item(0, { minimumQuantity: 2, maximumQuantity: 12, quantityIncrement: 2, unitPriceCents: null, priceVersion: null, workflowMode: "request_pricing" });
    const { api } = adapter([row]);
    const result = await api.listCatalog(viewer, query);
    expect(result.items[0]).toMatchObject({ minimumQuantity: 2, maximumQuantity: 12, quantityIncrement: 2, unitPriceCents: null, priceVersion: null, requestable: true });
    expect(await api.resolveItem(viewer, row.productId, row.variantId, "DC")).toEqual(result.items[0]);
  });

  it.each([
    { family: "unknown" }, { researchUseOnly: undefined }, { workflowMode: "unknown" },
    { maximumQuantity: null }, { maximumQuantity: 0 }, { minimumQuantity: 0 },
    { quantityIncrement: 0 }, { unitPriceCents: 0 }, { unitPriceCents: -1 }, { currency: "EUR" },
  ])("fails closed on malformed or unstated authority %j", (overrides) => {
    expect(() => projectQuickOrderCanonicalCatalogItem(item(0, overrides as Partial<AssistedOrderCatalogItem>))).toThrow(QuickOrderCatalogUnavailable);
  });

  it("supplements a constant source path with hashes of current price, quantity and pathway facts", () => {
    const original = projectQuickOrderCanonicalCatalogItem(item());
    for (const changed of [item(0, { unitPriceCents: 1300 }), item(0, { maximumQuantity: 10 }), item(0, { workflowMode: "availability_review" }), item(0, { priceVersion: "new-price" })]) {
      expect(projectQuickOrderCanonicalCatalogItem(changed).catalogVersion).not.toBe(original.catalogVersion);
    }
    expect(projectQuickOrderCanonicalCatalogItem({ ...item(), arbitraryPrivateField: "ignored" } as AssistedOrderCatalogItem).catalogVersion).toBe(original.catalogVersion);
  });

  it("requires destination authority and passes the exact actor, item and shipping state", async () => {
    const row = item();
    const decision = vi.fn(async () => ({ allowed: true, sourceVersion: "canonical-state-rule-v3" }));
    const { api } = adapter([row], { destinationEligibility: decision });
    expect(await api.resolveItem(viewer, row.productId, row.variantId, "IL")).not.toBeNull();
    expect(decision).toHaveBeenCalledWith({ viewer, item: row, shippingRegion: "IL" });
    expect(await api.resolveItem(viewer, row.productId, row.variantId, "XX")).toBeNull();
    expect(decision).toHaveBeenCalledTimes(1);
    for (const destinationEligibility of [null, async () => null, async () => ({ allowed: false, sourceVersion: "v1" }), async () => ({ allowed: true, sourceVersion: "" })]) {
      expect(await adapter([row], { destinationEligibility }).api.resolveItem(viewer, row.productId, row.variantId, "IL")).toBeNull();
    }
  });

  it("refuses absent Health visibility even for an empty canonical catalog", async () => {
    await expect(adapter([], { visibility: null }).api.listCatalog(viewer, query)).rejects.toThrow(QuickOrderCatalogUnavailable);
  });

  it("keeps hidden identities out of both counts and exact resolution", async () => {
    const { api, destinationEligibility } = adapter([item(0), item(1)], { visibility: async (_viewer, row) => row.variantId === "variant-1" });
    expect((await api.listCatalog(viewer, query)).total).toBe(1);
    expect(await api.resolveItem(viewer, "product-0", "variant-0", "IL")).toBeNull();
    expect(destinationEligibility).not.toHaveBeenCalled();
  });

  it("refuses unauthenticated viewers before reading any catalog rows", async () => {
    const { api, catalog } = adapter([item()]);
    const anonymous = { ...viewer, memberId: null, capabilities: new Set() } as AssistedOrderViewer;
    await expect(api.listCatalog(anonymous, query)).rejects.toThrow(QuickOrderCatalogUnavailable);
    expect(catalog.list).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "identity_collision", "wrong_page", "wrong_size", "truncated", "total_drift", "content_drift", "visibility_drift"])("rejects observed %s rather than claiming complete pagination", async (fault) => {
    const rows = Array.from({ length: 101 }, (_, i) => item(i));
    if (fault === "duplicate") rows[100] = rows[0];
    if (fault === "identity_collision") rows[100] = item(100, { variantId: rows[0].variantId });
    const base = source(rows);
    let calls = 0;
    const catalog = {
      ...base,
      list: async (actor: AssistedOrderViewer, input: AssistedOrderCatalogQuery) => {
        const result = await base.list(actor, input);
        calls += 1;
        if (fault === "wrong_page") return { ...result, page: 99 };
        if (fault === "wrong_size") return { ...result, pageSize: 24 };
        if (fault === "truncated") return { ...result, items: result.items.slice(0, 10) };
        if (fault === "total_drift" && calls === 2) return { ...result, total: 102 };
        if (fault === "content_drift" && calls === 3) return { ...result, items: result.items.map((row) => ({ ...row, unitPriceCents: 1400 })) };
        return result;
      },
    };
    const { api } = adapter(rows, { catalog, visibility: async () => fault !== "visibility_drift" || calls < 3 });
    await expect(api.listCatalog(viewer, query)).rejects.toThrow(QuickOrderCatalogUnavailable);
  });

  it("stops at the configured bound without issuing another scan page", async () => {
    const { api, catalog } = adapter(Array.from({ length: 101 }, (_, i) => item(i)), { maxScanPages: 1 });
    await expect(api.listCatalog(viewer, query)).rejects.toThrow(QuickOrderCatalogUnavailable);
    expect(catalog.list).toHaveBeenCalledTimes(1);
  });

  it("rejects multi-variant offering topology instead of silently treating offerings as variants", async () => {
    const row = { id: "offering", variants: [{ id: "a" }, { id: "b" }] } as NormalizedMasterOffering;
    const callbacks = createAssistedOrderMasterCatalogCallbacks({
      serviceFor: () => ({ select: async () => ({ offerings: [row], prices: new Map(), page: { total: 1, page: 1, pageSize: 100 } }) }),
      bindingFor: () => null, offeringVariantFor: () => null, catalogVersion: "v1", reviewedFormulationHoldVariantIds: new Set(),
    });
    const { api } = adapter([], { catalog: callbacks });
    await expect(api.listCatalog(viewer, query)).rejects.toThrow("requires one variant per offering");
  });
});
