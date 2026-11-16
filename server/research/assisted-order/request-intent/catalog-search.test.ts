/**
 * Quote-request picker search: separators and amounts.
 *
 * Unit cases on the matcher. The real generated catalog cases are in
 * server/research/master-offerings/request-intent-search-forms.test.ts, inside the lane that may
 * read the dataset. Matching only: rows, order and DTO are unchanged.
 */
import { describe, expect, it } from "vitest";
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
    for (const query of [".25mg", ".25 mg", "0.250mg"]) {
      expect(finds(["ANASTROZOLE 0.25MG CAPSULE"], query)).toBe(true);
      expect(finds(["Tirzepatide 25 mg"], query)).toBe(false);
    }
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
  it("keeps a plus on the word it follows, so NAD+ is not found inside another name", () => {
    for (const query of ["nad+", "NAD+", "nad+ 500mg"]) expect(finds(["NAD+", "NAD+ 500 mg"], query)).toBe(true);
    expect(finds(["Gonadorelin", "GONADORELIN 5 mg"], "nad+")).toBe(false);
    // Without the plus the query is a plain word, matched inside a listed word as before.
    expect(finds(["Gonadorelin"], "nad")).toBe(true);
    expect(finds(["SEMAGLUTIDE+BPC-157 5 mg"], "semaglutide bpc157")).toBe(true);
  });
  it("finds a singular listed word by its plural, from five letters", () => {
    expect(finds(["DIHEXA 5MG CAPSULE"], "capsules")).toBe(true);
    expect(finds(["(1.2mg vial)"], "vials")).toBe(true);
    expect(finds(["CREAM 30GM"], "creams")).toBe(true);
    expect(finds(["Tesofensine (500mcg) Capsules x30"], "capsules")).toBe(true);
    // Four letters is too short to read as a plural.
    expect(finds(["Topical gel"], "gels")).toBe(false);
  });
  it("lets the last token be the start of a number or unit, so typing one key at a time keeps the rows", () => {
    expect(finds(["BPC-157 10 mg"], "bpc 157 1")).toBe(true);
    expect(finds(["BPC-157 10 mg"], "bpc 15")).toBe(true);
    expect(finds(["BPC-157 10 mg"], "bpc 157 10 m")).toBe(true);
    expect(finds(["HCG 10,000 IU"], "10,0")).toBe(true);
    expect(finds(["HCG 10,000 IU"], "10,00")).toBe(true);
  });
  it("matches a number without a unit inside a listed number, as before, and keeps an amount whole", () => {
    expect(finds(["BPC-157 10 mg"], "57")).toBe(true);
    expect(finds(["BPC-157 10 mg"], "57 mg")).toBe(false);
    expect(finds(["BPC-157 10 mg"], "0 mg")).toBe(false);
  });
  it("reads only a number and its unit as one amount, so other words can come in any order", () => {
    expect(finds(["BPC-157 + TB-500", "BPC-157/TB-500 10MG"], "tb 500 bpc 157")).toBe(true);
    expect(finds(["5-AMINO-1MQ 5MG/ML (5ML)"], "5 amino 1mq 5mg")).toBe(true);
    expect(finds(["BPC-157 10 mg"], "10 m")).toBe(true);
    expect(finds(["BPC-157 10 mg"], "10 mc")).toBe(false);
  });
  it("still finds a row by the identifier it carries, and treats a blank query as no search", () => {
    expect(matchesCatalogSearch(catalogSearchText(["Synthetic"], "d540b4da-25cb-4143-8d5a-cdc065dc454f"), "d540b4da-25cb")).toBe(true);
    expect(matchesCatalogSearch(row("Synthetic"), "   ")).toBe(true);
    expect(matchesCatalogSearch(row("Synthetic"), "/ - ")).toBe(false);
  });
});
