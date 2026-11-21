import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { isResearchFormUnconfirmed, researchListingSubcategory } from "../../../client/src/research/product-media/reviewed-form-holds";
import { isTopicalCatalogForm } from "../../../shared/research/assisted-order/catalog-category";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { SEARCHABLE_CATALOG_FORMS, UNSEARCHED_CATALOG_FORM_VALUES, createRequestIntentCatalog, searchableCatalogForm } from "../assisted-order/request-intent/catalog";
import { catalogSearchText, matchesCatalogSearch } from "../assisted-order/request-intent/catalog-search";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { MasterOfferingCatalogService } from "./service";

// Original real-reader cases preserved from 3fe8fcd06de3e95c39820e37ab459d10bda00616.
// Kept inside the ingestion lane so static imports obey catalog-boundaries.test.ts.
describe("finding rows by printed form over the real generated catalog", () => {
  // The real generated catalog through the real request-intent catalog, with a synthetic Early Access viewer.
  const reader = new GeneratedMasterOfferingCatalogReader(
    resolve("server/research/master-offerings/data/member-safe-master-offerings.generated.json"));
  const real = createRequestIntentCatalog({
    serviceFor: () => new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null })),
    bindingFor: () => null, offeringVariantFor: () => null, catalogVersion: "synthetic",
  });
  const guest = { actorType: "early_access_session", memberId: null, normalizedEmail: null,
    earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
    capabilities: new Set(["assisted_orders:submit"]) } as AssistedOrderViewer;
  const products = reader.load().products;
  const byVariant = new Map(products.map((row) => [row.variants[0].id, row]));
  async function all(search?: string, family?: string) {
    const items = [];
    for (let page = 1; ; page += 1) {
      const result = await real.list(guest, { search, family, page, pageSize: 100 });
      items.push(...result.items);
      if (result.items.length === 0 || items.length >= result.total) return items;
    }
  }
  it("sorts every printed form value into searched or never searched, so a new value cannot slip in", () => {
    const printed = new Set(products.map((row) => researchListingSubcategory(row)).filter((value): value is string => value !== null));
    const sorted = new Set<string>([...SEARCHABLE_CATALOG_FORMS, ...UNSEARCHED_CATALOG_FORM_VALUES]);
    expect([...printed].filter((value) => !sorted.has(value)).sort()).toEqual([]);
    // Every searched form is one the dataset prints.
    expect(SEARCHABLE_CATALOG_FORMS.filter((form) => !printed.has(form))).toEqual([]);
  });
  it("gives no form to any form-held row, and a topical form to every row in the topical view", () => {
    const held = products.filter((row) => row.variants.some((variant) => isResearchFormUnconfirmed(variant.id, row.id)));
    expect(held.length).toBeGreaterThan(0);
    expect(held.filter((row) => searchableCatalogForm(row) !== null).map((row) => row.id)).toEqual([]);
    // If a topical row is ever form-held, the topical view and search would disagree with the card. Decide it then.
    const topical = products.filter((row) => isTopicalCatalogForm(row.subcategory));
    expect(topical.length).toBeGreaterThan(0);
    expect(topical.filter((row) => !searchableCatalogForm(row)?.startsWith("Topical ")).map((row) => row.id)).toEqual([]);
  });
  it("finds every row by the form its card prints, and no form-held row by a form word", async () => {
    const rows = await all();
    // Every listing of the 476-row dataset (420 foundation rows and 56 supplement rows), once each.
    expect(products).toHaveLength(476);
    expect(rows).toHaveLength(products.length);
    expect(new Set(rows.map((item) => item.sourceSelection.variantId)).size).toBe(rows.length);
    const held = new Set(rows.map((item) => item.sourceSelection.variantId).filter((id) => isResearchFormUnconfirmed(id)));
    expect(held.size).toBeGreaterThan(0);
    const leaks: string[] = [];
    const missed: string[] = [];
    for (const word of ["vial", "liquid", "capsules", "topical", "cream", "serum", "injectable", "solution", "tablet", "troche", "nasal spray"]) {
      const items = await all(word);
      const found = new Set(items.map((item) => item.sourceSelection.variantId));
      expect(found.size).toBe(items.length);
      for (const item of items) {
        const id = item.sourceSelection.variantId;
        // A form-held row may match a form word only through its own name, line or listed text.
        if (!held.has(id)) continue;
        const own = catalogSearchText([item.productName, item.specification, byVariant.get(id)!.aliases.join("\n")], item.variantId);
        if (!matchesCatalogSearch(own, word)) leaks.push(`${id} by "${word}"`);
      }
      for (const item of rows) {
        const form = searchableCatalogForm(byVariant.get(item.sourceSelection.variantId)!);
        if (form && matchesCatalogSearch(catalogSearchText([form], item.variantId), word) && !found.has(item.sourceSelection.variantId)) {
          missed.push(`${item.sourceSelection.variantId} (${form}) by "${word}"`);
        }
      }
    }
    expect(leaks).toEqual([]);
    expect(missed).toEqual([]);
    // "lyophilized" is printed only on form-held rows, so it finds nothing.
    expect(await all("lyophilized")).toEqual([]);
  });
  it("finds all the topical-view rows by topical, and keeps a family filter on a form search", async () => {
    const topical = products.filter((row) => isTopicalCatalogForm(row.subcategory)).map((row) => row.variants[0].id);
    expect(topical.length).toBeGreaterThan(0);
    expect((await all("topical")).map((item) => item.sourceSelection.variantId)).toEqual(expect.arrayContaining(topical));
    const clinicalVials = await all("vial", "clinical_formulations_503a");
    expect(clinicalVials.length).toBeGreaterThan(0);
    expect(clinicalVials.every((item) => item.family === "clinical_formulations_503a")).toBe(true);
    expect(await all("zzqx")).toEqual([]);
  });
});
