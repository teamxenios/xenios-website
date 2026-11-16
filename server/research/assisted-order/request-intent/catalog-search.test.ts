/**
 * Quote-request picker search: separators and amounts.
 *
 * Unit cases on the matcher, then the real generated catalog through the real request-intent
 * catalog with a synthetic Early Access viewer. Matching only: rows, order and DTO are unchanged.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssistedOrderViewer } from "../ports";
import { GeneratedMasterOfferingCatalogReader } from "../../master-offerings/dataset-reader";
import { MasterOfferingCatalogService } from "../../master-offerings/service";
import { createRequestIntentCatalog } from "./catalog";
import { catalogSearchText, matchesCatalogSearch } from "./catalog-search";

const row = (...listed: string[]) => catalogSearchText(listed, "pc-0000");
const finds = (listed: string[], query: string) => matchesCatalogSearch(row(...listed), query);

describe("catalog search matcher", () => {
  it("reads a hyphen, a space and no separator between a word and a number the same way", () => {
    for (const query of ["bpc-157", "bpc 157", "bpc157", "BPC-157", "Bpc 157"]) {
      expect(finds(["BPC-157", "BPC-157 5 mg"], query)).toBe(true);
    }
    expect(finds(["Thymosin Alpha-1"], "alpha 1")).toBe(true);
    expect(finds(["SNAP-8"], "snap8")).toBe(true);
  });
  it("finds numbers joined by hyphens joined or apart, without merging an amount", () => {
    for (const query of ["pe-22-28", "pe 22 28", "pe2228", "PE-22-28"]) expect(finds(["PE-22-28"], query)).toBe(true);
    // "3-3-3-10MG/ML" lists 10 mg as an amount; the joined number is never an amount.
    expect(finds(["BPC-157/TB500/KPV/GHK-CU 3-3-3-10MG/ML (5ML)"], "10mg")).toBe(true);
    expect(finds(["BPC-157/TB500/KPV/GHK-CU 3-3-3-10MG/ML (5ML)"], "33310mg")).toBe(false);
  });
  it("reads a hyphen or apostrophe between two words as part of one word, and still finds either part", () => {
    for (const query of ["ghk-cu", "ghk cu", "ghkcu", "cu"]) expect(finds(["GHK-Cu"], query)).toBe(true);
    for (const query of ["anti-aging", "anti aging", "antiaging"]) expect(finds(["Anti-Aging"], query)).toBe(true);
    expect(finds(["Men's formula"], "mens")).toBe(true);
  });
  it("reads an amount with or without a space, in either case", () => {
    for (const query of ["5mg", "5 mg", "5 MG", "5MG"]) {
      expect(finds(["BPC-157 5 mg"], query)).toBe(true);
      expect(finds(["DIHEXA 5MG CAPSULE"], query)).toBe(true);
      expect(finds(["5-AMINO-1MQ 5MG/ML (5ML)"], query)).toBe(true);
    }
    expect(finds(["HCG 10,000 IU"], "10000 iu")).toBe(true);
    expect(finds(["HCG 10,000 IU"], "10,000iu")).toBe(true);
    expect(finds(["Peptide 500 µg"], "500mcg")).toBe(true);
    expect(finds(["Anastrozole 0.25MG"], "0.25 mg")).toBe(true);
  });
  it("matches an amount only as the whole number with its unit", () => {
    for (const listed of ["BPC-157 15 mg", "BPC-157 35 mg", "AOD 2.5 mg", "TB-500 50 mg", "BPC-157 5 mcg", "BPC-157 3MG/ML (5ML)"]) {
      expect(finds([listed], "5 mg")).toBe(false);
      expect(finds([listed], "5mg")).toBe(false);
    }
    expect(finds(["BPC-157 15 mg"], "bpc157 5mg")).toBe(false);
  });
  it("needs every word of the query, in any order, so a name and an amount narrow together", () => {
    expect(finds(["BPC-157", "BPC-157 5 mg"], "bpc157 5mg")).toBe(true);
    expect(finds(["BPC-157", "BPC-157 5 mg"], "5mg bpc 157")).toBe(true);
    expect(finds(["BPC-157 Arginate", "5 mg"], "arginate 5 mg")).toBe(true);
    expect(finds(["BPC-157", "BPC-157 5 mg"], "tb500 5mg")).toBe(false);
  });
  it("keeps a word matching inside a listed word, as before", () => {
    expect(finds(["Dihexa"], "hexa")).toBe(true);
    expect(finds(["Versabase cream"], "versabase cream")).toBe(true);
  });
  it("lets the last token be the start of a number or unit, so typing one key at a time keeps the rows", () => {
    expect(finds(["BPC-157 10 mg"], "bpc 157 1")).toBe(true);
    expect(finds(["BPC-157 10 mg"], "bpc 15")).toBe(true);
    expect(finds(["BPC-157 10 mg"], "bpc 157 10 m")).toBe(true);
    // Only the last token: a whole number before another number must be equal.
    expect(finds(["BPC-157 10 mg"], "15 10")).toBe(false);
  });
  it("still finds a row by the identifier it carries, and treats a blank query as no search", () => {
    expect(matchesCatalogSearch(catalogSearchText(["Synthetic"], "d540b4da-25cb-4143-8d5a-cdc065dc454f"), "d540b4da-25cb")).toBe(true);
    expect(matchesCatalogSearch(row("Synthetic"), "   ")).toBe(true);
    expect(matchesCatalogSearch(row("Synthetic"), "/ - ")).toBe(false);
  });
});

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
});
