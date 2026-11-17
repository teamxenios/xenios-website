/**
 * Quote-request picker search over the real generated catalog: separators and amounts.
 *
 * Real generated catalog through the real request-intent catalog; synthetic Early Access viewer.
 * The matcher's own cases are in server/research/assisted-order/request-intent/catalog-search.test.ts.
 * Matching only: rows, order and DTO are unchanged.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { catalogSearchText, matchesCatalogSearch } from "../assisted-order/request-intent/catalog-search";
import { REQUEST_INTENT_CATALOG_SEARCH_MAX_LENGTH } from "../../../shared/research/assisted-order/request-intent";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { MasterOfferingCatalogService } from "./service";

const reader = new GeneratedMasterOfferingCatalogReader(
  resolve("server/research/master-offerings/data/member-safe-master-offerings.generated.json"),
);
const offerings = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
const catalog = createRequestIntentCatalog({
  serviceFor: () => offerings, bindingFor: () => null, offeringVariantFor: () => null, catalogVersion: "synthetic",
});
const viewer: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]),
};
const sourceIds = async (search: string) => {
  const page = await catalog.list(viewer, { search, pageSize: 100 });
  expect(page.total).toBeLessThanOrEqual(100);
  return page.items.map((item) => item.sourceSelection.variantId);
};
const BPC_5MG = "mov_09db3e866424b64994d3";
const BPC_10MG = "mov_ca3e45ae9712aee91430";
const BPC_15MG = "mov_257330ea83ecbfc45fae";
const DIHEXA_5MG = "mov_120042d931e6c04de5a7";

describe("quote-request picker search over the real catalog", () => {
  it("finds BPC-157 5 mg however the hyphen and the amount are typed", async () => {
    for (const search of ["bpc157 5mg", "bpc 157 5 mg", "BPC-157 5MG", "5 mg bpc-157"]) {
      const found = await sourceIds(search);
      expect(found).toContain(BPC_5MG);
      expect(found).not.toContain(BPC_10MG);
      expect(found).not.toContain(BPC_15MG);
    }
  });
  it("keeps BPC-157 10 mg apart from 5 mg, and a partial amount finds no false 1 mg", async () => {
    for (const search of ["bpc-157 10 mg", "bpc157 10mg"]) {
      const found = await sourceIds(search);
      expect(found).toContain(BPC_10MG);
      expect(found).not.toContain(BPC_5MG);
    }
    expect(await sourceIds("bpc 157 1 mg")).toEqual([]);
  });
  it("reads .25mg as 0.25 mg: the same rows, and no 25 mg row", async () => {
    const leading = await sourceIds(".25mg");
    expect(leading.length).toBeGreaterThan(0);
    expect(leading).toEqual(await sourceIds("0.25mg"));
    const page = await catalog.list(viewer, { search: ".25mg", pageSize: 100 });
    for (const item of page.items) expect(`${item.productName} ${item.specification ?? ""}`).not.toMatch(/(?<![\d.])25\s*mg/i);
  });
  it("finds NAD+ listings by nad+ without the names that only contain the letters", async () => {
    const page = await catalog.list(viewer, { search: "nad+", pageSize: 100 });
    expect(page.total).toBeGreaterThan(0);
    for (const item of page.items) expect(`${item.productName} ${item.specification ?? ""}`).toMatch(/NAD\+/i);
  });
  it("gives the same BPC-157 rows for bpc-157, bpc 157 and bpc157", async () => {
    const hyphen = await sourceIds("bpc-157");
    expect(hyphen.length).toBeGreaterThan(0);
    expect(await sourceIds("bpc 157")).toEqual(hyphen);
    expect(await sourceIds("bpc157")).toEqual(hyphen);
  });
  it("finds 5 mg rows written either way, and no 15 mg row", async () => {
    for (const search of ["5 mg", "5mg"]) {
      const found = await sourceIds(search);
      expect(found).toEqual(expect.arrayContaining([BPC_5MG, DIHEXA_5MG]));
      expect(found).not.toContain(BPC_15MG);
    }
  });
  it("keeps the whole catalog for no search and keeps the existing HCG and renamed-listing words", async () => {
    const all = await catalog.list(viewer, { pageSize: 100 });
    expect(all.total).toBe(420);
    expect((await sourceIds("libido"))).toContain("mov_06beec21c59fe7842f18");
    expect((await sourceIds("anti-aging"))).toContain("mov_71799025c4b9af0971a9");
    expect((await catalog.list(viewer, { search: "HCG", pageSize: 100 })).total).toBeGreaterThan(0);
  });
  it("still finds every row by its shown name, its shown line, its listed name and its listed label", async () => {
    const rows = [];
    for (let page = 1; page <= 5; page += 1) rows.push(...(await catalog.list(viewer, { page, pageSize: 100 })).items);
    expect(rows).toHaveLength(420);
    const aliases = new Map(reader.load().products.map((offering) => [offering.variants[0].id, offering.aliases]));
    const missed: string[] = [];
    for (const item of rows) {
      const listed = aliases.get(item.sourceSelection.variantId) ?? [];
      // The same text the catalog searches: shown name, shown line and the dataset aliases.
      const text = catalogSearchText([item.productName, item.specification, listed.join(" ")], item.variantId);
      for (const search of [item.productName, item.specification ?? "", ...listed].filter(Boolean)) {
        if (!matchesCatalogSearch(text, search)) missed.push(`${item.sourceSelection.variantId} by "${search}"`);
      }
    }
    expect(missed).toEqual([]);
    // And through the catalog itself, for one row of each family.
    const families = new Map(rows.map((item) => [item.family, item]));
    for (const item of families.values()) {
      expect(await sourceIds(item.specification ?? item.productName)).toContain(item.sourceSelection.variantId);
    }
  });
  it("still finds every row when a pasted name, line or label stops at the search box's length", async () => {
    const rows = [];
    for (let page = 1; page <= 5; page += 1) rows.push(...(await catalog.list(viewer, { page, pageSize: 100 })).items);
    expect(rows).toHaveLength(420);
    const aliases = new Map(reader.load().products.map((offering) => [offering.variants[0].id, offering.aliases]));
    const cut: string[] = [];
    const missed: string[] = [];
    for (const item of rows) {
      const listed = aliases.get(item.sourceSelection.variantId) ?? [];
      for (const full of [item.productName, item.specification ?? "", ...listed].filter(Boolean)) {
        if (full.length <= REQUEST_INTENT_CATALOG_SEARCH_MAX_LENGTH) continue;
        // What the search box keeps of a longer paste.
        const search = full.slice(0, REQUEST_INTENT_CATALOG_SEARCH_MAX_LENGTH);
        cut.push(search);
        if (!(await sourceIds(search)).includes(item.sourceSelection.variantId)) {
          missed.push(`${item.sourceSelection.variantId} by "${search}"`);
        }
      }
    }
    // Some listed text is longer than the box, so this is not vacuous.
    expect(cut.length).toBeGreaterThan(0);
    expect(missed).toEqual([]);
  });
});
