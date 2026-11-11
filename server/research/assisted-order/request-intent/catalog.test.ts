import { describe, expect, it, vi } from "vitest";
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
  it("lists a coming-soon row and a supply or service row as selectable only once the request store accepts their lines", async () => {
    const future = offering(2), supply = offering(3);
    future.displayState = "coming_soon";
    supply.family = "shipping_and_fulfillment";
    const closed = await createRequestIntentCatalog(wiring([offering(1), future, supply])).list(viewer, {});
    expect(closed.items.map((item) => [item.selectableForReview, item.intentExclusion])).toEqual([
      [true, null], [false, "coming_soon"], [false, "non_merchandise"],
    ]);
    const open = await createRequestIntentCatalog({ ...wiring([offering(1), future, supply]), allListedInquirable: true }).list(viewer, {});
    // The reason stays on the row for staff; it no longer excludes the row.
    expect(open.items.map((item) => [item.selectableForReview, item.intentExclusion])).toEqual([
      [true, null], [true, "coming_soon"], [true, "non_merchandise"],
    ]);
    expect(open.items[2]).toMatchObject({ sourceRefusal: "non_merchandise_family", actionLabel: "Supply or service inquiry" });
    // An inquiry never carries a price for either kind of row.
    expect(open.items.slice(1).every((item) => item.unitPriceCents === null)).toBe(true);
  });
  it("fails closed when the catalog cannot be fully enumerated, rather than reporting partial coverage", async () => {
    const input = wiring([offering(1)]);
    const catalog = createRequestIntentCatalog({ ...input, serviceFor: () => ({
      select: async (query) => ({ offerings: [], prices: new Map(), page: { page: query.page ?? 1, pageSize: 100, total: 105 } }),
    }) });
    await expect(catalog.list(viewer, {})).rejects.toThrow("request_intent_catalog_incomplete");
  });
});

describe("sorting the whole request catalog by name", () => {
  // Thirty rows, inserted in descending id order, so catalog order is not name order.
  const rows = Array.from({ length: 30 }, (_, index) => offering(29 - index));
  const names = async (query: Parameters<ReturnType<typeof createRequestIntentCatalog>["list"]>[1]) => {
    const catalog = createRequestIntentCatalog(wiring(rows));
    const first = await catalog.list(viewer, { ...query, page: 1, pageSize: 24 });
    const second = await catalog.list(viewer, { ...query, page: 2, pageSize: 24 });
    expect(first.total).toBe(30);
    return [...first.items, ...second.items].map((item) => item.productName);
  };
  const ascending = Array.from({ length: 30 }, (_, index) => "Synthetic " + index);

  it("keeps catalog order when no sort is asked for", async () => {
    expect(await names({})).toEqual([...ascending].reverse());
  });
  it("sorts A to Z across pages, reading a number in a name as a number, with every row exactly once", async () => {
    const sorted = await names({ sort: "name_asc" });
    // "Synthetic 2" comes before "Synthetic 10", and page 2 continues page 1.
    expect(sorted).toEqual(ascending);
    expect(new Set(sorted).size).toBe(30);
  });
  it("sorts Z to A across pages", async () => {
    expect(await names({ sort: "name_desc" })).toEqual([...ascending].reverse());
  });
  it("sorts within a search, not just within a page", async () => {
    const catalog = createRequestIntentCatalog(wiring(rows));
    const page = await catalog.list(viewer, { search: "synthetic 1", sort: "name_asc", pageSize: 24 });
    expect(page.items.map((item) => item.productName)).toEqual(
      ["Synthetic 1", ...Array.from({ length: 10 }, (_, index) => "Synthetic " + (10 + index))]);
  });
  it("orders rows equal in name and specification the same way whatever order the catalog gives them in", async () => {
    // Same name and the same specification, so only the last keys can tell them apart.
    const twin = (id: number) => ({ ...offering(id), displayName: "Same name", canonicalName: "Same name" });
    const sorted = async (ids: readonly number[], sort: "name_asc" | "name_desc") => {
      const page = await createRequestIntentCatalog(wiring(ids.map(twin))).list(viewer, { sort });
      expect(new Set(page.items.map((item) => item.specification)).size).toBe(1);
      return page.items.map((item) => item.variantId);
    };
    const expected = ["pc-var-1", "pc-var-2", "pc-var-3"];
    for (const order of [[3, 1, 2], [2, 3, 1], [1, 2, 3], [3, 2, 1]]) {
      expect(await sorted(order, "name_asc")).toEqual(expected);
      // Z to A reverses names only; equal names keep the same inner order.
      expect(await sorted(order, "name_desc")).toEqual(expected);
    }
  });
  it("tells apart two rows that share a variant id but not a product id", async () => {
    const twin = (id: number) => ({ ...offering(id), displayName: "Same name", canonicalName: "Same name" });
    const sharedVariant = (ids: readonly number[]) => ({
      ...wiring(ids.map(twin)),
      bindingFor: (variantId: string) => ({ productId: "product-" + variantId, variantId: "pc-shared" }),
    });
    const products = async (ids: readonly number[]) =>
      (await createRequestIntentCatalog(sharedVariant(ids)).list(viewer, { sort: "name_asc" })).items.map((item) => item.productId);
    expect(await products([2, 1])).toEqual(["product-var-1", "product-var-2"]);
    expect(await products([1, 2])).toEqual(["product-var-1", "product-var-2"]);
  });
  it("refuses a sort it does not know", async () => {
    const catalog = createRequestIntentCatalog(wiring(rows));
    await expect(catalog.list(viewer, { sort: "unregistered_order" as never })).rejects.toThrow("request_intent_sort_invalid");
  });
});

describe("reviewed private aggregate rankings, after access and before pagination",()=>{
  const id=(n:number)=>"mov_"+n.toString(16).padStart(20,"0");
  const day=86400000, end=Date.parse("2026-11-10T00:00:00Z"), now=()=>end+day;
  const aggregate=(metric:string)=>({schema:1,metric,windowStart:new Date(end-30*day).toISOString(),
    windowEnd:new Date(end).toISOString(),approvedAt:new Date(end+1).toISOString(),sourceReceipt:"SOURCE-19",reviewReceipt:"QA-20",
    rows:[[31,100],[0,55],[1,40],[2,9],[3,4],[4,80],[999,10000]].map(([v,count])=>({variantId:id(v),count}))});
  const sample={schema:1,sales:aggregate("paid_fulfilled_net_distinct_orders"),requests:aggregate("distinct_submitted_requests"),
    researchPeptides:{receipt:"IDENTITY-77",variantIds:[id(31),id(0),id(2),id(999)]}};
  const all=Array.from({length:32},(_,n)=>{const x=offering(n,n===4);return {...x,variants:[{...x.variants[0],id:id(n)}]};});
  const build=(source:unknown=sample)=>createRequestIntentCatalog(wiring(all),async()=>source,now);
  it("moves the last catalog item to page one when legitimately ranked, across every filtered page; suppresses clinical, invisible and small cohorts",async()=>{
    const cat=build(), first=await cat.list(viewer,{sort:"best_sellers",pageSize:2}), second=await cat.list(viewer,{sort:"best_sellers",page:2,pageSize:2});
    expect(first.items.map(r=>r.sourceSelection?.variantId)).toEqual([id(31),id(0)]);
    expect(second.items.map(r=>r.sourceSelection?.variantId)).toEqual([id(1),id(2)]);
    expect(first.availableRankSorts).toEqual(["best_sellers","most_requested_research_peptides"]);
    expect(first.total).toBe(32);expect(JSON.stringify(first)).not.toMatch(/SOURCE-19|IDENTITY-77|QA-20|"count"|10000/);
    const peptides=await cat.list(viewer,{sort:"most_requested_research_peptides",pageSize:3});
    expect(peptides.items.map(r=>r.sourceSelection?.variantId)).toEqual([id(31),id(0),id(2)]);
    const filter=await cat.list(viewer,{sort:"best_sellers",family:"clinical_formulations_503a"});
    expect(filter.total).toBe(1);expect(filter.availableRankSorts).toBeUndefined();expect(filter.rankUnavailable).toBe(true);
  });
  it("reports unavailable sorts, keeps catalog order; never markets requests as sales even when request data is valid",async()=>{
    const no=await build(null).list(viewer,{sort:"best_sellers",pageSize:2});
    expect(no.items.map(r=>r.sourceSelection?.variantId)).toEqual([id(0),id(1)]);expect(no.availableRankSorts).toBeUndefined();expect(no.rankUnavailable).toBe(true);
    const mismatch=await build({...sample,sales:sample.requests}).list(viewer,{sort:"best_sellers"});
    expect(mismatch.availableRankSorts).toEqual(["most_requested_research_peptides"]);expect(mismatch.rankUnavailable).toBe(true);
    const noIdentity=await build({...sample,researchPeptides:undefined}).list(viewer,{});
    expect(noIdentity.availableRankSorts).toEqual(["best_sellers"]);
    const stale=await createRequestIntentCatalog(wiring(all),async()=>sample,()=>end+9*day).list(viewer,{});
    expect(stale.availableRankSorts).toBeUndefined();
  });
  it("never consults ranked data for a denied policy or an unavailable viewer catalog",async()=>{
    let touched=0;const denied=createRequestIntentCatalog({...wiring(all),serviceFor:()=>null},async()=>{touched++;return sample;},now);
    await expect(denied.list(viewer,{})).rejects.toThrow("request_intent_catalog_unavailable");
    const {RequestIntentService}=await import("./service");
    const blockedCatalog=build();const list=vi.spyOn(blockedCatalog,"list");
    const svc=new RequestIntentService({standing:{accepted:async()=>false},catalog:blockedCatalog,hasher:{hash:()=> "synthetic",stableHash:()=>"synthetic"},
      } as unknown as ConstructorParameters<typeof RequestIntentService>[0]);
    await expect(svc.list({...viewer,authUserId:"10000000-0000-4000-8000-000000000001"},{sort:"best_sellers"})).rejects.toMatchObject({code:"agreement_standing_required"});
    expect(list).not.toHaveBeenCalled();expect(touched).toBe(0);
  });
});
