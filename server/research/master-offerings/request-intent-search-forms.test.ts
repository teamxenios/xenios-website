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
import { createRequestIntentCatalog, searchableCatalogForm } from "../assisted-order/request-intent/catalog";
import { catalogSearchText, matchesCatalogSearch } from "../assisted-order/request-intent/catalog-search";
import { REQUEST_INTENT_CATALOG_SEARCH_MAX_LENGTH } from "../../../shared/research/assisted-order/request-intent";
import { isResearchFormUnconfirmed } from "../../../client/src/research/product-media/reviewed-form-holds";
import { isTopicalCatalogForm } from "../../../shared/research/assisted-order/catalog-category";
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
const GLOW_27_5_10 = "mov_5e74aacac728cfcbd11f";
const TB500_5MG = "mov_3c9394000d1302336110";
const BPC_TB_5_5 = "mov_457168650622c3647dc9";
const KLOW_5 = "mov_ecd380609ace639d27a6";
const NAD_NASAL = "mov_de7158dd9892e7e78e1f";
const HCG_10000_IU = "mov_e218a4fead30388a55ff";
const MYERS = ["mov_e6c2e63137540a5772ce", "mov_be5e04f5ca9c0870837a"];
const sorted = (ids: readonly string[]) => [...ids].sort();

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
  it("ties an amount to its own ingredient: tb-500 5 mg never takes BPC-157's 5 mg from a blend", async () => {
    for (const search of ["tb-500 5 mg", "TB-500 5MG", "tb500 5mg", "5 mg tb-500"]) {
      expect(sorted(await sourceIds(search))).toEqual(sorted([BPC_TB_5_5, KLOW_5, TB500_5MG]));
    }
    expect(await sourceIds("tb-500 10 mg")).toContain(GLOW_27_5_10);
    expect(await sourceIds("bpc-157 5 mg")).toContain(GLOW_27_5_10);
    expect(await sourceIds("bpc-157 10mg tb-500 5mg")).toEqual([]);
    expect(await sourceIds("tb-500 10mg bpc-157 5mg")).toEqual([GLOW_27_5_10]);
  });
  it("reads 10mg/0.1ml as one concentration, not 10 mg and 0.1 ml from different ingredients", async () => {
    for (const search of ["10mg/0.1ml", "10 mg/0.1 ml", "10MG / 0.1ML"]) expect(await sourceIds(search)).toEqual([NAD_NASAL]);
    const perMl = await sourceIds("10mg/ml");
    expect(perMl).not.toContain(NAD_NASAL);
    // "Thiamine 10mg, ... per mL" is 10 mg per ml.
    expect(perMl).toEqual(expect.arrayContaining(MYERS));
  });
  it("never lends an ingredient another ingredient's amount, on any listing that writes each amount beside its name", async () => {
    const rows = [];
    for (let page = 1; page <= 5; page += 1) rows.push(...(await catalog.list(viewer, { page, pageSize: 100 })).items);
    const aliases = new Map(reader.load().products.map((offering) => [offering.variants[0].id, offering.aliases]));
    // The same text the catalog searches for each row.
    const texts = rows.map((item) => catalogSearchText(
      [item.productName, item.specification, (aliases.get(item.sourceSelection.variantId) ?? []).join("\n")], item.variantId));
    const found = (search: string) => rows.filter((_, index) => matchesCatalogSearch(texts[index], search)).map((item) => item.sourceSelection.variantId);
    // Read the label without the matcher: "NAME AMOUNT" or "NAME (AMOUNT)" parts joined by " + ", " / " or ", ".
    const PART = /^(.*\p{L}.*?)\s*\(?\s*(\d+(?:\.\d+)?)\s*(mg|mcg|iu|g|%)\s*\)?$/iu;
    let checked = 0;
    const wrong: string[] = [];
    const missed: string[] = [];
    for (const item of rows) {
      const parts = (item.specification ?? "").split(/\s+\+\s+|\s+\/\s+|,\s+/)
        .map((part) => PART.exec(part.trim())).filter((part): part is RegExpExecArray => part !== null)
        .map(([, name, amount, unit]) => ({ name, amount: Number(amount), unit: unit.toLowerCase() }));
      if (parts.length < 2) continue;
      const id = item.sourceSelection.variantId;
      for (const part of parts) {
        if (!found(`${part.name} ${part.amount}${part.unit}`).includes(id)) missed.push(`${id} ${part.name} ${part.amount}${part.unit}`);
        for (const other of parts) {
          if (other.unit !== part.unit || other.amount === part.amount) continue;
          if (parts.some((same) => same.name === part.name && same.unit === part.unit && same.amount === other.amount)) continue;
          checked += 1;
          if (found(`${part.name} ${other.amount}${other.unit}`).includes(id)) wrong.push(`${id} ${part.name} ${other.amount}${other.unit}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(wrong).toEqual([]);
    expect(missed).toEqual([]);
  });
  it("keeps the typing and word-form cases on the real catalog", async () => {
    expect(await sourceIds("57")).toEqual(expect.arrayContaining([BPC_5MG, BPC_10MG, BPC_15MG]));
    for (const search of ["10,0", "10,00", "10,000", "10,000 iu"]) expect(await sourceIds(search)).toContain(HCG_10000_IU);
    expect((await sourceIds("vials")).length).toBeGreaterThan(0);
    expect((await sourceIds("creams")).length).toBeGreaterThan(0);
    const pe = await sourceIds("pe-22-28");
    expect(pe.length).toBeGreaterThan(0);
    for (const search of ["pe 22 28", "pe2228", "PE-22-28"]) expect(await sourceIds(search)).toEqual(pe);
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
      const text = catalogSearchText([item.productName, item.specification, listed.join("\n")], item.variantId);
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
  it("finds every row by the form its card prints, and no form-held row by a form word", async () => {
    const rows = [];
    for (let page = 1; page <= 5; page += 1) rows.push(...(await catalog.list(viewer, { page, pageSize: 100 })).items);
    expect(rows).toHaveLength(420);
    const products = new Map(reader.load().products.map((offering) => [offering.variants[0].id, offering]));
    const held = new Set(rows.map((item) => item.sourceSelection.variantId).filter((id) => isResearchFormUnconfirmed(id)));
    expect(held.size).toBeGreaterThan(0);
    const formOf = (id: string) => searchableCatalogForm(products.get(id)!);
    const leaks: string[] = [];
    const missed: string[] = [];
    for (const word of ["vial", "liquid", "capsules", "topical", "cream", "serum", "injectable", "solution", "tablet", "troche", "nasal spray"]) {
      const items = [];
      for (let page = 1; page <= 5; page += 1) items.push(...(await catalog.list(viewer, { search: word, page, pageSize: 100 })).items);
      const found = new Set(items.map((item) => item.sourceSelection.variantId));
      expect(found.size).toBe(items.length);
      for (const id of found) {
        // A form-held row may match a form word only through its own name, line or listed text.
        if (!held.has(id)) continue;
        const item = items.find((row) => row.sourceSelection.variantId === id)!;
        const own = catalogSearchText([item.productName, item.specification, products.get(id)!.aliases.join("\n")], item.variantId);
        if (!matchesCatalogSearch(own, word)) leaks.push(`${id} by "${word}"`);
      }
      for (const item of rows) {
        const form = formOf(item.sourceSelection.variantId);
        if (form && matchesCatalogSearch(catalogSearchText([form], item.variantId), word) && !found.has(item.sourceSelection.variantId)) {
          missed.push(`${item.sourceSelection.variantId} (${form}) by "${word}"`);
        }
      }
    }
    expect(leaks).toEqual([]);
    expect(missed).toEqual([]);
    // "lyophilized" is printed only on form-held rows, so it finds nothing.
    expect(await sourceIds("lyophilized")).toEqual([]);
  });
  it("finds all the topical-view rows by topical, and keeps a family filter on a form search", async () => {
    const topicalIds = reader.load().products.filter((offering) => isTopicalCatalogForm(offering.subcategory))
      .map((offering) => offering.variants[0].id);
    expect(topicalIds.length).toBeGreaterThan(0);
    expect(await sourceIds("topical")).toEqual(expect.arrayContaining(topicalIds));
    const clinicalVials = await catalog.list(viewer, { search: "vial", family: "clinical_formulations_503a", pageSize: 100 });
    expect(clinicalVials.total).toBeGreaterThan(0);
    expect(clinicalVials.items.every((item) => item.family === "clinical_formulations_503a")).toBe(true);
  });
});
